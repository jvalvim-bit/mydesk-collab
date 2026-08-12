'use strict';

/*
 * Conversão segura de uma resposta pública de formulário em registro do CRM.
 *
 * A decisão de criar o cliente e o destino vêm exclusivamente da definição do
 * formulário, gravada pelo proprietário autenticado. O corpo público da
 * resposta nunca escolhe um workspace e nunca consegue ativar a integração.
 */

const INVALID_FIREBASE_KEY = /[.#$[\]/\u0000-\u001F\u007F]/;
const CRM_FIELDS = new Set([
  'name', 'email', 'phone', 'cpf', 'rg', 'birthDate', 'education',
  'maritalStatus', 'gender', 'nationality', 'profession', 'occupation',
  'motherName', 'fatherName', 'placeOfBirth', 'cep', 'address',
  'addressNumber', 'complement', 'neighborhood', 'city', 'uf', 'cnpj',
  'companyName', 'description',
  'clientType',
  /* `segment` entrou com o modelo de Clientes: um formulario pode perguntar o
     segmento diretamente, e a resposta vence o palpite tirado do nicho. Fora
     desta lista, o `crmCampo` e ignorado — e era o que acontecia com ele. */
  'segment',
]);

function text(value, max = 4000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizedWords(value) {
  return text(value, 160)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeFirebaseKey(value, max = 120) {
  const key = text(value, max);
  return key && !INVALID_FIREBASE_KEY.test(key) ? key : null;
}

function explicitCrmField(field) {
  const candidate = text(field?.crmCampo || field?.crmField, 40);
  return CRM_FIELDS.has(candidate) ? candidate : null;
}

function inferredCrmField(field) {
  const explicit = explicitCrmField(field);
  if (explicit) return explicit;

  const type = text(field?.tipo, 40).toLowerCase();
  const direct = {
    email: 'email',
    telefone: 'phone',
    phone: 'phone',
    cpf: 'cpf',
    rg: 'rg',
    nascimento: 'birthDate',
    birth_date: 'birthDate',
    escolaridade: 'education',
    education: 'education',
    estado_civil: 'maritalStatus',
    marital_status: 'maritalStatus',
    genero: 'gender',
    gender: 'gender',
    nacionalidade: 'nationality',
    nationality: 'nationality',
    profissao: 'profession',
    profession: 'profession',
    ocupacao: 'occupation',
    occupation: 'occupation',
    nome_mae: 'motherName',
    mother_name: 'motherName',
    nome_pai: 'fatherName',
    father_name: 'fatherName',
    naturalidade: 'placeOfBirth',
    place_of_birth: 'placeOfBirth',
    cep: 'cep',
    endereco: 'address',
    address: 'address',
    numero_endereco: 'addressNumber',
    address_number: 'addressNumber',
    complemento: 'complement',
    complement: 'complement',
    bairro: 'neighborhood',
    neighborhood: 'neighborhood',
    municipio: 'city',
    cidade: 'city',
    city: 'city',
    estado: 'uf',
    uf: 'uf',
    cnpj: 'cnpj',
    razao_social: 'companyName',
    company_name: 'companyName',
    longo: 'description',
  };
  if (direct[type]) return direct[type];

  /* O RÓTULO DECIDE quando o tipo não decide. As fichas por nicho geram quase
     tudo como `texto` — o campo "CPF" de uma ficha de psicologia é um texto
     com o rótulo "CPF" —, e sem olhar o rótulo esses dados chegavam à
     carteira em branco, com a pessoa tendo respondido tudo.

     A comparação é EXATA, sobre o rótulo normalizado. É o que impede "Estado
     civil" de virar o estado da federação e "Nome da mãe" de virar o nome do
     cliente: parecido não basta, tem de ser igual. */
  if (type === 'texto' || type === 'text' || type === 'numero' || type === 'number') {
    const rot = normalizedWords(field?.rotulo);
    const porRotulo = {
      cpf: 'cpf', rg: 'rg', cnpj: 'cnpj',
      cep: 'cep', 'codigo postal': 'cep', 'postal code': 'cep',
      cidade: 'city', municipio: 'city', city: 'city', ciudad: 'city',
      estado: 'uf', uf: 'uf', state: 'uf',
      endereco: 'address', address: 'address', direccion: 'address',
      'logradouro': 'address',
      bairro: 'neighborhood', neighborhood: 'neighborhood',
      numero: 'addressNumber', 'numero do endereco': 'addressNumber',
      complemento: 'complement', complement: 'complement',
      telefone: 'phone', celular: 'phone', phone: 'phone', telefono: 'phone',
      'e mail': 'email', email: 'email', correo: 'email',
      empresa: 'companyName', 'razao social': 'companyName',
      company: 'companyName', 'company name': 'companyName',
      profissao: 'profession', profession: 'profession',
      'nome da mae': 'motherName', 'nome do pai': 'fatherName',
      naturalidade: 'placeOfBirth', nacionalidade: 'nationality',
      escolaridade: 'education', 'estado civil': 'maritalStatus',
      segmento: 'segment', segment: 'segment', ramo: 'segment',
    };
    if (porRotulo[rot]) return porRotulo[rot];
  }

  // Formulários antigos usam "texto" para nome. O rótulo é analisado nas três
  // línguas suportadas, sem inferir outros dados sensíveis por texto livre.
  if (type === 'texto' || type === 'text') {
    const label = normalizedWords(field?.rotulo);
    if ([
      'nome', 'nome completo', 'name', 'full name', 'nombre', 'nombre completo',
      /* Variantes que aparecem em formulario feito a mao. A lista continua
         FECHADA de proposito: inferir por "comeca com nome" faria "Nome da
         empresa" e "Nome do responsavel" virarem o nome do cliente. */
      'seu nome', 'nome do cliente', 'nome e sobrenome', 'nome completo do cliente',
      'your name', 'client name', 'first and last name',
      'su nombre', 'nombre del cliente', 'nombre y apellido',
    ].includes(label)) return 'name';
  }
  return null;
}

function valueByCrmField(fields, values, crmField) {
  for (const field of fields) {
    if (inferredCrmField(field) !== crmField) continue;
    const value = text(values?.[field.id]);
    if (value) return value;
  }
  return '';
}

function dataUrlSize(dataUrl) {
  const payload = String(dataUrl || '').split(',', 2)[1] || '';
  if (!payload) return 0;
  const padding = (payload.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

function clientIdFromResponse(responseId) {
  const safe = safeFirebaseKey(responseId, 80);
  if (!safe) throw new Error('Identificador de resposta inválido para o CRM.');
  return `crm_${safe}`;
}

/* ── O modelo da ficha, e os campos dele ────────────────────────────────
   Quando o formulário nasce de um modelo de nicho, cada campo criado por ele
   carrega a chave da ficha no próprio id, com o prefixo `n_`. É esse elo que
   faz a resposta cair no campo certo em vez de virar texto solto.

   O caminho MANUAL ("Respostas" → "virar cliente") já fazia isso no navegador,
   com o catálogo de nichos à mão. O caminho AUTOMÁTICO — este — não fazia, e o
   resultado era um candidato que chegava sem `template` e portanto NÃO aparecia
   no funil de recrutamento: a pessoa se candidatava, a ficha era criada, e ela
   não estava em lugar nenhum que se olhasse. Dois caminhos para o mesmo destino
   com resultados diferentes é o tipo de divergência que ninguém percebe até
   procurar alguém que sumiu.

   Aqui não há catálogo de nichos — ele mora em docs/js/nichos.js, que é do
   navegador. Não precisa: a própria DEFINIÇÃO do formulário já traz o que é
   necessário. A chave da ficha sai do id do campo, e o que é etiqueta de estado
   se reconhece por ser uma das `opcoes` daquele campo de seleção. */
function templateFields(form, values) {
  const nicho = text(form?.nicho, 40);
  if (!nicho) return null;
  const fields = Array.isArray(form?.campos) ? form.campos.slice(0, 50) : [];
  const campos = {};
  fields.forEach(field => {
    const id = String(field?.id || '');
    if (!id.startsWith('n_')) return;
    const chave = id.slice(2);
    if (!chave) return;
    const valor = text(values?.[id]);
    if (!valor) return;
    const opcoes = Array.isArray(field?.opcoes) ? field.opcoes.map(String) : [];
    // Campo com etiqueta: o que a pessoa escolheu É a etiqueta de estado.
    if (opcoes.length && opcoes.includes(valor)) campos[`${chave}__selo`] = valor;
    else campos[chave] = valor;
  });
  return { template: nicho, campos };
}

/* A primeira resposta de texto com conteudo. Serve de nome quando nada mais
   identifica o cliente: e o que a pessoa efetivamente escreveu, e uma linha
   com "Preciso de orcamento para 3 salas" e mais util do que uma com
   "Sem nome". Datas, arquivos e escolhas ficam de fora — "2026-08-05" nao
   nomeia ninguem. */
function primeiraResposta(fields, values) {
  const forade = ['data', 'date', 'arquivo', 'file', 'checkbox', 'radio', 'select'];
  for (const field of fields) {
    const tipo = text(field?.tipo, 40).toLowerCase();
    if (forade.includes(tipo)) continue;
    const valor = text(values?.[field?.id], 60);
    if (valor) return valor;
  }
  return '';
}

/* ═══════════════════════════════════════════════════════════════════════
   O SEGMENTO VEM DA FICHA
   ═══════════════════════════════════════════════════════════════════════
   Quem monta um formulario de psicologia ja disse a que ramo ele pertence —
   pedir de novo, num campo de segmento, e perguntar o que a pessoa acabou de
   responder. E quem responde nao tem como saber: "segmento" e um dado do
   negocio de quem recebe, e nao de quem preenche. Por isso o cliente que
   entra por uma ficha ESPECIALIZADA ja nasce com o segmento dela.

   A ficha generica fica de fora de proposito: ela nao diz ramo nenhum, e
   chutar um seria pior do que deixar em branco para preencher a mao.
   O `rh` tambem: candidato de vaga nao e cliente de segmento. */
const SEGMENTO_DO_NICHO = Object.freeze({
  advocacia:     'juridico',
  atendimento:   'servicos',
  automotivo:    'servicos',
  comercio:      'varejo',
  consultoria:   'consultoria',
  contabilidade: 'contabilidade',
  educacao:      'educacao',
  estetica:      'saude',
  eventos:       'servicos',
  financeiro:    'contabilidade',
  fitness:       'saude',
  imobiliaria:   'servicos',
  logistica:     'servicos',
  manutencao:    'servicos',
  marketing:     'marketing',
  nutricao:      'saude',
  obra:          'servicos',
  odontologia:   'saude',
  psicologia:    'saude',
  saude:         'saude',
  seguros:       'servicos',
  tecnologia:    'tecnologia',
  veterinaria:   'saude',
});

/* A data em texto, sem passar por fuso: `toISOString()` num horario da noite
   no Brasil ja devolve o dia seguinte. */
function isoDoDia(ms) {
  const d = new Date(Number(ms) || Date.now());
  return d.getUTCFullYear() + '-'
    + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(d.getUTCDate()).padStart(2, '0');
}

/* Os segmentos que a carteira conhece. Guardar qualquer texto aqui seria
   guardar um dado que a tela nao sabe ler: o rotulo sai de uma lista, e o que
   nao casa com ela aparece como "Nao informado" — dado gravado e invisivel e
   pior do que dado ausente, porque parece que se perdeu. */
const SEGMENTOS = Object.freeze({
  tecnologia: 'tecnologia', technology: 'tecnologia', tecnologia_da_informacao: 'tecnologia',
  consultoria: 'consultoria', consulting: 'consultoria',
  saude: 'saude', health: 'saude', saude_e_bem_estar: 'saude',
  juridico: 'juridico', legal: 'juridico', advocacia: 'juridico', direito: 'juridico',
  educacao: 'educacao', education: 'educacao', ensino: 'educacao',
  varejo: 'varejo', retail: 'varejo', comercio: 'varejo', loja: 'varejo',
  marketing: 'marketing', publicidade: 'marketing',
  contabilidade: 'contabilidade', accounting: 'contabilidade', financeiro: 'contabilidade',
  servicos: 'servicos', services: 'servicos', servico: 'servicos',
  ecommerce: 'ecommerce', 'e commerce': 'ecommerce', 'comercio eletronico': 'ecommerce',
  pessoafisica: 'pessoafisica', 'pessoa fisica': 'pessoafisica',
  outro: 'outro', outros: 'outro', other: 'outro',
});

function segmentoConhecido(valor) {
  const v = normalizedWords(valor).replace(/ /g, '_');
  if (SEGMENTOS[v]) return SEGMENTOS[v];
  const semUnderscore = normalizedWords(valor);
  return SEGMENTOS[semUnderscore] || '';
}

/* ═══════════════════════════════════════════════════════════════════════
   PESSOA FISICA OU JURIDICA
   ═══════════════════════════════════════════════════════════════════════
   A RESPOSTA decide antes do palpite: quem escreveu um CNPJ e pessoa
   juridica, quem escreveu um CPF e pessoa fisica. Isso e fato, e nao
   inferencia — e vale mais do que qualquer coisa que se saiba sobre o ramo.

   So quando a resposta nao diz e que a ficha opina, e apenas onde ela e
   inequivoca: psicologo, dentista e nutricionista atendem PESSOAS; agencia,
   contabilidade e software atendem EMPRESAS. Imobiliaria, seguros e educacao
   atendem os dois todo dia, entao ficam em branco — chutar ali erraria
   metade das vezes, e um campo errado e pior do que um campo vazio, porque o
   vazio pede para ser preenchido e o errado nao. */
const TIPO_DO_NICHO = Object.freeze({
  psicologia: 'pf', odontologia: 'pf', saude: 'pf', nutricao: 'pf',
  estetica: 'pf', fitness: 'pf', veterinaria: 'pf',
  marketing: 'pj', tecnologia: 'pj', contabilidade: 'pj', logistica: 'pj',
});

function tipoDoCliente(form, values, fields, cnpj, cpf) {
  if (cnpj) return 'pj';
  if (cpf) return 'pf';
  const respondido = normalizedWords(valueByCrmField(fields, values, 'clientType'));
  if (['pessoa juridica', 'juridica', 'empresa', 'pj', 'company'].includes(respondido)) return 'pj';
  if (['pessoa fisica', 'fisica', 'pf', 'individual'].includes(respondido)) return 'pf';
  return TIPO_DO_NICHO[text(form?.nicho, 40).toLowerCase()] || '';
}

function segmentoDoFormulario(form, values, fields) {
  /* Um campo de segmento respondido vence o palpite da ficha: se alguem
     perguntou, a resposta e melhor do que a inferencia. Mas so quando ela
     casa com um segmento que a carteira conhece — "Padaria do Ze" e uma
     resposta valida para uma pessoa e nao e um segmento. */
  const respondido = segmentoConhecido(valueByCrmField(fields, values, 'segment'));
  if (respondido) return respondido;
  const nicho = text(form?.nicho, 40).toLowerCase();
  return SEGMENTO_DO_NICHO[nicho] || '';
}

function clientFromResponse(form, response, responseId, now = Date.now()) {
  const fields = Array.isArray(form?.campos) ? form.campos.slice(0, 50) : [];
  const values = response?.valores && typeof response.valores === 'object'
    ? response.valores
    : {};
  const id = clientIdFromResponse(responseId);
  const get = crmField => valueByCrmField(fields, values, crmField);
  const cnpj = get('cnpj');
  const companyName = get('companyName');

  const customFields = fields.map((field, index) => ({
    id: text(field?.id || `campo_${index + 1}`, 80),
    type: text(field?.tipo || 'texto', 40),
    label: text(field?.rotulo || '', 120),
    value: text(values?.[field?.id]),
  }));

  const documents = [];
  if (response?.arquivo?.dataUrl) {
    documents.push({
      name: text(response.arquivo.name || 'arquivo', 120),
      type: text(response.arquivo.type || '', 80),
      size: dataUrlSize(response.arquivo.dataUrl),
      dataUrl: String(response.arquivo.dataUrl),
    });
  }

  /* A ficha do nicho entra ANTES do resto para o modelo ficar declarado; sem
     `template`, o registro é invisível no funil de recrutamento. O checklist
     não é semeado aqui de propósito: as etapas vivem no catálogo do navegador,
     e uma ficha sem checklist já cai na primeira coluna do funil, que é
     exatamente onde um candidato recém-inscrito deve estar. */
  const doModelo = templateFields(form, values);

  return {
    id,
    type: 'client',
    template: doModelo ? doModelo.template : '',
    campos: doModelo ? doModelo.campos : {},
    /* NOME DE VERDADE, e nao "Sem nome". O campo de nome so e reconhecido por
       um conjunto fechado de rotulos; um formulario que pergunte "Como podemos
       te chamar?" nao casa com nenhum, e o cliente entrava na carteira sem
       nome nenhum — uma linha que nao da para identificar e que parece ter
       aparecido sozinha.
       Entao, na falta do nome: a empresa, a primeira coisa que a pessoa
       escreveu, o e-mail e o telefone. A resposta escrita vem antes do
       e-mail de proposito — num formulario de cadastro o primeiro campo de
       texto quase sempre E o nome, e "Marina Souza" identifica melhor na
       lista do que "marina@exemplo.com". */
    name: get('name') || companyName || primeiraResposta(fields, values)
          || get('email') || get('phone') || 'Sem nome',
    description: get('description'),
    value: 0,
    status: 'pending',
    dueDate: '',
    email: get('email'),
    phone: get('phone'),
    cpf: get('cpf'),
    rg: get('rg'),
    birthDate: get('birthDate'),
    education: get('education'),
    maritalStatus: get('maritalStatus'),
    gender: get('gender'),
    nationality: get('nationality'),
    profession: get('profession'),
    occupation: get('occupation'),
    motherName: get('motherName'),
    fatherName: get('fatherName'),
    placeOfBirth: get('placeOfBirth'),
    cep: get('cep'),
    address: get('address'),
    addressNumber: get('addressNumber'),
    complement: get('complement'),
    neighborhood: get('neighborhood'),
    city: get('city'),
    uf: get('uf').toUpperCase().slice(0, 2),
    company: cnpj || companyName ? { cnpj, razaoSocial: companyName } : null,
    documents,
    createdAt: now,
    updatedAt: now,
    /* O que o modelo de Clientes pergunta. Sem isto, um cliente que entrou por
       formulario chegava a carteira com metade da ficha em branco — e a
       pessoa ja tinha respondido tudo. */
    segment: segmentoDoFormulario(form, values, fields),
    clientType: tipoDoCliente(form, values, fields, cnpj, get('cpf')),
    relationshipStatus: 'ativo',
    priority: 'media',
    tags: [],
    /* A data de hoje como primeiro e ultimo contato: a resposta E um contato,
       e deixar "nunca contatado" num cliente que acabou de escrever seria
       falso. */
    firstContactAt: isoDoDia(now),
    lastContactAt: isoDoDia(now),
    nextContactAt: '',
    satisfaction: 0,
    favorite: false,
    archived: false,
    interactions: [{
      id: 'int_' + String(responseId).slice(-12),
      tipo: 'formulario',
      data: isoDoDia(now),
      hora: '',
      autor: '',
      texto: text(form?.titulo, 120) || 'Formulário respondido',
      em: now,
    }],
    observations: [],
    color: 'indigo',
    sourceNoteId: null,
    sourceFormId: text(form?.id, 80),
    sourceResponseId: text(responseId, 80),
    /* A FOTO NÃO ENTRA AQUI — só o aviso de que existe uma.

       Ela está na resposta, em base64. Copiá-la para a ficha poria a imagem
       dentro de um registro que viaja inteiro a cada leitura do quadro, que é
       exatamente o custo de download que fez a foto sair do banco no resto do
       app. Com este marcador, o navegador de quem recruta sabe que vale a
       pena ir buscá-la uma vez em `forms/{id}/respostas/{rid}/foto` e guardá-la
       no IndexedDB dele. Sem marcador, ele não pergunta nada. */
    fotoResposta: !!response?.foto,
    sourceFormTitle: text(form?.titulo, 120),
    formData: customFields,
  };
}

function normalizeDestination(form) {
  // Importante: `true` estrito. "true", 1 ou qualquer valor vindo do POST
  // público não habilitam a integração.
  if (form?.criarCliente !== true) return null;
  const configured = form.crmDestino && typeof form.crmDestino === 'object'
    ? form.crmDestino
    : {};
  const aliases = {
    pessoal: 'pessoal',
    personal: 'pessoal',
    personal_default: 'pessoal',
    workspace_pessoal: 'workspace_pessoal',
    personal_workspace: 'workspace_pessoal',
    workspace_1a1: 'workspace_1a1',
    shared: 'workspace_1a1',
    grupo: 'grupo',
    group: 'grupo',
  };
  const type = aliases[text(configured.tipo || 'pessoal', 40).toLowerCase()];
  if (!type) throw new Error('Destino do CRM inválido.');
  const id = type === 'pessoal' ? null : safeFirebaseKey(configured.id);
  if (type !== 'pessoal' && !id) throw new Error('Identificador do destino do CRM inválido.');
  return { type, id };
}

async function resolveClientDestination(form, dbGet) {
  const destination = normalizeDestination(form);
  if (!destination) return null;
  if (typeof dbGet !== 'function') throw new TypeError('dbGet é obrigatório.');

  const ownerUid = safeFirebaseKey(form?.owner, 128);
  if (!ownerUid) throw new Error('Proprietário do formulário inválido.');
  if (destination.type === 'pessoal') {
    return { path: `users/${ownerUid}/notes`, type: destination.type };
  }

  if (destination.type === 'workspace_pessoal') {
    const meta = await dbGet(`users/${ownerUid}/personalBoardsMeta/${destination.id}`);
    if (!meta) throw new Error('Workspace pessoal não existe mais.');
    return {
      path: `users/${ownerUid}/personalBoards/${destination.id}/notes`,
      type: destination.type,
    };
  }

  // Para destinos colaborativos, o @ atual é derivado do índice protegido por
  // UID. Não confiamos em ownerUser armazenado na definição nem no respondente.
  const ownerUsername = safeFirebaseKey(await dbGet(`uids/${ownerUid}`), 80);
  if (!ownerUsername) throw new Error('Usuário proprietário não foi encontrado.');

  if (destination.type === 'workspace_1a1') {
    const [member, status] = await Promise.all([
      dbGet(`shared_boards/${destination.id}/members/${ownerUsername}`),
      dbGet(`shared_boards/${destination.id}/status`),
    ]);
    if (member !== true || status !== 'active') {
      throw new Error('O workspace 1:1 não está ativo para o proprietário.');
    }
    return {
      path: `shared_boards/${destination.id}/notes`,
      type: destination.type,
    };
  }

  const [member, owner] = await Promise.all([
    dbGet(`groups/${destination.id}/members/${ownerUsername}`),
    dbGet(`groups/${destination.id}/owner`),
  ]);
  if (member !== true && owner !== ownerUsername) {
    throw new Error('O proprietário não participa mais do grupo.');
  }
  return {
    path: `group_boards/${destination.id}/notes`,
    type: destination.type,
  };
}

module.exports = {
  clientFromResponse,
  clientIdFromResponse,
  inferredCrmField,
  normalizeDestination,
  resolveClientDestination,
  safeFirebaseKey,
};
