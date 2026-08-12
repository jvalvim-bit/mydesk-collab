'use strict';
/* O consumo do Realtime Database é cobrado por byte baixado, e o projeto vive
   no plano gratuito. Estes testes travam as leituras que já estouraram a conta
   uma vez: nó inteiro sendo lido quando só um pedaço é usado, e histórico sem
   teto. As funções são recortadas do app.js real — copiar a lógica para cá
   faria o teste passar com o app quebrado. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

/* Mesmo recorte por contagem de chaves usado nos outros testes do app.js. */
function recortar(nome) {
  const ini = fonte.indexOf('function ' + nome + '(');
  assert.ok(ini > -1, 'função não encontrada: ' + nome);
  let prof = 0, i = fonte.indexOf('{', ini);
  const abre = i;
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') prof++;
    else if (fonte[i] === '}') { prof--; if (!prof) break; }
  }
  assert.ok(i > abre, 'não fechou: ' + nome);
  return fonte.slice(ini, i + 1);
}

/* Banco de mentira que só anota a consulta montada. O que importa não é o dado
   devolvido, e sim quanto o Firebase teria sido mandado baixar. */
function bancoFalso(resultado) {
  const chamadas = [];
  function no(caminho, filtros) {
    return {
      orderByKey()      { return no(caminho, filtros.concat('orderByKey')); },
      orderByChild(c)   { return no(caminho, filtros.concat('orderByChild:' + c)); },
      startAt(v)        { return no(caminho, filtros.concat('startAt:' + v)); },
      limitToLast(n)    { return no(caminho, filtros.concat('limitToLast:' + n)); },
      limitToFirst(n)   { return no(caminho, filtros.concat('limitToFirst:' + n)); },
      once(evento)      {
        chamadas.push({ caminho, filtros, evento });
        return Promise.resolve({
          val:    () => resultado,
          exists: () => resultado !== null && resultado !== undefined,
        });
      },
      on(evento, fn) { chamadas.push({ caminho, filtros, evento, listener: true }); return fn; },
      off() {},
    };
  }
  return { chamadas, ref: (caminho) => no(caminho, []) };
}

function carregar(nomes, resultado) {
  const _db = bancoFalso(resultado);
  const ctx = vm.createContext({
    _db, console, Date,
    _fbListeners: [],
    ref: (p) => _db.ref(p),
  });
  nomes.forEach(n => vm.runInContext(recortar(n), ctx));
  return { ctx, _db };
}

test('fbGetUltimos pede só as últimas N mensagens, não o histórico inteiro', async () => {
  const { ctx, _db } = carregar(['fbGetUltimos'], { a: 1 });
  await vm.runInContext('fbGetUltimos', ctx)('chats/ana__bia/messages', 50);

  assert.equal(_db.chamadas.length, 1);
  const c = _db.chamadas[0];
  assert.equal(c.caminho, 'chats/ana__bia/messages');
  assert.deepEqual(c.filtros, ['orderByKey', 'limitToLast:50']);
});

test('onFbDesde corta por data no servidor, não dentro do callback', () => {
  const { ctx, _db } = carregar(['onFbDesde'], null);
  vm.runInContext('onFbDesde', ctx)('groupChats/g1/messages', 1700000000000, () => {});

  const c = _db.chamadas[0];
  assert.equal(c.evento, 'child_added');
  // Sem o startAt a mensagem antiga desceria com o anexo antes de ser descartada.
  assert.deepEqual(c.filtros, ['orderByChild:ts', 'startAt:1700000000000']);
});

test('onFbDesde registra o listener para offAllListeners poder desligar', () => {
  const { ctx } = carregar(['onFbDesde'], null);
  vm.runInContext('onFbDesde', ctx)('groupChats/g1/messages', 0, () => {});
  assert.equal(vm.runInContext('_fbListeners.length', ctx), 1);
  assert.equal(vm.runInContext('_fbListeners[0].event', ctx), 'child_added');
});

/* ── Travas de regressão ──────────────────────────────────────────────────
   Estas olham o texto do app.js. São feias de propósito: o dia em que alguém
   reintroduzir a leitura larga, o teste cai antes da fatura. */

test('_pintarRespostas não lê o nó do formulário inteiro', () => {
  const fn = recortar('_pintarRespostas');
  // 'forms/{id}' puro arrasta todas as respostas, com os anexos em base64.
  assert.ok(!/fbGet\('forms\/'\s*\+\s*id\)/.test(fn),
    'voltou a ler forms/{id} inteiro — isso rebaixa todas as respostas a cada resposta nova');
  assert.ok(fn.includes("'/campos'") && fn.includes("'/nicho'"),
    'os dois caminhos estreitos precisam continuar sendo lidos');
});

test('abrir conversa não baixa o histórico inteiro', () => {
  ['loadChatMessages', 'loadGroupMessages'].forEach(nome => {
    const fn = recortar(nome);
    assert.ok(fn.includes('fbGetUltimos'), nome + ' precisa da leitura com teto');
    assert.ok(!/fbGet\('(chats|groupChats)\//.test(fn),
      nome + ' voltou a ler o nó de mensagens sem limite');
  });
});

test('listenGroupChat corta o histórico na consulta, não no callback', () => {
  const fn = recortar('listenGroupChat');
  assert.ok(fn.includes('onFbDesde'),
    'voltou ao onFb sem filtro — a mensagem antiga desce antes de ser descartada');
});

test('a lista de workspaces não baixa as notas dos quadros 1:1', () => {
  // A checagem é só um sim/não, mas nota de quadro compartilhado leva anexo junto.
  assert.ok(!fonte.includes("fbGet(base + '/notes')"),
    'a checagem de "tem conteúdo" voltou a baixar as notas inteiras');
  assert.ok(/ref\(base \+ '\/notes'\)\.limitToFirst\(1\)/.test(fonte),
    'a checagem precisa continuar trazendo um filho só');
});
