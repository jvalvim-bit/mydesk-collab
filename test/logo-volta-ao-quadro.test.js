'use strict';
/* Clicar no logo para voltar ao começo é o gesto que todo site tem. Aqui ele
   atravessa três camadas — aba Clientes, workspace compartilhado, workspace
   pessoal nomeado — e uma delas é irreversível: sair de um grupo derruba
   ouvintes e avisa os outros participantes. Estas varreduras seguram o que não
   pode mudar sem querer. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');

/* Fim de linha normalizado. A cópia de trabalho no Windows é CRLF, e recortar
   o corpo de uma função procurando o fecha-chaves sozinho numa linha não
   acharia nada: a varredura passaria a ler o arquivo inteiro e daria por bom
   qualquer texto que estivesse em qualquer lugar. */
const ler = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8').split('\r\n').join('\n');
const html = ler('docs/index.html');
const app = ler('docs/js/app.js');
const handlers = ler('docs/js/handlers-app.js');

const FIM_DE_FUNCAO = '\n}\n';

function corpoDaFuncao(fonte, assinatura) {
  const i = fonte.indexOf(assinatura);
  assert.ok(i > 0, assinatura + ' sumiu');
  const fim = fonte.indexOf(FIM_DE_FUNCAO, i);
  assert.ok(fim > i, 'não achei o fim de ' + assinatura);
  return fonte.slice(i, fim);
}

test('o logo é um botão de verdade, e alcançável pelo teclado', () => {
  const tag = /<div class="t-logo"[^>]*>/.exec(html);
  assert.ok(tag, 'o logo saiu da barra');
  assert.match(tag[0], /role="button"/);
  assert.match(tag[0], /tabindex="0"/);
  /* `alt="MyDesk"` seria o nome acessível herdado da imagem — o que o botão
     ANUNCIA precisa ser o que ele FAZ, não a marca. */
  assert.match(tag[0], /aria-label="[^"]+"/);

  /* Nada de on*= no HTML: a CSP do site não tem 'unsafe-inline' em script-src,
     e um atributo inline aqui nem executaria. */
  assert.doesNotMatch(tag[0], /\son[a-z]+=/);
  const h = /data-h="([^"]+)"/.exec(tag[0]);
  assert.ok(h, 'o logo perdeu o data-h e ficou sem handler');

  const doLogo = handlers.slice(handlers.indexOf(`['${h[1]}'`));
  assert.ok(doLogo.includes("'click'"), 'o clique não está ligado');
  assert.ok(doLogo.includes("'keydown'"),
    'role="button" sem keydown promete um atalho que o teclado não alcança');
  assert.ok(doLogo.includes('irParaMeuQuadro'), 'o logo passou a chamar outra coisa');
});

test('sair de grupo ou 1:1 pelo logo oferece temporário OU permanente', () => {
  /* E oferece pela PORTA DE SAÍDA DE SEMPRE. Escrever um "confirma?" próprio
     aqui criaria uma segunda forma de sair, com outras opções e outra limpeza
     de ouvintes — duas portas com regras diferentes para o mesmo cômodo é como
     se perde um workspace sem entender por quê. */
  const corpo = corpoDaFuncao(app, 'async function irParaMeuQuadro(');

  assert.match(corpo, /leaveGroupWorkspace\(true\)/,
    'o grupo precisa passar pelo diálogo de saída, e não sair direto');
  assert.match(corpo, /showLeaveWsDialog1x1\(/,
    'o 1:1 precisa passar pelo diálogo de saída');
  assert.doesNotMatch(corpo, /leaveGroupWorkspace\(false\)/,
    'saída sem diálogo: o logo voltou a tirar a pessoa do grupo sem perguntar');
  assert.doesNotMatch(corpo, /switchToPersonal\(/,
    'atalho que pula a tela de saída do 1:1');

  // E as duas telas continuam oferecendo as duas saídas.
  const grupo = corpoDaFuncao(app, 'function showLeaveWsDialog(');
  assert.match(grupo, /app\.leaveTemporarily/);
  assert.match(grupo, /app\.closeForEveryone/);
  const umAum = corpoDaFuncao(app, 'function showLeaveWsDialog1x1(');
  assert.match(umAum, /app\.leaveTemporarily/);
  assert.match(umAum, /app\.closeForBoth/);
});

test('trocar de workspace PESSOAL não pergunta nada', () => {
  // Ir e voltar entre quadros pessoais é reversível e barato; confirmação aí
  // seria atrito pelo atrito.
  const corpo = corpoDaFuncao(app, 'async function irParaMeuQuadro(');
  const pessoal = corpo.slice(corpo.indexOf('3. Workspace pessoal'));
  assert.ok(pessoal.length > 0, 'o passo do workspace pessoal sumiu');
  assert.doesNotMatch(pessoal, /confirmarAcao\(|showLeaveWsDialog/);
  assert.match(pessoal, /_pwLeave\(\)/,
    'a volta ao quadro principal precisa passar pelo caminho já existente');
  /* E o logo NUNCA apaga um workspace pessoal. O "permanente" ali seria apagar
     as próprias notas, e isso tem lugar próprio no painel de workspaces. */
  assert.doesNotMatch(corpo, /_pwDelete\(/);
});

test('a ordem é a do desfazer: primeiro a aba, depois o workspace', () => {
  /* Quem está na aba Clientes DENTRO de um grupo clica uma vez e vê o quadro do
     grupo; só o segundo clique pergunta se quer sair. Fazer as duas de uma vez
     tiraria a pessoa de um workspace compartilhado por causa de um clique dado
     para fechar uma aba. */
  const corpo = corpoDaFuncao(app, 'async function irParaMeuQuadro(');
  const aba = corpo.indexOf('toggleCRMView()');
  const ws = corpo.indexOf('leaveGroupWorkspace(true)');
  const pessoal = corpo.indexOf('_pwLeave()');
  assert.ok(aba > 0 && ws > aba && pessoal > ws,
    'a ordem das camadas mudou: aba → compartilhado → pessoal');
  assert.match(corpo.slice(aba, aba + 40), /return/,
    'fechar a aba precisa encerrar o clique, e não seguir para a saída do workspace');
});
