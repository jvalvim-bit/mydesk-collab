'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   NENHUM OUVINTE PODE REBAIXAR O NÓ INTEIRO A CADA MUDANÇA
   ═══════════════════════════════════════════════════════════════════════
   O plano Spark do Realtime Database dá 10 GB de download por MÊS. Com
   ~21 MB armazenados, chegar perto disso só é possível baixando as mesmas
   coisas muitas vezes.

   Era o que acontecia. Os registros de cliente moram dentro do mesmo nó das
   notas (ids com prefixo `crm_`), e `loadRecords` escutava esse nó com
   `on('value')`. Um ouvinte 'value' recebe o nó COMPLETO a cada alteração de
   qualquer filho — e os anexos ficam em base64 dentro da própria nota.
   Resultado: arrastar uma nota, marcar um item de checklist ou trocar uma
   cor rebaixava o quadro inteiro, com todos os anexos, para cada aba aberta.
   Uma sessão de trabalho comum passava de 1 GB sozinha.

   O mesmo padrão estava em `ouvirRespostas`: cada resposta nova rebaixava
   todas as respostas do formulário, currículos anexados inclusive.

   Esta varredura fixa a regra: nó que cresce com o uso não pode ser escutado
   por 'value'. E confirma, rodando o ouvinte de verdade, que a troca para
   eventos por filho mantém `_records` correto.
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

/* Referência falsa do RTDB: guarda os ouvintes por evento e deixa o teste
   disparar cada um, como o servidor faria.

   `orderByKey().startAt(x)` devolve um objeto DIFERENTE, como no SDK real —
   é por isso que soltar a ref não solta a consulta, e o teste precisa
   enxergar os dois separadamente. */
function refFalsa() {
  const criar = (marca) => {
    const ouvintes = new Map();
    const alvo = {
      marca, ouvintes, consulta: null,
      on(evento, fn) {
        if (!ouvintes.has(evento)) ouvintes.set(evento, []);
        ouvintes.get(evento).push(fn);
      },
      off(evento) {
        if (evento === undefined) ouvintes.clear();
        else ouvintes.delete(evento);
      },
      emitir(evento, chave, valor) {
        (ouvintes.get(evento) || []).forEach(fn => fn({
          key: chave, val: () => valor,
        }));
      },
      orderByKey() {
        return {
          startAt: inicio => {
            alvo.consulta = criar('consulta:' + inicio);
            return alvo.consulta;
          },
        };
      },
    };
    return alvo;
  };
  return criar('ref');
}

function montar(bruto) {
  const ref = refFalsa();
  const pintadas = { tabela: 0, painel: 0 };
  const ctx = vm.createContext({
    CU: { uid: 'u1' },
    _records: [],
    _recRef: null,
    _recAlvo: null,
    _recOffFn: null,
    _recRepintar: null,
    _brutoDoQuadro: bruto || null,
    /* Vaga entra pelo mesmo no e pela mesma faixa de chaves, mas vai para
       _vagas — nunca para _records, senao apareceria na carteira. */
    _vagas: [],
    _talentos: [],
    _colaboradores: [],
    _despesas: [],
    _ehVaga: r => !!(r && r.type === 'vaga'),
    _ehTalento: r => !!(r && r.type === 'talento'),
    _ehColaborador: r => !!(r && r.type === 'colaborador'),
    /* Despesa mora no MESMO no dos registros e nao e cliente: sem o
       predicado aqui, ela entraria na carteira e somaria no dinheiro. */
    _ehDespesa: r => !!(r && r.type === 'despesa'),
    /* O painel tem tres modelos, e o de clientes tem tela propria: o
       repintar pergunta qual esta ativo antes de mexer na tabela. */
    crmModeloClientes: () => false,
    _crmEhRegistro: r =>
      !!(r && r.type !== 'vaga' && r.type !== 'talento' && r.type !== 'colaborador'
         && r.id && (r.type === 'client' || String(r.id).startsWith('crm_'))),
    _crmDB: () => ({ ref: () => ref }),
    _recBasePath: () => 'users/u1/notes',
    renderRecordsTable: () => { pintadas.tabela++; },
    updateCRMDashboard: () => { pintadas.painel++; },
    _remountAllClientNoteExtras: () => {},
    toast: () => {},
    _appText: (k, f) => f,
    console: { error() {} },
    setTimeout, clearTimeout,
  });
  vm.runInContext([
    recortar('function _crmDetachListener('),
    recortar('function loadRecords('),
  ].join('\n'), ctx);
  ctx.loadRecords();
  /* Assinado na consulta restrita, quando houve restricao; senao na ref. */
  const assinado = ref.consulta || ref;
  return { ctx, ref, assinado, pintadas };
}

const tick = () => new Promise(r => setTimeout(r, 0));

/* Traz o array para ESTE realm: o do VM tem outro Array.prototype, e o
   deepEqual estrito reprova por prototipo mesmo com os valores identicos. */
const ids = registros => [...registros].map(r => r.id);

test('o ouvinte dos registros NAO escuta o nó inteiro', () => {
  const corpo = recortar('function loadRecords(');
  assert.equal(/\.on\('value'/.test(corpo), false,
    "voltou o on('value') no nó das notas — cada gravação rebaixa o quadro todo");
  ['child_added', 'child_changed', 'child_removed'].forEach(ev => {
    assert.ok(corpo.includes(`'${ev}'`), `falta o ouvinte de ${ev}`);
  });
});

test('as respostas de formulário também vêm por filho', () => {
  const corpo = recortar('function ouvirRespostas(');
  assert.equal(/\.on\('value'/.test(corpo), false,
    "cada resposta nova rebaixaria todas as respostas, currículos inclusive");
  assert.ok(corpo.includes("'child_added'"), 'falta o ouvinte de resposta nova');
});

test('só o que é registro entra na carteira', async () => {
  const { ctx, assinado: ref } = montar();

  ref.emitir('child_added', 'crm_1', { id: 'crm_1', type: 'client', name: 'Ana', createdAt: 2 });
  ref.emitir('child_added', '1754000000000', { id: 1754000000000, title: 'nota comum' });
  ref.emitir('child_added', 'crm_2', { id: 'crm_2', type: 'client', name: 'Bia', createdAt: 1 });
  await tick();

  assert.deepEqual(ids(ctx._records), ['crm_1', 'crm_2'],
    'nota comum não pode virar cliente, e a ordem é por criação, mais nova primeiro');
});

test('alterar um registro substitui, não duplica', async () => {
  const { ctx, assinado: ref } = montar();

  ref.emitir('child_added', 'crm_1', { id: 'crm_1', type: 'client', name: 'Ana', value: 100 });
  await tick();
  ref.emitir('child_changed', 'crm_1', { id: 'crm_1', type: 'client', name: 'Ana', value: 900 });
  await tick();

  assert.equal(ctx._records.length, 1, 'o registro alterado entrou duas vezes');
  assert.equal(ctx._records[0].value, 900);
});

test('remover tira da carteira; remover nota comum não mexe em nada', async () => {
  const { ctx, assinado: ref } = montar();

  ref.emitir('child_added', 'crm_1', { id: 'crm_1', type: 'client', name: 'Ana' });
  ref.emitir('child_added', 'crm_2', { id: 'crm_2', type: 'client', name: 'Bia' });
  await tick();

  ref.emitir('child_removed', '1754000000000', { id: 1754000000000, title: 'nota comum' });
  await tick();
  assert.equal(ctx._records.length, 2, 'apagar nota comum mexeu na carteira');

  ref.emitir('child_removed', 'crm_1', { id: 'crm_1', type: 'client' });
  await tick();
  assert.deepEqual(ids(ctx._records), ['crm_2']);
});

test('a carga inicial redesenha a tela UMA vez, não uma por nota', async () => {
  const { assinado: ref, pintadas } = montar();

  /* child_added dispara por filho. Sem agrupar, um quadro de 80 notas
     redesenharia a tabela e o painel 80 vezes — a troca de 'value' por
     eventos por filho teria economizado rede e gasto CPU. */
  for (let i = 0; i < 80; i++) {
    ref.emitir('child_added', 'crm_' + i, { id: 'crm_' + i, type: 'client', createdAt: i });
  }
  await tick();

  assert.equal(pintadas.tabela, 1, 'a tabela foi redesenhada ' + pintadas.tabela + ' vezes');
  assert.equal(pintadas.painel, 1);
});

test('quadro vazio limpa a tela em vez de deixar o quadro anterior', async () => {
  const { ctx, pintadas } = montar();
  await tick();
  assert.equal(ctx._records.length, 0);
  assert.equal(pintadas.tabela, 1, 'sem registro nenhum, ninguém mandou repintar');
});

test('trocar de quadro solta TODOS os ouvintes do anterior', async () => {
  const { ctx, assinado: ref } = montar();
  ref.emitir('child_added', 'crm_1', { id: 'crm_1', type: 'client' });
  await tick();

  ctx._crmDetachListener();

  /* off('value') soltava só um evento; agora são três. Ouvinte esquecido
     continua baixando o quadro antigo pelo resto da sessão. */
  assert.equal(ref.ouvintes.size, 0, 'sobrou ouvinte preso no quadro anterior');
});

/* ── Alcance do ouvinte: nao rebaixar o que a carga do quadro ja trouxe ── */

const CAMINHO = 'users/u1/notes';
const bruto = itens => ({ path: CAMINHO, itens });

test('sem sinal da carga, o ouvinte fica SEM restricao', () => {
  /* Falta de prova nao vira permissao: sem saber o que existe no no, o
     ouvinte cobre tudo — e o comportamento de antes, que e correto. */
  const { ref } = montar(null);
  assert.equal(ref.consulta, null, 'restringiu sem base para isso');
  assert.ok(ref.ouvintes.size > 0, 'ninguem ficou escutando');
});

test('cache de OUTRO quadro nao autoriza restricao', () => {
  const { ref } = montar({ path: 'group_boards/g1/notes', itens: [] });
  assert.equal(ref.consulta, null, 'usou o cache de um quadro que nao e este');
});

test('com a carga em maos e todo registro no prefixo, restringe a faixa crm_', () => {
  /* Este e o ganho: a carga do quadro ja baixou o no inteiro com os anexos.
     Restrito, o ouvinte pede so os registros — e nao uma segunda copia do
     quadro por abertura do app. */
  const { ref } = montar(bruto([
    { id: 1754000000000, title: 'nota comum' },
    { id: 'crm_1', type: 'client', name: 'Ana' },
  ]));
  assert.ok(ref.consulta, 'nao restringiu, e o quadro sera baixado duas vezes');
  assert.equal(ref.consulta.marca, 'consulta:crm_');
  assert.equal(ref.ouvintes.size, 0, 'assinou a ref tambem — dobraria de novo');
});

test('registro fora do prefixo desliga a restricao', () => {
  /* Um cliente antigo com id sem 'crm_' sumiria da carteira em silencio.
     Baixar demais e desperdicio; perder cliente e estrago. */
  const { ref } = montar(bruto([
    { id: 1754000000000, title: 'nota comum' },
    { id: 'crm_1', type: 'client', name: 'Ana' },
    { id: 1699999999999, type: 'client', name: 'Cliente antigo' },
  ]));
  assert.equal(ref.consulta, null,
    'restringiu com registro fora do prefixo — esse cliente sumiria');
});

test('nota comum com id estranho nao desliga a restricao', () => {
  /* So conta o que E registro. Nota comum fora do padrao de id nao tem nada
     a ver com a carteira e nao pode custar o ganho todo. */
  const { ref } = montar(bruto([
    { id: 'nota-legada-sem-timestamp', title: 'nota comum' },
    { id: 'crm_1', type: 'client', name: 'Ana' },
  ]));
  assert.ok(ref.consulta, 'uma nota estranha derrubou a restricao');
});

test('soltar o ouvinte alcanca a consulta restrita, e nao so a ref', async () => {
  const { ctx, ref, assinado } = montar(bruto([
    { id: 'crm_1', type: 'client', name: 'Ana' },
  ]));
  assert.ok(assinado !== ref, 'o teste nao chegou a exercitar a consulta');
  assinado.emitir('child_added', 'crm_1', { id: 'crm_1', type: 'client' });
  await tick();

  ctx._crmDetachListener();

  /* ref.off() nao alcanca os retornos de uma consulta: sem soltar o alvo, o
     ouvinte continuaria baixando o quadro antigo pelo resto da sessao. */
  assert.equal(assinado.ouvintes.size, 0, 'sobrou ouvinte preso na consulta');
  assert.equal(ref.ouvintes.size, 0, 'sobrou ouvinte preso na ref');
});

test('todo carregador de quadro avisa o que baixou', () => {
  /* Sem o aviso, o cache nunca bate com o caminho e a restricao nunca entra
     — a correcao existiria no codigo e nao no produto. */
  const carregadores = [
    ['async function loadNotesRaw(',        'quadro pessoal padrao'],
    ['async function loadGroupBoardNotes(', 'quadro de grupo'],
    ['async function loadSharedNotes(',     'quadro 1:1'],
    ['async function _pwSwitchTo(',         'workspace pessoal nomeado'],
  ];
  for (const [nome, quem] of carregadores) {
    const corpo = recortar(nome);
    assert.match(corpo, /_marcarBrutoDoQuadro\(/,
      quem + ' baixa o no e nao avisa — o ouvinte vai baixar de novo');
  }

  /* launchApp tem o outro caminho do workspace nomeado. */
  assert.ok((APP.match(/_marcarBrutoDoQuadro\(/g) || []).length >= 5,
    'algum carregador ficou sem aviso');
});
