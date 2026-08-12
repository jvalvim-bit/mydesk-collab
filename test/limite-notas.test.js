'use strict';
/* O limite de notas do plano gratuito é conferido no NAVEGADOR: o nó
   users/{uid}/notes tem `.write` livre para o dono e não consulta o plano em
   lugar nenhum. Enquanto for assim, cada furo aqui é um caminho pelo qual o
   limite deixa de existir — e nenhum deles aparece em teste de tela, porque
   todos passam por caminhos que parecem funcionar.

   Estes testes leem o código. É a trava possível sem subir o app inteiro: se
   alguém reintroduzir um dos quatro padrões, o teste aponta qual e por quê. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

function trecho(assinatura, tamanho = 2200) {
  const i = APP.indexOf(assinatura);
  assert.ok(i > 0, `não achei ${assinatura}`);
  return APP.slice(i, i + tamanho);
}

test('nota de grupo sem dono premium conta na cota de quem criou', () => {
  /* O buraco mais grave, e acidental: o código consultava
     groupNotesThisMonth — um contador por grupo que NENHUMA linha do projeto
     jamais escreveu. Lia sempre zero, zero nunca alcança o limite, e a
     resposta era sempre "pode criar". Dentro de um grupo o limite não existia
     para ninguém: bastava criar um grupo. */
  assert.doesNotMatch(APP, /groupNotesThisMonth\s*\?\.\[|groupNotesThisMonth\s*\[/,
    'contador de grupo que ninguém escreve faz o limite sumir dentro de grupos');

  assert.match(APP, /async function _grupoBancadoPeloDono\(\)/,
    'a única isenção legítima é o dono premium bancando o quadro');

  // A checagem tem de valer nos DOIS lados: liberar e cobrar.
  assert.match(trecho('async function canCreateNote()'),
    /await _grupoBancadoPeloDono\(\)/);
  assert.match(trecho('async function incrementNoteCounter()'),
    /await _grupoBancadoPeloDono\(\)/,
    'sem isto a nota de grupo é liberada e nunca cobrada');

  // Falha de leitura não pode virar isenção.
  const fn = trecho('async function _grupoBancadoPeloDono()', 1200);
  assert.match(fn, /catch[\s\S]*return false/,
    'sem confirmar que o dono é premium, a nota cobra da própria cota');
});

test('restaurar devolve o quadro ao lugar de onde saiu', () => {
  /* A gravação do restore tem três caminhos e o último era um "senão" solto:
     quem tirasse o backup num grupo e trocasse de quadro dentro dos 30
     segundos caía nele, e as notas do grupo eram gravadas no quadro pessoal —
     sem passar por contagem nenhuma. Erro de dado antes de ser furo de plano. */
  const restore = trecho('async function doRestore()', 1800);
  assert.match(restore, /const mesmoLugar/,
    'restore precisa conferir o workspace de origem');
  assert.match(restore, /if \(!mesmoLugar\)[\s\S]{0,200}return;/,
    'restore em workspace diferente tem de parar antes de gravar');
  // A conferência vem ANTES de mexer no quadro.
  assert.ok(restore.indexOf('mesmoLugar') < restore.indexOf('notes = snapshot'),
    'conferir depois de trocar as notas não adianta');
});

test('a cota conta nota, e não clientes do CRM', () => {
  /* Somava `_records.length` (clientes, total que DIMINUI) a
     notesCreatedThisMonth (criadas no mês, que só cresce). Não fecha, e o CRM
     é premium — quem tem acesso não tem limite. Na prática só atingia quem foi
     premium, criou clientes e voltou ao gratuito: ficava travado sem criar
     nota nenhuma, inclusive em mês novo. */
  const fn = trecho('async function canCreateNote()');
  assert.doesNotMatch(fn, /_records\s*\?\s*_records\.length|getNotesUsed\(\)\s*\+\s*\(_records/,
    'cliente do CRM não pode consumir cota de nota');
  assert.match(fn, /const used = getNotesUsed\(\);/);
});

test('virar o mês só zera a cota se o servidor aceitar', () => {
  /* lastResetAt é carimbado pelo servidor e a regra do banco só libera um novo
     reset 27 dias depois — o relógio do navegador não decide. Só que o
     contador em memória era zerado ANTES da gravação e a recusa caía num catch
     vazio: o banco dizia não, o app não ficava sabendo, e a conferência local
     (a que decide se dá pra criar) passava a contar do zero. Adiantar a data
     do computador dava notas de graça. */
  const fn = trecho('async function loadUserPlan()', 1800);
  assert.match(fn, /const aceitou = await fbUpdate/,
    'o reset local precisa depender da resposta do servidor');
  assert.match(fn, /if \(aceitou\)[\s\S]{0,160}notesCreatedThisMonth = 0/,
    'zerar o contador local só depois do servidor aceitar');
  assert.doesNotMatch(fn, /notesCreatedThisMonth = 0;[\s\S]{0,80}await fbUpdate/,
    'zerar antes de gravar é exatamente o furo do relógio');
  assert.match(fn, /lastResetAt: firebase\.database\.ServerValue\.TIMESTAMP/,
    'o carimbo tem de ser do servidor');
});

test('a regra do banco continua protegendo o contador em si', () => {
  /* Isto já estava certo e não pode regredir: o contador só aceita ficar
     igual, subir de um em um, ou zerar — e zerar exige carimbo do servidor com
     27 dias desde o anterior. É o que impede escrever "0" à mão. */
  const bruto = fs.readFileSync(path.join(RAIZ, 'database.rules.json'), 'utf8');
  const regras = JSON.parse(bruto.replace(/^\s*\/\/.*$/gm, ''));
  const plano = regras.rules.users.$key.plan;
  const contador = plano.notesCreatedThisMonth['.validate'];

  assert.match(contador, /newData\.val\(\) === data\.val\(\) \+ 1/, 'só pode subir de um em um');
  assert.match(contador, /lastResetAt'\)\.val\(\) === now/, 'zerar exige carimbo do servidor');
  assert.match(contador, /2332800000/, 'zerar exige 27 dias desde o reset anterior');
  assert.equal(plano.planExpiresAt['.validate'], 'newData.val() === data.val()',
    'o cliente não pode esticar a validade do premium');
});
