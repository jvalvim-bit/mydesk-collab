const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertSafeFirebaseEnvironment } = require('./collab-safety');

function ensureFirebase() {
  assertSafeFirebaseEnvironment();
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return getApp();
}

async function dbRest(method, path, value) {
  const app = ensureFirebase();
  const token = (await app.options.credential.getAccessToken()).access_token;
  const baseUrl = String(process.env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('FIREBASE_DATABASE_URL não configurada');

  const options = { method, headers: {} };
  if (value !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(value);
  }

  const response = await fetch(
    `${baseUrl}/${path}.json?access_token=${encodeURIComponent(token)}`,
    options,
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Firebase REST ${method} ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function authenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    const error = new Error('Não autenticado');
    error.statusCode = 401;
    throw error;
  }

  try {
    ensureFirebase();
    const decoded = await getAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email || `user-${decoded.uid}@mydesk.app`,
      name: decoded.name || decoded.email?.split('@')[0] || 'Assinante MyDesk',
    };
  } catch (_) {
    const error = new Error('Token inválido');
    error.statusCode = 401;
    throw error;
  }
}

module.exports = {
  authenticatedUser,
  dbRest,
  ensureFirebase,
};
