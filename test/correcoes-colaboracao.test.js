'use strict';
/* Três defeitos que só apareciam em uso real e não deixavam rastro no console:
   a pasta reabsorvendo a nota que a pessoa tinha acabado de tirar, a lista de
   delegação congelada com uma pessoa só, e a planilha do Google nascendo vazia
   fora do português. Os três eram invisíveis para a suíte. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

function recortar(nome) {
  const ini = fonte.indexOf('function ' + nome + '(');
  assert.ok(ini > -1, 'função não encontrada: ' + nome);
  let prof = 0, i = fonte.indexOf('{', ini);
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') prof++;
    else if (fonte[i] === '}') { prof--; if (!prof) break; }
  }
  return fonte.slice(ini, i + 1);
}

test('trocar o status só roteia para a pasta quando o status mudou', () => {
  const fn = recortar('openStatusMenu');

  /* Chamado a cada clique, reconfirmar o status que a nota já tinha devolvia
     ela para a pasta de status — inclusive uma nota arrastada para fora
     justamente para ser movida. */
  const idx = fn.indexOf('_handleSmartStackTransition');
  assert.ok(idx > -1, 'o roteamento para a pasta sumiu do menu de status');

  const antes = fn.slice(0, idx);
  const guarda = antes.lastIndexOf('if (antes !== opt.key)');
  const fecha = antes.lastIndexOf('}');
  assert.ok(guarda > -1 && guarda > fecha,
    'a chamada precisa estar dentro do if (antes !== opt.key)');
});

test('a planilha usa o nome real da aba criada, não um nome fixo', () => {
  // A aba nasce com o título traduzido; em inglês vira "Clients".
  assert.ok(!/range:\s*"'Clientes'!A1"/.test(fonte),
    'o intervalo voltou a ser fixo em português — a planilha nasce vazia fora do PT');
  assert.match(fonte, /const abaTitulo = spreadsheet\.sheets\?\.\[0\]\?\.properties\?\.title/,
    'o nome da aba precisa vir da resposta do Google');
  // Aspa simples dentro do nome da aba se escapa dobrando.
  assert.match(fonte, /replace\(\/'\/g, "''"\)/,
    'sem dobrar o apóstrofo, uma aba com aspa quebra o intervalo');
});

test('lista de participantes não guarda resultado incompleto', () => {
  const fn = recortar('_noteCollabMembers');

  /* Uma leitura degradada ficava em cache pela sessão inteira: quem abrisse o
     menu de delegar antes dos grupos carregarem via uma pessoa só até
     recarregar a página. */
  assert.match(fn, /if \(!completo\) _noteCollabMembersCache = null;/,
    'resultado incompleto não pode virar cache');
  /* Membro sem uid deixou de ser descartado: some da lista sem explicação era
     pior do que aparecer marcado como indisponível — o grupo de três mostrava
     dois e não dizia por quê. A leitura segue marcada como incompleta. */
  assert.match(fn, /semIdentidade: true/,
    'membro sem uid precisa aparecer marcado, não sumir');
  assert.match(fn, /completo = false;\s*\n\s*return \{ uid: '', username/,
    'e a leitura precisa continuar sendo marcada como incompleta');
});

test('a lista de membros soma o cache local e o banco', () => {
  const fn = recortar('_noteCollabMembers');
  // Confiar só no _myGroups deixava a lista com uma pessoa quando o cache
  // estava velho ou anterior a alguém entrar no grupo.
  assert.match(fn, /const doBanco = await fbGet\('groups\/' \+ _activeGroupWs\.groupId\)/,
    'o grupo precisa ser lido do banco, e não só do cache');
  assert.ok(/\.\.\.Object\.keys\(doCache\?\.members \|\| \{\}\)/.test(fn) &&
            /\.\.\.Object\.keys\(doBanco\?\.members \|\| \{\}\)/.test(fn),
    'as duas fontes de membros precisam ser somadas');
});

test('a falha de delegação diz o motivo', () => {
  // A mensagem genérica sozinha não distinguia permissão negada de queda de rede.
  assert.match(fonte, /const motivo = erro\?\.message \? ' \(' \+ erro\.message \+ '\)' : '';/,
    'o motivo real precisa chegar à tela');
});
