'use strict';
/* Texto de tela escrito direto no app.js não quebra nada e não gera erro: só
   aparece em português para quem escolheu outra língua. Foi assim que cerca de
   60 frases se acumularam sem ninguém ver. Esta varredura é a trava — ela falha
   no momento em que a próxima entrar, e não quando alguém tropeçar nela. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const linhas = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8').split(/\r?\n/);

/* Acento português é o sinal mais barato de "isto é frase para ler", e não
   nome de classe, chave de objeto ou id. */
const ACENTO = /[áàâãéêíóôõúüç]/i;
/* Onde o texto encosta na tela. Fora daqui, string com acento é comentário,
   log ou dado — nada que a pessoa leia. */
const NA_TELA = /(innerHTML|textContent|\.title\s*=|placeholder|toast\(|\.alt\s*=|aria-label|confirm\()/;

test('nenhum texto de tela em português escrito direto no app.js', () => {
  const soltos = [];

  linhas.forEach((linha, i) => {
    const limpa = linha.trim();
    if (limpa.startsWith('//') || limpa.startsWith('*') || limpa.startsWith('/*')) return;
    if (!NA_TELA.test(linha)) return;
    /* Linha que já passa por tradução está resolvida: _appText é o catálogo
       novo, T.* é o LANGS do próprio app.js — os dois trocam de idioma. */
    if (linha.includes('_appText(') || linha.includes('T.')) return;

    for (const m of linha.matchAll(/'([^'\\]{4,}?)'|"([^"\\]{4,}?)"/g)) {
      const texto = m[1] || m[2];
      if (!ACENTO.test(texto)) continue;
      if (!/[a-zà-ú]{3}/i.test(texto)) continue;   // símbolo ou emoji solto
      if (/^[a-z-]+$/.test(texto)) continue;       // classe css ou chave
      soltos.push(`app.js:${i + 1}  "${texto.slice(0, 60)}"`);
      break;
    }
  });

  assert.deepEqual(soltos, [],
    'passe estas frases pelo _appText e cadastre a chave no catálogo');
});

test('toda chave que o app.js pede existe no catálogo', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const i18n = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
  const usadas = new Set(Array.from(app.matchAll(/_appText\(\s*['"]([^'"]+)['"]/g), m => m[1]));

  // Sem isto, _appText cai no texto padrão e a frase fica em português sem avisar.
  const ausentes = [...usadas].filter(k => !i18n.includes(`'${k}'`));
  assert.deepEqual(ausentes, [], 'chave usada no app.js e ausente do catálogo');
});

test('toda chave que o rh.js pede existe no catálogo', () => {
  /* Mesma trava, para o modelo de recrutamento. Ele chama o catálogo pelo
     atalho `t(chave, padrão)` em vez de _appText, e por isso escapava da
     varredura acima — são quase cem chaves que cairiam no português sem que
     nada avisasse. */
  const rh = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
  const i18n = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
  const usadas = new Set(Array.from(rh.matchAll(/\bt\(\s*'((?:rh|app)\.[\w.]+)'/g), m => m[1]));

  assert.ok(usadas.size > 40, 'a varredura deixou de achar as chaves do rh.js');
  const ausentes = [...usadas].filter(k => !i18n.includes(`'${k}'`));
  assert.deepEqual(ausentes, [], 'chave usada no rh.js e ausente do catálogo');
});
