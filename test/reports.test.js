'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(token, body) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://mydesk.social',
      authorization: `Bearer ${token}`,
    },
    body,
  };
}

test('API de reportes cria com identidade confiável, limita abuso e restringe resolução ao admin', async () => {
  const reportsPath = require.resolve('../api/reports');
  const firebasePath = require.resolve('../lib/firebase-admin');
  const authPath = require.resolve('firebase-admin/auth');
  const databasePath = require.resolve('firebase-admin/database');
  const originals = new Map([
    [firebasePath, require.cache[firebasePath]],
    [authPath, require.cache[authPath]],
    [databasePath, require.cache[databasePath]],
    [reportsPath, require.cache[reportsPath]],
  ]);
  const reports = {};
  const rateState = new Map();
  const calls = [];

  function install(path, exports) {
    require.cache[path] = { id: path, filename: path, loaded: true, exports };
  }

  install(firebasePath, {
    ensureFirebase: () => ({ name: 'test-app' }),
    dbRest: async (method, path, value) => {
      calls.push({ method, path, value });
      if (method === 'GET' && path.startsWith('uids/')) return 'alice';
      if (method === 'POST' && path === 'reports') {
        const id = '-report01';
        reports[id] = structuredClone(value);
        return { name: id };
      }
      if (method === 'GET' && path.startsWith('reports/')) {
        return reports[path.slice('reports/'.length)] || null;
      }
      if (method === 'PATCH' && path.startsWith('reports/')) {
        const id = path.slice('reports/'.length);
        reports[id] = { ...reports[id], ...structuredClone(value) };
        return reports[id];
      }
      if (method === 'POST' && path === 'adminLog') return { name: '-log01' };
      return null;
    },
  });
  install(authPath, {
    getAuth: () => ({
      verifyIdToken: async token => ({
        uid: token === 'admin-token' ? 'admin-001' : 'user-001',
        email: token === 'admin-token' ? 'admin@example.com' : 'alice@example.com',
        name: token === 'admin-token' ? 'Admin' : 'Alice enviada pelo token',
        admin: token === 'admin-token',
      }),
    }),
  });
  install(databasePath, {
    getDatabase: () => ({
      ref: path => ({
        transaction: async update => {
          const current = rateState.get(path) || null;
          const next = update(current);
          if (next === undefined) return { committed: false };
          rateState.set(path, structuredClone(next));
          return { committed: true };
        },
      }),
    }),
  });
  delete require.cache[reportsPath];

  try {
    const handler = require('../api/reports');

    const created = responseMock();
    await handler(request('user-token', {
      action: 'create',
      category: 'bug',
      title: '  Botão não responde  ',
      description: 'O botão de salvar não responde quando clico.',
      page: 'https://mydesk.social/index.html?workspace=1',
      locale: 'pt-BR',
      reporterEmail: 'forjado@atacante.test',
    }), created);

    assert.equal(created.statusCode, 200);
    assert.equal(created.body.id, '-report01');
    assert.equal(reports['-report01'].reporterUid, 'user-001');
    assert.equal(reports['-report01'].reporterEmail, 'alice@example.com');
    assert.equal(reports['-report01'].reporterUsername, 'alice');
    assert.equal(reports['-report01'].reporterName, 'Alice enviada pelo token');
    assert.equal(reports['-report01'].title, 'Botão não responde');
    assert.equal(reports['-report01'].page, '/index.html?workspace=1');
    assert.equal(reports['-report01'].status, 'open');

    const limited = responseMock();
    await handler(request('user-token', {
      action: 'create',
      category: 'problem',
      title: 'Outro problema',
      description: 'Uma segunda solicitação imediata deve ser limitada.',
    }), limited);
    assert.equal(limited.statusCode, 429);
    assert.ok(Number(limited.headers['Retry-After']) >= 1);

    const denied = responseMock();
    await handler(request('user-token', {
      action: 'updateStatus',
      reportId: '-report01',
      status: 'resolved',
    }), denied);
    assert.equal(denied.statusCode, 403);

    const updated = responseMock();
    await handler(request('admin-token', {
      action: 'updateStatus',
      reportId: '-report01',
      status: 'resolved',
      resolutionNote: 'Corrigido e validado em produção.',
    }), updated);
    assert.equal(updated.statusCode, 200);
    assert.equal(reports['-report01'].status, 'resolved');
    assert.equal(reports['-report01'].resolvedBy, 'admin-001');
    assert.equal(reports['-report01'].resolutionNote, 'Corrigido e validado em produção.');
    assert.ok(calls.some(call => call.method === 'POST' && call.path === 'adminLog'));

    const now = 5_000_000;
    assert.equal(handler._test.decideReportRate(null, now).allowed, true);
    assert.equal(handler._test.decideReportRate({
      windowStart: now - 1000,
      count: 1,
      lastAt: now - 500,
    }, now).reason, 'interval');
    assert.equal(handler._test.decideReportRate({
      windowStart: now - 1000,
      count: 5,
      lastAt: now - 30_000,
    }, now).reason, 'window');
  } finally {
    for (const [path, original] of originals) {
      if (original) require.cache[path] = original;
      else delete require.cache[path];
    }
  }
});
