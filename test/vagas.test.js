'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A VAGA VIROU REGISTRO, E O DADO ANTIGO CONTINUA DE PÉ
   ═══════════════════════════════════════════════════════════════════════
   Até aqui "vaga" era `campos.vaga`: texto livre digitado por quem preenchia
   o formulário. A vaga só existia se alguém a tivesse escrito, "Front-end" e
   "Frontend" viravam duas vagas, e não havia onde guardar prazo, requisitos,
   status ou quantas posições existem.

   Agora a vaga é um registro, guardado no MESMO nó das notas, com id de
   prefixo `crm_` — de propósito: reaproveita as regras que já existem, entra
   pelo ouvinte que já está no ar e não cria nó novo (nó novo sob `users/$key`
   exigiria regra própria, a armadilha nº 1 deste projeto).

   Duas invariantes que esta varredura protege:

   1. **Vaga nunca é cliente.** Ela entra pela mesma faixa de chaves; se
      vazasse para `_records`, apareceria na carteira e nos totais de dinheiro.
   2. **Nada de migração.** Candidato antigo, com o texto solto, continua
      filtrável e continua aparecendo no relatório. Chave é o id quando existe
      e o texto quando não existe.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const RH = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
const I18N = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

/* As funções puras do app.js, rodando de verdade. */
function montar({ vagas = [], records = [] } = {}) {
  const ctx = vm.createContext({ _vagas: vagas, _records: records, window: {} });
  vm.runInContext([
    recortar(APP, 'const VAGA_STATUS'),
    recortar(APP, 'function _ehVaga('),
    recortar(APP, 'function _vagaOpcao('),
    recortar(APP, 'function _vagaNormalizar('),
    recortar(APP, 'function _vagaPorId('),
    recortar(APP, 'function _vagasAbertas('),
    recortar(APP, 'function chaveVagaDe('),
    recortar(APP, 'function rotuloVagaDe('),
    recortar(APP, 'function vagasDoFunil('),
  ].join('\n'), ctx);
  return ctx;
}

const vaga = (id, extra = {}) => Object.assign(
  { id, type: 'vaga', titulo: 'Vaga ' + id, status: 'aberta' }, extra);
const cand = (id, campos) => ({ id, type: 'client', template: 'rh', campos });

test('vaga NUNCA entra na carteira de clientes', () => {
  /* Ela usa a mesma faixa de chaves que o ouvinte assina. Se _crmEhRegistro
     a aceitasse, ela viraria uma linha na tabela de clientes e entraria nos
     totais de dinheiro do painel. */
  const corpo = recortar(APP, 'function _crmEhRegistro(');
  assert.match(corpo, /_ehVaga\(r\)/, 'o filtro de registro não conhece vaga');

  const ctx = montar();
  assert.equal(ctx._ehVaga({ type: 'vaga' }), true);
  assert.equal(ctx._ehVaga({ type: 'client' }), false);
  assert.equal(ctx._ehVaga(null), false);
});

test('a chave prefere o id, e cai no texto antigo quando não há', () => {
  const ctx = montar({ vagas: [vaga('crm_vaga_1', { titulo: 'Front-end' })] });

  assert.equal(ctx.chaveVagaDe(cand('a', { vagaId: 'crm_vaga_1' })), 'crm_vaga_1');
  assert.equal(ctx.rotuloVagaDe(cand('a', { vagaId: 'crm_vaga_1' })), 'Front-end');

  // Candidato de antes: sem id, com o texto solto.
  assert.equal(ctx.chaveVagaDe(cand('b', { vaga: 'Designer' })), 'Designer');
  assert.equal(ctx.rotuloVagaDe(cand('b', { vaga: 'Designer' })), 'Designer');
});

test('id que aponta para vaga inexistente cai no texto, e não some do funil', () => {
  /* Vaga apagada, ou candidato trazido de outro quadro. Devolver o id cru
     deixaria o candidato num grupo com nome de chave interna; devolver vazio
     o tiraria do relatório. O texto antigo é a melhor resposta que existe. */
  const ctx = montar({ vagas: [] });
  const r = cand('c', { vagaId: 'crm_vaga_sumiu', vaga: 'Analista' });
  assert.equal(ctx.chaveVagaDe(r), 'Analista');
  assert.equal(ctx.rotuloVagaDe(r), 'Analista');
});

test('renomear a vaga renomeia todos os candidatos dela de uma vez', () => {
  /* É o ganho de a vaga ter id: o rótulo passa a sair de um lugar só. */
  const v = vaga('crm_vaga_1', { titulo: 'Front-end' });
  const ctx = montar({ vagas: [v] });
  const r = cand('a', { vagaId: 'crm_vaga_1' });

  assert.equal(ctx.rotuloVagaDe(r), 'Front-end');
  v.titulo = 'Desenvolvedora Front-end';
  assert.equal(ctx.rotuloVagaDe(r), 'Desenvolvedora Front-end');
  assert.equal(ctx.chaveVagaDe(r), 'crm_vaga_1', 'a chave não pode mudar junto');
});

test('o funil lista as vagas cadastradas E os rótulos antigos', () => {
  /* Sem a segunda metade, quem tem candidato de antes perderia o filtro que
     já usava no dia em que a primeira vaga fosse cadastrada. */
  const ctx = montar({
    vagas: [vaga('crm_vaga_1', { titulo: 'Front-end' })],
    records: [
      cand('a', { vagaId: 'crm_vaga_1' }),
      cand('b', { vaga: 'Designer' }),
      cand('c', { vaga: 'Designer' }),
    ],
  });

  const lista = [...ctx.vagasDoFunil()];
  assert.deepEqual(lista.map(v => v.rotulo), ['Designer', 'Front-end']);
  assert.equal(lista.find(v => v.rotulo === 'Designer').legado, true);
  assert.equal(lista.find(v => v.rotulo === 'Front-end').legado, undefined);
  assert.equal(lista.filter(v => v.rotulo === 'Designer').length, 1,
    'dois candidatos da mesma vaga antiga viraram duas entradas');
});

test('duas vagas de mesmo nome continuam separadas', () => {
  /* Era impossível antes: o nome era a identidade. */
  const ctx = montar({
    vagas: [vaga('crm_vaga_1', { titulo: 'Analista' }),
            vaga('crm_vaga_2', { titulo: 'Analista' })],
    records: [cand('a', { vagaId: 'crm_vaga_1' }), cand('b', { vagaId: 'crm_vaga_2' })],
  });
  assert.equal(new Set(ctx.vagasDoFunil().map(v => v.chave)).size, 2);
});

test('normalizar recusa opção inventada e conserta faixa salarial invertida', () => {
  const ctx = montar();

  const n = ctx._vagaNormalizar({
    titulo: '  Front-end  ', modalidade: 'teletransporte', contrato: 'CLT',
    prioridade: 'urgentíssima', status: 'aberta', salarioMin: 9000, salarioMax: 5000,
    posicoes: 0, uf: 'são paulo',
  });

  assert.equal(n.titulo, 'Front-end');
  assert.equal(n.modalidade, 'presencial', 'opção fora da lista tem de cair no padrão');
  assert.equal(n.contrato, 'clt', 'maiúscula não pode virar valor inválido');
  assert.equal(n.prioridade, 'normal');
  assert.equal(n.salarioMin, 5000, 'mínimo acima do máximo é erro de digitação');
  assert.equal(n.salarioMax, 9000);
  assert.equal(n.posicoes, 1, 'zero posição não é vaga');
  assert.equal(n.uf, 'SÃ', 'UF entra com dois caracteres, em maiúscula');
});

test('vaga aberta e pausada recebem candidatura; encerrada não', () => {
  const ctx = montar({ vagas: [
    vaga('1', { status: 'aberta' }), vaga('2', { status: 'pausada' }),
    vaga('3', { status: 'encerrada' }), vaga('4', { status: 'rascunho' }),
    vaga('5', { status: 'cancelada' }),
  ] });
  assert.deepEqual([...ctx._vagasAbertas()].map(v => v.id), ['1', '2']);
});

/* ANTES ela se RECUSAVA a apagar vaga com candidato, mandando encerrar. A
   intenção era proteger o histórico; o efeito foi prender a duplicata para
   sempre — e duas vagas de mesmo nome quebram o resto: a lista da triagem
   funde as duas num item só e o avanço automático não sabe de qual delas é a
   regra. Agora ela apaga, e o histórico fica de pé por outro caminho: a vaga
   deixa o próprio nome escrito em quem estava ligado a ela, no formato antigo
   (`campos.vaga`, texto), que funil, filtro e relatório já leem. */
test('excluir vaga apaga mesmo, e deixa o nome escrito em quem ficou', () => {
  const corpo = recortar(APP, 'async function excluirVaga(');
  assert.match(corpo, /campos\.vagaId/, 'precisa desligar o vínculo antes de sumir');
  assert.match(corpo, /delete campos\.vagaId/);
  assert.match(corpo, /campos\.vaga = titulo/,
    'sem o nome como texto o candidato fica sem origem na tela');
  assert.match(corpo, /_crmRemove/, 'a vaga tem de ser removida de fato');
  assert.equal(/total > 0[\s\S]{0,200}return false/.test(corpo), false,
    'excluir não pode mais recusar por ter candidato');
  assert.equal(/_records\s*=\s*_records\.filter/.test(corpo), false,
    'excluir vaga não pode APAGAR candidato');

  // E a pergunta na tela conta o que vai acontecer com quem está na vaga.
  const pergunta = recortar(APP, 'async function _vgExcluir(');
  assert.match(pergunta, /app\.deleteVacancyAskCandidates/);
  assert.match(pergunta, /_vagaContagem/);
});

test('a vaga nasce na faixa de chaves que o ouvinte já assina', () => {
  /* Fora da faixa `crm_`, ela só apareceria depois de recarregar a página —
     e criar nó novo exigiria regra própria no banco. */
  const corpo = recortar(APP, 'async function criarVaga(');
  assert.match(corpo, /id: 'crm_vaga_'/);
  assert.match(corpo, /type: 'vaga'/);
  assert.match(corpo, /_crmCanCreate\(\)/, 'vaga tem de respeitar o limite do plano');
});

test('a triagem por IA continua existindo, e agora conhece a vaga', () => {
  /* Requisito explícito: nenhuma funcionalidade some. A análise de currículo
     continua lá — e ganhou os requisitos da vaga como sugestão, em vez de
     ler o currículo no vácuo. */
  assert.ok(RH.includes('function abrirTriagem('), 'a triagem por IA sumiu');
  const corpo = recortar(RH, 'function abrirTriagem(', '\n  }');
  assert.match(corpo, /reqSugeridos/, 'a triagem não aproveita os requisitos da vaga');
  assert.match(corpo, /vagaSugerida/);
  assert.match(corpo, /rh-ia-req/, 'o campo de requisitos sumiu do modal');
});

test('o filtro do funil compara por chave, e o menu mostra o rótulo', () => {
  const filtro = recortar(RH, 'function visiveis(', '\n  }');
  assert.match(filtro, /chaveVagaDe\(r\) === _vaga/,
    'filtrar por rótulo funde vagas homônimas');
  assert.match(APP, /label: '💼 ' \+ v\.rotulo/, 'o menu voltaria a mostrar a chave crua');
  assert.match(APP, /MD_RH\.filtroVaga\(v\.chave\)/);
});

test('as mensagens novas existem nos três idiomas', () => {
  ['app.vacancyNeedsTitle', 'app.saveVacancyError', 'app.vacancyHasCandidates']
    .forEach(k => assert.ok(I18N.includes(`'${k}'`), 'falta ' + k));
});

/* ── A tela ────────────────────────────────────────────────────────────── */

const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const HANDLERS = fs.readFileSync(path.join(RAIZ, 'docs/js/handlers-app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');

test('o botao Vagas existe, e so no modo recrutamento', () => {
  assert.match(HTML, /id="crm-btn-vagas"/, 'o botao sumiu da barra');
  assert.match(HTML, /id="crm-btn-vagas"[^>]*style="display:none"/,
    'ele nasce escondido — no painel financeiro nao faz sentido');
  assert.match(APP, /'crm-btn-vagas', 'crm-btn-form-vaga'/,
    'ele nao entra na lista que aparece so no recrutamento');
});

test('o clique passa por data-h, e nao por on*= (a CSP recusaria)', () => {
  const acao = /data-h="(a\d+)"[^>]*>[\s\S]{0,40}?Vagas</.exec(HTML)
    || /id="crm-btn-vagas" data-h="(a\d+)"/.exec(HTML);
  assert.ok(acao, 'o botao de vagas nao declara data-h');
  assert.match(HANDLERS, new RegExp("\['" + acao[1] + "'[\s\S]{0,80}abrirPainelVagas"),
    'o handler do botao nao chama abrirPainelVagas');
  assert.equal(/id="crm-btn-vagas"[^>]*onclick=/.test(HTML), false);
});

test('o painel fecha por composedPath, e nao por contains', () => {
  /* A lista se redesenha a cada gravacao. Com `contains`, o alvo do clique
     ja pode ter saido do DOM quando o evento chega, e o painel se fecharia
     sozinho — armadilha n 2 deste projeto. */
  const corpo = recortar(APP, 'function abrirPainelVagas(');
  assert.match(corpo, /composedPath/, 'o fechador voltou a depender de contains');
});

test('salvar nao pode disparar duas vezes', () => {
  const corpo = recortar(APP, 'async function _vgSalvar(');
  assert.match(corpo, /btn\.disabled/, 'sem trava, o clique duplo cria duas vagas');
  assert.match(corpo, /atualizarVaga|criarVaga/);
});

test('excluir pergunta antes, e diz que o candidato nao some', () => {
  const corpo = recortar(APP, 'async function _vgExcluir(');
  assert.match(corpo, /confirmarAcao\(/, 'exclusao sem confirmacao');
  assert.match(corpo, /app\.deleteVacancyAsk/);
  const texto = /'app\.deleteVacancyAsk':\s*\[\s*'([^']+)'/.exec(I18N);
  assert.ok(texto && /candidatos n[aã]o s[aã]o apagados/i.test(texto[1]),
    'o aviso precisa dizer que os candidatos ficam');
});

test('vaga que oculta salario nao mostra numero nem na tela interna', () => {
  const ctx = montar();
  vm.runInContext(recortar(APP, 'function _vagaFaixa('), ctx);
  ctx._appText = (k, f) => f;
  ctx.fmtBRL = n => 'R$ ' + n;
  assert.match(ctx._vagaFaixa({ ocultarSalario: true, salarioMin: 5000, salarioMax: 9000 }),
    /n[aã]o divulgado/i, 'o habito de mostrar aqui vaza depois para a pagina publica');
  assert.equal(ctx._vagaFaixa({ salarioMin: 5000, salarioMax: 9000 }), 'R$ 5000 – R$ 9000');
  assert.equal(ctx._vagaFaixa({ salarioMin: 0, salarioMax: 0 }), '—');
});

test('o prazo diz quantos dias faltam, e avisa quando venceu', () => {
  const ctx = montar();
  vm.runInContext(recortar(APP, 'function _vagaDiasParaPrazo('), ctx);
  /* Data LOCAL: toISOString devolve UTC, e das 21h a meia-noite no Brasil
     ele ja esta no dia seguinte — o teste quebrava sozinho a noite. */
  const dia = n => {
    const d = new Date(Date.now() + n * 86400000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  };

  assert.equal(ctx._vagaDiasParaPrazo({ prazo: dia(5) }), 5);
  assert.ok(ctx._vagaDiasParaPrazo({ prazo: dia(-3) }) < 0, 'prazo vencido tem de dar negativo');
  assert.equal(ctx._vagaDiasParaPrazo({}), null, 'vaga sem prazo nao inventa um');
  assert.equal(ctx._vagaDiasParaPrazo({ prazo: 'qualquer coisa' }), null);
});

test('o painel e responsivo e a lista rola sem esticar a tela', () => {
  assert.match(CSS, /\.vg-corpo\{[^}]*grid-template-columns:300px 1fr/);
  assert.match(CSS, /@media\(max-width:820px\)\{[\s\S]{0,220}\.vg-corpo\{grid-template-columns:1fr/,
    'em tela estreita as duas colunas precisam virar uma');
  assert.match(CSS, /\.vg-lista\{[^}]*overflow-y:auto/);
  assert.match(CSS, /\.vg-form\{[^}]*overflow-y:auto/);
  assert.match(CSS, /\.vg-lista\{[^}]*min-height:0/,
    'sem min-height:0 o filho de grid nao encolhe e o modal estoura');
});

test('a tela nao inventa texto: tudo passa pelo catalogo', () => {
  ['app.vacancies', 'app.newVacancy', 'app.editVacancy', 'app.createVacancy',
   'app.noVacanciesYet', 'app.vacancyName', 'app.positions', 'app.requirements',
   'app.hideSalary', 'app.salaryHidden', 'app.deadlinePassed', 'app.daysLeft',
   'app.vacancySaved', 'app.deleteVacancy']
    .forEach(k => assert.ok(I18N.includes(`'${k}':`), 'falta ' + k + ' no catalogo'));
});

/* ── Painel de recrutamento: cartao e acao de partida ──────────────────── */

test('o cartao "Vagas abertas" existe e so aparece no recrutamento', () => {
  assert.match(HTML, /id="crm-kpi-vagas"/, 'o quinto cartao sumiu');
  assert.match(HTML, /id="crm-kpi-vagas" style="display:none"/,
    'ele nasce escondido — no financeiro nao tem sentido');
  assert.match(APP, /'crm-kpi-vagas', 'crm-btn-nova-vaga'/,
    'o cartao e o botao nao entram na lista do que e exclusivo do recrutamento');

  const painel = recortar(APP, 'function updateCRMDashboard(');
  assert.ok(painel.includes('const abertas = _vagasAbertas().length;'),
    'o numero do cartao nao sai das vagas de verdade');
  assert.ok(painel.includes("_crmAnimNum('crm-total-vagas', abertas"),
    'o cartao nao recebe o numero calculado');
  assert.match(painel, /app\.openVacancies/,
    'o rotulo precisa ser reposto, como os outros quatro');
});

test('"Nova vaga" e a acao de partida, e abre o painel de vagas', () => {
  assert.match(HTML, /id="crm-btn-nova-vaga"[^>]*data-h="a49"/);
  assert.match(HANDLERS, /\['a49'[\s\S]{0,60}abrirPainelVagas/,
    'o botao do heroi nao abre o painel');
  assert.match(HTML, /id="crm-btn-nova-vaga"[^>]*style="display:none"/);
});

test('a serie do minigrafico conta por data de ABERTURA, e ignora sem data', () => {
  /* Uma vaga cadastrada hoje com abertura em maio pertence a maio. E vaga sem
     data nao entra em mes nenhum: inventar uma faria o grafico contar o que
     ninguem informou. */
  const hoje = new Date();
  const mesAtras = n => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - n, 15);
    return d.toISOString().slice(0, 10);
  };
  const ctx = montar({ vagas: [
    vaga('1', { abertaEm: mesAtras(3) }),
    vaga('2', { abertaEm: mesAtras(1) }),
    vaga('3', {}),                       // sem data: nunca conta
    vaga('4', { abertaEm: 'sei la' }),   // data invalida: idem
  ] });
  vm.runInContext(recortar(APP, 'function _serieVagasAbertas('), ctx);

  const serie = [...ctx._serieVagasAbertas(5)];
  assert.equal(serie.length, 5);
  assert.equal(serie[serie.length - 1], 2, 'no mes atual as duas com data ja abriram');
  assert.equal(serie[0], 0, 'ha 5 meses nenhuma existia');
  assert.ok(serie.every(n => n <= 2), 'vaga sem data nao pode entrar na contagem');

  /* A serie e acumulada: uma vaga aberta nao "fecha" sozinha no mes seguinte. */
  for (let i = 1; i < serie.length; i++) {
    assert.ok(serie[i] >= serie[i - 1], 'a serie acumulada nao pode cair');
  }
});

test('salvar notas NAO pode apagar as vagas do banco', () => {
  /* Bug real, visto na tela: a vaga criada sumia sozinha.
     saveNotesRaw grava com fbSet, que troca o NO INTEIRO — tudo que nao
     estiver no objeto montado deixa de existir. Ele montava o objeto a
     partir de `notes` + `_records`; as vagas moram no mesmo no e ficavam de
     fora, entao arrastar uma nota apagava todas as vagas cadastradas, sem
     erro nenhum na tela.

     Os clientes ja eram protegidos assim. A protecao tem de valer para tudo
     que compartilha o no. */
  const helper = recortar(APP, 'function _preservarRegistrosDoQuadro(');
  assert.match(helper, /_records/, 'a protecao dos clientes sumiu');
  assert.match(helper, /_vagas/, 'a preservacao voltou a apagar as vagas');

  /* SAO QUATRO GRAVADORES, e todos precisam passar por aqui. Enquanto cada um
     montava o objeto por conta propria, a lista divergiu: `saveNotes` lembrava
     das cinco colecoes, `_savePersonalNotesNow` e a troca de workspace pessoal
     so dos clientes. O sintoma foi entrar num workspace 1:1 e voltar sem
     nenhuma vaga no workspace pessoal nomeado — e nada no console. */
  const chamadas = APP.match(/(?<!function )_preservarRegistrosDoQuadro\(obj\)/g) || [];
  assert.equal(chamadas.length, 4,
    'algum gravador do no das notas voltou a montar o objeto sozinho');

  /* Prova de comportamento: roda a funcao de verdade e confere que a vaga
     sobrevive a um save que so conhece as notas. */
  const ctx = vm.createContext({});
  vm.runInContext(helper, ctx);
  ctx._records = [{ id: 'crm_1', type: 'client' }];
  ctx._vagas = [{ id: 'crm_vaga_1', type: 'vaga', titulo: 'Front-end' }];
  ctx._talentos = [];
  ctx._colaboradores = [];
  ctx._despesas = [];
  const obj = {};
  [{ id: 1, title: 'nota' }].forEach(n => { obj[n.id] = n; });
  ctx._preservarRegistrosDoQuadro(obj);
  assert.deepEqual(Object.keys(obj).sort(), ['1', 'crm_1', 'crm_vaga_1']);
});

/* ── Cartoes do painel de recrutamento ─────────────────────────────────── */

test('os cinco cartoes tem icone e barra, e so o recrutamento os preenche', () => {
  ['vagas', 'paid', 'pending', 'count', 'ticket'].forEach(k => {
    assert.match(HTML, new RegExp('id="crm-ico-' + k + '"'), 'falta o icone de ' + k);
    assert.match(HTML, new RegExp('id="crm-bar-' + k + '"'), 'falta a barra de ' + k);
  });

  const painel = recortar(APP, 'function updateCRMDashboard(');
  assert.match(painel, /\.forEach\(_crmPintarIcone\)/, 'o recrutamento nao pinta os icones');
  /* E o financeiro tem de LIMPAR: senao o icone do recrutamento fica na tela
     depois de trocar de modelo, como aconteceu com os rotulos. */
  assert.match(painel, /ico\.innerHTML = ''/,
    'o financeiro nao limpa o icone — ele sobraria da outra leitura');
});

test('barra sem denominador fica vazia, e nao cheia', () => {
  /* 0 de 0 nao e 100%. Uma barra cheia diria "tudo pronto" num quadro que
     nao tem nada cadastrado. */
  const ctx = vm.createContext({ document: {
    getElementById: id => ctx._els[id] || null,
  } });
  ctx._els = {};
  const barra = chave => {
    const preenche = { style: {} };
    ctx._els['crm-bar-' + chave] = { querySelector: () => preenche };
    return preenche;
  };
  vm.runInContext(recortar(APP, 'function _crmPintarBarra('), ctx);

  const vazia = barra('a');
  ctx._crmPintarBarra('a', 0, 0);
  assert.equal(vazia.style.width, '0.0%');

  const meia = barra('b');
  ctx._crmPintarBarra('b', 5, 10);
  assert.equal(meia.style.width, '50.0%');

  /* Parte maior que o todo nao estoura a barra. */
  const cheia = barra('c');
  ctx._crmPintarBarra('c', 30, 10);
  assert.equal(cheia.style.width, '100.0%');

  const negativa = barra('d');
  ctx._crmPintarBarra('d', -5, 10);
  assert.equal(negativa.style.width, '0.0%');
});

test('cada barra tem denominador declarado — nenhuma e enfeite', () => {
  /* Barra sem denominador seria enfeite: preencheria por estetica, e nao
     porque o numero significa alguma coisa em relacao a algo. */
  const painel = recortar(APP, 'function updateCRMDashboard(');
  const esperado = [
    ["_crmPintarBarra('vagas'", '_vagas.length'],
    ["_crmPintarBarra('paid'", 'total'],
    ["_crmPintarBarra('pending'", 'total'],
    ["_crmPintarBarra('count'", 'total'],
    ["_crmPintarBarra('ticket'", '1'],
  ];
  for (const [chamada, denominador] of esperado) {
    const i = painel.indexOf(chamada);
    assert.ok(i > -1, 'sumiu a barra: ' + chamada);
    const linha = painel.slice(i, painel.indexOf('\n', i));
    assert.ok(linha.includes(denominador),
      chamada + ' perdeu o denominador ' + denominador + ' — virou enfeite');
  }
});

/* ── Avanco automatico pela nota da triagem ────────────────────────────── */

const RHJS = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');

test('a regra de avanco vive na VAGA, e nasce desligada', () => {
  /* Cada processo tem seu corte: um estagio nao usa a regua de um senior.
     E desligada por padrao porque mover gente sem pedir seria decidir no
     lugar de quem recruta. */
  const ctx = montar();
  const n = ctx._vagaNormalizar({ titulo: 'X' });
  assert.equal(n.avancoAuto, false, 'a regra nao pode vir ligada de fabrica');
  assert.equal(n.notaMinima, 80, 'sem valor, o corte precisa de um padrao');

  /* Zero cai no padrao, e nao em 1: "sem corte" nao e "corte de 1 ponto",
     que passaria todo mundo. */
  assert.equal(ctx._vagaNormalizar({ titulo: 'X', notaMinima: 0 }).notaMinima, 80);
  assert.equal(ctx._vagaNormalizar({ titulo: 'X', notaMinima: -5 }).notaMinima, 80);
  assert.equal(ctx._vagaNormalizar({ titulo: 'X', notaMinima: 500 }).notaMinima, 100);
  assert.equal(ctx._vagaNormalizar({ titulo: 'X', notaMinima: 'oitenta' }).notaMinima, 80);
});

test('titulo repetido NAO escolhe vaga por palpite', () => {
  /* Duas vagas com o mesmo nome podem ter regras diferentes. Sem desempate
     possivel, nao aplicar regra nenhuma e a resposta honesta. */
  const ctx = montar({ vagas: [
    vaga('a', { titulo: 'Analista' }), vaga('b', { titulo: 'Analista' }),
  ] });
  vm.runInContext(recortar(APP, 'function _vagaPorTitulo('), ctx);
  assert.equal(ctx._vagaPorTitulo('Analista'), null);
  assert.equal(ctx._vagaPorTitulo('  ANALISTA '), null);

  const ctx2 = montar({ vagas: [vaga('a', { titulo: 'Analista' })] });
  vm.runInContext(recortar(APP, 'function _vagaPorTitulo('), ctx2);
  assert.equal(ctx2._vagaPorTitulo('  analista  ').id, 'a', 'caixa e espaco nao podem impedir');
  assert.equal(ctx2._vagaPorTitulo(''), null);
  assert.equal(ctx2._vagaPorTitulo('outra'), null);
});

test('o avanco casa por NOME, nunca por posicao', () => {
  /* Armadilha ja paga neste projeto: quando o modelo responde ordenado por
     nota e renumera de 1 a N, casar por indice poe o curriculo de uma pessoa
     na analise de outra — e nenhuma validacao de quantidade ou faixa pega
     isso, porque as duas leituras produzem sequencias identicas. */
  const corpo = RHJS.slice(RHJS.indexOf('async function _avancoAutomatico('));
  const fim = corpo.slice(0, corpo.indexOf('\n  function mostrarTriagem'));

  assert.match(fim, /String\(r\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === alvo/,
    'o casamento deixou de ser por nome');
  assert.equal(/it\.pos/.test(fim), false,
    'voltou a usar a posicao do bloco como identidade');
  assert.match(fim, /casam\.length !== 1/,
    'nome ambiguo precisa ser ignorado, nao chutado');
});

test('o avanco so vai para a frente, e nunca reprova', () => {
  const corpo = RHJS.slice(RHJS.indexOf('async function _avancoAutomatico('));
  const fim = corpo.slice(0, corpo.indexOf('\n  function mostrarTriagem'));

  assert.match(fim, /onde\.indice >= DESTINO\) continue/,
    'quem ja passou dessa etapa seria puxado de volta');
  assert.match(fim, /onde\.concluido/, 'admitido nao pode voltar para entrevista');
  assert.match(fim, /reprovado\(rec\)\) continue/, 'reprovado nao pode ser reerguido');
  assert.equal(/reprovar\(/.test(fim), false, 'o avanco nunca pode reprovar ninguem');
  assert.match(fim, /it\.nota === null\) continue/, 'sem nota ninguem se move');
  assert.match(fim, /it\.nota < corte\) continue/, 'abaixo do corte ninguem se move');
});

test('a regra so age quando a vaga a declarou', () => {
  const corpo = RHJS.slice(RHJS.indexOf('async function _avancoAutomatico('));
  const fim = corpo.slice(0, corpo.indexOf('\n  function mostrarTriagem'));
  assert.match(fim, /!cadastro\.avancoAuto\) \{/,
    'vaga sem a regra ligada nao pode mover ninguem');
  assert.match(fim, /rh\.autoAdvanced/,
    'mover sem avisar deixaria o candidato trocar de coluna sozinho, sem explicacao');
  assert.match(RHJS, /await _avancoAutomatico\(vaga, r, escolhidos\)/,
    'a triagem nao chama o avanco');
});

/* A REGRA E DA VAGA DO CANDIDATO, e nao do nome digitado na janela.

   O campo da triagem e texto livre, e `_vagaPorTitulo` devolve null quando
   duas vagas tem o mesmo titulo — entao a regra sumia inteira justamente para
   quem tinha a vaga duplicada, e nada explicava o silencio. */
test('o avanco acha a vaga pelo candidato, e explica quando nao move', () => {
  const corpo = RHJS.slice(RHJS.indexOf('function _vagaDoCandidato('));
  const fim = corpo.slice(0, corpo.indexOf('\n  async function _avancoAutomatico'));
  assert.match(fim, /_vagaPorId\(campos\.vagaId\)/,
    'o vinculo do proprio candidato tem de vir primeiro');
  assert.match(fim, /_vagaPorTitulo\(campos\.vaga\)/, 'depois o rotulo antigo dele');
  assert.match(fim, /_vagaPorTitulo\(digitada\)/, 'e so entao o que foi digitado');

  const avanco = RHJS.slice(RHJS.indexOf('async function _avancoAutomatico('));
  const bloco = avanco.slice(0, avanco.indexOf('\n  function mostrarTriagem'));
  assert.match(bloco, /_vagaDoCandidato\(rec, vaga\)/);
  assert.match(bloco, /rh\.autoAdvanceOff/,
    'nao mover por interruptor desligado precisa aparecer na tela');
  assert.match(bloco, /rh\.autoAdvanceNoVacancy/,
    'nao mover por falta de vaga cadastrada precisa aparecer na tela');
});
