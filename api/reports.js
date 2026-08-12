'use strict';

const { createHash } = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { dbRest, ensureFirebase } = require('../lib/firebase-admin');

const ALLOWED_ORIGINS = new Set([
  'https://mydesk.social',
  'https://jvalvim-bit.github.io',
  'https://mydesk-eta.vercel.app',
]);
const REPORT_CATEGORIES = new Set(['bug', 'problem']);
const REPORT_STATUSES = new Set(['open', 'in_progress', 'resolved']);
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MIN_INTERVAL_MS = 20 * 1000;
const RATE_MAX_REPORTS = 5;

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  return req.body;
}

function httpError(statusCode, message, extra) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra || {});
  return error;
}

async function verifyCaller(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) throw httpError(401, 'Não autenticado');

  try {
    const app = ensureFirebase();
    return await getAuth(app).verifyIdToken(idToken, true);
  } catch (_) {
    throw httpError(401, 'Token inválido ou sessão expirada');
  }
}

function normalizedText(value, { min = 0, max, field, collapse = false }) {
  let text = typeof value === 'string' ? value.trim() : '';
  if (collapse) text = text.replace(/\s+/g, ' ');
  if (text.length < min) {
    throw httpError(400, `${field} deve ter pelo menos ${min} caracteres`);
  }
  if (text.length > max) {
    throw httpError(400, `${field} deve ter no máximo ${max} caracteres`);
  }
  return text;
}

function normalizePage(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '/';
  try {
    const url = new URL(raw, 'https://mydesk.social');
    return (url.pathname + url.search + url.hash).slice(0, 300) || '/';
  } catch (_) {
    return raw.slice(0, 300);
  }
}

function decideReportRate(current, now) {
  const saved = current && typeof current === 'object' ? current : {};
  let windowStart = Number(saved.windowStart) || now;
  let count = Math.max(0, Number(saved.count) || 0);
  const lastAt = Number(saved.lastAt) || 0;

  if (now - windowStart >= RATE_WINDOW_MS || now < windowStart) {
    windowStart = now;
    count = 0;
  }

  if (lastAt && now - lastAt < RATE_MIN_INTERVAL_MS) {
    return {
      allowed: false,
      retryAfterMs: RATE_MIN_INTERVAL_MS - (now - lastAt),
      reason: 'interval',
    };
  }

  if (count >= RATE_MAX_REPORTS) {
    return {
      allowed: false,
      retryAfterMs: Math.max(1000, RATE_WINDOW_MS - (now - windowStart)),
      reason: 'window',
    };
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    next: {
      windowStart,
      count: count + 1,
      lastAt: now,
    },
  };
}

async function consumeReportRateLimit(uid, now = Date.now()) {
  const app = ensureFirebase();
  const rateKey = createHash('sha256').update(String(uid)).digest('hex');
  const rateRef = getDatabase(app).ref(`reportRateLimits/${rateKey}`);
  let finalDecision = null;
  let previousState = null;
  const result = await rateRef.transaction(current => {
    previousState = current && typeof current === 'object' ? current : null;
    finalDecision = decideReportRate(current, now);
    return finalDecision.allowed ? finalDecision.next : undefined;
  }, undefined, false);

  if (!result.committed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((finalDecision?.retryAfterMs || RATE_MIN_INTERVAL_MS) / 1000),
    );
    throw httpError(
      429,
      'Muitos reportes em pouco tempo. Aguarde antes de tentar novamente.',
      { retryAfterSeconds },
    );
  }

  // Se a gravação do reporte falhar, esta reserva pode ser devolvida. A
  // comparação impede que a liberação apague um consumo posterior.
  return async function releaseReservation() {
    const expected = finalDecision.next;
    await rateRef.transaction(current => {
      if (!current || Number(current.lastAt) !== Number(expected.lastAt) ||
          Number(current.count) !== Number(expected.count) ||
          Number(current.windowStart) !== Number(expected.windowStart)) {
        return undefined;
      }
      return previousState;
    }, undefined, false);
  };
}

async function createReport(caller, body) {
  const category = String(body.category || '').toLowerCase();
  if (!REPORT_CATEGORIES.has(category)) {
    throw httpError(400, 'Categoria de reporte inválida');
  }

  const title = normalizedText(body.title, {
    min: 5, max: 120, field: 'O título', collapse: true,
  });
  const description = normalizedText(body.description, {
    min: 10, max: 3000, field: 'A descrição',
  });
  const localeInput = typeof body.locale === 'string' ? body.locale.trim() : '';
  const locale = /^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/.test(localeInput)
    ? localeInput.slice(0, 10)
    : 'pt-BR';

  const now = Date.now();
  const releaseRateReservation = await consumeReportRateLimit(caller.uid, now);

  const username = await dbRest('GET', `uids/${caller.uid}`).catch(() => null);
  const report = {
    reporterUid: caller.uid,
    reporterUsername: username || null,
    reporterName: caller.name ? String(caller.name).slice(0, 120) : null,
    reporterEmail: caller.email ? String(caller.email).slice(0, 254) : null,
    category,
    title,
    description,
    page: normalizePage(body.page),
    locale,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  let created;
  try {
    created = await dbRest('POST', 'reports', report);
    if (!created?.name) throw new Error('Firebase não retornou o identificador do reporte');
  } catch (error) {
    await releaseRateReservation().catch(() => {});
    throw error;
  }

  return { ok: true, id: created.name, report };
}

async function updateReportStatus(caller, body) {
  if (caller.admin !== true) throw httpError(403, 'Apenas administradores');

  const reportId = String(body.reportId || '');
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(reportId)) {
    throw httpError(400, 'Identificador de reporte inválido');
  }

  const status = String(body.status || '');
  if (!REPORT_STATUSES.has(status)) throw httpError(400, 'Status inválido');
  const resolutionNote = normalizedText(body.resolutionNote || '', {
    min: 0, max: 1000, field: 'A observação',
  });
  const current = await dbRest('GET', `reports/${reportId}`);
  if (!current) throw httpError(404, 'Reporte não encontrado');

  const now = Date.now();
  const patch = {
    status,
    updatedAt: now,
    updatedBy: caller.uid,
    resolvedAt: status === 'resolved' ? now : null,
    resolvedBy: status === 'resolved' ? caller.uid : null,
    resolutionNote: resolutionNote || null,
  };
  await dbRest('PATCH', `reports/${reportId}`, patch);
  await dbRest('POST', 'adminLog', {
    at: now,
    acao: 'atualizar_reporte',
    por: caller.uid,
    porEmail: caller.email || null,
    alvo: current.reporterUid || null,
    reporte: reportId,
    statusAnterior: current.status || 'open',
    status,
    obs: resolutionNote ? resolutionNote.slice(0, 200) : null,
  }).catch(() => {});

  return { ok: true, id: reportId, status, updatedAt: now };
}

async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'Origem não permitida' });

  let body;
  try {
    body = parseBody(req);
  } catch (_) {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  try {
    const caller = await verifyCaller(req);
    const action = body.action || 'create';
    const result = action === 'create'
      ? await createReport(caller, body)
      : action === 'updateStatus'
        ? await updateReportStatus(caller, body)
        : (() => { throw httpError(400, 'Ação desconhecida'); })();
    return res.status(200).json(result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    if (status >= 500) console.error('reports:', error.message);
    return res.status(status).json({
      error: status >= 500 ? 'Não foi possível processar o reporte' : error.message,
    });
  }
}

module.exports = handler;
module.exports._test = {
  createReport,
  decideReportRate,
  normalizePage,
  updateReportStatus,
};
