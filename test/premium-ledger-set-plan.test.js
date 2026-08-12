'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

test('concessão manual registra alerta somente ao entrar no Premium', async () => {
  const setPlanPath = require.resolve('../lib/set-plan');
  const appPath = require.resolve('firebase-admin/app');
  const authPath = require.resolve('firebase-admin/auth');
  const originals = new Map([
    [setPlanPath, require.cache[setPlanPath]],
    [appPath, require.cache[appPath]],
    [authPath, require.cache[authPath]],
  ]);
  const originalFetch = global.fetch;
  const originalDbUrl = process.env.FIREBASE_DATABASE_URL;
  const fakeApp = {
    options: {
      credential: {
        getAccessToken: async () => ({ access_token: 'service-token' }),
      },
    },
  };
  let currentPlan = { plan: 'free', planExpiresAt: null };
  const rootPatches = [];

  function install(path, exports) {
    require.cache[path] = { id: path, filename: path, loaded: true, exports };
  }
  install(appPath, {
    cert: value => value,
    getApp: () => fakeApp,
    getApps: () => [fakeApp],
    initializeApp: () => fakeApp,
  });
  install(authPath, {
    getAuth: () => ({
      verifyIdToken: async () => ({
        uid: 'admin-1',
        email: 'admin@example.com',
        admin: true,
      }),
      getUser: async uid => ({ uid, email: 'alice@example.com' }),
    }),
  });

  process.env.FIREBASE_DATABASE_URL = 'https://database.test';
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    let path = parsed.pathname.replace(/^\/+/, '').replace(/\.json$/, '');
    if (path === '') path = '';
    const method = options.method || 'GET';
    const value = options.body ? JSON.parse(options.body) : undefined;
    let result = null;

    if (method === 'GET' && path === 'users/user-1/plan') result = currentPlan;
    else if (method === 'GET' && path === 'uids/user-1') result = 'alice';
    else if (method === 'PATCH' && path === '') {
      rootPatches.push(structuredClone(value));
      const next = { ...currentPlan };
      const prefix = 'users/user-1/plan/';
      Object.entries(value).forEach(([key, fieldValue]) => {
        if (key.startsWith(prefix)) next[key.slice(prefix.length)] = fieldValue;
      });
      currentPlan = next;
    } else if (method === 'POST' && path === 'adminLog') {
      result = { name: '-log01' };
    } else if (method === 'PATCH' && path === 'users/user-1/plan') {
      currentPlan = { ...currentPlan, ...value };
    }

    return {
      ok: true,
      status: 200,
      text: async () => result === null ? 'null' : JSON.stringify(result),
    };
  };
  delete require.cache[setPlanPath];

  try {
    const handler = require('../lib/set-plan');
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://mydesk.social',
        authorization: 'Bearer admin-token',
      },
      body: { uid: 'user-1', plan: 'premium', dias: 30 },
    };

    const first = responseMock();
    await handler(req, first);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.plan, 'premium');
    assert.ok(first.body.notificationId.startsWith('courtesy_user-1_'));
    assert.equal(
      Object.keys(rootPatches[0]).filter(key => key.startsWith('adminNotifications/')).length,
      1,
    );

    const second = responseMock();
    await handler(req, second);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.notificationId, null);
    assert.equal(
      Object.keys(rootPatches[1]).some(key => key.startsWith('adminNotifications/')),
      false,
    );
  } finally {
    global.fetch = originalFetch;
    if (originalDbUrl === undefined) delete process.env.FIREBASE_DATABASE_URL;
    else process.env.FIREBASE_DATABASE_URL = originalDbUrl;
    for (const [path, original] of originals) {
      if (original) require.cache[path] = original;
      else delete require.cache[path];
    }
  }
});
