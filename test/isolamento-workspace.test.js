'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   NOTA DE UM QUADRO NÃO PODE SER GRAVADA EM OUTRO
   ═══════════════════════════════════════════════════════════════════════
   Em 01/08/2026, 18 notas do quadro pessoal e 6 de um workspace 1:1 foram
   parar dentro do quadro de um grupo. A causa não foi um caso exótico: era o
   comportamento normal de `saveNotes`, que gravava tudo o que estivesse no
   array `notes` dentro do quadro ATIVO, sem nunca perguntar de onde aquelas
   notas vieram.

   Trocar de workspace não é atômico. `_activeGroupWs` passa a apontar para o
   grupo antes de as notas do grupo chegarem do banco, e nessa janela o array
   ainda é o do quadro anterior. Qualquer save disparado ali — arrastar,
   editar, marcar um item, trocar a cor — despejava um quadro dentro do outro.

   Esta varredura existe porque a proteção é fácil de desfazer sem perceber:
   basta um `notes.push` novo sem carimbo, ou um `forEach` que volte a
   percorrer `notes` cru na hora de gravar. É o núcleo de sincronização de um
   app cuja proposta é que os workspaces sejam separados.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu do app.js: ' + nome);
  const j = APP.indexOf(ate, i);
  return APP.slice(i, j + ate.length);
}

/* As três funções da trava são puras o bastante para rodar aqui, lidas do
   arquivo real — copiá-las para o teste faria a varredura aprovar uma regra
   que o app não usa. */
const contexto = vm.createContext({ console: { warn() {} } });
vm.runInContext([
  'let _activeGroupWs = null, _activeWs = null, _activePersonalWs = null, CU = { uid: "u1" };',
  recortar('function _boardAtual('),
  recortar('function _marcarBoard('),
  recortar('function _notaDesteBoard('),
  recortar('function _triarNotas('),
  recortar('function _notasDesteBoard('),
  'globalThis.set = (g, s, p) => { _activeGroupWs = g; _activeWs = s; _activePersonalWs = p; };',
].join('\n'), contexto);

const { _boardAtual, _marcarBoard, _notaDesteBoard, _notasDesteBoard,
        _triarNotas: triar, set } = contexto;

const GRUPO   = { groupId: 'g1' };
const UM_A_UM = { key: 'ana__bia' };
const NOMEADO = { id: 'pw1' };

test('cada contexto de quadro tem identidade própria', () => {
  const vistas = new Set();
  [[null, null, null], [GRUPO, null, null], [null, UM_A_UM, null], [null, null, NOMEADO]]
    .forEach(([g, s, p]) => { set(g, s, p); vistas.add(_boardAtual()); });
  assert.equal(vistas.size, 4, 'dois contextos diferentes com a mesma identidade se misturam');
});

test('a nota nasce e é carregada com o carimbo do quadro em que estava', () => {
  set(null, null, null);
  const pessoal = _marcarBoard({ id: 1, title: 'minha' });
  set(GRUPO, null, null);
  const doGrupo = _marcarBoard({ id: 2, title: 'do grupo' });

  assert.notEqual(pessoal._board, doGrupo._board);
  assert.equal(_notaDesteBoard(doGrupo), true, 'nota do grupo, no grupo: pode');
  assert.equal(_notaDesteBoard(pessoal), false,
    'ESTE é o bug de 01/08: nota pessoal aceita dentro do grupo');
});

test('trocar de workspace com o array antigo em memória não vaza nada', () => {
  /* Reproduz a janela exata: as notas pessoais ainda estão no array quando o
     workspace de grupo já está ativo. */
  set(null, null, null);
  const emMemoria = [
    _marcarBoard({ id: 1, title: 'Criação de Site' }),
    _marcarBoard({ id: 2, title: 'Processo seletivo' }),
    _marcarBoard({ id: 3, title: 'currículo' }),
  ];
  set(GRUPO, null, null);
  /* .length e nao deepEqual: o array volta do VM com o prototipo daquele
     realm, e deepStrictEqual reprova por isso mesmo estando vazio. */
  assert.equal(_notasDesteBoard(emMemoria).length, 0,
    'nenhuma nota pessoal pode ser gravada no grupo');
});

test('o quadro 1:1 e o de grupo também não se misturam entre si', () => {
  set(null, UM_A_UM, null);
  const doUmAUm = [_marcarBoard({ id: 9, title: 'Feature - Mobile' })];
  set(GRUPO, null, null);
  assert.equal(_notasDesteBoard(doUmAUm).length, 0, '1:1 vazando para o grupo');
  set(null, UM_A_UM, null);
  assert.equal(_notasDesteBoard(doUmAUm).length, 1, 'de volta em casa, grava normal');
});

test('dois workspaces pessoais nomeados são quadros distintos', () => {
  set(null, null, { id: 'pwA' });
  const doA = [_marcarBoard({ id: 5, title: 'A' })];
  set(null, null, { id: 'pwB' });
  assert.equal(_notasDesteBoard(doA).length, 0, 'workspace nomeado vazando para outro');
});

test('nota SEM carimbo é aceita — a trava não pode apagar o que não conhece', () => {
  /* É a nota que já estava carregada quando esta versão entrou no ar. Uma
     trava que recusa o desconhecido não protege dado: impede de salvar. */
  set(GRUPO, null, null);
  const antiga = { id: 7, title: 'de antes da trava' };
  assert.equal(_notaDesteBoard(antiga), true);
  assert.equal(_notasDesteBoard([antiga]).length, 1);
});

/* ── A trava tem de estar LIGADA nos caminhos de escrita ── */
test('saveNotes não percorre o array cru para gravar', () => {
  const f = recortar('function saveNotes()');
  assert.ok(!/notes\.forEach\(n => save(Group|Shared)Note\(n\)\)/.test(f),
    'voltou a gravar o array inteiro sem filtrar por quadro');
  assert.match(f, /triado\.boas\.forEach\(n => saveGroupNote\(n\)\)/);
  assert.match(f, /triado\.boas\.forEach\(n => saveSharedNote\(n\)\)/);
  assert.match(f, /dentro\.boas\.map\(n => _noteToRaw\(n\)\)/,
    'o ramo do quadro pessoal ficou sem filtro');
});

test('o escritor por nota recusa sozinho, sem depender de quem o chamou', () => {
  /* Delegação, checklist e cor chamam saveGroupNote/saveSharedNote direto.
     Uma trava só em saveNotes deixaria todos esses caminhos abertos. */
  ['saveGroupNote', 'saveSharedNote'].forEach(nome => {
    const f = recortar('async function ' + nome + '(');
    assert.match(f, /_notaDesteBoard\(n\)/, nome + ' grava sem conferir o quadro');
  });
});

test('salvar o pessoal antes de trocar de quadro também filtra', () => {
  const f = recortar('async function _savePersonalNotesNow()');
  assert.match(f, /_triarNotas\(notes\)/);
  assert.match(f, /triado\.boas\.map/);
});

test('todo caminho que enche o array carimba a nota', () => {
  /* Um push sem carimbo é uma nota sem dono: ela passa na trava por ser
     "desconhecida" e volta a poder ir para qualquer quadro. */
  const semCarimbo = APP.split('\n')
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => /notes\.push\(/.test(l) && !/_marcarBoard/.test(l));
  assert.deepEqual(semCarimbo.map(x => x.n), [],
    'notes.push sem _marcarBoard nas linhas acima');
});

test('o carimbo não vaza para o banco', () => {
  /* `_board` é memória local. Gravado, viajaria junto na cópia e a nota
     chegaria ao outro quadro já se dizendo de lá. */
  ['function _noteToRaw(', 'function _collabNotePayload('].forEach(nome => {
    assert.ok(!/_board/.test(recortar(nome)), nome + ' passou a serializar _board');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   FILTRAR ATÉ SOBRAR NADA NÃO É "O QUADRO ESTÁ VAZIO"
   ═══════════════════════════════════════════════════════════════════════
   A trava de isolamento, sozinha, criou um dano PIOR do que o que ela
   consertava. `saveNotesRaw` trata array vazio como ordem de apagar o quadro
   — e tem de tratar, porque é assim que o "Limpar tudo" funciona. Quando a
   triagem esvaziava o array (todas as notas em memória eram de outro quadro,
   o que acontece no instante de sair de um grupo para o quadro pessoal), o
   save caía nesse caminho e APAGAVA o quadro inteiro.

   Em 01/08/2026 isso levou 20 notas do quadro pessoal a zero, minutos depois
   de elas terem sido restauradas. */
test('vazio POR TRIAGEM manda abortar, e não apagar', () => {
  set(null, null, null);
  const doPessoal = [_marcarBoard({ id: 1, title: 'a' }), _marcarBoard({ id: 2, title: 'b' })];
  set(GRUPO, null, null);
  const r = triar(doPessoal);
  assert.equal(r.boas.length, 0);
  assert.equal(r.alheias.length, 2);
  assert.equal(r.abortar, true,
    'sem isto o save grava vazio, e gravar vazio apaga o quadro');
});

test('vazio DE VERDADE não aborta — é o "Limpar tudo"', () => {
  set(null, null, null);
  const r = triar([]);
  assert.equal(r.abortar, false,
    'abortar aqui quebraria o Limpar tudo, que precisa gravar vazio');
});

test('array misto grava o que é daqui e não aborta', () => {
  set(null, null, null);
  const pessoal = _marcarBoard({ id: 1, title: 'minha' });
  set(GRUPO, null, null);
  const doGrupo = _marcarBoard({ id: 2, title: 'do grupo' });
  const r = triar([pessoal, doGrupo]);
  assert.equal(r.boas.length, 1);
  assert.equal(r.abortar, false);
});

test('os três caminhos de save abortam antes de gravar', () => {
  ['function saveNotes()', 'async function _savePersonalNotesNow()'].forEach(nome => {
    assert.match(recortar(nome), /abortar\) return;/,
      nome + ' pode gravar vazio e apagar o quadro');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   APAGAR O QUADRO É ORDEM, NÃO CONSEQUÊNCIA
   ═══════════════════════════════════════════════════════════════════════
   Array vazio significava "apague o quadro". Ninguém decidiu isso: veio de o
   "Limpar tudo" ser um `notes = []` seguido de save comum. O array fica vazio
   em vários instantes que nada têm a ver com querer apagar — logo depois de
   `notes = []` enquanto o quadro novo carrega, ou quando um save em debounce
   agendado antes da troca dispara já zerado. Foi o que apagou o quadro pessoal
   três vezes em 01/08/2026, inclusive depois de restaurado. */
test('save comum com array vazio NÃO apaga o quadro', () => {
  const f = recortar('function saveNotesRaw(');
  assert.match(f, /opcoes = \{\}/, 'saveNotesRaw perdeu o parâmetro de opções');
  const i = f.indexOf('Object.keys(obj).length === 0');
  const j = f.indexOf('fbSet(path, null)');
  assert.ok(i > 0 && j > i, 'o caminho de exclusão mudou de forma');
  assert.ok(f.slice(i, j).includes('!opcoes.podeApagar'),
    'sem esta guarda, todo save vazio volta a apagar o quadro inteiro');
  assert.ok(f.slice(i, j).includes('return Promise.resolve()'),
    'a recusa precisa sair ANTES do fbSet(path, null)');
});

test('só o "Limpar tudo" pede a exclusão, e pede com todas as letras', () => {
  /* Só a CHAMADA conta; o comentário que explica a regra também casa com o
     texto, e um teste que confunde documentação com código mente nos dois
     sentidos. */
  const chamadas = APP.match(/\{\s*podeApagar:\s*true\s*\}\s*\)/g) || [];
  assert.equal(chamadas.length, 1,
    'a permissão de apagar precisa ser pedida em UM lugar só — o "Limpar tudo"');
  /* E o pedido tem de estar DENTRO do diálogo de confirmação — não perto
     dele. Recortar a função inteira é o que amarra a permissão ao "Sim,
     apagar tudo", em vez de a uma distância no arquivo. */
  const dialogo = recortar('function showConfirmClear()');
  assert.ok(dialogo.includes('{ podeApagar: true })'),
    'quem pede para apagar não é o diálogo do "Limpar tudo"');
  assert.ok(dialogo.includes('confirm-clear-ok'),
    'o recorte não pegou o diálogo de confirmação');
});

test('nenhum outro caminho apaga o quadro pessoal por gravação vazia', () => {
  /* `fbSet(caminho, ... : null)` com o null vindo de um ternário é a forma
     exata que o bug tinha: o vazio decide sozinho apagar. */
  const suspeitas = APP.split('\n')
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => /fbSet\(_pwPath\([^)]*\),[^)]*\?[^)]*:\s*null\)/.test(l));
  assert.deepEqual(suspeitas.map(x => x.n), [],
    'gravação que apaga sozinha quando o objeto está vazio, nas linhas acima');
});

/* ═══════════════════════════════════════════════════════════════════════
   CARREGAMENTO ATRASADO NÃO PODE POUSAR NO QUADRO ERRADO
   ═══════════════════════════════════════════════════════════════════════
   Trocar de quadro é síncrono; carregar o novo é `await`. Entre as duas coisas
   há um intervalo, e quem estava carregando o quadro ANTERIOR volta dentro
   dele — com o quadro já trocado.

   O caso relatado: ir de um workspace 1:1 direto para um de grupo, sem sair
   antes. `switchToGroupWorkspace` chama `switchToPersonal()` sem `await`; essa
   função limpa o array e espera o quadro pessoal chegar do banco. Enquanto
   isso a troca segue e `_activeGroupWs` é definido. Quando as notas pessoais
   chegam, são despejadas no array e carimbadas com `_boardAtual()` — que já
   responde "grupo". A trava de isolamento não tinha como perceber: as notas
   chegaram dizendo, com toda a sinceridade, que eram do grupo. */
const geracao = vm.runInContext(
  'globalThis._g = { nova: _novaGeracaoQuadro, vale: _geracaoValida, ' +
  'atual: () => _geracaoQuadro }; 1',
  (vm.runInContext(
    [recortar('function _novaGeracaoQuadro(', '}'),
     recortar('function _geracaoValida(', '}'),
     'let _geracaoQuadro = 0;'].join('\n'), contexto), contexto)) && contexto._g;

test('o selo avança a cada troca e invalida o que ficou para trás', () => {
  const antes = geracao.nova();
  assert.equal(geracao.vale(antes), true, 'o selo recém-tirado tem de valer');
  geracao.nova();
  assert.equal(geracao.vale(antes), false,
    'depois de outra troca, a carga anterior não pode mais pousar');
});

test('as três trocas de quadro avançam o selo', () => {
  ['function switchToGroupWorkspace(', 'function switchToWorkspace(',
   'async function switchToPersonal()'].forEach(nome => {
    const f = recortar(nome);
    const corpo = f.slice(0, 400);
    assert.ok(corpo.includes('_novaGeracaoQuadro()'),
      nome + ' troca de quadro sem avançar o selo');
  });
});

test('os três carregadores desistem se o selo mudou', () => {
  ['async function _restorePersonalBoard()', 'async function loadGroupBoardNotes(',
   'async function loadSharedNotes('].forEach(nome => {
    const f = recortar(nome);
    assert.ok(/const geracao = _geracaoQuadro;/.test(f),
      nome + ' não guarda o selo de quando começou');
    assert.ok(/_geracaoValida\(geracao\)/.test(f),
      nome + ' monta sem conferir se o quadro ainda é o mesmo');
  });
});

test('a checagem vem ANTES de encher o array, não depois', () => {
  /* Conferir depois de montar não evita nada: as notas já estariam no array,
     já carimbadas com o quadro errado. */
  const f = recortar('async function _restorePersonalBoard()');
  const check = f.indexOf('_geracaoValida(geracao)');
  const push  = f.indexOf('notes.push(');
  assert.ok(check > 0 && push > check,
    'a desistência precisa acontecer antes do primeiro notes.push');
});

/* ═══════════════════════════════════════════════════════════════════════
   SAIR DE UM QUADRO É PASSO, NÃO DETALHE
   ═══════════════════════════════════════════════════════════════════════
   O selo de geração, sozinho, NÃO resolveu — e o motivo é instrutivo. Quem
   chama `switchToPersonal` ao trocar de quadro é o próprio
   `switchToGroupWorkspace`, e `switchToPersonal` avançava o selo DEPOIS. O
   carregamento do quadro pessoal ficava então com o número mais novo e passava
   na própria trava: chegava atrasado segurando o crachá mais recente.

   A pergunta certa não é "o selo ainda é o meu?", é "eu ainda estou no quadro
   pessoal?". Essa não depende de ordem de chamada nem de quem avançou o quê. */
test('o carregamento do quadro pessoal desiste se um workspace está ativo', () => {
  const f = recortar('async function _restorePersonalBoard()');
  assert.match(f, /if \(_activeGroupWs \|\| _activeWs\) return;/,
    'sem esta guarda, a carga atrasada monta o pessoal dentro do quadro alheio');

  const guarda = f.indexOf('if (_activeGroupWs || _activeWs) return;');
  const push   = f.indexOf('notes.push(');
  assert.ok(guarda > 0 && push > guarda,
    'a desistência precisa vir antes do primeiro notes.push');
});

test('nem o aviso de "workspace pessoal restaurado" escapa', () => {
  /* O toast sobre um quadro de grupo foi o sintoma que denunciou tudo: se ele
     aparece, é porque a função foi até o fim com o quadro errado aberto. */
  const f = recortar('async function _restorePersonalBoard()');
  const i = f.indexOf("toast('📋'");
  assert.ok(i > 0, 'o aviso mudou de forma');
  const antes = f.slice(0, i);
  assert.equal((antes.match(/if \(_activeGroupWs \|\| _activeWs\) return;/g) || []).length, 2,
    'o aviso precisa de uma guarda própria, logo antes dele');
});

test('trocar de quadro espera a saída do anterior', () => {
  /* Sem `await`, a saída e a entrada correm juntas: o quadro que sai despeja
     as notas dentro do que entra. */
  ['async function switchToGroupWorkspace(', 'async function switchToWorkspace(']
    .forEach(nome => {
      const f = recortar(nome);
      assert.ok(/^async function/.test(nome), nome + ' precisa ser async');
      assert.match(f.slice(0, 500), /await (switchToPersonal\(\)|leaveGroupWorkspace\()/,
        nome + ' entra no quadro novo sem esperar a saída do anterior');
    });
});

test('quem inicia ou entra num workspace de grupo também espera', () => {
  ['async function openGroupWorkspace(', 'async function joinGroupWorkspace(']
    .forEach(nome => {
      const f = recortar(nome);
      assert.match(f, /await switchToGroupWorkspace\(/,
        nome + ' segue para o toast antes de a troca terminar');
    });
});

/* ═══════════════════════════════════════════════════════════════════════
   AS REGRAS ESCRITAS E O CÓDIGO NÃO PODEM SE SEPARAR
   ═══════════════════════════════════════════════════════════════════════
   REGRAS-WORKSPACE.md é o documento de referência sobre separação de quadros.
   Documento que descreve um código que não existe mais é pior do que
   documento nenhum: ele passa confiança sem ter com o quê. Estas varreduras
   amarram os dois — se uma função citada no documento for renomeada ou sumir,
   isto aqui fica vermelho antes de alguém ler a promessa errada. */
const REGRAS = fs.readFileSync(
  path.join(__dirname, '..', 'REGRAS-WORKSPACE.md'), 'utf8');

test('as quatro regras estão escritas no documento', () => {
  ['Cada workspace é individual',
   'sincroniza entre os seus participantes',
   'Nenhum workspace puxa, copia ou cola do pessoal',
   'Apagar um quadro é ordem, nunca consequência',
  ].forEach(regra => assert.ok(REGRAS.includes(regra),
    'sumiu do REGRAS-WORKSPACE.md: ' + regra));
});

test('toda função citada no documento existe mesmo no app', () => {
  const citadas = [...new Set(
    (REGRAS.match(/`(_?[a-zA-Z][\w]*)\(\)`/g) || [])
      .map(m => m.replace(/[`()]/g, '')))];
  assert.ok(citadas.length >= 6, 'o documento deixou de citar o código');
  // `includes` e não RegExp montada: '\b' numa string JS é backspace, não
  // limite de palavra, e a varredura passava a aprovar qualquer coisa.
  const ausentes = citadas.filter(f => !APP.includes('function ' + f + '('));
  assert.deepEqual(ausentes, [],
    'o documento cita função que não existe mais em app.js');
});

test('os caminhos do banco no documento são os que o app usa', () => {
  [['users/{uid}/notes', "'users/' + CU.uid + '/notes'"],
   ['users/{uid}/personalBoards/{id}/notes', "'/personalBoards/'"],
   ['shared_boards/{chave}/notes', "'shared_boards/'"],
   ['group_boards/{groupId}/notes', "'group_boards/'"],
  ].forEach(([noDoc, noApp]) => {
    assert.ok(REGRAS.includes(noDoc), 'o documento não descreve mais ' + noDoc);
    assert.ok(APP.includes(noApp), 'o app não usa mais ' + noApp);
  });
});

test('o núcleo de sincronização aponta para o documento', () => {
  /* Quem chega para mexer aqui precisa esbarrar nas regras antes de escrever a
     primeira linha. Documento que ninguém encontra não protege nada. */
  assert.match(APP, /LEIA REGRAS-WORKSPACE\.md ANTES DE MEXER/,
    'o aviso sumiu do app.js');
  const aviso = APP.indexOf('LEIA REGRAS-WORKSPACE.md');
  const troca = APP.indexOf('async function switchToGroupWorkspace(');
  assert.ok(aviso > 0 && aviso < troca,
    'o aviso precisa vir ANTES das funções de troca de quadro');
});
