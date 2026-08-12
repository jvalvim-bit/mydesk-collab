'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O IDIOMA DA PRIMEIRA VISITA
   ═══════════════════════════════════════════════════════════════════════
   Três fontes, e a ORDEM delas é o que este arquivo protege:

   1. O que a pessoa escolheu. Escolha não se adivinha de novo.
   2. A REGIÃO — é ela que decide.
   3. O idioma do navegador, como palpite enquanto a região não responde, e
      se ela nunca responder.

   A região vem antes do navegador por decisão de produto, e a consequência
   está aqui para quem ler depois: quem está fora do país de origem vê a
   língua do lugar onde está, e não a que fala. Trocar no seletor uma vez
   encerra o assunto para sempre naquele navegador.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const I18N = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');

function recortar(nome, ate = '\n  }') {
  const i = I18N.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return I18N.slice(i, I18N.indexOf(ate, i) + ate.length);
}

/* O mapa de país → idioma sai do arquivo e roda de verdade. */
function mapa() {
  const ctx = vm.createContext({ String, Date, JSON, localStorage: null });
  vm.runInContext(I18N.slice(I18N.indexOf('  const PAISES_ES = ['),
                             I18N.indexOf('  function paisGuardado(')), ctx);
  return ctx.idiomaDoPais;
}

test('Estados Unidos e Europa caem no ingles', () => {
  const de = mapa();
  ['US', 'CA', 'GB', 'DE', 'FR', 'IT', 'NL', 'PL', 'SE', 'JP', 'AU']
    .forEach(p => assert.equal(de(p), 'en', p + ' deveria abrir em ingles'));
});

test('Espanha, Mexico e a America hispanica caem no espanhol', () => {
  const de = mapa();
  ['ES', 'MX', 'AR', 'CL', 'CO', 'PE', 'VE', 'UY', 'PY', 'BO', 'EC']
    .forEach(p => assert.equal(de(p), 'es', p + ' deveria abrir em espanhol'));
});

test('Brasil e Portugal caem no portugues', () => {
  const de = mapa();
  ['BR', 'PT', 'AO', 'MZ'].forEach(p => assert.equal(de(p), 'pt'));
});

test('America do Sul que NAO fala espanhol nao vai para o espanhol', () => {
  /* Guiana, Suriname e Guiana Francesa sao America do Sul e falam ingles,
     holandes e frances. Uma regra por continente as poria em espanhol. */
  const de = mapa();
  ['GY', 'SR', 'GF'].forEach(p => assert.equal(de(p), 'en', p));
});

test('pais desconhecido nao quebra, e cai no ingles', () => {
  const de = mapa();
  assert.equal(de(''), null);
  assert.equal(de('ZZ'), 'en');
  assert.equal(de(null), null);
});

test('a escolha da pessoa vence tudo — e so ela barra a consulta', () => {
  const fn = recortar('  function ajustarPelaRegiao(');
  assert.match(fn, /if \(readStoredLanguage\(\)\) return;/);
  /* O idioma do navegador NAO barra mais a regiao: era isso que fazia um
     navegador em portugues com IP europeu continuar em portugues. */
  assert.equal(/normalizeLanguage\(navigator\.language/.test(fn), false,
    'o navegador voltou a impedir a consulta de regiao');
  const iEscolha = fn.indexOf('readStoredLanguage()');
  const iRede = fn.indexOf('descobrirRegiao()');
  assert.ok(iEscolha >= 0 && iEscolha < iRede, 'a escolha deixou de vir primeiro');
});

test('o navegador e o palpite ate a regiao chegar', () => {
  /* A pagina nasce em alguma lingua em vez de esperar a rede — e continua
     nela se a consulta falhar. */
  const fn = recortar('  function browserLanguage(');
  assert.match(fn, /normalizeLanguage\(navigator\.language \|\| navigator\.userLanguage\)/);
  assert.match(I18N, /let currentLanguage = readStoredLanguage\(\) \|\| browserLanguage\(\);/);
});

test('o palpite da regiao NAO e gravado como escolha', () => {
  /* Guardar faria a pessoa que nunca abriu o seletor ficar presa nele — e,
     pior, faria o palpite vencer o navegador na visita seguinte. */
  const fn = recortar('  function aplicarIdiomaDaRegiao(');
  assert.match(fn, /setLanguage\(idioma, \{ persist: false \}\)/);
  assert.match(fn, /if \(!idioma \|\| idioma === currentLanguage\) return;/);
});

test('a consulta nao bloqueia, desiste sozinha e falha em silencio', () => {
  /* Passados tres segundos a pessoa ja esta lendo a pagina, e trocar o idioma
     debaixo dos olhos dela e pior do que manter o palpite. */
  const fn = recortar('  function descobrirRegiao(');
  assert.match(fn, /setTimeout\(\(\) => \{ try \{ controle && controle\.abort\(\); \}/);
  assert.match(fn, /3000\)/);
  assert.match(fn, /\.catch\(\(\) => null\)/);
  assert.match(fn, /credentials: 'omit'/);
  assert.match(fn, /clearTimeout\(relogio\)/, 'o relogio ficou pendurado');
});

test('a resposta e guardada, com validade', () => {
  /* Sem cache, um pedido por carregamento de pagina. Sem validade, quem se
     muda de pais fica na lingua antiga para sempre. */
  assert.match(I18N, /const CHAVE_PAIS = 'md_pais';/);
  /* Um dia: com validade longa, quem viaja ou desliga a VPN ficaria preso na
     lingua da consulta anterior. */
  assert.match(I18N, /const VALIDADE_PAIS = 24 \* 60 \* 60 \* 1000;/);
  const fn = recortar('  function paisGuardado(');
  assert.match(fn, /Date\.now\(\) - \(Number\(dado\.em\) \|\| 0\) > VALIDADE_PAIS/);
  // E localStorage bloqueado nao derruba a pagina.
  assert.match(fn, /catch \(_\) \{ return null; \}/);
});

test('o palpite sincrono de navegador desconhecido e ingles, e nao portugues', () => {
  /* Quem chega com o navegador em alemao tem mais chance de ler ingles do que
     portugues — e a regiao corrige logo em seguida se for o caso. */
  const fn = recortar('  function browserLanguage(');
  assert.match(fn, /\|\| 'en';/);
});

test('a origem da consulta esta liberada na CSP', () => {
  /* Sem isso o navegador recusa o pedido e a regiao nunca chega — sem erro
     visivel alem do aviso de CSP no console. */
  const csp = HTML.slice(HTML.indexOf('Content-Security-Policy'),
                         HTML.indexOf('<title'));
  assert.match(csp, /connect-src[^;]*https:\/\/ipapi\.co/);
});

test('a deteccao roda no arranque do i18n', () => {
  assert.match(I18N, /renderSelectors\(\);\s*\n\s*applyLanguage\(\);/);
  assert.match(I18N, /try \{ ajustarPelaRegiao\(\); \}/);
});

test('a landing tambem libera a origem, porque ela e a porta de entrada', () => {
  /* E la que a primeira visita chega. Liberar so no app deixaria justamente a
     pagina que precisa da deteccao sem ela. */
  const LANDING = fs.readFileSync(path.join(RAIZ, 'docs/landing.html'), 'utf8');
  const csp = LANDING.slice(LANDING.indexOf('Content-Security-Policy'),
                            LANDING.indexOf('<title'));
  assert.match(csp, /connect-src[^;]*https:\/\/ipapi\.co/);
  assert.match(LANDING, /js\/i18n\.js/, 'a landing nao carrega o i18n');
});

/* ═══════════════════════════════════════════════════════════════════════
   O CAMINHO INTEIRO, EXECUTADO
   ═══════════════════════════════════════════════════════════════════════
   Os testes acima liam o codigo e conferiam o mapa de paises. Passaram todos
   enquanto a deteccao NAO funcionava no navegador: eu tinha escrito `global.`
   num modulo que recebe a janela como `window`, e em modo estrito ler um nome
   que nao existe nao devolve undefined — ele ESTOURA. O estouro acontecia
   dentro do init, depois de a pagina ja estar traduzida, entao a tela parecia
   certa e a regiao nunca era consultada.

   Este bloco monta o modulo como o navegador monta: um contexto onde `window`
   existe e `global` NAO. Se alguem escrever um nome de fora outra vez, o
   teste cai aqui.
   ═══════════════════════════════════════════════════════════════════════ */
function rodarDeteccao({ navegador, pais, guardado }) {
  const armazem = Object.assign({}, guardado || {});
  const ctx = {
    String, Date, JSON, Number, Object, Promise, setTimeout, clearTimeout, console,
    aplicado: null, pedidos: 0,
  };
  ctx.window = {
    fetch: () => {
      ctx.pedidos++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ country_code: pais }) });
    },
  };
  ctx.navigator = { language: navegador };
  ctx.localStorage = {
    getItem: k => (k in armazem ? armazem[k] : null),
    setItem: (k, v) => { armazem[k] = String(v); },
  };
  ctx.AbortController = function () { this.signal = {}; this.abort = () => {}; };
  vm.createContext(ctx);
  vm.runInContext([
    "const LOCALES = { pt:1, en:1, es:1 };",
    "const STORAGE_KEY = 'md_lang';",
    "let currentLanguage = 'pt';",
    "function normalizeLanguage(v){var l=String(v||'').trim().toLowerCase()",
    "  .replace('_','-').split('-')[0]; return LOCALES[l] ? l : null; }",
    "function readStoredLanguage(){ return normalizeLanguage(localStorage.getItem(STORAGE_KEY)); }",
    "function setLanguage(l, o){ aplicado = l; currentLanguage = l;",
    "  if (!o || o.persist !== false) localStorage.setItem(STORAGE_KEY, l); return true; }",
  ].join('\n'), ctx);
  /* O bloco da regiao, tal como esta no arquivo. */
  vm.runInContext(I18N.slice(I18N.indexOf('  const CHAVE_PAIS'),
                             I18N.indexOf('  function init()')), ctx);
  vm.runInContext('ajustarPelaRegiao();', ctx);
  return new Promise(ok => setTimeout(() => ok({
    idioma: ctx.aplicado, pedidos: ctx.pedidos, armazem,
  }), 20));
}

test('navegador em portugues com IP europeu ABRE EM INGLES', async () => {
  /* Era exatamente o caso que nao funcionava. */
  const r = await rodarDeteccao({ navegador: 'pt-BR', pais: 'DE' });
  assert.equal(r.idioma, 'en');
  assert.equal(r.pedidos, 1, 'a consulta nao chegou a acontecer');
});

test('navegador em portugues com IP mexicano abre em espanhol', async () => {
  const r = await rodarDeteccao({ navegador: 'pt-BR', pais: 'MX' });
  assert.equal(r.idioma, 'es');
});

test('IP brasileiro nao mexe em nada, porque a pagina ja esta em portugues', async () => {
  const r = await rodarDeteccao({ navegador: 'pt-BR', pais: 'BR' });
  assert.equal(r.idioma, null, 'repintou a tela para dizer a mesma coisa');
});

test('quem ja escolheu o idioma nao e consultado nem perguntado', async () => {
  const r = await rodarDeteccao({ navegador: 'en-US', pais: 'DE',
    guardado: { md_lang: 'pt' } });
  assert.equal(r.idioma, null);
  assert.equal(r.pedidos, 0, 'gastou um pedido para ignorar a resposta');
});

test('o palpite da regiao nao vira escolha guardada', async () => {
  const r = await rodarDeteccao({ navegador: 'pt-BR', pais: 'US' });
  assert.equal(r.idioma, 'en');
  assert.equal(r.armazem.md_lang, undefined, 'gravou o palpite como escolha');
  assert.ok(r.armazem.md_pais, 'nao guardou o pais, e vai perguntar a cada carga');
});

test('com o pais em cache, nao ha pedido nenhum', async () => {
  const r = await rodarDeteccao({ navegador: 'pt-BR', pais: 'DE',
    guardado: { md_pais: JSON.stringify({ pais: 'FR', em: Date.now() }) } });
  assert.equal(r.idioma, 'en');
  assert.equal(r.pedidos, 0);
});

test('cache vencido volta a perguntar', async () => {
  const velho = Date.now() - (25 * 60 * 60 * 1000);   // 25 horas
  const r = await rodarDeteccao({ navegador: 'pt-BR', pais: 'MX',
    guardado: { md_pais: JSON.stringify({ pais: 'BR', em: velho }) } });
  assert.equal(r.pedidos, 1, 'ficou preso no pais da consulta anterior');
  assert.equal(r.idioma, 'es');
});

test('um estouro na deteccao nao derruba o resto do i18n', () => {
  /* Foi o que aconteceu: o erro parou o init no meio, e o observador que
     traduz o que nasce depois nunca era ligado. */
  assert.match(I18N, /try \{ ajustarPelaRegiao\(\); \} catch \(e\) \{ console\.warn/);
});

test('nada de `global.` neste modulo', () => {
  /* Ele recebe a janela como `window`. `global` nao existe aqui, e em modo
     estrito isso estoura em vez de virar undefined. */
  assert.equal(/\bglobal\./.test(I18N), false, 'voltou um nome de fora do modulo');
});
