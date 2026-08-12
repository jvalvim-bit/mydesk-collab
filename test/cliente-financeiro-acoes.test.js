'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O CLIENTE QUE SUMIA, E O FINANCEIRO QUE IA JUNTO
   ═══════════════════════════════════════════════════════════════════════
   Dois relatos da mesma tela, e nenhum dos dois era o que parecia.

   1. **"O segundo cliente some e não consigo trazer de volta."** Não sumia:
      era filtrado. O botão "Ver todas as ações" aplicava um filtro de CARTEIRA
      — só quem tem retorno nos próximos sete dias — para responder a uma
      pergunta sobre AGENDA. Quem tinha dois clientes ficava com um, o aviso de
      "Limpar filtros" só existia dentro do estado vazio (que nunca aparecia,
      porque sobrou um), e nada na tela dizia que havia um filtro ligado.

   2. **"Excluir cliente exclui no financeiro."** Verdade, e por construção:
      cliente e cobrança são o MESMO registro, lido por duas telas com
      perguntas diferentes. Que a carteira crie um financeiro para cada cliente
      é o desenho; que sair da carteira apague valores e vencimentos não é —
      essa é uma decisão de quem exclui, e por isso agora ela é perguntada.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const TELA = fs.readFileSync(path.join(RAIZ, 'docs/js/clientes-tela.js'), 'utf8');
const MODELO = fs.readFileSync(path.join(RAIZ, 'docs/js/clientes.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const I18N = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');

function recortar(fonte, nome, ate = '\n  }') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

/* O modelo rodando de verdade, como o app.js o alimenta. */
function montar(registros, agenda = []) {
  const ctx = {
    console, Date, Number, String, Math, Array, Object, Set, JSON,
    RegExp, Promise, isNaN, parseInt, parseFloat,
    _registrosClientes: () => registros || [],
    _agenda: agenda || [],
    _crmTodayLocalIso: () => '2026-08-05',
    _appText: (k, f, vars) => String(f || k).replace(/\{(\w+)\}/g,
      (achado, n) => (vars && vars[n] !== undefined ? String(vars[n]) : achado)),
    MD_RH: { modelo: () => 'clientes' },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(MODELO, ctx);
  return ctx.MD_CLI;
}

const cli = (id, e) => Object.assign({ id, type: 'client', name: 'Cliente ' + id }, e);

/* ── 1. Ver todas as ações ───────────────────────────────────────────── */

test('"Ver todas as acoes" abre as acoes, e nao filtra a carteira', () => {
  const fn = recortar(TELA, '  function cartaoProximasAcoes(');
  assert.match(fn, /onClick: \(\) => abrirTodasAsAcoes\(\)/);
  assert.equal(/M\(\)\.S\.filtros\.contato = 'semana'/.test(fn), false,
    'o botao voltou a esconder clientes da tabela para responder sobre agenda');

  const modal = recortar(TELA, '  function abrirTodasAsAcoes(');
  assert.match(modal, /M\(\)\.proximasAcoes\(\)/, 'a lista completa nao pode vir cortada');
  assert.equal(/S\.filtros/.test(modal), false, 'olhar a agenda voltou a mexer no filtro');
  assert.match(modal, /abrirCliente\(a\.clienteId, \{ irPara: 'acomp' \}\)/);
});

test('o filtro ligado aparece SEMPRE, e nao so quando zera a lista', () => {
  /* Bastava sobrar um cliente para que os escondidos não tivessem volta. */
  const fn = recortar(TELA, '  function repintarTabela(');
  const iBarra = fn.indexOf('barraDeFiltrosAtivos()');
  const iVazio = fn.indexOf('caixa.appendChild(vazio())');
  assert.ok(iBarra > 0 && iBarra < iVazio,
    'a barra de filtros ficou depois do retorno do estado vazio');

  const barra = recortar(TELA, '  function barraDeFiltrosAtivos(');
  assert.match(barra, /if \(!ligados\.length && !busca\) return null;/);
  assert.match(barra, /cli\.clearFilters/, 'falta a saida de "Limpar filtros"');
  assert.match(barra, /cli\.hiddenByFilter/, 'a barra nao diz quantos ficaram de fora');
  // Cada filtro sai sozinho, sem obrigar a zerar todos os outros.
  assert.match(barra, /cli-filtro-ficha-x/);
  assert.match(CSS, /\.cli-filtros-ativos\{/);
});

test('a ficha do filtro mostra o rotulo, e nao a chave interna', () => {
  const fn = recortar(TELA, '  function _rotuloDoFiltro(');
  assert.match(fn, /case 'contato':/);
  assert.match(fn, /CLI_CONTATO_ROTULOS/);
  assert.match(I18N, /'cli\.filteringBy'/);

  /* Visto no navegador: a ficha do filtro booleano `fora` saiu escrita
     "true". Todo filtro ligado precisa de um rotulo em portugues, e o que
     nao tiver cai no nome da chave — feio, mas legivel. */
  assert.match(fn, /case 'fora':/);
  assert.match(fn, /case 'arquivados':/);
  assert.match(fn, /\(valor === true\) \? chave : String\(valor\)/,
    'filtro booleano novo voltaria a aparecer como "true"');
  assert.match(I18N, /'cli\.chipOutOfWallet'/);
});

test('a lista de acoes nao escreve "1 acoes"', () => {
  /* Tambem visto no navegador. Frase no plural com um item so denuncia que
     ninguem leu a tela no caso mais comum de todos: o primeiro. */
  const fn = recortar(TELA, '  function abrirTodasAsAcoes(');
  assert.match(fn, /itens\.length === 1/);
  assert.match(fn, /cli\.actionsSummaryOne/);
  assert.match(fn, /atrasadas === 1/);
  assert.match(I18N, /'cli\.actionsSummaryOne': \['1 ação no total'/);
  assert.match(I18N, /'cli\.actionsLateOne'/);
});

/* ── 2. Excluir cliente x financeiro ─────────────────────────────────── */

test('excluir cliente oferece a saida que preserva o financeiro', () => {
  const fn = recortar(TELA, '  function excluir(r)');
  assert.match(fn, /alternativa: \{/, 'voltou a ser "cancelar ou destruir"');
  assert.match(fn, /updateRecord\(r\.id, \{ foraDaCarteira: true \}\)/);
  assert.match(fn, /cli\.deleteAlsoFinance/,
    'a pergunta precisa dizer que o financeiro vai junto');
  assert.match(fn, /deleteRecord\(r\.id\)/, 'o caminho de apagar de vez tem de continuar');

  // E o diálogo sabe desenhar essa terceira resposta.
  const conf = recortar(TELA, '  function _confirmarPerigo(');
  assert.match(conf, /if \(o\.alternativa\) \{/);
  assert.match(CSS, /\.confirm-clear-alt\{/);
});

test('a exclusao em lote oferece a mesma escolha', () => {
  const i = TELA.indexOf("acao(t('cli.delete', 'Excluir')");
  assert.ok(i > 0, 'sumiu a acao de excluir em lote');
  const bloco = TELA.slice(i, i + 1800);
  assert.match(bloco, /alternativa: \{/);
  assert.match(bloco, /foraDaCarteira: true/);
});

test('quem saiu da carteira continua no financeiro — e tem volta', () => {
  const a = cli('crm_1');
  const b = cli('crm_2', { foraDaCarteira: true });
  const M = montar([a, b]);

  assert.deepEqual([...M.carteira()].map(r => r.id), ['crm_1'],
    'quem saiu da carteira continua aparecendo na lista de clientes');

  M.S.filtros.fora = true;
  assert.deepEqual([...M.carteira()].map(r => r.id), ['crm_2'],
    'sem o filtro, sair da carteira seria um caminho sem volta');
  M.S.filtros.fora = false;

  /* O registro NÃO foi apagado: o financeiro lê a mesma lista, sem a marca. */
  assert.equal(M.foraDaCarteira(b), true);
  assert.equal(M.foraDaCarteira(a), false);

  // E o menu da linha oferece o caminho de volta só para quem está fora.
  const menu = recortar(TELA, '  function menuDaLinha(');
  assert.match(menu, /M\(\)\.foraDaCarteira\(r\)/);
  assert.match(menu, /cli\.backToWallet/);
  assert.match(recortar(TELA, '  async function voltarParaCarteira('),
    /foraDaCarteira: false/);
});

test('arquivado e fora-da-carteira sao estados diferentes', () => {
  /* Misturar os dois faria o arquivado sumir da busca por "Arquivados" só
     porque saiu da carteira, e vice-versa. */
  const M = montar([
    cli('crm_1'),
    cli('crm_2', { archived: true }),
    cli('crm_3', { foraDaCarteira: true }),
    cli('crm_4', { archived: true, foraDaCarteira: true }),
  ]);
  assert.deepEqual([...M.carteira()].map(r => r.id), ['crm_1']);
  M.S.filtros.arquivados = true;
  assert.deepEqual([...M.carteira()].map(r => r.id), ['crm_2']);
  M.S.filtros.arquivados = false;
  M.S.filtros.fora = true;
  assert.deepEqual([...M.carteira()].map(r => r.id).sort(), ['crm_3', 'crm_4']);
});

test('a marca conta como filtro ligado — senao a barra nao apareceria', () => {
  const M = montar([cli('crm_1')]);
  assert.equal(M.temFiltro(), false);
  M.S.filtros.fora = true;
  assert.equal(M.temFiltro(), true);
});

test('a carteira continua sendo a MESMA lista do financeiro', () => {
  /* Um `map` aqui criaria objeto novo, id novo e um cliente fantasma no banco
     a cada troca de modelo. A marca é lida do lado de quem pergunta. */
  const fn = recortar(APP, 'function _registrosClientes(', '\n}');
  assert.match(fn, /return _registrosFinanceiros\(\);/);
});

/* ── O que ligava os dois relatos ────────────────────────────────────── */

test('o cliente com agendamento e o sem agendamento convivem na lista', () => {
  /* O caminho exato do relato: cliente de formulário, agendamento criado na
     ficha dele, volta para a carteira. Antes, "Ver todas as ações" deixava só
     ele na tela e o outro cliente parecia ter sido apagado. */
  const M = montar(
    [cli('crm_1'), cli('crm_2')],
    [{ id: 'a1', clienteId: 'crm_1', data: '2026-08-07', titulo: 'Reunião' }],
  );
  assert.equal(M.proximasAcoes().length, 1);
  assert.deepEqual([...M.visiveis()].map(r => r.id).sort(), ['crm_1', 'crm_2'],
    'olhar a agenda de um cliente nao pode esconder o outro');
});
