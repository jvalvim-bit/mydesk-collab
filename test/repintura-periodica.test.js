'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O PAINEL NAO PODE SE REDESENHAR SOZINHO
   ═══════════════════════════════════════════════════════════════════════
   A checagem de prazos roda de minuto em minuto — ela precisa rodar, porque
   um pagamento vira "atrasado" pela meia-noite passar, sem ninguem mexer em
   nada. O problema era ela mandar repintar o painel SEMPRE, mudando alguma
   coisa ou nao.

   Isso nao e invisivel: os numeros dos cartoes sao animados, entao a cada
   sessenta segundos eles voltavam a zero e subiam de novo, e o funil do
   recrutamento se redesenhava junto. Na tela, le-se como "a pagina
   recarregou sozinha" — e quem estava lendo perde o lugar.
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

function montar(registros) {
  const feito = { painel: 0, clientes: 0, avisos: [] };
  const ctx = vm.createContext({
    _records: registros,
    isOverdue: r => !!r.atrasado,
    updateCRMDashboard: () => { feito.painel++; },
    crmModeloClientes: () => false,
    playOverdueAlertSound: () => {},
    toast: (i, t) => feito.avisos.push(t),
    _flashOverdueEl: () => {},
    document: { querySelector: () => null },
    _overdueTrack: { records: { init: false, set: new Set() } },
    window: {}, console, Set, Array, Number, String,
  });
  /* No navegador, `window.MD_CLI` e `MD_CLI` sao o mesmo: propriedade de
     window E binding global. Aqui os dois precisam ser postos a mao. */
  const md = { atualizar: () => { feito.clientes++; } };
  ctx.window.MD_CLI = md;
  ctx.MD_CLI = md;
  vm.runInContext(recortar('function _handleOverdueTransition('), ctx);
  vm.runInContext(recortar('function checkCRMOverdueTransitions('), ctx);
  return { ctx, feito };
}

test('a primeira passada desenha, e as seguintes NAO', () => {
  const { ctx, feito } = montar([{ id: 'a', name: 'X', atrasado: false }]);
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 1, 'a primeira passada tem de preencher a tela');
  ctx.checkCRMOverdueTransitions();
  ctx.checkCRMOverdueTransitions();
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 1, 'o painel se redesenhou sem nada ter mudado');
});

test('quando alguem VIRA atrasado, ai sim redesenha', () => {
  /* E a unica coisa que muda so pelo tempo passar. */
  const registros = [{ id: 'a', name: 'X', atrasado: false }];
  const { ctx, feito } = montar(registros);
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 1);

  registros[0].atrasado = true;          // cruzou a meia-noite
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 2, 'nao redesenhou quando o atraso apareceu');
  assert.equal(feito.avisos.length, 1, 'nao avisou de quem atrasou');

  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 2, 'voltou a redesenhar sem mudanca');
});

test('quem deixa de estar atrasado tambem conta como mudanca', () => {
  /* Pagou: o cartao de atrasados tem de baixar na hora, e nao no proximo
     clique. */
  const registros = [{ id: 'a', name: 'X', atrasado: true }];
  const { ctx, feito } = montar(registros);
  ctx.checkCRMOverdueTransitions();
  registros[0].atrasado = false;
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 2);
});

test('no modelo de clientes, quem repinta e a tela de clientes', () => {
  /* Mandar `updateCRMDashboard` ali seria desenhar cartoes que estao
     escondidos, e deixar a carteira parada. */
  const registros = [{ id: 'a', name: 'X', atrasado: false }];
  const { ctx, feito } = montar(registros);
  /* A troca tem de ser DENTRO do contexto: reatribuir a propriedade do objeto
     daqui nao alcanca a funcao que ja foi compilada la. */
  vm.runInContext('crmModeloClientes = () => true;', ctx);
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.clientes, 1);
  assert.equal(feito.painel, 0);
});

test('carteira vazia nao faz nada', () => {
  const { ctx, feito } = montar([]);
  ctx.checkCRMOverdueTransitions();
  assert.equal(feito.painel, 0);
});

test('a checagem continua rodando de minuto em minuto', () => {
  /* O conserto e nao repintar a toa — e nao parar de olhar o relogio. */
  assert.match(APP, /remTmr=setInterval\(checkReminders,60000\)/);
  assert.match(recortar('function checkReminders('), /checkCRMOverdueTransitions\(\)/);
});
