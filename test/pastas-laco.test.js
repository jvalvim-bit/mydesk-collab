'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   DUAS PESSOAS NO MESMO QUADRO NÃO PODEM BRIGAR PELA POSIÇÃO DAS PASTAS
   ═══════════════════════════════════════════════════════════════════════
   `_arrumarColunaDePastas` empilha as pastas usando `offsetHeight` — altura
   medida NO NAVEGADOR de quem está olhando. Ela gravava esse resultado em
   `stacks/` e ainda chamava `saveNotes()`.

   Com uma pessoa só isso converge: o segundo passe não acha diferença e
   para. Com duas, vira briga sem fim:

     A arruma pela altura da tela DELA e grava
       → o ouvinte de stacks acorda nos dois
       → B redesenha, arruma pela altura da tela DELE, acha diferença maior
         que 1px (janela, zoom e fonte não são os mesmos) e grava
           → A redesenha, arruma pela SUA altura, grava…

   Cada volta custava uma gravação em `stacks/`, um download do nó inteiro
   nos dois lados e — por causa do `saveNotes()` — uma reescrita do quadro
   COM OS ANEXOS. Era o que fazia as pastas piscarem e o consumo do Realtime
   Database disparar assim que a outra pessoa ficava online.

   A regra que esta varredura fixa: **altura medida no navegador é dado
   local e não pertence ao banco.** Quem grava posição de pasta é ação de
   gente — arrastar e o botão Reorganizar.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu do app.js: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

const semComentario = texto => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('arrumar a coluna não grava nada — é passe visual', () => {
  const corpo = semComentario(recortar('function _arrumarColunaDePastas('));

  assert.equal(/_persistStackMeta\(/.test(corpo), false,
    'voltou a gravar a posição medida na tela — as duas pessoas brigam de novo');
  assert.equal(/saveNotes\(/.test(corpo), false,
    'voltou a reescrever o quadro inteiro, com anexos, a cada arrumada');
  assert.equal(/_fixarLugarDaPasta\(/.test(corpo), false,
    'gravar por outro caminho tem o mesmo efeito');

  // O que ele PRECISA continuar fazendo: encostar a coluna no topo.
  assert.match(corpo, /style\.top\s*=/, 'parou de posicionar as pastas');
  assert.match(corpo, /offsetHeight/, 'parou de empilhar pela altura real');
});

test('quem grava posição de pasta continua sendo ação de gente', () => {
  /* Tirar a gravação do passe automático não pode ter tirado a de quem
     arrasta uma pasta nem a do botão Reorganizar — sem elas, a pasta
     voltaria ao lugar antigo no próximo carregamento. */
  assert.ok(APP.includes('function _fixarLugarDaPasta('), 'sumiu a gravação por arrasto');
  assert.match(recortar('function _fixarLugarDaPasta('), /_persistStackMeta\(/);
  assert.match(recortar('function shuffleAll('), /_fixarLugarDaPasta\(/,
    'Reorganizar parou de fixar o lugar das pastas');
});

/* ── O ouvinte redesenha só o que mudou ─────────────────────────────────── */

function montarOuvinte(pastas) {
  let aoMudar = null;
  const redesenhadas = [];
  const ctx = vm.createContext({
    _db: { ref: () => ({ on: (_ev, fn) => { aoMudar = fn; } }) },
    _stackMetaWs: {},
    notes: pastas.map((sid, i) => ({ id: i, stackId: sid })),
    _renderStackSeguro: sid => redesenhadas.push(sid),
  });
  /* _todosOsStackIds junta as notas com as pastas VAZIAS do mapa — sem ele
     no contexto, o ouvinte nao tem como saber quais pastas existem. */
  ctx.getStackTitles = () => ctx._stackMetaWs;
  vm.runInContext([
    recortar('function _todosOsStackIds('),
    recortar('function _assinaturaDaPasta('),
    recortar('function _listenStackMeta('),
  ].join('\n'), ctx);
  ctx._listenStackMeta('shared_boards/k/stacks');
  return {
    ctx, redesenhadas,
    emitir: valor => aoMudar({ val: () => valor }),
  };
}

test('a primeira carga desenha todas as pastas', () => {
  const { emitir, redesenhadas } = montarOuvinte(['s1', 's2']);
  emitir({ s1_x: 10, s1_y: 12, s2_x: 10, s2_y: 200 });
  assert.deepEqual([...redesenhadas].sort(), ['s1', 's2']);
});

test('mexer numa pasta não repinta as outras', () => {
  /* Era isto o "piscando": renomear uma pasta remontava o quadro inteiro,
     e cada remontagem reagendava o arrumar-coluna. */
  const { emitir, redesenhadas } = montarOuvinte(['s1', 's2', 's3']);
  emitir({ s1_x: 10, s1_y: 12, s2_x: 10, s2_y: 200, s3_x: 10, s3_y: 400 });
  redesenhadas.length = 0;

  emitir({ s1_x: 10, s1_y: 12, s2_x: 10, s2_y: 200, s2_title: 'Nova', s3_x: 10, s3_y: 400 });

  assert.deepEqual([...redesenhadas], ['s2'],
    'redesenhou pasta que não mudou');
});

test('eco do próprio dado não redesenha nada', () => {
  /* O ouvinte acorda também com a gravação da própria aba. Se um evento
     idêntico repintasse, o ciclo se realimentaria sozinho. */
  const { emitir, redesenhadas } = montarOuvinte(['s1', 's2']);
  const dados = { s1_x: 10, s1_y: 12, s2_x: 10, s2_y: 200 };
  emitir(dados);
  redesenhadas.length = 0;

  emitir({ ...dados });
  emitir({ ...dados });

  assert.deepEqual([...redesenhadas], [], 'repintou sem nada ter mudado');
});

test('apagar a pasta do banco redesenha aquela pasta', () => {
  const { emitir, redesenhadas } = montarOuvinte(['s1', 's2']);
  emitir({ s1_x: 10, s1_y: 12, s2_x: 10, s2_y: 200 });
  redesenhadas.length = 0;

  emitir({ s2_x: 10, s2_y: 200 });

  assert.deepEqual([...redesenhadas], ['s1'],
    'a pasta que perdeu os dados precisa ser redesenhada');
});

test('o espelho local acompanha o banco', () => {
  const { ctx, emitir } = montarOuvinte(['s1']);
  emitir({ s1_x: 10, s1_y: 12 });
  assert.equal(ctx._stackMetaWs.s1_y, 12);
  emitir(null);
  assert.deepEqual(Object.keys(ctx._stackMetaWs), [],
    'nó vazio precisa limpar o espelho, senão a pasta some da tela e fica no cache');
});
