'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   NOTA ALTA NÃO PODE SAIR DA TELA
   ═══════════════════════════════════════════════════════════════════════
   A nota é position:fixed e o body é overflow:hidden. Sem teto de altura,
   escolher um modelo de nicho com muitos campos empurrava o fim da ficha
   para FORA do viewport — e não existia rolagem nenhuma capaz de alcançá-lo:
   nem a da página (o body não rola), nem a da nota (ela não rolava).

   O detalhe que fechava a armadilha: a alça de redimensionar mora no canto
   inferior da nota. Saindo a nota da tela, a alça ia junto — então nem
   ENCOLHER para ver o resto era possível. O único caminho de saída estava
   exatamente dentro da parte que havia sumido.

   Duas metades, e as duas precisam continuar existindo:
     · o teto em pixels, calculado no JS porque depende de onde a nota está;
     · a rolagem na .n-expand-area, e NÃO na nota — se a nota rolasse, a alça
       (absolute em relação a ela) desceria com o conteúdo e sumiria de novo.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'docs/css/main.css'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu do app.js: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

/* Última declaração da propriedade vence, como no navegador. */
function valorDe(seletor, prop) {
  const re = new RegExp(seletor.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  let m, achado = null;
  while ((m = re.exec(CSS))) {
    const d = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(m[1]);
    if (d) achado = d[1].trim();
  }
  return achado;
}

/* A função real, rodando fora do navegador. */
function montarTeto({ innerHeight = 900, retrato = false } = {}) {
  const ctx = vm.createContext({
    window: { innerHeight },
    _layoutRetratoAtivo: () => retrato,
  });
  vm.runInContext(recortar('function _limitarAlturaNota('), ctx);
  return ctx._limitarAlturaNota;
}

function elemento() {
  return { style: {}, getBoundingClientRect: () => ({ top: 0 }) };
}

test('a nota nunca passa do rodapé da tela', () => {
  const limitar = montarTeto({ innerHeight: 900 });

  const el = elemento();
  limitar(el, { y: 100 });
  assert.equal(el.style.maxHeight, '788px', '900 - 100 - 12 de respiro');

  /* Numa janela baixa — Mac de 13" fora de tela cheia — o teto acompanha. */
  const baixa = montarTeto({ innerHeight: 500 });
  const el2 = elemento();
  baixa(el2, { y: 100 });
  assert.equal(el2.style.maxHeight, '388px');
});

test('nota largada quase no rodapé ainda mostra alguma coisa', () => {
  /* Sem piso, o teto tenderia a zero e a nota sumiria de outro jeito — o
     conserto viraria um segundo bug. */
  const limitar = montarTeto({ innerHeight: 900 });
  const el = elemento();
  limitar(el, { y: 880 });
  assert.equal(el.style.maxHeight, '160px');
});

test('em retrato o teto sai de cena', () => {
  /* Ali a nota é position:relative numa coluna que já rola sozinha; limitar
     a altura só cortaria conteúdo sem motivo. */
  const limitar = montarTeto({ innerHeight: 900, retrato: true });
  const el = elemento();
  el.style.maxHeight = '400px';
  limitar(el, { y: 100 });
  assert.equal(el.style.maxHeight, '', 'o teto anterior precisa ser removido');
});

test('sem y conhecido, mede o elemento em vez de desistir', () => {
  const limitar = montarTeto({ innerHeight: 900 });
  const el = { style: {}, getBoundingClientRect: () => ({ top: 300 }) };
  limitar(el, {});
  assert.equal(el.style.maxHeight, '588px');
});

test('quem rola é a área expansível, não a nota', () => {
  assert.match(String(valorDe('.n-expand-area', 'overflow-y')), /auto/,
    'sem rolagem aqui, o fim da ficha continua inalcançável');

  /* A nota fixada tem `overflow:visible !important` para garantir o
     max-height:none; o eixo vertical precisa voltar a rolar mesmo assim. */
  assert.match(CSS, /\.note\.pinned \.n-expand-area\{overflow-y:auto ?!important;?\}/,
    'nota fixada voltaria a cortar o conteúdo');

  /* Se a NOTA rolasse, a alça — absolute em relação a ela — desceria junto
     com o conteúdo e sairia de alcance outra vez. */
  const resize = recortar('  if (resizeHandle) {', '\n  }');
  assert.equal(/overflowY/.test(resize), false,
    'a nota voltou a ser o elemento que rola');
  assert.equal(/'height:'\+_nh\+'px;overflow-y:auto;'/.test(APP), false,
    'a nota redimensionada voltou a rolar sozinha');
});

test('o teto é reaplicado sempre que a altura disponível muda', () => {
  // Ao montar.
  assert.match(recortar('function mountNote('), /_limitarAlturaNota\(el, n\)/,
    'nota nasce sem teto e já pode nascer fora da tela');

  // Ao arrastar: mudou de altura na tela, mudou o espaço abaixo dela.
  assert.match(recortar('function endDrag('), /_limitarAlturaNota\(drag\.el, drag\.n\)/);

  // Ao mexer na janela: vale para todas de uma vez.
  const resize = APP.slice(APP.indexOf("window.addEventListener('resize'"));
  assert.match(resize.slice(0, 500), /_limitarAlturaDeTodasAsNotas\(\)/);

  // Quando o colega move a nota, ela precisa caber na MINHA tela.
  assert.match(recortar('function _aplicarNotaRemota('), /_limitarAlturaNota\(el, n\)/);
});

test('a alça de redimensionar é alvo grande e não some no meio do gesto', () => {
  assert.equal(valorDe('.n-resize', 'width'), '26px',
    '18px num canto é alvo pequeno demais');

  /* A alça só aparece no hover da nota: arrastando rápido, o ponteiro sai da
     nota e ela sumia debaixo do cursor que já a segurava. */
  assert.match(CSS, /\.note\.resizing \.n-resize\{opacity:1;?\}/);
  const inicio = recortar('  if (resizeHandle) {', '\n  }');
  assert.match(inicio, /classList\.add\('resizing'\)/);
  assert.match(inicio, /classList\.remove\('resizing'\)/);
});

test('a ficha do modelo aparece UMA vez, e dentro da area que rola', () => {
  /* Havia dois desenhos dos mesmos campos: o resumo somente-leitura logo
     abaixo do corpo, e o formulario do modelo mais abaixo. Cada campo
     preenchido crescia a nota em dobro.

     O que virava travamento: o resumo mora no bloco de CIMA, que nao rola,
     enquanto formulario, checklist, anexos e comentarios vivem na
     .n-expand-area, que rola. Quanto mais campos, mais o resumo espremia a
     area rolavel — ate sobrar zero, e a nota mostrar so a lista de leitura,
     sem jeito de alcancar checklist nem anexo. */
  /* Le o codigo SEM comentarios: o comentario que explica a remocao cita o
     nome do que foi removido, e nao pode ser confundido com a volta dele. */
  const codigo = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/_pintarResumoFicha/.test(codigo), false,
    'o resumo duplicado voltou — cada campo preenchido cresce a nota em dobro');
  assert.equal(/n-ficha-resumo/.test(codigo), false, 'sobrou o bloco do resumo');
  assert.equal(/\.n-ficha-resumo\s*\{/.test(CSS), false, 'sobrou o estilo do resumo');

  // O formulario continua existindo, e continua dentro da area que rola.
  assert.match(APP, /class="n-ficha-edit"/, 'o formulario do modelo sumiu junto');
  const i = APP.indexOf('<div class="n-expand-area">');
  const j = APP.indexOf('<div class="n-resize"', i);
  assert.ok(i > 0 && j > i);
  const dentro = APP.slice(i, j);
  ['n-ficha-edit', 'n-checklist-wrap', 'n-files', 'n-coment-wrap'].forEach(bloco => {
    assert.ok(dentro.includes(bloco), `${bloco} precisa ficar na area que rola`);
  });
});

test('aumentar a nota da mais espaco ao formulario, e nao um vazio', () => {
  /* Sem flex:1 a area rolavel se dimensiona pelo conteudo: puxar a alca
     deixava um vazio embaixo, justo quando se aumentava a nota para ganhar
     espaco de preenchimento. */
  assert.match(String(valorDe('.n-expand-area', 'flex')), /1/,
    'a area rolavel precisa ocupar o que sobra da nota');
  assert.equal(valorDe('.n-expand-area', 'min-height'), '0',
    'sem min-height:0 ela nao encolhe e a nota estoura o teto');
});
