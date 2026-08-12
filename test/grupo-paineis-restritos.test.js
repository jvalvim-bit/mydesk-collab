'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   PAINÉIS RESTRITOS DO GRUPO — só o líder delega
   ═══════════════════════════════════════════════════════════════════════
   Um grupo tem três painéis que nem todo mundo deveria abrir: Recrutamento,
   Financeiro e Clientes. Quem decide é o dono do grupo, e a escolha mora em
   `groups/{id}/paineis/{painel}/{@}`.

   Duas coisas que este arquivo protege, e que são fáceis de quebrar sem
   perceber:

   1. **A trava tem de valer nas TRÊS portas.** O painel abre pelo botão da
      barra, pela troca de modelo e pelo menu de modelos. Fechar uma e esquecer
      outra dá uma trava que parece funcionar até alguém achar o caminho de
      lado — e o pior tipo de permissão é a que se acredita ter.

   2. **Fora de grupo nada disso existe.** Workspace pessoal e 1:1 não têm
      líder nem membros; se a pergunta de permissão respondesse "não" ali, o
      recurso sumiria para quem trabalha sozinho, que é a maioria.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP  = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const CSS  = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
const REGRAS = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'database.rules.json'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, ''));

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

/* renderGroupsTab monta HTML em template string, e uma delas tem `}` em coluna
   zero — o corte por fecha-chaves para no meio do cartão. Aqui vale a fatia
   por tamanho. */
function recortarGrande(nome, tamanho) {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, i + tamanho);
}

/* A regra de acesso rodando de verdade, com o estado global que ela lê. */
function montar({ grupo = 'g1', dono = 'lider', eu = 'membro', paineis = {} } = {}) {
  const ctx = vm.createContext({ Boolean, Object, String });
  vm.runInContext(`
    let _activeGroupWs = ${grupo ? `{ groupId: '${grupo}' }` : 'null'};
    let _donoDoGrupoAtivo = ${dono === null ? 'null' : `'${dono}'`};
    let _paineisGrupo = ${paineis === null ? 'null' : JSON.stringify(paineis)};
    const CU = { username: '${eu}' };
  ` + recortar('function _souLiderDoGrupo(')
    + '\n' + recortar('function podeAbrirPainelGrupo('), ctx);
  return ctx;
}

/* ── A regra ─────────────────────────────────────────────────────────── */

test('fora de grupo a pergunta nao se aplica — tudo liberado', () => {
  /* Quadro pessoal e 1:1 nao tem lider nem membros. Responder "nao" aqui
     tiraria os tres paineis de quem trabalha sozinho. */
  const ctx = montar({ grupo: null });
  ['rh', 'financeiro', 'clientes'].forEach(k =>
    assert.equal(ctx.podeAbrirPainelGrupo(k), true, k + ' fechou fora de grupo'));
});

test('o lider entra em tudo, sem precisar se delegar', () => {
  const ctx = montar({ dono: 'lider', eu: 'lider', paineis: {} });
  ['rh', 'financeiro', 'clientes'].forEach(k =>
    assert.equal(ctx.podeAbrirPainelGrupo(k), true));
});

test('membro sem delegacao nao entra', () => {
  const ctx = montar({ paineis: {} });
  ['rh', 'financeiro', 'clientes'].forEach(k =>
    assert.equal(ctx.podeAbrirPainelGrupo(k), false, k + ' abriu sem delegacao'));
});

test('a delegacao e por painel, e nao um cracha geral', () => {
  const ctx = montar({ paineis: { clientes: { membro: true }, rh: { outro: true } } });
  assert.equal(ctx.podeAbrirPainelGrupo('clientes'), true);
  assert.equal(ctx.podeAbrirPainelGrupo('rh'), false, 'delegacao de outra pessoa valeu para mim');
  assert.equal(ctx.podeAbrirPainelGrupo('financeiro'), false);
});

test('enquanto a delegacao nao chegou, ninguem e barrado', () => {
  /* `null` e "ainda nao li", nao "ninguem tem acesso". Barrar aqui faria o
     painel piscar fechado no meio segundo entre entrar no grupo e o no
     chegar — e quem visse isso concluiria que perdeu o acesso. */
  const ctx = montar({ paineis: null });
  assert.equal(ctx.podeAbrirPainelGrupo('financeiro'), true);
});

/* ── As três portas ──────────────────────────────────────────────────── */

test('a trava esta nas TRES portas de entrada do painel', () => {
  // 1. O botão da barra.
  const toggle = recortar('function toggleCRMView(');
  assert.match(toggle, /if \(!podeAbrirPainelGrupo\(alvo\)\)/,
    'da para entrar pelo botao da barra sem permissao');
  /* E fechar continua livre: a trava so age ao ABRIR. Um painel que nao fecha
     seria uma armadilha, nao uma permissao. */
  assert.match(toggle, /if \(!_crmMode\) \{/);

  // 2. A troca de modelo.
  const trocar = recortar('function _crmTrocarModelo(');
  assert.match(trocar, /if \(!podeAbrirPainelGrupo\(k\)\) \{ _avisarPainelBloqueado\(k\); return; \}/,
    'da para entrar trocando de modelo');

  // 3. O menu.
  const menu = recortar('function crmAlterarModelo(');
  assert.match(menu, /const pode = podeAbrirPainelGrupo\(chave\)/);
  assert.match(menu, /onClick: pode \? onClick : \(\) => _avisarPainelBloqueado\(chave\)/,
    'o item bloqueado do menu ainda executava a acao');
});

test('o painel bloqueado continua NA LISTA, com cadeado', () => {
  /* Sumir da lista faria quem procura o Financeiro concluir que ele nao
     existe, em vez de entender que falta pedir acesso. */
  const menu = recortar('function crmAlterarModelo(');
  assert.match(menu, /label: pode \? label : '🔒 ' \+ label/);
  assert.match(menu, /app\.panelNeedsLeader/);
});

test('quem entra sem acesso ao painel padrao cai num que pode abrir', () => {
  /* O financeiro e o padrao de quem nunca escolheu. Sem isto, quem so tem
     Clientes esbarrava num "nao pode" ao abrir o painel pela primeira vez. */
  const toggle = recortar('function toggleCRMView(');
  assert.match(toggle, /const aberto = PAINEIS_GRUPO\.map\(p => p\.chave\)\.find\(podeAbrirPainelGrupo\)/);
  assert.match(toggle, /if \(!aberto\) \{ _avisarPainelBloqueado\(alvo\); return; \}/);
});

test('a recusa diz de quem depende a liberacao', () => {
  const fn = recortar('function _avisarPainelBloqueado(');
  assert.match(fn, /app\.panelBlockedBy/);
  assert.match(I18N, /'app\.panelBlockedBy'.*Peça a @\{lider\}/);
});

test('perder o acesso com o painel aberto fecha o painel', () => {
  const fn = recortar('function _ouvirPaineisDoGrupo(');
  assert.match(fn, /if \(_crmMode && !podeAbrirPainelGrupo\(_crmPainelAtual\(\)\)\)/);
  assert.match(fn, /toggleCRMView\(\)/);
  assert.match(fn, /app\.panelAccessRevoked/);
});

/* ── Quem pode delegar ───────────────────────────────────────────────── */

test('so o lider abre a tela de permissoes', () => {
  const fn = recortar('async function abrirPermissoesDoGrupo(');
  assert.match(fn, /if \(group\.owner !== CU\.username\)/);
  assert.match(fn, /app\.onlyLeaderPermissions/);
});

test('a escrita da delegacao ja era do dono pela regra do grupo', () => {
  /* `paineis` NAO tem `.write` proprio de proposito: a regra do $groupId ja
     exige ser o dono, e no Realtime Database um filho so SOMA permissao ao
     pai. Escrever regra ali so poderia afrouxar. */
  const g = REGRAS.rules.groups.$groupId;
  assert.match(g['.write'], /data\.child\('owner'\)/,
    'a raiz do grupo deixou de ser do dono');
  assert.ok(g.paineis, 'sumiu o no de paineis das regras');
  assert.equal(g.paineis['.write'], undefined,
    'paineis ganhou .write proprio — isso so pode afrouxar o que ja estava fechado');
  // O formato: só os três painéis, só `true`, e só para quem é membro.
  assert.match(g.paineis.$painel['.validate'], /'rh'[\s\S]*'financeiro'[\s\S]*'clientes'/);
  assert.match(g.paineis.$painel.$membro['.validate'], /newData\.isBoolean\(\)/);
  assert.match(g.paineis.$painel.$membro['.validate'], /members'\)\.child\(\$membro\)/,
    'daria para delegar painel a quem nao esta no grupo');
});

test('o lider nao aparece na grade — ele entra por ser quem e', () => {
  const fn = recortar('async function abrirPermissoesDoGrupo(');
  assert.match(fn, /filter\(m => m !== group\.owner\)/,
    'uma linha marcada que nao da para desmarcar e um controle que mente');
});

test('a grade so grava no Salvar, e por caminho', () => {
  const fn = recortar('async function abrirPermissoesDoGrupo(');
  assert.match(fn, /const rascunho = \{\}/, 'gravar a cada clique avisaria o outro lado a cada dedo torto');
  assert.match(fn, /patch\[p\.chave \+ '\/' \+ m\] = rascunho\[p\.chave\]\[m\] \? true : null/);
  assert.match(fn, /fbUpdate\('groups\/' \+ group\.id \+ '\/paineis', patch\)/);
});

test('a tela diz o limite da trava', () => {
  /* Quem define permissao precisa saber o que ela vale. Os registros moram no
     mesmo no das notas, que todo membro le. */
  const fn = recortar('async function abrirPermissoesDoGrupo(');
  assert.match(fn, /app\.groupPermissionsLimit/);
  assert.match(I18N, /'app\.groupPermissionsLimit'.*Não é um cofre/);
});

/* ── O estado não vaza entre grupos ──────────────────────────────────── */

test('sair do grupo solta a delegacao e o dono', () => {
  /* Mante-los em memoria faria a proxima tela decidir acesso com a regra do
     grupo anterior. Sao quatro saidas: logout, encerrar, sair, e a troca. */
  const saidas = APP.match(/_pararPaineisDoGrupo\(\); _donoDoGrupoAtivo = null;/g) || [];
  assert.equal(saidas.length, 4,
    'alguma saida de grupo deixou a delegacao do grupo anterior de pe');
  assert.match(recortar('function _pararPaineisDoGrupo('), /_paineisGrupo = null/);
});

test('o dono vem do BANCO, e nao do cache do painel social', () => {
  /* `_myGroups` so existe depois de alguem abrir o painel social — da para
     entrar num workspace de grupo por convite sem nunca passar por la, e ai o
     dono viria undefined, o que faria ate o lider virar nao-lider. */
  const fn = recortar('async function switchToGroupWorkspace(');
  assert.match(fn, /_donoDoGrupoAtivo = await fbGet\('groups\/' \+ groupId \+ '\/owner'\)/);
  assert.match(fn, /_ouvirPaineisDoGrupo\(groupId\)/);
});

/* ── A barra de contexto do grupo ────────────────────────────────────── */

test('a barra do grupo existe, e fora do fluxo quando nao ha grupo', () => {
  assert.match(HTML, /<div id="grupo-barra" hidden><\/div>/);
  assert.match(CSS, /#grupo-barra\[hidden\]\{display:none;\}/);
  const fn = recortar('async function pintarBarraDoGrupo(');
  assert.match(fn, /if \(!_activeGroupWs\) \{/);
});

test('o piso das notas soma a altura da barra do grupo', () => {
  /* A nota e position:fixed (coordenada de tela) e a barra fica entre a
     toolbar e o quadro. Sem somar, a primeira fileira de notas nasce por
     baixo dela dentro de um grupo. */
  assert.match(APP, /function _minNoteY\(\) \{ return _alturaBarra\(\) \+ _alturaBarraGrupo\(\) \+ 12; \}/);
  const alt = recortar('function _alturaBarraGrupo(');
  assert.match(alt, /b\.hidden \|\| b\.offsetParent === null/,
    'barra escondida precisa medir zero, senao empurra o quadro sem estar na tela');

  /* E a altura fica em CACHE: `_minNoteY()` roda a cada mousemove do arrasto,
     e ler offsetHeight ali obriga o navegador a refazer o layout no meio do
     movimento. Os tres momentos em que a barra muda de altura invalidam. */
  assert.match(alt, /if \(_altBarraGrupo !== null\) return _altBarraGrupo;/);
  const invalidacoes = APP.match(/_invalidarAlturaBarraGrupo\(\);/g) || [];
  assert.equal(invalidacoes.length, 3,
    'pintar, esconder e o resize precisam invalidar o cache da altura');
});

test('esconder a barra e sincrono', () => {
  /* Quem sai do grupo ja zerou `_activeGroupWs`; esperar um await deixaria o
     nome do grupo anterior na tela por cima do quadro pessoal. */
  const fn = recortar('function _esconderBarraDoGrupo(');
  assert.equal(/await/.test(fn), false);
  assert.match(fn, /host\.hidden = true/);
  assert.match(fn, /_limitarAlturaDeTodasAsNotas\(\)/);
  const saidas = APP.match(/_esconderBarraDoGrupo\(\);/g) || [];
  assert.equal(saidas.length, 4, 'alguma saida de grupo deixou a barra na tela');
});

test('os chips da barra se repintam quando a delegacao muda', () => {
  const fn = recortar('function _ouvirPaineisDoGrupo(');
  assert.match(fn, /_pintarChipsDePainel\(\)/);
  const pintar = recortar('function _pintarChipsDePainel(');
  assert.match(pintar, /\[data-painel-chip\]/);
  assert.match(recortar('async function pintarBarraDoGrupo('), /data-painel-chip="\$\{p\.chave\}"/);
});

/* ── O cartão do grupo ───────────────────────────────────────────────── */

test('o cartao do grupo mostra gente, lider e paineis', () => {
  const fn = recortarGrande('async function renderGroupsTab(', 9800);
  assert.match(fn, /row\.className = 'sp-group-row gc-card'/);
  assert.match(fn, /gc-avs/,      'sumiram os avatares dos membros');
  assert.match(fn, /gc-selo-lider|gc-selo-membro/, 'o cartao nao diz quem manda');
  assert.match(fn, /gc-chips/,    'o cartao nao diz o que posso abrir la dentro');
  ['.gc-card{', '.gc-chip{', '.gc-av{'].forEach(sel =>
    assert.ok(CSS.includes(sel), 'falta o estilo ' + sel));
});

test('excluir e sair sairam da fileira e passaram a perguntar', () => {
  /* As duas ficavam do lado de "abrir" e "chat", com a mesma cara — e a mais
     destrutiva era um ✕, o mesmo simbolo que em todo o resto do app quer
     dizer "fechar". */
  const fn = recortarGrande('async function renderGroupsTab(', 9800);
  assert.match(fn, /_confirmarSaidaDoGrupo\(group, true\)/);
  assert.match(fn, /_confirmarSaidaDoGrupo\(group, false\)/);
  const conf = recortar('function _confirmarSaidaDoGrupo(');
  assert.match(conf, /app\.deleteGroupQ/);
  assert.match(conf, /app\.leaveGroupQ/);
});

test('"Ver membros" chama a funcao, e nao um clique sintetico no cartao', () => {
  /* Bug relatado: o item do menu nao mostrava nada. Ele fazia `row.click()`
     para reaproveitar o handler do cartao — um clique sintetico que precisa
     atravessar as guardas daquele handler, o fechamento do menu e ainda cair
     no lado certo de um alternador. Chamar a funcao nao depende de nada
     disso. */
  const fn = recortarGrande('async function renderGroupsTab(', 9800);
  assert.equal(/onClick: \(\) => row\.click\(\)/.test(fn), false,
    'voltou a depender de um clique sintetico no cartao');
  assert.match(fn, /onClick: \(\) => alternarMembrosDoGrupo\(row, group, members, presences, true\)/);
  // O cartão continua abrindo a mesma gaveta, mas alternando.
  assert.match(fn, /alternarMembrosDoGrupo\(row, group, members, presences\);/);
});

test('clicar no menu do painel nao fecha o painel', () => {
  /* ESTA ERA A CAUSA de "Ver membros nao mostra nada". Menus e modais nascem
     no `body` para escapar do overflow, entao `panel.contains(e.target)` da
     falso e o clique no proprio menu era lido como "clicou fora". A lista era
     inserida no lugar certo e o painel se fechava em volta dela — sem erro,
     sem sobra, nada na tela.

     So "Ver membros" mostrava o sintoma, porque e a unica das acoes daquele
     menu cujo resultado fica DENTRO do painel; as outras abrem modal por cima
     e o fechamento passava despercebido. */
  const i = APP.indexOf('FECHAR AO CLICAR FORA');
  assert.ok(i > 0, 'sumiu o fechador de clique-fora do painel social');
  const fechador = APP.slice(i, i + 1400);
  assert.match(fechador, /if \(e\.target\.closest && e\.target\.closest\(CAMADAS_FLUTUANTES\)\) return;/);

  // A lista das camadas fica num lugar so, para o proximo popover nao precisar
  // ser lembrado em cada clique-fora que existir.
  const lista = recortar("const CAMADAS_FLUTUANTES = [", '].join(\',\');');
  ['.cdash-menu', '.modal-bg', '.confirm-clear-pop', '.status-menu-pop'].forEach(c =>
    assert.ok(lista.includes("'" + c + "'"), 'faltou ' + c + ' nas camadas flutuantes'));

  /* E a constante precisa ser declarada ANTES do uso: `const` nao sobe, e
     depender da ordem em que o callback roda e sorte, nao garantia. */
  assert.ok(APP.indexOf('const CAMADAS_FLUTUANTES') < APP.indexOf('e.target.closest(CAMADAS_FLUTUANTES)'),
    'a constante ficou depois do uso');
});

test('quem pede "Ver membros" no menu sempre VE', () => {
  /* Alternar aqui devolveria um fechamento a quem pediu para abrir, se a
     gaveta ja estivesse aberta pelo clique no cartao. */
  const fn = recortar('function alternarMembrosDoGrupo(');
  assert.match(fn, /abrirSempre = false/);
  assert.match(fn, /if \(!abrirSempre\) \{ aberta\.remove\(\); return; \}/);
  // E o dono continua podendo remover quem nao e ele mesmo.
  assert.match(fn, /if \(souDono && m !== CU\.username && !ehDono\)/);
  assert.ok(CSS.includes('.gm-lista{'), 'falta o estilo da gaveta de membros');
});

test('so o lider ve o atalho de permissoes no cartao', () => {
  const fn = recortarGrande('async function renderGroupsTab(', 9800);
  const i = fn.indexOf("row.querySelector('.gc-menu')");
  assert.ok(i > 0);
  const menu = fn.slice(i, i + 900);
  assert.match(menu, /if \(isOwner\) \{[\s\S]{0,400}abrirPermissoesDoGrupo/);
});
