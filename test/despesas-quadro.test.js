'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   DESPESAS DO QUADRO
   ═══════════════════════════════════════════════════════════════════════
   O financeiro só tinha o que ENTRA. Um relatório sem saída mostra
   faturamento e nunca resultado — e faturamento alto com margem negativa é
   exatamente o retrato que quebra empresa sem ninguém ver chegando.

   O que este arquivo cobra é o que quebra em silêncio quando uma entidade
   nova passa a morar no nó dos registros: ela some do banco no primeiro
   salvamento de nota, ou entra na carteira e soma no dinheiro dos clientes.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

function montar(despesas, registros, hoje = '2026-08-05') {
  const ctx = vm.createContext({
    Number, String, Math, Object, Array, Date,
    _crmTodayLocalIso: () => hoje,
    _registrosFinanceiros: () => registros || [],
    _crmRecMonth: r => String(r.dueDate || '').slice(0, 7),
    _crmRecebido: r => (r.status === 'paid' ? Number(r.value) || 0
      : r.status === 'partial' ? Number(r.paidAmount) || 0 : 0),
    _appText: (k, f) => f,
  });
  ctx._despesas = despesas || [];
  vm.runInContext(recortar('function _despesasDoMes('), ctx);
  vm.runInContext(recortar('function _despesaTotalDoMes('), ctx);
  vm.runInContext(recortar('function _receitaRecebidaNoMes('), ctx);
  return ctx;
}

const desp = (id, valor, data, cat) =>
  ({ id, type: 'despesa', descricao: 'd' + id, valor, data, categoria: cat || 'outros' });

/* ── O que quebra em silêncio ───────────────────────────────────────────── */

test('a despesa NAO entra na carteira de clientes', () => {
  /* Ela mora no mesmo no dos registros. Sem o predicado no filtro, entraria
     em _records e somaria no dinheiro dos clientes — e o total da carteira
     passaria a incluir o que saiu. */
  const fn = recortar('function _crmEhRegistro(');
  assert.match(fn, /_ehDespesa\(r\)/);
  assert.match(APP, /function _ehDespesa\(r\) \{ return !!\(r && r\.type === 'despesa'\); \}/);
});

test('a despesa entra em TODOS os montadores de objeto', () => {
  /* `fbSet` troca o no INTEIRO: o que nao estiver no objeto some, sem erro
     na tela. Foi assim que salvar uma nota apagou todas as vagas.

     Eram quatro lugares montando esse objeto a mao, e a lista divergiu: dois
     lembravam das cinco colecoes e dois so dos clientes. Agora e uma funcao
     so — o teste cobra a funcao E que todos os quatro a chamem. */
  const helper = recortar('function _preservarRegistrosDoQuadro(');
  assert.match(helper, /_despesas/,
    'a despesa saiu da preservacao: salvar uma nota apagaria todas do quadro');
  ['_records', '_vagas', '_talentos', '_colaboradores'].forEach(colecao => {
    assert.match(helper, new RegExp(colecao),
      colecao + ' saiu da preservacao');
  });

  const chamadas = APP.match(/(?<!function )_preservarRegistrosDoQuadro\(obj\)/g) || [];
  assert.equal(chamadas.length, 4,
    'os quatro gravadores do no das notas precisam preservar o que nao e nota');
});

test('o listener separa a despesa, e a solta ao trocar de quadro', () => {
  const fn = recortar('function loadRecords(');
  assert.match(fn, /if \(_ehDespesa\(r\)\) \{/);
  assert.match(fn, /_despesas = \[\];/,
    'despesa do quadro anterior ficaria somando no novo');
});

/* ── As contas ──────────────────────────────────────────────────────────── */

test('o mes da despesa e o do LANCAMENTO, e nao o da criacao', () => {
  /* Uma conta de julho lancada em agosto pertence a julho, e e assim que ela
     tem de entrar no resultado de julho. */
  const ctx = montar([
    desp('a', 100, '2026-07-30'),
    desp('b', 200, '2026-08-02'),
  ]);
  assert.equal(ctx._despesaTotalDoMes('2026-07'), 100);
  assert.equal(ctx._despesaTotalDoMes('2026-08'), 200);
  assert.equal(ctx._despesaTotalDoMes('2026-09'), 0);
});

test('o resultado usa a receita RECEBIDA, e nao a contratada', () => {
  /* Resultado com receita a receber e lucro que ainda nao existe. */
  const ctx = montar([desp('a', 300, '2026-08-10')], [
    { id: 'r1', value: 1000, status: 'paid', dueDate: '2026-08-05' },
    { id: 'r2', value: 5000, status: 'pending', dueDate: '2026-08-20' },
    { id: 'r3', value: 1000, status: 'partial', paidAmount: 400, dueDate: '2026-08-25' },
  ]);
  assert.equal(ctx._receitaRecebidaNoMes('2026-08'), 1400,
    'o que ainda nao entrou nao pode contar como receita');
  assert.equal(ctx._despesaTotalDoMes('2026-08'), 300);
});

test('a normalizacao poe teto e piso no que vem da tela', () => {
  const ctx = vm.createContext({
    Number, String, Math, Object,
    _crmTodayLocalIso: () => '2026-08-05',
  });
  vm.runInContext('const DESPESA_CATEGORIAS = ' +
    APP.slice(APP.indexOf('const DESPESA_CATEGORIAS = [') + 'const DESPESA_CATEGORIAS = '.length,
              APP.indexOf('];', APP.indexOf('const DESPESA_CATEGORIAS = [')) + 2), ctx);
  vm.runInContext(recortar('function _despesaNormalizar('), ctx);
  const n = ctx._despesaNormalizar({ descricao: '  x  ', valor: -5, categoria: 'inventada', data: 'xx' });
  assert.equal(n.descricao, 'x');
  assert.equal(n.valor, 0, 'valor negativo viraria receita disfarcada');
  assert.equal(n.categoria, 'outros', 'categoria fora da lista cai no balde generico');
  assert.equal(n.data, '2026-08-05', 'data invalida vira hoje, e nao string torta');
});

/* ── A tela ─────────────────────────────────────────────────────────────── */

test('a tela mostra entrou, saiu e sobrou — nesta ordem', () => {
  /* E a ordem em que a pergunta se faz, e "sobrou" e o unico dos tres que
     nao existia em lugar nenhum do app. */
  const fn = recortar('function _pintarDespesas(');
  const iIn = fn.indexOf('app.expIn');
  const iOut = fn.indexOf('app.expOut');
  const iLeft = fn.indexOf('app.expLeft');
  assert.ok(iIn > 0 && iIn < iOut && iOut < iLeft, 'a ordem dos numeros mudou');
  assert.match(fn, /app\.expMargin/);
  // Resultado negativo precisa saltar aos olhos.
  assert.match(fn, /sobrou < 0 \? 'flx-vermelho' : 'dsp-verde'/);
});

test('o mes e navegavel, porque despesa se lanca depois', () => {
  /* A conta de julho chega em agosto, e quem lanca precisa voltar ao mes a
     que ela pertence. */
  assert.match(APP, /function _despMover\(passo\)/);
  const fn = recortar('function _despMover(');
  assert.match(fn, /const ano = a \+ Math\.floor\(t \/ 12\)/, 'a virada de ano tem de andar junto');
});

test('o botao existe e a folha tem estilo', () => {
  assert.match(HTML, /id="crm-btn-despesas"/);
  assert.match(APP, /crm-btn-despesas'\)\?\.addEventListener\('click', crmAbrirDespesas\)/);
  assert.match(CSS, /\.dsp-modal\{/);
  assert.match(CSS, /\.dsp-item\{/);
});

test('as despesas do quadro nao sao as do painel pessoal', () => {
  /* Elas sao de outra natureza e de outro dono: as pessoais moram em
     users/{uid}/personal/expenses e sao da PESSOA. Puxa-las para ca
     misturaria a conta de casa com a do negocio e, num quadro de grupo,
     mostraria os gastos pessoais de quem criou para todos os socios. */
  const fn = recortar('async function criarDespesa(');
  assert.match(fn, /_recBasePath\(\)/, 'a despesa do quadro tem de morar no quadro');
  assert.equal(/_personalPath/.test(fn), false,
    'voltou a gravar no caminho pessoal, que e por usuario e nao por quadro');
  assert.match(fn, /type: 'despesa'/);
  assert.match(fn, /'crm_desp_'/);
});
