const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appPath = path.resolve(__dirname, '..', 'docs', 'js', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');

test('workspace 1:1 ativo e vazio usa status e membership como fonte de verdade', () => {
  assert.match(source, /status === 'active' && membro/);
  assert.match(source, /members:\s*memberMap/);
  assert.doesNotMatch(
    source,
    /if\s*\(!temConteudo\s*&&\s*!aberto\)\s*continue/,
    'a listagem nao pode depender apenas da existencia de notas',
  );
});

test('saves colaborativos sao serializados e preservam delegacao', () => {
  assert.match(source, /const _collabNoteSaveQueues = new Map\(\)/);
  assert.match(source, /async function saveGroupNote\(n, options = \{\}\)/);
  assert.match(source, /await _queueCollabNoteWrite\(path, _collabNotePayload\(n\)\)/);
  /* assignedBy deixou de ser CU.username: a regra do banco compara com
     uids/{auth.uid}, e os dois podem divergir — uids é gravado uma vez só e
     nunca atualizado. Escrever da mesma fonte que a regra confere é o que
     tirou o PERMISSION_DENIED da delegação. */
  assert.match(source, /assignedBy:\s*nomeEu/);
  assert.match(source, /fbGet\('uids\/' \+ CU\.uid\)/,
    'o nome precisa vir de uids, que é a fonte que a regra usa');
  assert.match(source, /ts:\s*firebase\.database\.ServerValue\.TIMESTAMP/);
});

test('atividade usa timestamp do servidor, baseline e caminho capturado no debounce', () => {
  assert.match(source, /function registrarAtividade\(acao, alvo, caminhoExplicito\)/);
  assert.match(source, /const chave = caminho \+ '::' \+ _idSeguro\(n\.id\)/);
  assert.match(source, /registrarAtividade\('editou', item\.titulo, item\.caminho\)/);
  assert.match(source, /snapshot\.forEach\(child => _ativSeen\.add\(child\.key\)\)/);
  assert.match(source, /_ativSeen\.has\(snap\.key\)/);
});

test('notas colaborativas persistem checklist, pin e dimensoes', () => {
  /* O save colaborativo grava a checklist já normalizada. A asserção anterior
     exigia o formato cru (checklist:n.checklist||[]), que deixou de existir
     quando a normalização entrou — o teste apontava para a versão antiga do
     próprio código que ele deveria proteger. */
  assert.match(source, /checklist:_normalizarChecklist\(n\.checklist\)/);
  assert.match(source, /pinned:!!n\.pinned, w:Number\(n\.w\)\|\|0, h:Number\(n\.h\)\|\|0/);
  assert.match(source, /const checklistNova = _normalizarChecklist\(data\.checklist\)/);
  assert.match(source, /if \(data\.w !== undefined\)/);
  assert.match(source, /if \(data\.h !== undefined\)/);
});

test('corpo da nota mostra 290 caracteres antes do scroll e viewport retrato e detectado', () => {
  assert.match(source, /const NOTE_BODY_PREVIEW_CHARS = 290/);
  assert.match(source, /function _ajustarCorpoNota\(ta\)/);
  assert.match(source, /classList\.toggle\('layout-portrait', portraitDesktop\)/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize'/);
});
