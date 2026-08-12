'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   PROPOSTA, ADMISSÃO E QUADRO DE COLABORADORES
   ═══════════════════════════════════════════════════════════════════════
   As duas telas do fim do processo. O que este arquivo cobra não é o
   desenho — é o que quebra em silêncio:

   1. NENHUM NÚMERO INVENTADO. Todo indicador sai de dado que existe. Um
      painel de RH é feito de contas, e conta errada não dá erro: só mente na
      tela, com a mesma cara de um número verdadeiro.
   2. O CANDIDATO NÃO É CONSUMIDO ao virar colaborador — a ficha dele guarda
      o currículo, o parecer e a nota da triagem, que é o que explica a
      escolha meses depois.
   3. ENTIDADE NOVA NO NÓ DAS NOTAS entra nos DOIS montadores de objeto.
      `fbSet` troca o nó inteiro: o que não estiver ali some, sem erro na
      tela. Foi assim que salvar uma nota apagou todas as vagas.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const PESSOAS = fs.readFileSync(path.join(RAIZ, 'docs/js/pessoas.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

/* Carrega o pessoas.js real num DOM de mentira. Só as contas são exercitadas
   aqui; o desenho é verificado por leitura do fonte, como no resto do projeto. */
function montar({ colaboradores = [], registros = [], hoje = '2026-08-04' } = {}) {
  const elemento = () => ({
    classList: { add() {}, remove() {}, toggle() {} },
    style: {}, dataset: {}, textContent: '', innerHTML: '', value: '',
    appendChild() {}, remove() {}, addEventListener() {}, focus() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    isConnected: true,
  });
  const janela = {
    document: {
      querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: elemento,
      body: { appendChild() {}, classList: { add() {}, remove() {} } },
      addEventListener() {}, removeEventListener() {},
    },
    crmRegistros: () => registros,
    crmColaboradores: () => colaboradores,
    _crmTodayLocalIso: () => hoje,
    _appText: (k, f, v) => String(f == null ? k : f)
      .replace(/\{(\w+)\}/g, (_, n) => (v && v[n] !== undefined ? v[n] : '')),
    xe: s => String(s), sanitizeAttr: s => String(s),
    fmtBRL: v => 'R$ ' + v, _crmFmtDate: d => d,
    colaboradorAtivo: c => {
      if (!c || c.situacao === 'desligado') return false;
      if (c.desligadoEm && c.desligadoEm <= hoje) return false;
      return !c.admitidoEm || c.admitidoEm <= hoje;
    },
    EXPERIENCIA_DIAS: 90, EXPERIENCIA_1A_AVALIACAO: 45,
    PROPOSTA_ETAPAS: ['rascunho', 'enviada', 'visualizada', 'aceita', 'admissao'],
    propostaDe: rec => {
      const p = (rec && rec.proposta) || {};
      return Object.assign({ cargo: '', salario: 0, inicio: '', prazo: '',
        departamento: '', historico: [] }, p);
    },
    /* O vínculo mora num helper só do app.js: o id, e nunca o nome, com as
       duas pontas obrigatoriamente preenchidas. */
    _colaboradorDoCandidato: recId => {
      const alvo = String(recId || '').trim();
      if (!alvo) return null;
      return colaboradores.find(c =>
        String(c.origemCandidatoId || '').trim() === alvo) || null;
    },
    propostaSituacao: rec => {
      const h = ((rec && rec.proposta && rec.proposta.historico) || []);
      const ordem = ['rascunho', 'enviada', 'visualizada', 'aceita', 'admissao'];
      let ultima = -1;
      ordem.forEach((e, i) => { if (h.some(x => x.etapa === e)) ultima = Math.max(ultima, i); });
      return { indice: ultima, etapa: ordem[ultima] || '', existe: ultima >= 0 };
    },
    toast() {},
  };
  const ctx = { window: janela, document: janela.document, Date, Math, Number,
                String, Array, Object, JSON, Map, Set, console, setTimeout, clearTimeout };
  ctx.global = ctx;
  vm.runInNewContext(PESSOAS, ctx, { filename: 'pessoas.js' });
  return janela.MD_PESSOAS;
}

const colab = (nome, extra) => Object.assign({
  id: 'crm_colab_' + nome, type: 'colaborador', nome,
  admitidoEm: '2026-01-10', situacao: 'ativo', departamento: 'Tecnologia',
  cargo: 'Analista', checklist: [],
}, extra || {});

/* ── As contas ─────────────────────────────────────────────────────────── */

test('o quadro conta quem já entrou e ainda não saiu — nem antes, nem depois', () => {
  const P = montar({ colaboradores: [
    colab('a', { admitidoEm: '2026-01-10' }),
    colab('b', { admitidoEm: '2026-08-20' }),                      // começa depois
    colab('c', { admitidoEm: '2025-05-01', desligadoEm: '2026-03-01' }),
  ] });
  assert.equal(P.quadroEm('2026-08-04'), 1, 'admissão no futuro não conta hoje');
  assert.equal(P.quadroEm('2026-02-01'), 2, 'quem saiu em março ainda estava lá em fevereiro');
  assert.equal(P.quadroEm('2026-08-31'), 2, 'no fim de agosto os dois já entraram');
  assert.equal(P.quadroEm('2024-01-01'), 0);
});

test('em experiência é quem tem menos de 90 dias de casa', () => {
  const P = montar({ colaboradores: [
    colab('novo', { admitidoEm: '2026-07-20' }),     // 15 dias
    colab('quase', { admitidoEm: '2026-05-08' }),    // 88 dias
    colab('efetivo', { admitidoEm: '2026-01-02' }),  // muito mais
  ] });
  assert.deepEqual(P.emExperiencia().map(c => c.nome), ['novo', 'quase']);
});

test('as avaliações vencem nos dois marcos do contrato, e não antes', () => {
  const P = montar({ colaboradores: [
    colab('a', { admitidoEm: '2026-07-30' }),   // 5 dias: nada ainda
    colab('b', { admitidoEm: '2026-06-10' }),   // 55 dias: experiência
    colab('c', { admitidoEm: '2026-04-20' }),   // 106 dias: efetivação
    colab('d', { admitidoEm: '2025-01-01' }),   // antigo: nada
  ] });
  const av = P.avaliacoesPendentes();
  // join, e nao deepEqual: os arrays vem de outro realm (vm) e o modo estrito
  // compara prototipos, nao so o conteudo.
  assert.equal(av.experiencia.map(c => c.nome).join(','), 'b');
  assert.equal(av.desempenho.map(c => c.nome).join(','), 'c');
});

test('documentos pendentes soma o MESMO item entre pessoas diferentes', () => {
  const P = montar({ colaboradores: [
    colab('a', { checklist: [{ t: 'Contrato', ok: false }, { t: 'Exames', ok: false }] }),
    colab('b', { checklist: [{ t: 'Contrato', ok: false }, { t: 'Exames', ok: true }] }),
    colab('c', { checklist: [{ t: 'Contrato', ok: true }] }),
  ] });
  assert.equal(P.documentosPendentes().map(d => d.nome + ':' + d.n).join(' '),
    'Contrato:2 Exames:1');
  assert.equal(P.onboardings().map(c => c.nome).join(','), 'a,b',
    'quem já terminou o checklist saiu do onboarding');
});

test('aniversariantes olham o MÊS, e nunca o ano de nascimento', () => {
  const P = montar({ hoje: '2026-08-04', colaboradores: [
    colab('a', { nascimento: '1990-08-27' }),
    colab('b', { nascimento: '1988-09-01' }),
    colab('c', { nascimento: '2001-08-05' }),
    colab('d', { nascimento: '' }),
  ] });
  assert.equal(P.aniversariantes().map(c => c.nome).join(','), 'c,a',
    'ordena pelo dia, e quem não informou data não entra');
});

/* "Próximas admissões" é quem AINDA NÃO É DO TIME. O colaborador já
   convertido aparecia aqui e no quadro de colaboradores ao mesmo tempo, com a
   data de início na semana seguinte — duas leituras se contradizendo na mesma
   tela. Que ele comece na quinta é assunto do rodapé do cartão de ativos. */
test('próximas admissões são só de quem ainda não virou colaborador', () => {
  const rec = { id: 'crm_1', name: 'Ana', template: 'rh',
                proposta: { inicio: '2026-09-01', cargo: 'Dev', historico: [] } };
  const semColab = montar({ registros: [rec], colaboradores: [] });
  assert.equal(semColab.proximasAdmissoes().length, 1);

  /* Colaborador com admissão marcada para daqui a dias NÃO entra: ele já é do
     time, e o quadro de colaboradores já o mostra. */
  const soColabFuturo = montar({ registros: [], colaboradores: [
    colab('Novo', { admitidoEm: '2026-08-20' }),
  ] });
  assert.equal(soColabFuturo.proximasAdmissoes().length, 0,
    'quem já é colaborador não pode aparecer como admissão futura');

  // E o candidato convertido sai da lista junto com a ficha que o originou.
  const jaConvertida = montar({ registros: [rec], colaboradores: [
    colab('Ana', { admitidoEm: '2026-09-01', origemCandidatoId: 'crm_1' }),
  ] });
  assert.equal(jaConvertida.proximasAdmissoes().length, 0,
    'a mesma pessoa não pode estar no quadro e na fila de admissão ao mesmo tempo');
});

test('proposta vencida sem resposta vira pendência; aceita não vira', () => {
  const vencida = { id: 'crm_1', name: 'Ana', template: 'rh', proposta: {
    prazo: '2026-08-01', historico: [{ etapa: 'enviada' }] } };
  const aceita = { id: 'crm_2', name: 'Beto', template: 'rh', proposta: {
    prazo: '2026-08-01', historico: [{ etapa: 'enviada' }, { etapa: 'aceita' }] } };
  const P = montar({ registros: [vencida, aceita] });
  const linhas = P.pendencias().filter(x => /Ana|Beto/.test(x.texto));
  assert.equal(linhas.length, 1, 'quem já aceitou não é pendência');
  assert.match(linhas[0].texto, /Ana/);
  assert.match(linhas[0].detalhe, /3/, 'o atraso é contado em dias');
});

test('o donut divide 100% entre os departamentos, sem casa perdida', () => {
  const P = montar({ colaboradores: [
    colab('a', { departamento: 'Tecnologia' }), colab('b', { departamento: 'Tecnologia' }),
    colab('c', { departamento: 'Produto' }), colab('d', { departamento: '' }),
  ] });
  const d = P.porDepartamento();
  assert.equal(d.total, 4);
  assert.equal(d.itens[0].nome, 'Tecnologia');
  assert.equal(d.itens[0].n, 2);
  assert.equal(Math.round(d.itens.reduce((s, i) => s + i.pct, 0)), 100);
  assert.ok(d.itens.some(i => /Sem departamento/.test(i.nome)),
    'quem não tem departamento precisa aparecer, e não sumir da conta');
});

test('quadro vazio não desenha gráfico nem inventa número', () => {
  const P = montar({ colaboradores: [] });
  assert.equal(P.quadroEm('2026-08-04'), 0);
  assert.match(P.donut(P.porDepartamento()), /rhv-vazio/,
    'sem gente, o donut precisa dizer que não há — não desenhar um anel falso');
  assert.equal(P.sparkline([3]), '', 'um ponto só não é uma linha');
  assert.equal(P.diasEntre('', '2026-01-01'), null, 'data faltando não vira zero');
});

/* ── A entidade e a conversão ──────────────────────────────────────────── */

test('colaborador entra em TODOS os montadores de objeto do nó das notas', () => {
  /* `fbSet` troca o nó inteiro: entidade fora do objeto some sem erro na tela.
     Foi assim que salvar uma nota apagou todas as vagas. */
  const helper = recortar(APP, 'function _preservarRegistrosDoQuadro(');
  assert.match(helper, /_colaboradores/, 'a preservação perderia os colaboradores');

  /* Os QUATRO gravadores, e não dois. Os outros dois — `_savePersonalNotesNow`
     e a troca de workspace pessoal — preservavam só os clientes, e por isso
     entrar num workspace 1:1 apagava vagas, talentos, colaboradores e despesas
     do workspace pessoal nomeado. */
  const chamadas = APP.match(/(?<!function )_preservarRegistrosDoQuadro\(obj\)/g) || [];
  assert.equal(chamadas.length, 4,
    'algum gravador do nó das notas voltou a montar o objeto por conta própria');
  ['async function _savePersonalNotesNow(', 'async function _pwSwitchTo('].forEach(nome => {
    const i = APP.indexOf(nome);
    if (i < 0) return;   // nome mudou: os outros asserts continuam valendo
    assert.match(APP.slice(i, i + 2600), /_preservarRegistrosDoQuadro\(obj\)/,
      nome + ' voltou a gravar sem preservar o que não é nota');
  });
});

test('colaborador não é cliente, e não entra na carteira', () => {
  const corpo = recortar(APP, 'function _crmEhRegistro(');
  assert.match(corpo, /_ehColaborador\(r\)/,
    'sem isto o colaborador vira cliente e entra nos totais de dinheiro');
});

test('converter mantém o candidato e não duplica a pessoa', () => {
  const corpo = recortar(APP, 'async function converterEmColaborador(');
  assert.match(corpo, /origemCandidatoId/, 'sem a origem, converter duas vezes cria duas pessoas');
  assert.match(corpo, /jaTem/);
  assert.equal(/_records\s*=\s*_records\.filter/.test(corpo), false,
    'a ficha do candidato guarda currículo, parecer e nota — não pode ser consumida');
  assert.match(corpo, /salvarProposta\(recId, \{\}, 'admissao'\)/,
    'converter tem de carimbar a admissão no histórico da proposta');
});

test('a proposta mora na ficha do candidato, e nasce como rascunho', () => {
  const corpo = recortar(APP, 'async function salvarProposta(');
  assert.match(corpo, /updateRecord\(recId, \{ proposta: nova \}\)/,
    'gravar por outro caminho criaria uma segunda porta para o mesmo registro');
  assert.match(corpo, /if \(!nova\.historico\.length\)/,
    'sem isto o histórico começaria no meio, sem o rascunho');
});

test('a situação da proposta é a ÚLTIMA etapa carimbada, não a primeira em branco', () => {
  const corpo = recortar(APP, 'function propostaSituacao(');
  assert.match(corpo, /Math\.max\(ultima, i\)/,
    'quem registrou "aceita" sem "visualizada" avançou de verdade');
});

/* ── As telas ──────────────────────────────────────────────────────────── */

test('a tela da proposta tem as quatro partes do conceito', () => {
  const corpo = PESSOAS.slice(PESSOAS.indexOf('function pintarProposta('));
  assert.match(corpo, /rh\.offerSummary/, 'sumiu o resumo da proposta');
  assert.match(corpo, /rh\.offerHistory/, 'sumiu o histórico');
  assert.match(corpo, /pa-timeline/);
  assert.match(corpo, /rh\.admissionChecklist/, 'sumiu o checklist de admissão');
  assert.match(corpo, /rh\.downloadPdf/);
  assert.match(corpo, /rh\.sendByEmail/, 'a proposta precisa poder ir por e-mail ao candidato');
  assert.match(corpo, /rh\.counterOffer/);
  /* Emoji NO DESENHO da tela — os ícones ao lado dos rótulos e dos botões.
     O ✓ do selo "Concluído" fica: é sinal tipográfico e está no próprio
     conceito. Os toasts também ficam, que é a convenção do app inteiro. O
     que ela recusou foi o bonequinho, o saco de dinheiro e o presente ao
     lado dos campos: emoji muda de cara em cada sistema e tem ar de recado
     de celular num documento de trabalho. */
  const desenho = corpo.slice(corpo.indexOf('host.innerHTML ='),
                              corpo.indexOf('/* A foto vem do IndexedDB'));
  assert.ok(desenho.length > 500, 'a leitura do desenho falhou');
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(desenho), false,
    'emoji voltou para a tela da proposta');
  assert.match(desenho, /linha\('cargo',/, 'a linha do cargo saiu do resumo');
  assert.match(desenho, /linha\('tarefas', t\('rh\.duties'/,
    'o resumo precisa dizer o que a pessoa vai fazer');
  assert.match(corpo, /<span class="pa-linha-ico">\$\{svg\(ico\)\}<\/span>/,
    'os rótulos perderam os ícones de traço');
  assert.match(corpo, /rh\.convert/, 'sumiu o botão que leva à outra tela');
  assert.match(corpo, /safePhotoUrlRaw/,
    'a foto vai para .src: escapar para atributo quebraria o base64');
});

test('a visão geral tem os cinco indicadores e os blocos do conceito', () => {
  const corpo = PESSOAS.slice(PESSOAS.indexOf('function pintarVisaoRH('));
  ['rh.activeCollaborators', 'rh.hiresThisMonth', 'rh.inProbation',
   'rh.onVacation', 'rh.pendingRequests', 'rh.headcountEvolution',
   'rh.byDepartment', 'rh.onboardings', 'rh.pendingDocs', 'rh.absences',
   'rh.pendingReviews', 'rh.birthdays', 'rh.nextAdmissions',
   'rh.importantPending'].forEach(k => {
    assert.ok(corpo.includes(k), 'sumiu o bloco ' + k);
  });
});

test('as duas telas têm porta de entrada e são exclusivas do recrutamento', () => {
  assert.match(HTML, /id="crm-btn-propostas"/);
  assert.match(HTML, /id="crm-btn-visao-rh"/);
  assert.match(HTML, /js\/pessoas\.js\?v=/, 'o arquivo não é carregado pela página');
  const modelo = recortar(APP, 'function _crmAplicarModelo(');
  assert.match(modelo, /crm-btn-propostas/,
    'os botões precisam sumir no painel financeiro, como os outros do RH');
  assert.match(modelo, /crm-btn-visao-rh/);
  const menu = APP.slice(APP.indexOf('function crmAcoesDoCandidato('));
  assert.match(menu.slice(0, menu.indexOf('\n}')), /rh\.offerAdmission/,
    'o cartão precisa levar à proposta daquela pessoa');
});

test('o prefixo do CSS novo não colide com o painel de vagas', () => {
  /* `vg-` já é do painel de vagas: reaproveitar o prefixo faria uma tela
     herdar o estilo da outra sem ninguém entender por quê. */
  assert.match(CSS, /\.rhv-kpi\{/);
  assert.match(CSS, /\.pa-timeline\{/);
  const usados = [...new Set([...PESSOAS.matchAll(/class="(rhv?-[a-z-]+)/g)].map(m => m[1]))];
  assert.ok(usados.length > 10, 'a leitura das classes falhou');
  assert.ok(!usados.some(c => /^vg-(corpo|vazio|acoes|item-nome)$/.test(c)),
    'classe do painel de vagas reaproveitada por engano');
});

/* ── O PDF, o envio e o que a proposta precisa dizer ────────────────────── */

test('o PDF é um arquivo de verdade, e não a caixa de impressão', () => {
  /* Antes isto era window.print(): dependia de a pessoa escolher "Salvar como
     PDF" — o que não é baixar um PDF, e não serve para anexar num e-mail. */
  assert.equal(/window\.print\(\)/.test(PESSOAS), false, 'a impressão voltou');
  assert.match(PESSOAS, /function baixarProposta\(/);
  assert.match(PESSOAS, /new Blob\(\[bytes\], \{ type: 'application\/pdf' \}\)/);
  assert.match(HTML, /js\/proposta-pdf\.js\?v=/, 'a página não carrega o gerador');

  const pdf = require(path.join(RAIZ, 'docs/js/proposta-pdf.js'));
  const base64 = pdf.paraBase64({
    titulo: 'Proposta de Contratação',
    linhaVaga: 'Vaga de Diretor',
    logo: fs.readFileSync(path.join(RAIZ, 'docs/img/logo-proposta.png')),
    saudacao: 'Prezada(o) João,',
    paragrafos: ['Segue nossa proposta com as condições.'],
    tituloCondicoes: 'CONDIÇÕES', condicoes: [['Cargo', 'Diretor'], ['Salário', 'R$ 13.000,00']],
    paragrafosFinais: ['Devolva assinado para rh@empresa.com.'],
    rotuloAssinatura: 'Assinatura do(a) candidato(a)', rotuloData: 'Data:  ___/___/______',
  });
  const buf = Buffer.from(base64, 'base64');
  const texto = buf.toString('latin1');
  assert.match(texto, /^%PDF-1\.4/, 'não é um PDF');
  assert.match(texto, /%%EOF/);

  /* A tabela de posições precisa apontar para os objetos certos: PDF com
     offset errado abre em branco em alguns leitores e não abre em outros — e
     o erro só aparece no leitor de quem recebeu. */
  const inicio = Number(texto.slice(texto.lastIndexOf('startxref') + 9).trim().split(/\s/)[0]);
  const linhas = texto.slice(inicio).split('\n');
  let n = 0;
  for (let i = 3; i < linhas.length; i++) {
    if (!/^\d{10} \d{5} n/.test(linhas[i])) break;
    const off = Number(linhas[i].slice(0, 10));
    assert.match(texto.slice(off, off + 10), new RegExp('^' + (++n) + ' 0 obj'),
      'offset do objeto ' + n + ' aponta para o lugar errado');
  }
  /* 1 catalogo, 2 indice, 3-6 as quatro fontes, 7 a marca, 8+9 a folha e o
     fluxo dela. Times entrou em duas variantes porque o documento inteiro e
     serifado: regular no corpo, negrito nos valores do quadro. */
  assert.equal(n, 9, 'o documento perdeu objetos');
  assert.match(texto, /\/Count 1 /, 'a carta tipica precisa caber em uma pagina');
  assert.match(texto, /\/BaseFont \/Times-Roman/, 'sumiu a serifada do corpo');
  assert.match(texto, /\/BaseFont \/Times-Bold/,
    'sem a negrito serifada, os valores do quadro sairiam em Helvetica');
  assert.match(texto, /\/Subtype \/Image/, 'sumiu a marca do papel timbrado');
  assert.match(texto, /\/Predictor 15/,
    'o PNG entra como está; refiltrar exigiria zlib nos dois lados');

  /* Cada fluxo tem de declarar o próprio tamanho: /Length errado é arquivo
     que o leitor recusa. */
  let busca = 0;
  for (;;) {
    const m = texto.slice(busca).match(/\/Length (\d+) >>\nstream\n/);
    if (!m) break;
    const ini = busca + m.index + m[0].length;
    assert.equal(texto.indexOf('\nendstream', ini) - ini, Number(m[1]),
      '/Length em desacordo com o fluxo: leitor recusa o arquivo');
    busca = ini;
  }

  /* A linha de assinatura existe, porque é ela que faz a proposta ser aceita.
     Parêntese vai escapado dentro do fluxo — no PDF ele delimita texto. */
  assert.match(texto, /Assinatura do/);
  assert.match(texto, /Data:/, 'sem campo de data, a assinatura não datada não vale');
});

test('a carta diz o que a pessoa vai fazer e para onde responder', () => {
  const carta = PESSOAS.slice(PESSOAS.indexOf('function dadosDaCarta('),
                              PESSOAS.indexOf('function nomeDoArquivo('));
  /* O QUE A PESSOA VAI FAZER É LINHA DO QUADRO, e não parágrafo.
     Era "No dia a dia, você vai {descrição}" — e quem preenche o campo
     escreve o que tem na cabeça. Com "Software" ali, a carta saía dizendo
     "No dia a dia, você vai Software.". Nenhum molde de frase sobrevive a
     todo texto que cabe num campo livre; como linha rotulada, qualquer
     conteúdo lê certo. */
  assert.match(carta, /rh\.letterDuties/,
    'proposta sem "o que vai fazer" não responde a primeira pergunta de quem recebe');
  assert.equal(/rh\.letterP3/.test(carta), false,
    'voltou o molde de frase que quebra com campo livre');
  /* A carta AGRADECE antes de combinar número: quem recebe quer saber, nesta
     ordem, que foi escolhido, para fazer o quê — e só então quanto. Abrir por
     uma tabela de valores faz o documento ser lido como formulário. */
  assert.match(carta, /paragrafos: \[/);
  assert.match(carta, /rh\.letterP1/, 'sumiu o agradecimento de abertura');
  assert.ok(carta.indexOf('rh.letterP1') < carta.indexOf('tituloCondicoes'),
    'os números não podem vir antes do texto');
  assert.match(carta, /rh\.letterReply/);
  assert.match(carta, /emailResposta/,
    'sem endereço de resposta, quem assina não tem para onde devolver');
  assert.match(carta, /rotuloAssinatura/);
  // Título e linha da vaga são do modelo dela, e não decoração deste código.
  assert.match(carta, /rh\.letterTitle/);
  assert.match(carta, /rh\.letterVacancy/);
  /* O documento termina na assinatura DO CANDIDATO. "Atenciosamente" com o
     nome de quem envia era invenção da versão anterior — o modelo não tem. */
  assert.equal(/rh\.letterRegards/.test(carta), false, 'voltou o fecho inventado');
  assert.equal(/rh\.offerFooter/.test(carta), false, 'voltou o rodapé inventado');
});

/* ═══════════════════════════════════════════════════════════════════════
   O DOCUMENTO É O QUE ELA DESENHOU
   ═══════════════════════════════════════════════════════════════════════
   A versão anterior era releitura minha: nome da empresa em caixa alta,
   pontinhos de contato, caixa cinza com os valores, diagonal no canto. Ela
   refez no Word e as medidas daqui saíram de lá — faixa azul de 51,5 pt em
   cima e 22,5 embaixo, marca centrada, título em serifada, corpo justificado
   e assinatura centrada no pé.
   ═══════════════════════════════════════════════════════════════════════ */
test('o papel é o do modelo: faixas, galão e marca em toda folha', () => {
  const pdfSrc = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  assert.match(pdfSrc, /barraTopo:\s*51\.5/);
  assert.match(pdfSrc, /barraPe:\s*22\.5/);
  assert.match(pdfSrc, /const AZUL\s*=\s*\[0\.145, 0\.557, 0\.976\]/, 'a cor da faixa mudou');
  assert.match(pdfSrc, /function timbre\(/);
  /* Folha seguinte sem timbre pareceria outro documento — e o timbre entra na
     CRIAÇÃO da folha, porque o PDF pinta na ordem dos comandos: desenhado
     depois, o galão cobria a assinatura da segunda folha. */
  assert.match(pdfSrc, /function novaPagina\(\)[\s\S]{0,220}timbre\(p\)/);
  // E nada do papel inventado de antes, nem o código morto que sobra dele.
  assert.equal(/d\.papelRemetente|function circulo\(|const DESTAQUE/.test(pdfSrc), false,
    'sobrou peça do timbre antigo');
});

test('o corpo é justificado, como no modelo', () => {
  const pdfSrc = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  assert.match(pdfSrc, /Tw/, 'sem Tw não há justificação');
  /* A última linha do parágrafo NÃO se estica: esticá-la abre buracos entre
     as palavras e é o erro clássico de quem justifica na mão. */
  assert.match(pdfSrc, /!ultima && espacos/);
});

test('o envio da proposta: o que NUNCA vem do corpo do POST', () => {
  /* Um endpoint que aceita anexo E destinatario do corpo e um servico de
     envio de e-mail arbitrario com o nosso dominio no remetente — e assim que
     um dominio vai para lista de bloqueio.

     O anexo passou a ser aceito (ela precisa mandar o proprio modelo), e por
     isso as OUTRAS travas viraram o que segura tudo: o destinatario sai da
     ficha, o quadro e conferido no banco contra o uid de quem pede, o
     endereco de resposta sai da proposta gravada e a cota diaria continua
     valendo. Da para mandar o proprio documento para os PROPRIOS candidatos,
     e nada alem disso. */
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  const bloco = api.slice(api.indexOf("body.acao === 'enviarProposta'"));
  const fim = bloco.slice(0, bloco.indexOf('const id = String(body.id'));
  assert.match(fim, /resolveClientDestination/, 'sumiu a trava de quadro');
  assert.match(fim, /ficha\.email/, 'o destinatario tem de sair da ficha');
  assert.match(fim, /consumirCotaDeAviso/, 'envio sem teto queima a cota do provedor');
  assert.match(fim, /proposta\.emailResposta/,
    'a resposta do candidato nao pode voltar para o remetente de sistema');
  assert.equal(/body\.(para|destinatario|email|assunto|html|corpo)/.test(fim), false,
    'destinatario ou corpo do e-mail passaram a vir do cliente');

  // Sem arquivo, o PDF continua sendo montado aqui, da proposta gravada.
  assert.match(fim, /propostaPdf\.paraBase64/);
  assert.match(fim, /if \(!anexo\)/, 'o modelo do MyDesk deixou de ser o padrao');
});

test('o modelo proprio e checado dos dois lados, e so aceita PDF ou Word', () => {
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  const bloco = api.slice(api.indexOf("body.acao === 'enviarProposta'"));
  const fim = bloco.slice(0, bloco.indexOf('const id = String(body.id'));
  // Tipo declarado no proprio dataURL, e nao no nome do arquivo.
  assert.match(fim, /const TIPOS_PROPOSTA = \{/);
  assert.match(fim, /'application\/pdf'/);
  assert.match(fim, /wordprocessingml\.document/);
  /* O tipo sai do CABECALHO do dataURL, conferido contra a lista — nao do
     nome do arquivo, que quem manda o POST escreve como quiser. */
  assert.ok(fim.includes(';base64,'), 'sem conferir o cabecalho, qualquer coisa entra');
  assert.match(fim, /TIPOS_PROPOSTA\[cabecalho\[1\]\]/);
  assert.match(fim, /arq\.dataUrl\.length > MAX_ARQUIVO/, 'anexo sem teto de tamanho');
  /* Nome de arquivo com barra ou quebra de linha se injeta no cabecalho do
     e-mail; o que chega do cliente e limpo antes de virar filename. */
  assert.match(fim, /String\(arq\.nome \|\| ''\)\.replace\(/);

  // E o navegador confere antes, para a pessoa saber na hora.
  assert.match(PESSOAS, /const TIPOS_PROPOSTA = \{/);
  assert.match(PESSOAS, /rh\.fileKind/);
  assert.match(PESSOAS, /rh\.fileTooBig/);
});

test('enviar por e-mail pergunta qual modelo antes de mandar', () => {
  /* Escritorio que ja tem papel timbrado e texto aprovado pelo juridico nao
     troca o dele pelo nosso: ou manda o proprio, ou manda por fora do MyDesk
     e o processo perde o registro. */
  assert.match(PESSOAS, /function escolherModelo\(/);
  assert.match(PESSOAS, /rh\.templateMyDesk/);
  assert.match(PESSOAS, /rh\.templateOwn/);
  const envio = PESSOAS.slice(PESSOAS.indexOf('async function enviarProposta('));
  assert.ok(envio.indexOf('escolherModelo()') < envio.indexOf('crmEnviarPropostaPorEmail'),
    'a pergunta tem de vir antes do envio');
  assert.match(envio, /if \(modelo === 'proprio'\)/);
  assert.match(envio, /if \(!arquivo\) return/,
    'cancelar a escolha do arquivo nao pode mandar a carta padrao sem avisar');

  // Cancelar a caixa do sistema nao dispara evento: sem isso a promessa
  // nunca resolveria e o botao ficaria travado ate recarregar a pagina.
  assert.match(PESSOAS, /addEventListener\('focus', function solto/);
});

test('voltar para a triagem apaga a proposta e a admissão daquela negociação', () => {
  const corpo = recortar(APP, 'async function limparPropostaEAdmissao(');
  assert.match(corpo, /proposta: null, admissao: null/);
  assert.match(corpo, /MD_PESSOAS\.pintarVisaoRH/,
    '"Próximas admissões" continuaria mostrando quem voltou ao começo');
  assert.match(corpo, /rh\.offerCleared/, 'apagar sem avisar é indistinguível de perder');

  const rh = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
  const bloco = rh.slice(rh.indexOf('async function mover('));
  assert.match(bloco.slice(0, 2600), /destino === 0 && \(atual\.concluido \|\| atual\.indice > 0\)/,
    'andar de uma entrevista para outra é ajuste de processo, e não pode apagar nada');
});

test('toda etapa do histórico pode ser desfeita', () => {
  /* Converter em colaborador carimba a admissão sozinho: existe um caminho
     automático, e ele precisa poder ser corrigido à mão. */
  const corpo = PESSOAS.slice(PESSOAS.indexOf('const passos = global.PROPOSTA_ETAPAS'));
  const fim = corpo.slice(0, corpo.indexOf("}).join('');"));
  assert.match(fim, /data-desfazer/);
  assert.match(fim, /rh\.undoStep/);
  assert.equal(/i > s\.indice \+ 1/.test(fim), false,
    'o botão voltou a aparecer só na etapa seguinte, trancando o histórico');
  assert.match(APP, /async function desfazerEtapaProposta\(/);
});

test('o painel de propostas separa quem espera, quem aceitou e quem já entrou', () => {
  /* Era um menu suspenso com nomes soltos: não mostrava valor nem prazo, não
     separava situação e sumia ao primeiro clique fora. */
  const corpo = PESSOAS.slice(PESSOAS.indexOf('function grupoDasPropostas('));
  const fim = corpo.slice(0, corpo.indexOf('function abrirProposta('));
  ['negociando', 'aceitas', 'chegando', 'admitidos'].forEach(g => {
    assert.ok(fim.includes(g), 'sumiu o grupo ' + g);
  });
  assert.match(fim, /rh\.grpNegotiating/);
  assert.match(fim, /rh\.grpArriving/, 'os que vêm a seguir precisam aparecer');
  const entrada = recortar(APP, 'function crmAbrirPropostas(');
  assert.match(entrada, /MD_PESSOAS\.abrirPropostas\(\)/);
  assert.equal(/_cdashMenu/.test(entrada), false, 'voltou a ser menu');
});

test('a modalidade da proposta tem como ser preenchida', () => {
  /* A tela mostrava a linha "Modalidade" e o formulário não tinha o campo:
     cobrava um dado que não havia como informar. */
  const form = PESSOAS.slice(PESSOAS.indexOf('function formularioProposta('));
  const fim = form.slice(0, form.indexOf('\n  }'));
  assert.match(fim, /id: 'contrato'/);
  assert.match(fim, /tipo: 'selecao'/);
  assert.match(fim, /id: 'descricao'/, 'faltava o que a pessoa vai fazer');
  assert.match(fim, /id: 'emailResposta'/);
  assert.match(APP, /window\.VAGA_CONTRATO_OPCOES/,
    'o select precisa da lista de contratos, que é `const` de script');
});

test('descricao longa vira segunda pagina, e nao texto por baixo da margem', () => {
  /* Uma descrição de vaga bem escrita passa de meia página. A versão anterior
     desenhava por cima da margem: o texto sumia sob a linha de assinatura e a
     proposta chegava incompleta, sem nada avisando. Cortar seria pior — e
     justamente o pedaço que diz o que a pessoa vai fazer. */
  const pdf = require(path.join(RAIZ, 'docs/js/proposta-pdf.js'));
  const s = Buffer.from(pdf.gerar({
    saudacao: 'Prezado(a) Fulano,',
    paragrafos: ['Paragrafo comprido para forcar a quebra de pagina. '.repeat(60)],
    condicoes: [['Cargo', 'Diretor'], ['Salario', 'R$ 13.000,00']],
    tituloCondicoes: 'CONDICOES',
    paragrafosFinais: ['Devolva assinado.'],
    fecho: 'Atenciosamente,', assinante: 'Victor',
    rotuloAssinatura: 'Assinatura do candidato', rotuloData: 'Data', rodape: 'MyDesk',
  })).toString('latin1');

  const paginas = Number(s.match(/\/Count (\d+)/)[1]);
  assert.ok(paginas >= 2, 'o texto longo continuou espremido numa pagina so');
  assert.equal((s.match(/\/Type \/Page[^s]/g) || []).length, paginas,
    'o indice de paginas nao bate com as paginas escritas');
  /* A numeração da ABNT é o número da folha no canto superior direito, e
     não "1/2" no rodapé: o rodapé desta folha é a faixa azul. */
  assert.match(s, /\(2\)\nTj/, 'documento de varias paginas precisa numerar as folhas');

  // Todo /Length continua batendo com o fluxo que o segue.
  const re = /\/Length (\d+) >>\nstream\n/g;
  let m, conferidos = 0;
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length;
    assert.equal(s.indexOf('\nendstream', ini) - ini, Number(m[1]),
      'fluxo com tamanho errado: o leitor recusa o arquivo');
    conferidos++;
  }
  assert.equal(conferidos, paginas, 'cada pagina precisa do proprio fluxo');
});

/* ── O CHECKLIST DE ADMISSÃO TEM UM DONO SÓ ─────────────────────────────── */

test('depois de converter, o checklist é do colaborador — e não de duas cópias', () => {
  /* Ele existia em `rec.admissao` (tela da proposta) e em
     `colaborador.checklist` (Visão geral), copiado no instante da conversão.
     Quem convertia e só depois marcava os documentos marcava numa cópia e
     olhava a outra: a tela dizia 4/5 e o painel continuava com 5 pendentes. */
  const leitura = recortar(APP, 'function admissaoChecklist(');
  assert.match(leitura, /_colaboradorDoCandidato\(rec\.id\)/,
    'a leitura voltou a ignorar o colaborador');
  assert.match(leitura, /colab\.checklist/);

  const escrita = recortar(APP, 'async function salvarAdmissaoChecklist(');
  assert.match(escrita, /_colaboradorDoCandidato\(recId\)/);
  assert.match(escrita, /atualizarColaborador\(colab\.id, \{ checklist: limpos \}\)/,
    'marcar um item precisa escrever no dono, e não numa segunda cópia');
  assert.match(escrita, /if \(!colab\) return updateRecord\(recId, \{ admissao: limpos \}\)/,
    'antes de virar colaborador, o dono continua sendo a ficha do candidato');
  assert.match(escrita, /MD_PESSOAS\.pintarVisaoRH/,
    'o painel conta os itens em aberto e precisa repintar');

  // E o texto explicativo do item sobrevive à conversão.
  const normal = recortar(APP, 'function _colaboradorNormalizar(');
  assert.match(normal, /sub: String\(i\.sub \|\| ''\)/,
    'o item chegaria ao colaborador sem a explicação');
});

test('o bloco de aniversariantes diz o que falta, e não só que não há', () => {
  /* Candidato que vem por formulário quase sempre chega sem data de
     nascimento — o caso comum é a ficha estar em branco, não o mês estar
     vazio. "Ninguém faz aniversário" mandava procurar defeito onde faltava
     dado. */
  const corpo = PESSOAS.slice(PESSOAS.indexOf('function pintarVisaoRH('));
  assert.match(corpo, /semNascimento/);
  assert.match(corpo, /rh\.noBirthdayData/);
  assert.match(corpo, /rotuloMesAtual\(\)/, 'a mensagem precisa nomear o mês');
});

/* ── O FORMULÁRIO DO CANDIDATO É A PEÇA CENTRAL ─────────────────────────── */

test('o colaborador herda a ficha inteira do candidato, e não só o nome', () => {
  /* É no formulário da vaga que a pessoa digita CPF, RG, nascimento,
     endereço, escolaridade, nome da mãe. Guardar só nome, cargo e admissão
     jogava esse trabalho fora no instante da contratação — e alguém teria de
     pedir tudo de novo, a quem já tinha respondido. */
  const mapa = recortar(APP, 'function dadosDoCandidatoParaColaborador(');
  ['cpf', 'rg', 'nascimento', 'escolaridade', 'estadoCivil', 'genero',
   'nacionalidade', 'nomeMae', 'nomePai', 'naturalidade', 'cep', 'endereco',
   'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach(campo => {
    assert.ok(mapa.includes(campo + ':'), 'o colaborador perdeu ' + campo);
  });

  const conversao = recortar(APP, 'async function converterEmColaborador(');
  assert.match(conversao, /dadosDoCandidatoParaColaborador\(rec\)/,
    'a conversão voltou a copiar só um punhado de campos');
  /* Anexo NÃO vem junto: currículo em base64 dentro do registro é o peso de
     download que este projeto passou semanas cortando, e a ficha de origem
     continua guardada com ele. */
  assert.equal(/documents:/.test(conversao), false,
    'os anexos não podem ser duplicados no colaborador');

  const normal = recortar(APP, 'function _colaboradorNormalizar(');
  assert.match(normal, /COLAB_TEXTO\.forEach/);
  assert.match(normal, /campos:\s+d\.campos/,
    'as respostas do processo seletivo precisam viajar junto');
});

test('trazer da ficha não sobrescreve o que já foi corrigido no colaborador', () => {
  /* Quem corrigiu o telefone no cadastro do colaborador corrigiu por saber de
     algo que o formulário não sabia. Um "sincronizar" que apaga isso é perda
     de dado disfarçada de recurso. */
  const corpo = recortar(APP, 'async function puxarDadosDoCandidato(');
  assert.match(corpo, /if \(valor && !String\(c\[k\] \|\| ''\)\.trim\(\)\)/);
  assert.match(corpo, /rh\.nothingToPull/, 'sem nada a trazer, a tela precisa dizer');
  assert.match(corpo, /rh\.noSourceRecord/, 'ficha sumida não pode falhar em silêncio');
});

test('o quadro mostra mais que nome e cargo, e a busca alcança a ficha', () => {
  const corpo = PESSOAS.slice(PESSOAS.indexOf('function pintarVisaoRH('));
  const tabela = corpo.slice(corpo.indexOf('<table class="rhv-tabela">'));
  ['app.fieldEmail', 'app.phone', 'app.city', 'rh.contract', 'rh.salary']
    .forEach(k => assert.ok(tabela.includes(k), 'falta a coluna ' + k));

  const busca = recortar(PESSOAS, 'function _vgFiltrada(');
  assert.match(busca, /c\.cpf/, 'a busca promete "documento" e precisa alcançar o CPF');
  assert.match(busca, /Object\.values\(c\.campos/,
    'as respostas do processo seletivo também são procuráveis');
});

/* ── OS GRUPOS DO PAINEL SEGUEM A COLUNA DO FUNIL ───────────────────────── */

test('aceitas é quem está na Admissão; chegando são as duas últimas colunas', () => {
  /* É como o quadro se lê: quem está na Admissão já aceitou, e as duas
     últimas colunas são "chegando ao fim". O histórico da proposta diz em que
     pé está a conversa — alguém pode aceitar por telefone e o carimbo entrar
     depois —, e por isso não decide o grupo. */
  const corpo = PESSOAS.slice(PESSOAS.indexOf('function grupoDasPropostas('));
  const fim = corpo.slice(0, corpo.indexOf('function abrirPropostas('));
  assert.match(fim, /const naAdmissao = e\.concluido \|\| e\.indice >= totais - 1/);
  assert.match(fim, /if \(naAdmissao\) \{ saida\.aceitas/);
  assert.match(fim, /e\.indice >= Math\.max\(0, totais - 2\)\) saida\.chegando/);
  /* Cada pessoa num grupo só: aparecer em dois lugares era o que fazia a tela
     se contradizer. Todos os ramos saem com `return`. */
  assert.equal((fim.match(/saida\.\w+\.push/g) || []).length, 4);
  assert.ok(fim.indexOf('saida.admitidos.push') < fim.indexOf('saida.aceitas.push'),
    'quem já é colaborador tem de ser decidido antes de tudo');
});

test('dá para remover a proposta, e só ela', () => {
  const corpo = recortar(APP, 'async function removerProposta(');
  assert.match(corpo, /updateRecord\(recId, \{ proposta: null \}\)/);
  assert.equal(/admissao: null/.test(corpo), false,
    'o checklist de admissão não pertence à negociação desfeita');
  assert.match(corpo, /confirmarAcao/, 'apagar sem perguntar não se desfaz');
  assert.match(corpo, /MD_PESSOAS\.pintarPropostas/, 'o painel precisa repintar');

  // Alcançável nos dois lugares: no cartão do painel e na tela da proposta.
  assert.match(PESSOAS, /data-remover="\$\{attr\(rec\.id\)\}"/);
  assert.match(PESSOAS, /id="pa-remover"/);
  // E nunca em quem já é colaborador: ali a proposta é histórico.
  assert.match(PESSOAS, /\$\{s\.existe && !colab \?/);
});

/* ═══════════════════════════════════════════════════════════════════════
   A VISÃO GERAL É TELA, E NÃO JANELA
   ═══════════════════════════════════════════════════════════════════════
   Nasceu como modal: quadro flutuando sobre o board, com fundo escurecido e
   fecho ao clicar fora. Para cinco indicadores, dois gráficos, sete blocos e
   a tabela do quadro inteiro isso sobra margem morta dos lados e falta
   largura para a tabela — que passava a rolar na horizontal dentro de um
   quadro que já rolava na vertical. E o fecho ao clicar fora derrubava a tela
   ao mirar um gráfico e errar por dois pixels.
   ═══════════════════════════════════════════════════════════════════════ */
/* Estas duas funções montam HTML em template literal, com `}` no início de
   linha dentro do texto — `recortar` cortaria no primeiro deles. O trecho vai
   de uma função à seguinte. */
function entre(inicio, fim) {
  const a = PESSOAS.indexOf(inicio);
  const b = PESSOAS.indexOf(fim, a);
  assert.ok(a > 0 && b > a, 'sumiu: ' + inicio);
  return PESSOAS.slice(a, b);
}

test('a visão geral ocupa a tela inteira, e não uma janela', () => {
  const corpo = entre('function abrirVisaoRH(', 'function _vgFiltrada(');
  assert.match(corpo, /className = 'rhv-full'/, 'a tela cheia perdeu a classe');
  assert.equal(/className = '[^']*modal-bg/.test(corpo), false, 'voltou a ser modal');
  assert.equal(/composedPath/.test(corpo), false,
    'voltou o clique-fora que fecha o painel sem querer');
  assert.match(CSS, /\.rhv-full\{[^}]*position:fixed[^}]*inset:0/,
    'a tela cheia não está fixada na janela');
  assert.match(CSS, /body\.rhv-travado\{overflow:hidden/,
    'sem travar o corpo, a página rola por baixo e o scroll se divide em dois');
});

test('a tela cheia sai por quem pediu — pelo ✕ ou por Esc', () => {
  const corpo = entre('function abrirVisaoRH(', 'function _vgFiltrada(');
  assert.match(corpo, /id="rhv-fechar"/);
  assert.match(corpo, /'Escape'/, 'Esc precisa fechar');
  // E a trava do corpo tem de ser desfeita, senão a página fica sem rolagem.
  assert.match(corpo, /classList\.remove\('rhv-travado'\)/);
  assert.match(corpo, /removeEventListener\('keydown'/,
    'o ouvinte de teclado ficaria vivo depois de fechar');
});

test('cada bloco diz quantos ficaram de fora e abre a lista ali mesmo', () => {
  const corpo = entre('function pintarVisaoRH(', 'function menuColaborador(');
  assert.match(corpo, /rh\.seeAllN/, 'sumiu o "Ver todos"');
  assert.match(corpo, /data-abrir=/, 'o rodapé precisa de alvo para o clique');
  assert.match(corpo, /sobram > 0/, 'o rodapé só aparece quando há resto');
  // A escolha vive fora do DOM: o painel se redesenha inteiro a cada busca.
  assert.match(PESSOAS, /const _vgAberto = new Set\(\)/);
});

test('as linhas dos blocos trazem ícone de traço, e nenhum emoji', () => {
  const corpo = entre('function pintarVisaoRH(', 'function menuColaborador(');
  assert.match(corpo, /rhv-linha-ico/, 'as linhas ficaram sem ícone');
  assert.match(corpo, /svg\('alerta'/, 'a pendência voltou ao ⚠ de emoji');
  assert.equal(/⚠/.test(corpo), false, 'emoji de volta no painel');
  // Próximas admissões é tabela disfarçada: as colunas têm de alinhar.
  assert.match(corpo, /rhv-linha-cols/);
  assert.match(CSS, /\.rhv-linha-cols\{display:grid/);
});

/* ═══════════════════════════════════════════════════════════════════════
   O BLOCO DE TEXTO SEGUE A ABNT
   ═══════════════════════════════════════════════════════════════════════
   O modelo dela trazia o corpo de borda a borda — 11,75 pt de margem, quase
   110 caracteres por linha — e nada marcando onde um parágrafo acabava e o
   outro começava. Ela pediu ABNT: margens 3 cm e 2 cm, entrelinha 1,5, corpo
   em 12, recuo de 1,25 cm na primeira linha, justificado. O timbre (faixas,
   marca, galão, título em serifada) continua sendo o dela.
   ═══════════════════════════════════════════════════════════════════════ */
test('margens, entrelinha, corpo e recuo saem da ABNT', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  assert.match(src, /const CM = 28\.3465/, 'sem o centímetro, as medidas viram chute');
  assert.match(src, /margemEsq:\s*3 \* CM/);
  assert.match(src, /margemDir:\s*2 \* CM/);
  assert.match(src, /recuoPar:\s*1\.25 \* CM/);
  assert.match(src, /corpoTam:\s*12/);
  assert.match(src, /corpoSalto:\s*18/, '1,5 de entrelinha em 12 pt é 18');
});

test('o recuo empurra o começo da linha, e não estica o fim', () => {
  /* Medir a primeira linha pela largura cheia e depois deslocá-la faz a linha
     avançar sob a margem direita — o recuo tem de sair da MEDIDA. */
  const src = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  const fn = src.slice(src.indexOf('function paragrafo('),
                       src.indexOf('function poligono('));
  assert.match(fn, /UTIL - \(n === 0 \? dente : 0\)/, 'a medida ignora o recuo');
  assert.match(fn, /const medida = UTIL - \(i === 0 \? dente : 0\)/,
    'a justificação da primeira linha usaria a medida errada');
});

test('a saudação não leva recuo — é vocativo, não parágrafo', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  const fn = src.slice(src.indexOf('function desenhar(d)'));
  const sauda = fn.slice(fn.indexOf('d.saudacao'), fn.indexOf('escreverBloco'));
  assert.equal(/recuoPar/.test(sauda), false);
});

test('o quadro de condições é medido pela linha de base, e sobra igual dos dois lados', () => {
  /* O PDF escreve SOBRE a linha de base. Um quadro medido só por ela sai com
     o dobro de ar embaixo do que em cima — foi assim na primeira versão. */
  const src = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  assert.match(src, /acima: 8, abaixo: 3/, 'sumiu a altura da letra em volta da base');
  assert.match(src, /function medirCondicoes\(/,
    'sem medir antes, o fundo não pode ser pintado antes do texto');
  const fn = src.slice(src.indexOf('function desenharCondicoes('));
  assert.ok(fn.indexOf('retangulo(pg') < fn.indexOf('texto(pg, titulo'),
    'o fundo tem de ser pintado ANTES do texto: o PDF pinta na ordem dos comandos');
});

test('a assinatura nunca fica sozinha numa folha', () => {
  /* Uma folha em branco com dois traços no meio parece arquivo quebrado. Se o
     fim não couber, o parágrafo de aceite desce junto. */
  const src = fs.readFileSync(path.join(RAIZ, 'docs/js/proposta-pdf.js'), 'utf8');
  assert.match(src, /medirBloco\(d\.paragrafosFinais\) \+ alturaPe/);
  /* E o pé tem piso próprio: a margem de 2 cm da ABNT vale para o bloco de
     texto, não para o traço da assinatura. */
  assert.match(src, /const PISO_PE = M\.barraPe \+ 12/);
  assert.match(src, /espaco\(doc0, alturaPe, PISO_PE\)/);
});

test('a folha de continuacao nunca traz so a assinatura', () => {
  /* Duas folhas nao sao problema — ela disse isso, e o desenho deixou de
     espremer o texto para caber numa so. O que continua sendo problema e uma
     folha em branco com dois tracos no meio: quem recebe olha e acha que o
     arquivo veio quebrado. Se o fim nao couber, o paragrafo de aceite desce
     junto com a assinatura. */
  const pdf = require(path.join(RAIZ, 'docs/js/proposta-pdf.js'));
  const bytes = pdf.gerar({
    titulo: 'Proposta de Contratação',
    linhaVaga: 'Vaga de Desenvolvedor Pleno',
    logo: fs.readFileSync(path.join(RAIZ, 'docs/img/logo-proposta.png')),
    saudacao: 'Prezada(o) João Victor de Melo e Alvim de Azevedo,',
    paragrafos: [
      'Obrigado por todo o cuidado e o tempo que você dedicou ao nosso processo seletivo. Conversamos com muita gente boa, e a sua trajetória foi a que mais se aproximou do que procurávamos.',
      'É com muita satisfação que convidamos você a fazer parte da nossa equipe como Desenvolvedor Pleno.',
      'Ficaríamos felizes em ter você conosco a partir de 06 de ago. de 2026. Abaixo estão as condições que combinamos. Se algo aqui não corresponder ao que conversamos, por favor, informe antes de assinar; preferimos acertar agora do que começar com dúvida.',
    ],
    tituloCondicoes: 'CONDIÇÕES DA PROPOSTA',
    condicoes: [['Cargo', 'Desenvolvedor Pleno'], ['Salário', 'R$ 10.000,00'],
      ['Benefícios', 'Vale Alimento e Vale Transporte'], ['Modalidade', 'PJ'],
      ['Jornada', 'PJ'], ['Data de início', '06 de ago. de 2026'],
      ['O que você vai fazer', 'Software']],
    paragrafosFinais: ['Para aceitar, assine no campo abaixo e devolva este documento para mydesksocial@hotmail.com até 05 de ago. de 2026. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.'],
    rotuloAssinatura: 'Assinatura do(a) candidato(a)',
    rotuloData: 'Data:  ___/___/______',
  });
  const s = Buffer.from(bytes).toString('latin1');
  const paginas = Number(s.match(/\/Count (\d+)/)[1]);
  assert.equal(paginas, 2, 'a proposta real dela deveria ocupar duas folhas');

  /* A folha da assinatura tem o paragrafo de aceite junto. Recortar o fluxo
     dela por split('stream') nao serve: os bytes da imagem contem essa
     sequencia por acaso. O recorte vai do ultimo 'stream' ANTES da assinatura
     ate ela. */
  const ondeAssina = s.indexOf('Assinatura do');
  assert.ok(ondeAssina > 0, 'sumiu a linha de assinatura');
  const inicioDaFolha = s.lastIndexOf('stream\n', ondeAssina);
  const folha = s.slice(inicioDaFolha, ondeAssina);
  assert.match(folha, /Para aceitar/,
    'a assinatura ficou sozinha na folha: parece arquivo quebrado');
});

/* ═══════════════════════════════════════════════════════════════════════
   O RECIBO PRECISA CHEGAR A QUEM PAGOU
   ═══════════════════════════════════════════════════════════════════════
   Enquanto ele tinha uma assinatura so, baixar bastava: o papel ja saia
   completo do gerador. Com o campo de assinatura do pagante, ele precisa
   CHEGAR ao pagante — senao a segunda linha nunca e assinada e o campo vira
   enfeite.
   ═══════════════════════════════════════════════════════════════════════ */
test('o recibo tem as duas assinaturas, lado a lado e alinhadas', () => {
  /* gerarReciboPDF vem DEPOIS de _escolherCaminho no arquivo — recortar por
     ele daria fatia vazia, e o teste passaria sem testar nada. */
  const fn = APP.slice(APP.indexOf('function gerarReciboPDF('),
                       APP.indexOf('function baixarRelatorioCRMemPDF('));
  assert.match(fn, /Assinatura de quem recebeu/);
  assert.match(fn, /Assinatura do pagante/);
  // Lado a lado: uma embaixo da outra faria a de baixo parecer secundaria.
  assert.match(fn, /const colEsq = M \+ LARG \* 0\.25/);
  assert.match(fn, /const colDir = M \+ LARG \* 0\.75/);
  /* Os rotulos de pe na MESMA altura, mesmo com um lado tendo uma linha a
     mais — o emitente costuma ter registro profissional e o pagante nao. */
  assert.match(fn, /const yRotulo = y \+ Math\.max\(/);
  // O gerador DEVOLVE o arquivo: ele tem dois destinos agora.
  assert.match(fn, /return \{ bytes: doc\.bytes\(\), nome: nomeArq \}/);
  assert.equal(/_pdfBaixar\(doc\.bytes\(\)/.test(fn), false,
    'voltou a baixar direto, e ai nao da para enviar');
});

test('emitir recibo pergunta: baixar ou mandar para o cliente assinar', () => {
  const fn = APP.slice(APP.indexOf('async function abrirReciboCRM('),
                       APP.indexOf('function gerarReciboPDF('));
  assert.match(fn, /_escolherCaminho\(/);
  assert.match(fn, /app\.receiptDownload/);
  assert.match(fn, /app\.receiptSend/);
  /* Sem e-mail na ficha a opcao aparece APAGADA e com o motivo escrito.
     Sumir com ela deixaria a pessoa procurando um recurso que existe. */
  assert.match(fn, /desabilitado: !paraCliente/);
  assert.match(fn, /app\.receiptNoEmail/);
  assert.match(CSS, /\.pm-opt-off\{opacity/);
});

test('o envio do recibo: o destinatario sai da ficha, nunca do POST', () => {
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  const i = api.indexOf("body.acao === 'enviarRecibo'");
  assert.ok(i > 0, 'a rota do recibo sumiu');
  const bloco = api.slice(i, api.indexOf("body.acao === 'enviarProposta'"));
  assert.match(bloco, /verifyIdToken/, 'envio sem login');
  assert.match(bloco, /resolveClientDestination/, 'sumiu a trava de quadro');
  assert.match(bloco, /ficha\.email/, 'o destinatario tem de sair da ficha');
  assert.match(bloco, /consumirCotaDeAviso/, 'envio sem teto queima a cota do provedor');
  // So PDF, e com teto.
  assert.ok(bloco.includes('data:application\\/pdf;base64,'),
    'aceita qualquer arquivo como recibo');
  assert.match(bloco, /arq\.dataUrl\.length > MAX_ARQUIVO/);
  // Nome de arquivo com barra ou quebra de linha se injeta no cabecalho.
  assert.match(bloco, /String\(arq\.nome \|\| ''\)\.replace\(/);
  /* A via assinada volta para quem EMITIU, e nao para um endereco de sistema
     que ninguem le. */
  assert.match(bloco, /getUser\(quem\.uid\)/);
  assert.match(bloco, /responderPara: respostaPara/);
});

test('o recibo cita a lei que lhe da respaldo, com o artigo literal', () => {
  /* O que da respaldo a um recibo nao e a palavra "recibo" no alto: e ele
     reunir o que o art. 320 do Codigo Civil exige. Escrever isso no proprio
     papel muda como ele e lido — por quem recebe, por um contador, por um
     juiz. O texto do artigo vai LITERAL: parafrasear lei num documento que
     serve de prova estraga o efeito de cita-la. */
  const fn = APP.slice(APP.indexOf('function gerarReciboPDF('),
                       APP.indexOf('function baixarRelatorioCRMemPDF('));
  assert.match(fn, /FUNDAMENTO LEGAL/);
  assert.match(fn, /arts\. 319 e 320 da Lei n. 10\.406\/2002/);
  assert.match(fn, /A quita..o, que sempre poder. ser dada por instrumento particular/,
    'o artigo precisa ir literal, entre aspas');
  // Quitacao parcial nao pode sair dizendo que quitou tudo.
  assert.match(fn, /d\.parcial\s*\n?\s*\?/);
  assert.match(fn, /permanecendo devido o saldo/);
  /* A segunda assinatura levanta a pergunta; o papel responde, em vez de
     deixar alguem supor que sem ela o recibo nao vale. */
  assert.match(fn, /n.o . exigida por lei/);
  // E o bloco nao pode encostar no rodape quando o corpo foi longo.
  assert.match(fn, /Math\.max\(14, Math\.min\(34, \(_PDF_A - 70\) - 66 - y\)\)/);
});

test('o e-mail do cliente se preenche na propria tela do recibo', () => {
  /* Sem ele nao da para mandar o recibo para o cliente assinar. Mandar a
     pessoa sair da tela, abrir "Editar", preencher e voltar e transformar um
     campo que falta em quatro cliques. */
  const fn = APP.slice(APP.indexOf('async function abrirReciboCRM('),
                       APP.indexOf('function _escolherCaminho('));
  assert.match(fn, /id="rc-cl-email"/);
  assert.match(fn, /const emailDigitado = v\('rc-cl-email'\)/);
  assert.match(fn, /app\.receiptCheckEmail/, 'e-mail torto tem de ser recusado aqui');
  /* O que for digitado e GRAVADO NA FICHA: o servidor le o destinatario do
     banco, e essa trava nao se afrouxa por comodidade. */
  assert.match(fn, /await updateRecord\(rec\.id, \{ email: emailDigitado \}\)/);
  assert.ok(fn.indexOf('updateRecord(rec.id, { email') < fn.indexOf('_escolherCaminho('),
    'a ficha tem de ser atualizada ANTES de oferecer o envio');
});

/* ═══════════════════════════════════════════════════════════════════════
   TODO E-MAIL SAI COM A MARCA
   ═══════════════════════════════════════════════════════════════════════
   Cada e-mail daqui montava o proprio HTML: uma div com Arial e alguns
   paragrafos. Chegava sem marca e sem cartao — do lado de quem recebe,
   indistinguivel de mensagem automatica de sistema qualquer. E o contraste
   estava dentro do proprio produto: o lembrete de compromisso, que sai pelo
   Worker do Cloudflare, sempre teve cabecalho com a logo. Dois caminhos de
   envio, duas caras.
   ═══════════════════════════════════════════════════════════════════════ */
test('todo e-mail do app passa pelo mesmo envelope', () => {
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  assert.match(api, /function _emailEnvelope\(/);
  assert.match(api, /logo-mydesk\.png/, 'o envelope perdeu a marca');
  /* Um por mensagem — aviso ao candidato, cobranca, recibo, proposta e link
     do formulario — mais a definicao da funcao. */
  assert.equal((api.match(/_emailEnvelope\(/g) || []).length, 6,
    'algum e-mail voltou a montar o proprio HTML solto');
  assert.equal(/font-family:Arial,Helvetica,sans-serif;max-width:520px/.test(api), false,
    'sobrou a div sem marca de antes');
  // Cada mensagem se identifica no alto.
  assert.equal((api.match(/chapeu:/g) || []).length, 17);
});

test('o envelope e feito para cliente de e-mail, e nao para navegador', () => {
  /* Gmail, Outlook e Apple Mail descartam <style>, ignoram flex e grid, e o
     Outlook ainda renderiza com o motor do Word. Tabela com atributos e style
     inline e o que chega inteiro nos tres. */
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  const fn = api.slice(api.indexOf('function _emailEnvelope('),
                       api.indexOf('function emailConfiguration('));
  assert.match(fn, /<table role="presentation"/);
  assert.equal(/<style/.test(fn), false, 'cliente de e-mail descarta <style>');
  assert.equal(/display:flex|display:grid/.test(fn), false);
  /* A logo vai por URL: parte dos clientes bloqueia imagem remota ate a pessoa
     liberar, e o alt cobre esse caso — anexar a imagem em toda mensagem a
     faria aparecer como arquivo junto do PDF que de fato importa. */
  assert.match(fn, /alt="MyDesk"/);
  assert.equal(/cid:|base64/.test(fn), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   A VIA ASSINADA TEM DE VOLTAR PARA ALGUEM
   ═══════════════════════════════════════════════════════════════════════
   O e-mail dizia "devolva uma via respondendo a este e-mail" — e o remetente
   e um endereco de sistema que nao le resposta nenhuma. O cliente respondia,
   a mensagem caia no vazio, e ele concluia que tinha devolvido o recibo
   quando nao tinha devolvido.
   ═══════════════════════════════════════════════════════════════════════ */
test('o recibo diz para QUAL endereco devolver a via assinada', () => {
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  // O texto cita o endereco; sem ele, cai numa frase que nao promete resposta.
  assert.match(api, /devolva uma via para \{resposta\}/);
  assert.match(api, /assineSemEmail:/, 'sem endereco, o texto tem de mudar');
  assert.match(api, /_preencher\(esc\(T\.assine\), \{ resposta:/);
});

test('o endereco de resposta sai do banco, e nunca do corpo do POST', () => {
  /* Cabecalho de e-mail montado com dado do cliente e o caminho curto para
     alguem mandar mensagem com a nossa cara e a resposta indo para outro
     lugar. O endereco e o que o prestador declarou na tela, gravado no
     perfil dele. */
  const api = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  const i = api.indexOf("body.acao === 'enviarRecibo'");
  const bloco = api.slice(i, api.indexOf("body.acao === 'enviarProposta'"));
  assert.match(bloco, /personal\/emitente/, 'o reply_to deixou de sair do perfil');
  assert.equal(/body\.(resposta|replyTo|emailResposta)/.test(bloco), false,
    'o endereco de resposta passou a vir do cliente');
  // O e-mail da conta e so o retorno: o login nao e o e-mail de trabalho.
  assert.ok(bloco.indexOf('personal/emitente') < bloco.indexOf('getUser(quem.uid)'),
    'o perfil tem de ser consultado ANTES da conta');

  // E a tela tem o campo, validado e guardado junto dos dados do emitente.
  const fn = APP.slice(APP.indexOf('async function abrirReciboCRM('),
                       APP.indexOf('function _escolherCaminho('));
  assert.match(fn, /id="rc-em-email"/);
  assert.match(fn, /app\.receiptCheckReplyTo/);
  assert.match(fn, /email: dados\.emEmail \|\| ''/, 'o endereco nao esta sendo guardado');
});
