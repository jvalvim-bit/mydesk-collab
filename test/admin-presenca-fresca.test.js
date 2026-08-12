'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   "ONLINE" QUE NÃO ERA — E "ONLINE" QUE ERA, MAS PARECIA ERRADO
   ═══════════════════════════════════════════════════════════════════════
   O painel mostrava contas "Online" ao lado de um último acesso de dias
   atrás. Duas coisas diferentes se escondiam atrás do mesmo sintoma, e só uma
   delas era defeito:

   1. **O status congelava.** `presencaFresca` já rejeitava carimbo com mais de
      60s, mas só era chamada em dois momentos: na carga e quando o nó
      `presence` MUDAVA. O caso em que alguém aparece online sem estar é
      exatamente o caso em que o nó PARA de mudar — o `onDisconnect` falhou
      (aba suspensa, rede caída sem FIN, processo morto) e o registro ficou
      para trás. Ninguém mais escrevia nele, ninguém mais perguntava, e a
      pessoa seguia "Online" enquanto o carimbo envelhecia. Pior: enquanto
      houvesse OUTRA pessoa online de verdade, a batida dela a cada 30s
      mexia no nó e corrigia todos — o erro só aparecia quando não havia mais
      ninguém para desmenti-lo.

   2. **A coluna prometia o que não tinha.** "Último acesso" sempre foi
      `lastSignInTime` do Auth, que muda no SIGN-IN. A sessão do Firebase dura
      meses, então quem entrou uma vez e nunca deslogou usa o app todo dia sem
      gerar login novo. "Online" + "há 2 dias" eram as duas verdadeiras.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(RAIZ, 'docs/admin/admin.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = ADMIN.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return ADMIN.slice(i, ADMIN.indexOf(ate, i) + ate.length);
}

/* ── A regra de frescura, rodando de verdade ─────────────────────────── */

function montar() {
  const ctx = vm.createContext({ Date, Number, console });
  vm.runInContext(
    'const PRESENCA_VALIDA_MS = 60000;\n' + recortar('function presencaFresca('), ctx);
  return ctx;
}

test('presenca so vale por 60s — o resto e registro orfao', () => {
  const ctx = montar();
  const agora = Date.now();
  assert.equal(ctx.presencaFresca({ ts: agora }), true);
  assert.equal(ctx.presencaFresca({ ts: agora - 30000 }), true,
    'uma batida perdida nao pode declarar a pessoa offline');
  assert.equal(ctx.presencaFresca({ ts: agora - 61000 }), false,
    'registro que o onDisconnect nao apagou nao e presenca');
  assert.equal(ctx.presencaFresca({ ts: agora - 2 * 24 * 3600 * 1000 }), false,
    'foi este o caso visto na tela: "Online" com dois dias de idade');
  assert.equal(ctx.presencaFresca(null), false);
  assert.equal(ctx.presencaFresca({}), false, 'registro sem ts nao afirma nada');
});

/* ── O relógio: frescura é função do tempo, não de evento ────────────── */

test('a frescura e reavaliada por TEMPO, e nao so quando o no muda', () => {
  assert.match(ADMIN, /setInterval\(aplicarPresenca, 15000\)/,
    'sem relogio, quem parou de bater fica "Online" para sempre');
  const fn = recortar('function aplicarPresenca(');
  assert.match(fn, /presencaFresca\(p\)/);
  assert.match(fn, /if \(u\.online !== online \|\| u\.statusPresenca !== status\) mudou = true/);
  assert.match(fn, /if \(!mudou\) return;/,
    'repintar sem mudanca roubaria o foco da busca a cada 15s');
});

test('sem leitura do banco, ninguem e declarado offline', () => {
  /* O contrario seria trocar um erro por outro: uma falha de permissao ou de
     rede derrubaria a coluna inteira para offline, com a mesma cara de
     certeza que o bug antigo tinha. */
  const fn = recortar('function aplicarPresenca(');
  assert.match(fn, /if \(!_presencaLida\) return;/);
  assert.match(ADMIN, /let _presencaLida\s+= false;/);
  // O ouvinte marca a leitura…
  assert.match(ADMIN, /_presencaBruta = snap\.val\(\) \|\| \{\};\s*\n\s*_presencaLida\s+= true;/);
  // …e a carga inicial também, senão o relógio ficaria mudo até o nó mudar —
  // que é o que não acontece no caso do registro órfão.
  assert.match(ADMIN, /if \(presenca !== null\) \{ _presencaBruta = pres; _presencaLida = true; \}/);
});

/* ── A coluna diz o que mede ─────────────────────────────────────────── */

test('a coluna se chama "Último login", porque e isso que ela mede', () => {
  assert.match(ADMIN, /'Uso mensal', 'Status', 'Último login', ''\]/);
  assert.equal(/'Status', 'Último acesso'/.test(ADMIN), false,
    'o rotulo voltou a prometer "acesso" mostrando data de login');
  assert.match(ADMIN, /\$\{linha\('Último login', dataHora\(u\.ultimoAcesso\)\)\}/);
});

test('quem esta online agora ganha a explicacao da data antiga', () => {
  /* "Online" ao lado de "há 2 dias" continua sendo o que os dados dizem — mas
     agora a tela conta por quê, em vez de deixar a contradicao de pe. */
  const i = ADMIN.indexOf('data-rot="Último login"');
  assert.ok(i > 0);
  const celula = ADMIN.slice(i, i + 500);
  assert.match(celula, /u\.online/);
  assert.match(celula, /sessão do Firebase não expira a cada uso/);
});
