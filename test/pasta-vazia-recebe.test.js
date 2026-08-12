'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A PASTA VAZIA — RECEBER NOTA, E NÃO SUMIR
   ═══════════════════════════════════════════════════════════════════════
   Dois sintomas relatados, uma causa só: o código de pastas foi escrito
   quando pasta sem nota era pasta que não existia — a única forma de criar
   uma era arrastar uma nota sobre outra, então "vazia" era um estado
   impossível. O botão "Nova pasta" tornou esse estado o mais comum de todos,
   e as duas pontas ficaram para trás:

   1. **Não dava para arrastar nota até ela.** O alvo do arrasto era sempre
      uma NOTA — a primeira da pasta, usada como procuração. Pasta vazia não
      tem primeira nota, então não havia procuração e ela nunca era escolhida:
      a nota atravessava a pasta e ia parar do outro lado.

   2. **Ela sumia ao esvaziar.** Tirando a nota, o wrap era removido da tela e
      só se redesenhava com duas notas dentro. Com zero, a pasta saía do quadro
      e o título CONTINUAVA em stacks/ — não dava para ver nem para criar de
      novo, porque a verificação de duplicada acusava uma pasta invisível.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const I18N = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

/* ── 1. Arrastar uma nota até a pasta vazia ──────────────────────────── */

test('a pasta sem nota vira alvo do arrasto — o wrap, e nao uma procuracao', () => {
  const fn = recortar('function findDropTarget(');
  assert.match(fn, /if \(!stackNs\.length\) \{ bestDist = dist; best = wrap; return; \}/,
    'pasta vazia voltou a depender de uma primeira nota que ela nao tem');
  // E o caminho da pasta COM nota continua de pé: ele não foi trocado.
  assert.match(fn, /const el = document\.querySelector\('\.note\[data-id="'\+stackNs\[0\]\.id\+'"\]'\)/);
});

test('largar sobre a pasta vazia poe a nota dentro dela', () => {
  const fn = recortar('function endDrag(');
  assert.match(fn, /const pastaVazia = _pastaAlvo\(target\)/);
  assert.match(fn, /_moveNoteIntoStack\(movida, pastaVazia\)/,
    'sem isto a nota e largada por cima da pasta, e nao dentro dela');
  /* O arrasto tem de ser encerrado ANTES de mexer na pasta: _moveNoteIntoStack
     redesenha o quadro, e um `drag` ainda vivo continuaria movendo a nota. */
  const i = fn.indexOf('const pastaVazia');
  assert.ok(fn.indexOf('drag = null;', i) < fn.indexOf('_moveNoteIntoStack(movida', i),
    'a pasta foi mexida antes de o arrasto terminar');
});

test('o alvo de pasta e uma pergunta so, para os dois lugares', () => {
  const fn = recortar('function _pastaAlvo(');
  assert.match(fn, /classList\.contains\('stack-wrap'\)/);
  // onDrag acende o próprio wrap e não procura nota nenhuma dentro dele.
  const drag = recortar('function onDrag(');
  assert.match(drag, /if \(_pastaAlvo\(target\)\) return;/);
});

test('o realce da pasta e limpo ao soltar, e nao so o das notas', () => {
  /* Só as notas eram limpas; a moldura acesa da pasta ficava na tela até o
     próximo arrasto passar perto dela. */
  const fn = recortar('function endDrag(');
  assert.match(fn, /querySelectorAll\('\.stack-wrap\.stack-target'\)\.forEach/);
});

test('pasta vazia tem area de alvo, e diz para que serve', () => {
  /* Só com o cabeçalho ela é uma faixa de 40px: dá para ler o nome e não dá
     para acertar arrastando. */
  const fn = recortar('function renderStack(');
  assert.match(fn, /if \(vazia\) \{/);
  assert.match(fn, /alvo\.className = 'stack-vazia'/);
  assert.match(fn, /app\.stackEmptyHint/);
  assert.match(CSS, /\.stack-vazia\{/);
  assert.match(I18N, /'app\.stackEmptyHint'/);
});

/* ── 2. A pasta que se esvazia ───────────────────────────────────────── */

test('pasta COM NOME fica no quadro mesmo sem nota nenhuma', () => {
  const fn = recortar('function _reavaliarPastaApos(');
  assert.match(fn, /const batizada  = !!\(getStackTitles\(\)\[stackId\] \|\| ''\)\.trim\(\)/);
  assert.match(fn, /if \(batizada\) \{ renderStack\(stackId\); return; \}/,
    'a pasta criada de propósito voltou a sumir ao ficar vazia');
  // Pilha de arrasto nunca batizada continua se desfazendo.
  assert.match(fn, /if \(restantes\.length >= 2\) \{ renderStack\(stackId\); return; \}/);
  assert.match(fn, /removeStackTitle\(stackId\)/);
});

test('os quatro caminhos de saida da nota usam a MESMA regra', () => {
  /* Eram quatro contas de cabeça repetidas, e nenhuma previa o caso de sobrar
     zero. Uma função só para que a próxima não volte a divergir. */
  ['function unstackNote(', 'function _moveNoteIntoStack(', 'function stackNotes(']
    .forEach(nome => {
      assert.match(recortar(nome), /_reavaliarPastaApos\(/,
        nome + ' voltou a decidir sozinho o destino da pasta');
    });
  // O caminho de quem recebe a mudança do colega segue a mesma regra.
  const remoto = recortar('function _aplicarNotaRemota(');
  assert.match(remoto, /const batizada  = !!\(getStackTitles\(\)\[pastaAntes\] \|\| ''\)\.trim\(\)/);
  assert.match(remoto, /if \(batizada \|\| restantes\.length >= 2\)/,
    'a pasta do colega sumiria da minha tela ao ficar vazia');
});

test('"ja esta no quadro" desenha a pasta antes de rolar ate ela', () => {
  /* Sem isto o aviso apontava para uma pasta que não estava desenhada: não
     dava para ver a antiga nem criar uma nova. É a saída de quem já ficou com
     uma pasta perdida pelo bug. */
  const fn = recortar('async function criarPastaVazia(');
  assert.match(fn, /if \(!document\.querySelector\('\.stack-wrap\[data-stack="' \+ jaExiste \+ '"\]'\)\) \{\s*\n\s*renderStack\(jaExiste\);/);
  assert.match(fn, /scrollIntoView/);
});

test('a largura da pasta nao vira um id de pasta', () => {
  /* `stk_x_w` guarda largura. Fora da lista de sufixos, ela era lida como o id
     de uma pasta que não existe. */
  const fn = recortar('function _todosOsStackIds(');
  assert.match(fn, /_\(smart\|x\|y\|w\|color\|ord\)\$/);
});
