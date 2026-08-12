'use strict';
/* A resposta de um formulário de vaga vira ficha de candidato sozinha, pelo
   servidor. Se essa ficha chegar sem `template`, ela NÃO aparece no funil de
   recrutamento: a pessoa se candidata, o registro é criado, e ela não está em
   lugar nenhum que se olhe. Foi o que aconteceu — o caminho manual ("Respostas"
   → virar cliente) montava a ficha do nicho no navegador, e o automático não
   montava nada. Dois caminhos para o mesmo destino com resultados diferentes é
   o tipo de divergência que só se percebe procurando alguém que sumiu. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clientFromResponse } = require('../lib/form-clients');

/* Formulário como o botão "Formulário da vaga" o publica: campos do modelo de
   recrutamento, cada um com a chave da ficha no id, prefixada por `n_`. */
const form = {
  id: 'form_abc',
  titulo: 'Analista de dados',
  nicho: 'rh',
  campos: [
    { id: 'c1', tipo: 'texto', rotulo: 'Nome completo', crmCampo: 'name' },
    { id: 'c2', tipo: 'email', rotulo: 'E-mail', crmCampo: 'email' },
    { id: 'n_vaga', tipo: 'selecao', rotulo: 'Vaga',
      opcoes: ['Triagem', 'Em análise', 'Aprovado', 'Reprovado'] },
    { id: 'n_experiencia', tipo: 'longo', rotulo: 'Experiência' },
    { id: 'n_formacao', tipo: 'texto', rotulo: 'Formação' },
    { id: 'n_pretensao', tipo: 'texto', rotulo: 'Pretensão salarial' },
    { id: 'n_anexo', tipo: 'arquivo', rotulo: 'Currículo e documentos' },
  ],
};

const resposta = {
  ts: 1770000000000,
  valores: {
    c1: 'Ana Souza',
    c2: 'ana@exemplo.com',
    n_vaga: 'Em análise',
    n_experiencia: 'Cinco anos com SQL e Python.',
    n_formacao: 'Estatística',
    n_pretensao: '4500',
  },
  arquivo: { name: 'Curriculo.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,QQ==' },
};

test('a ficha criada pelo servidor declara o modelo do formulário', () => {
  const c = clientFromResponse(form, resposta, 'resp1');
  assert.equal(c.template, 'rh',
    'sem template a ficha não aparece no funil, e o candidato some da tela');
});

test('as respostas dos campos do modelo caem nos campos da ficha', () => {
  const c = clientFromResponse(form, resposta, 'resp1');
  assert.equal(c.campos.experiencia, 'Cinco anos com SQL e Python.');
  assert.equal(c.campos.formacao, 'Estatística');
  assert.equal(c.campos.pretensao, '4500');
});

test('escolha que é uma das opções vira ETIQUETA, e não texto do campo', () => {
  /* "Em análise" é estado do processo, não o nome da vaga. Guardado como texto
     em `vaga`, ele apareceria como se a pessoa tivesse se candidatado a uma
     vaga chamada "Em análise" — e o filtro por vaga listaria isso. */
  const c = clientFromResponse(form, resposta, 'resp1');
  assert.equal(c.campos.vaga__selo, 'Em análise');
  assert.equal(c.campos.vaga, undefined);
});

test('campo em branco não cria chave vazia na ficha', () => {
  const c = clientFromResponse(form, { valores: { c1: 'Rui' } }, 'resp2');
  assert.equal(c.campos.experiencia, undefined);
  assert.deepEqual(Object.keys(c.campos), []);
});

test('o currículo continua chegando junto da ficha', () => {
  const c = clientFromResponse(form, resposta, 'resp1');
  assert.equal(c.documents.length, 1);
  assert.equal(c.documents[0].type, 'application/pdf');
  assert.ok(c.documents[0].dataUrl.startsWith('data:'),
    'sem o dataUrl a análise por IA não tem o que ler');
});

test('formulário sem modelo continua gerando ficha simples, como antes', () => {
  const simples = { id: 'f2', titulo: 'Contato', campos: form.campos.slice(0, 2) };
  const c = clientFromResponse(simples, { valores: { c1: 'Zé', c2: 'z@e.com' } }, 'r3');
  assert.equal(c.template, '');
  assert.deepEqual(c.campos, {});
  assert.equal(c.name, 'Zé');
});

test('o servidor não precisa do catálogo de nichos do navegador', () => {
  /* A chave da ficha sai do id do campo e a etiqueta sai das opções do próprio
     formulário. Depender de docs/js/nichos.js aqui significaria carregar um
     arquivo do navegador dentro da função da Vercel. */
  const fonte = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'lib', 'form-clients.js'), 'utf8')
    // Comentário citando o caminho é documentação, não dependência.
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/require\([^)]*nichos|readFileSync|MD_NICHOS/.test(fonte),
    'lib/form-clients.js passou a carregar o catálogo do navegador');
});
