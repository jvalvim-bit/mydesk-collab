'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   RESTAURAR NAO INVENTA REGISTRO NO FINANCEIRO
   ═══════════════════════════════════════════════════════════════════════
   Apagar uma nota de cliente apaga a ficha junto (removeNote chama
   deleteRecord), entao "Restaurar" tem mesmo de devolver as duas coisas.

   O laco que fazia isso varria TODAS as notas de cliente do quadro e recriava
   a ficha de qualquer uma que nao estivesse em _records. Duas consequencias,
   as duas silenciosas:

   1. Quem apaga uma ficha pela tabela de Clientes — a nota FICA no quadro, e
      isso e o que "excluir registro" faz — via a ficha voltar sozinha na
      primeira restauracao seguinte, que podia ser de outra nota, horas
      depois. Na tela: linhas aparecendo no financeiro sem ninguem ter
      criado, sempre com a mesma cara (R$ 0,00, Sem Data, Pendente), porque
      era o que o laco inventava.

   2. A ficha era remontada a partir da NOTA, que nao guarda dinheiro. Valor
      virava 0 e status virava pendente — um cliente de R$ 8.000 pago voltava
      zerado, sem aviso nenhum.

   Agora: so as notas que ESTA restauracao trouxe de volta, e a ficha vem da
   copia tirada no backup, inteira.
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

/* Um quadro de mentira, com o minimo que doRestore encosta. `gravadas` guarda
   o que foi parar no banco pelo caminho das fichas. */
function montar({ notasAgora, backup, records }) {
  const gravadas = [];
  const vazio = () => {};
  const ctx = vm.createContext({
    notes: notasAgora,
    _backup: backup,
    _records: records,
    _activeWs: null,
    _activeGroupWs: null,
    _fbReady: true,
    zTop: 10,
    Z_TETO_NOTA: 400,
    /* As pastas passaram a ser descobertas tambem pelo mapa de
       metadados, para a pasta VAZIA nao ficar invisivel. */
    _todosOsStackIds: () => [],
    _marcarBoard: n => n,
    _compactarZ: vazio,
    mountNote: vazio,
    renderStack: vazio,
    _arrumarColunaDePastas: vazio,
    closeAllViewers: vazio,
    saveNotes: vazio,
    saveSharedNote: vazio,
    saveGroupNote: vazio,
    syncCount: vazio,
    _hideRestoreBtn: vazio,
    renderRecordsTable: vazio,
    updateCRMDashboard: vazio,
    toast: vazio,
    _appText: (chave, padrao) => padrao,
    _crmDB: () => ({
      ref: caminho => ({
        set: valor => { gravadas.push({ caminho, valor }); return Promise.resolve(); },
      }),
    }),
    _recBasePath: () => 'users/u1/notes',
    document: {
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    setTimeout: fn => fn(),
    requestAnimationFrame: fn => fn(),
    console, Promise, Object, Array, Set, Date, Math, JSON,
  });
  vm.runInContext(recortar('async function doRestore('), ctx);
  return { ctx, gravadas };
}

const NOTA_CLIENTE = {
  id: 'n1', title: 'Padaria do Ze', body: '', color: 'indigo',
  _isClientNote: true, _crmRecordId: 'crm_1',
};

test('ficha apagada pela tabela NAO volta quando se restaura outra coisa', async () => {
  /* A nota de cliente nunca saiu do quadro: ela esta antes e depois. Quem
     apagou foi a FICHA, pela tabela. Restaurar aqui e de outro assunto. */
  const notasAgora = [NOTA_CLIENTE, { id: 'n2', title: 'outra' }];
  const { ctx, gravadas } = montar({
    notasAgora,
    records: [],   // a ficha crm_1 nao esta mais no financeiro, de proposito
    backup: {
      type: 'note',
      label: 'nota',
      snapshot: [NOTA_CLIENTE, { id: 'n2', title: 'outra' }, { id: 'n3', title: 'voltou' }],
      fichas: [],
      workspaceKey: null,
      groupId: null,
    },
  });

  await ctx.doRestore();

  assert.equal(gravadas.length, 0,
    'restaurar ressuscitou uma ficha que a pessoa apagou de proposito');
});

test('ficha volta junto com a nota que acabou de ser restaurada', async () => {
  const { ctx, gravadas } = montar({
    notasAgora: [{ id: 'n2', title: 'outra' }],   // a nota de cliente nao esta no quadro
    records: [],
    backup: {
      type: 'note',
      label: 'nota',
      snapshot: [NOTA_CLIENTE, { id: 'n2', title: 'outra' }],
      fichas: [{ id: 'crm_1', type: 'client', name: 'Padaria do Ze', value: 8000,
        status: 'paid', paidAmount: 8000, dueDate: '2026-09-10' }],
      workspaceKey: null,
      groupId: null,
    },
  });

  await ctx.doRestore();

  assert.equal(gravadas.length, 1, 'a ficha da nota restaurada nao voltou');
  assert.equal(gravadas[0].caminho, 'users/u1/notes/crm_1');
});

test('a ficha volta com o dinheiro que tinha, e nao zerada', async () => {
  const { ctx, gravadas } = montar({
    notasAgora: [],
    records: [],
    backup: {
      type: 'note',
      label: 'nota',
      snapshot: [NOTA_CLIENTE],
      fichas: [{ id: 'crm_1', type: 'client', name: 'Padaria do Ze', value: 8000,
        status: 'paid', paidAmount: 8000, dueDate: '2026-09-10' }],
      workspaceKey: null,
      groupId: null,
    },
  });

  await ctx.doRestore();

  const ficha = gravadas[0].valor;
  assert.equal(ficha.value, 8000, 'o valor do cliente foi reescrito para zero');
  assert.equal(ficha.status, 'paid', 'o status pago virou pendente');
  assert.equal(ficha.dueDate, '2026-09-10', 'o vencimento se perdeu');
  assert.equal(ficha.name, 'Padaria do Ze');
});

test('sem copia da ficha no backup, remonta pela nota — mas so a que voltou', async () => {
  const { ctx, gravadas } = montar({
    notasAgora: [],
    records: [],
    backup: {
      type: 'note',
      label: 'nota',
      snapshot: [NOTA_CLIENTE],
      // backup antigo, de antes do campo existir
      workspaceKey: null,
      groupId: null,
    },
  });

  await ctx.doRestore();

  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].valor.name, 'Padaria do Ze');
  assert.equal(gravadas[0].valor.type, 'client');
});

test('ficha que continua no financeiro nao e regravada', async () => {
  const { ctx, gravadas } = montar({
    notasAgora: [],
    records: [{ id: 'crm_1', type: 'client', name: 'Padaria do Ze', value: 8000 }],
    backup: {
      type: 'note',
      label: 'nota',
      snapshot: [NOTA_CLIENTE],
      fichas: [{ id: 'crm_1', type: 'client', name: 'Padaria do Ze', value: 8000 }],
      workspaceKey: null,
      groupId: null,
    },
  });

  await ctx.doRestore();

  assert.equal(gravadas.length, 0, 'regravou uma ficha que nunca saiu');
});

test('_takeBackup guarda a copia das fichas', () => {
  const ctx = vm.createContext({
    notes: [{ id: 'n1', title: 'a', files: [] }],
    _records: [{ id: 'crm_1', name: 'Padaria do Ze', value: 8000 }],
    _activeWs: null,
    _activeGroupWs: null,
    _showRestoreBtn: () => {},
    Date, Object, Array, Math,
  });
  vm.runInContext(recortar('function _takeBackup('), ctx);
  vm.runInContext('_takeBackup("note", "x")', ctx);

  const b = ctx._backup;
  assert.ok(Array.isArray(b.fichas), 'o backup nao guardou as fichas');
  assert.equal(b.fichas.length, 1);
  assert.equal(b.fichas[0].value, 8000);
  assert.notEqual(b.fichas[0], ctx._records[0], 'guardou a referencia, nao uma copia');
});

test('a linha da tabela nunca sai sem nome', () => {
  /* Registro sem `name` existe no banco de quem usou a versao antiga: ela
     remontava a ficha a partir de uma nota sem titulo. A linha saia com a
     celula vazia e um "?" no avatar — impossivel saber o que era. */
  const trecho = recortar('function renderRecordsTable(');
  assert.ok(/nomeNaLinha/.test(trecho), 'sumiu o nome de reserva da linha');
  assert.ok(!/\$\{xe\(rec\.name\)\}/.test(trecho),
    'a linha voltou a imprimir rec.name cru, sem reserva');
});
