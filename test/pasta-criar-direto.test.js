'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   CRIAR UMA PASTA SEM SABER O TRUQUE
   ═══════════════════════════════════════════════════════════════════════
   Até aqui, pasta só nascia arrastando uma nota em cima de outra. Quem sabe
   disso cria em dois segundos; quem não sabe nunca descobre que o recurso
   existe — e "arraste uma nota sobre outra" não é uma coisa que se deduza
   olhando a tela. Pior: o tipo de pasta (a que aplica status a tudo que
   entra) só aparecia DEPOIS desse arrasto, então era um recurso escondido
   atrás de outro.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const HANDLERS = fs.readFileSync(path.join(RAIZ, 'docs/js/handlers-app.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

test('o card da pasta esta na tela de nova nota, e ligado', () => {
  assert.match(HTML, /id="pick-stack"/);
  assert.match(HTML, /data-h="a53"/);
  assert.match(HANDLERS, /\['a53', 'click', function \(event\) \{ criarPastaVazia\(\) \}\]/);
  // O caminho antigo continua valendo: ele nao foi trocado, foi somado.
  assert.match(APP, /const ehPastaExistente/);
});

test('a pasta nasce com o tipo ja perguntado', () => {
  /* A pasta de status e o recurso que mais gente nao achava; deixa-lo para
     depois seria esconder de novo o que se quer mostrar. */
  const fn = recortar('async function criarPastaVazia(');
  assert.match(fn, /await perguntarTipoDePasta\(\)/);
  assert.match(fn, /\[stackId \+ '_smart'\]: escolha\.kind \|\| null/);
  assert.match(fn, /if \(!escolha \|\| !escolha\.titulo\) return;/,
    'fechar a pergunta sem escolher nao pode criar pasta sem nome');
});

test('pasta de status que ja existe nao nasce de novo', () => {
  /* Ficariam duas "Andamento", e a nota que mudasse de status entraria numa
     ou na outra sem criterio visivel. */
  const fn = recortar('async function criarPastaVazia(');
  assert.match(fn, /_smartStackDuplicada\(escolha\.kind, null\)/);
  assert.match(fn, /app\.stackAlreadyThere/);
  // E leva o olho ate a que ja existe, em vez de so recusar.
  assert.match(fn, /scrollIntoView/);
});

test('a pasta nasce onde a pessoa esta olhando', () => {
  /* Em 0,0 ela criaria e nao veria nada acontecer. */
  const fn = recortar('async function criarPastaVazia(');
  assert.match(fn, /board\?\.scrollLeft/);
  assert.match(fn, /board\?\.clientWidth/);
  assert.match(fn, /\[stackId \+ '_x'\]/);
  assert.match(fn, /\[stackId \+ '_y'\]/);
  assert.match(fn, /Math\.max\(12,/, 'coordenada negativa poria a pasta fora do quadro');
});

test('pasta vazia se desenha — e pasta apagada, nao', () => {
  const fn = recortar('function renderStack(');
  assert.match(fn, /const vazia = !stackNs\.length;/);
  /* Existir e ter titulo no mapa: pasta que perdeu o titulo foi apagada e
     nao volta a ser desenhada. */
  assert.match(fn, /if \(vazia && !getStackTitles\(\)\[stackId\]\) return;/);
  assert.match(fn, /if \(vazia && !temSalvo\) return;/);
  // E o codigo que dependia da primeira nota deixou de assumir que ela existe.
  assert.match(fn, /const primeira = stackNs\[0\] \|\| null;/);
  assert.match(fn, /z: primeira \? primeira\.z : _proximoZ\(\)/);
});

test('a tela diz o que fazer em seguida', () => {
  /* Uma pasta vazia no meio do quadro, sem instrucao, e um retangulo que
     ninguem sabe para que serve. */
  const fn = recortar('async function criarPastaVazia(');
  assert.match(fn, /app\.stackCreated/);
});

/* ═══════════════════════════════════════════════════════════════════════
   E DEPOIS, COMO SE APAGA?
   ═══════════════════════════════════════════════════════════════════════
   A pasta só sabia se desfazer pelo fim: tirando as notas uma a uma, a
   última a sair levava a pasta junto. Isso bastava enquanto TODA pasta
   tinha nota dentro — a única forma de criar uma era juntando duas. A pasta
   vazia não tem nenhuma nota para tirar: ela ficava no quadro sem caminho
   de saída, e as de teste se acumulavam.
   ═══════════════════════════════════════════════════════════════════════ */
const vm = require('node:vm');

function montarExclusao({ dentro = [], titulo = 'Andamento', confirmar = true } = {}) {
  const feito = { removidos: [], salvou: 0, wrapSumiu: false, toasts: [], alturas: [] };
  const elementos = new Map(dentro.map(n => [n.id, { style: {}, id: n.id }]));
  const wrap = {
    getBoundingClientRect: () => ({ left: 300, top: 200 }),
    remove: () => { feito.wrapSumiu = true; },
  };
  const ctx = vm.createContext({
    getStackNotes: () => dentro,
    getStackTitles: () => ({ stk_1: titulo }),
    removeStackTitle: id => { feito.removidos.push(id); return Promise.resolve(); },
    saveNotes: () => { feito.salvou++; },
    toast: (i, t) => feito.toasts.push(t),
    _appText: (chave, padrao) => padrao,
    _proximoZ: () => 42,
    _limitarAlturaNota: (el, n) => feito.alturas.push(n.id),
    _confirmarExcluirPasta: () => Promise.resolve(confirmar),
    document: {
      querySelector: sel => sel.startsWith('.stack-wrap') ? wrap
        : elementos.get((sel.match(/data-id="([^"]+)"/) || [])[1]) || null,
      getElementById: () => ({ appendChild: () => {} }),
    },
    Math, String, Number, Promise, Object,
  });
  vm.runInContext(recortar('async function excluirPasta('), ctx);
  return { ctx, feito, elementos };
}

test('pasta vazia sai sem perguntar nada', () => {
  /* Nao existe resposta a "tem certeza?" que mude alguma coisa: nao ha o que
     perder. Perguntar seria so mais um clique entre a pessoa e a limpeza. */
  const fn = recortar('async function excluirPasta(');
  assert.match(fn, /if \(dentro\.length && !\(await _confirmarExcluirPasta\(/);
});

test('excluir pasta vazia tira ela do quadro e do banco', async () => {
  const { ctx, feito } = montarExclusao({ dentro: [] });
  await ctx.excluirPasta('stk_1');
  assert.equal(feito.wrapSumiu, true, 'a pasta continuou desenhada');
  assert.deepEqual(feito.removidos, ['stk_1'], 'o titulo ficou no banco e ela volta no F5');
  assert.equal(feito.salvou, 1);
});

test('com notas dentro, NENHUMA nota e apagada — elas voltam para o quadro', async () => {
  /* Apagar a pasta e o conteudo junto seria dar dois significados ao mesmo
     botao, e o mais destrutivo dos dois e o que ninguem espera. */
  const dentro = [
    { id: 'n1', stackId: 'stk_1', stackOrder: 0 },
    { id: 'n2', stackId: 'stk_1', stackOrder: 1 },
  ];
  const { ctx } = montarExclusao({ dentro });
  await ctx.excluirPasta('stk_1');
  assert.equal(dentro.length, 2, 'sumiu nota');
  assert.equal(dentro[0].stackId, null);
  assert.equal(dentro[1].stackId, null);
});

test('as notas reaparecem onde a pasta estava, e nao empilhadas no mesmo pixel', async () => {
  const dentro = [{ id: 'n1', stackId: 'stk_1' }, { id: 'n2', stackId: 'stk_1' }];
  const { ctx } = montarExclusao({ dentro });
  await ctx.excluirPasta('stk_1');
  assert.equal(dentro[0].x, 324);   // 300 + 24
  assert.equal(dentro[0].y, 224);
  assert.notEqual(dentro[1].x, dentro[0].x, 'as duas cairam no mesmo lugar');
});

test('a nota que sai tem a altura recalculada', async () => {
  /* Mesmo motivo de unstackNote: o teto de altura foi fixado com o `y` de
     quando ela esteve solta pela ultima vez. Sem recalcular, ela volta
     espremida em poucos pixels e so um F5 conserta. */
  const dentro = [{ id: 'n1', stackId: 'stk_1' }];
  const { ctx, feito } = montarExclusao({ dentro });
  await ctx.excluirPasta('stk_1');
  assert.deepEqual(feito.alturas, ['n1']);
});

test('a nota que sai nao e puxada de volta pela pasta automatica', async () => {
  /* Ela saiu por vontade da pessoa. Sem marcar isso, a pasta de status a
     recolhe no proximo redesenho e a exclusao parece nao ter funcionado. */
  const dentro = [{ id: 'n1', stackId: 'stk_1' }];
  const { ctx } = montarExclusao({ dentro });
  await ctx.excluirPasta('stk_1');
  assert.equal(dentro[0].foraDePasta, true);
});

test('cancelar a pergunta nao mexe em nada', async () => {
  const dentro = [{ id: 'n1', stackId: 'stk_1' }];
  const { ctx, feito } = montarExclusao({ dentro, confirmar: false });
  await ctx.excluirPasta('stk_1');
  assert.equal(dentro[0].stackId, 'stk_1', 'a nota saiu da pasta mesmo com o cancelar');
  assert.deepEqual(feito.removidos, []);
  assert.equal(feito.salvou, 0);
});

test('a pergunta diz que as notas nao serao apagadas', () => {
  /* "Excluir pasta" sozinho se le como "excluir o que esta dentro". */
  const fn = recortar('function _confirmarExcluirPasta(');
  assert.match(fn, /app\.deleteStackDesc/);
  assert.match(fn, /Nenhuma nota é apagada/);
});

test('o botao esta no cabecalho e nao vira arrasto', () => {
  /* O cabecalho inteiro arrasta a pasta: sem parar a propagacao, o mousedown
     no botao vira arrasto e o clique nunca chega. */
  const fn = recortar('function renderStack(');
  assert.match(fn, /class="stack-del-btn"/);
  assert.match(APP, /btnExcluir\.addEventListener\('mousedown', e => e\.stopPropagation\(\)\)/);
  assert.match(APP, /excluirPasta\(stackId\)/);
  const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
  assert.match(CSS, /\.stack-wrap:hover \.stack-del-btn\{opacity:1;\}/,
    'um lixo sempre aceso em cada pasta transforma o quadro num campo minado');
});

/* ═══════════════════════════════════════════════════════════════════════
   PASTA VAZIA TAMBEM SE ARRUMA
   ═══════════════════════════════════════════════════════════════════════
   Ela entrava na lista de pastas do Reorganizar e era descartada na linha
   seguinte, por nao ter nota dentro. Na tela: tudo em volta se organizava e
   as pastas recem-criadas ficavam espalhadas onde estavam — o Reorganizar
   parecia simplesmente nao funcionar.
   ═══════════════════════════════════════════════════════════════════════ */
test('o reorganizar posiciona a pasta vazia', () => {
  const fn = recortar('function _applySortFilter(');
  assert.equal(/const members = getStackNotes\(sid\);\s*\n\s*if \(!members\.length\) return;/.test(fn),
    false, 'a pasta vazia voltou a ser descartada');
  /* Existe pasta se ela tem nota OU tem titulo salvo — a mesma conta que
     renderStack faz. Exigir as duas coisas deixaria de fora ou a pasta de
     arrastar (que nasce sem titulo) ou a do botao (que nasce vazia). */
  assert.match(fn, /getStackNotes\(sid\)\.length \|\| getStackTitles\(\)\[sid\]/);
});

test('as alturas sao medidas ANTES de mexer em qualquer posicao', () => {
  /* Era um laco so: escrevia left/top de uma pasta e ja lia a altura dela
     para saber onde comeca a seguinte. Ler altura logo depois de escrever
     posicao obriga o navegador a refazer o layout no meio do caminho, e o
     numero que volta e o do estado daquele instante — nao o do estado final.
     Dai o vao entre as pastas depois de Reorganizar, que sumia ao recolher e
     expandir: o recolher remede tudo com a tela ja parada. */
  const fn = recortar('function _applySortFilter(');
  assert.match(fn, /const alturas = pastasVivas\.map\(/);
  const medir   = fn.indexOf('const alturas =');
  const colocar = fn.indexOf('wrapEl.style.top  = stackY');
  assert.ok(medir > 0 && colocar > medir, 'voltou a medir depois de posicionar');
  assert.match(fn, /stackY \+= alturas\[i\] \+ GAP;/,
    'a altura da vez tem de sair da medicao, e nao de uma leitura nova');
});

test('dinheiro nao aparece no recrutamento', () => {
  /* Fluxo de caixa e Despesas nasceram na barra do painel financeiro e
     ficavam visiveis no de recrutamento, projetando recebimento de contratos
     ao lado do funil de candidatos — duas contas que nao se somam. */
  const fn = recortar('function _crmAplicarModelo(');
  assert.match(fn, /\['crm-btn-fluxo', 'crm-btn-despesas'\]/);
  assert.match(fn, /b\.style\.display = rh \? 'none' : '';/);
});
