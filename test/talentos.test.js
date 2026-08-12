'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   BANCO DE TALENTOS
   ═══════════════════════════════════════════════════════════════════════
   Talento é pessoa guardada para depois. Mora no mesmo nó das notas, com
   `type: 'talento'` — mesma razão da vaga: reaproveita as regras que já
   existem e o ouvinte que já está no ar.

   Um talento NÃO é um candidato. Candidato pertence a um processo e vive num
   funil; talento não tem processo. Convidar CRIA um candidato e MANTÉM o
   talento — se o convite o consumisse, o banco se esvaziaria a cada processo
   e a pessoa precisaria ser recadastrada para o próximo.

   E a compatibilidade devolve MOTIVOS, não só um número: quem decide precisa
   ver o que bateu e o que não bateu. Número sozinho vira mágica.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const RH = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const I18NJS = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

/* Corte por LINHA para os arrays de opcoes: o corte por bloco vai ate o
   proximo fecha-chaves e engoliria a constante seguinte, redeclarando-a. */
function recortarLinha(fonte, prefixo) {
  const i = fonte.indexOf(prefixo);
  assert.ok(i > 0, 'sumiu: ' + prefixo);
  return fonte.slice(i, fonte.indexOf('\n', i));
}

function montar({ talentos = [], vagas = [] } = {}) {
  const ctx = vm.createContext({
    _talentos: talentos, _vagas: vagas, _records: [],
    _appText: (k, f, vars) => String(f || k).replace(/\{(\w+)\}/g,
      (_, n) => (vars && vars[n] !== undefined ? vars[n] : '')),
  });
  vm.runInContext([
    recortarLinha(APP, 'const VAGA_STATUS'),
    recortarLinha(APP, 'const VAGA_MODALIDADE'),
    recortarLinha(APP, 'const TALENTO_SENIORIDADE'),
    recortarLinha(APP, 'const TALENTO_DISPONIB'),
    recortar(APP, 'function _vagaOpcao('),
    recortar(APP, 'function _opcaoOuVazio('),
    recortar(APP, 'function _vagaPorId('),
    recortar(APP, 'function _vagasAbertas('),
    recortar(APP, 'function _ehTalento('),
    recortar(APP, 'function notaIaDe('),
    recortar(APP, 'function _talentoTags('),
    recortar(APP, 'function _talentoNormalizar('),
    recortar(APP, 'function compatibilidadeTalentoVaga('),
    recortar(APP, 'function vagasCompativeis('),
  ].join('\n'), ctx);
  return ctx;
}

const talento = e => Object.assign({
  id: 't1', type: 'talento', nome: 'Ana', area: 'Tecnologia',
  habilidades: 'React TypeScript CSS', modalidade: 'remota',
  cidade: 'São Paulo', pretensao: 9000, tags: [],
}, e);
const vaga = e => Object.assign({
  id: 'v1', type: 'vaga', titulo: 'Front-end', status: 'aberta',
  departamento: 'Tecnologia', modalidade: 'remota', cidade: 'São Paulo',
  requisitos: 'React\nTypeScript', desejaveis: '', salarioMax: 12000,
}, e);

test('talento nao e cliente nem vaga', () => {
  const corpo = recortar(APP, 'function _crmEhRegistro(');
  assert.match(corpo, /_ehTalento\(r\)/,
    'talento vazaria para a carteira e entraria nos totais de dinheiro');
  const ctx = montar();
  assert.equal(ctx._ehTalento({ type: 'talento' }), true);
  assert.equal(ctx._ehTalento({ type: 'client' }), false);
});

test('tags entram como texto e saem limpas, sem repetida nem vazia', () => {
  const ctx = montar();
  assert.deepEqual([...ctx._talentoTags(' React , react ,, TypeScript ,React ')],
    ['React', 'TypeScript'], 'repetida por caixa diferente tem de sumir');
  assert.deepEqual([...ctx._talentoTags('')], []);
  assert.equal(ctx._talentoTags(Array(40).fill('x').map((_, i) => 'tag' + i)).length, 12,
    'lista de tags precisa de teto');
});

test('normalizar recusa opcao inventada', () => {
  const ctx = montar();
  const n = ctx._talentoNormalizar({
    nome: '  Ana  ', senioridade: 'lenda', disponibilidade: 'nunca',
    modalidade: 'teletransporte', pretensao: -50, uf: 'são paulo',
  });
  assert.equal(n.nome, 'Ana');
  /* Campo nao informado fica VAZIO, nunca num padrao plausivel: a tela
     passaria a afirmar "Pleno" e "Presencial" sobre quem nunca respondeu
     isso, e ninguem consegue distinguir o que foi dito do que foi suposto.
     Foi o bug relatado — duas pessoas apareceram como Pleno/Presencial sem
     nunca terem preenchido esses campos (o formulario nem os tinha). */
  assert.equal(n.senioridade, '', 'opcao invalida virou um valor plausivel');
  assert.equal(n.disponibilidade, '');
  assert.equal(n.modalidade, '');

  const vazio = ctx._talentoNormalizar({ nome: 'Ana' });
  assert.equal(vazio.senioridade, '', 'campo ausente nao pode ganhar padrao');
  assert.equal(vazio.modalidade, '');
  assert.equal(vazio.disponibilidade, '');

  // O que a pessoa DE FATO informou continua entrando.
  const dito = ctx._talentoNormalizar({ nome: 'Ana', senioridade: 'senior', modalidade: 'remota' });
  assert.equal(dito.senioridade, 'senior');
  assert.equal(dito.modalidade, 'remota');
  assert.equal(n.pretensao, 0, 'pretensao negativa nao existe');
  assert.equal(n.uf.length, 2);

  /* SEM TRIAGEM NAO HA NOTA, e "sem nota" nao e zero. Number(null) vale 0 e
     Number.isFinite(0) e true: por isso todo talento guardado sem passar pela
     IA nascia com iaNota 0, e o banco mostrava 0% de compatibilidade para
     quem nunca foi lido — que e o mesmo numero de quem foi lido e reprovado. */
  assert.equal(vazio.iaNota, null, 'talento sem triagem nao pode nascer com nota 0');
  assert.equal(ctx._talentoNormalizar({ nome: 'Ana', iaNota: '' }).iaNota, null);
  assert.equal(ctx._talentoNormalizar({ nome: 'Ana', iaNota: 0 }).iaNota, 0,
    'zero DITO pela IA e uma nota, e tem de ficar');
  assert.equal(ctx._talentoNormalizar({ nome: 'Ana', iaNota: 87 }).iaNota, 87);
});

test('compatibilidade devolve nota E motivos', () => {
  /* Numero sozinho vira magica. Quem decide precisa ver o que bateu. */
  const r = montar().compatibilidadeTalentoVaga(talento(), vaga());
  assert.ok(r.nota > 0 && r.nota <= 100);
  assert.ok(Array.isArray(r.motivos) && r.motivos.length >= 3,
    'sem motivos a nota nao pode ser conferida');
  assert.ok(r.motivos.every(m => 'ok' in m && 'rotulo' in m));
});

test('quem bate em tudo pontua mais que quem nao bate em nada', () => {
  const ctx = montar();
  const bom = ctx.compatibilidadeTalentoVaga(talento(), vaga()).nota;
  const ruim = ctx.compatibilidadeTalentoVaga(talento({
    habilidades: 'jardinagem', area: 'Paisagismo', modalidade: 'presencial',
    cidade: 'Recife', pretensao: 90000,
  }), vaga()).nota;
  assert.ok(bom > ruim, 'a nota nao separa quem serve de quem nao serve');
  assert.ok(bom >= 80, 'quem bate em tudo deveria pontuar alto: ' + bom);
});

test('sinal que a vaga nao informou NAO penaliza ninguem', () => {
  /* Uma vaga sem faixa salarial nao pode derrubar a nota de quem tem
     pretensao. O que nao da para checar fica fora do denominador. */
  const ctx = montar();
  const semFaixa = vaga({ salarioMax: 0, cidade: '' });
  const a = ctx.compatibilidadeTalentoVaga(talento({ pretensao: 99000 }), semFaixa).nota;
  const b = ctx.compatibilidadeTalentoVaga(talento({ pretensao: 1000 }), semFaixa).nota;
  assert.equal(a, b, 'a pretensao mexeu na nota de uma vaga que nao tem faixa');
});

test('sem vaga, ou sem talento, nao sai numero — e nao quebra', () => {
  const ctx = montar();
  assert.equal(ctx.compatibilidadeTalentoVaga(null, vaga()).nota, null);
  assert.equal(ctx.compatibilidadeTalentoVaga(talento(), null).nota, null);
  assert.deepEqual([...ctx.compatibilidadeTalentoVaga(null, null).motivos], []);
});

/* ═══════════════════════════════════════════════════════════════════════
   0% E "NAO DA PARA COMPARAR" SAO COISAS DIFERENTES
   ═══════════════════════════════════════════════════════════════════════
   A ficha que vem do funil traz so o curriculo em anexo: habilidades, area,
   modalidade e cidade chegam em branco. Todos os sinais entravam no
   denominador, nenhum batia, e a tela dizia 0% — ao lado de uma nota de
   triagem de 85% na MESMA pessoa, na MESMA tela. Duas leituras opostas do
   mesmo curriculo, e a errada era o 0%: nao houve comparacao nenhuma.
   ═══════════════════════════════════════════════════════════════════════ */
test('perfil em branco nao vira 0% — vira "sem dados para comparar"', () => {
  const ctx = montar();
  const branco = { nome: 'Ana', habilidades: '', cargo: '', area: '',
                   cidade: '', modalidade: '', pretensao: 0, tags: [] };
  const r = ctx.compatibilidadeTalentoVaga(branco, vaga());
  assert.equal(r.nota, null, '0% diz "comparei e nao bateu", que e mentira aqui');
  assert.equal(r.semDados, true);
  assert.equal(r.motivos.length, 0, 'sem comparacao nao ha motivo a listar');
});

test('0% continua existindo para quem TEM perfil e nao bate em nada', () => {
  const ctx = montar();
  const oposto = ctx.compatibilidadeTalentoVaga(talento({
    habilidades: 'jardinagem', cargo: 'Jardineiro', area: 'Paisagismo',
    modalidade: 'presencial', cidade: 'Recife', pretensao: 0, tags: [],
  }), vaga({ salarioMax: 0 }));
  assert.equal(typeof oposto.nota, 'number', 'quem tem perfil precisa ser comparado');
  assert.ok(oposto.motivos.length > 0);
});

test('vaga que nao descreve nada tambem nao gera numero', () => {
  const ctx = montar();
  const r = ctx.compatibilidadeTalentoVaga(talento(), vaga({
    requisitos: '', desejaveis: '', area: '', departamento: '',
    modalidade: '', cidade: '', salarioMax: 0,
  }));
  assert.equal(r.nota, null, 'sem nada do lado da vaga, o 0% acusaria a pessoa');
});

test('modalidade so conta quando a vaga a informa', () => {
  /* Dois campos vazios se igualavam ('' === '') e a vaga mal preenchida dava
     o ponto de graca: a mesma pessoa valia MAIS numa vaga sem descricao. */
  const ctx = montar();
  const semModalidade = ctx.compatibilidadeTalentoVaga(
    talento({ modalidade: '' }), vaga({ modalidade: '' }));
  assert.equal(semModalidade.motivos.some(m => /modalidade/i.test(m.rotulo)), false);
});

test('a vaga sem comparacao possivel vai para o fim da lista', () => {
  /* Com zero ela subiria como "a pior", quando na verdade e a nao avaliada. */
  const ctx = montar({ vagas: [
    vaga({ id: 'vazia', status: 'aberta', requisitos: '', desejaveis: '',
           area: '', departamento: '', modalidade: '', cidade: '', salarioMax: 0 }),
    vaga({ id: 'boa', status: 'aberta' }),
  ] });
  const ordem = ctx.vagasCompativeis(talento(), 9).map(x => x.vaga.id);
  assert.deepEqual([...ordem], ['boa', 'vazia']);
});

test('a coluna da lista e a NOTA DA TRIAGEM, e nao "compatibilidade"', () => {
  /* Dois numeros com o mesmo nome na mesma tela se contradizem sem que
     ninguem consiga dizer qual esta errado. Sao perguntas diferentes: um le o
     curriculo contra a vaga da triagem, o outro le a ficha contra as vagas
     abertas. Os nomes tem de dizer isso. */
  assert.match(APP, /_appText\('app\.matchScore', 'Nota da triagem'\)/);
  const CAT = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
  assert.match(CAT, /'app\.matchScore': \['Nota da triagem'/,
    'o catalogo vence o fallback: sem mudar aqui, a tela segue dizendo Compatibilidade');
});

test('so vaga ABERTA entra na compatibilidade', () => {
  /* Sugerir uma vaga encerrada faria convidar alguem para um processo que
     ja acabou. */
  const ctx = montar({ vagas: [
    vaga({ id: 'v1', status: 'aberta' }),
    vaga({ id: 'v2', status: 'encerrada' }),
    vaga({ id: 'v3', status: 'cancelada' }),
  ] });
  const achadas = ctx.vagasCompativeis(talento(), 9).map(x => x.vaga.id);
  assert.deepEqual([...achadas], ['v1']);
});

test('convidar CRIA candidato e MANTEM o talento', () => {
  const corpo = recortar(APP, 'async function convidarTalentoParaVaga(');
  assert.match(corpo, /createRecord\(/, 'o convite nao cria candidatura');
  assert.match(corpo, /template: 'rh'/);
  assert.match(corpo, /vagaId: String\(vagaId\)/, 'o candidato nasce sem vaga ligada');
  assert.equal(/excluirTalento\(/.test(corpo), false,
    'o convite consome o talento — o banco se esvaziaria a cada processo');
  assert.match(corpo, /jaEsta/, 'convidar duas vezes criaria candidato duplicado');
  assert.match(corpo, /origem/, 'a origem da inscricao precisa ficar registrada');
});

test('talento sobrevive ao salvamento de notas', () => {
  /* Mesma armadilha das vagas: fbSet troca o no inteiro. A preservacao virou
     uma funcao so, chamada pelos quatro gravadores — antes eram quatro copias
     da mesma lista, e duas delas ja tinham ficado para tras. */
  const helper = recortar(APP, 'function _preservarRegistrosDoQuadro(');
  assert.match(helper, /_talentos/, 'a preservacao apagaria os talentos');
  const chamadas = APP.match(/(?<!function )_preservarRegistrosDoQuadro\(obj\)/g) || [];
  assert.equal(chamadas.length, 4, 'algum gravador do no das notas ficou de fora');
});

test('a lista pagina, e a busca tem debounce', () => {
  const painel = recortar(APP, 'function abrirBancoTalentos(');
  assert.match(painel, /setTimeout\([\s\S]{0,200}220\)/,
    'busca sem debounce redesenha a tabela a cada tecla');
  assert.ok(APP.includes('const TB_POR_PAGINA'), 'a lista nao pagina');
  const lista = recortar(APP, 'function _tbPintarLista(');
  assert.match(lista, /TB_POR_PAGINA/);
  assert.match(lista, /app\.noTalentYet/, 'falta o estado vazio');
});

test('o painel fecha por composedPath, e a tela e responsiva', () => {
  const painel = recortar(APP, 'function abrirBancoTalentos(');
  assert.match(painel, /composedPath/, 'o fechador voltou a depender de contains');
  assert.match(CSS, /\.tb-corpo\{[^}]*grid-template-columns:250px 1fr 320px/);
  assert.match(CSS, /@media\(max-width:1280px\)\{[\s\S]{0,200}\.tb-corpo\{grid-template-columns:1fr/,
    'em tela estreita as tres colunas precisam virar uma');
});

test('o botao do banco existe e so aparece no recrutamento', () => {
  assert.match(HTML, /id="crm-btn-talentos"[^>]*data-h="a50"/);
  assert.match(HTML, /id="crm-btn-talentos"[^>]*style="display:none"/);
  assert.match(APP, /'crm-btn-talentos'/,
    'o botao nao entra na lista do que e exclusivo do recrutamento');
});

/* ── Foto da pessoa ────────────────────────────────────────────────────── */


test('os cartoes do recrutamento nao tem minigrafico — o conceito nao tem', () => {
  assert.match(CSS, /#crm-view\.rh-modelo \.cdash-spark\{display:none/,
    'o minigrafico disputava espaco com o numero');
  assert.match(APP, /classList\.toggle\('rh-modelo'/,
    'sem a marca no container o CSS nao distingue os dois paineis');
});

/* ── Reprovar oferece o banco de talentos ──────────────────────────────── */

test('reprovar oferece guardar no banco, e vem marcado', () => {
  /* Reprovar e o melhor momento para guardar: e quando se sabe POR QUE a
     pessoa nao serviu, e e quando ela seria perdida. Vem marcado porque
     guardar nao custa nada e perder um bom curriculo custa o proximo
     processo. */
  const corpo = recortar(APP, 'function crmReprovarCandidato(');
  assert.match(corpo, /id="rh-rep-talento" checked/, 'a opcao sumiu ou nasce desmarcada');
  assert.match(corpo, /rh\.keepInPool/);
  assert.match(corpo, /guardarCandidatoNoBanco\(rec, motivo\)/,
    'a opcao existe mas nao faz nada');
  assert.match(corpo, /botao\.disabled/, 'clique duplo reprovaria duas vezes');
  assert.match(corpo, /rh\.rejectedAndKept/,
    'o aviso precisa dizer que a pessoa foi guardada, senao ninguem sabe');
});

test('guardar candidato NAO apaga o candidato', () => {
  /* Sao duas coisas com vidas diferentes: o candidato guarda o historico do
     processo (etapa, curriculo), o talento e a ficha de contato para o
     futuro. Fundir as duas perderia o processo. */
  const corpo = recortar(APP, 'async function guardarCandidatoNoBanco(');
  assert.equal(/removeNote\(|deleteRecord\(/.test(corpo), false,
    'guardar no banco apagou o candidato do funil');
  assert.match(corpo, /criarTalento\(/);
  assert.match(corpo, /observacao: motivo/,
    'o motivo da reprovacao e o que faltaria daqui a seis meses');
});

test('guardar duas vezes nao cria duas fichas', () => {
  const corpo = recortar(APP, 'async function guardarCandidatoNoBanco(');
  assert.match(corpo, /origemCandidatoId/, 'sem a origem, reprovar de novo duplicaria');
  assert.match(corpo, /jaTem/);
  /* E-mail como segunda chave: e o que identifica a pessoa entre processos
     diferentes, quando o id do candidato e outro. */
  assert.match(corpo, /t\.email[\s\S]{0,40}=== email/);
  assert.match(corpo, /atualizarTalento\(jaTem\.id/,
    'quem ja esta no banco deve ser atualizado, nao duplicado');

  const normal = recortar(APP, 'function _talentoNormalizar(');
  assert.match(normal, /origemCandidatoId/,
    'o normalizador descarta a origem e a protecao contra duplicata cai');
});

/* ── Foto: guardada no navegador, nao no banco ─────────────────────────── */

test('a foto NAO vai para o banco', () => {
  /* Ela ficava em base64 dentro do registro, e o registro viaja inteiro a
     cada leitura — o mesmo peso de download que passamos a semana cortando.
     Agora mora no IndexedDB, e no banco fica so o marcador. */
  const criar = recortar(APP, 'async function createRecord(');
  assert.match(criar, /photo:\s*'',/, 'a imagem voltou para o registro');
  assert.match(criar, /photoLocal:\s*!!data\.photoLocal/,
    'sem o marcador a tela nao sabe que ha foto a procurar');

  assert.equal((APP.match(/photo: '', photoLocal: !!_fotoAtual,/g) || []).length, 2,
    'criar e editar precisam mandar so o marcador');
});

test('remover a foto apaga do navegador, e nao so da tela', () => {
  /* O bug relatado: a imagem sumia do formulario e continuava na pessoa. */
  const modal = APP.slice(APP.indexOf('let _fotoAtual'));
  const trecho = modal.slice(0, modal.indexOf('async function criarVaga'));
  assert.match(trecho, /_fotoApagar\(saved\.id\)/,
    'sem apagar do IndexedDB a foto volta no proximo carregamento');
  assert.match(trecho, /_fotoSalvar\(saved\.id, _fotoAtual\)/);
  assert.match(trecho, /_fotoAtual = ''/, 'o botao Remover precisa limpar o valor');
});

test('o cartao nasce com a inicial e recebe a foto depois', () => {
  /* Buscar antes seguraria o funil inteiro esperando o disco para desenhar
     um circulo de 34px. */
  const cartao = recortar(RH, 'function _cartao(', '\n  }');
  assert.match(cartao, /esc\(inicial\)/, 'o cartao perdeu a inicial');
  assert.equal(/<img/.test(cartao), false,
    'o cartao voltou a montar a imagem no HTML — ela vem do IndexedDB depois');
  assert.match(RH, /global\.pintarFotosDosCartoes\(\)/,
    'ninguem busca as fotos depois de desenhar o funil');
});

test('a foto entra por propriedade, nunca por atributo escapado', () => {
  /* Foi assim que ela quebrou antes: sanitizeAttr troca "=" por "&#x3D;", e
     o padding do base64 termina em "=". Atribuir a .src nao passa por
     escape nenhum, e safePhotoUrlRaw ja barra esquema que nao seja
     data:image ou https. */
  const corpo = recortar(APP, 'async function pintarFotosDosCartoes(');
  assert.match(corpo, /img\.src = url/, 'a URL voltou para o atributo');
  assert.match(corpo, /safePhotoUrlRaw\(/, 'sem o saneador, qualquer esquema entraria');
  assert.equal(/sanitizeAttr\(/.test(corpo), false, 'escape em src de imagem quebra base64');
});

test('a foto guardada localmente avisa que nao sincroniza', () => {
  /* E o preco da leveza, e esconder isso faria a pessoa achar que perdeu a
     foto ao abrir noutro aparelho. */
  assert.match(APP, /app\.photoLocalWarn/, 'o aviso sumiu do formulario');
  assert.match(I18NJS, /'app\.photoLocalWarn'/, 'falta a chave no catalogo');
});

/* ── Triagem por IA: o campo aceita qualquer nome ──────────────────────── */

/* A VAGA DA TRIAGEM E UMA LISTA, E CONTINUA ACEITANDO NOME LIVRE.

   Era um <input list="…">, e o Chrome FILTRA as sugestoes pelo que ja esta
   escrito no campo. Como a janela chega com uma vaga sugerida, a setinha abria
   mostrando UMA opcao — a que ja estava la — e trocar de vaga exigia apagar o
   texto antes, o que ninguem adivinha. Com duas vagas cadastradas, so uma
   aparecia. O texto livre nao se perdeu: virou a ultima opcao da lista. */
test('a vaga da triagem e uma lista, com saida para nome livre', () => {
  const corpo = recortar(RH, 'function abrirTriagem(', '\n  }');
  assert.match(corpo, /<select class="m-inp" id="rh-ia-vaga-sel">/,
    'voltou a ser campo de texto: a lista some atras do filtro do Chrome');
  assert.equal(/list="rh-ia-vagas"/.test(corpo), false, 'o datalist tem de sumir');
  assert.match(corpo, /new Set\(listaVagas\.map\(v => v\.rotulo\)\)/,
    'nomes repetidos apareceriam duas vezes na lista');
  assert.match(corpo, /value="__outra"/, 'sumiu a saida para vaga nao cadastrada');
  assert.match(corpo, /id="rh-ia-vaga" maxlength="120"/,
    'sem o campo de texto, so daria para analisar vaga cadastrada');
  assert.match(corpo, /rh\.iaRoleFree/, 'sem a dica ninguem descobre o texto livre');

  // Sugestao que nao esta na lista nao pode selecionar a primeira opcao calada.
  assert.match(corpo, /sugeridaNaLista/);

  // Trocar de vaga troca os requisitos que vao para a IA — senao o relatorio
  // sai comparando o curriculo com os requisitos da OUTRA vaga.
  assert.match(corpo, /requisitosDe/);
  assert.match(corpo, /selVaga\.addEventListener\('change'/);
  assert.match(corpo, /ultimaSugestao/,
    'o que a pessoa escreveu a mao nao pode ser sobrescrito');
});

/* ── A compatibilidade e a nota da IA, guardada no card ────────────────── */

test('a compatibilidade sai da triagem, e nao de um calculo posterior', () => {
  /* A nota e a leitura do curriculo contra os requisitos daquela vaga, feita
     no momento da triagem. Recalcular depois seria outro numero, de outro
     contexto — e a pessoa ja pode nem estar no funil. */
  const ctx = vm.createContext({ Number, Math });
  vm.runInContext(recortar(APP, 'function notaIaDe('), ctx);

  assert.equal(ctx.notaIaDe({ iaNota: 87 }), 87);
  assert.equal(ctx.notaIaDe({ iaNota: '87' }), 87);
  assert.equal(ctx.notaIaDe({}), null, 'sem triagem NAO pode virar zero');
  assert.equal(ctx.notaIaDe({ iaNota: null }), null);
  assert.equal(ctx.notaIaDe({ iaNota: 'muito bom' }), null);
  assert.equal(ctx.notaIaDe({ iaNota: 140 }), null, 'nota fora da escala e dado corrompido');
  assert.equal(ctx.notaIaDe({ iaNota: -3 }), null);
});

test('quem nao tem nota mostra "—" e vai para o fim da lista', () => {
  /* Zero faria a pessoa parecer reprovada; primeiro na lista, faria parecer
     a melhor. Nenhuma das duas e verdade. */
  const lista = recortar(APP, 'function _tbVisiveis(');
  assert.match(lista, /notaIaDe\(t\)/, 'a lista voltou a calcular a nota na hora');
  assert.match(lista, /if \(a\.nota === null\) return 1/, 'sem nota precisa ir para o fim');

  const tabela = recortar(APP, 'function _tbPintarLista(');
  assert.match(tabela, /nota === null \? '—'/);
  assert.match(tabela, /app\.noAiScore/, 'falta dizer POR QUE nao ha nota');
});

test('a nota e gravada no card na hora da triagem', () => {
  const corpo = RH.slice(RH.indexOf('async function _gravarNotasDaTriagem('));
  const fim = corpo.slice(0, corpo.indexOf('\n  /* ── Avanco'));

  assert.match(fim, /updateRecord\(casam\[0\]\.id,\s*\{ iaNota: it\.nota/,
    'a nota nao e guardada no card');
  assert.match(fim, /casam\.length !== 1/,
    'nome ambiguo receberia a nota de outra pessoa');
  assert.equal(/it\.pos/.test(fim), false, 'voltou a casar por posicao');
  assert.match(RH, /await _gravarNotasDaTriagem\(r, escolhidos, vaga\)/,
    'a triagem nao grava as notas');
  /* A NOTA GUARDA DE QUAL VAGA ELA E. Sem isso, rodar a triagem de uma
     segunda vaga sobrescreve a nota da primeira, e o cartao passa a exibir um
     numero que nao diz mais respeito ao processo em que a pessoa esta — 88
     para Analista de Marketing vira 88 para Suporte Tecnico, e ninguem tem
     como perceber olhando a tela. */
  assert.match(fim, /iaNotaVaga: daVaga/, 'a nota perdeu a vaga de origem');
  assert.match(RH, /rh\.starHintVaga/,
    'a estrela do cartao voltou a mostrar a nota sem dizer de qual vaga e');
});

test('a nota viaja com a pessoa para o banco de talentos', () => {
  /* Ela nao sera lida de novo depois de sair do funil: se a nota nao for
     junto, o banco perde o unico numero defensavel sobre aquela pessoa. */
  const corpo = recortar(APP, 'async function guardarCandidatoNoBanco(');
  assert.match(corpo, /iaNota:\s+notaIaDe\(rec\)/);
  const normal = recortar(APP, 'function _talentoNormalizar(');
  assert.match(normal, /iaNota:/, 'o normalizador descarta a nota');
});

test('o cartao de alta compatibilidade so conta quem tem nota', () => {
  const cards = recortar(APP, 'function _tbPintarCards(');
  assert.match(cards, /notaIaDe\(t\) !== null/, 'contaria quem nunca foi triado');
  assert.match(cards, /app\.needsScreening/,
    'sem nota nenhuma, precisa dizer o que fazer em vez de mostrar zero');
});

test('a foto do FORMULARIO tambem entra por propriedade, sem escape', () => {
  /* Mesmo erro do cartao, na direcao oposta: aqui a URL vai para .src, que
     nao desescapa nada. safePhotoUrl ja aplica sanitizeAttr, e o padding do
     base64 termina em "=" — escapada, a imagem chega quebrada. O sintoma foi
     o icone de imagem rachada no circulo do formulario. */
  const modal = APP.slice(APP.indexOf('const _pintarFoto ='));
  const trecho = modal.slice(0, modal.indexOf('_fotoAlvo?.addEventListener'));
  assert.match(trecho, /safePhotoUrlRaw\(_fotoAtual\)/,
    'voltou a versao ja escapada — a imagem quebra no circulo');
  assert.match(trecho, /querySelector\('img'\)\.src = url/,
    'a URL precisa ir para a propriedade, nao para o atributo');
});
