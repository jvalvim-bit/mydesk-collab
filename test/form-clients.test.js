'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clientFromResponse,
  inferredCrmField,
  normalizeDestination,
  resolveClientDestination,
} = require('../lib/form-clients');

test('só a configuração autenticada do formulário habilita Clientes', () => {
  assert.equal(normalizeDestination({ criarCliente: false }), null);
  assert.equal(normalizeDestination({ criarCliente: 'true' }), null);
  assert.deepEqual(normalizeDestination({ criarCliente: true }), {
    type: 'pessoal',
    id: null,
  });
  assert.throws(() => normalizeDestination({
    criarCliente: true,
    crmDestino: { tipo: 'grupo', id: '../outro-usuario' },
  }), /identificador/i);
});

test('resolve o destino sem confiar no ownerUser salvo no formulário', async () => {
  const reads = [];
  const data = {
    'uids/uid-1': 'alice',
    'shared_boards/alice__bob/members/alice': true,
    'shared_boards/alice__bob/status': 'active',
  };
  const dbGet = async path => {
    reads.push(path);
    return data[path] ?? null;
  };
  const result = await resolveClientDestination({
    owner: 'uid-1',
    ownerUser: 'mallory',
    criarCliente: true,
    crmDestino: { tipo: 'workspace_1a1', id: 'alice__bob' },
  }, dbGet);

  assert.deepEqual(result, {
    path: 'shared_boards/alice__bob/notes',
    type: 'workspace_1a1',
  });
  assert.ok(reads.includes('uids/uid-1'));
  assert.ok(reads.includes('shared_boards/alice__bob/members/alice'));
  assert.ok(!reads.some(path => path.includes('mallory')));
});

test('recusa destino colaborativo do qual o proprietário não participa', async () => {
  const dbGet = async path => ({
    'uids/uid-1': 'alice',
    'groups/grupo-1/members/alice': null,
    'groups/grupo-1/owner': 'bob',
  })[path] ?? null;

  await assert.rejects(resolveClientDestination({
    owner: 'uid-1',
    criarCliente: true,
    crmDestino: { tipo: 'grupo', id: 'grupo-1' },
  }, dbGet), /não participa/i);
});

test('converte todos os dados reconhecidos e preserva os campos do formulário', () => {
  const form = {
    id: 'form_abc123',
    titulo: 'Cadastro',
    campos: [
      { id: 'n', tipo: 'texto', rotulo: 'Nombre completo' },
      { id: 'e', tipo: 'email', rotulo: 'Correo' },
      { id: 't', tipo: 'telefone', rotulo: 'Teléfono' },
      { id: 'cpf', tipo: 'cpf', rotulo: 'CPF' },
      { id: 'nasc', tipo: 'nascimento', rotulo: 'Nascimento' },
      { id: 'prof', tipo: 'texto', rotulo: 'Profissão', crmCampo: 'profession' },
      { id: 'extra', tipo: 'texto', rotulo: 'Como conheceu o MyDesk?' },
    ],
  };
  const response = {
    valores: {
      n: 'Ana Pérez',
      e: 'ana@example.com',
      t: '+55 11 99999-0000',
      cpf: '529.982.247-25',
      nasc: '1990-04-03',
      prof: 'Arquiteta',
      extra: 'Indicação',
    },
    arquivo: {
      name: 'identidade.pdf',
      type: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,QUJDRA==',
    },
  };

  const client = clientFromResponse(form, response, '-NxPushId', 1234);
  assert.equal(client.id, 'crm_-NxPushId');
  assert.equal(client.name, 'Ana Pérez');
  assert.equal(client.email, 'ana@example.com');
  assert.equal(client.phone, '+55 11 99999-0000');
  assert.equal(client.profession, 'Arquiteta');
  assert.equal(client.birthDate, '1990-04-03');
  assert.equal(client.sourceFormId, 'form_abc123');
  assert.equal(client.sourceResponseId, '-NxPushId');
  assert.equal(client.createdAt, 1234);
  assert.equal(client.documents[0].size, 4);
  assert.deepEqual(
    client.formData.find(field => field.id === 'extra'),
    {
      id: 'extra',
      type: 'texto',
      label: 'Como conheceu o MyDesk?',
      value: 'Indicação',
    },
  );
});

test('inferência de nome funciona em português, inglês e espanhol', () => {
  assert.equal(inferredCrmField({ tipo: 'texto', rotulo: 'Nome completo' }), 'name');
  assert.equal(inferredCrmField({ tipo: 'texto', rotulo: 'Full name' }), 'name');
  assert.equal(inferredCrmField({ tipo: 'texto', rotulo: 'Nombre completo' }), 'name');
  assert.equal(inferredCrmField({ tipo: 'texto', rotulo: 'Observações' }), null);
});

test('resposta sem campo de nome nao vira cliente "Sem nome"', () => {
  /* O campo de nome so e reconhecido por um conjunto fechado de rotulos. Um
     formulario que pergunte "Como podemos te chamar?" nao casa com nenhum, e
     o cliente entrava na carteira sem nome — uma linha que nao da para
     identificar e que parece ter aparecido sozinha. */
  const form = {
    campos: [
      { id: 'q1', tipo: 'texto', rotulo: 'Como podemos te chamar?' },
      { id: 'q2', tipo: 'email', rotulo: 'Seu e-mail' },
    ],
  };
  const cliente = clientFromResponse(form, {
    valores: { q1: 'Marina Souza', q2: 'marina@exemplo.com' },
  }, 'resp_1');
  assert.equal(cliente.name, 'Marina Souza', 'perdeu o que a pessoa escreveu');
});

test('sem nada de texto, cai no e-mail antes de cair no reserva', () => {
  const form = { campos: [{ id: 'e', tipo: 'email', rotulo: 'E-mail' }] };
  const cliente = clientFromResponse(form, { valores: { e: 'a@b.com' } }, 'r2');
  assert.equal(cliente.name, 'a@b.com');
});

test('data e arquivo nao servem de nome', () => {
  /* "2026-08-05" nao nomeia ninguem. */
  const form = {
    campos: [
      { id: 'd', tipo: 'data', rotulo: 'Quando' },
      { id: 't', tipo: 'texto', rotulo: 'Assunto' },
    ],
  };
  const cliente = clientFromResponse(form, {
    valores: { d: '2026-08-05', t: 'Orçamento para 3 salas' },
  }, 'r3');
  assert.equal(cliente.name, 'Orçamento para 3 salas');
});

test('os rotulos comuns de nome sao reconhecidos, e "nome da empresa" NAO', () => {
  /* Inferir por "comeca com nome" faria "Nome da empresa" virar o nome do
     cliente. */
  const nome = r => clientFromResponse(
    { campos: [{ id: 'x', tipo: 'texto', rotulo: r }] },
    { valores: { x: 'Acme Ltda' } }, 'r4').name;
  ['Seu nome', 'Nome do cliente', 'Your name', 'Nombre del cliente']
    .forEach(r => assert.equal(nome(r), 'Acme Ltda', r));
  // Este continua caindo na reserva (a primeira resposta), e nao no campo name.
  const c = clientFromResponse({
    campos: [
      { id: 'emp', tipo: 'texto', rotulo: 'Nome da empresa' },
      { id: 'p', tipo: 'texto', rotulo: 'Nome completo' },
    ],
  }, { valores: { emp: 'Acme Ltda', p: 'Marina Souza' } }, 'r5');
  assert.equal(c.name, 'Marina Souza', 'o nome da empresa virou o nome da pessoa');
});

test('o mesmo envio sempre gera o MESMO cliente', () => {
  /* O id sai da resposta: sem isso, cada releitura criaria um cliente novo. */
  const form = { campos: [{ id: 'n', tipo: 'texto', rotulo: 'Nome' }] };
  const a = clientFromResponse(form, { valores: { n: 'X' } }, 'resp_abc');
  const b = clientFromResponse(form, { valores: { n: 'X' } }, 'resp_abc');
  assert.equal(a.id, b.id);
  assert.match(a.id, /^crm_/);
});

/* ═══════════════════════════════════════════════════════════════════════
   A FICHA ESPECIALIZADA CHEGA INTEIRA NA CARTEIRA
   ═══════════════════════════════════════════════════════════════════════
   As fichas por nicho geram quase tudo como `texto`: o campo "CPF" de uma
   ficha de psicologia e um texto com o rotulo "CPF". Como o mapeamento so
   olhava o TIPO, esses dados chegavam em branco — com a pessoa tendo
   respondido tudo.
   ═══════════════════════════════════════════════════════════════════════ */
const FICHA = {
  nicho: 'psicologia', titulo: 'Ficha de anamnese',
  campos: [
    { id: 'c1', tipo: 'texto', rotulo: 'Nome completo' },
    { id: 'c2', tipo: 'email', rotulo: 'E-mail' },
    { id: 'c3', tipo: 'telefone', rotulo: 'Telefone' },
    { id: 'n_cpf', tipo: 'texto', rotulo: 'CPF' },
    { id: 'n_cep', tipo: 'texto', rotulo: 'CEP' },
    { id: 'n_end', tipo: 'texto', rotulo: 'Endereço' },
    { id: 'n_cid', tipo: 'texto', rotulo: 'Cidade' },
    { id: 'n_uf', tipo: 'texto', rotulo: 'Estado' },
    { id: 'n_ec', tipo: 'texto', rotulo: 'Estado civil' },
  ],
};
const RESPOSTA = { valores: {
  c1: 'João Victor', c2: 'j@h.com', c3: '98933005417',
  n_cpf: '123.456.789-00', n_cep: '65000-000', n_end: 'Rua A, 10',
  n_cid: 'São Luís', n_uf: 'MA', n_ec: 'Solteiro',
} };

test('os campos cadastrais da ficha chegam preenchidos', () => {
  const c = clientFromResponse(FICHA, RESPOSTA, 'r_ficha');
  assert.equal(c.cpf, '123.456.789-00');
  assert.equal(c.cep, '65000-000');
  assert.equal(c.address, 'Rua A, 10');
  assert.equal(c.city, 'São Luís');
  assert.equal(c.uf, 'MA');
});

test('"Estado civil" NAO vira o estado da federacao', () => {
  /* A comparacao e exata sobre o rotulo normalizado: parecido nao basta. */
  const c = clientFromResponse(FICHA, RESPOSTA, 'r_ec');
  assert.equal(c.uf, 'MA');
  assert.equal(c.maritalStatus, 'Solteiro');
});

test('"Nome da mae" NAO vira o nome do cliente', () => {
  const c = clientFromResponse({
    campos: [
      { id: 'm', tipo: 'texto', rotulo: 'Nome da mãe' },
      { id: 'n', tipo: 'texto', rotulo: 'Nome completo' },
    ],
  }, { valores: { m: 'Maria', n: 'João' } }, 'r_mae');
  assert.equal(c.name, 'João');
  assert.equal(c.motherName, 'Maria');
});

test('o segmento vem da ficha especializada', () => {
  /* Quem monta um formulario de psicologia ja disse a que ramo ele pertence.
     E quem responde nao teria como saber: "segmento" e dado do negocio de
     quem recebe, e nao de quem preenche. */
  assert.equal(clientFromResponse(FICHA, RESPOSTA, 'r1').segment, 'saude');
  assert.equal(clientFromResponse({ nicho: 'advocacia', campos: [] }, {}, 'r2').segment, 'juridico');
  assert.equal(clientFromResponse({ nicho: 'tecnologia', campos: [] }, {}, 'r3').segment, 'tecnologia');
  assert.equal(clientFromResponse({ nicho: 'comercio', campos: [] }, {}, 'r4').segment, 'varejo');
});

test('a ficha simples e a de vaga NAO chutam segmento', () => {
  /* A generica nao diz ramo nenhum, e chutar um seria pior do que deixar em
     branco para preencher a mao. Candidato de vaga nao e cliente de
     segmento. */
  assert.equal(clientFromResponse({ nicho: 'generico', campos: [] }, {}, 'r5').segment, '');
  assert.equal(clientFromResponse({ nicho: '', campos: [] }, {}, 'r6').segment, '');
  assert.equal(clientFromResponse({ nicho: 'rh', campos: [] }, {}, 'r7').segment, '');
});

test('um campo de segmento respondido vence o palpite da ficha', () => {
  /* Se alguem perguntou, a resposta e melhor do que a inferencia. */
  const c = clientFromResponse({
    nicho: 'psicologia',
    campos: [{ id: 'sg', tipo: 'texto', rotulo: 'Segmento', crmCampo: 'segment' }],
  }, { valores: { sg: 'educacao' } }, 'r8');
  assert.equal(c.segment, 'educacao');
});

test('o cliente nasce com os campos que a carteira le', () => {
  /* Sem isto, quem entrou por formulario chegava com metade da ficha em
     branco. E a resposta E um contato: deixar "nunca contatado" em quem
     acabou de escrever seria falso. */
  const c = clientFromResponse(FICHA, RESPOSTA, 'r9', Date.UTC(2026, 7, 5, 12));
  assert.equal(c.relationshipStatus, 'ativo');
  assert.equal(c.priority, 'media');
  assert.equal(c.lastContactAt, '2026-08-05');
  assert.equal(c.firstContactAt, '2026-08-05');
  assert.deepEqual(c.tags, []);
  assert.equal(c.archived, false);
  assert.equal(c.interactions.length, 1);
  assert.equal(c.interactions[0].tipo, 'formulario');
  assert.equal(c.interactions[0].texto, 'Ficha de anamnese');
});

test('a data do contato nao passa por fuso', () => {
  /* `toISOString()` num horario da noite no Brasil ja devolve o dia
     seguinte. */
  const c = clientFromResponse(FICHA, RESPOSTA, 'r10', Date.UTC(2026, 7, 5, 23, 30));
  assert.equal(c.lastContactAt, '2026-08-05');
});

test('segmento respondido em texto livre nao vira dado invisivel', () => {
  /* O rotulo sai de uma lista fechada: o que nao casa com ela aparece como
     "Nao informado" — dado gravado e invisivel e pior do que dado ausente,
     porque parece que se perdeu. */
  const comCampo = (valor, nicho) => clientFromResponse({
    nicho: nicho || 'psicologia',
    campos: [{ id: 'sg', tipo: 'texto', rotulo: 'Segmento' }],
  }, { valores: { sg: valor } }, 'r_' + valor).segment;

  assert.equal(comCampo('educacao'), 'educacao');
  assert.equal(comCampo('Educação'), 'educacao', 'acento e maiuscula deviam casar');
  assert.equal(comCampo('Tecnologia'), 'tecnologia');
  assert.equal(comCampo('Comércio'), 'varejo');
  /* Resposta que nao e segmento cai no palpite da ficha, e nao no lixo. */
  assert.equal(comCampo('Padaria do Zé'), 'saude');
  assert.equal(comCampo('Padaria do Zé', 'generico'), '');
});

test('o cliente que entra por formulario aparece TAMBEM no financeiro', () => {
  /* E o mesmo registro: a carteira e a tabela de cobranca leem a mesma lista.
     Ele nasce com valor zero, em aberto e sem vencimento — os campos que o
     avaliador vai preencher depois, quando houver o que cobrar. Nascer "pago"
     ou com vencimento inventado seria escrever no lugar dele. */
  const c = clientFromResponse(FICHA, RESPOSTA, 'r_fin');
  assert.equal(c.type, 'client');
  assert.equal(c.value, 0);
  assert.equal(c.status, 'pending');
  assert.equal(c.dueDate, '');
  /* `template` diferente de 'rh' e o que o modelo financeiro exige para
     mostrar a linha: candidato de vaga fica de fora, cliente de ficha nao. */
  assert.equal(c.template, 'psicologia');
  assert.notEqual(c.template, 'rh');
  const financeiro = [c].filter(r => r.template !== 'rh');
  assert.equal(financeiro.length, 1, 'o cliente sumiu da leitura financeira');
});

test('as respostas do nicho ficam na ficha, e o cadastro no registro', () => {
  /* Sao dois lugares com donos diferentes: o cadastro e do cliente (nome,
     CPF, cidade) e vive no registro; a pergunta do nicho e do atendimento e
     vive em `campos`, que e o que a ficha desenha. Misturar faria a ficha
     repetir o cadastro e o cadastro carregar queixa clinica. */
  const form = {
    nicho: 'psicologia', titulo: 'Anamnese',
    campos: [
      { id: 'c1', tipo: 'texto', rotulo: 'Nome completo' },
      { id: 'p_cpf', tipo: 'cpf', rotulo: 'CPF' },
      { id: 'n_motivo', tipo: 'longo', rotulo: 'Motivo da consulta' },
    ],
  };
  const c = clientFromResponse(form, { valores: {
    c1: 'Ana', p_cpf: '111.222.333-44', n_motivo: 'Ansiedade',
  } }, 'r_dois');
  assert.equal(c.cpf, '111.222.333-44', 'o CPF tinha de ir para o registro');
  assert.equal(c.campos.motivo, 'Ansiedade', 'a pergunta do nicho tinha de ir para a ficha');
  assert.equal(c.campos.cpf, undefined, 'o cadastro vazou para a ficha');
});

/* ═══════════════════════════════════════════════════════════════════════
   PESSOA FISICA OU JURIDICA
   ═══════════════════════════════════════════════════════════════════════ */
const COM_DOCS = [
  { id: 'c1', tipo: 'texto', rotulo: 'Nome completo' },
  { id: 'p_cpf', tipo: 'cpf', rotulo: 'CPF' },
  { id: 'n_cnpj', tipo: 'cnpj', rotulo: 'CNPJ' },
];
let seq = 0;
const tipoDe = (nicho, valores) => clientFromResponse(
  { nicho, campos: COM_DOCS }, { valores }, 'rt' + (++seq)).clientType;

test('a RESPOSTA decide o tipo antes de qualquer palpite', () => {
  /* Quem escreveu um CNPJ e pessoa juridica; quem escreveu um CPF e pessoa
     fisica. Isso e fato, e vale mais do que o que se saiba sobre o ramo. */
  assert.equal(tipoDe('psicologia', { c1: 'A', p_cpf: '618.053.393-89' }), 'pf');
  assert.equal(tipoDe('marketing', { c1: 'A', n_cnpj: '12.345.678/0001-99' }), 'pj');
  /* Ate contra o palpite: uma agencia atende empresas, mas se veio CPF, e
     pessoa fisica. */
  assert.equal(tipoDe('marketing', { c1: 'A', p_cpf: '618.053.393-89' }), 'pf');
});

test('sem documento, a ficha opina — e so onde ela e inequivoca', () => {
  assert.equal(tipoDe('psicologia', { c1: 'A' }), 'pf');
  assert.equal(tipoDe('odontologia', { c1: 'A' }), 'pf');
  assert.equal(tipoDe('contabilidade', { c1: 'A' }), 'pj');
  assert.equal(tipoDe('tecnologia', { c1: 'A' }), 'pj');
  /* Imobiliaria, seguros e educacao atendem os dois todo dia: chutar erraria
     metade das vezes, e campo errado e pior do que campo vazio — o vazio pede
     para ser preenchido e o errado nao. */
  assert.equal(tipoDe('imobiliaria', { c1: 'A' }), '');
  assert.equal(tipoDe('seguros', { c1: 'A' }), '');
  assert.equal(tipoDe('educacao', { c1: 'A' }), '');
  assert.equal(tipoDe('generico', { c1: 'A' }), '');
});
