'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const brazil = require('../lib/brazil-services');
const { validarValores, dataCivilSaoPauloIso } = require('../api/form')._test;

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('valida CNPJ numérico legado e CNPJ alfanumérico', () => {
  assert.equal(brazil.isValidCnpj('04.252.011/0001-10'), true);
  assert.equal(brazil.isValidCnpj('12ABC34501DE-35'), true);
  assert.equal(brazil.isValidCnpj('12ABC34501DE-34'), false);
  assert.equal(brazil.isValidCnpj('11.111.111/1111-11'), false);
});

test('valida CPF pelos dois dígitos verificadores', () => {
  assert.equal(brazil.isValidCpf('529.982.247-25'), true);
  assert.equal(brazil.isValidCpf('529.982.247-24'), false);
  assert.equal(brazil.isValidCpf('111.111.111-11'), false);
});

test('normaliza e rejeita CEP inválido', () => {
  assert.equal(brazil.normalizeCep('01001-000'), '01001000');
  assert.throws(() => brazil.normalizeCep('123'), /CEP válido/);
});

test('usa BrasilAPI como fallback quando ViaCEP não encontra o CEP', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('viacep.com.br')) return response(200, { erro: true });
    return response(200, {
      cep: '01001000',
      street: 'Praça da Sé',
      neighborhood: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });
  };

  const result = await brazil.lookupCep('01001-000', { fetchImpl });
  assert.equal(result.provider, 'brasilapi');
  assert.equal(result.logradouro, 'Praça da Sé');
  assert.equal(result.cidade, 'São Paulo');
  assert.equal(calls.length, 2);
});

test('normaliza estados e municípios do IBGE', async () => {
  const fetchImpl = async url => {
    if (url.includes('/municipios')) {
      return response(200, [{ id: 3550308, nome: 'São Paulo' }]);
    }
    return response(200, [{
      id: 35,
      sigla: 'SP',
      nome: 'São Paulo',
      regiao: { nome: 'Sudeste' },
    }]);
  };

  assert.deepEqual(await brazil.listStates({ fetchImpl }), [{
    id: 35, sigla: 'SP', nome: 'São Paulo', regiao: 'Sudeste',
  }]);
  assert.deepEqual(await brazil.listCities('sp', { fetchImpl }), [{
    id: 3550308, nome: 'São Paulo', uf: 'SP',
  }]);
});

test('normaliza a resposta pública de CNPJ sem expor o payload inteiro', async () => {
  const fetchImpl = async () => response(200, {
    razao_social: 'MYDESK SERVICOS LTDA',
    nome_fantasia: 'MyDesk',
    descricao_situacao_cadastral: 'ATIVA',
    cep: '01001000',
    logradouro: 'Praça da Sé',
    numero: '1',
    municipio: 'São Paulo',
    uf: 'SP',
    dado_que_nao_deve_sair: 'interno',
  });

  const result = await brazil.lookupCnpj('04.252.011/0001-10', { fetchImpl });
  assert.equal(result.razaoSocial, 'MYDESK SERVICOS LTDA');
  assert.equal(result.endereco, 'Praça da Sé 1');
  assert.equal(result.dado_que_nao_deve_sair, undefined);
});

test('valida os novos campos inteligentes antes de gravar uma resposta pública', () => {
  const campos = [
    { id: 'cep', tipo: 'cep', rotulo: 'CEP', obrigatorio: true },
    { id: 'cnpj', tipo: 'cnpj', rotulo: 'CNPJ', obrigatorio: true },
    { id: 'uf', tipo: 'estado', rotulo: 'Estado', obrigatorio: true },
    { id: 'cidade', tipo: 'municipio', rotulo: 'Município', obrigatorio: true },
  ];
  const result = validarValores(campos, {
    cep: '01001-000',
    cnpj: '04.252.011/0001-10',
    uf: 'sp',
    cidade: 'São Paulo/SP',
  });
  assert.deepEqual(result.valores, {
    cep: '01001-000',
    cnpj: '04.252.011/0001-10',
    uf: 'SP',
    cidade: 'São Paulo/SP',
  });

  assert.match(validarValores(campos, {
    cep: '123', cnpj: 'inválido', uf: 'S', cidade: 'X',
  }).erro, /CEP válido/);
});

test('valida dados cadastrais do formulário público', () => {
  const campos = [
    { id: 'cpf', tipo: 'cpf', rotulo: 'CPF', obrigatorio: true },
    { id: 'nascimento', tipo: 'nascimento', rotulo: 'Nascimento', obrigatorio: true },
    { id: 'escolaridade', tipo: 'escolaridade', rotulo: 'Escolaridade', obrigatorio: true },
    { id: 'estadoCivil', tipo: 'estado_civil', rotulo: 'Estado civil', obrigatorio: true },
  ];
  const result = validarValores(campos, {
    cpf: '52998224725',
    nascimento: '1992-08-18',
    escolaridade: 'Ensino superior completo',
    estadoCivil: 'União estável',
  });
  assert.deepEqual(result.valores, {
    cpf: '529.982.247-25',
    nascimento: '1992-08-18',
    escolaridade: 'Ensino superior completo',
    estadoCivil: 'União estável',
  });

  assert.match(validarValores(campos, {
    cpf: '111.111.111-11',
    nascimento: '2999-01-01',
    escolaridade: 'Opção forjada',
    estadoCivil: 'Outro',
  }).erro, /CPF válido/);

  assert.match(validarValores(campos, {
    cpf: '529.982.247-25',
    nascimento: '2999-01-01',
    escolaridade: 'Ensino superior completo',
    estadoCivil: 'Solteiro(a)',
  }).erro, /data de nascimento válida/);
});

test('rejeita escolaridade fora da lista permitida', () => {
  const campos = [
    { id: 'escolaridade', tipo: 'escolaridade', rotulo: 'Escolaridade', obrigatorio: true },
  ];
  assert.match(validarValores(campos, {
    escolaridade: 'Opção forjada',
  }).erro, /escolaridade válida/);
});

test('rejeita estado civil fora da lista permitida', () => {
  const campos = [
    { id: 'estadoCivil', tipo: 'estado_civil', rotulo: 'Estado civil', obrigatorio: true },
  ];
  assert.match(validarValores(campos, {
    estadoCivil: 'Outro',
  }).erro, /estado civil válido/);
});

test('limita nascimento pelo dia civil de America/Sao_Paulo', () => {
  const noiteEmSaoPaulo = new Date('2026-07-29T01:30:00.000Z');
  const campos = [
    { id: 'nascimento', tipo: 'nascimento', rotulo: 'Nascimento', obrigatorio: true },
  ];

  assert.equal(dataCivilSaoPauloIso(noiteEmSaoPaulo), '2026-07-28');
  assert.deepEqual(validarValores(campos, {
    nascimento: '2026-07-28',
  }, noiteEmSaoPaulo).valores, {
    nascimento: '2026-07-28',
  });
  assert.match(validarValores(campos, {
    nascimento: '2026-07-29',
  }, noiteEmSaoPaulo).erro, /data de nascimento válida/);
});
