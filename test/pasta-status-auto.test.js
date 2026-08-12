'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MARCAR O STATUS TEM DE LEVAR A NOTA PARA A PASTA
   ═══════════════════════════════════════════════════════════════════════
   O roteamento so acontecia quando o status MUDAVA. Isso deixava um buraco:
   nota que ja chegou com o status — criada assim, sincronizada do 1:1, ou
   marcada quando a pasta ainda nao existia — nunca tinha sido roteada, e
   clicar no estado que ela ja tinha nao fazia nada. Na tela: marcar
   "Andamento" nao movia; era preciso marcar "A fazer" e voltar para
   "Andamento" para o app enxergar uma mudanca.

   A pergunta certa nao e "mudou?", e "esta onde deveria estar?".

   O caso que a regra antiga protegia continua protegido, mas por um
   mecanismo que diz o que e: quem arranca a nota da pasta a mao liga
   `foraDePasta`, e ela nao volta sozinha.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');

test('reconfirmar o status tambem roteia para a pasta', () => {
  const i = APP.indexOf("row.className = 'n-status-opt'");
  assert.ok(i > 0, 'sumiu o menu de status');
  const menu = APP.slice(i, i + 2600);
  assert.match(menu, /antes !== opt\.key \|\| !n\.foraDePasta/,
    'voltou a rotear so quando o status muda');
  // Mudar de estado e intencao nova: a marca de "fora" cai.
  assert.match(menu, /if \(antes !== opt\.key\) n\.foraDePasta = false;/);
});

test('tirar a nota da pasta a mao marca a decisao, e ela viaja com a nota', () => {
  const i = APP.indexOf('.stack-card-row-unstack');
  assert.ok(i > 0);
  assert.match(APP.slice(i, i + 700), /n\.foraDePasta = true;/,
    'sem a marca, o proximo clique de status devolve a nota para a pasta');
  /* Sem viajar na nota, a decisao valeria so ate a proxima carga da pagina. */
  const raw = APP.slice(APP.indexOf('function _noteToRaw('),
                        APP.indexOf('function _noteToRaw(') + 1400);
  assert.match(raw, /foraDePasta: n\.foraDePasta \|\| false/);
});

test('entrar numa pasta desliga a marca', () => {
  const fn = APP.slice(APP.indexOf('function _moveNoteIntoStack('),
                       APP.indexOf('function _moveNoteIntoStack(') + 400);
  assert.match(fn, /n\.foraDePasta = false;/);
});

/* ═══════════════════════════════════════════════════════════════════════
   SAIR DA PASTA NAO PODE DEIXAR A NOTA AMASSADA
   ═══════════════════════════════════════════════════════════════════════
   O teto de altura sai da posicao da nota — e o espaco que sobra abaixo
   dela ate o rodape da janela — e ficava fixado com o `y` de antes de ela
   entrar na pasta. Saindo, ela ganhava um `y` novo e mantinha o teto velho:
   se o antigo era la embaixo, reaparecia espremida em poucos pixels. Nada
   no console, nada errado nos dados; so um F5 consertava, porque a
   montagem recalcula.
   ═══════════════════════════════════════════════════════════════════════ */
test('sair da pasta recalcula o teto de altura da nota', () => {
  const fn = APP.slice(APP.indexOf('function unstackNote('),
                       APP.indexOf('function unstackNote(') + 1600);
  assert.match(fn, /_limitarAlturaNota\(el, n\)/,
    'a nota volta ao quadro com o teto de altura da posicao antiga');
  // E depois de o y novo ter sido definido, senao recalcula com o valor velho.
  assert.ok(fn.indexOf('n.y = r.top') < fn.indexOf('_limitarAlturaNota(el, n)'),
    'o teto esta sendo recalculado antes de a posicao nova existir');
});
