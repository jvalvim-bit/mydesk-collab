'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   FLUXO DE CAIXA PROJETADO
   ═══════════════════════════════════════════════════════════════════════
   "A receber" era um número só. Ele responde "quanto me devem" e não
   responde a pergunta que se faz de verdade — "dá para pagar as contas em
   setembro?". Dois clientes de R$ 24 mil vencendo em novembro e dois
   vencendo semana que vem dão o mesmo número e são situações opostas.

   O que este arquivo cobra é o que a projeção não pode esconder: o que já
   venceu, o que não tem data, e o que cai depois da última semana. Uma
   projeção que perde qualquer um dos três é otimista por construção.
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

function montar(registros, hoje = '2026-08-05', passo = 'semanal') {
  const ctx = vm.createContext({
    Date, Number, String, Math, Array, Object,
    _crmTodayLocalIso: () => hoje,
    _registrosFinanceiros: () => registros,
    _crmRecebido: r => (r.status === 'paid' ? Number(r.value) || 0
      : r.status === 'partial' ? Math.min(Math.max(Number(r.paidAmount) || 0, 0), Number(r.value) || 0)
      : 0),
  });
  ctx._crmAReceber = r => Math.max(0, (Number(r.value) || 0) - ctx._crmRecebido(r));
  vm.runInContext(APP.slice(APP.indexOf('const FLUXO_PASSOS = ['),
                            APP.indexOf('const FLUXO_SEMANAS = 12;') + 25), ctx);
  vm.runInContext('_fluxoPasso = ' + JSON.stringify(passo) + ';', ctx);
  vm.runInContext(recortar('function _crmSomarPeriodo('), ctx);
  vm.runInContext(recortar('function _fluxoSegundaDe('), ctx);
  vm.runInContext(recortar('function _fluxoMaisDias('), ctx);
  vm.runInContext(recortar('function _fluxoPrimeiroDoMes('), ctx);
  vm.runInContext(recortar('function _fluxoFaixas('), ctx);
  vm.runInContext(recortar('function _fluxoProjetado('), ctx);
  return ctx;
}

const reg = (id, valor, venc, extra) => Object.assign(
  { id, name: 'C' + id, value: valor, dueDate: venc, status: 'pending' }, extra || {});

test('a semana comeca na segunda, sem passar por fuso', () => {
  /* `new Date('2026-08-05')` nasce em UTC: as 21h no Brasil ele ja e o dia
     seguinte, e a "ultima segunda" cairia no domingo anterior. */
  const ctx = montar([]);
  assert.equal(ctx._fluxoSegundaDe('2026-08-05'), '2026-08-03', 'quarta -> segunda');
  assert.equal(ctx._fluxoSegundaDe('2026-08-03'), '2026-08-03', 'segunda e ela mesma');
  assert.equal(ctx._fluxoSegundaDe('2026-08-09'), '2026-08-03', 'domingo pertence a semana que comecou');
  const fn = recortar('function _fluxoSegundaDe(');
  assert.equal(/new Date\(iso\)|new Date\(String/.test(fn), false,
    'voltou a construir Date a partir da string');
});

test('no passo semanal sao 12 colunas, e a primeira e a de hoje', () => {
  const d = montar([])._fluxoProjetado();
  assert.equal(d.semanas.length, 12);
  assert.equal(d.semanas[0].de, '2026-08-03');
  assert.equal(d.semanas[0].ate, '2026-08-09');
  assert.equal(d.semanas[1].de, '2026-08-10');
});

test('o que ja venceu entra na PRIMEIRA coluna, e nao some da conta', () => {
  /* Uma projecao que so olha para a frente esquece justamente o dinheiro
     que esta mais dificil de entrar. */
  const d = montar([reg('a', 5000, '2026-06-01')])._fluxoProjetado();
  assert.equal(d.semanas[0].vencido, 5000);
  assert.equal(d.semanas[0].aReceber, 0, 'vencido nao pode virar "a receber"');
  assert.equal(d.total, 5000);
});

test('vencido e a receber ficam separados na mesma semana', () => {
  /* Sao dinheiros com probabilidades diferentes: somados numa barra so, a
     primeira semana pareceria a melhor do trimestre. */
  const d = montar([
    reg('a', 1000, '2026-08-01'),   // venceu
    reg('b', 3000, '2026-08-07'),   // esta semana, a vencer
  ])._fluxoProjetado();
  assert.equal(d.semanas[0].vencido, 1000);
  assert.equal(d.semanas[0].aReceber, 3000);
});

test('o que vence hoje conta como a receber, e nao como vencido', () => {
  const d = montar([reg('a', 800, '2026-08-05')])._fluxoProjetado();
  assert.equal(d.semanas[0].aReceber, 800);
  assert.equal(d.semanas[0].vencido, 0);
});

test('sem data e depois do periodo saem em baldes proprios', () => {
  /* Esconder qualquer um dos dois faria a soma das barras nao bater com o
     "a receber" do painel — e ai um dos dois numeros esta mentindo. */
  const d = montar([
    reg('a', 2000, ''),
    reg('b', 7000, '2027-05-10'),
    reg('c', 500, '2026-08-20'),
  ])._fluxoProjetado();
  assert.equal(d.semData, 2000);
  assert.equal(d.depois, 7000);
  assert.equal(d.total, 500, 'so o que cabe no periodo entra no total');
});

test('quem ja pagou nao aparece, e o parcial aparece pelo que falta', () => {
  const d = montar([
    reg('a', 1000, '2026-08-12', { status: 'paid' }),
    reg('b', 1000, '2026-08-12', { status: 'partial', paidAmount: 300 }),
  ])._fluxoProjetado();
  assert.equal(d.semanas[1].aReceber, 700);
});

test('o acumulado soma coluna a coluna', () => {
  const d = montar([
    reg('a', 100, '2026-08-05'),
    reg('b', 200, '2026-08-12'),
    reg('c', 300, '2026-08-19'),
  ])._fluxoProjetado();
  assert.equal(d.semanas[0].acumulado, 100);
  assert.equal(d.semanas[1].acumulado, 300);
  assert.equal(d.semanas[2].acumulado, 600);
});

test('a tela diz que e projecao, e nao previsao', () => {
  /* Quem le um grafico de barras assume que o numero vai acontecer. */
  assert.match(APP, /app\.cashDisclaimer/);
  const fn = recortar('function _pintarFluxo(');
  assert.match(fn, /flx-aviso/);
  // Semana vazia e informacao, e nao ausencia dela.
  assert.match(fn, /app\.cashEmptyRanges/);
  assert.match(fn, /app\.cashNoDateNote/);
});

test('o botao existe e a semana corrente e marcada', () => {
  assert.match(HTML, /id="crm-btn-fluxo"/);
  assert.match(APP, /crm-btn-fluxo'\)\?\.addEventListener\('click', crmAbrirFluxo\)/);
  /* Sem marcar "agora", doze rotulos iguais nao dizem onde e o presente, e o
     grafico perde o unico ponto de referencia que tem. */
  assert.match(APP, /flx-rot\$\{i === 0 \? ' agora' : ''\}/);
  assert.match(CSS, /\.flx-rot\.agora\{/);
});

/* ═══════════════════════════════════════════════════════════════════════
   O PASSO E ESCOLHIDO
   ═══════════════════════════════════════════════════════════════════════
   Doze semanas fixas respondiam bem a uma pergunta so: "as proximas semanas
   apertam?". Quem tem contrato de dois anos precisa da outra — "como fica o
   ano que vem?" — e ali a semana e ruido: cem colunas de uma semana cada nao
   se leem.
   ═══════════════════════════════════════════════════════════════════════ */
test('mensal fecha o mes de primeiro a ultimo dia', () => {
  /* Uma faixa "mensal" que comecasse no dia 5 nunca casaria com o que o
     contador chama de agosto. */
  const d = montar([], '2026-08-05', 'mensal')._fluxoProjetado();
  assert.equal(d.semanas.length, 12);
  assert.equal(d.semanas[0].de, '2026-08-01');
  assert.equal(d.semanas[0].ate, '2026-08-31');
  assert.equal(d.semanas[1].de, '2026-09-01');
  assert.equal(d.semanas[1].ate, '2026-09-30');
});

test('trimestral, semestral e anual andam o que prometem', () => {
  const t = montar([], '2026-08-05', 'trimestral')._fluxoProjetado();
  assert.equal(t.semanas[0].de, '2026-08-01');
  assert.equal(t.semanas[0].ate, '2026-10-31');
  assert.equal(t.semanas[1].de, '2026-11-01');

  const s = montar([], '2026-08-05', 'semestral')._fluxoProjetado();
  assert.equal(s.semanas[0].ate, '2027-01-31');

  const a = montar([], '2026-08-05', 'anual')._fluxoProjetado();
  assert.equal(a.semanas[0].de, '2026-08-01');
  assert.equal(a.semanas[0].ate, '2027-07-31');
  assert.equal(a.semanas.length, 8, 'oito anos ja e mais do que qualquer contrato');
});

test('o passo maior alcanca o que o semanal deixava de fora', () => {
  /* Era a queixa: um contrato de 2029 caia inteiro em "depois das 12". */
  const registros = [reg('a', 7000, '2029-05-10')];
  assert.equal(montar(registros, '2026-08-05', 'semanal')._fluxoProjetado().depois, 7000);
  const anual = montar(registros, '2026-08-05', 'anual')._fluxoProjetado();
  assert.equal(anual.depois, 0, 'no passo anual ele tem de caber');
  assert.equal(anual.total, 7000);
});

test('o seletor de passo esta na tela, com o atual marcado', () => {
  assert.match(APP, /const FLUXO_PASSOS = \[/);
  assert.match(APP, /data-passo="\$\{p\.key\}"/);
  assert.match(APP, /_fluxoPasso = b\.dataset\.passo/);
  assert.match(CSS, /\.flx-passos button\.sel\{/);
  // Seis escolhas: semanal, mensal, bimestral, trimestral, semestral, anual.
  const lista = APP.slice(APP.indexOf('const FLUXO_PASSOS = ['),
                          APP.indexOf('let _fluxoPasso'));
  assert.equal((lista.match(/key: '/g) || []).length, 6);
});

test('o rotulo da coluna muda com o passo', () => {
  /* Repetir "01/01-31/12" em oito colunas seria escrever muito para dizer
     pouco. */
  const fn = recortar('function _fluxoRotuloSemana(');
  assert.match(fn, /_fluxoPasso === 'semanal'/);
  assert.match(fn, /_fluxoPasso === 'anual'/);
  assert.match(fn, /_fluxoPasso === 'mensal'/);
});
