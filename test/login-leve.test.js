'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A TELA DE LOGIN NÃO PODE REPINTAR A CENA A CADA QUADRO
   ═══════════════════════════════════════════════════════════════════════
   A cena da login é feita de três círculos gigantes: `--band` é 88vh e o
   círculo mede `--band / 0.375` — ou seja ~2100×2100px numa tela de 900px de
   altura (~4,5 megapixels), ~2500px numa de 1080. Cada um passa por filtro
   caro: blur(110px) na .haze, blur(46px) na .aurora, dois drop-shadow na
   .limb.

   Isso é barato UMA vez. Vira travamento quando algo obriga a repintar a
   cada quadro — e era o caso: login.js registrava a propriedade `--ang` e a
   animava dentro do conic-gradient. Propriedade custom animada invalida a
   pintura, então o gradiente era gerado de novo E passado pelo blur 60 vezes
   por segundo, para sempre, nas três camadas.

   O detalhe que explica o "para ALGUNS usuários": o giro só existia onde
   `CSS.registerProperty` existe. Navegador sem ele caía no
   `@keyframes flow{to{--a:1}}`, que anima uma variável que ninguém lê —
   nenhum efeito e nenhum custo. Quem usava Chromium com vídeo integrado
   pagava a conta inteira; os outros nem viam o giro.

   O giro agora é `transform:rotate` no próprio elemento: mesmo desenho (a
   máscara é um radial-gradient, simétrico em relação ao centro) e resolvido
   no compositor — a camada borrada é rasterizada uma vez e depois só gira.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'docs/login.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'docs/js/login.js'), 'utf8');

/* Comentário que CITA o problema não é o problema. */
const semComentario = texto => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const CODIGO_JS = semComentario(JS);
const CSS = semComentario(HTML);

/* O corpo de uma regra, para conferir o que ela declara. */
function regra(seletor) {
  const i = CSS.indexOf(seletor + '{');
  assert.ok(i > -1, 'sumiu a regra ' + seletor);
  return CSS.slice(i, CSS.indexOf('}', i));
}

/* Cada @keyframes com o corpo inteiro (blocos aninhados incluídos). */
function quadros() {
  const saida = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(CSS))) {
    let i = m.index + m[0].length, prof = 1;
    while (i < CSS.length && prof > 0) {
      if (CSS[i] === '{') prof++;
      else if (CSS[i] === '}') prof--;
      i++;
    }
    saida.push({ nome: m[1], corpo: CSS.slice(m.index + m[0].length, i - 1) });
  }
  return saida;
}

test('nenhuma propriedade custom é animada — isso repinta o gradiente', () => {
  /* @keyframes que mexe em `--alguma-coisa` força repaint de tudo que a usa,
     e aqui ela alimentava um conic-gradient sob blur de 110px. */
  for (const q of quadros()) {
    assert.equal(/--[\w-]+\s*:/.test(q.corpo), false,
      `@keyframes ${q.nome} voltou a animar propriedade custom`);
  }

  assert.equal(/registerProperty/.test(CODIGO_JS), false,
    'login.js voltou a registrar propriedade custom para animá-la');
  assert.equal(/@keyframes\s+hue/.test(CODIGO_JS), false,
    'a animação injetada de --ang voltou');
});

test('a aurora e a haze giram por transform, que o compositor resolve', () => {
  for (const sel of ['.aurora', '.haze']) {
    const bloco = regra(sel);
    assert.match(bloco, /animation:\s*spin/, `${sel} deveria girar por transform`);
    assert.equal(/animation:[^;]*flow/.test(bloco), false,
      `${sel} voltou a animar o ângulo do gradiente`);
  }

  const spin = quadros().find(q => q.nome === 'spin');
  assert.ok(spin, 'o giro por transform sumiu');
  assert.match(spin.corpo, /rotate\(360deg\)/, 'o giro precisa dar a volta completa');

  /* transform é uma propriedade só: perder o translate em qualquer um dos
     dois quadros joga o círculo para fora do lugar. */
  assert.equal((spin.corpo.match(/translate\(-50%,-50%\)/g) || []).length, 2,
    'sem o translate nos dois quadros, o círculo salta de posição');
});

test('a linha do horizonte continua balançando, e não girando', () => {
  /* O fundo da .limb é um linear-gradient: girar 360° levaria a parte clara
     para baixo. Ela fica no sway de ±6°, que a máscara radial tolera. */
  const bloco = regra('.limb');
  assert.match(bloco, /animation:\s*sway/);
  assert.equal(/animation:[^;]*spin/.test(bloco), false);
});

test('quem pede menos movimento continua sem animação nenhuma', () => {
  assert.match(CSS, /prefers-reduced-motion[\s\S]{0,200}animation:\s*none\s*!important/,
    'a saída para quem tem enjoo de movimento sumiu');
});

test('a cena continua sendo três camadas — se virar mais, revisar o custo', () => {
  /* Cada camada é ~4,5 megapixels sob filtro pesado. Elas só saem baratas
     porque a rasterização acontece UMA vez; somar camadas volta a pesar,
     mesmo com transform. */
  const circulos = (HTML.match(/class="circle /g) || []).length;
  assert.equal(circulos, 3, 'o número de camadas da cena mudou');
});
