'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A BARRA NÃO PODE CORTAR BOTÃO
   ═══════════════════════════════════════════════════════════════════════
   #toolbar é uma linha flex e o body é overflow:hidden. Sem wrap, o que não
   cabe não vira scroll: some, e não há gesto que o traga de volta.

   Somados, os botões pedem ~1470px. Um MacBook Air de 13" tem exatamente
   1470px de largura CSS — em tela cheia a barra raspa o limite, e em janela
   normal "Sair" e o seletor de idioma ficam fora da tela. O mobile.css
   apertava a barra, mas só a partir de 860px: entre 861px e 1470px não havia
   regra nenhuma, que é justamente a faixa onde vive todo notebook.

   A varredura cobre as duas pontas: existe regra para largura de notebook, e
   existe rede embaixo (wrap) para quando nem isso bastar.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'docs/css/main.css'), 'utf8');
const MOBILE = fs.readFileSync(path.join(ROOT, 'docs/css/mobile.css'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');

/* Separa os blocos @media do resto — sem isso, uma regra que só vale no
   celular passaria por regra global. */
function fatiarMedia(css) {
  const blocos = [];
  let fora = '';
  const re = /@media([^{]+)\{/g;
  let m, ultimoFim = 0;
  while ((m = re.exec(css))) {
    fora += css.slice(ultimoFim, m.index);
    let i = m.index + m[0].length, prof = 1;
    while (i < css.length && prof > 0) {
      if (css[i] === '{') prof++;
      else if (css[i] === '}') prof--;
      i++;
    }
    blocos.push({ cond: m[1].trim(), corpo: css.slice(m.index + m[0].length, i - 1) });
    ultimoFim = i;
    re.lastIndex = i;
  }
  fora += css.slice(ultimoFim);
  return { blocos, fora };
}

const MAIN_FATIADO = fatiarMedia(MAIN);

/* Última declaração vence, como no navegador. */
function valorDe(css, seletor, prop) {
  const re = new RegExp(seletor.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  let m, achado = null;
  while ((m = re.exec(css))) {
    const d = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(m[1]);
    if (d) achado = d[1].trim();
  }
  return achado;
}

test('a barra pode ganhar linha em QUALQUER largura — nada é cortado', () => {
  /* Fora de media query: vale para desktop grande também, que é onde a
     janela pode ser arrastada para qualquer tamanho. */
  assert.match(String(valorDe(MAIN_FATIADO.fora, '#toolbar', 'flex-wrap')), /wrap/,
    'sem flex-wrap, botão que não cabe fica inalcançável (body é overflow:hidden)');

  assert.match(String(valorDe(MAIN_FATIADO.fora, '#toolbar', 'height')), /auto/,
    'altura fixa impede a segunda linha de aparecer');

  /* Se um dia o body deixar de cortar, a rede continua correta — mas é esta
     combinação que torna o wrap obrigatório, e ela precisa estar consciente. */
  assert.match(MAIN, /html,body\{[^}]*overflow:hidden/,
    'o teste presume body overflow:hidden; se mudou, revisar o raciocínio acima');
});

test('existe regra de barra para largura de notebook, não só de celular', () => {
  const LARGURAS = [
    [1470, 'MacBook Air 13" em tela cheia'],
    [1512, 'MacBook Pro 14"'],
    [1280, 'janela não maximizada'],
    [1100, 'janela estreita'],
  ];

  const cobre = largura => MAIN_FATIADO.blocos.some(b => {
    if (!/#toolbar|\.t-btn|\.t-logo|\.t-pill/.test(b.corpo)) return false;
    if (/orientation:\s*portrait/.test(b.cond)) return false;
    const max = /max-width:\s*(\d+)px/.exec(b.cond);
    if (!max) return false;
    const min = /min-width:\s*(\d+)px/.exec(b.cond);
    if (min && largura < Number(min[1])) return false;
    return largura <= Number(max[1]);
  });

  for (const [largura, quem] of LARGURAS) {
    assert.ok(cobre(largura), `${largura}px (${quem}) ficou sem regra de barra`);
  }
});

test('o celular continua com o tratamento próprio dele', () => {
  /* A faixa de notebook não pode ter atropelado o compacto do mobile.css. */
  assert.match(MOBILE, /@media \(max-width: 860px\)/);
  assert.match(MOBILE, /#toolbar/);
});

test('quando a barra muda de altura, as notas descem junto', () => {
  assert.ok(APP.includes('function _reencaixarNotasSobBarra('),
    'nota position:fixed que ficou atrás da barra não volta sozinha');

  const i = APP.indexOf('function _reencaixarNotasSobBarra(');
  const corpo = APP.slice(i, APP.indexOf('\n}', i) + 2);

  assert.match(corpo, /_minNoteY\(\)/, 'o piso tem de ser medido, não constante');

  /* Resize dispara em rajada ao arrastar a janela. Gravar ali reescreveria o
     quadro inteiro a cada quadro de animação — ver REGRAS-WORKSPACE.md. */
  assert.equal(/saveNotes\(|saveSharedNote\(|saveGroupNote\(/.test(corpo), false,
    'reencaixe não pode gravar: mountNote já reaplica o piso no próximo load');

  const resize = APP.slice(APP.indexOf("window.addEventListener('resize'"));
  assert.match(resize.slice(0, 400), /_reencaixarNotasSobBarra\(\)/,
    'a função existe mas ninguém a chama no resize');
});
