'use strict';
/* A página admin ficou em português com a interface em inglês, e nada acusou:
   texto sem tradução não quebra layout nem gera erro de console — só aparece
   na língua errada para quem está olhando. Estes testes fecham as duas portas
   por onde isso entrou. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');

function carregarCatalogo() {
  const guardado = new Map();
  const contexto = {
    window: { addEventListener() {}, dispatchEvent() {} },
    document: {
      body: null,
      documentElement: { lang: '', dataset: {} },
      addEventListener() {}, querySelectorAll() { return []; },
    },
    navigator: { language: 'pt-BR' },
    localStorage: {
      getItem(k) { return guardado.has(k) ? guardado.get(k) : null; },
      setItem(k, v) { guardado.set(k, String(v)); },
    },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8'),
    contexto, { filename: 'i18n.js' }
  );
  return contexto.window.MyDeskI18n.catalog;
}

const catalogo = carregarCatalogo();
const adminJs = fs.readFileSync(path.join(RAIZ, 'docs/admin/admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(RAIZ, 'docs/admin/index.html'), 'utf8');

test('toda chave usada pelo tr() do admin existe no catálogo', () => {
  const usadas = new Set(Array.from(
    adminJs.matchAll(/\btr\(\s*['"]([^'"]+)['"]/g), m => m[1]
  ));
  assert.ok(usadas.size >= 20, 'o admin deixou de traduzir o que já traduzia');
  for (const chave of usadas) {
    assert.ok(Object.hasOwn(catalogo, chave), `chave ausente no catálogo: ${chave}`);
  }
});

test('as três línguas estão preenchidas em toda chave admin', () => {
  for (const [chave, valores] of Object.entries(catalogo)) {
    if (!chave.startsWith('admin.')) continue;
    assert.equal(valores.length, 3, `${chave} precisa de PT, EN e ES`);
    valores.forEach((v, i) => assert.ok(String(v).trim(), `${chave}[${i}] vazio`));
  }
});

/* O portão é a primeira tela da página — aparece antes de qualquer permissão
   ser confirmada. Era ele que ficava em português, e por isso tem teste próprio. */
test('o portão de entrada do admin tem tradução', () => {
  ['Verificando acesso…',
   'Confirmando a sua sessão e a permissão administrativa.',
   'Ir para o MyDesk'].forEach(texto => {
    assert.ok(adminHtml.includes(texto), 'o texto saiu do HTML: ' + texto);
    const achou = Object.values(catalogo).some(v => v[0] === texto);
    assert.ok(achou, 'sem tradução para o portão: ' + texto);
  });
});

/* A tradução da página casa pelo TEXTO em português, não pela chave: se o
   catálogo e o HTML divergirem numa vírgula, a chave nunca dispara e ninguém
   percebe. Este teste compara os dois lados. */
test('todo texto visível do admin em português tem tradução', () => {
  const ENTIDADES = {
    '&middot;': '·', '&eacute;': 'é', '&ecirc;': 'ê', '&aacute;': 'á',
    '&atilde;': 'ã', '&ccedil;': 'ç', '&iacute;': 'í', '&oacute;': 'ó',
    '&uacute;': 'ú', '&acirc;': 'â', '&ocirc;': 'ô', '&agrave;': 'à',
    '&otilde;': 'õ', '&nbsp;': ' ', '&amp;': '&', '&hellip;': '…',
  };
  const decodificar = s => s
    .replace(/&[a-z]+;/g, m => (ENTIDADES[m] !== undefined ? ENTIDADES[m] : m))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  const origens = new Set(Object.values(catalogo).map(v => v[0]));
  // Iguais nas três línguas: não precisam de entrada, e uma entrada só para
  // repetir a mesma palavra três vezes seria ruído no catálogo.
  const IGUAIS = new Set(['Premium', 'Bug', 'MyDesk']);

  const corpo = adminHtml.slice(adminHtml.indexOf('<body'));
  const semTraducao = [];
  for (const m of corpo.matchAll(/>([^<>]+)</g)) {
    const texto = decodificar(m[1]).replace(/\s+/g, ' ').trim();
    if (texto.length < 3 || !/[a-zà-ú]{3}/i.test(texto)) continue;
    if (IGUAIS.has(texto) || origens.has(texto)) continue;
    semTraducao.push(texto);
  }

  assert.deepEqual(semTraducao, [],
    'texto do admin sem tradução — o PT do catálogo precisa ser idêntico ao do HTML');
});

/* placeholder, title e aria-label também passam pelo i18n, e também por
   comparação de texto. Ficaram fora do teste acima porque ele só lê o que está
   entre as tags — e foi por essa fresta que o aria-label da página inteira
   continuou em português. Ele é o que o leitor de tela anuncia: quem navega por
   áudio em inglês ouvia a interface em português. */
test('placeholder, title e aria-label do admin também têm tradução', () => {
  const origens = new Set(Object.values(catalogo).map(v => v[0]));
  const semTraducao = [];

  for (const atributo of ['placeholder', 'title', 'aria-label']) {
    const re = new RegExp(atributo + '="([^"]+)"', 'g');
    for (const m of adminHtml.matchAll(re)) {
      const texto = m[1].trim();
      if (!/[a-zà-ú]{3}/i.test(texto)) continue;   // ícone, sigla ou número
      if (origens.has(texto)) continue;
      semTraducao.push(`${atributo}="${texto}"`);
    }
  }

  assert.deepEqual([...new Set(semTraducao)], [],
    'atributo do admin sem tradução — confira também os caracteres: "..." e "…" não são a mesma coisa');
});
