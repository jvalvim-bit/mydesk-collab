'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   "LIMPAR TUDO" APAGA AS NOTAS — E SÓ AS NOTAS
   ═══════════════════════════════════════════════════════════════════════
   O diálogo promete "todas as notas e pilhas". No workspace 1:1 ele fazia
   `fbRemove` do nó `notes` INTEIRO — e naquele mesmo nó moram os clientes, as
   vagas, os talentos, os colaboradores e as despesas. Todos sumiam junto, sem
   aviso, e sem constar do backup: `_takeBackup('all')` guarda o array `notes`,
   então nem o "Restaurar" os trazia de volta.

   Era esse o sumiço das vagas do workspace Sócios. Não havia erro nenhum na
   tela porque, do ponto de vista do código, nada tinha dado errado: o comando
   fez exatamente o que mandaram — só que "tudo" ali significava muito mais do
   que o nome e o texto do diálogo dizem.

   O quadro de GRUPO já apagava nota a nota (por causa das regras do banco, não
   por causa disto) e o pessoal padrão já preservava pelo caminho do
   `saveNotesRaw`. Eram dois contextos certos e dois errados; agora são quatro
   iguais.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

/* O corpo do "Sim, apagar tudo": do listener até o fim da função. */
function corpoDoLimpar() {
  const i = APP.indexOf("pop.querySelector('.confirm-clear-ok')");
  assert.ok(i > 0, 'sumiu o botao de confirmar o Limpar tudo');
  return APP.slice(i, i + 3400);
}

test('no workspace 1:1 o Limpar tudo NAO apaga o no inteiro', () => {
  const fn = corpoDoLimpar();
  assert.equal(/fbRemove\('shared_boards\/' \+ _activeWs\.key \+ '\/notes'\)/.test(fn), false,
    'voltou a apagar o no inteiro do 1:1 — clientes e vagas iriam junto');
  assert.match(fn, /idsParaApagar\.map\(id =>\s*\n?\s*Promise\.resolve\(removeSharedNote\(id\)\)/,
    'o 1:1 precisa apagar nota a nota, como o grupo ja faz');
});

test('no workspace pessoal nomeado o Limpar tudo preserva o que nao e nota', () => {
  const fn = corpoDoLimpar();
  assert.equal(/fbSet\(_pwPath\(_activePersonalWs\.id\), null\)\.catch/.test(fn), false,
    'voltou a zerar o no do workspace nomeado, levando clientes e vagas');
  assert.match(fn, /const guardar = _preservarRegistrosDoQuadro\(\{\}\)/);
  /* Sem NADA para guardar o no vira null — deixar um objeto vazio ali seria
     guardar um quadro que nao existe. */
  assert.match(fn, /Object\.keys\(guardar\)\.length/);
});

test('os outros dois contextos continuam como estavam', () => {
  const fn = corpoDoLimpar();
  // Grupo: nota a nota, por causa das regras do banco.
  assert.match(fn, /fbRemove\('group_boards\/' \+ _activeGroupWs\.groupId \+ '\/notes\/' \+ id\)/);
  // Pessoal padrao: o unico ponto do app autorizado a gravar vazio.
  assert.match(fn, /saveNotesRaw\(CU\.username, \[\], \{ podeApagar: true \}\)/);
});

test('o texto do dialogo diz o que fica', () => {
  /* "Todas as notas e pilhas serão apagadas" era verdade e ainda assim
     enganava, porque o que sumia era mais do que isso. Agora a frase responde
     a pergunta que a pessoa tem antes de clicar. */
  const i = APP.indexOf('Limpar tudo?');
  assert.ok(i > 0);
  const dialogo = APP.slice(i, i + 600);
  assert.match(dialogo, /Clientes, vagas e o restante do painel continuam onde estão/);
});
