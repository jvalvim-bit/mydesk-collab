'use strict';
/* O formulário da vaga é criado a partir da aba de recrutamento e não deve
   virar cartão no quadro de notas — é lá que se trabalha com ele. A nota
   continua existindo como DADO, porque é ela que serve de índice para o
   ouvinte de respostas, para o contador e para a lista de "Respostas"; o que
   muda é que ela não é desenhada, do mesmo jeito que o registro de cliente
   nunca virou cartão.

   Isto é frágil por natureza: são três pontos distantes um do outro (criar,
   salvar, montar) e basta um ficar para trás para o cartão voltar a aparecer,
   ou para o formulário sumir da lista da aba. Daí a varredura. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');

/* Recorta uma função pelo nome, até a próxima declaração de topo. */
function corpoDe(nome) {
  const i = APP.indexOf('function ' + nome + '(');
  assert.ok(i > 0, 'função sumiu: ' + nome);
  const j = APP.indexOf('\nfunction ', i + 1);
  return APP.slice(i, j > i ? j : i + 4000);
}

test('quem decide é uma função só, e ela olha o nicho do formulário', () => {
  const f = corpoDe('_formEhDeVaga');
  assert.match(f, /_isFormNote/);
  assert.match(f, /_formNicho === 'rh'/,
    'a decisão precisa sair do nicho gravado na nota, e não do título');
});

test('a nota nasce com o nicho e não é montada quando é de vaga', () => {
  const f = corpoDe('criarNotaDeFormulario');
  assert.match(f, /_formNicho: nicho \|\| ''/,
    'sem gravar o nicho, ao recarregar a página ninguém sabe que era de vaga');
  assert.match(f, /if \(!_formEhDeVaga\(n\)\) mountNote\(n\)/,
    'o cartão apareceria no instante da criação, antes de qualquer recarga');
});

test('o nicho sobrevive ao salvamento da nota', () => {
  /* Se `_formNicho` não entrar no que é gravado, ele existe até o F5 e depois
     o cartão volta ao quadro — o pior tipo de bug: some quando se testa. */
  assert.match(APP, /_formNicho:\s+n\._formNicho\s+\|\| ''/,
    'o payload salvo não leva _formNicho');
});

test('mountNote recusa o formulário de vaga pela mesma porta do registro CRM', () => {
  const i = APP.indexOf("String(n.id || '').startsWith('crm_')");
  assert.ok(i > 0, 'o patch de mountNote mudou de forma');
  const trecho = APP.slice(i, i + 260);
  assert.match(trecho, /_formEhDeVaga\(n\)\) return/,
    'sem isto o cartão volta ao quadro a cada carregamento do board');
});

test('nota antiga, sem nicho gravado, é classificada em vez de ficar no quadro', () => {
  const f = corpoDe('_classificarFormulariosAntigos');
  assert.match(f, /_formNicho === undefined/,
    'só as notas sem classificação devem gastar leitura');
  assert.match(f, /forms\/' \+ n\._formId \+ '\/nicho/,
    'o nicho tem de vir do próprio formulário');
  assert.match(f, /saveNotes\(\)/, 'sem gravar, a leitura se repete para sempre');
  assert.match(APP, /_classificarFormulariosAntigos\(\);/,
    'a classificação existe mas nunca é chamada');
});

test('o formulário de vaga continua alcançável pela aba de recrutamento', () => {
  /* Esconder sem dar outro caminho seria perder o formulário: o link público,
     as respostas e o encerramento da vaga precisam de um lugar.

     E esse lugar NÃO pode ser a nota. Amarrar a vida do link à vida de uma
     nota foi o que deixou 25 formulários órfãos em 01/08/2026: as notas se
     perderam e os formulários continuaram no banco, recebendo respostas que
     ninguém mais conseguia ler. A lista vem do endpoint, de onde eles moram. */
  const f = corpoDe('crmFormularioDaVaga');
  assert.match(f, /_crmFormulariosDaVaga\(\)/,
    'a lista voltou a depender das notas do quadro');
  assert.ok(!/notes[\s\S]{0,40}\.filter\(_formEhDeVaga\)/.test(f),
    'a lista não pode sair das notas — elas somem, o formulário não');
  assert.match(APP, /acao: 'meusFormularios'/,
    'sumiu a chamada que lista os formulários do dono');
  assert.match(f, /_crmMenuDoFormulario/);

  const menu = APP.slice(APP.indexOf('async function _crmMenuDoFormulario'),
                         APP.indexOf('async function _crmAbrirVaga'));
  ['app.responses', 'app.copyLink', 'app.open'].forEach(k =>
    assert.ok(menu.includes(k), 'faltou a ação ' + k + ' no menu do formulário'));
});

test('encerrar a vaga fecha o formulário, e não apaga as candidaturas', () => {
  /* Apagar levaria junto quem já se candidatou e — pior — deixaria o link
     público respondendo, porque o formulário vive em forms/{id} e não na
     nota. Fechar é gravar publico:false, que a página pública já recusa. */
  const f = APP.slice(APP.indexOf('async function _crmAbrirVaga'),
                      APP.indexOf('async function _crmAbrirVaga') + 900);
  assert.match(f, /forms\/' \+ n\._formId \+ '\/publico/);
  assert.ok(!/removeNote|fbRemove/.test(f),
    'encerrar uma vaga não pode apagar nota nem formulário');
});

/* ═══════════════════════════════════════════════════════════════════════
   O LINK É PERMANENTE ATÉ ALGUÉM PEDIR PARA EXCLUIR
   ═══════════════════════════════════════════════════════════════════════
   A lista dos formulários vinha das notas do quadro. Some a nota, some o
   caminho para o formulário — que continua inteiro no banco, recebendo
   respostas que ninguém mais consegue ler. Foi assim que 25 formulários
   ficaram órfãos em 01/08/2026. */
const API = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'form.js'), 'utf8');

test('o endpoint lista os formulários do dono, e só os dele', () => {
  assert.match(API, /body\.acao === 'meusFormularios'/, 'a ação de listar sumiu');
  assert.match(API, /verifyIdToken\(idToken\)/,
    'listar sem verificar o token entregaria formulário de qualquer um');
  assert.match(API, /f\.owner === quem\.uid/,
    'o filtro por dono é o que impede ver formulário alheio');
});

test('a lista não devolve o corpo do formulário nem as respostas', () => {
  /* Mandar campos, respostas e anexos a cada abertura do menu trocaria uma
     lista por um despejo de banco — e os anexos são currículos. */
  const i = API.indexOf("body.acao === 'meusFormularios'");
  const bloco = API.slice(i, API.indexOf('return res.status(200).json({ ok: true, formularios', i));
  assert.ok(!/campos:/.test(bloco), 'a lista passou a devolver os campos');
  assert.match(bloco, /respostas: f\.respostas \? Object\.keys\(f\.respostas\)\.length : 0/,
    'a contagem de respostas precisa ser um número, não as respostas');
});

test('excluir exige ser o dono, e apaga o formulário de verdade', () => {
  assert.match(API, /body\.acao === 'excluirFormulario'/);
  const i = API.indexOf("body.acao === 'excluirFormulario'");
  const bloco = API.slice(i, i + 1200);
  assert.match(bloco, /alvoF\.owner !== quem\.uid/,
    'sem esta checagem qualquer pessoa apaga o formulário de outra');
  assert.match(bloco, /dbRemove\('forms\/' \+ alvo\)/,
    'excluir precisa remover o nó, senão o link continua respondendo');
});

test('a exclusão avisa o que leva junto — e o que não leva', () => {
  const i18n = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'i18n.js'), 'utf8');
  assert.match(i18n, /'rh\.deleteFormBody'/);
  const j = i18n.indexOf("'rh.deleteFormBody'");
  const texto = i18n.slice(j, j + 400);
  assert.match(texto, /respostas/, 'não diz que as respostas vão junto');
  assert.match(texto, /funil continuam|funil se/,
    'não diz que os candidatos já no funil ficam — e essa é a dúvida de quem clica');
});

/* ═══════════════════════════════════════════════════════════════════════
   O FORMULÁRIO DA VAGA NÃO CRIA NOTA NENHUMA
   ═══════════════════════════════════════════════════════════════════════
   Ele já não aparecia no quadro, mas continuava existindo como nota escondida
   para servir de índice. Índice deixou de ser trabalho dela quando a lista
   passou a vir de /api/form — e nota que ninguém vê e ninguém precisa é só uma
   coisa a mais para se perder, se duplicar num workspace, ou reaparecer quando
   um carregador esquece de copiar `_isFormNote`. Foi o que aconteceu. */
test('publicar formulário de vaga não cria nota', () => {
  const i = APP.indexOf('criarNotaDeFormulario(id, r.titulo.trim()');
  assert.ok(i > 0, 'a chamada mudou de forma');
  const antes = APP.slice(Math.max(0, i - 300), i);
  assert.match(antes, /if \(r\.nicho !== 'rh'\)/,
    'formulário de vaga voltou a criar nota no quadro');
});

test('publicar uma vaga não gasta a cota de notas do plano', () => {
  /* O limite conta NOTAS. Cobrar da vaga uma vaga na cota seria cobrar por
     algo que não ocupa lugar nenhum — e impediria publicar uma vaga porque o
     quadro de notas está cheio, que são assuntos diferentes. */
  assert.match(APP, /r\.nicho === 'rh' \? \{ ok: true \} : await canCreateNote\(\)/,
    'a publicação de vaga voltou a passar pelo limite de notas');
});

test('todo carregador de nota preserva a identidade de formulário', () => {
  /* Sem `_isFormNote`, `_formId` e `_formNicho`, a nota chega SEM saber que é
     uma: perde a faixa com o link, some da lista de respostas e deixa de ser
     reconhecida como de vaga — voltando a ser desenhada como nota comum. Três
     carregadores esqueciam de copiá-los. */
  const linhas = APP.split(String.fromCharCode(10));
  const faltando = [];
  linhas.forEach((l, i) => {
    if (!/notes\.push\(_marcarBoard\(n\)\); mountNote\(n\)/.test(l)) return;
    const bloco = linhas.slice(Math.max(0, i - 22), i).join(String.fromCharCode(10));
    if (!/_isFormNote/.test(bloco)) faltando.push(i + 1);
  });
  assert.deepEqual(faltando, [],
    'carregador que monta nota sem copiar _isFormNote, nas linhas acima');
});
