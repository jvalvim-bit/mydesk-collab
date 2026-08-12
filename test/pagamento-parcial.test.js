'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   PAGAMENTO PARCIAL — O DINHEIRO TEM DE FECHAR
   ═══════════════════════════════════════════════════════════════════════
   Antes existiam dois estados, e todo somatório do CRM jogava o valor CHEIO
   do registro num balde só, escolhido pelo status. Com parcial isso mente
   dos dois lados ao mesmo tempo: o que já entrou não aparece em "recebido",
   e o total continua sendo cobrado como se nada tivesse entrado.

   A invariante que esta varredura protege é uma só, e vale para qualquer
   registro: **recebido + a receber = valor**. Se ela quebrar, os cartões do
   painel, o gráfico, o relatório e o PDF passam a discordar entre si — e
   cada um vai parecer um bug diferente.

   Protege também os pontos de agregação: eles precisam derivar das duas
   funções, nunca voltar a somar `value` por status.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'docs/js/i18n.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu do app.js: ' + nome);
  const j = APP.indexOf(ate, i);
  return APP.slice(i, j + ate.length);
}

/* Rodam as funções do arquivo real. */
const ctx = vm.createContext({});
vm.runInContext([
  recortar('function _crmRecebido('),
  recortar('function _crmAReceber('),
  recortar('function _crmNormalizarPagamento('),
  recortar('function isOverdue('),
  recortar('function getRecordDisplayStatus('),
].join('\n'), ctx);

/* Data LOCAL, e nao UTC. `toISOString()` devolve a data em UTC: das 21h a
   meia-noite no Brasil ele ja esta no dia seguinte, e um prazo de "ontem"
   virava "hoje" — o teste passava de manha e quebrava a noite, sem nada ter
   mudado no codigo. O app compara data local (ver _crmTodayLocalIso), e o
   teste tem de comparar a mesma coisa. */
const _diaLocal = ms => {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
};
const ONTEM = _diaLocal(Date.now() - 86400000);
const AMANHA = _diaLocal(Date.now() + 86400000);

test('recebido + a receber = valor, em qualquer registro', () => {
  const casos = [
    { value: 1000, status: 'pending' },
    { value: 1000, status: 'paid' },
    { value: 1000, status: 'partial', paidAmount: 300 },
    { value: 1000, status: 'partial', paidAmount: 999.99 },
    { value: 1000, status: 'partial', paidAmount: 0 },
    /* Sujeira que o banco pode ter: recebido maior que o valor, negativo,
       texto, ausente. Nenhum pode furar a soma. */
    { value: 1000, status: 'partial', paidAmount: 5000 },
    { value: 1000, status: 'partial', paidAmount: -200 },
    { value: 1000, status: 'partial', paidAmount: 'abc' },
    { value: 1000, status: 'partial' },
    { value: 0,    status: 'partial', paidAmount: 100 },
    { value: 0,    status: 'paid' },
    { status: 'partial', paidAmount: 50 },
  ];

  for (const rec of casos) {
    const total = Number(rec.value) || 0;
    const dentro = ctx._crmRecebido(rec);
    const falta  = ctx._crmAReceber(rec);

    assert.ok(dentro >= 0, `recebido negativo em ${JSON.stringify(rec)}`);
    assert.ok(falta  >= 0, `a receber negativo em ${JSON.stringify(rec)}`);
    assert.ok(dentro <= total, `recebido maior que o valor em ${JSON.stringify(rec)}`);
    assert.equal(
      Math.round((dentro + falta) * 100) / 100, total,
      `a soma não fecha em ${JSON.stringify(rec)}`
    );
  }
});

test('pago conta tudo; pendente não conta nada', () => {
  assert.equal(ctx._crmRecebido({ value: 800, status: 'paid' }), 800);
  assert.equal(ctx._crmAReceber({ value: 800, status: 'paid' }), 0);
  assert.equal(ctx._crmRecebido({ value: 800, status: 'pending' }), 0);
  assert.equal(ctx._crmAReceber({ value: 800, status: 'pending' }), 800);
});

test('parcial devolve exatamente o que entrou e o que falta', () => {
  const rec = { value: 1000, status: 'partial', paidAmount: 250 };
  assert.equal(ctx._crmRecebido(rec), 250);
  assert.equal(ctx._crmAReceber(rec), 750);
});

test('normalizar impede estado que a tela não sabe desenhar', () => {
  /* Espalha num objeto DESTE realm: o VM tem outro Object.prototype, e o
     deepEqual estrito reprova por protótipo mesmo com os valores idênticos. */
  const n = d => ({ ...ctx._crmNormalizarPagamento(d) });

  assert.deepEqual(n({ value: 1000, status: 'partial', paidAmount: 300 }),
    { status: 'partial', paidAmount: 300 });

  /* Parcial de zero é pendente — senão o selo diria "Parcial" e as duas
     linhas de valor mostrariam recebido R$ 0. */
  assert.deepEqual(n({ value: 1000, status: 'partial', paidAmount: 0 }),
    { status: 'pending', paidAmount: 0 });

  // Parcial que cobre o total é pago.
  assert.deepEqual(n({ value: 1000, status: 'partial', paidAmount: 1000 }),
    { status: 'paid', paidAmount: 0 });
  assert.deepEqual(n({ value: 1000, status: 'partial', paidAmount: 4000 }),
    { status: 'paid', paidAmount: 0 });

  // Pago e pendente não carregam recebido: guardá-lo criaria "pago, dos quais".
  assert.deepEqual(n({ value: 1000, status: 'paid', paidAmount: 300 }),
    { status: 'paid', paidAmount: 0 });
  assert.deepEqual(n({ value: 1000, status: 'pending', paidAmount: 300 }),
    { status: 'pending', paidAmount: 0 });

  // Status desconhecido não vira parcial por acidente.
  assert.deepEqual(n({ value: 1000, status: 'seja-o-que-for' }),
    { status: 'pending', paidAmount: 0 });
});

test('baixar o valor abaixo do que já entrou não guarda dívida negativa', () => {
  /* Editar o total de 1.000 para 200 quando já entraram 300 é caso real —
     desconto depois do primeiro pagamento. Vira Pago, nunca "recebi mais do
     que custa". */
  assert.deepEqual(
    { ...ctx._crmNormalizarPagamento({ value: 200, status: 'partial', paidAmount: 300 }) },
    { status: 'paid', paidAmount: 0 }
  );
});

test('parcial continua devendo — e continua podendo atrasar', () => {
  const vencido = { value: 1000, status: 'partial', paidAmount: 400, dueDate: ONTEM };
  const emDia   = { value: 1000, status: 'partial', paidAmount: 400, dueDate: AMANHA };

  assert.equal(ctx.isOverdue(vencido), true, 'quem ainda deve pode atrasar');
  assert.equal(ctx.isOverdue({ value: 1000, status: 'paid', dueDate: ONTEM }), false);

  /* No selo o atraso vence, porque é o dado urgente — mas o valor recebido
     não se perde: continua saindo das funções de dinheiro. */
  assert.equal(ctx.getRecordDisplayStatus(vencido), 'overdue');
  assert.equal(ctx._crmRecebido(vencido), 400);
  assert.equal(ctx.getRecordDisplayStatus(emDia), 'partial');
});

test('os pontos de soma derivam das funções, e não do status', () => {
  const sitios = [
    ['function updateCRMDashboard(', 'os cartões do painel'],
    ['function _crmSerieMensal(',    'a série mensal do gráfico'],
    ['function _relatorioDados(',    'o relatório e o PDF'],
  ];
  for (const [nome, quem] of sitios) {
    const corpo = recortar(nome);
    assert.match(corpo, /_crmRecebido\(/, `${quem} parou de usar _crmRecebido`);
    assert.match(corpo, /_crmAReceber\(/, `${quem} parou de usar _crmAReceber`);
    assert.equal(/\bif \(r\.status === 'paid'\) \w+ \+=/.test(corpo), false,
      `${quem} voltou a somar o valor cheio pelo status`);
  }

  /* "Recebido no período" tem de ser o que entrou, não o valor de quem está
     marcado como pago. */
  const intervalos = recortar('function _crmIntervalos(');
  assert.match(intervalos.slice(0, 900), /_crmRecebido/,
    'o padrão de _crmIntervalos voltou a filtrar por status');
});

test('o lembrete de vencimento não silencia quem pagou só uma parte', () => {
  /* Os dois avisos pulam só o registro quitado. Se passassem a pular
     'partial', quem pagou a entrada nunca mais seria cobrado. */
  const pulos = APP.match(/if \(!r\.dueDate \|\| r\.status === 'paid'\) return;/g) || [];
  assert.ok(pulos.length >= 2, 'os pulos de lembrete mudaram de forma — revisar');
  assert.equal(/r\.status === 'partial'\) return;/.test(APP), false,
    'parcial ainda deve, então ainda precisa de lembrete');
});

test('parcial aparece no filtro, no selo e nos três idiomas', () => {
  assert.match(APP, /\['partial', _appText\('app\.partialMany'/,
    'sem a opção no filtro, não há como listar só os parciais');

  /* O filtro de parciais olha o status gravado, não o selo: senão esconderia
     justamente os parciais vencidos. */
  assert.match(APP, /_crmFiltroStatus === 'partial'\s*\?\s*list\.filter\(r => r\.status === 'partial'\)/);

  const rotulos = recortar('function _crmStatusLabel(');
  assert.match(rotulos, /partial:/, 'o selo de parcial ficaria sem texto');

  ['app.statusPartial', 'app.partialMany', 'app.amountReceived',
    'app.receivedShort', 'app.toReceiveShort', 'app.partialRemaining']
    .forEach(k => assert.ok(I18N.includes(`'${k}'`), `falta ${k} no catálogo`));
});

test('a gravação passa pelo normalizador nos dois formulários', () => {
  const criar = recortar('async function createRecord(');
  assert.match(criar, /_crmNormalizarPagamento\(data\)/,
    'sem o estrangulamento, cada caminho de criação inventa sua regra');

  const atualizar = recortar('async function updateRecord(');
  assert.match(atualizar, /_crmNormalizarPagamento\(updated\)/,
    'normalizar `changes` perderia o valor de quem manda só o status');

  // Os dois formulários de cliente entregam paidAmount.
  const ocorrencias = (APP.match(/paidAmount/g) || []).length;
  assert.ok(ocorrencias >= 8, 'paidAmount sumiu de algum caminho de gravação');
});

test('o status se troca na propria linha, com as tres opcoes a vista', () => {
  /* O selo era um interruptor de dois estados. Com tres, "alternar" nao tem
     proximo obvio — e o parcial ainda precisa de um numero. */
  assert.ok(APP.includes('function crmMenuDeStatus('), 'o menu de status sumiu');
  const menu = recortar('function crmMenuDeStatus(');

  ['app.statusPending', 'app.statusPartial', 'app.statusPaid'].forEach(k => {
    assert.ok(menu.includes(k), `o menu nao oferece ${k}`);
  });
  assert.match(menu, /_crmPedirValorParcial/,
    'escolher Parcial sem pedir o valor gravaria pendente e pareceria ignorado');
  assert.match(menu, /sel: atual === 'partial'/, 'a opcao atual precisa vir marcada');

  // Os DOIS lugares que mostram status abrem o mesmo menu.
  assert.match(APP, /data-act="crmStatusMenu"/, 'a linha da tabela ficou sem o menu');
  assert.match(APP, /crmMenuDeStatus\(botao, recId\)/, 'o bloco da nota ficou sem o menu');

  /* O interruptor antigo tem de sumir: vivo, seria um segundo caminho capaz
     de gravar 'paid' sem passar pelo menu. */
  assert.equal(/function toggleRecordStatus\(/.test(APP), false,
    'o interruptor de dois estados voltou');
});

test('o popover do parcial nao mora dentro da linha que sera redesenhada', () => {
  const pop = recortar('function _crmPedirValorParcial(');

  /* A linha e redesenhada pelo listener do Firebase a cada gravacao. Um
     input trocado no lugar do selo sumiria no meio da digitacao — a mesma
     armadilha do clique que redesenha a propria area. */
  assert.equal(/replaceWith\(/.test(pop), false,
    'o input nao pode substituir o selo: a linha se redesenha sozinha');
  assert.match(pop, /_cdashAncorar\(/, 'o popover precisa viver ancorado no body');
  assert.match(pop, /updateRecord\(id, \{ status: 'partial'/,
    'o popover tem de gravar como parcial e deixar o normalizador decidir');
});

test('quem se anuncia como botao responde ao teclado', () => {
  /* role="button" + tabindex entrega foco; sem Enter/Espaco, acionar nao faz
     nada. Foco sem acao e pior do que nao ser focavel. */
  assert.match(APP, /\[data-act\]\[role="button"\]/,
    'a delegacao por teclado sumiu — o selo focado ficaria inerte');
  assert.match(APP, /data-act="crmStatusMenu"[^>]*role="button"[^>]*tabindex="0"/,
    'o selo precisa se declarar botao e ser alcancavel');
});
