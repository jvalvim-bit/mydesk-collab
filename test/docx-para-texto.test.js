'use strict';
/* `lerDocx` NÃO devolve texto: devolve a estrutura do documento — uma lista de
   blocos com trechos, formatação, recuo e tabelas —, porque ela existe para o
   visualizador remontar a folha na tela.

   Quem só quer o conteúdo precisa converter. A análise de currículos não
   convertia: passava a lista por String(), que em JavaScript produz
   "[object Object],[object Object],…". Era isso que subia ao Gemini como se
   fosse o currículo, e era isso que ele descrevia — com razão — como "erro de
   carregamento de sistema". A leitura dizia ter dado certo, e o que ia junto
   era a assinatura de um bug.

   O sintoma foi visível na tela: "607 chars" para um currículo inteiro. São
   38 repetições de "[object Object],". */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');

const contexto = vm.createContext({});
(() => {
  const i = APP.indexOf('function _textoDeParagrafos(');
  assert.ok(i > 0, '_textoDeParagrafos sumiu do app.js');
  const j = APP.indexOf('\n}', i);
  vm.runInContext(APP.slice(i, j + 2), contexto);
})();
const texto = contexto._textoDeParagrafos;

/* A forma que extrairParagrafos devolve de verdade. */
const BLOCOS = [
  { texto: 'Ana Souza Ferreira', titulo: true, nivel: 1, trechos: [{ t: 'Ana Souza Ferreira', b: true }] },
  { texto: 'Analista de dados pleno', trechos: [{ t: 'Analista de dados pleno' }] },
  { vazio: true },
  { texto: 'Experiência profissional', titulo: true, nivel: 2, trechos: [] },
  { tabela: [
      ['2022 — hoje', 'Empresa Alfa\nAnalista de dados'],
      ['2020 — 2022', 'Empresa Beta\nEstagiária'],
    ] },
  { texto: 'Formação: Bacharelado em Estatística.', trechos: [] },
];

test('a lista de blocos vira texto, e nunca "[object Object]"', () => {
  const t = texto(BLOCOS);
  assert.ok(!t.includes('[object Object]'), 'a conversão voltou a ser String(lista)');
  assert.ok(t.includes('Ana Souza Ferreira'));
  assert.ok(t.includes('Formação: Bacharelado em Estatística.'));
});

test('o texto das TABELAS entra', () => {
  /* Currículo em duas colunas — anos de um lado, cargo do outro — é formato
     comum. Descartar a tabela deixaria de fora justamente a experiência. */
  const t = texto(BLOCOS);
  assert.ok(t.includes('Empresa Alfa'), 'a tabela foi descartada');
  assert.ok(t.includes('2022'), 'a coluna dos anos foi descartada');
  assert.match(t, /2022 — hoje — Empresa Alfa/,
    'as células de uma linha precisam ficar juntas, e na ordem');
});

test('parágrafo vazio separa blocos sem empilhar linhas em branco', () => {
  const t = texto(BLOCOS);
  assert.ok(!/\n{3,}/.test(t), 'sobraram linhas em branco empilhadas');
  assert.ok(t.includes('\n'), 'sem quebra nenhuma, tudo vira um parágrafo só');
});

test('entrada que não é lista devolve vazio, e não a palavra "null"', () => {
  /* O ramo de tentativa às cegas chama lerDocx com .catch(() => null): sem esta
     guarda, "null" viraria o conteúdo do currículo. */
  assert.equal(texto(null), '');
  assert.equal(texto(undefined), '');
  assert.equal(texto('já é texto'), '');
  assert.equal(texto([]), '');
});

test('bloco malformado não derruba a conversão nem vaza objeto', () => {
  const t = texto([null, { texto: { errado: true } }, { texto: 'bom' }, { tabela: null }]);
  assert.equal(t, 'bom');
});

test('o app usa o conversor nos DOIS lugares que leem .docx', () => {
  /* Uma implementação só. Duas fariam o visualizador e a análise divergirem —
     que é exatamente como o bug nasceu: o visualizador convertia à mão e a
     análise não convertia. */
  const usos = APP.match(/_textoDeParagrafos\(/g) || [];
  assert.ok(usos.length >= 4,
    'esperado: a definição, os dois ramos de .docx e o visualizador');
  assert.ok(!/corta\(await lerDocx\(url\)\)/.test(APP),
    'voltou a passar a lista de blocos direto por String()');
});
