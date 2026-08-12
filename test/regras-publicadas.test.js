'use strict';
/* database.rules.json é um arquivo do repositório, não o que o Firebase aplica.
   Só passa a valer depois de `npm run deploy:rules`. Enquanto isso não acontece,
   editar as regras aqui não muda nada em produção — e a falha aparece como
   PERMISSION_DENIED numa tela que, pelo código, deveria funcionar.

   Foi assim que a delegação de tarefa ficou quebrada: o nó noteCollaboration
   entrou no arquivo e nunca foi publicado. Todas as condições da regra estavam
   satisfeitas em tempo de execução, e o banco recusava do mesmo jeito, porque
   o banco não conhecia essa regra.

   Este teste não alcança o servidor. Ele guarda o que dá para guardar daqui:
   que o comando de publicar existe e que os nós que o app escreve estão
   descritos no arquivo. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const bruto = fs.readFileSync(path.join(RAIZ, 'database.rules.json'), 'utf8');
// O RTDB aceita comentários // nas regras; JSON.parse não.
const regras = JSON.parse(bruto.replace(/^\s*\/\/.*$/gm, ''));

test('existe um comando para publicar as regras', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts && pkg.scripts['deploy:rules'],
    'sem npm run deploy:rules, editar database.rules.json não muda produção');

  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firebase.json'), 'utf8'));
  assert.equal(cfg.database?.rules, 'database.rules.json',
    'o firebase.json precisa apontar para o arquivo de regras que versionamos');
});

test('todo nó que o app escreve está descrito nas regras', () => {
  const raiz = regras.rules;
  assert.ok(raiz, 'o arquivo precisa ter a chave "rules"');

  /* Nó sem regra é nó negado: o Realtime Database recusa por padrão. Cada um
     destes é escrito pelo app em uso normal. */
  const escritos = [
    'users', 'usernames', 'uids', 'groups', 'group_boards', 'shared_boards',
    'chats', 'groupChats', 'friends', 'inbox', 'forms', 'presence',
    'noteCollaboration',
  ];
  const ausentes = escritos.filter(no => !Object.prototype.hasOwnProperty.call(raiz, no));
  assert.deepEqual(ausentes, [], 'nó escrito pelo app e sem regra é escrita negada');
});

test('a delegação de nota tem regra nos dois tipos de workspace', () => {
  const colab = regras.rules.noteCollaboration;
  assert.ok(colab?.groups?.$groupId?.delegated,
    'sem esta regra, delegar tarefa em grupo é recusado com PERMISSION_DENIED');
  assert.ok(colab?.shared?.$uidA?.$uidB?.$boardKey?.delegated,
    'sem esta regra, delegar tarefa no 1:1 é recusado');
});

test('a delegação de pasta tem regra nos dois tipos de workspace', () => {
  const colab = regras.rules.noteCollaboration;
  const grupo = colab?.groups?.$groupId?.delegatedFolders?.$stackId;
  const umAUm = colab?.shared?.$uidA?.$uidB?.$boardKey?.delegatedFolders?.$stackId;
  assert.ok(grupo, 'sem esta regra, delegar pasta em grupo é recusado com PERMISSION_DENIED');
  assert.ok(umAUm, 'sem esta regra, delegar pasta no 1:1 é recusado');

  /* A pasta é ancorada em stacks/ — é o que impede gravar delegação sob um id
     que não corresponde a pasta nenhuma. Sem a âncora a regra vira escrita
     livre para qualquer membro. */
  assert.match(grupo.$uid['.write'], /group_boards[\s\S]*stacks/,
    'a delegação de pasta em grupo precisa conferir a pasta em stacks/');
  assert.match(umAUm.$uid['.write'], /shared_boards[\s\S]*stacks/,
    'a delegação de pasta no 1:1 precisa conferir a pasta em stacks/');

  // assignedBy é quem o app mostra como autor da delegação; se a regra não o
  // amarrasse ao autenticado, daria para assinar a delegação com o @ de outro.
  for (const no of [grupo, umAUm]) {
    assert.match(no.$uid['.validate'], /assignedBy/);
    assert.match(no.$uid.assignedBy['.validate'], /uids.*auth\.uid/);
    assert.match(no.$uid.username['.validate'], /uids.*\$uid/);
  }
});

test('o aviso de delegação cabe na regra da caixa de entrada', () => {
  /* O aviso é entregue com fbPush('inbox/<@>') — o mesmo caminho do chat. A
     regra exige type/from/ts e amarra o from ao autenticado; se o payload
     montado pelo app perder um desses campos, a entrega é recusada em silêncio
     e a delegação volta a ser muda. */
  const item = regras.rules.inbox?.$username?.$itemId;
  assert.ok(item, 'sem regra de inbox não há como avisar o delegado');
  assert.match(item['.validate'], /'type','from','ts'/);

  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const inicio = app.indexOf('function _avisarDelegacao(');
  assert.ok(inicio > 0, '_avisarDelegacao é quem entrega o aviso');
  const bloco = app.slice(inicio, app.indexOf('\n}', inicio));
  assert.match(bloco, /fbPush\('inbox\/' \+ paraUsername/);
  for (const campo of ['type:', 'from: CU.username', 'ts:']) {
    assert.ok(bloco.includes(campo), `o aviso precisa levar ${campo}`);
  }
  assert.match(bloco, /paraUsername === CU\.username/,
    'delegar para si mesmo não pode gerar aviso');
});
