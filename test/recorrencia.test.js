'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   RECORRÊNCIA
   ═══════════════════════════════════════════════════════════════════════
   Um cliente de mensalidade obrigava a criar doze registros à mão. Quem não
   fazia isso punha o contrato inteiro num registro só — e aí a taxa de
   recebimento passava a mentir: um contrato anual de R$ 12.000 aparecia
   como R$ 12.000 "a receber" no mês da assinatura, e o mês seguinte nascia
   vazio.

   O que este arquivo cobra é a conta das datas, que é onde mora o erro
   silencioso: fuso que recua um dia e dia 31 que escorrega para o dia 1.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

const ctx = vm.createContext({ Date, Number, String, Math, Array });
vm.runInContext('const RECORRENCIA_MAX = 60;', ctx);
vm.runInContext(recortar('function _crmSomarPeriodo('), ctx);
vm.runInContext(recortar('function _crmContarParcelas('), ctx);

test('a data da parcela seguinte nao passa por fuso', () => {
  /* `new Date('2026-01-31')` nasce em UTC: no Brasil ele ja e 30/01 as 21h,
     e a segunda parcela cairia um dia antes da primeira. */
  assert.equal(ctx._crmSomarPeriodo('2026-01-15', 'mensal', 1), '2026-02-15');
  assert.equal(ctx._crmSomarPeriodo('2026-01-15', 'mensal', 0), '2026-01-15');
  const fn = recortar('function _crmSomarPeriodo(');
  assert.equal(/new Date\(iso\)|new Date\(String\(iso\)\)/.test(fn), false,
    'voltou a construir Date a partir da string');
});

test('o dia 31 vira o ultimo dia do mes, e nao o dia 1 do seguinte', () => {
  /* Quem combinou "todo dia 31" nao combinou "todo dia 1". */
  assert.equal(ctx._crmSomarPeriodo('2026-01-31', 'mensal', 1), '2026-02-28');
  assert.equal(ctx._crmSomarPeriodo('2026-01-31', 'mensal', 3), '2026-04-30');
  // E o dia volta ao 31 quando o mes comporta: a base nao e reescrita.
  assert.equal(ctx._crmSomarPeriodo('2026-01-31', 'mensal', 2), '2026-03-31');
  // Ano bissexto.
  assert.equal(ctx._crmSomarPeriodo('2024-01-31', 'mensal', 1), '2024-02-29');
});

test('cada periodo anda o que promete', () => {
  assert.equal(ctx._crmSomarPeriodo('2026-03-10', 'semanal', 2), '2026-03-24');
  assert.equal(ctx._crmSomarPeriodo('2026-03-10', 'quinzenal', 1), '2026-03-25');
  assert.equal(ctx._crmSomarPeriodo('2026-03-10', 'bimestral', 1), '2026-05-10');
  assert.equal(ctx._crmSomarPeriodo('2026-03-10', 'trimestral', 2), '2026-09-10');
  assert.equal(ctx._crmSomarPeriodo('2026-03-10', 'anual', 1), '2027-03-10');
  // A virada de ano tem de andar junto.
  assert.equal(ctx._crmSomarPeriodo('2026-11-10', 'trimestral', 1), '2027-02-10');
});

test('a contagem inclui as duas pontas e para no fim', () => {
  assert.equal(ctx._crmContarParcelas('2026-01-10', '2026-12-10', 'mensal'), 12);
  assert.equal(ctx._crmContarParcelas('2026-01-10', '2026-12-09', 'mensal'), 11,
    'uma parcela que cai depois do fim nao conta');
  assert.equal(ctx._crmContarParcelas('2026-01-10', '2026-01-10', 'mensal'), 1);
  assert.equal(ctx._crmContarParcelas('2026-05-10', '2026-01-10', 'mensal'), 0,
    'fim antes do comeco nao gera nada');
  assert.equal(ctx._crmContarParcelas('', '2026-12-10', 'mensal'), 0);
});

test('ha teto de parcelas, contra o dedo escorregar na data', () => {
  /* Nao e limite de negocio: e trava contra criar oitocentos registros que
     alguem vai apagar um por um. */
  assert.equal(ctx._crmContarParcelas('2026-01-01', '2099-01-01', 'semanal'), 60);
  assert.match(APP, /const RECORRENCIA_MAX = 60;/);
});

test('cada parcela nasce em aberto, e nao com o status da primeira', () => {
  /* Copiar o status faria doze meses nascerem pagos porque a entrada foi
     quitada. */
  const fn = recortar('async function _crmGerarParcelas(');
  assert.match(fn, /status: 'pending', paidAmount: 0/);
  // E o vencimento de cada uma sai da conta, e nao da primeira.
  assert.match(fn, /dueDate: _crmSomarPeriodo\(base\.dueDate, tipo, i\)/);
  // A primeira parcela e o proprio registro salvo, e nao uma copia.
  assert.match(fn, /await updateRecord\(base\.id, \{\s*\n?\s*serieId/);
});

test('o limite do plano para no meio, em vez de recusar tudo', () => {
  /* As parcelas que couberam sao contratos reais e ja valem. */
  const fn = recortar('async function _crmGerarParcelas(');
  assert.match(fn, /const pode = _crmCanCreate\(\)/);
  assert.match(fn, /app\.repeatHitLimit/, 'parar em silencio esconde o que faltou');
});

test('apagar a serie apaga desta parcela PARA A FRENTE', () => {
  /* As anteriores aconteceram, e algumas foram pagas e tem recibo emitido:
     sumir com elas seria reescrever o passado da conta. */
  const fn = recortar('function confirmDeleteRecord(');
  assert.match(fn, /_crmParcelasDaSerie\(rec\.serieId, Number\(rec\.serieN \|\| 0\)\)/);
  assert.match(fn, /app\.deleteSeries/);
  assert.match(fn, /app\.deleteSeriesDesc/, 'a tela precisa dizer o que NAO sera tocado');
});

test('a linha da tabela mostra 3/12', () => {
  /* Sem isso, doze linhas iguais parecem doze clientes e a soma da carteira
     parece um erro. */
  const fn = recortar('function renderRecordsTable(');
  assert.match(fn, /crm-serie-chip/);
  assert.match(fn, /rec\.serieN \+ '\/' \+ rec\.serieDe/);
  assert.match(CSS, /\.crm-serie-chip\{/);
});

test('a previa diz quantas parcelas vao nascer, antes de nascerem', () => {
  /* Sem ela, a pessoa escolhe "todo mes ate dezembro" e descobre o resultado
     quando doze linhas aparecem na tabela — e ai ja e trabalho apagar. */
  assert.match(APP, /app\.repeatWillCreate/);
  assert.match(APP, /repSel\.addEventListener\('change', repRepintar\)/);
  assert.match(APP, /id="crm-m-rep-nota"/);
});

test('so registro NOVO oferece recorrencia', () => {
  /* Transformar um contrato que ja existe em serie mexeria em parcelas ja
     pagas, e nao ha resposta obvia para o que fazer com elas. */
  assert.match(APP, /\$\{isEdit \? \(data\.serieId \?/);
  assert.match(APP, /if \(!isEdit && repTipo && repFim && saved\.dueDate\)/);
});

/* ═══════════════════════════════════════════════════════════════════════
   AS PARCELAS FICAM SOB O CLIENTE, E NAO SOLTAS NA LISTA
   ═══════════════════════════════════════════════════════════════════════
   Uma serie de doze meses virava doze linhas com o mesmo nome, o mesmo
   valor e nada dizendo qual e qual. A tabela passava a ter doze "Padaria do
   Ze", e a leitura mais natural — doze clientes — era a errada.
   ═══════════════════════════════════════════════════════════════════════ */
test('a serie vira UMA linha, com as parcelas debaixo quando aberta', () => {
  const fn = APP.slice(APP.indexOf('function renderRecordsTable('),
                       APP.indexOf('function renderRecordsTable(') + 6000);
  assert.match(fn, /const seriesVistas = new Set\(\)/);
  assert.match(fn, /linhas\.push\(\{ tipo: 'serie'/);
  assert.match(fn, /_crmSeriesAbertas\.has\(rec\.serieId\)/);
  assert.match(fn, /linhas\.push\(\{ tipo: 'parcela', rec: p \}\)/);
});

test('com busca ou filtro a tabela NAO agrupa', () => {
  /* Quem procurou "outubro" quer ver a parcela de outubro, e nao a linha-mae
     do contrato que a contem — esconder o resultado atras de um clique seria
     responder a busca com outra pergunta. */
  const fn = APP.slice(APP.indexOf('function renderRecordsTable('),
                       APP.indexOf('function renderRecordsTable(') + 6000);
  assert.match(fn, /const agrupar = !_crmSearchQuery && !_crmTemFiltroAtivo\(\)/);
  const filtro = recortar('function _crmTemFiltroAtivo(');
  assert.match(filtro, /_crmFiltroStatus !== 'todos'/);
});

test('a linha da serie resume o contrato, e nao oferece acao sem alvo', () => {
  const fn = recortar('function _crmLinhaDaSerie(');
  assert.match(fn, /app\.instalmentCount/);
  assert.match(fn, /app\.instalmentPaidOf/);
  assert.match(fn, /app\.instalmentLate/);
  /* Pagamento e recibo sao de CADA parcela: oferece-los na linha do contrato
     seria oferecer uma acao sem alvo. */
  assert.equal(/crmStatusMenu|crmAcoesLinha/.test(fn), false,
    'a linha do contrato ganhou acao que pertence a parcela');
  /* A proxima e a primeira que ainda deve, na ordem das parcelas — uma
     parcela antiga em aberto continua sendo a proxima a resolver. */
  assert.match(fn, /const proxima = partes\.find\(p => _crmAReceber\(p\) > 0\)/);
});

test('a parcela aberta diz qual e, e fica recuada', () => {
  const fn = APP.slice(APP.indexOf('function renderRecordsTable('),
                       APP.indexOf('function renderRecordsTable(') + 9000);
  assert.match(fn, /app\.instalmentN/);
  assert.match(fn, /crm-row-parcela/);
  assert.match(CSS, /\.crm-row-parcela td\{/);
});

test('a serie aberta continua aberta quando a tabela se redesenha', () => {
  /* A tabela se redesenha inteira a cada mudanca de dado: uma serie que se
     fecha sozinha ao marcar um pagamento faria a pessoa perder o lugar. */
  assert.match(APP, /const _crmSeriesAbertas = new Set\(\)/);
});

/* ═══════════════════════════════════════════════════════════════════════
   A PILULA DA LINHA DO CONTRATO CLICA
   ═══════════════════════════════════════════════════════════════════════
   Ela era so um resumo: mesma cara da pilula clicavel das outras linhas,
   mesmo formato, mesma cor — e nada acontecia ao clicar. Um controle
   identico a um controle clicavel, que nao clica, e um defeito mesmo quando
   o dado que ele mostra esta certo.
   O alvo dela nao e o contrato inteiro (isso nao existe como acao): e a
   PROXIMA parcela em aberto, a mesma que a linha ja usa para mostrar o
   vencimento.
   ═══════════════════════════════════════════════════════════════════════ */
test('a pilula da serie aponta para a proxima parcela em aberto', () => {
  const fn = recortar('function _crmLinhaDaSerie(');
  assert.match(fn, /data-act="crmStatusSerie" data-id="\$\{xe\(proxima\.id\)\}"/);
  assert.match(fn, /role="button" tabindex="0"/, 'sem isto o teclado nao aciona');
  assert.match(fn, /app\.serieStatusHint/);
  // Contrato quitado nao tem proxima parcela: ali a pilula e so leitura.
  assert.match(fn, /proxima \? '' : ' crm-pill-fixa'/);
  assert.match(CSS, /\.crm-status-pill\.crm-pill-fixa\{cursor:default;\}/);
});

test('o menu diz QUAL parcela vai mudar', () => {
  /* "Pago" sem dizer qual parcela, na linha de um contrato de 14, se le como
     "contrato quitado". */
  const fn = recortar('function crmMenuDeStatusDaSerie(');
  assert.match(fn, /app\.instalmentTarget/);
  assert.match(fn, /rec\.serieN/);
  assert.match(fn, /rec\.dueDate/);
  const menu = recortar('function _cdashMenu(');
  assert.match(menu, /cdash-menu-tit/);
  assert.match(CSS, /\.cdash-menu-tit\{/);
  assert.match(APP, /crmStatusSerie: el\s+=> crmMenuDeStatusDaSerie\(el, el\.dataset\.id\)/);
});

test('clicar na pilula nao fecha a serie no mesmo gesto', () => {
  /* A linha inteira abre e fecha ao clique. Sem esta saida, o clique na
     pilula abria o menu e fechava a serie junto — e a parcela que ia mudar
     sumia da tela. */
  const fn = recortar('function _crmLinhaDaSerie(');
  assert.match(fn, /if \(e\.target\.closest\('\[data-act\]'\)\) return;/);
  // E a serie se abre para a mudanca acontecer a vista.
  assert.match(recortar('function crmMenuDeStatusDaSerie('),
    /_crmSeriesAbertas\.add\(rec\.serieId\)/);
});
