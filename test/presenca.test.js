'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   "ONLINE" TEM DE SIGNIFICAR ONLINE AGORA
   ═══════════════════════════════════════════════════════════════════════
   presence/{uid} sai no onDisconnect — mas onDisconnect e uma promessa do
   SERVIDOR, e ela falha quando a conexao morre de um jeito que ele nao
   percebe: aba suspensa por dias, rede que cai sem FIN, processo morto. O
   registro fica para tras.

   O app sempre soube disso: isOnline() so aceita presenca com menos de 60s.
   O painel administrativo olhava so a EXISTENCIA do registro — e por isso
   mostrava uma conta "Online" com a coluna ao lado dizendo "ultimo acesso ha
   7 dias". As duas nao podem ser verdade juntas, e quem estava errado era o
   painel.

   A varredura fixa as duas pontas: o painel julga por FRESCOR, e a janela
   aceita continua sendo maior que o batimento — senao a pessoa piscaria
   entre online e offline entre uma batida e outra.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(RAIZ, 'docs/admin/admin.js'), 'utf8');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

const ctx = vm.createContext({ Date });
vm.runInContext(
  'const PRESENCA_VALIDA_MS = ' + /const PRESENCA_VALIDA_MS = (\d+)/.exec(ADMIN)[1] + ';\n' +
  recortar(ADMIN, 'function presencaFresca('),
  ctx
);

test('presenca de agora conta como online', () => {
  assert.equal(ctx.presencaFresca({ ts: Date.now() }), true);
  assert.equal(ctx.presencaFresca({ ts: Date.now() - 25000 }), true,
    'uma batida perdida nao pode derrubar a pessoa');
});

test('registro esquecido no banco NAO conta como online', () => {
  const seteDias = Date.now() - 7 * 24 * 60 * 60 * 1000;
  assert.equal(ctx.presencaFresca({ ts: seteDias }), false,
    'era este o caso: conta "Online" com ultimo acesso ha 7 dias');
  assert.equal(ctx.presencaFresca({ ts: Date.now() - 120000 }), false);
});

test('registro sem ts, vazio ou ausente nao inventa presenca', () => {
  [null, undefined, {}, { ts: 0 }, { ts: 'ontem' }, { status: 'online' }]
    .forEach(p => assert.equal(ctx.presencaFresca(p), false,
      'aceitou presenca sem instante: ' + JSON.stringify(p)));
});

test('o painel julga presenca pelo frescor nos DOIS lugares', () => {
  /* Um e a carga da lista, o outro e o ouvinte em tempo real. Consertar so
     um deixaria a tela certa ate o primeiro evento chegar. */
  assert.equal(/online:\s*!!p\b/.test(ADMIN), false,
    'a carga da lista voltou a olhar so a existencia do registro');
  assert.equal(/u\.online = !!p\[u\.uid\]/.test(ADMIN), false,
    'o ouvinte em tempo real voltou a olhar so a existencia');
  assert.equal((ADMIN.match(/presencaFresca\(/g) || []).length >= 3, true,
    'algum dos dois pontos deixou de usar o frescor');
});

test('o batimento cabe folgado dentro da janela aceita', () => {
  const batida = Number(/const PRESENCA_BATIDA_MS = (\d+)/.exec(APP)[1]);
  const janela = Number(/const PRESENCA_VALIDA_MS = (\d+)/.exec(ADMIN)[1]);

  assert.ok(batida > 0 && janela > 0);
  assert.ok(janela >= batida * 2,
    'a janela precisa dar pelo menos duas chances: com margem curta, uma '
    + 'batida atrasada faz a pessoa piscar entre online e offline');

  /* E o app precisa concordar com o painel sobre o que e "recente". */
  assert.ok(APP.includes('< 60000'),
    'isOnline do app deixou de usar a mesma janela de 60s do painel');
});

test('o batimento e usado de verdade, e nao so declarado', () => {
  assert.match(recortar(APP, 'function startOnlineHeartbeat('),
    /setInterval\([\s\S]*PRESENCA_BATIDA_MS\)/,
    'a constante existe mas o intervalo continua com numero solto');
});
