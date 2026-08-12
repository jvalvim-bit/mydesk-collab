'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   APAGAR A NOTA APAGA OS ANEXOS DELA
   ═══════════════════════════════════════════════════════════════════════
   No quadro de GRUPO os anexos nao ficam dentro da nota: moram num no
   irmao, group_boards/{id}/files/{noteId}/{fileId}. removeGroupNote apagava
   so a nota — os arquivos ficavam para tras.

   Isso e vazamento permanente, e do pior tipo: ninguem mais consegue ver
   aqueles arquivos (a nota que os mostrava nao existe), e nem por isso eles
   saem do 1 GB do plano. Nao ha tela em que o problema apareca; ele so
   aparece na fatura.

   O quadro pessoal e o 1:1 nao tem esse problema — ali os anexos ficam
   DENTRO da nota, entao apagar a nota leva tudo junto.

   Detalhe que a implementacao nao pode esquecer: a regra do banco concede
   escrita em $fileId. Escrita no pai NAO e autorizada por regra de filho,
   entao apagar o no do noteId de uma vez seria negado — tem de ser arquivo
   por arquivo.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const REGRAS = fs.readFileSync(path.join(RAIZ, 'database.rules.json'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

function montar(espelho) {
  const apagados = [];
  const ctx = vm.createContext({
    _activeGroupWs: { groupId: 'g1' },
    _fbReady: true,
    _filesWs: espelho,
    fbRemove: caminho => { apagados.push(caminho); return Promise.resolve(); },
    Promise, Object,
  });
  vm.runInContext(recortar('function removeGroupNote('), ctx);
  return { ctx, apagados };
}

test('apagar a nota apaga os anexos dela, um a um', async () => {
  const { ctx, apagados } = montar({ n1: { fA: {}, fB: {} } });
  await ctx.removeGroupNote('n1');

  assert.ok(apagados.includes('group_boards/g1/notes/n1'), 'a nota nao foi apagada');
  assert.ok(apagados.includes('group_boards/g1/files/n1/fA'), 'anexo fA ficou orfao');
  assert.ok(apagados.includes('group_boards/g1/files/n1/fB'), 'anexo fB ficou orfao');
});

test('nao tenta apagar o no do noteId de uma vez — a regra negaria', async () => {
  const { ctx, apagados } = montar({ n1: { fA: {} } });
  await ctx.removeGroupNote('n1');

  assert.equal(apagados.includes('group_boards/g1/files/n1'), false,
    'remove no nivel do noteId e negado: a regra concede escrita em $fileId');

  /* E a regra continua sendo essa — se ela mudar, esta varredura precisa
     ser revista junto. */
  assert.match(REGRAS, /"files":\s*\{\s*"\$noteId":\s*\{\s*"\$fileId"/,
    'a forma da regra de arquivos de grupo mudou');
});

test('nota sem anexo nao inventa remocao', async () => {
  const { ctx, apagados } = montar({});
  await ctx.removeGroupNote('n9');
  assert.deepEqual([...apagados], ['group_boards/g1/notes/n9']);
});

test('o espelho local esquece a nota apagada', async () => {
  const espelho = { n1: { fA: {} }, n2: { fB: {} } };
  const { ctx } = montar(espelho);
  await ctx.removeGroupNote('n1');

  assert.equal('n1' in espelho, false, 'o espelho ainda acha que a nota tem anexo');
  assert.ok('n2' in espelho, 'levou junto o anexo de outra nota');
});

test('quadro 1:1 e pessoal guardam anexo DENTRO da nota', () => {
  /* E por isso que removeSharedNote nao precisa de limpeza: apagar a nota
     leva os arquivos junto. Se um dia migrarem para no irmao, como no grupo,
     precisam da mesma limpeza — e esta varredura avisa antes do vazamento
     comecar. */
  const bloco = REGRAS.slice(REGRAS.indexOf('"shared_boards"'));
  const notas = bloco.slice(bloco.indexOf('"notes"'), bloco.indexOf('"group_boards"'));
  assert.match(notas, /"\$noteId"[\s\S]*"files"/,
    'os anexos do 1:1 sairam de dentro da nota — removeSharedNote precisa limpar');

  /* O quadro pessoal segue a mesma forma, dentro de users/$key/notes. */
  const pessoal = REGRAS.slice(REGRAS.indexOf('"notes"'), REGRAS.indexOf('"online"'));
  assert.match(pessoal, /"\$noteId"[\s\S]*"files"/,
    'os anexos do quadro pessoal sairam de dentro da nota');

  const compartilhado = recortar('async function removeSharedNote(');
  assert.match(compartilhado, /notes/, 'removeSharedNote deixou de apagar a nota');
});
