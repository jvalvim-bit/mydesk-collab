'use strict';
/* Duas melhorias da videochamada, pedidas na checklist da nota
   "Feature - Melhorar chamada de vídeo":
     · o formato da janela (compacta, deitada, em pé, tela cheia);
     · o segundo plano — a chamada seguir viva fora da tela dela.

   As duas guardam preferência no navegador e as duas mexem numa janela que
   também pode ser redimensionada com a quina — é dessa convivência que saem
   os erros silenciosos, e é isso que estas varreduras seguram. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const ler = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8').split('\r\n').join('\n');
const app = ler('docs/js/app.js');
const html = ler('docs/index.html');
const css = ler('docs/css/main.css');
const handlers = ler('docs/js/handlers-app.js');

function corpo(assinatura, tamanho = 2200) {
  const i = app.indexOf(assinatura);
  assert.ok(i > -1, 'não encontrei: ' + assinatura);
  return app.slice(i, i + tamanho);
}

test('os dois botões estão na barra e ligados sem on*= no HTML', () => {
  ['call-btn-formato', 'call-btn-pip'].forEach(id => {
    const tag = new RegExp('<button id="' + id + '"[^>]*>').exec(html);
    assert.ok(tag, 'botão ausente: ' + id);
    assert.doesNotMatch(tag[0], /\son[a-z]+=/, 'handler inline não roda sob a CSP do site');
    const h = /data-h="([^"]+)"/.exec(tag[0]);
    assert.ok(h, id + ' sem data-h');
    assert.ok(handlers.includes(`['${h[1]}'`), 'data-h sem handler: ' + h[1]);
  });
  assert.match(handlers, /alternarFormatoChamada\(\)/);
  assert.match(handlers, /alternarPipChamada\(\)/);
});

test('o formato vence o tamanho arrastado à mão', () => {
  /* Redimensionar com a quina grava width/height no style do elemento, e
     style ganha de classe. Sem limpar o style e sem `!important` no CSS,
     escolher um formato depois de ter arrastado a quina não faria efeito —
     e pareceria botão quebrado. */
  const fn = corpo('function aplicarFormatoChamada(');
  assert.match(fn, /ov\.style\.width = ''/);
  assert.match(fn, /ov\.style\.height = ''/);
  assert.match(css, /#call-overlay\.call-fmt-horizontal\{width:[^;]*!important/);
  assert.match(css, /#call-overlay\.call-fmt-cheia\{[^}]*resize:none !important/);
});

test('abrir a chamada não apaga o tamanho de quem arrastou a quina', () => {
  /* As duas memórias convivem: quem arrasta recupera o tamanho exato; quem
     escolheu "tela cheia" abre em tela cheia. O formato só sobrescreve quando
     foi escolha explícita — 'compacta' é o padrão, e padrão não manda. */
  const abre = corpo('function openCallOverlay(', 1400);
  assert.match(abre, /_restoreCallGeom\(overlay\)/);
  const ondeRestaura = abre.indexOf('_restoreCallGeom(overlay)');
  const ondeFormato = abre.indexOf('aplicarFormatoChamada(formato)');
  assert.ok(ondeRestaura < ondeFormato, 'o formato precisa ser aplicado DEPOIS da geometria');
  assert.match(abre, /_callPintarBotaoFormato\('compacta'\)/,
    "o padrão voltou a chamar aplicarFormatoChamada e apaga o tamanho arrastado");
});

test('o ciclo passa pelos quatro formatos e volta ao começo', () => {
  const lista = /const CALL_FORMATOS = \[([^\]]+)\]/.exec(app);
  assert.ok(lista, 'a lista de formatos sumiu');
  const nomes = lista[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepEqual(nomes, ['compacta', 'horizontal', 'vertical', 'cheia']);
  const alterna = corpo('function alternarFormatoChamada(', 500);
  assert.match(alterna, /% CALL_FORMATOS\.length/, 'o ciclo não volta ao começo');
  // Cada formato precisa de regra própria, senão o botão cicla sem efeito.
  nomes.slice(1).forEach(f => assert.ok(css.includes('#call-overlay.call-fmt-' + f),
    'formato sem CSS: ' + f));
});



test('o formato escolhido sobrevive à próxima chamada', () => {
  assert.match(app, /const LS_CALL_FORMATO = /);
  // localStorage pode lançar (cota, modo privado) e não pode derrubar a chamada.
  assert.match(corpo('function _callFormatoSalvo(', 400), /catch/,
    'sem proteção contra localStorage indisponível');
});

/* ── SEGUNDO PLANO: a chamada seguir viva fora da tela dela ──────────────
   "Outra coisa" tem três significados, e cada um quebra de um jeito:
   outra parte do app (a janela já flutuava), outro aplicativo ou outra aba
   (Picture-in-Picture), e a tela do celular apagando (Wake Lock).

   O que NÃO dá, e o código não pode fingir que dá: aba fechada encerra a
   chamada. Página da web não roda depois de fechada. */

test('a janela flutuante existe e sai de cena junto com a chamada', () => {
  const pip = corpo('async function alternarPipChamada(', 1800);
  assert.match(pip, /requestPictureInPicture\(\)/);
  assert.match(pip, /document\.pictureInPictureElement/,
    'sem checar o estado, o botão só liga e nunca desliga');
  assert.match(pip, /pictureInPictureEnabled/,
    'navegador sem janela flutuante precisa ser avisado, não quebrar');

  /* Encerrar a chamada tem de fechar a janelinha. Senão ela fica na tela
     tocando um vídeo que não existe mais, e não há botão nosso ali. */
  const fecha = corpo('function closeCallOverlay(', 900);
  assert.match(fecha, /exitPictureInPicture\(\)/);
});

test('a janela flutuante mostra o outro, não você', () => {
  /* Mandar a própria imagem para a janelinha seria mostrar justamente quem
     não precisa ser visto — e só se percebe usando. */
  const escolhe = corpo('function _callVideoParaPip(', 900);
  assert.match(escolhe, /\.focused video/, 'quem está em foco perdeu a prioridade');
  assert.match(escolhe, /:not\(\.local\)/, 'o vídeo local voltou a ganhar do remoto');
  assert.match(escolhe, /videoWidth > 0/,
    'sem conferir se há imagem, a janelinha abre preta numa chamada só de áudio');
});

test('a tela não apaga durante a chamada, e o bloqueio é devolvido', () => {
  const segura = corpo('async function _callSegurarTela(', 900);
  assert.match(segura, /wakeLock/);
  assert.match(segura, /catch/, 'navegador sem wakeLock não pode derrubar a chamada');
  /* O sistema solta o bloqueio quando a aba vai para segundo plano; ao voltar
     é preciso pedir de novo, senão a tela apaga na segunda vez. */
  assert.match(app, /visibilitychange[\s\S]{0,320}_callSegurarTela\(\)/);
  assert.match(corpo('function closeCallOverlay(', 900), /_callSoltarTela\(\)/,
    'a tela ficaria acesa para sempre depois de desligar');
});

test('o áudio não depende de nada disso, e o código diz por quê', () => {
  /* Se alguém achar que o PiP é o que mantém a chamada viva, vai "consertar"
     o áudio em segundo plano mexendo no lugar errado. */
  const bloco = app.slice(app.indexOf('CHAMADA EM SEGUNDO PLANO'),
                          app.indexOf('CHAMADA EM SEGUNDO PLANO') + 1800);
  assert.match(bloco, /WebRTC continua transmitindo/);
  assert.match(bloco, /ABA for fechada/,
    'o limite real da plataforma precisa estar escrito onde se mexe nisso');
});
