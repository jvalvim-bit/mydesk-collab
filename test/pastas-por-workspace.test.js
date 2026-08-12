'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A PASTA DE UM QUADRO PESSOAL APARECIA NO OUTRO
   ═══════════════════════════════════════════════════════════════════════
   Bug relatado: uma pasta de um workspace apareceu em outro. A conta tinha o
   quadro pessoal padrão e um workspace nomeado — e os dois liam a MESMA chave
   de localStorage, `md_stktitles_{@}`.

   O `_stackMetaPath` até dizia "board pessoal (padrão ou nomeado) →
   localStorage", como se fosse decisão tomada; mas quadro de grupo e de 1:1
   sempre tiveram nó próprio em `stacks/`, e só os pessoais dividiam um mapa
   só. `_todosOsStackIds` lê TODAS as chaves `stk_` desse mapa, e `renderStack`
   desenha pasta com título e coordenada mesmo sem nota nenhuma dentro — então
   a pasta do outro quadro chegava desenhada, vazia, no quadro errado.

   Duas coisas para não perder de vista:

   1. **A chave passa a incluir o workspace.** Daqui para a frente cada quadro
      pessoal tem o seu mapa.

   2. **O que já estava misturado precisa ser separado**, e ninguém guardou de
      quem é cada pasta. Quem sabe são as NOTAS: elas carregam o `stackId` e
      moram em nós separados por quadro. Pasta sem nota fica onde está — entre
      chutar um dono e não mexer, não mexer é o que não repete o defeito.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

/* localStorage de mentira e o estado global que as funções leem. */
function montar({ ws = null, notas = [], loja = {} } = {}) {
  const store = { ...loja };
  const ctx = vm.createContext({
    JSON, Object, Set, String, console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
  });
  vm.runInContext(`
    const CU = { username: 'dorindologos' };
    let _activeGroupWs = null, _activeWs = null;
    let _activePersonalWs = ${ws ? `{ id: '${ws}', name: 'Enel CE' }` : 'null'};
    let _stackMetaWs = {};
    let notes = ${JSON.stringify(notas)};
  ` + [
    recortar('function _stackMetaPath('),
    recortar('function _stackMetaLocalKey('),
    recortar('function getStackTitles('),
    recortar('function _separarPastasDoWorkspacePessoal('),
    recortar('function _todosOsStackIds('),
  ].join('\n'), ctx);
  ctx.__store = store;
  return ctx;
}

const CHAVE_PADRAO = 'md_stktitles_dorindologos';
const CHAVE_WS     = 'md_stktitles_dorindologos__pw_1785776227835';

/* ── A chave ─────────────────────────────────────────────────────────── */

test('cada quadro pessoal le a SUA chave', () => {
  const noPadrao = montar({ ws: null });
  assert.equal(noPadrao._stackMetaLocalKey(), CHAVE_PADRAO);

  const noWs = montar({ ws: 'pw_1785776227835' });
  assert.equal(noWs._stackMetaLocalKey(), CHAVE_WS,
    'o workspace nomeado voltou a dividir o mapa com o quadro padrao');
});

test('a pasta de um quadro nao aparece na lista do outro', () => {
  /* O caso relatado, em miniatura: uma pasta criada no workspace nomeado e
     uma no padrao, cada uma com titulo e coordenada. */
  const loja = {
    [CHAVE_PADRAO]: JSON.stringify({
      stk_casa: 'Contas de casa', stk_casa_x: 24, stk_casa_y: 12,
    }),
    [CHAVE_WS]: JSON.stringify({
      __migrado: 1, stk_enel: 'Obras', stk_enel_x: 24, stk_enel_y: 12,
    }),
  };
  const padrao = montar({ ws: null, loja });
  const ws     = montar({ ws: 'pw_1785776227835', loja });

  assert.deepEqual([...padrao._todosOsStackIds()], ['stk_casa']);
  assert.deepEqual([...ws._todosOsStackIds()], ['stk_enel'],
    'a pasta do quadro de casa apareceu no workspace de trabalho');
});

/* ── A separação do que já estava junto ──────────────────────────────── */

test('a pasta vai para o quadro onde estao as notas dela', () => {
  const loja = {
    [CHAVE_PADRAO]: JSON.stringify({
      stk_casa: 'Contas de casa', stk_casa_x: 24, stk_casa_y: 12,
      stk_enel: 'Obras',          stk_enel_x: 30, stk_enel_y: 40,
      stk_enel_smart: 'done',     stk_enel_color: 'indigo',
    }),
  };
  // Aberto no workspace "Enel CE", cujas notas estao na pasta stk_enel.
  const ctx = montar({
    ws: 'pw_1785776227835', loja,
    notas: [{ id: 1, stackId: 'stk_enel' }, { id: 2, stackId: null }],
  });
  ctx._separarPastasDoWorkspacePessoal();

  const meu = JSON.parse(ctx.__store[CHAVE_WS]);
  const pad = JSON.parse(ctx.__store[CHAVE_PADRAO]);

  // A pasta com nota daqui veio inteira — titulo e TODOS os sufixos.
  assert.equal(meu.stk_enel, 'Obras');
  assert.equal(meu.stk_enel_x, 30);
  assert.equal(meu.stk_enel_smart, 'done');
  assert.equal(meu.stk_enel_color, 'indigo');
  // …e saiu do mapa do padrao, senao continuaria aparecendo nos dois.
  assert.equal(pad.stk_enel, undefined, 'a pasta ficou nos dois mapas');
  assert.equal(pad.stk_enel_x, undefined);
  // A pasta de casa nao foi tocada.
  assert.equal(pad.stk_casa, 'Contas de casa');
  assert.equal(meu.stk_casa, undefined, 'levou junto uma pasta que nao e daqui');
});

test('pasta vazia fica onde esta — nao ha de onde tirar o dono', () => {
  const loja = {
    [CHAVE_PADRAO]: JSON.stringify({
      stk_orfa: 'Sem notas', stk_orfa_x: 24, stk_orfa_y: 12,
    }),
  };
  const ctx = montar({ ws: 'pw_1785776227835', loja, notas: [] });
  ctx._separarPastasDoWorkspacePessoal();
  assert.equal(JSON.parse(ctx.__store[CHAVE_PADRAO]).stk_orfa, 'Sem notas',
    'chutou um dono para a pasta vazia');
  assert.equal(JSON.parse(ctx.__store[CHAVE_WS]).stk_orfa, undefined);
});

test('a separacao roda UMA vez por workspace', () => {
  /* Sem a marca, a segunda visita levaria de volta para o padrao o que a
     pessoa tivesse reorganizado depois. */
  const loja = {
    [CHAVE_PADRAO]: JSON.stringify({ stk_a: 'A', stk_a_x: 1 }),
  };
  const ctx = montar({
    ws: 'pw_1785776227835', loja, notas: [{ id: 1, stackId: 'stk_a' }],
  });
  ctx._separarPastasDoWorkspacePessoal();
  assert.equal(JSON.parse(ctx.__store[CHAVE_WS]).__migrado, 1);

  // Alguem move a pasta de volta para o padrao, de proposito.
  const meu = JSON.parse(ctx.__store[CHAVE_WS]);
  delete meu.stk_a; delete meu.stk_a_x;
  ctx.__store[CHAVE_WS] = JSON.stringify(meu);
  ctx.__store[CHAVE_PADRAO] = JSON.stringify({ stk_a: 'A', stk_a_x: 1 });

  ctx._separarPastasDoWorkspacePessoal();
  assert.equal(JSON.parse(ctx.__store[CHAVE_PADRAO]).stk_a, 'A',
    'a segunda passada puxou de volta a pasta que a pessoa tinha movido');
});

test('a marca de migrado nao vira uma pasta fantasma', () => {
  const ctx = montar({
    ws: 'pw_1785776227835',
    loja: { [CHAVE_WS]: JSON.stringify({ __migrado: 1 }) },
  });
  assert.deepEqual([...ctx._todosOsStackIds()], [],
    '__migrado entrou na lista de pastas');
});

test('no quadro padrao a separacao nao faz nada', () => {
  /* O padrao e a ORIGEM da separacao, nunca o destino: rodar ali levaria as
     pastas do padrao para lugar nenhum. */
  const loja = { [CHAVE_PADRAO]: JSON.stringify({ stk_a: 'A' }) };
  const ctx = montar({ ws: null, loja, notas: [{ id: 1, stackId: 'stk_a' }] });
  ctx._separarPastasDoWorkspacePessoal();
  assert.deepEqual(ctx.__store, loja, 'a separacao mexeu no quadro padrao');
});

/* ── Onde ela é chamada ──────────────────────────────────────────────── */

test('a separacao roda nos TRES caminhos de abrir quadro pessoal', () => {
  /* Abrir o app, trocar de workspace e voltar de um grupo/1:1. Faltando um,
     a mistura reaparece por aquele caminho. */
  const chamadas = APP.match(/_separarPastasDoWorkspacePessoal\(\);/g) || [];
  assert.equal(chamadas.length, 3,
    'algum caminho de abrir quadro pessoal ficou sem separar as pastas');

  ['async function launchApp(', 'async function _restorePersonalBoard(',
   'async function _pwSwitchTo('].forEach(nome => {
    const i = APP.indexOf(nome);
    assert.ok(i > 0, 'sumiu: ' + nome);
    const corpo = APP.slice(i, i + 9000);
    const iSep = corpo.indexOf('_separarPastasDoWorkspacePessoal();');
    const iIds = corpo.indexOf('const stackIds = _todosOsStackIds();');
    assert.ok(iSep > 0, nome + ' nao separa as pastas');
    assert.ok(iSep < iIds,
      nome + ' lista os ids antes de separar — a pasta do outro quadro entra na lista');
  });
});

test('apagar um workspace leva o mapa de pastas dele junto', () => {
  const fn = recortar('async function _pwDelete(');
  assert.match(fn, /localStorage\.removeItem\('md_stktitles_' \+ CU\.username \+ '__' \+ ws\.id\)/);
});

test('grupo e 1:1 continuam com no proprio, e nao no localStorage', () => {
  /* Eles nunca tiveram este problema — a correcao nao pode ter trocado o
     caminho deles por engano. */
  const fn = recortar('function _stackMetaPath(');
  assert.match(fn, /group_boards\/' \+ _activeGroupWs\.groupId \+ '\/stacks/);
  assert.match(fn, /shared_boards\/' \+ _activeWs\.key \+ '\/stacks/);
  const get = recortar('function getStackTitles(');
  assert.match(get, /if \(_stackMetaPath\(\)\) return _stackMetaWs;/);
});
