'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MODELO CLIENTES — o terceiro painel
   ═══════════════════════════════════════════════════════════════════════
   O painel já lia a mesma carteira de duas maneiras: Financeiro (quanto
   devem, quando vence) e Recrutamento (candidato, etapa, funil). O terceiro
   pergunta como anda a RELAÇÃO.

   O que este arquivo protege é o que não se vê na tela e quebra em silêncio:

   1. Nenhum registro é copiado nem convertido ao trocar de modelo. O cliente
      é o MESMO, com o mesmo id.
   2. Os campos novos sobrevivem à lista branca de createRecord — a mesma
      armadilha que fez as parcelas nascerem sem série.
   3. Registro antigo, sem nenhum campo novo, continua abrindo.
   4. As datas não passam por fuso.
   5. Não entra dinheiro nem recrutamento na leitura de clientes.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP  = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const RH   = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
const CSS  = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const DADOS = fs.readFileSync(path.join(RAIZ, 'docs/js/clientes.js'), 'utf8');
const TELA  = fs.readFileSync(path.join(RAIZ, 'docs/js/clientes-tela.js'), 'utf8');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

/* Um MD_CLI de verdade, carregado como o navegador carrega: dados primeiro,
   tela depois. `_registrosClientes` e `_agenda` entram como o app.js os
   entrega. */
function montar(registros, agenda, hoje) {
  const ctx = {
    console, Date, Number, String, Math, Array, Object, Set, JSON,
    RegExp, Promise, isNaN, parseInt, parseFloat,
    _registrosClientes: () => registros || [],
    _agenda: agenda || [],
    _crmTodayLocalIso: () => hoje || '2026-08-05',
    _crmFmtDate: iso => iso.split('-').reverse().join('/'),
    _appText: (chave, padrao, vars) => String(padrao).replace(/\{(\w+)\}/g,
      (a, k) => (vars && vars[k] !== undefined ? String(vars[k]) : a)),
    CU: { username: 'victor', uid: 'u1' },
    MD_RH: { modelo: () => 'clientes' },
    CLI_STATUS: [
      { key: 'ativo', i18n: '', pt: 'Ativo', cor: '#10b981' },
      { key: 'negociacao', i18n: '', pt: 'Em negociação', cor: '#3b82f6' },
      { key: 'aguardando', i18n: '', pt: 'Aguardando retorno', cor: '#f59e0b' },
      { key: 'acompanhando', i18n: '', pt: 'Em acompanhamento', cor: '#22d3ee' },
      { key: 'inativo', i18n: '', pt: 'Inativo', cor: '#94a3b8' },
      { key: 'encerrado', i18n: '', pt: 'Encerrado', cor: '#ef4444' },
    ],
    CLI_SEGMENTOS: [{ key: 'tecnologia', i18n: '', pt: 'Tecnologia' }],
    CLI_TIPOS: [{ key: 'pj', i18n: '', pt: 'Pessoa jurídica' }],
    CLI_PRIORIDADES: [{ key: 'alta', i18n: '', pt: 'Alta' },
      { key: 'media', i18n: '', pt: 'Média' }, { key: 'baixa', i18n: '', pt: 'Baixa' }],
    CLI_ORIGENS: [{ key: 'indicacao', i18n: '', pt: 'Indicação' }],
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(DADOS, ctx);
  return ctx.MD_CLI;
}

const cliente = (id, extra) => Object.assign({
  id, type: 'client', name: 'Cliente ' + id, createdAt: Date.UTC(2026, 6, 1),
}, extra || {});

/* ═══════════════════════════════════════════════════════════════════════
   OS TRÊS MODELOS CONVIVEM
   ═══════════════════════════════════════════════════════════════════════ */
test('a preferencia aceita os tres modelos, e nada mais', () => {
  /* Um valor estranho no localStorage (versão futura, dedo escorregado) não
     pode abrir um painel que não existe: cai no financeiro. */
  const fn = recortar(RH, '  function definirModelo(');
  assert.match(fn, /MODELOS\.includes\(k\) \? k : 'financeiro'/);
  const carga = recortar(RH, '  function carregarPreferencia(');
  assert.match(carga, /MODELOS\.includes\(v\) \? v : 'financeiro'/);
  assert.match(RH, /const MODELOS = \['financeiro', 'rh', 'clientes'\]/);
  // E `ativo()` continua sendo só sobre recrutamento.
  assert.match(RH, /function ativo\(\) \{ return _modelo === 'rh' && disponivel\(\); \}/);
});

test('o menu mostra os tres, e Clientes nao depende do catalogo de nichos', () => {
  /* O menu inteiro morria quando MD_NICHOS não estava disponível — e o modelo
     de Clientes, que não usa nicho nenhum, ficava inalcançável junto. */
  const fn = recortar(APP, 'function crmAlterarModelo(');
  assert.match(fn, /if \(MD_RH\.disponivel\(\)\) \{/);
  assert.match(fn, /app\.modelClients/);
  assert.equal(/if \(!window\.MD_RH \|\| !MD_RH\.disponivel\(\)\) \{/.test(fn), false,
    'voltou a barrar o menu inteiro sem o catalogo de nichos');
});

test('trocar de modelo NAO converte, NAO copia e NAO duplica registro', () => {
  /* A carteira do modelo de clientes é a mesma lista do financeiro. Se um dia
     alguém puser aqui um `map` que cria objeto novo, o id muda e o Firebase
     ganha um cliente fantasma a cada troca de modelo. */
  const fn = recortar(APP, 'function _registrosClientes(');
  assert.match(fn, /return _registrosFinanceiros\(\);/);
  const troca = recortar(APP, 'function _crmTrocarModelo(');
  assert.equal(/createRecord|updateRecord|_crmSet/.test(troca), false,
    'a troca de modelo passou a escrever no banco');
});

test('sair do modelo desliga o que ele pendurou', () => {
  const fn = recortar(APP, 'function _crmTrocarModelo(');
  assert.match(fn, /if \(antes === 'clientes' && k !== 'clientes' && window\.MD_CLI\) MD_CLI\.sair\(\)/);
  const sair = recortar(TELA, '  function sair(', '\n  }');
  assert.match(sair, /desligarRota\(\)/);
  const desligar = recortar(TELA, '  function desligarRota(', '\n  }');
  assert.match(desligar, /removeEventListener\('popstate'/);
  assert.match(desligar, /removeEventListener\('hashchange'/);
  assert.match(desligar, /document\.removeEventListener\('keydown'/);
  const parar = recortar(TELA, '  function pararParallax(', '\n  }');
  assert.match(parar, /removeEventListener\('mousemove'/);
});

test('o modelo de clientes esconde a moldura dos outros dois', () => {
  const fn = recortar(APP, 'function _crmAplicarModelo(');
  assert.match(fn, /classList\.toggle\('cli-modelo', cli\)/);
  /* Esconder por style.display NAO funciona aqui: as regras que mostram esses
     blocos sao `.visible{display:block !important}`, e !important de folha de
     estilo ganha de estilo em linha. Dai a regra precisar de dois ids. */
  assert.match(CSS, /#crm-view\.cli-modelo>#crm-dashboard,/);
  assert.match(CSS, /#crm-view\.cli-modelo>#crm-charts-row,/);
  assert.match(CSS, /#crm-view\.cli-modelo>#crm-board\{display:none!important;\}/);
  assert.match(CSS, /#crm-view:not\(\.cli-modelo\)>#cli-view\{display:none;\}/);
  // Mas a barra e o titulo do quadro continuam falando do modelo certo.
  assert.match(fn, /_updateCRMBoardTitle\(\);\s*\n\s*_crmSyncToolbarLabels\(\);\s*\n\s*return;/);
});

test('os dois arquivos entram no HTML, e os dados antes da tela', () => {
  const iDados = HTML.indexOf('js/clientes.js');
  const iTela = HTML.indexOf('js/clientes-tela.js');
  assert.ok(iDados > 0 && iTela > iDados, 'a tela carregaria antes dos dados');
});

/* ═══════════════════════════════════════════════════════════════════════
   OS CAMPOS SOBREVIVEM
   ═══════════════════════════════════════════════════════════════════════ */
test('os campos do cliente entram na lista branca de createRecord', () => {
  /* Foi assim que as parcelas nasceram sem serie: a lista de createRecord e
     BRANCA, e o que nao esta nela some sem aviso. */
  const fn = recortar(APP, 'async function createRecord(');
  assert.match(fn, /\.\.\._crmCamposDeCliente\(data\)/);
});

test('as listas atravessam arquivos por window, e nao por sorte', () => {
  /* `const` no topo de script classico existe no escopo lexical, mas NAO vira
     propriedade de window: `global.CLI_STATUS` daria undefined, e o `|| []` do
     outro lado deixaria a tela sem status, sem segmento e sem tipo — sem erro
     nenhum no console. */
  ['CLI_STATUS', 'CLI_SEGMENTOS', 'CLI_TIPOS', 'CLI_PRIORIDADES',
   'CLI_ORIGENS', 'CLI_TIPOS_INTERACAO'].forEach(nome => {
    assert.match(APP, new RegExp('window\\.' + nome + ' = ' + nome + ';'),
      nome + ' nao foi exportado');
  });
});

test('valor fora da lista nao passa, e o padrao e seguro', () => {
  const ctx = vm.createContext({ Number, String, Array, Math, Object,
    _dataSegura: v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '') });
  vm.runInContext(APP.slice(APP.indexOf('const CLI_STATUS = ['),
    APP.indexOf('function _crmCamposDeCliente(')), ctx);
  vm.runInContext(recortar(APP, 'function _cliInteracoes('), ctx);
  vm.runInContext(recortar(APP, 'function _cliObservacoes('), ctx);
  vm.runInContext("const CLI_FASES_PROCESSO = [{ key: 'consulta' }];", ctx);
  vm.runInContext(recortar(APP, 'function _cliProcessos('), ctx);
  vm.runInContext(recortar(APP, 'function _crmCamposDeCliente('), ctx);

  const c = ctx._crmCamposDeCliente({ relationshipStatus: 'inventado', priority: 'x' });
  assert.equal(c.relationshipStatus, 'ativo', 'status invalido virou status invalido');
  assert.equal(c.priority, 'media');
  assert.equal(c.segment, '');
  // Satisfacao e 0 a 5. Zero significa "sem avaliacao", e nao nota zero.
  assert.equal(ctx._crmCamposDeCliente({ satisfaction: 9 }).satisfaction, 5);
  assert.equal(ctx._crmCamposDeCliente({ satisfaction: -3 }).satisfaction, 0);
  assert.equal(ctx._crmCamposDeCliente({}).satisfaction, 0);
});

test('tags: sem repetir, sem vazias, com teto', () => {
  /* O teto existe porque a coluna mostra as principais e conta o resto: sem
     limite, uma colagem acidental viraria trezentos chips. */
  const ctx = vm.createContext({ Number, String, Array, Math, Object, Set,
    _dataSegura: () => '' });
  vm.runInContext(APP.slice(APP.indexOf('function _cliTags('),
    APP.indexOf('function _crmCamposDeCliente(')), ctx);
  /* Os arrays vem de outro realm — o vm tem os proprios prototipos —, entao a
     comparacao e de conteudo. */
  const igual = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
  igual(ctx._cliTags(['VIP', 'vip', ' ', 'B2B']), ['VIP', 'B2B']);
  igual(ctx._cliTags('a, b , ,c'), ['a', 'b', 'c']);
  assert.equal(ctx._cliTags(Array.from({ length: 40 }, (_, i) => 't' + i)).length, 12);
});

/* ═══════════════════════════════════════════════════════════════════════
   A CARTEIRA
   ═══════════════════════════════════════════════════════════════════════ */
test('arquivado sai da lista padrao, e volta pelo filtro', () => {
  /* Arquivar nao e apagar: o cliente continua achavel, com historico e
     documentos. */
  const M = montar([cliente('a'), cliente('b', { archived: true })]);
  assert.equal(M.carteira().length, 1);
  M.S.filtros.arquivados = true;
  assert.equal(M.carteira().length, 1);
  assert.equal(M.carteira()[0].id, 'b');
});

test('a busca acha por nome, empresa, contato, e-mail, telefone, CNPJ e tag', () => {
  const M = montar([]);
  const r = cliente('a', {
    name: 'Acme', companyName: 'Acme Soluções Ltda', contactName: 'Ana Clara',
    email: 'contato@acme.com.br', phone: '11998472210',
    company: { cnpj: '12345678000199' }, tags: ['VIP'], segment: 'tecnologia',
  });
  ['acme', 'soluções', 'ana', 'contato@', '99847', '12345678', 'vip', 'tecnologia']
    .forEach(q => assert.equal(M.casaBusca(r, q), true, 'nao achou por: ' + q));
  assert.equal(M.casaBusca(r, 'padaria'), false);
});

test('sem data vai para o FIM nas duas ordens de contato', () => {
  /* String vazia ordenada junto com datas ficaria em primeiro no crescente, e
     "nunca contatado" apareceria como "contato mais recente". */
  const M = montar([]);
  const lista = [
    cliente('sem'),
    cliente('velho', { lastContactAt: '2026-01-10', nextContactAt: '2026-09-01' }),
    cliente('novo',  { lastContactAt: '2026-08-01', nextContactAt: '2026-08-20' }),
  ];
  M.S.ordem = 'ultimo';
  assert.deepEqual(M.ordenar(lista).map(r => r.id), ['novo', 'velho', 'sem']);
  M.S.ordem = 'proximo';
  assert.deepEqual(M.ordenar(lista).map(r => r.id), ['novo', 'velho', 'sem']);
});

/* ═══════════════════════════════════════════════════════════════════════
   AS DATAS
   ═══════════════════════════════════════════════════════════════════════ */
test('a conta de dias nao passa por fuso', () => {
  /* `new Date('2026-08-05')` nasce em UTC: as 21h no Brasil ele ja e o dia
     seguinte, e "vence hoje" viraria "venceu ontem". */
  const M = montar([]);
  assert.equal(M.diasEntre('2026-08-05', '2026-08-06'), 1);
  assert.equal(M.somarDias('2026-02-28', 1), '2026-03-01');
  assert.equal(M.somarDias('2024-02-28', 1), '2024-02-29', 'ano bissexto');
  assert.equal(M.somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(/new Date\('/.test(recortar(DADOS, '  function diasEntre(')), false);
});

test('proximo contato: a data mais proxima entre o campo e a agenda', () => {
  /* Duas origens, uma conta so. Se cada tela somasse do seu jeito,
     "acompanhamentos hoje" e a coluna da tabela discordariam. */
  const r = cliente('a', { nextContactAt: '2026-09-10' });
  const M = montar([r], [
    { id: 'x', clienteId: 'a', data: '2026-08-20', titulo: 'Reunião' },
    { id: 'y', clienteId: 'b', data: '2026-08-06', titulo: 'De outro' },
  ]);
  assert.equal(M.proximoContato(r), '2026-08-20');
});

test('retorno atrasado continua sendo o proximo assunto', () => {
  /* Sumir com ele esconderia justamente o que precisa de atencao. */
  const r = cliente('a', { nextContactAt: '2026-07-01' });
  const M = montar([r]);
  assert.equal(M.proximoContato(r), '2026-07-01');
  assert.equal(M.atrasado(r), true);
});

test('ultimo contato considera a ultima interacao, e nao so o campo', () => {
  /* Sem isso, registrar uma ligacao hoje deixaria a coluna dizendo marco. */
  const r = cliente('a', {
    lastContactAt: '2026-03-02',
    interactions: [{ id: 'i1', tipo: 'ligacao', data: '2026-08-01' }],
  });
  const M = montar([r]);
  assert.equal(M.ultimoContato(r), '2026-08-01');
});

/* ═══════════════════════════════════════════════════════════════════════
   INDICADORES — nenhum numero inventado
   ═══════════════════════════════════════════════════════════════════════ */
test('carteira vazia da zero em tudo, e nao esconde os cartoes', () => {
  const i = montar([]).indicadores();
  assert.equal(i.ativos, 0);
  assert.equal(i.novosMes, 0);
  assert.equal(i.hojeContatos, 0);
  assert.equal(i.proximos30, 0);
  assert.equal(i.variacao, null, 'sobre base zero nao existe variacao');
});

test('a variacao so aparece quando ha mes anterior para comparar', () => {
  /* Sobre base zero, um cliente novo viraria "+100%", que parece medida. */
  const M = montar([
    cliente('a', { createdAt: Date.UTC(2026, 6, 10) }),   // julho
    cliente('b', { createdAt: Date.UTC(2026, 6, 20) }),
    cliente('c', { createdAt: Date.UTC(2026, 7, 2) }),    // agosto
    cliente('d', { createdAt: Date.UTC(2026, 7, 3) }),
    cliente('e', { createdAt: Date.UTC(2026, 7, 4) }),
  ]);
  assert.equal(M.indicadores().variacao, 50);   // 3 contra 2
});

test('acompanhamentos hoje e retornos proximos saem das datas reais', () => {
  const M = montar([
    cliente('a', { nextContactAt: '2026-08-05' }),   // hoje
    cliente('b', { nextContactAt: '2026-08-09' }),   // nesta semana
    cliente('c', { nextContactAt: '2026-08-30' }),   // dentro de 30 dias
    cliente('d', { nextContactAt: '2026-07-20' }),   // atrasado
    cliente('e', {}),                                 // sem data
  ]);
  const i = M.indicadores();
  assert.equal(i.hojeContatos, 1);
  assert.equal(i.atrasados, 1);
  assert.equal(i.proximos30, 3);
  assert.equal(i.proximos7, 2);
});

test('a taxa de retorno responde "cumpri o que combinei"', () => {
  const M = montar([
    // combinou para 01/07 e falou em 03/07 → cumpriu
    cliente('a', { nextContactAt: '2026-07-01', lastContactAt: '2026-07-03' }),
    // combinou para 01/07 e nao falou mais → nao cumpriu
    cliente('b', { nextContactAt: '2026-07-01', lastContactAt: '2026-06-20' }),
  ]);
  assert.equal(M.resumo('ano').taxa, 50);
  // Sem nenhum compromisso vencido, a taxa e "sem dados" — e nao 0%.
  assert.equal(montar([cliente('c')]).resumo('ano').taxa, null);
});

test('proximas acoes: uma fila so, sem contar a mesma data duas vezes', () => {
  /* O compromisso na agenda e o campo "proximo contato" podem apontar para o
     mesmo dia: seriam duas linhas dizendo a mesma coisa. */
  const r = cliente('a', { nextContactAt: '2026-08-20' });
  const M = montar([r], [{ id: 'x', clienteId: 'a', data: '2026-08-20', titulo: 'Reunião' }]);
  const acoes = M.proximasAcoes();
  assert.equal(acoes.length, 1);
  assert.equal(acoes[0].titulo, 'Reunião');
});

test('proximas acoes vem em ordem de data, com o atraso marcado', () => {
  const M = montar([
    cliente('a', { nextContactAt: '2026-08-25' }),
    cliente('b', { nextContactAt: '2026-07-01' }),
  ]);
  const acoes = M.proximasAcoes();
  assert.equal(acoes[0].clienteId, 'b');
  assert.equal(acoes[0].atrasado, true);
  assert.equal(acoes[1].atrasado, false);
});

/* ═══════════════════════════════════════════════════════════════════════
   REGISTRO ANTIGO CONTINUA VALENDO
   ═══════════════════════════════════════════════════════════════════════ */
test('cliente sem nenhum campo novo abre sem quebrar e sem undefined', () => {
  /* A carteira que ja existe nao passou por migracao nenhuma. */
  const velho = { id: 'crm_1', type: 'client', name: 'Padaria do Ze', value: 8000 };
  const M = montar([velho]);
  assert.equal(M.nomeDe(velho), 'Padaria do Ze');
  assert.equal(M.statusDe(velho), 'ativo');
  assert.equal(M.segmentoDe(velho), '');
  assert.equal(M.tagsDe(velho).length, 0);
  assert.equal(M.interacoesDe(velho).length, 0);
  assert.equal(M.proximoContato(velho), '');
  assert.equal(M.ultimoContato(velho), '');
  assert.equal(M.favorito(velho), false);
  [M.nomeDe(velho), M.statusDe(velho), M.segmentoDe(velho), M.responsavelDe(velho)]
    .forEach(v => assert.equal(String(v).includes('undefined'), false));
});

test('cliente sem nome nao sai com a celula vazia', () => {
  const M = montar([]);
  assert.equal(M.nomeDe({ id: 'x' }), 'Sem nome');
});

test('a tela escreve "Nao informado" no lugar de vazio', () => {
  const fn = recortar(TELA, '  function abaDados(', '\n  }');
  assert.match(fn, /cli\.notInformed/);
  /* Sem os comentarios: eles falam da palavra que o codigo nao pode escrever. */
  const codigo = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/undefined/.test(codigo), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   NADA DE DINHEIRO E NADA DE RECRUTAMENTO
   ═══════════════════════════════════════════════════════════════════════ */
test('o modelo de clientes nao le nem mostra valor, vencimento ou candidato', () => {
  /* Sao outras duas leituras, e cada uma ja tem a tela dela.

     O processo juridico e a excecao declarada: valor da causa e honorarios
     sao atributos do PROCESSO — de quanto se trata a acao —, e nao a leitura
     financeira da carteira. O que continua proibido aqui e o que o painel
     financeiro le: faturamento, a receber, ticket medio, status de
     pagamento. */
  const semProcessos = f => {
    const i = f.indexOf('  /* ── Processos (só advocacia)');
    const j = f.indexOf('  /* ── Documentos', i);
    return i > 0 && j > i ? f.slice(0, i) + f.slice(j) : f;
  };
  [DADOS, semProcessos(TELA)].forEach(fonte => {
    assert.equal(/fmtBRL|_crmAReceber|_crmRecebido|paidAmount|\bdueDate\b/.test(fonte), false,
      'entrou dinheiro no modelo de clientes');
    assert.equal(/MD_RH\.(candidatos|etapas|funil)|iaNota|curriculo/.test(fonte), false,
      'entrou recrutamento no modelo de clientes');
  });
});

test('fluxo de caixa e despesas somem no recrutamento', () => {
  const fn = recortar(APP, 'function _crmAplicarModelo(');
  assert.match(fn, /\['crm-btn-fluxo', 'crm-btn-despesas'\]/);
});

/* ═══════════════════════════════════════════════════════════════════════
   AS DUAS TELAS NUNCA APARECEM JUNTAS
   ═══════════════════════════════════════════════════════════════════════ */
test('o detalhe SUBSTITUI a lista — nao e modal, gaveta nem divisao', () => {
  const fn = recortar(TELA, '  function pintarDetalhe(', '\n  }');
  assert.match(fn, /v\.innerHTML = ''/, 'a lista tem de sair antes');
  assert.equal(/modal-bg|drawer|sidebar/.test(fn), false,
    'o detalhe virou sobreposicao');
  // E o cliente aberto e o unico estado possivel: ou lista, ou detalhe.
  assert.match(TELA, /_tela = 'detalhe'/);
  assert.match(TELA, /_tela = 'lista'/);
});

test('clique repetido durante a troca nao abre duas vezes', () => {
  const fn = recortar(TELA, '  function abrirCliente(', '\n  }');
  assert.match(fn, /if \(_abrindo\) return;/);
  assert.match(fn, /_abrindo = true;/);
});

test('o estado da lista e guardado antes de sair, e devolvido ao voltar', () => {
  const abrir = recortar(TELA, '  function abrirCliente(', '\n  }');
  assert.match(abrir, /S\.scroll = document\.getElementById\('crm-view'\)\?\.scrollTop/);
  const fechar = recortar(TELA, '  function fecharDetalhe(', '\n  }');
  assert.match(fechar, /M\(\)\.S\.selecionado = voltandoDe/);
  const pintar = recortar(TELA, '  function pintarLista(', '\n  }');
  assert.match(pintar, /linha\.classList\.add\('voltou'\)/);
  assert.match(pintar, /linha\.focus\(\{ preventScroll: true \}\)/);
  // Busca, filtros, ordem, pagina e linhas por pagina vivem no estado, e o
  // estado nao e recriado ao repintar.
  ['busca', 'filtros', 'ordem', 'pagina', 'porPagina', 'scroll', 'selecionado']
    .forEach(k => assert.match(DADOS, new RegExp('\\b' + k + ':')));
});

test('checkbox e botao de acoes NAO abrem o cliente', () => {
  /* Marcar linhas e outra intencao: abrir a pagina por engano tira a pessoa da
     lista onde ela estava marcando. */
  const fn = recortar(TELA, '  function linhaDoCliente(', '\n  }');
  assert.match(fn, /chk\.addEventListener\('click', e => e\.stopPropagation\(\)\)/);
  assert.match(fn, /btn\.addEventListener\('click', e => \{ e\.stopPropagation\(\);/);
});

test('a linha abre por clique e por teclado', () => {
  const fn = recortar(TELA, '  function linhaDoCliente(', '\n  }');
  assert.match(fn, /tabindex: '0', role: 'button'/);
  assert.match(fn, /e\.key === 'Enter' \|\| e\.key === ' '/);
  assert.match(fn, /'aria-label': t\('cli\.openClient'/);
});

test('o hover clareia sem mexer na altura nem na posicao', () => {
  /* Linha que cresce ao passar o mouse empurra as de baixo e a lista treme. */
  const regra = CSS.slice(CSS.indexOf('.cli-linha:hover{'),
                          CSS.indexOf('.cli-linha:hover{') + 120);
  assert.equal(/height|padding|transform|margin/.test(regra), false);
  assert.match(CSS, /\.cli-linha\{cursor:pointer/);
});

/* ═══════════════════════════════════════════════════════════════════════
   ROTA
   ═══════════════════════════════════════════════════════════════════════ */
test('a rota e #clientes e #clientes/{id}', () => {
  const fn = recortar(TELA, '  function idDaRota(', '\n  }');
  assert.match(fn, /\^#clientes\\\/\(\.\+\)\$/);
  assert.match(TELA, /escreverRota\('#clientes\/' \+ id\)/);
  assert.match(TELA, /escreverRota\('#clientes'\)/);
});

test('o voltar do navegador volta para a lista, e nao sai do MyDesk', () => {
  const fn = recortar(TELA, '  function ligarRota(', '\n  }');
  assert.match(fn, /addEventListener\('popstate'/);
  assert.match(fn, /else if \(!id && _tela === 'detalhe'\) fecharDetalhe\(\{ semRota: true \}\)/);
});

test('entrar direto pela URL abre aquele cliente, e id invalido da erro seguro', () => {
  const fn = recortar(TELA, '  function entrar(', '\n  }');
  assert.match(fn, /const alvo = idDaRota\(\)/);
  assert.match(fn, /if \(porId\(alvo\)\) \{ abrirCliente\(alvo, \{ semRota: true \}\); return; \}/);
  /* E o "nao encontrado" so sai quando ha carteira carregada: `entrar` roda
     logo depois de loadRecords, que e assincrono, e no arranque _records esta
     vazio. */
  assert.match(fn, /if \(!M\(\)\.carteira\(\)\.length\) \{ _pendente = alvo; pintarLista\(\); return; \}/);
  const abrir = recortar(TELA, '  function abrirCliente(', '\n  }');
  assert.match(abrir, /if \(!r\) \{ erroCliente\(\); return; \}/);
  const erro = recortar(TELA, '  function erroCliente(', '\n  }');
  assert.match(erro, /cli\.notFound/);
  assert.match(erro, /cli\.backToClients/);
});

test('o cliente vem da carteira do quadro atual, e nao de qualquer lugar', () => {
  /* E o que impede abrir pela URL um cliente de outro espaco de trabalho:
     `_registrosClientes` so tem o que o ouvinte daquele quadro carregou. */
  const fn = recortar(TELA, '  function porId(', '\n  }');
  assert.match(fn, /M\(\)\.carteira\(\)\.find/);
  assert.match(fn, /_registrosClientes\(\)\.find/);
  assert.equal(/fbGet|firebase|\.ref\(/.test(fn), false,
    'passou a buscar cliente direto no banco, fora do quadro');
});

test('Esc volta para a lista, mas nao quando ha algo aberto por cima', () => {
  /* A pagina do cliente NAO e modal: fechar por Esc com um formulario aberto
     fecharia a coisa errada. */
  const fn = recortar(TELA, '  function ligarRota(', '\n  }');
  assert.match(fn, /ev\.key !== 'Escape'/);
  assert.match(fn, /querySelector\('\.modal-bg, \.confirm-clear-pop, \.cdash-menu'\)\) return;/);
});

/* ═══════════════════════════════════════════════════════════════════════
   O FUNDO ANIMADO
   ═══════════════════════════════════════════════════════════════════════ */
test('a animacao e CSS: nada de GIF, video ou biblioteca de fora', () => {
  const fn = recortar(TELA, '  function fundoAnimado(', '\n  }');
  assert.equal(/\.gif|<video|<canvas|particles\.js|https?:/.test(fn), false);
  assert.match(fn, /cli-fundo-base/);
  assert.match(fn, /cenaDaOnda\(\)/);
  assert.match(fn, /cli-brilho/);
  assert.match(fn, /cli-part/);
  const cena = recortar(TELA, '  function cenaDaOnda(', '\n  }');
  assert.match(cena, /<svg class="cli-onda-svg" viewBox="0 0 1600 420"/);
  assert.equal(/https?:|<image|<video|Three|WebGL/.test(cena), false,
    'a onda passou a depender de coisa de fora');
});

test('a onda e HORIZONTAL: nada de colunas verticais', () => {
  /* A versao anterior eram colunas pontilhadas, cada uma subindo no seu
     tempo: o resultado dizia "equalizador", e nao "superficie". O erro era de
     EIXO — barras que sobem individualmente nunca formam terreno, por mais
     que se acerte a cor. */
  assert.equal(/cli-malha|cliMalha/.test(TELA + CSS), false,
    'as colunas verticais voltaram');
  const cam = recortar(TELA, '  function caminhoDaOnda(', '\n  }');
  assert.match(cam, /' C '/, 'o caminho deixou de ser curva Bezier');
  /* Comeca e termina FORA da cena, para a curva nao ter ponta visivel. */
  assert.match(TELA, /const ONDA_BASE = \[\s*\n?\s*\[-120, 308\]/);
  assert.match(TELA, /\[1720, 224\]/);
  /* Os pontos vem do tracejado SOBRE a curva: eles seguem o caminho, e por
     isso acompanham a onda em vez de se alinharem em coluna. */
  assert.match(CSS, /\.cli-onda-pontos\{[^}]*stroke-dasharray:1 9/);
  assert.match(CSS, /\.cli-onda-linha\{fill:none;stroke-width:1/);
});

test('sao tres camadas com profundidades diferentes', () => {
  /* O que esta longe e menor, mais transparente, mais desfocado e mais lento
     — que e como a distancia se parece. */
  const cena = recortar(TELA, '  function cenaDaOnda(', '\n  }');
  ['cli-camada-tras', 'cli-camada-meio', 'cli-camada-frente']
    .forEach(c => assert.match(cena, new RegExp(c)));
  assert.match(CSS, /\.cli-camada-tras\{opacity:\.62;filter:blur\(1\.3px\);animation:cliOndaTras 34s/);
  assert.match(CSS, /\.cli-camada-meio\{animation:cliOndaMeio 24s/);
  assert.match(CSS, /\.cli-camada-frente\{animation:cliOndaFrente 19s/);
  /* Animacao nos GRUPOS: mover vinte e cinco curvas separadamente seriam
     vinte e cinco animacoes para dizer o que tres dizem. */
  assert.match(CSS, /\.cli-camada\{will-change:transform,opacity/);
  assert.equal(/\.cli-onda-linha\{[^}]*animation:/.test(CSS), false,
    'cada caminho ganhou animacao propria');
});

test('a malha tem entre 14 e 30 caminhos, e menos em tela pequena', () => {
  /* SVG leve: nao e para renderizar centenas de paths. */
  const cena = recortar(TELA, '  function cenaDaOnda(', '\n  }');
  assert.match(cena, /grupoDaOnda\('cli-camada-tras', 8,/);
  assert.match(cena, /celular \? 6 : 12/);
  assert.match(cena, /celular \? 3 : 5/);
  // 8 + 12 + 5 = 25 no desktop; 9 no celular, e a camada de tras nem nasce.
  assert.match(cena, /if \(!tablet\) \{/);
});

test('uma a cada tres e linha continua, e o resto e pontilhado', () => {
  /* So pontos viram poeira; so linhas viram mapa de contorno. */
  const g = recortar(TELA, '  function grupoDaOnda(', '\n  }');
  assert.match(g, /const contorno = i % 3 === 2;/);
  assert.match(g, /contorno \? 'cli-onda-linha' : 'cli-onda-pontos'/);
  /* E os caminhos sao variacoes da MESMA superficie: e disso que a malha
     nasce, e nao de desenhos diferentes lado a lado. */
  assert.match(g, /caminhoDaOnda\(desloc, amp\)/);
  assert.match(g, /const amp = 1 - i \* \(0\.55/);
});

test('o tracejado escorre pela curva, sem mover elemento nenhum', () => {
  assert.match(CSS, /@keyframes cliOndaFluxo\{from\{stroke-dashoffset:0;\}to\{stroke-dashoffset:-120;\}\}/);
  assert.match(CSS, /animation:cliOndaFluxo 26s linear infinite/);
  // E a cena entra com fade ao abrir o cliente, entre 500 e 900ms.
  const m = CSS.match(/animation:cliOndaEntra ([\d.]+)s/);
  assert.ok(m && Number(m[1]) >= 0.5 && Number(m[1]) <= 0.9, 'entrada fora da faixa');
});

test('o fundo nao captura clique e fica atras do conteudo', () => {
  assert.match(CSS, /\.cli-fundo\{[^}]*pointer-events:none/);
  assert.match(CSS, /\.cli-fundo\{[^}]*z-index:0/);
  assert.match(CSS, /\.cli-det>\*:not\(\.cli-fundo\)\{position:relative;z-index:1;\}/);
  assert.match(CSS, /\.cli-part\{[^}]*pointer-events:none/);
  const fn = recortar(TELA, '  function fundoAnimado(', '\n  }');
  assert.match(fn, /'aria-hidden': 'true'/);
});

test('so transform e opacity se movem', () => {
  /* Animar width/top/left obriga o navegador a refazer o layout a cada quadro,
     com tabela e linha do tempo por cima. */
  /* So o miolo dos @keyframes: as camadas declaradas entre eles tem tamanho
     fixo, que e estatico e nao entra nesta conta. */
  const quadros = (CSS.match(/@keyframes cli\w+\{[^@]*?\}\}/g) || []).join('\n');
  assert.ok(quadros.length > 200, 'nao achei os quadros da animacao');
  assert.equal(/\b(width|height|top|left|margin|padding):/.test(quadros), false,
    'a animacao passou a mexer em propriedade de layout');
});

test('menos particulas na tela estreita, e nenhuma centena delas', () => {
  const fn = recortar(TELA, '  function fundoAnimado(', '\n  }');
  assert.match(fn, /const estreito = \(global\.innerWidth \|\| 1200\) < 720/);
  /* Secundarias, e nao protagonistas: o elemento principal e a malha. */
  assert.match(fn, /const quantas = estreito \? 3 : 10/);
});

test('movimento reduzido para tudo, mas mantem a cor', () => {
  /* Quem pediu menos movimento nao pediu menos contraste. */
  const bloco = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce){\n  .cli-fundo-base'));
  assert.match(bloco, /\.cli-fundo-base,\.cli-onda-cena,\.cli-camada,\.cli-onda-pontos,\.cli-brilho,\.cli-part\{animation:none!important/);
  assert.equal(/display:none|background:none/.test(bloco.slice(0, 500)), false,
    'a reducao de movimento apagou o fundo em vez de para-lo');
});

test('o parallax e opcional, some no toque e respeita a reducao', () => {
  const fn = recortar(TELA, '  function ligarParallax(', '\n  }');
  assert.match(fn, /prefers-reduced-motion: reduce/);
  assert.match(fn, /\(hover: none\)/);
  assert.match(fn, /requestAnimationFrame/);
  // Deslocamento de poucos pixels, e so no elemento decorativo.
  assert.match(fn, /- 0\.5\) \* 6/);
  assert.match(fn, /- 0\.5\) \* 4/);
  assert.match(fn, /fundo\.style\.setProperty/);
});

/* ═══════════════════════════════════════════════════════════════════════
   SEGURANÇA E CONSUMO
   ═══════════════════════════════════════════════════════════════════════ */
test('dado de cliente entra por textContent, nunca como marcacao', () => {
  /* Nome, tag, descricao e observacao sao texto digitado. A moldura pode usar
     innerHTML porque nao tem dado de ninguem dentro. */
  const fn = recortar(TELA, '  function linhaDoCliente(', '\n  }');
  assert.equal(/innerHTML/.test(fn), false, 'a linha do cliente voltou a montar HTML');
  assert.match(fn, /texto: M\(\)\.nomeDe\(r\)/);
  const dados = recortar(TELA, '  function abaDados(', '\n  }');
  assert.equal(/innerHTML/.test(dados), false);
  const el = recortar(TELA, '  function el(', '\n  }');
  assert.match(el, /n\.textContent = String\(o\.texto\)/);
});

test('nenhum ouvinte novo no Firebase, e nenhuma escrita fora dos caminhos do CRM', () => {
  /* A linha do tempo mora no proprio registro justamente para nao precisar de
     um segundo no nem de um segundo download. */
  [DADOS, TELA].forEach(fonte => {
    assert.equal(/\.on\('(child_|value)/.test(fonte), false, 'abriu ouvinte proprio');
    assert.equal(/fbSet|fbUpdate|_crmSet\(/.test(fonte), false, 'escreveu direto no banco');
  });
  assert.match(TELA, /updateRecord\(/);
  assert.match(TELA, /createRecord\(/);
});

test('a linha do tempo tem teto, porque o registro inteiro e baixado', () => {
  assert.match(APP, /const CLI_INTERACOES_MAX = 200;/);
  const fn = recortar(TELA, '  async function registrar(', '\n  }');
  assert.match(fn, /\.slice\(-200\)/);
});

test('o upload passa pelas mesmas travas do resto do app', () => {
  /* Um caminho novo de upload sem elas seria a porta dos fundos. */
  const fn = recortar(TELA, '  function criarInputArquivo(', '\n  }');
  assert.match(fn, /podeSubirArquivo/);
  assert.match(fn, /safeFileType/);
  assert.match(fn, /showPremiumModal/);
});

test('excluir diz o tamanho do estrago antes de perguntar', () => {
  /* "Tem certeza?" sem numero nenhum e uma pergunta que nao da para responder. */
  const fn = recortar(TELA, '  function excluir(', '\n  }');
  assert.match(fn, /cli\.impactInteractions/);
  assert.match(fn, /cli\.impactDocs/);
  assert.match(fn, /cli\.impactNotes/);
  assert.match(fn, /As notas do quadro não são apagadas|cli\.deleteImpact/);
});

test('duplicar copia o cadastro, e nada do que aconteceu', () => {
  /* Interacao, documento e acompanhamento pertencem ao cliente que os viveu. */
  const fn = recortar(TELA, '  async function duplicar(', '\n  }');
  assert.equal(/interactions|documents|acompanhamentos/.test(fn), false);
  assert.match(fn, /relationshipStatus: 'negociacao'/);
});

/* ═══════════════════════════════════════════════════════════════════════
   RESPONSIVO
   ═══════════════════════════════════════════════════════════════════════ */
test('no celular a tabela vira cartao, em vez de rolar para o lado', () => {
  /* Nove colunas em 360px viram nove colunas ilegiveis: a rolagem horizontal
     resolveria o layout, e nao a leitura. */
  const bloco = CSS.slice(CSS.indexOf('@media (max-width:760px){'));
  assert.match(bloco, /\.cli-tabela thead\{position:absolute/);
  assert.match(bloco, /\.cli-tabela tbody tr\{display:grid/);
  assert.match(bloco, /\.cli-dados\{grid-template-columns:minmax\(0,1fr\)/);
  // E o fundo animado pesa menos.
  assert.match(bloco, /\.cli-brilho\{filter:blur\(38px\)/);
});

test('o e-mail e o telefone desligam quando nao existem, com o motivo', () => {
  /* Um botao que nao faz nada ensina a nao confiar nos outros. */
  const fn = recortar(TELA, '  function acoesRapidas(', '\n  }');
  assert.match(fn, /cli\.noEmail/);
  assert.match(fn, /cli\.noPhone/);
  assert.match(fn, /disabled: !!impedido/);
  assert.match(CSS, /\.cli-rapida\.off\{opacity:\.35;cursor:not-allowed;\}/);
});

test('o vinculo com o cliente sobrevive a lista branca do compromisso', () => {
  /* Mesma armadilha de createRecord: `_salvarCompromisso` monta um objeto
     novo com quatro campos, e o que nao esta nele some. O compromisso seria
     salvo e apareceria no calendario, mas solto — e a pagina do cliente
     ficaria sem acompanhamento nenhum, sem nada acusando na tela. */
  const fn = recortar(APP, 'async function _salvarCompromisso(');
  assert.match(fn, /\.\.\.\(item\.clienteId \? \{ clienteId: String\(item\.clienteId\) \} : \{\}\)/);
});

test('o acompanhamento nasce com o cliente e atualiza o proximo contato', () => {
  const fn = recortar(TELA, '  async function salvarAcompanhamento(', '\n  }');
  assert.match(fn, /clienteId: String\(r\.id\)/);
  assert.match(fn, /_salvarCompromisso\(item\)/);
  /* Sem isto, a coluna "proximo contato" da tabela continuaria mostrando a
     data antiga depois de agendar. */
  assert.match(fn, /updateRecord\(r\.id, \{ nextContactAt: prox \}\)/);
});

test('a interacao e curta porque o registro inteiro viaja a cada mudanca', () => {
  /* Sao 200 delas dentro de um registro que o ouvinte rebaixa INTEIRO a cada
     alteracao: a 2000 caracteres, um cliente com a linha do tempo cheia
     passaria de 400 KB por download. */
  const ctx = vm.createContext({ Number, String, Array, Math, Object, Date,
    _dataSegura: v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '') });
  vm.runInContext('const CLI_INTERACOES_MAX = 200;', ctx);
  vm.runInContext(recortar(APP, 'function _cliDaLista('), ctx);
  vm.runInContext(APP.slice(APP.indexOf('const CLI_TIPOS_INTERACAO = ['),
    APP.indexOf('window.CLI_TIPOS_INTERACAO')), ctx);
  vm.runInContext(recortar(APP, 'function _cliInteracoes('), ctx);

  const longa = ctx._cliInteracoes([{ id: 'a', tipo: 'nota', data: '2026-08-05',
    texto: 'x'.repeat(5000) }]);
  assert.equal(longa[0].texto.length, 600);
  // E o campo da tela nao deixa digitar mais do que se guarda.
  assert.match(TELA, /id: 'cli-int-txt',\s*\n\s*attrs: \{ maxlength: '600'/);

  // O teto de quantidade guarda as MAIS RECENTES, e nao as primeiras.
  const muitas = Array.from({ length: 260 }, (_, i) => ({ id: 'i' + i,
    tipo: 'nota', data: '2026-08-05', texto: String(i) }));
  const cortadas = ctx._cliInteracoes(muitas);
  assert.equal(cortadas.length, 200);
  assert.equal(cortadas[cortadas.length - 1].texto, '259');
});

test('o menu de modelo aceita ancora, porque o botao do heroi some', () => {
  const fn = recortar(APP, 'function crmAlterarModelo(');
  assert.match(fn, /function crmAlterarModelo\(ancora\)/);
  assert.match(fn, /const btn = ancora \|\| document\.getElementById\('crm-btn-modelo'\)/);
  // E as tres opcoes continuam sendo montadas.
  assert.match(fn, /rh\.modelFinance/);
  assert.match(fn, /rh\.modelRecruiting/);
  assert.match(fn, /app\.modelClients/);
});

test('as observacoes sao campo proprio, e nao entram na linha do tempo', () => {
  /* A linha do tempo registra o que ACONTECEU, e boa parte dela e escrita
     pelo proprio sistema. As observacoes sao o que a pessoa PENSA. Misturar
     as duas faria a leitura do historico virar caderno de recados. */
  assert.match(APP, /observations:\s+_cliObservacoes\(d\.observations\)/);
  assert.match(APP, /const CLI_OBS_MAX = 200;/);
  const fn = recortar(APP, 'function _cliObservacoes(');
  assert.match(fn, /\.slice\(0, 1200\)/);
  assert.match(fn, /_dataSegura\(o\.data\)/);
});

test('a aba de observacoes existe e e a unica dona da nota fixa', () => {
  assert.match(TELA, /\{ key: 'observacoes',i18n: 'cli\.tabNotes'/);
  assert.match(TELA, /case 'observacoes': corpo\.appendChild\(abaObservacoes\(r\)\)/);
  /* O mesmo texto em dois lugares faz a pessoa duvidar de qual e o de
     verdade: a visao geral e a aba de dados nao repetem mais a nota fixa. */
  const visao = recortar(TELA, '  function abaVisao(', '\n  }');
  assert.equal(/internalNotes/.test(visao), false);
  const dados = recortar(TELA, '  function abaDados(', '\n  }');
  assert.equal(/internalNotes/.test(dados), false);
});

test('Clientes e a PRIMEIRA opcao do menu de modelos', () => {
  /* A primeira linha e a que se le sem procurar, e a carteira e o que se abre
     todo dia. */
  const fn = recortar(APP, 'function crmAlterarModelo(');
  const iCli = fn.indexOf('app.modelClients');
  const iFin = fn.indexOf('rh.modelFinance');
  const iRh  = fn.indexOf('rh.modelRecruiting');
  assert.ok(iCli > 0 && iCli < iFin && iFin < iRh, 'a ordem do menu mudou');
});

test('ultimo contato no futuro e recusado', () => {
  /* Contato futuro nao e "ultimo contato": e compromisso, e o campo dele e o
     outro. Aceitar deixaria a coluna dizendo que a conversa aconteceu numa
     data que ainda nao chegou. */
  const fn = recortar(TELA, '    async function salvar(', '\n    }');
  assert.match(fn, /if \(ultimo && ultimo > M\(\)\.hojeIso\(\)\)/);
  assert.match(fn, /cli\.lastInFuture/);
});

test('o sparkline sai dos dados, e some quando nao ha o que medir', () => {
  /* Um grafico com forma inventada mente sobre uma tendencia que ninguem
     mediu. Linha reta no zero tambem e uma afirmacao, e falsa. */
  const fn = recortar(TELA, '  function sparkline(', '\n  }');
  assert.match(fn, /if \(!v\.length \|\| v\.every\(x => x === 0\)\) return null;/);
  const janela = recortar(TELA, '  function porSemana(', '\n  }');
  assert.match(janela, /new Array\(8\)\.fill\(0\)/);
  assert.match(janela, /M\(\)\.diasEntre\(d, hoje\)/);
});

test('os cartoes do cliente tem a forma da referencia', () => {
  /* Anel a esquerda, rotulo pequeno em cima do numero grande, e o risco
     ocupando a LARGURA do cartao, embaixo — e nao espremido ao lado do
     texto. */
  const fn = recortar(TELA, '  function indicadoresDoCliente(', '\n  }');
  assert.match(fn, /cli-det-kpi-topo/);
  assert.match(fn, /bloco\.appendChild\(risco \|\| el\('div', \{ cls: 'cli-spark cli-spark-vazio' \}\)\)/);
  assert.match(CSS, /\.cli-det-kpi\{display:flex;flex-direction:column;/);
  assert.match(CSS, /\.cli-kpi-anel\{width:42px;height:42px;border-radius:50%/);
  assert.match(CSS, /\.cli-det-kpi \.cli-kpi-num\{font-size:1\.75rem/);
  // E os icones sao os do desenho: pessoas, pulso, confere e sorriso.
  assert.match(fn, /cartao\('users',/);
  assert.match(fn, /cartao\('pulse',/);
  assert.match(fn, /cartao\('checkc',/);
  assert.match(fn, /cartao\('smile',/);
});

test('as camadas nao andam juntas, e ai nasce a profundidade', () => {
  /* Duracao, atraso e amplitude diferentes por camada. Iguais, as tres viram
     uma so e a cena fica chapada. */
  const dur = ['cliOndaTras', 'cliOndaMeio', 'cliOndaFrente'].map(nome => {
    const m = CSS.match(new RegExp('animation:' + nome + ' (\\d+)s'));
    assert.ok(m, 'sumiu a animacao ' + nome);
    return Number(m[1]);
  });
  assert.equal(new Set(dur).size, 3, 'duas camadas com a mesma duracao');
  // Movimento lento e organico: a de tras e a mais lenta.
  assert.ok(dur[0] > dur[1] && dur[1] > dur[2], 'a profundidade inverteu');
  assert.match(CSS, /\.cli-camada-meio\{[^}]*animation-delay:-5s/);
  assert.match(CSS, /\.cli-camada-frente\{[^}]*animation-delay:-11s/);
});

test('a faixa do fundo morre antes de encostar no conteudo', () => {
  /* Fundo que vai ate a borda compete com o texto em vez de emoldura-lo — e
     era o que acontecia: a malha descia por tras dos cartoes. */
  assert.match(CSS, /\.cli-fundo\{[^}]*height:min\(330px,46vh\)/);
  assert.match(CSS, /\.cli-fundo\{[^}]*mask-image:linear-gradient\(to bottom,#000 52%,transparent 100%\)/);
  /* Duas mascaras no mesmo elemento dependem de `mask-composite`, que os
     navegadores implementam com nomes diferentes e nem sempre: quando ele nao
     pega, as duas viram uniao em vez de intersecao. Por isso o esmaecimento
     horizontal fica na onda e o vertical no pai. */
  const cena = CSS.slice(CSS.indexOf('.cli-onda-cena{'), CSS.indexOf('.cli-onda-svg{'))
    .replace(/\/\*[\s\S]*?\*\//g, '');   // sem os comentarios, que falam da propriedade
  assert.equal(/mask-composite/.test(cena), false);
  assert.match(cena, /mask-image:linear-gradient\(to left,#000 46%,transparent 96%\);/);
  assert.match(cena, /pointer-events:none/);
});

test('a observacao datada tem a mesma forma da nota fixa', () => {
  /* A versao anterior era um fio com um ponto do lado: mais leve, e por isso
     mesmo lida como rodape do cartao de cima em vez de conteudo proprio. */
  assert.match(CSS, /\.cli-obs\{border:1px solid var\(--clr-border\);border-radius:12px/);
  assert.match(CSS, /\.cli-obs-data\{display:flex;align-items:center;justify-content:space-between/);
  // O que separa as duas continua sendo a borda.
  assert.match(CSS, /\.cli-obs-fixa\{border:1px dashed/);
  const fn = recortar(TELA, '  function abaObservacoes(', '\n  }');
  assert.match(fn, /item\.querySelector\('\.cli-obs-data'\)\.appendChild\(acoes\)/);
});

test('a linha do acompanhamento usa as fontes do desenho', () => {
  /* Syne e a fonte de TITULO do MyDesk: formas largas e caracteristicas, e num
     numero de dois digitos o "06" sai parecendo "o6". No desenho o dia e um
     numero comum, so pesado. E a mono existe no projeto para numero que se
     COMPARA em coluna; na hora ela so da cara de terminal. */
  assert.match(CSS, /\.cli-acomp-dia\{font-family:'Inter'/);
  assert.match(CSS, /\.cli-acomp-hora\{font-family:'Inter'/);
  // `tabular-nums` mantem o alinhamento sem precisar de monoespacada.
  assert.match(CSS, /\.cli-acomp-dia\{[^}]*tabular-nums/);
  assert.match(CSS, /\.cli-acomp-hora\{[^}]*tabular-nums/);
});

test('o ponto do acompanhamento diz QUANDO, e nao quem', () => {
  /* Ele saia da paleta do cliente, sorteada pelo id — e a paleta tem rosa,
     que numa lista de compromissos nao quer dizer nada e ainda puxa o olho
     mais que o proprio assunto. */
  const fn = recortar(TELA, '  function linhaAcompanhamento(', '\n  }');
  assert.match(fn, /const quando = a\.data < M\(\)\.hojeIso\(\) \? 'atrasado'/);
  assert.match(fn, /cli-acomp-ponto ' \+ quando/);
  assert.equal(/cli-acomp-ponto[^]*corDe\(r\.id\)/.test(fn), false,
    'o ponto voltou a sair da cor sorteada do cliente');
  ['futuro', 'hoje', 'atrasado'].forEach(k =>
    assert.match(CSS, new RegExp('\\.cli-acomp-ponto\\.' + k + '\\{--pt:')));
  /* O halo e da PROPRIA cor, e nao um contorno branco quase invisivel: e o
     que faz o ponto parecer aceso na referencia. */
  assert.match(CSS, /\.cli-acomp-ponto\{[^}]*color-mix\(in srgb,var\(--pt\) 22%/);
});

test('o espacamento da linha AGRUPA, em vez de distribuir por igual', () => {
  /* Medindo a referencia: dia →18px→ hora →14px→ ponto →15px→ assunto. Com
     um `gap` unico tudo fica equidistante e a linha perde o agrupamento —
     data e hora sao uma coisa, ponto e assunto sao outra. */
  assert.match(CSS, /\.cli-acomp-item\{[^}]*gap:0;/);
  assert.match(CSS, /\.cli-acomp-data\{[^}]*margin-right:18px/);
  assert.match(CSS, /\.cli-acomp-hora\{[^}]*margin-right:14px/);
  assert.match(CSS, /\.cli-acomp-ponto\{[^}]*margin-right:15px/);
  /* E dia e mes alinhados a ESQUERDA: na referencia o "MAI" comeca embaixo do
     primeiro digito do dia, e nao centrado sob os dois. */
  assert.match(CSS, /\.cli-acomp-data\{[^}]*align-items:flex-start/);
});

/* ═══════════════════════════════════════════════════════════════════════
   UMA SERIE E UM CLIENTE
   ═══════════════════════════════════════════════════════════════════════
   No financeiro, um contrato de doze parcelas sao doze registros — e ali
   esta certo: cada parcela tem vencimento, valor e status proprios. Aqui
   nao. A pessoa que contratou e uma so, e a carteira mostrava a mesma
   empresa doze vezes, com o contador dizendo "27 clientes" para quem tem um.
   ═══════════════════════════════════════════════════════════════════════ */
test('as parcelas de um contrato NAO viram varios clientes', () => {
  const parcelas = Array.from({ length: 27 }, (_, i) => cliente('p' + i, {
    name: 'Empresa LTDA JRs', serieId: 'ser_1', serieN: i + 1, serieDe: 27,
  }));
  const M = montar(parcelas);
  assert.equal(M.carteira().length, 1, 'a carteira contou parcela como cliente');
  assert.equal(M.indicadores().total, 1);
  assert.equal(M.indicadores().ativos, 1);
});

test('fica a PRIMEIRA parcela, que e a que tem o cadastro', () => {
  /* As outras nascem dela, com o mesmo nome e mais nada. Preservar o id da
     primeira mantem editar e abrir mexendo no registro de origem. */
  const M = montar([
    cliente('p3', { serieId: 's', serieN: 3, serieDe: 3 }),
    cliente('p1', { serieId: 's', serieN: 1, serieDe: 3, email: 'a@b.com' }),
    cliente('p2', { serieId: 's', serieN: 2, serieDe: 3 }),
  ]);
  const carteira = M.carteira();
  assert.equal(carteira.length, 1);
  assert.equal(carteira[0].id, 'p1');
  assert.equal(carteira[0].email, 'a@b.com');
});

test('contratos diferentes continuam sendo clientes diferentes', () => {
  const M = montar([
    cliente('a1', { serieId: 'x', serieN: 1 }),
    cliente('a2', { serieId: 'x', serieN: 2 }),
    cliente('b1', { serieId: 'y', serieN: 1 }),
    cliente('solto'),
  ]);
  assert.equal(M.carteira().length, 3);
});

test('registro sem serie nao e tocado', () => {
  /* Ele ja e um cliente por conta propria — inclusive dois com o mesmo nome,
     que sao duas empresas homonimas e nao uma repetida. */
  const M = montar([cliente('a', { name: 'Igual' }), cliente('b', { name: 'Igual' })]);
  assert.equal(M.carteira().length, 2);
});

test('o botao da barra nomeia o PAINEL, e nao o destino do clique', () => {
  /* Ele dizia "Notas" enquanto estava aceso, dentro do painel de Clientes:
     duas afirmacoes contrarias no mesmo botao — o texto dizendo "voce vai
     para Notas" e o realce dizendo "voce esta em Notas". */
  const fn = recortar(APP, 'function _crmRotuloDoPainel(');
  assert.match(fn, /crmModeloClientes\(\)\) return _appText\('app\.modelClients'/);
  assert.match(fn, /crmModeloRH\(\)\) return _appText\('rh\.modelRecruitingShort'/);
  const toggle = recortar(APP, 'function toggleCRMView(');
  assert.match(toggle, /label\.textContent = _crmRotuloDoPainel\(\)/);
  assert.equal(/btn\.classList\.add\('active'\);\s*\n\s*label\.textContent = _appText\('app\.notesLabel'/
    .test(toggle), false, 'voltou a dizer "Notas" com o botao aceso');
  // E trocar de modelo dentro do painel atualiza o nome junto.
  const aplicar = recortar(APP, 'function _crmAplicarModelo(');
  assert.match(aplicar, /rotuloPainel && _crmMode\) rotuloPainel\.textContent = _crmRotuloDoPainel\(\)/);
});

test('a variacao do resumo so aparece onde pode ser calculada', () => {
  /* "Novos clientes" tem periodo anterior para comparar. "Clientes ativos"
     nao: o registro guarda o status ATUAL, e nao a historia dele, entao
     "quantos estavam ativos no mes passado" nao existe em lugar nenhum.
     Inventar uma seta ali seria dar ares de medida a um palpite. */
  const M = montar([
    cliente('a', { createdAt: Date.UTC(2026, 6, 10) }),
    cliente('b', { createdAt: Date.UTC(2026, 6, 12) }),
    cliente('c', { createdAt: Date.UTC(2026, 7, 2) }),
    cliente('d', { createdAt: Date.UTC(2026, 7, 3) }),
    cliente('e', { createdAt: Date.UTC(2026, 7, 4) }),
  ]);
  assert.equal(M.resumo('mes').variacaoNovos, 50);   // 3 contra 2
  // Sem periodo anterior, nao ha variacao — e nao "+100%".
  assert.equal(montar([cliente('x')]).resumo('mes').variacaoNovos, null);
  const fn = recortar(TELA, '  function cartaoResumo(', '\n  }');
  assert.match(fn, /r\.variacaoNovos/);
  assert.match(fn, /delta !== null && delta !== undefined/);
});

test('a faixa do topo tem o gradiente teal, e as camadas se separam', () => {
  assert.match(CSS, /\.cli-faixa\{[^}]*linear-gradient\(180deg,#08252a/);
  assert.match(CSS, /--cli-fundo:#060809;--cli-cartao:#0b1417;--cli-tabela:#0a1012/);
  assert.match(CSS, /\.cli-painel\{background:var\(--cli-cartao/);
  assert.match(CSS, /#cli-painel-tabela\{[^}]*background:var\(--cli-tabela/);
});

test('o painel da tabela ocupa a altura, e o rodape fica no fim', () => {
  /* Com `align-items:start` ele terminava logo depois da ultima linha e
     deixava um vao preto embaixo. */
  assert.match(CSS, /\.cli-corpo\{[^}]*align-items:stretch/);
  assert.match(CSS, /#cli-painel-tabela\{[^}]*min-height:min\(560px,58vh\)/);
  assert.match(CSS, /\.cli-tabela-wrap>\.cli-rodape\{margin-top:auto;\}/);
});

test('o subtitulo cabe em uma linha no desktop', () => {
  /* O `max-width:52ch` quebrava em duas linhas mesmo sobrando espaco. */
  assert.match(CSS, /\.cli-sub\{[^}]*white-space:nowrap/);
  assert.equal(/\.cli-sub\{[^}]*max-width:52ch/.test(CSS), false);
  // E o titulo desceu de 1.85rem para caber na proporcao da referencia.
  assert.match(CSS, /\.cli-titulo\{[^}]*font-size:1\.5rem/);
});

test('o numero do indicador tem tamanho fixo', () => {
  /* "1" e "128" dizem a mesma coisa sobre a importancia do indicador, e um
     "1" miudo faria a carteira nova parecer erro de carga. */
  assert.match(CSS, /\.cli-kpi-num\{[^}]*font-size:1\.65rem/);
  assert.match(CSS, /\.cli-kpi-num\{[^}]*tabular-nums/);
  assert.equal(/\.cli-kpi-num\{[^}]*font-size:clamp/.test(CSS), false);
});

test('a linha da tabela tem barra teal no hover e no foco', () => {
  assert.match(CSS, /\.cli-linha:hover\{background:rgba\(20,184,166,\.05\);box-shadow:inset 2px 0 0/);
  assert.match(CSS, /\.cli-linha:focus-visible\{[^}]*inset 2px 0 0/);
  /* Sem mexer na altura: linha que cresce ao passar o mouse empurra as de
     baixo e a lista treme. */
  const regra = CSS.slice(CSS.indexOf('.cli-linha:hover{'), CSS.indexOf('.cli-linha:hover{') + 130);
  assert.equal(/height|padding|transform|margin/.test(regra), false);
});

test('"vs mes anterior" compara com o mes anterior INTEIRO', () => {
  /* No dia 5, comparar com "os quatro dias antes do dia 1" nao e o que
     ninguem entende por "vs mes anterior". Ja em janelas moveis (30 dias, 3
     meses), a comparacao com a janela de mesmo tamanho imediatamente antes e
     a leitura natural. */
  const fn = recortar(DADOS, '  function resumo(', '\n  }');
  assert.match(fn, /if \(per === 'mes' \|\| per === 'ano'\)/);
  assert.match(fn, /ateAntes\.slice\(0, 8\) \+ '01'/);
  const M = montar([
    cliente('j1', { createdAt: Date.UTC(2026, 6, 10) }),
    cliente('j2', { createdAt: Date.UTC(2026, 6, 28) }),
    cliente('a1', { createdAt: Date.UTC(2026, 7, 2) }),
  ]);
  // 1 em agosto contra 2 em julho: caiu pela metade.
  assert.equal(M.resumo('mes').variacaoNovos, -50);
});

test('o painel do financeiro nao se chama mais "Painel de Clientes"', () => {
  /* Era o nome desta tela quando ela era a unica. Agora ha um modelo de
     Clientes com tela propria, e o titulo ficou sobre a leitura de DINHEIRO:
     dois paineis com o mesmo nome, mostrando coisas diferentes. */
  const fn = recortar(APP, 'function _crmAplicarModelo(');
  assert.match(fn, /_appText\('app\.financePanel', 'Painel Financeiro'\)/);
  assert.equal(/app\.clientsPanel/.test(fn), false);
  const CAT = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
  assert.match(CAT, /'app\.financePanel': \['Painel Financeiro'/);
});

test('o construtor honra as opcoes mesmo sem nicho', () => {
  /* Antes, `pre` so existia quando vinha um nicho junto: quem chamasse com
     {criarCliente:true} e mais nada era ignorado em silencio — o construtor
     abria, a pessoa montava o formulario, e as respostas nao viravam cliente.
     O painel de Clientes chama exatamente assim, porque cliente nao e nicho. */
  const fn = recortar(APP, 'function abrirConstrutorFormulario(');
  assert.match(fn, /const pre = \(opcoes && typeof opcoes === 'object'\) \? opcoes : null;/);
  assert.match(fn, /if \(pre && pre\.criarCliente\) \{/);
  assert.match(fn, /_fmRascunho\.crmDestino   = _fmCrmDestinoAtual\(\);/);
  /* E o telefone entra junto: sem ele o cliente nasce com o botao de ligar
     ja desligado. */
  assert.match(fn, /crmCampo: 'phone'/);
});
