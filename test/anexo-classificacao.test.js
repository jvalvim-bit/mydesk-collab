'use strict';
/* Como um anexo é classificado antes de ser lido.
   O bug que trouxe este arquivo: currículos perfeitamente legíveis apareciam
   como "formato do anexo não suportado". A classificação olhava só dois sinais
   — o `type` que o navegador de quem respondeu informou, e a extensão do nome
   — e os dois falham com frequência: o `type` vem vazio dependendo do sistema
   e de como o arquivo foi escolhido, e a API grava o nome como "arquivo",
   sem extensão, quando ele não vem junto.

   O terceiro sinal estava ali o tempo todo, ignorado: o dataURL declara o
   próprio mimetype no prefixo, escrito na hora em que o arquivo foi lido.
   Esta varredura recorta a classificação real do app.js e confere que ela usa
   os três, na ordem certa. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');

const FUNCAO = (() => {
  const i = APP.indexOf('async function _textoDeDocumento(');
  assert.ok(i > 0, '_textoDeDocumento sumiu do app.js');
  const j = APP.indexOf('\n}', i);
  return APP.slice(i, j);
})();

test('o mimetype do próprio dataURL entra na classificação', () => {
  assert.match(FUNCAO, /url\.match\(\/\^data:\(\[\^;,\]\+\)\//,
    'sem ler o prefixo do dataURL, anexo sem type e sem extensão é recusado');
  assert.match(FUNCAO, /seguro\(doc && doc\.type\) \|\| doUrl/,
    'o tipo do dataURL precisa ser o recurso quando o declarado vem vazio');
});

test('name e type que não são string viram vazio, e não "[object Object]"', () => {
  assert.match(FUNCAO, /typeof v === 'string' \? v : ''/,
    'String(objeto) daria "[object Object]", que não casa com ramo nenhum');
  assert.ok(!/String\(\(doc && doc\.(name|type)\)/.test(FUNCAO),
    'voltou a coagir com String(), que é o que produzia o vazamento');
});

test('dataUrl que não é dataURL não é tratado como arquivo', () => {
  assert.match(FUNCAO, /!\/\^data:\/\.test\(url\)\) return saida\('semarquivo'\)/,
    'sem esta guarda, um valor qualquer no campo vira tentativa de leitura');
});

test('antes de desistir, o arquivo desconhecido é tentado como docx e como texto', () => {
  /* Desistir por falta de rótulo é recusar currículo legível porque o
     navegador de quem enviou não soube dizer o que estava mandando. */
  const fim = FUNCAO.slice(FUNCAO.indexOf("startsWith('image/')"));
  assert.match(fim, /lerDocx\(url\)/, 'faltou a tentativa como .docx');
  assert.match(fim, /atob\(base64\(\)\)/, 'faltou a tentativa como texto puro');
  assert.match(fim, /_pareceTexto/,
    'tentar sem conferir o resultado devolveria lixo como se fosse currículo');
  assert.match(fim, /saida\('formato'/, 'ainda precisa existir a saída de desistência');
});

test('a desistência diz QUAL era o formato', () => {
  assert.match(FUNCAO, /saida\('formato', '', tipo \|\| nome \|\| ''\)/,
    'sem o tipo na mensagem, a próxima falha volta a ser adivinhação');
});

test('a ordem dos ramos mantém o Office antes do texto', () => {
  /* O mimetype do .docx contém "xml": num ramo de texto colocado antes, o
     .docx seria decodificado como texto puro e sairia binário. */
  const pdf = FUNCAO.indexOf("'application/pdf'");
  const office = FUNCAO.indexOf("officedocument");
  const texto = FUNCAO.indexOf("startsWith('text/')");
  const imagem = FUNCAO.indexOf("startsWith('image/')");
  assert.ok(pdf < office && office < texto && texto < imagem,
    'a ordem dos ramos mudou, e ela é o que separa .docx de texto puro');
});
