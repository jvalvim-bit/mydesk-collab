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

test('API ignora ativação forjada pelo respondente e cria cliente só quando o dono optou', async () => {
  const formPath = require.resolve('../api/form');
  const appPath = require.resolve('firebase-admin/app');
  const authPath = require.resolve('firebase-admin/auth');
  const originals = new Map([
    [formPath, require.cache[formPath]],
    [appPath, require.cache[appPath]],
    [authPath, require.cache[authPath]],
  ]);
  const originalFetch = global.fetch;
  const originalDbUrl = process.env.FIREBASE_DATABASE_URL;
  const originalResendKey = process.env.RESEND_API_KEY;
  const originalResendFrom = process.env.RESEND_FROM;
  const writes = [];
  let activeForm;
  let responseSequence = 0;

  function install(path, exports) {
    require.cache[path] = { id: path, filename: path, loaded: true, exports };
  }

  install(appPath, {
    cert: value => value,
    getApps: () => [{ name: 'test' }],
    getApp: () => ({
      options: {
        credential: {
          getAccessToken: async () => ({ access_token: 'firebase-token' }),
        },
      },
    }),
    initializeApp: () => ({ name: 'test' }),
  });
  install(authPath, {
    getAuth: () => ({ verifyIdToken: async () => ({ uid: 'owner-1' }) }),
  });
  delete require.cache[formPath];

  process.env.FIREBASE_DATABASE_URL = 'https://db.example.test';
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/|\.json$/g, '');
    const method = options.method || 'GET';
    if (method === 'GET' && path.startsWith('forms/form_')) {
      return { ok: true, status: 200, async json() { return structuredClone(activeForm); } };
    }
    if (method === 'POST' && /\/respostas$/.test(path)) {
      responseSequence += 1;
      writes.push({ method, path, value: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        async json() { return { name: `-response0${responseSequence}` }; },
      };
    }
    if (method === 'PUT') {
      writes.push({ method, path, value: JSON.parse(options.body) });
      return { ok: true, status: 200, async json() { return null; } };
    }
    throw new Error(`fetch inesperado: ${method} ${path}`);
  };

  try {
    const handler = require('../api/form');
    const baseForm = {
      owner: 'owner-1',
      titulo: 'Cadastro',
      publico: true,
      notificar: false,
      campos: [
        { id: 'nome', tipo: 'texto', rotulo: 'Nome completo', obrigatorio: true },
        { id: 'email', tipo: 'email', rotulo: 'E-mail', obrigatorio: true },
      ],
    };
    const request = (id, extra = {}) => ({
      method: 'POST',
      query: {},
      headers: { origin: 'https://mydesk.social' },
      body: {
        id,
        valores: { nome: 'Ana', email: 'ana@example.com' },
        // Estes valores pertencem ao atacante e precisam ser ignorados.
        criarCliente: true,
        crmDestino: { tipo: 'pessoal', id: 'forjado' },
        ...extra,
      },
    });

    activeForm = { ...baseForm, criarCliente: false };
    const forged = responseMock();
    await handler(request('form_safe1'), forged);
    assert.equal(forged.statusCode, 200);
    assert.equal(forged.body.clienteCriado, false);
    assert.equal(writes.filter(write => write.method === 'PUT').length, 0);

    activeForm = {
      ...baseForm,
      criarCliente: true,
      crmDestino: { tipo: 'pessoal' },
    };
    const optedIn = responseMock();
    await handler(request('form_safe2'), optedIn);
    assert.equal(optedIn.statusCode, 200);
    assert.equal(optedIn.body.clienteCriado, true);
    const clientWrite = writes.find(write => write.method === 'PUT');
    assert.equal(clientWrite.path, 'users/owner-1/notes/crm_-response02');
    assert.equal(clientWrite.value.name, 'Ana');
    assert.equal(clientWrite.value.email, 'ana@example.com');
    assert.equal(clientWrite.value.sourceFormId, 'form_safe2');

    assert.deepEqual(handler._test.emailConfiguration(), {
      apiKey: '',
      from: '',
      configured: false,
      missing: ['MYDESK_ENABLE_EMAIL=1', 'RESEND_API_KEY', 'RESEND_FROM'],
    });
  } finally {
    global.fetch = originalFetch;
    if (originalDbUrl === undefined) delete process.env.FIREBASE_DATABASE_URL;
    else process.env.FIREBASE_DATABASE_URL = originalDbUrl;
    if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendKey;
    if (originalResendFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalResendFrom;
    for (const [path, original] of originals) {
      if (original) require.cache[path] = original;
      else delete require.cache[path];
    }
  }
});
