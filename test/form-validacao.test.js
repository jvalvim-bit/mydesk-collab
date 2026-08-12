'use strict';
/* Regressões da validação de resposta pública. */
const { test } = require('node:test');
const assert = require('node:assert');
const { _test } = require('../api/form.js');

const campos = [
  { id: 'c1', tipo: 'texto',   rotulo: 'Nome completo', obrigatorio: true },
  { id: 'n_anexo', tipo: 'arquivo', rotulo: 'Arquivos', obrigatorio: true },
];

test('campo de arquivo obrigatório não torna o formulário impossível de enviar', () => {
  /* O arquivo viaja em body.arquivo e nunca em `valores`. Antes, um campo de
     arquivo obrigatório caía no teste de campo vazio e devolvia
     'Preencha "Arquivos"' mesmo com o arquivo anexado. */
  const r = _test.validarValores(campos, { c1: 'João Victor' });
  assert.equal(r.erro, undefined, 'não deveria recusar: ' + r.erro);
  assert.equal(r.valores.c1, 'João Victor');
  assert.equal(r.valores.n_anexo, undefined, 'arquivo não entra em valores');
});

test('campo de texto obrigatório continua sendo exigido', () => {
  const r = _test.validarValores(campos, {});
  assert.match(r.erro || '', /Nome completo/);
});

/* ── Formulário que só pede um arquivo ────────────────────────────────────
   É o caso do formulário de vaga reduzido a "Currículo e documentos": um
   campo, do tipo arquivo. Como o anexo viaja em body.arquivo e nunca em
   `valores`, a trava de resposta vazia recusava o envio com "Preencha ao menos
   um campo" mesmo com o currículo anexado — botão que nunca funciona, e nenhum
   sinal do porquê. Mesmo erro que o campo obrigatório já tinha cometido acima:
   tratar anexo como se não fosse conteúdo. */
const soArquivo = [
  { id: 'n_anexo', tipo: 'arquivo', rotulo: 'Currículo e documentos', obrigatorio: false },
];
const ANEXO = { name: 'Curriculo.docx', type: 'application/vnd...', dataUrl: 'data:x;base64,QQ==' };

test('formulário só de arquivo é enviável quando o arquivo veio', () => {
  const { valores, erro } = _test.validarValores(soArquivo, {});
  assert.equal(erro, undefined);
  assert.deepEqual(valores, {}, 'o anexo não entra em valores, e é isso que causava o bug');
  assert.equal(_test.respostaTemConteudo(valores, ANEXO), true,
    'anexo é conteúdo: recusar aqui torna o formulário impossível de enviar');
});

test('resposta sem nada continua sendo recusada', () => {
  assert.equal(_test.respostaTemConteudo({}, null), false);
});

test('texto sozinho, sem anexo, continua valendo', () => {
  assert.equal(_test.respostaTemConteudo({ c1: 'João' }, null), true);
});

/* ── A foto do candidato ──────────────────────────────────────────────────
   Ela viaja em body.foto, fora de `valores`, exatamente como o anexo — e pela
   mesma armadilha: tratada como se não fosse conteúdo, ela transformaria um
   formulário só de foto num botão que nunca funciona. */
const soFoto = [{ id: 'cfoto', tipo: 'foto', rotulo: 'Foto', obrigatorio: true }];
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('campo de foto não entra em valores nem exige preenchimento', () => {
  const { valores, erro } = _test.validarValores(soFoto, {});
  assert.equal(erro, undefined, 'foto obrigatória não pode barrar o envio');
  assert.deepEqual(valores, {});
});

test('foto sozinha é conteúdo', () => {
  assert.equal(_test.respostaTemConteudo({}, null, FOTO), true);
  assert.equal(_test.respostaTemConteudo({}, null, ''), false);
});
