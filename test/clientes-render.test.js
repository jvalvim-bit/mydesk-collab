'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MODELO CLIENTES — a tela desenha mesmo?
   ═══════════════════════════════════════════════════════════════════════
   Os outros testes leem o código. Este EXECUTA: monta a carteira e a página
   do cliente sobre um DOM de mentira e falha se algo estourar no caminho.

   O motivo é específico deste projeto. São scripts clássicos, e um nome
   errado — uma função que existe em outro arquivo mas não é global, um
   `const` do app.js lido por `window.` — não dá erro nenhum até a linha
   rodar. Aí a tela inteira fica em branco, sem nada no console além de um
   ReferenceError que ninguém está olhando. Foi o que quase aconteceu com as
   listas de status: `window.CLI_STATUS` valia undefined, e o `|| []` do outro
   lado transformava isso numa tela sem status, sem segmento e sem tipo.

   O DOM aqui é pequeno de propósito: só o que estas telas encostam.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const DADOS = fs.readFileSync(path.join(RAIZ, 'docs/js/clientes.js'), 'utf8');
const TELA  = fs.readFileSync(path.join(RAIZ, 'docs/js/clientes-tela.js'), 'utf8');
const TELA_SRC = TELA;

/* ── Um DOM do tamanho do problema ──────────────────────────────────── */
function criarDOM() {
  const feito = { toasts: [], menus: [], gravacoes: [] };

  function No(tag) {
    const n = {
      tag: String(tag || 'div').toLowerCase(),
      filhos: [], pai: null, atributos: {}, ouvintes: {},
      _classe: '', _texto: '', _html: '', value: '', scrollTop: 0,
      style: { setProperty(k, v) { this[k] = v; } },
      dataset: {},
    };
    n.classList = {
      add: c => { if (!n._classe.split(' ').includes(c)) n._classe = (n._classe + ' ' + c).trim(); },
      remove: c => { n._classe = n._classe.split(' ').filter(x => x && x !== c).join(' '); },
      toggle: (c, v) => { if (v === false) n.classList.remove(c); else n.classList.add(c); },
      contains: c => n._classe.split(' ').includes(c),
    };
    Object.defineProperty(n, 'className', {
      get: () => n._classe, set: v => { n._classe = String(v || ''); },
    });
    Object.defineProperty(n, 'textContent', {
      get: () => n._texto || n.filhos.map(f => f.textContent).join(''),
      set: v => { n._texto = String(v == null ? '' : v); n.filhos = []; },
    });
    Object.defineProperty(n, 'innerHTML', {
      get: () => n._html,
      set: v => { n._html = String(v == null ? '' : v); n.filhos = []; },
    });
    n.setAttribute = (k, v) => {
      n.atributos[k] = String(v);
      if (k === 'id') n.id = String(v);
      if (k.startsWith('data-')) n.dataset[k.slice(5).replace(/-(\w)/g, (a, c) => c.toUpperCase())] = String(v);
    };
    n.getAttribute = k => (k in n.atributos ? n.atributos[k] : null);
    n.appendChild = f => { if (f) { f.pai = n; n.filhos.push(f); } return f; };
    n.addEventListener = (ev, fn) => { (n.ouvintes[ev] = n.ouvintes[ev] || []).push(fn); };
    n.removeEventListener = () => {};
    n.remove = () => { if (n.pai) n.pai.filhos = n.pai.filhos.filter(x => x !== n); };
    n.focus = () => { feito.focado = n; };
    n.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0 });
    n.closest = () => null;
    n.disparar = (ev, arg) => (n.ouvintes[ev] || []).forEach(fn => fn(arg || { target: n,
      currentTarget: n, stopPropagation() {}, preventDefault() {} }));
    n.querySelector = sel => procurar(n, sel)[0] || null;
    n.querySelectorAll = sel => procurar(n, sel);
    return n;
  }

  /* Casa `#id`, `.classe`, `tag` e `[attr="valor"]`, listas por vírgula E
     descendencia (`.pai .filho`) — sem esta ultima, `.cli-tabela th` era lido
     como "um no que e th E tem a classe cli-tabela", que nao existe, e a
     busca devolvia vazio sempre. Um teste que procura errado passa a dizer
     que a tela esta errada. */
  function casaSimples(no, parte) {
    const partes = parte.match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|^[a-z]+/g) || [];
    return partes.every(p => {
      if (p[0] === '#') return no.id === p.slice(1);
      if (p[0] === '.') return no.classList.contains(p.slice(1));
      if (p[0] === '[') {
        const m = p.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
        if (!m) return false;
        const v = no.getAttribute(m[1]);
        return m[2] === undefined ? v !== null : v === m[2];
      }
      return no.tag === p;
    });
  }

  function casa(no, sel) {
    return sel.split(',').map(x => x.trim()).filter(Boolean).some(alternativa => {
      const passos = alternativa.split(/\s+/).filter(Boolean);
      if (!casaSimples(no, passos[passos.length - 1])) return false;
      let atual = no.pai;
      for (let i = passos.length - 2; i >= 0; i--) {
        while (atual && !casaSimples(atual, passos[i])) atual = atual.pai;
        if (!atual) return false;
        atual = atual.pai;
      }
      return true;
    });
  }

  function procurar(raiz, sel) {
    const achados = [];
    (function anda(no) {
      no.filhos.forEach(f => { if (casa(f, sel)) achados.push(f); anda(f); });
    })(raiz);
    return achados;
  }

  const body = No('body');
  const crmView = No('div');
  crmView.setAttribute('id', 'crm-view');
  body.appendChild(crmView);

  const document = {
    createElement: No,
    body,
    getElementById: id => (id === 'crm-view' ? crmView : procurar(body, '#' + id)[0] || null),
    querySelector: sel => procurar(body, sel)[0] || null,
    querySelectorAll: sel => procurar(body, sel),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return { document, body, crmView, feito, No };
}

function ambiente(registros, agenda) {
  const dom = criarDOM();
  const g = {
    console, Date, Number, String, Math, Array, Object, Set, JSON, RegExp,
    Promise, isNaN, parseInt, parseFloat, setTimeout: fn => fn(),
    clearTimeout: () => {}, requestAnimationFrame: fn => fn(),
    cancelAnimationFrame: () => {},
    innerWidth: 1400, innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}, removeEventListener: () => {},
    location: { hash: '' },
    history: { pushState: () => {} },
    document: dom.document,
    _registrosClientes: () => registros || [],
    _agenda: agenda || [],
    notes: [],
    CU: { username: 'victor', uid: 'u1' },
    _crmTodayLocalIso: () => '2026-08-05',
    _crmFmtDate: iso => String(iso).split('-').reverse().join('/'),
    _appLocale: () => 'pt-BR',
    _appText: (chave, padrao, vars) => String(padrao).replace(/\{(\w+)\}/g,
      (a, k) => (vars && vars[k] !== undefined ? String(vars[k]) : a)),
    _cdashMenu: (ancora, itens, titulo) => { dom.feito.menus.push({ itens, titulo }); },
    toast: (i, t) => dom.feito.toasts.push(t),
    updateRecord: (id, mud) => { dom.feito.gravacoes.push({ id, mud }); return Promise.resolve(); },
    createRecord: d => { dom.feito.gravacoes.push({ novo: d }); return Promise.resolve({ id: 'novo' }); },
    deleteRecord: () => Promise.resolve(),
    /* O processo juridico mostra valor da causa e honorarios — atributos da
       acao, e nao a leitura financeira da carteira. */
    fmtBRL: n => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','),
    MD_RH: { modelo: () => 'clientes' },
  };
  g.window = g;
  g.globalThis = g;
  /* As listas atravessam arquivos por window — é assim no app.js. */
  const vm = require('node:vm');
  vm.createContext(g);
  vm.runInContext(`
    window.CLI_STATUS = [
      { key:'ativo', i18n:'', pt:'Ativo', cor:'#10b981' },
      { key:'negociacao', i18n:'', pt:'Em negociação', cor:'#3b82f6' },
      { key:'aguardando', i18n:'', pt:'Aguardando retorno', cor:'#f59e0b' },
      { key:'acompanhando', i18n:'', pt:'Em acompanhamento', cor:'#22d3ee' },
      { key:'inativo', i18n:'', pt:'Inativo', cor:'#94a3b8' },
      { key:'encerrado', i18n:'', pt:'Encerrado', cor:'#ef4444' }];
    window.CLI_SEGMENTOS = [{ key:'tecnologia', i18n:'', pt:'Tecnologia' },
                            { key:'varejo', i18n:'', pt:'Varejo' }];
    window.CLI_TIPOS = [{ key:'pj', i18n:'', pt:'Pessoa jurídica' },
                        { key:'pf', i18n:'', pt:'Pessoa física' }];
    window.CLI_PRIORIDADES = [{ key:'alta', i18n:'', pt:'Alta' },
      { key:'media', i18n:'', pt:'Média' }, { key:'baixa', i18n:'', pt:'Baixa' }];
    window.CLI_ORIGENS = [{ key:'indicacao', i18n:'', pt:'Indicação' }];
    window.CLI_FASES_PROCESSO = [
      { key:'consulta', i18n:'', pt:'Consulta' },
      { key:'peticao', i18n:'', pt:'Petição inicial' },
      { key:'instrucao', i18n:'', pt:'Instrução' },
      { key:'sentenca', i18n:'', pt:'Sentença' },
      { key:'recurso', i18n:'', pt:'Recurso' },
      { key:'execucao', i18n:'', pt:'Execução' },
      { key:'encerrado', i18n:'', pt:'Encerrado' },
      { key:'arquivado', i18n:'', pt:'Arquivado' }];
    window.CLI_TIPOS_INTERACAO = [
      { key:'ligacao', i18n:'', pt:'Ligação', ico:'phone' },
      { key:'nota', i18n:'', pt:'Nota', ico:'note' },
      { key:'evento', i18n:'', pt:'Evento', ico:'calendar' },
      { key:'status', i18n:'', pt:'Alteração de status', ico:'flag' },
      { key:'tarefa', i18n:'', pt:'Tarefa', ico:'check' },
      { key:'reuniao', i18n:'', pt:'Reunião', ico:'users' },
      { key:'documento', i18n:'', pt:'Documento', ico:'file' }];
  `, g);
  vm.runInContext(DADOS, g);
  vm.runInContext(TELA, g);
  return { g, dom };
}

/* O mesmo ambiente, mas com a carteira entregue por uma FUNCAO: e o que
   permite simular os registros chegando depois, como chegam de verdade. */
function ambienteCru(dom, fonte) {
  const { g } = ambiente([], []);
  g.document = dom.document;
  g._registrosClientes = fonte;
  const vm = require('node:vm');
  vm.runInContext(DADOS, g);
  vm.runInContext(TELA, g);
  return g;
}

const CLIENTES = [
  { id: 'crm_1', type: 'client', name: 'Acme Consultoria',
    companyName: 'Acme Soluções Ltda', contactName: 'Ana Clara Martins',
    email: 'contato@acme.com.br', phone: '11998472210', city: 'São Paulo', uf: 'SP',
    segment: 'tecnologia', relationshipStatus: 'ativo', clientType: 'pj',
    tags: ['Estratégico', 'VIP', 'B2B'], priority: 'alta', favorite: true,
    responsibleUserId: 'victor', nextContactAt: '2026-08-20',
    lastContactAt: '2026-08-01', createdAt: Date.UTC(2026, 6, 15),
    description: 'Empresa de tecnologia voltada para automação comercial.',
    interactions: [
      { id: 'i1', tipo: 'ligacao', data: '2026-08-01', hora: '10:00',
        autor: 'victor', texto: 'Falamos sobre a renovação.' },
      { id: 'i2', tipo: 'nota', data: '2026-07-20', hora: '', autor: 'victor', texto: 'Enviou documentos.' },
    ],
    documents: [{ name: 'contrato.pdf', size: 240000, type: 'application/pdf' }],
  },
  /* Um registro ANTIGO, do jeito que está no banco de quem já usa: nenhum
     campo do modelo de clientes. */
  { id: 'crm_2', type: 'client', name: 'Padaria do Zé', value: 8000,
    status: 'paid', dueDate: '2026-09-10', createdAt: Date.UTC(2026, 5, 2) },
  { id: 'crm_3', type: 'client', name: 'Sem nada' },
];

const AGENDA = [
  { id: 'ag1', clienteId: 'crm_1', titulo: 'Reunião de alinhamento',
    data: '2026-08-22', hora: '10:00' },
  { id: 'ag2', clienteId: 'crm_1', titulo: 'Envio de proposta',
    data: '2026-07-30', hora: '14:30' },
];

/* ═══════════════════════════════════════════════════════════════════════ */
test('a carteira desenha inteira, sem estourar', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarLista();
  const v = dom.document.getElementById('cli-view');
  assert.ok(v, 'a raiz do modelo nao foi criada');
  assert.equal(v.querySelectorAll('.cli-kpi').length, 4, 'faltaram cartoes de indicador');
  assert.equal(v.querySelectorAll('.cli-linha').length, 3, 'a tabela nao trouxe os clientes');
  assert.ok(v.querySelector('.cli-rodape'), 'sumiu o rodape com a paginacao');
  assert.ok(v.querySelector('.cli-resumo'), 'sumiu o resumo rapido');
  assert.ok(v.querySelector('.cli-acoes-lista'), 'sumiram as proximas acoes');
});

test('as listas chegaram — status, segmento e tipo aparecem escritos', () => {
  /* Este e o teste que pegaria `window.CLI_STATUS === undefined`: com o
     `|| []` do outro lado, a tela desenharia sem erro nenhum e sem nada
     dentro. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarLista();
  const texto = dom.document.getElementById('cli-view').textContent;
  assert.match(texto, /Ativo/, 'o status nao foi escrito');
  assert.match(texto, /Tecnologia/, 'o segmento nao foi escrito');
  assert.match(texto, /Acme/, 'o nome do cliente nao foi escrito');
});

test('as tags mostram as principais e contam o resto', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarLista();
  const chips = dom.document.querySelectorAll('.cli-chip-mais');
  assert.equal(chips.length, 1);
  assert.equal(chips[0].textContent, '+1', 'tres tags, duas a mostra, uma contada');
});

test('cliente antigo entra na tabela com travessao, e nao com undefined', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarLista();
  const texto = dom.document.getElementById('cli-view').textContent;
  assert.equal(texto.includes('undefined'), false, 'undefined vazou para a tela');
  assert.equal(texto.includes('null'), false, 'null vazou para a tela');
  assert.match(texto, /Padaria do Zé/);
});

test('carteira vazia mostra o convite, e nao "nenhum resultado"', () => {
  /* "Nenhum cliente encontrado" numa carteira vazia manda a pessoa procurar o
     que ela nunca cadastrou. */
  const { g, dom } = ambiente([], []);
  g.MD_CLI_TELA.pintarLista();
  const texto = dom.document.getElementById('cli-view').textContent;
  assert.match(texto, /carteira está vazia/);
  assert.match(texto, /Adicionar primeiro cliente/);
});

test('busca sem resultado oferece limpar, em vez do convite de cadastro', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.S.busca = 'zzzznaoexiste';
  g.MD_CLI_TELA.pintarLista();
  const texto = dom.document.getElementById('cli-view').textContent;
  assert.match(texto, /Nenhum cliente encontrado/);
  assert.match(texto, /Limpar filtros/);
  g.MD_CLI.S.busca = '';
});

test('a pagina do cliente desenha inteira, com as quatro camadas do fundo', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  const v = dom.document.getElementById('cli-view');
  assert.ok(v.querySelector('.cli-fundo-base'), 'sumiu a camada de fundo');
  assert.ok(v.querySelector('.cli-onda-cena'), 'sumiu a cena da onda');
  assert.equal(v.querySelectorAll('.cli-brilho').length, 3);
  assert.ok(v.querySelectorAll('.cli-part').length >= 8, 'faltaram particulas');
  assert.ok(v.querySelector('.cli-foco'), 'sumiu o cartao do cliente em foco');
  assert.equal(v.querySelectorAll('.cli-rapida').length, 6, 'as seis acoes rapidas');
  assert.equal(v.querySelectorAll('.cli-det-kpi').length, 4);
  assert.ok(v.querySelector('.cli-acomp'), 'sumiu o bloco de acompanhamentos');
  assert.equal(v.querySelectorAll('.cli-aba').length, 6);
});

test('a lista SAI quando o detalhe entra', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarLista();
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 3);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 0,
    'a tabela continuou na tela por baixo da pagina do cliente');
});

test('o cartao em foco traz os dados reais do cliente clicado', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  const foco = dom.document.querySelector('.cli-foco').textContent;
  assert.match(foco, /Acme Soluções Ltda/);
  assert.match(foco, /contato@acme\.com\.br/);
  assert.match(foco, /São Paulo, SP/);
  assert.match(foco, /Pessoa jurídica/);
  assert.match(foco, /Estratégico/);
});

test('ligar e e-mail desligam quando o cliente nao os tem', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_2');   // sem e-mail e sem telefone
  const desligados = dom.document.querySelectorAll('.cli-rapida')
    .filter(b => b.classList.contains('off'));
  assert.equal(desligados.length, 2, 'os dois botoes sem alvo tinham de ficar desligados');
});

test('cada aba desenha sem estourar, e a de dados nao mostra undefined', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  ['visao', 'interacoes', 'atividades', 'observacoes', 'documentos', 'dados'].forEach(aba => {
    g.MD_CLI.S.aba = aba;
    g.MD_CLI_TELA.pintarDetalhe('crm_1', { manterAba: true });
    const corpo = dom.document.getElementById('cli-aba-corpo');
    assert.ok(corpo && corpo.filhos.length, 'aba vazia: ' + aba);
    assert.equal(corpo.textContent.includes('undefined'), false, 'undefined na aba ' + aba);
  });
  g.MD_CLI.S.aba = 'visao';
});

test('a linha do tempo vem do mais recente para o mais antigo', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.S.aba = 'interacoes';
  g.MD_CLI_TELA.pintarDetalhe('crm_1', { manterAba: true });
  const itens = dom.document.querySelectorAll('.cli-tempo-item');
  assert.equal(itens.length, 2);
  assert.match(itens[0].textContent, /01\/08\/2026/);
  assert.match(itens[1].textContent, /20\/07\/2026/);
  g.MD_CLI.S.aba = 'visao';
});

test('cliente sem nada abre a pagina em vez de dar erro', () => {
  /* O registro `crm_3` so tem id e nome. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_3');
  const v = dom.document.getElementById('cli-view');
  assert.match(v.textContent, /Sem nada/);
  assert.match(v.textContent, /Nenhum acompanhamento/);
  assert.equal(v.textContent.includes('undefined'), false);
});

test('id que nao existe cai na tela de erro, com caminho de volta', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_naoexiste');
  const texto = dom.document.getElementById('cli-view').textContent;
  assert.match(texto, /Cliente não encontrado/);
  assert.match(texto, /Voltar para clientes/);
});

test('o formulario abre com todos os campos e valida antes de gravar', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.abrirFormulario(null);
  const form = dom.document.querySelector('.cli-form');
  assert.ok(form, 'o formulario nao abriu');
  ['clientType', 'name', 'companyName', 'contactName', 'email', 'phone', 'cpf',
   'cnpj', 'segment', 'cep', 'address', 'city', 'uf', 'relationshipStatus',
   'origin', 'responsibleUserId', 'priority', 'nextContactAt', 'tags', 'description']
    .forEach(c => assert.ok(dom.document.getElementById('cli-c-' + c),
      'faltou o campo: ' + c));
});

test('gravar sem nome nao chama o banco', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.abrirFormulario(null);
  const botoes = dom.document.querySelectorAll('.m-confirm');
  botoes[botoes.length - 1].disparar('click');
  assert.equal(dom.feito.gravacoes.length, 0, 'gravou um cliente sem nome');
});

test('o filtro abre com as opcoes que existem na carteira', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.abrirFiltros();
  const painel = dom.document.querySelector('.cli-filtros');
  assert.ok(painel);
  assert.ok(dom.document.getElementById('cli-f-status'));
  assert.ok(dom.document.getElementById('cli-f-tag'));
  /* A lista de tags sai da carteira: filtrar por uma tag que ninguem usou nao
     devolveria nada. */
  assert.match(dom.document.getElementById('cli-f-tag').textContent, /VIP/);
});

test('o relatorio abre e nao fala de dinheiro nem de vaga', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.relatorioDeClientes();
  const texto = dom.document.querySelector('.cli-rel').textContent;
  assert.match(texto, /Crescimento da carteira/);
  assert.match(texto, /Por segmento/);
  assert.equal(/R\$|vaga|candidat/i.test(texto), false,
    'entrou dinheiro ou recrutamento no relatorio de clientes');
});

test('a paginacao corta a lista e o rodape diz o intervalo certo', () => {
  const muitos = Array.from({ length: 23 }, (_, i) => ({
    id: 'crm_p' + i, type: 'client', name: 'Cliente ' + i,
    createdAt: Date.UTC(2026, 6, 1) + i,
  }));
  const { g, dom } = ambiente(muitos, []);
  g.MD_CLI.S.porPagina = 10;
  g.MD_CLI.S.pagina = 1;
  g.MD_CLI_TELA.pintarLista();
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 10);
  assert.match(dom.document.querySelector('.cli-rodape-txt').textContent,
    /Mostrando 1 a 10 de 23 clientes/);
  g.MD_CLI.S.pagina = 3;
  g.MD_CLI_TELA.repintarTabela();
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 3);
  assert.match(dom.document.querySelector('.cli-rodape-txt').textContent,
    /Mostrando 21 a 23 de 23 clientes/);
});

test('interacao anotada com data antiga NAO vai para o topo', () => {
  /* O formulario de "registrar interacao" deixa escolher a data. Uma ligacao
     de mes passado anotada agora entra no fim do array com data antiga: pela
     ordem do array, ela apareceria como a ultima coisa que aconteceu. */
  const r = { id: 'crm_x', type: 'client', name: 'Ordem', createdAt: 1,
    interactions: [
      { id: 'a', tipo: 'nota', data: '2026-08-01', hora: '09:00', texto: 'recente' },
      { id: 'b', tipo: 'nota', data: '2026-05-10', hora: '09:00', texto: 'antiga, anotada depois' },
    ] };
  const { g, dom } = ambiente([r], []);
  g.MD_CLI.S.aba = 'interacoes';
  g.MD_CLI_TELA.pintarDetalhe('crm_x', { manterAba: true });
  const itens = dom.document.querySelectorAll('.cli-tempo-item');
  assert.match(itens[0].textContent, /recente/);
  assert.match(itens[1].textContent, /antiga/);
  g.MD_CLI.S.aba = 'visao';
});

test('sair do modelo nao redesenha a carteira nem cria container a toa', () => {
  /* Sair de um modelo em que nunca se entrou nao pode deixar um elemento
     vazio no painel dos outros dois — e fechar o detalhe nao pode repintar a
     lista um instante antes de a tela ser esvaziada. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.sair();
  assert.equal(dom.document.getElementById('cli-view'), null,
    'sair criou o container do modelo de clientes');

  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  g.MD_CLI_TELA.sair();
  const v = dom.document.getElementById('cli-view');
  assert.equal(v.filhos.length, 0, 'a tela nao foi esvaziada');
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 0,
    'a carteira foi redesenhada no caminho da saida');
});

test('entrar e sair pelo caminho real, sem ReferenceError', () => {
  /* Este e o teste que faltava. `_tela`, `_aberto`, `_ligado` e `_abrindo`
     estavam declarados em clientes.js e usados em clientes-tela.js: dois IIFE
     diferentes, e uma variavel de um NAO existe no outro. Nada acusava na
     leitura do codigo, nem ao desenhar as telas soltas — so ao ENTRAR no
     modelo, que e por onde a pessoa sempre passa. A tela abriria em branco. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 3,
    'entrar no modelo nao desenhou a carteira');
  assert.equal(g.MD_CLI.telaAtual(), 'lista');

  g.MD_CLI_TELA.abrirCliente('crm_1');
  assert.equal(g.MD_CLI.telaAtual(), 'detalhe');
  assert.equal(g.MD_CLI.clienteAberto(), 'crm_1');
  assert.ok(dom.document.querySelector('.cli-foco'));

  g.MD_CLI_TELA.fecharDetalhe();
  assert.equal(g.MD_CLI.telaAtual(), 'lista');
  assert.equal(g.MD_CLI.clienteAberto(), null);
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 3,
    'voltar nao devolveu a carteira');

  g.MD_CLI.sair();
  assert.equal(dom.document.getElementById('cli-view').filhos.length, 0);
});

test('entrar com a URL de um cliente abre aquele cliente, e nao a lista', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.location.hash = '#clientes/crm_1';
  g.MD_CLI.entrar();
  assert.equal(g.MD_CLI.telaAtual(), 'detalhe');
  assert.match(dom.document.querySelector('.cli-foco').textContent, /Acme/);
});

test('entrar com URL de cliente que nao existe cai no erro seguro', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.location.hash = '#clientes/crm_fantasma';
  g.MD_CLI.entrar();
  assert.match(dom.document.getElementById('cli-view').textContent,
    /Cliente não encontrado/);
});

test('atualizar repinta a tela que esta no ar, e so ela', () => {
  /* E o que faz uma mudanca em outra aba aparecer aqui sem trocar de tela. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  g.MD_CLI.atualizar();
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 3);
  g.MD_CLI_TELA.abrirCliente('crm_1');
  g.MD_CLI.atualizar();
  assert.ok(dom.document.querySelector('.cli-foco'), 'a pagina do cliente sumiu ao atualizar');
  assert.equal(dom.document.querySelectorAll('.cli-linha').length, 0,
    'a carteira voltou por baixo da pagina do cliente');
});

test('o caminho de volta para os outros dois modelos esta nas DUAS telas', () => {
  /* O botao "Alterar modelo" de sempre vive no heroi, e o heroi e parte do
     painel que este modelo substitui. Sem um botao proprio, quem entrasse em
     Clientes ficava sem saida para o Financeiro e para o Recrutamento — foi
     exatamente o que aconteceu. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  let ancora = null;
  g.crmAlterarModelo = a => { ancora = a; };

  g.MD_CLI.entrar();
  const naLista = dom.document.querySelector('.cli-btn-modelo');
  assert.ok(naLista, 'a carteira ficou sem o seletor de modelo');
  naLista.disparar('click', { currentTarget: naLista, stopPropagation() {} });
  assert.equal(ancora, naLista, 'o menu abriria ancorado no botao escondido do heroi');

  g.MD_CLI_TELA.abrirCliente('crm_1');
  assert.ok(dom.document.querySelector('.cli-btn-modelo'),
    'quem chega pela URL de um cliente ficou sem o seletor');
});

test('a aba de observacoes tem nota fixa e entradas datadas', () => {
  const r = { id: 'crm_o', type: 'client', name: 'Com observacoes', createdAt: 1,
    internalNotes: 'Nao gosta de reuniao antes das 10.',
    observations: [
      { id: 'o1', data: '2026-07-02', autor: 'victor', texto: 'Pediu revisao do escopo.' },
      { id: 'o2', data: '2026-08-01', autor: 'victor', texto: 'Fechou a renovacao.' },
    ] };
  const { g, dom } = ambiente([r], []);
  g.MD_CLI.S.aba = 'observacoes';
  g.MD_CLI_TELA.pintarDetalhe('crm_o', { manterAba: true });
  const corpo = dom.document.getElementById('cli-aba-corpo');
  /* O rotulo "Nota fixa" e desenhado junto com o icone, por innerHTML — o DOM
     de mentira daqui nao reflete isso em textContent, entao a conferencia e
     pelo elemento. */
  assert.ok(dom.document.querySelector('.cli-obs-fixa-rot'), 'sumiu o rotulo da nota fixa');
  assert.match(corpo.textContent, /Nao gosta de reuniao antes das 10/);
  const itens = dom.document.querySelectorAll('.cli-obs');
  assert.equal(itens.length, 2);
  /* Da mais recente para a mais antiga pela DATA escolhida, e nao pela ordem
     de digitacao: quem anota hoje uma conversa de semana passada poe a data
     daquele dia, e a entrada tem de cair no lugar dela. */
  assert.match(itens[0].textContent, /Fechou a renovacao/);
  assert.match(itens[1].textContent, /Pediu revisao do escopo/);
  g.MD_CLI.S.aba = 'visao';
});

test('cliente sem observacao mostra o convite, e a nota fixa em branco explica', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.S.aba = 'observacoes';
  g.MD_CLI_TELA.pintarDetalhe('crm_2', { manterAba: true });
  const corpo = dom.document.getElementById('cli-aba-corpo');
  assert.match(corpo.textContent, /Nenhuma observação escrita ainda/);
  assert.match(corpo.textContent, /antes de qualquer conversa/);
  assert.ok(dom.document.querySelector('.cli-obs-fixa.vazia'));
  g.MD_CLI.S.aba = 'visao';
});

test('o formulario deixa preencher tudo o que a aba de dados mostra', () => {
  /* Campo que se le e nao se escreve nao e um campo: e um lugar vazio
     permanente. Era o caso do ultimo contato e da satisfacao. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.abrirFormulario(null);
  ['lastContactAt', 'satisfaction'].forEach(c =>
    assert.ok(dom.document.getElementById('cli-c-' + c), 'faltou o campo: ' + c));
});

test('os indicadores do cliente ganham risco quando ha o que medir', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  assert.equal(dom.document.querySelectorAll('.cli-kpi-anel').length, 4);
  const comRisco = dom.document.querySelectorAll('.cli-spark')
    .filter(e => !e.classList.contains('cli-spark-vazio'));
  assert.ok(comRisco.length >= 1, 'nenhum risco desenhado num cliente com historico');
  /* Cliente sem nada nao ganha risco: linha reta no zero tambem e uma
     afirmacao, e falsa. Mas o ESPACO fica reservado, senao o cartao sem dado
     fica mais baixo que os outros e a fileira perde a linha de base. */
  g.MD_CLI_TELA.pintarDetalhe('crm_3');
  const vazios = dom.document.querySelectorAll('.cli-spark');
  assert.equal(vazios.length, 4);
  vazios.forEach(e => assert.ok(e.classList.contains('cli-spark-vazio')));
});

test('o acompanhamento mostra de quem e, com iniciais', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  const itens = dom.document.querySelectorAll('.cli-acomp-item');
  assert.equal(itens.length, 2);
  itens.forEach(i => {
    assert.ok(i.querySelector('.cli-acomp-ponto'), 'sumiu o ponto colorido');
    assert.ok(i.querySelector('.cli-acomp-av'), 'sumiu o circulo do responsavel');
  });
  /* Em ordem de data: o de julho, atrasado, antes do de agosto. */
  assert.match(itens[0].textContent, /Envio de proposta/);
  assert.match(itens[0].textContent, /atrasado/);
  assert.match(itens[1].textContent, /Reunião de alinhamento/);
});

test('abrir o painel com a carteira ainda vazia NAO diz "nao encontrado"', () => {
  /* `entrar` roda logo depois de loadRecords, que e assincrono: no arranque
     _records esta vazio. Procurar o cliente ali devolvia "nao encontrado"
     para um cliente que existe — era a tela de erro no lugar da carteira. */
  let carteira = [];
  const dom = criarDOM();
  const vm = require('node:vm');
  const g = ambienteCru(dom, () => carteira);
  g.location.hash = '#clientes/crm_1';
  g.MD_CLI.entrar();
  assert.equal(dom.document.getElementById('cli-view').textContent
    .includes('não encontrado'), false, 'acusou erro antes de os dados chegarem');

  // Os registros chegam: o cliente pedido abre sozinho.
  carteira = CLIENTES;
  g.MD_CLI.atualizar();
  assert.equal(g.MD_CLI.telaAtual(), 'detalhe');
  assert.equal(g.MD_CLI.clienteAberto(), 'crm_1');
});

test('com a carteira carregada, id que nao existe da erro de verdade', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.location.hash = '#clientes/crm_fantasma';
  g.MD_CLI.entrar();
  assert.match(dom.document.getElementById('cli-view').textContent,
    /Cliente não encontrado/);
});

test('sair do modelo limpa o endereco, senao a proxima entrada reabre o cliente', () => {
  /* Clicar em "Clientes" quer dizer "me mostre a carteira". Com
     `#clientes/xxx` para tras, a entrada seguinte caia direto naquele
     cliente. */
  const { g } = ambiente(CLIENTES, AGENDA);
  let substituido = null;
  g.history.replaceState = (a, b, url) => { substituido = url; g.location.hash = ''; };
  g.location.hash = '#clientes/crm_1';
  g.MD_CLI.sair();
  assert.equal(g.location.hash, '', 'o endereco do cliente ficou para tras');
  assert.ok(substituido !== null, 'usou pushState onde devia usar replaceState');
});

test('a malha e desenhada como caminhos horizontais, e nao colunas', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  const cena = dom.document.querySelector('.cli-onda-cena');
  assert.ok(cena, 'sumiu a cena');
  const marcacao = cena.innerHTML;
  /* Entre 14 e 30 caminhos: SVG leve, e nao centenas de paths. */
  const paths = (marcacao.match(/<path /g) || []).length;
  assert.ok(paths >= 14 && paths <= 30, 'caminhos: ' + paths);
  assert.equal((marcacao.match(/<g class="cli-camada/g) || []).length, 3);
  /* Cada caminho atravessa a cena da esquerda para a direita, comecando fora
     dela — curva Bezier, e nao barra vertical. */
  assert.match(marcacao, /d="M -120 /);
  assert.match(marcacao, / C 180 /);
  assert.equal(/cli-malha/.test(marcacao), false, 'as colunas voltaram');
});

test('da para excluir uma entrada da linha do tempo', () => {
  /* Faltava: dava para registrar uma tarefa, uma ligacao ou uma nota e nao
     dava para tirar — nem a que nasceu de um dedo errado. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.S.aba = 'interacoes';
  g.MD_CLI_TELA.pintarDetalhe('crm_1', { manterAba: true });
  const xis = dom.document.querySelectorAll('.cli-tempo-x');
  assert.equal(xis.length, 2, 'cada entrada precisa do seu');

  xis[0].disparar('click');
  const conf = dom.document.querySelector('.confirm-clear-ok');
  assert.ok(conf, 'excluir entrada nao perguntou nada');
  conf.disparar('click');
  const grav = dom.feito.gravacoes.find(x => x.mud && x.mud.interactions);
  assert.ok(grav, 'nao gravou a remocao');
  assert.equal(grav.mud.interactions.length, 1);
  g.MD_CLI.S.aba = 'visao';
});

test('a linha do acompanhamento tem a forma do desenho', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI_TELA.pintarDetalhe('crm_1');
  const item = dom.document.querySelector('.cli-acomp-item');
  assert.ok(item.querySelector('.cli-acomp-dia'), 'sumiu o dia');
  assert.ok(item.querySelector('.cli-acomp-mes'), 'sumiu o mes');
  assert.ok(item.querySelector('.cli-acomp-hora'), 'sumiu a hora');
  assert.ok(item.querySelector('.cli-acomp-ponto'), 'sumiu o ponto');
  assert.ok(item.querySelector('.cli-acomp-av'), 'sumiu o responsavel');
});

/* ═══════════════════════════════════════════════════════════════════════
   REFINO DA TELA GERAL
   ═══════════════════════════════════════════════════════════════════════ */
test('cabecalho e indicadores vivem na MESMA faixa', () => {
  /* Soltos sobre o preto, o olho lia tres regioes onde ha uma: a
     apresentacao da carteira. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  const faixa = dom.document.querySelector('.cli-faixa');
  assert.ok(faixa, 'sumiu a faixa do topo');
  assert.ok(faixa.querySelector('.cli-cab'), 'o cabecalho ficou fora da faixa');
  assert.ok(faixa.querySelector('.cli-kpis'), 'os indicadores ficaram fora da faixa');
});

test('o painel da tabela tem contador e os tres controles', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  const cab = dom.document.querySelector('.cli-painel-cab');
  assert.match(cab.textContent, /Clientes/);
  /* Os rotulos dos tres primeiros sao desenhados junto com o icone, por
     innerHTML — o DOM de mentira daqui nao reflete isso em textContent,
     entao a conferencia e por quantidade e pelo que da para ler. */
  assert.equal(dom.document.querySelectorAll('.cli-painel-acoes .cli-btn').length, 4);
  assert.match(cab.textContent, /Ordenar/);
  const rotulos = dom.document.querySelectorAll('.cli-painel-acoes .cli-btn')
    .map(b => b.innerHTML || b.textContent).join(' ');
  ['Colunas', 'Exportar', 'Visualização'].forEach(x =>
    assert.ok(rotulos.includes(x), 'faltou o botao: ' + x));
  // O total ao lado do titulo, e nao so no rodape.
  assert.equal(dom.document.querySelector('.cli-conta').textContent, '3');
});

test('esconder uma coluna tira o cabecalho E a celula, na mesma ordem', () => {
  /* Se so a celula sair, o dado cai embaixo do rotulo errado. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  const antes = dom.document.querySelectorAll('.cli-tabela th').length;
  const cel = dom.document.querySelectorAll('.cli-linha')[0].filhos.length;
  g.MD_CLI.S.colunas = g.MD_CLI.S.colunas.filter(c => c !== 'tags');
  g.MD_CLI_TELA.repintarTabela();
  assert.equal(dom.document.querySelectorAll('.cli-tabela th').length, antes - 1);
  assert.equal(dom.document.querySelectorAll('.cli-linha')[0].filhos.length, cel - 1);
  const th = dom.document.querySelectorAll('.cli-tabela th').map(x => x.textContent);
  assert.equal(th.includes('Tags'), false);
  g.MD_CLI.S.colunas = ['segmento', 'status', 'ultimo', 'proximo', 'tags', 'responsavel'];
});

test('a taxa de retorno sem dados NAO desenha barra cheia', () => {
  /* Barra cheia debaixo do texto "sem dados" sao duas coisas contrarias no
     mesmo lugar — e o olho acredita na barra. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  const trilho = dom.document.querySelector('.cli-taxa');
  assert.ok(trilho, 'sumiu a barra da taxa');
  assert.ok(trilho.classList.contains('vazia'));
  assert.equal(trilho.filhos[0].getAttribute('style'), 'width:0%');
  assert.match(dom.document.querySelector('.cli-taxa-nota').textContent,
    /Sem dados suficientes/);
  /* E a barra de status ganhou rotulo proprio: sem ele, ela empresta o
     sentido da linha de cima. */
  assert.match(dom.document.querySelector('.cli-dist-rot').textContent,
    /Distribuição por status/);
});

test('proximas acoes e uma timeline, com tipo e rodape', () => {
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  const acoes = dom.document.querySelectorAll('.cli-acao');
  assert.ok(acoes.length >= 1);
  acoes.forEach(a => {
    assert.ok(a.querySelector('.cli-acao-ponto'), 'acao sem ponto');
    assert.ok(a.querySelector('.cli-acao-tipo'), 'acao sem tipo');
    assert.ok(/atrasada|hoje|futura/.test(a.className), 'acao sem estado: ' + a.className);
  });
  assert.match(dom.document.querySelector('.cli-lado .cli-btn-largo').textContent,
    /Ver todas as ações|Ver relatório completo/);
});

test('sem nenhuma acao, o cartao oferece criar uma', () => {
  /* Um cartao grande e vazio nao diz o que fazer em seguida. */
  const { g, dom } = ambiente(CLIENTES, []);
  const semData = CLIENTES.map(c => Object.assign({}, c, { nextContactAt: '' }));
  const { g: g2, dom: d2 } = ambiente(semData, []);
  g2.MD_CLI.entrar();
  const texto = d2.document.querySelector('.cli-lado').textContent;
  assert.match(texto, /Nenhuma ação programada/);
  assert.match(texto, /Criar acompanhamento/);
});

test('exportar leva o que esta na tela, e sem dado financeiro', () => {
  /* Exportar a carteira inteira quando a pessoa filtrou entregaria um arquivo
     que nao e o que ela estava olhando. */
  const fn = (() => {
    const src = TELA_SRC;
    const i = src.indexOf('  function exportarClientes(');
    return src.slice(i, src.indexOf('\n  }', i));
  })();
  assert.match(fn, /const lista = M\(\)\.visiveis\(\)/);
  assert.equal(/fmtBRL|value|dueDate|paidAmount/.test(fn), false,
    'entrou dinheiro na exportacao');
  assert.match(fn, /text\/csv;charset=utf-8/);
  assert.match(fn, /URL\.revokeObjectURL/, 'a URL do arquivo ficou pendurada');
});

test('a caixinha e desenhada por nos, e a selecao leva a algo', () => {
  /* A nativa com `accent-color` sai como um quadrado branco no tema escuro: o
     navegador so troca a cor do preenchido, e a moldura continua a do
     sistema. E uma caixinha que marca sem oferecer nada e o mesmo defeito do
     botao que nao clica. */
  const CSS_ = require('node:fs').readFileSync(
    require('node:path').join(RAIZ, 'docs/css/main.css'), 'utf8');
  assert.match(CSS_, /\.cli-chk\{appearance:none/);
  assert.match(CSS_, /\.cli-chk:checked::after\{content:''/);

  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g.MD_CLI.entrar();
  assert.equal(dom.document.querySelector('.cli-selecao'), null,
    'a barra apareceu sem nada marcado');

  const chk = dom.document.querySelectorAll('.cli-linha .cli-chk')[0];
  chk.checked = true;
  chk.disparar('change');
  const barra = dom.document.querySelector('.cli-selecao');
  assert.ok(barra, 'marcar um cliente nao ofereceu nada');
  assert.match(barra.textContent, /1 selecionados/);
  assert.ok(dom.document.querySelector('.cli-linha.selecionada'));
  g.MD_CLI.S.selecionados = [];
});

test('a caixinha do cabecalho marca a PAGINA, e nao a carteira', () => {
  /* Marcar trezentos clientes que nao estao a vista, com um clique, e o tipo
     de coisa que so se descobre depois de apertar Excluir. */
  const muitos = Array.from({ length: 23 }, (_, i) => ({
    id: 'crm_m' + i, type: 'client', name: 'C' + i, createdAt: 1 + i,
  }));
  const { g, dom } = ambiente(muitos, []);
  g.MD_CLI.S.porPagina = 10;
  g.MD_CLI.S.pagina = 1;
  g.MD_CLI.entrar();
  const chkTodos = dom.document.querySelectorAll('th .cli-chk')[0];
  chkTodos.checked = true;
  chkTodos.disparar('change');
  assert.equal(g.MD_CLI.S.selecionados.length, 10, 'marcou fora da pagina');
});

test('"+ Novo cliente" pergunta antes: preencher ou pedir para preencherem', () => {
  /* O construtor de formularios ja sabia transformar resposta em cliente. O
     que faltava era alguem dizer isso a quem esta na carteira: o botao so
     oferecia digitar, e quem nao conhecia o construtor por outro caminho
     nunca descobria que dava para nao digitar nada. */
  const fn = (() => {
    const i = TELA_SRC.indexOf('  function novoCliente(');
    return TELA_SRC.slice(i, TELA_SRC.indexOf('\n  }', i));
  })();
  assert.match(fn, /_escolherCaminho\(/);
  assert.match(fn, /cli\.fillNow/);
  assert.match(fn, /cli\.askToFill/);
  assert.match(fn, /if \(escolha === 'agora'\) abrirFormulario\(null\)/);
  assert.match(fn, /abrirFormularioDeCadastro\(\)/);
  /* Sem o construtor por perto, uma pergunta de dois caminhos com um caminho
     so seria um clique a mais para chegar ao mesmo lugar. */
  assert.match(fn, /typeof abrirConstrutorFormulario !== 'function'/);
});

test('editar um cliente que existe NAO pergunta nada', () => {
  /* Ali nao ha dois caminhos. */
  const { g, dom } = ambiente(CLIENTES, AGENDA);
  g._escolherCaminho = () => { throw new Error('perguntou ao editar'); };
  g.MD_CLI_TELA.abrirFormulario(CLIENTES[0]);
  assert.ok(dom.document.querySelector('.cli-form'));
});

test('a carteira vazia mostra os DOIS caminhos', () => {
  /* E onde o segundo mais serve: quem esta comecando acharia que so existe
     digitar um por um. */
  const { g, dom } = ambiente([], []);
  g.MD_CLI.entrar();
  const texto = dom.document.querySelector('.cli-vazio-box').textContent;
  assert.match(texto, /Adicionar primeiro cliente/);
  assert.match(texto, /Pedir para o cliente preencher/);
});

test('a aba Processos existe SO na ficha juridica', () => {
  /* Numa ficha de nutricionista ela seria uma aba permanentemente vazia — e
     aba vazia ensina a ignorar as outras. */
  const juridico = { id: 'crm_j', type: 'client', name: 'Escritório', createdAt: 1,
    template: 'advocacia', campos: { processo: '0801234-55.2026', vara: '2ª Vara Cível' } };
  const clinico = { id: 'crm_c', type: 'client', name: 'Paciente', createdAt: 2,
    template: 'psicologia' };
  const { g, dom } = ambiente([juridico, clinico], []);

  g.MD_CLI_TELA.pintarDetalhe('crm_j');
  let abas = dom.document.querySelectorAll('.cli-aba').map(a => a.textContent);
  assert.ok(abas.includes('Processos'), 'a ficha juridica ficou sem a aba');

  g.MD_CLI_TELA.pintarDetalhe('crm_c');
  abas = dom.document.querySelectorAll('.cli-aba').map(a => a.textContent);
  assert.equal(abas.includes('Processos'), false, 'a aba vazou para outra ficha');
});

test('trocar para um cliente sem Processos nao deixa a tela em branco', () => {
  /* Quem estava em Processos e abre um nutricionista tem de cair na visao
     geral. */
  const juridico = { id: 'crm_j', type: 'client', name: 'E', createdAt: 1, template: 'advocacia' };
  const clinico = { id: 'crm_c', type: 'client', name: 'P', createdAt: 2, template: 'psicologia' };
  const { g, dom } = ambiente([juridico, clinico], []);
  g.MD_CLI.S.aba = 'processos';
  g.MD_CLI_TELA.pintarDetalhe('crm_c', { manterAba: true });
  assert.equal(g.MD_CLI.S.aba, 'visao');
  assert.ok(dom.document.getElementById('cli-aba-corpo').filhos.length);
});

test('o processo pode nascer do que veio no formulario', () => {
  /* O formulario ja perguntou numero, vara e parte: obrigar a redigitar o que
     a pessoa acabou de mandar e trabalho inventado. */
  const r = { id: 'crm_j', type: 'client', name: 'E', createdAt: 1, template: 'advocacia',
    campos: { processo: '0801234-55.2026', vara: '2ª Vara Cível', parte: 'Fulano' } };
  const { g, dom } = ambiente([r], []);
  g.MD_CLI.S.aba = 'processos';
  g.MD_CLI_TELA.pintarDetalhe('crm_j', { manterAba: true });
  const corpo = dom.document.getElementById('cli-aba-corpo');
  assert.match(corpo.textContent, /Nenhum processo cadastrado/);
  assert.match(corpo.textContent, /Criar a partir do que veio no formulário/);
  g.MD_CLI.S.aba = 'visao';
});

test('o processo desenha, e o prazo vencido se marca', () => {
  const r = { id: 'crm_j', type: 'client', name: 'E', createdAt: 1, template: 'advocacia',
    processos: [
      { id: 'p1', numero: '0801234-55.2026', area: 'Cível', vara: '2ª Vara',
        parte: 'Fulano', fase: 'instrucao', prazo: '2026-07-01', audiencia: '2026-09-10',
        valor: 15000, honorarios: 3000, notas: 'Aguardando perícia.' },
    ] };
  const { g, dom } = ambiente([r], []);
  g.MD_CLI.S.aba = 'processos';
  g.MD_CLI_TELA.pintarDetalhe('crm_j', { manterAba: true });
  const proc = dom.document.querySelector('.cli-proc');
  assert.ok(proc, 'o processo nao foi desenhado');
  assert.ok(proc.classList.contains('atrasado'), 'prazo vencido nao foi marcado');
  assert.match(proc.textContent, /0801234-55\.2026/);
  assert.match(proc.textContent, /Instrução/);
  assert.match(proc.textContent, /Aguardando perícia/);
  g.MD_CLI.S.aba = 'visao';
});
