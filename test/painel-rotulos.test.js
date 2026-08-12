'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   OS ROTULOS DO PAINEL SEGUEM O MODELO ATIVO
   ═══════════════════════════════════════════════════════════════════════
   Os quatro cartoes do topo do CRM sao os MESMOS elementos nos dois
   modelos — o financeiro e o de recrutamento apenas reescrevem o texto.
   MD_RH.renderKPIs punha "Candidatos / Entrevistas marcadas / Em processo /
   Taxa de contratacao"; voltar ao financeiro trocava os NUMEROS e deixava
   os rotulos de recrutamento no lugar.

   E o pior tipo de erro de painel: rotulo de recrutamento com numero de
   dinheiro, os dois plausiveis. "Taxa de contratacao: R$ 1.998,96" nao
   parece quebrado, parece um dado — e alguem toma decisao com ele.

   A regra que esta varredura fixa: quem escreve rotulo tem de repor o seu,
   sempre. Nenhum dos dois pode confiar no que estava no HTML.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
const RH = fs.readFileSync(path.join(ROOT, 'docs/js/rh.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'docs/js/i18n.js'), 'utf8');

const IDS = ['crm-kpi-lbl-1', 'crm-kpi-lbl-2', 'crm-kpi-lbl-3', 'crm-kpi-lbl-4'];

function corpo(fonte, nome) {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

test('os quatro cartoes existem uma vez so, compartilhados pelos dois modelos', () => {
  IDS.forEach(id => {
    const n = (HTML.match(new RegExp('id="' + id + '"', 'g')) || []).length;
    assert.equal(n, 1, `${id} deveria aparecer uma vez no index.html`);
  });
});

test('o recrutamento escreve os quatro rotulos', () => {
  const kpis = corpo(RH, 'function renderKPIs(');
  IDS.forEach(id => assert.ok(kpis.includes(id), `renderKPIs nao escreve ${id}`));
});

test('o financeiro REPOE os quatro — nao herda o que ficou na tela', () => {
  const painel = corpo(APP, 'function updateCRMDashboard(');

  /* Tem de estar DEPOIS do return do ramo de recrutamento: repor antes seria
     escrever e deixar o RH sobrescrever em seguida. */
  const iReturn = painel.indexOf('return;');
  IDS.forEach(id => {
    const iRotulo = painel.indexOf(id);
    assert.ok(iRotulo > -1, `o financeiro nao repoe ${id}`);
    assert.ok(iRotulo > iReturn, `${id} e reposto antes do ramo de recrutamento sair`);
  });
});

test('os rotulos do financeiro existem nos tres idiomas', () => {
  ['app.receivedMonth', 'app.receivable', 'app.clients', 'app.averageTicket']
    .forEach(k => assert.ok(I18N.includes(`'${k}':`), `falta ${k} no catalogo`));

  /* Trocar de modelo redesenha o painel inteiro; se o texto viesse so do
     HTML estatico, ele voltaria em portugues para quem usa outro idioma. */
  const painel = corpo(APP, 'function updateCRMDashboard(');
  assert.match(painel, /_appText\('app\.receivedMonth'/);
  assert.match(painel, /_appText\('app\.averageTicket'/);
});

test('cada modelo tem a sua cor no heroi', () => {
  /* Os tres nasceram do mesmo heroi e ficaram com o mesmo verde-teal: trocar
     de modelo mudava os numeros e a tabela, e a faixa de cima continuava
     identica — o que faz a pessoa duvidar se a troca aconteceu. A cor e o
     sinal mais rapido de "voce mudou de lugar", e chega antes do rotulo. */
  const CSS = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'docs/css/main.css'), 'utf8');
  const financeiro = CSS.slice(CSS.indexOf('.cdash-hero{position:relative'),
                               CSS.indexOf('#crm-view.rh-modelo .cdash-hero{'));
  const recrutamento = CSS.slice(CSS.indexOf('#crm-view.rh-modelo .cdash-hero{'),
                                 CSS.indexOf('.cdash-hero-title{'));
  assert.match(financeiro, /#3730a3/, 'o financeiro perdeu o indigo');
  assert.match(recrutamento, /#6d28d9/, 'o recrutamento perdeu o violeta');
  /* E nenhum dos dois volta ao teal, que agora e do modelo de Clientes. */
  assert.equal(/#0e8b84|#0c6b5f/.test(financeiro + recrutamento), false,
    'algum modelo voltou para o teal');
  assert.match(CSS, /#cli-view\{--cli-teal:#22d3ee/);
});
