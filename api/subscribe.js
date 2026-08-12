// api/subscribe.js — captura de e-mail de quem ainda não criou conta.
// Mesmo padrão de create-charge.js: grava no Realtime DB via REST (o SDK
// admin usa websocket, que trava em função serverless).
const crypto = require('crypto');
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { assertSafeFirebaseEnvironment } = require('../lib/collab-safety');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

// Chave do RTDB não aceita . # $ [ ] / — trocar por _ também deduplica o e-mail.
const keyFor = email => email.replace(/[.#$[\]/]/g, '_');

/* Freio por IP: a checagem de Origin não protege nada contra um cliente que não
   seja navegador (curl manda o header que quiser), então sem isto dava para
   despejar lixo na lista. Guarda só um HASH salgado do IP — o IP em si é dado
   pessoal e não precisamos dele. Janela de 10 minutos. */
const LIMITE = 5;
async function excedeuLimite(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0].trim() || 'sem-ip';
  const hash = crypto.createHash('sha256')
    .update(ip + '|' + (process.env.FIREBASE_PROJECT_ID || '')).digest('hex').slice(0, 16);
  const janela = Math.floor(Date.now() / (10 * 60 * 1000));
  const path = `rateLimit/subscribe/${hash}_${janela}`;
  const atual = Number(await dbRest('GET', path).catch(() => 0)) || 0;
  if (atual >= LIMITE) return true;
  await dbRest('PUT', path, atual + 1).catch(() => {});
  return false;
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // Honeypot: campo invisível no formulário. Se veio preenchido é robô —
  // responde 200 pra não ensinar o bot que foi barrado.
  if (body.hp) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const origem = String(body.origem || 'direto').slice(0, 40);

  try {
    ensureFirebase();

    if (await excedeuLimite(req)) {
      return res.status(429).json({ error: 'Muitas tentativas. Tente de novo mais tarde.' });
    }

    // PUT com chave derivada do e-mail: reinscrever não gera duplicata.
    await dbRest('PUT', `newsletter/${keyFor(email)}`, {
      email,
      origem,
      at: Date.now(),
      consent: 'landing_form',   // registro de consentimento exigido pela LGPD
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('subscribe:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
