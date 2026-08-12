'use strict';
/* A triagem de currículos é a única tarefa de IA deste projeto cujo resultado
   incide sobre alguém que não é usuária do MyDesk — um candidato que nunca vai
   ver esta tela e não tem como contestar o que o modelo disse dele.
   As instruções que seguram isso vivem no servidor, em api/ia.js, e são texto
   solto dentro de uma string: nada quebra se alguém apagar uma linha enquanto
   ajusta o formato da resposta. Esta varredura é a trava. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FONTE = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'ia.js'), 'utf8');

/* Só o bloco da tarefa, para não passar por acaso com texto de outra. */
function blocoDaTriagem() {
  const i = FONTE.indexOf('curriculos: {');
  assert.ok(i > 0, 'a tarefa "curriculos" sumiu de api/ia.js');
  const fim = FONTE.indexOf('semana: {', i);
  return FONTE.slice(i, fim > i ? fim : undefined);
}

test('a tarefa de triagem existe e é escolhida pelo nome que o app envia', () => {
  const bloco = blocoDaTriagem();
  assert.ok(/sistema:/.test(bloco), 'a tarefa não tem instrução de sistema');
  const rh = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'rh.js'), 'utf8');
  assert.ok(rh.includes("pedirResumo('curriculos'"),
    'o app pede outra tarefa que não a cadastrada no servidor');
});

test('a triagem é exclusiva do Premium, e a trava está no SERVIDOR', () => {
  /* A aba Clientes já exige acesso pleno para abrir, mas isso é o navegador
     dizendo não para si mesmo: docs/js/app.js é público, e quem lê o nome da
     tarefa chama /api/ia direto com o próprio token. Se esta trava sair,
     conta gratuita passa a analisar currículo gastando a cota de 8 do mês. */
  assert.match(blocoDaTriagem(), /premium:\s*true/,
    'a tarefa "curriculos" deixou de ser marcada como exclusiva do Premium');

  assert.match(FONTE, /if\s*\(\s*tarefa\.premium\b/,
    'a marca existe mas ninguém a verifica no handler');
  assert.match(FONTE, /res\.status\(403\)/,
    'a recusa por plano precisa devolver 403, e não seguir para o Gemini');

  /* A recusa vem ANTES da chamada ao modelo: negar depois já teria gastado a
     cota do projeto e o dinheiro da chamada.

     A referência é `chamarCadeia(`, e não mais o endereço do Google: desde que
     existe fila de modelos, a URL mora numa função auxiliar no alto do arquivo
     e a posição dela no texto não diz nada sobre a ordem em que as coisas
     acontecem. O que importa é onde a fila é DISPARADA — e isso é uma linha
     só, dentro do handler. */
  const ondeTrava = FONTE.indexOf('tarefa.premium');
  const ondeChama = FONTE.indexOf('await chamarCadeia(');
  assert.ok(ondeChama > 0, 'a chamada ao modelo deixou de passar por chamarCadeia()');
  assert.ok(ondeTrava > 0 && ondeTrava < ondeChama,
    'a verificação de plano ficou depois da chamada ao modelo');
});

test('o teste de 7 dias vale como acesso pleno, e vem do Auth', () => {
  /* Mesma regra do app: assinante OU conta nova. E a data de criação sai do
     Firebase Auth, não de um campo do banco — senão esticar o teste para
     sempre seria uma linha no console do navegador. */
  assert.match(FONTE, /TRIAL_DIAS\s*=\s*7/);
  assert.match(FONTE, /getUser\([^)]*\)[\s\S]{0,60}creationTime/,
    'o período de teste precisa vir do Auth, não do banco');

  const app = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');
  const doApp = app.match(/const TRIAL_DIAS = (\d+)/);
  const daApi = FONTE.match(/TRIAL_DIAS\s*=\s*(\d+)/);
  assert.equal(daApi[1], doApp[1],
    'o servidor e o app discordam sobre quantos dias dura o teste');
});

test('o cliente avisa do Premium antes de a pessoa preencher a janela', () => {
  const app = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');
  const i = app.indexOf('function crmAnalisarCurriculos');
  assert.ok(i > 0, 'a função do botão sumiu');
  const bloco = app.slice(i, i + 700);
  assert.ok(bloco.includes('hasFullAccess()'),
    'sem isto a pessoa escolhe a vaga, escreve os requisitos e só então ouve não');
  assert.ok(bloco.includes('showPremiumModal'));

  const rh = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'rh.js'), 'utf8');
  assert.ok(rh.includes('e.status === 403'),
    'a recusa por plano vinda do servidor precisa levar à tela de assinatura');
});

test('a instrução manda IGNORAR características protegidas', () => {
  const bloco = blocoDaTriagem().toLowerCase();
  /* Cada uma destas aparece em currículo brasileiro sem ninguém pedir, e
     nenhuma mede capacidade de fazer o trabalho. */
  ['idade', 'gênero', 'raça', 'estado civil', 'filhos', 'religião',
   'nacionalidade', 'aparência', 'foto'].forEach(termo => {
    assert.ok(bloco.includes(termo),
      'a instrução deixou de mandar ignorar: ' + termo);
  });
  assert.ok(/ignore/.test(bloco), 'sumiu a ordem explícita de ignorar');
});

test('a nota é de 0 a 100 e só existe quando houve currículo lido', () => {
  /* Número tem autoridade que texto não tem: quem vê "72" acredita nele. Uma
     nota saída de ficha em branco, ou de arquivo que não abriu, seria uma
     medição inventada sobre uma pessoa real. */
  const bloco = blocoDaTriagem();
  assert.match(bloco, /Nota: NN\/100/, 'sumiu o formato da nota');
  assert.match(bloco, /APENAS quando houve currículo lido/i,
    'a nota precisa depender de ter havido currículo lido');
  assert.match(bloco, /"Nota: sem nota"/,
    'sem currículo, o campo tem de dizer "sem nota" em vez de arriscar um número');
  assert.match(bloco, /0 a 24|85 a 100/,
    'sem faixas declaradas, cada resposta usa uma régua diferente');
});

test('a nota mede a vaga, não a pessoa — e a falta de leitura não penaliza', () => {
  const bloco = blocoDaTriagem();
  assert.match(bloco, /aderência aos requisitos declarados da vaga/i);
  assert.match(bloco, /conta como NÃO atendido/,
    'requisito não mencionado não pode ser presumido como atendido');
  assert.match(bloco, /não o penalize/i,
    'currículo ilegível é falha nossa de leitura, não falta de competência');
});

test('o orçamento de texto impede que candidatos sumam no corte do servidor', () => {
  /* O servidor corta a entrada em 60 mil caracteres, e corta do fim: sem
     dividir o teto entre os candidatos, os últimos sumiriam da análise e a
     lista sairia ordenada como se eles não existissem. */
  const rh = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'rh.js'), 'utf8');
  assert.match(rh, /const ORCAMENTO = (\d+)/, 'sumiu o orçamento de texto');
  const orcamento = Number(rh.match(/const ORCAMENTO = (\d+)/)[1]);
  const teto = Number(FONTE.match(/MAX_ENTRADA = (\d+)/)[1]);
  assert.ok(orcamento < teto,
    'o orçamento do cliente (' + orcamento + ') tem de caber no teto do servidor (' + teto + ')');
  assert.match(rh, /Math\.floor\(ORCAMENTO \/ Math\.max\(1, cands\.length\)\)/,
    'o teto por currículo precisa ser dividido pelo número de candidatos');
  assert.ok(rh.includes('rh.iaTruncated'),
    'quando o servidor cortar assim mesmo, a tela precisa dizer');
});

test('a instrução proíbe deduzir o que não consta', () => {
  const bloco = blocoDaTriagem().toLowerCase();
  assert.ok(bloco.includes('não consta'),
    'sem isto o modelo preenche lacuna com suposição sobre uma pessoa real');
  assert.ok(/nunca deduza|nunca preencha/.test(bloco));
});

test('a instrução impede o modelo de decidir a contratação', () => {
  const bloco = blocoDaTriagem().toLowerCase();
  assert.ok(/não recomende contratar/.test(bloco),
    'o modelo ordena por aderência; quem contrata é quem lê');
  assert.ok(/a decisão não é sua|decisão/.test(bloco));
});

test('nenhum candidato pode sumir da lista em silêncio', () => {
  const bloco = blocoDaTriagem().toLowerCase();
  assert.ok(bloco.includes('não o deixe de fora'),
    'currículo ilegível tem de entrar na lista com a ressalva, não desaparecer');
});

test('o aviso de que isto é triagem, e não decisão, chega à tela', () => {
  const i18n = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'i18n.js'), 'utf8');
  assert.ok(i18n.includes("'rh.iaNotice'"),
    'o aviso da janela de triagem saiu do catálogo');
  const rh = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'rh.js'), 'utf8');
  assert.ok(rh.includes('rh.iaNotice'),
    'o aviso existe no catálogo mas ninguém o mostra');
});

test('a resposta precisa ter uma entrada por candidato enviado', () => {
  /* Dois currículos idênticos — a mesma pessoa se inscrevendo duas vezes — o
     modelo lia como um só, e a análise voltava com uma entrada a menos do que
     os candidatos enviados. Some gente da lista sem nada indicar que sumiu. */
  const bloco = blocoDaTriagem();
  assert.match(bloco, /TODOS os candidatos enviados/);
  assert.match(bloco, /CANDIDATO N DE TOTAL/,
    'o modelo precisa saber que os blocos chegam numerados');
  // A instrução é montada por concatenação, então o texto pode estar partido
  // entre duas strings: procura os pedaços, não a frase contínua.
  assert.ok(/exatamente/.test(bloco) && /TOTAL entradas/.test(bloco),
    'sumiu a exigência de uma entrada por bloco recebido');
  // Idem: a frase atravessa a quebra da concatenação no arquivo.
  assert.ok(/Nunca funda, resuma nem/.test(bloco) && /omita um deles/.test(bloco),
    'sumiu a proibição de fundir candidatos iguais numa entrada só');
});

test('o app numera os blocos que envia', () => {
  const rh = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'rh.js'), 'utf8');
  assert.ok(rh.includes('rh.iaCandidateHeader'),
    'os blocos voltaram a ir sem número, e candidatos iguais se fundem de novo');
  const i18n = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'js', 'i18n.js'), 'utf8');
  assert.match(i18n, /'rh\.iaCandidateHeader'[\s\S]{0,120}\{n\} DE \{total\}/,
    'o cabeçalho do bloco precisa levar a posição e o total');
});
