'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O @ NUNCA É INVENTADO
   ═══════════════════════════════════════════════════════════════════════
   Entrando pelo ícone do Google, a pessoa escolhia o @ num overlay na
   página de login — e o app, ao abrir, jogava fora essa escolha e
   redescobria a identidade sozinho. Quando a leitura de uids/{uid} falhava
   ou ainda não tinha replicado, ele CHUTAVA, nesta ordem:

     username = user.displayName            → "Victor Azevedo"
     username = email.split('@')[0]         → com /gi, preservando maiúsculas

   e, se a reserva desse errado, ensureIdentity fazia `username = CU.uid` —
   28 caracteres com maiúsculas.

   Nenhum dos três passa na validate de usernames/$username. O resultado não
   era um erro na tela: a conta entrava normalmente, com um @ que não existia
   no banco. users/{@}/profile nunca era gravado sob a chave que a busca
   consulta, e sendFriendRequest, que começa por ler esse caminho, não
   achava ninguém. Conta criada, e invisível.

   A varredura fixa a única regra que importa: **o que o app considera um @
   válido tem de ser exatamente o que o banco aceita.** Qualquer chute que
   volte a aparecer quebra aqui.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP   = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
const LOGIN = fs.readFileSync(path.join(ROOT, 'docs/js/login.js'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu do app.js: ' + nome);
  const j = APP.indexOf(ate, i);
  return APP.slice(i, j + ate.length);
}
function recortarLinha(prefixo) {
  const i = APP.indexOf(prefixo);
  assert.ok(i > 0, 'sumiu do app.js: ' + prefixo);
  return APP.slice(i, APP.indexOf('\n', i));
}

/* Rodadas do arquivo real — copiá-las para cá faria o teste aprovar uma
   regra que o app não usa. */
const guardado = new Map();
const contexto = vm.createContext({
  CU: { uid: 'uid1', name: 'Victor Azevedo', email: 'victor.azevedo@gmail.com' },
  sessionStorage: {
    getItem: k => (guardado.has(k) ? guardado.get(k) : null),
    setItem: (k, v) => guardado.set(k, String(v)),
  },
});
vm.runInContext([
  recortarLinha('const APP_USERNAME_RE ='),
  recortar('function _usernameValido('),
  recortar('function _sanitizarUsername('),
  recortar('function _identHandoff('),
  recortar('function _sugestaoDeUsername('),
].join('\n'), contexto);

/* O mesmo julgamento, lido das REGRAS publicadas. */
function validadeDoBanco() {
  const bloco = RULES.slice(RULES.indexOf('"usernames"'));
  const achado = /"\.validate":\s*"([^"]+)"/.exec(bloco);
  assert.ok(achado, 'usernames/ perdeu o .validate');
  const texto = achado[1];
  const re = /matches\(\/(.+?)\/\)/.exec(texto);
  assert.ok(re, 'o .validate de usernames/ não tem mais matches(/…/)');
  const padrao = new RegExp(re[1]);
  const proibeDuplo = texto.includes("contains('__')");
  return nome => padrao.test(nome) && (!proibeDuplo || !String(nome).includes('__'));
}

const CASOS = [
  ['ana',                          true,  'mínimo de 3'],
  ['joao_silva',                   true,  'com sublinhado'],
  ['user123',                      true,  'com números'],
  ['abcdefghij0123456789',         true,  'exatamente 20'],
  ['ab',                           false, 'curto demais'],
  ['abcdefghij01234567890',        false, '21 caracteres'],
  ['Victor',                       false, 'maiúscula'],
  ['Victor Azevedo',               false, 'displayName do Google'],
  ['victor.azevedo',               false, 'ponto do e-mail'],
  ['joão',                         false, 'acento'],
  ['a__b',                         false, 'sublinhado duplo (colide com a chave do 1:1)'],
  ['',                             false, 'vazio'],
  ['xK3jf9DkLmNoPqRsTuVwXyZ12345', false, 'uid cru do Firebase'],
];

test('o @ que o app aceita é exatamente o que o banco aceita', () => {
  const banco = validadeDoBanco();
  for (const [nome, esperado, porque] of CASOS) {
    assert.equal(contexto._usernameValido(nome), esperado, `app: ${JSON.stringify(nome)} (${porque})`);
    assert.equal(banco(nome), esperado, `regras: ${JSON.stringify(nome)} (${porque})`);
  }
});

test('a página de login julga o @ igual ao app e ao banco', () => {
  const achado = /const USERNAME_RE = (\/.+\/);/.exec(LOGIN);
  assert.ok(achado, 'login.js perdeu o USERNAME_RE');
  const re = vm.runInNewContext(achado[1]);
  for (const [nome, esperado, porque] of CASOS) {
    assert.equal(re.test(nome), esperado, `login: ${JSON.stringify(nome)} (${porque})`);
  }
});

test('sanitizar nunca produz um @ que o banco recusaria por formato', () => {
  /* Não precisa devolver algo válido (pode ficar curto), mas o que devolve
     não pode ter maiúscula, espaço, acento nem sublinhado duplo. */
  ['Victor Azevedo', 'joão.silva', 'A__B', 'user@example.com', '  ', 'ÁÉÍÓÚ']
    .forEach(bruto => {
      const limpo = contexto._sanitizarUsername(bruto);
      assert.match(limpo, /^[a-z0-9_]*$/, `sujeira sobrou em ${JSON.stringify(bruto)}: ${limpo}`);
      assert.equal(limpo.includes('__'), false, `sublinhado duplo em ${JSON.stringify(bruto)}`);
      assert.ok(limpo.length <= 20);
    });
});

test('o @ escolhido no login chega ao app, e só para o uid que o escolheu', () => {
  guardado.set('md_ident', JSON.stringify({ uid: 'uid1', username: 'victor' }));
  assert.equal(contexto._identHandoff('uid1'), 'victor');

  /* Trocar de conta na mesma aba não pode herdar o @ da anterior. */
  assert.equal(contexto._identHandoff('uid2'), null, 'o @ vazou para outro uid');

  guardado.set('md_ident', JSON.stringify({ uid: 'uid1', username: 'Victor Azevedo' }));
  assert.equal(contexto._identHandoff('uid1'), null, 'handoff inválido tem de ser recusado');

  guardado.set('md_ident', 'nao é json');
  assert.equal(contexto._identHandoff('uid1'), null);
});

test('a sugestão é só um palpite para o campo — nunca um @ inválido', () => {
  const sugerido = contexto._sugestaoDeUsername();
  assert.equal(contexto._usernameValido(sugerido), true,
    'a sugestão vai pré-preenchida no campo; inválida, ela leva a pessoa ao erro');
});

/* Comentário que CITA o bug não é o bug — por isso a varredura lê o código
   sem comentários. E olha o caminho vivo de identidade, não o arquivo
   inteiro: app.js ainda carrega um bloco de auth órfão (a tela de login saiu
   do index.html), que tem cópias destes mesmos chutes. */
const semComentario = texto => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('os chutes que criavam conta invisível saíram do caminho de identidade', () => {
  const autoLogin = semComentario(recortar('function tryAutoLogin(', '\n  }'));
  const identidade = semComentario(recortar('async function ensureIdentity('));

  assert.equal(/username\s*=\s*user\.displayName/.test(autoLogin), false,
    'displayName do Google como @ — tem espaço e maiúscula');
  assert.equal(/replace\(\/\[\^a-z0-9_\]\/gi/.test(autoLogin), false,
    'derivação de e-mail com /gi preserva maiúsculas');
  assert.equal(/username\s*=\s*CU\.uid/.test(identidade), false,
    'uid cru como @ — 28 caracteres, as regras recusam as duas escritas');

  /* O @ que sobrar tem de ser validado antes de virar identidade. */
  assert.match(autoLogin, /_usernameValido\(username\)/,
    'sem essa peneira, qualquer coisa lida do banco vira @');
});

test('sem @ válido o app PERGUNTA, e só sai do laço com um @ reservado', () => {
  const corpo = recortar('async function ensureIdentity(');
  assert.match(corpo, /pedirUsernameNoApp/, 'ensureIdentity precisa perguntar quando não há @');
  assert.match(corpo, /while \(!reservado\)/, 'perguntar uma vez só deixa a conta sem @ se o 1º já for de outro');
  assert.match(corpo, /_reservarUsername/, 'a reserva tem de ser por transação');
  assert.ok(APP.includes('function pedirUsernameNoApp('), 'a tela de escolher @ sumiu');
});

test('a reserva do @ é atômica e não aceita formato inválido', () => {
  const corpo = recortar('async function _reservarUsername(');
  assert.match(corpo, /_usernameValido\(nome\)/, 'reservar sem validar grava chave que a regra recusa');
  assert.match(corpo, /\.transaction\(/, 'sem transação, duas pessoas tomam o mesmo @');
});

test('a checagem do @ no login separa "em uso" de "não deu para checar"', () => {
  assert.ok(LOGIN.includes('async function usernameState('), 'usernameState sumiu do login.js');
  const corpo = LOGIN.slice(LOGIN.indexOf('async function usernameState('));
  const fim = corpo.slice(0, corpo.indexOf('\n}') + 2);
  ['invalid', 'taken', 'free', 'unknown'].forEach(estado => {
    assert.match(fim, new RegExp(`'${estado}'`), `usernameState perdeu o estado ${estado}`);
  });

  /* O bug: catch devolvendo "indisponível". Enquanto _db era null (a página
     ligava o campo antes de qualquer loadFirebase), TODO @ digitado caía no
     catch e a tela dizia "já em uso". */
  assert.equal(/catch\s*\{\s*return false;\s*\}/.test(LOGIN), false,
    'falha de leitura voltou a ser tratada como @ ocupado');
  assert.match(fim, /loadFirebase\(\)/, 'checar antes do Firebase subir é checar contra null');
});

test('só "em uso" pinta o campo de vermelho e barra o cadastro', () => {
  const campo = LOGIN.slice(LOGIN.indexOf('function wireUsernameField('));
  const trecho = campo.slice(0, campo.indexOf("\n  return state;"));
  assert.match(trecho, /estado === 'taken'/, 'o vermelho tem de depender do estado, não do inverso de "livre"');

  assert.match(LOGIN, /usernameState\(chosen\) === 'taken'/,
    'o cadastro só pode ser barrado por @ comprovadamente tomado');
});

test('o @ escolhido viaja do login para o app', () => {
  const corpo = LOGIN.slice(LOGIN.indexOf('function goToApp('));
  const fim = corpo.slice(0, corpo.indexOf('\n}') + 2);
  assert.match(fim, /md_ident/, 'sem o repasse, o app volta a redescobrir a identidade sozinho');
  assert.match(fim, /username/);
});

test('pedido de amizade enviado pode ser cancelado, dos dois lados', () => {
  assert.ok(APP.includes('async function cancelFriendRequest('), 'a função de cancelar sumiu');
  const corpo = recortar('async function cancelFriendRequest(');

  /* Tirar só do meu lado deixaria o pedido vivo na tela da outra pessoa. */
  assert.match(corpo, /pending_out/, 'precisa sair dos meus enviados');
  assert.match(corpo, /pending_in/,  'precisa sair dos pedidos recebidos do outro');

  /* E o botão tem de existir na linha, senão a função é inalcançável. */
  const painel = APP.slice(APP.indexOf('// pending_out - async'));
  const bloco = painel.slice(0, painel.indexOf('} else if (socialTab'));
  assert.match(bloco, /cancelFriendRequest\(friend\)/, 'a linha de "Enviados" não tem botão de cancelar');
});
