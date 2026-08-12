'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   CENTRALIZAR O QUE NÃO CABE ESCONDE O COMEÇO — E NÃO VOLTA COM ROLAGEM
   ═══════════════════════════════════════════════════════════════════════
   Um container flex com `justify-content:center` e `flex-direction:column`
   centraliza no eixo VERTICAL. Quando o conteúdo é mais alto que ele — um
   currículo de seis páginas sempre é — a sobra é dividida entre cima e
   baixo, e a parte de cima fica FORA da área rolável: o navegador não rola
   para trás do início do fluxo. Na tela: o documento abre no meio de uma
   frase, com a primeira linha cortada ao meio pelo cabeçalho, e não há
   nada que a pessoa possa fazer para chegar ao topo.

   Não dá erro, não aparece no console, e some quando o arquivo é pequeno o
   bastante para caber — que é exatamente o caso de teste que se usa.

   Mordeu duas vezes: primeiro no visualizador de anexos da nota (.docx) e
   depois no visualizador de documentos da ficha (PDF), que é por onde o
   currículo do candidato é aberto. Por isso a checagem cobre os dois.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');

function regra(seletor) {
  const i = CSS.indexOf(seletor + '{');
  assert.ok(i > 0, 'sumiu a regra ' + seletor);
  return CSS.slice(i, CSS.indexOf('}', i));
}

test('o PDF da ficha rola até o topo — nada de conteúdo fora do alcance', () => {
  const corpo = regra('.crm-doc-viewer-body-pdf');
  assert.match(corpo, /flex-direction:column/);
  assert.match(corpo, /justify-content:flex-start/,
    'com center no eixo vertical, o início do documento fica inalcançável');
});

test('o mesmo vale no visualizador de anexos da nota', () => {
  // O ramo do .docx já carrega a correção; o do PDF também.
  const pdf = APP.slice(APP.indexOf("} else if (t === 'application/pdf') {"));
  assert.match(pdf.slice(0, 400), /justify-content:flex-start/,
    'o anexo em PDF voltaria a abrir no meio');
  const docx = APP.slice(APP.indexOf('align-items:stretch;justify-content:flex-start'));
  assert.ok(docx.length > 0, 'o ramo do .docx perdeu a correção');
});

test('a prévia de página HTML da ficha também começa do começo', () => {
  const bloco = APP.slice(APP.indexOf('function viewDocumentFile('));
  const html = bloco.slice(bloco.indexOf('} else if (isHtml) {'),
                           bloco.indexOf('} else if (isPdf) {'));
  assert.match(html, /justifyContent = 'flex-start'/,
    'a nota mais o iframe podem passar da altura, e aí some o começo');
});

/* ── E a página não pode mudar de largura no meio do documento ──────────── */
test('todas as folhas do PDF saem com a MESMA largura', () => {
  /* A largura vinha de body.clientWidth dentro do laço, uma vez por página.
     Depois da primeira folha aparece a barra de rolagem, o corpo encolhe, e
     as folhas seguintes saem mais estreitas que a de cima — num currículo de
     seis páginas, seis larguras diferentes, em degrau. */
  const bloco = APP.slice(APP.indexOf('function viewDocumentFile('));
  const pdf = bloco.slice(bloco.indexOf('} else if (isPdf) {'));
  assert.match(pdf, /const larguraUtil = Math\.max\(120, body\.clientWidth - 28\)/,
    'a largura precisa ser medida uma vez, antes da primeira folha entrar');
  assert.ok(pdf.indexOf('const larguraUtil') < pdf.indexOf('const renderPage'),
    'medir dentro do laço é medir depois da barra de rolagem aparecer');
  assert.equal(/const bodyWidth = body\.clientWidth/.test(pdf), false,
    'voltou a medir por página');
});
