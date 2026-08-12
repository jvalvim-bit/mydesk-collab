// lib/set-admin.js — concede/remove a claim de administrador.
//
// A permissão de admin do MyDesk é uma CUSTOM CLAIM do Firebase Auth
// (auth.token.admin === true, usada também nas regras do Realtime DB). Claim
// só pode ser escrita pelo Admin SDK, nunca pelo navegador — por isso este
// endpoint existe. Quem chama precisa ele mesmo ser admin.
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertSafeFirebaseEnvironment } = require('./collab-safety');

async function dbRest(method, path, value) {
  const token = (await getApp().options.credential.getAccessToken()).access_token;
  const url = `${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${token}`;
  const opts = { method };
  if (value !== undefined) opts.body = JSON.stringify(value);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(`DB ${method} ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const ALLOWED_ORIGINS = [
  'https://mydesk.social',            // domínio oficial do site
  'https://jvalvim-bit.github.io',    // publicação antiga do Pages, ainda em links soltos
  'https://mydesk-eta.vercel.app',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function ensureFirebase() {
  assertSafeFirebaseEnvironment();
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Não autenticado' });

  let caller;
  try {
    ensureFirebase();
    caller = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Só admin mexe em admin. A checagem é feita na claim do token verificado
  // pelo servidor — nada aqui confia em nada que o navegador tenha mandado.
  if (caller.admin !== true) return res.status(403).json({ error: 'Apenas administradores' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = body.action === 'list' ? 'list' : 'set';

  try {
    // ── Listar quem é admin hoje (a claim é a fonte da verdade, não o RTDB) ──
    if (action === 'list') {
      const admins = [];
      let pageToken;
      do {
        const page = await getAuth().listUsers(1000, pageToken);
        page.users.forEach(u => { if (u.customClaims?.admin === true) admins.push(u.uid); });
        pageToken = page.pageToken;
      } while (pageToken);
      return res.status(200).json({ ok: true, admins });
    }

    // ── Conceder / revogar ──
    const uid = String(body.uid || '');
    const makeAdmin = body.admin === true;
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return res.status(400).json({ error: 'uid inválido' });

    // Trava contra se trancar pra fora: um admin não remove a própria claim.
    if (uid === caller.uid && !makeAdmin) {
      return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso de admin.' });
    }

    let target;
    try {
      target = await getAuth().getUser(uid);
    } catch (e) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Preserva as outras claims que porventura existam.
    const claims = { ...(target.customClaims || {}) };
    if (makeAdmin) claims.admin = true; else delete claims.admin;
    await getAuth().setCustomUserClaims(uid, claims);

    // Espelho no RTDB só para exibição, e trilha de auditoria de quem mexeu.
    await dbRest('PUT', `users/${uid}/isAdmin`, makeAdmin || null).catch(() => {});
    await dbRest('POST', 'adminLog', {
      at: Date.now(),
      acao: makeAdmin ? 'conceder_admin' : 'remover_admin',
      alvo: uid,
      alvoEmail: target.email || null,
      por: caller.uid,
      porEmail: caller.email || null,
    }).catch(() => {});

    // A claim só entra em vigor quando o token do alvo é renovado (no próximo
    // login, ou em até ~1h). Revogar força uma renovação mais cedo.
    if (!makeAdmin) await getAuth().revokeRefreshTokens(uid).catch(() => {});

    return res.status(200).json({ ok: true, uid, admin: makeAdmin });

  } catch (err) {
    console.error('set-admin:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
