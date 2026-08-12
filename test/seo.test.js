'use strict';
/* Guarda as decisões de SEO que já se perderam uma vez.
   O caso concreto: a raiz declarava a landing como canônica, o Google indexava
   a raiz mesmo assim, e o ícone sumia dos resultados — o rastreador de favicon
   segue o canonical. Estes testes impedem a volta desse desencontro. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = p => fs.readFileSync(path.join(__dirname, '..', 'docs', p), 'utf8');
const index = raiz('index.html');
const landing = raiz('landing.html');
const sitemap = raiz('sitemap.xml');

test('a raiz é canônica de si mesma', () => {
  assert.match(index, /<link rel="canonical" href="https:\/\/mydesk\.social\/">/);
});

test('a raiz declara favicon.ico e um tamanho múltiplo de 48', () => {
  // O Google só aceita ícone múltiplo de 48px, e usa /favicon.ico como reserva.
  assert.match(index, /rel="icon" href="\/favicon\.ico"/);
  assert.match(index, /sizes="96x96"/);
  assert.match(index, /sizes="48x48"/);
});

test('os arquivos de ícone existem de verdade', () => {
  ['favicon.ico', 'favicon-48x48.png', 'favicon-96x96.png', 'favicon-512x512.png',
   'apple-touch-icon.png'].forEach(f => {
    const p = path.join(__dirname, '..', 'docs', f);
    assert.ok(fs.existsSync(p), 'faltando: ' + f);
    assert.ok(fs.statSync(p).size > 500, f + ' parece vazio');
  });
});

test('a raiz está no sitemap, com a maior prioridade', () => {
  assert.match(sitemap, /<loc>https:\/\/mydesk\.social\/<\/loc>/);
  const bloco = sitemap.slice(sitemap.indexOf('https://mydesk.social/</loc>'));
  assert.match(bloco.slice(0, 200), /<priority>1\.0<\/priority>/);
});

test('a busca não é bloqueada por robots', () => {
  const robots = raiz('robots.txt');
  assert.match(robots, /Allow: \//);
  assert.ok(!/Disallow: \/$/m.test(robots), 'a raiz não pode estar bloqueada');
  assert.match(robots, /Sitemap: https:\/\/mydesk\.social\/sitemap\.xml/);
});

test('há dados estruturados de marca na raiz, e são JSON válido', () => {
  const bloco = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(index);
  assert.ok(bloco, 'a raiz não tem dados estruturados');
  const dados = JSON.parse(bloco[1]);
  const tipos = (dados['@graph'] || []).map(x => x['@type']);
  assert.ok(tipos.includes('Organization'), 'falta Organization');
  assert.ok(tipos.includes('WebSite'), 'falta WebSite');
  assert.ok(tipos.includes('SoftwareApplication'), 'falta SoftwareApplication');
  const org = dados['@graph'].find(x => x['@type'] === 'Organization');
  assert.equal(org.url, 'https://mydesk.social/');
  assert.ok(org.logo && org.logo.url, 'Organization sem logo — é o que o Google usa');
});

test('título e descrição existem e cabem no resultado da busca', () => {
  [['index.html', index], ['landing.html', landing]].forEach(([nome, html]) => {
    // O <title> passou a carregar data-i18n para trocar de idioma. A regex
    // exigia a tag sem atributo nenhum e acusava "sem <title>" numa página que
    // tinha título — o teste falhava por causa da própria tradução.
    const t = /<title[^>]*>([^<]+)<\/title>/.exec(html);
    assert.ok(t, nome + ' sem <title>');
    assert.ok(t[1].length <= 65, nome + ': título longo demais (' + t[1].length + ')');
    // Mesmo motivo do <title>: a tag ganhou data-i18n-content no meio, e a
    // regex antiga exigia content="" colado no name="description".
    const d = /<meta name="description"[^>]*\scontent="([^"]+)"/.exec(html);
    assert.ok(d, nome + ' sem description');
    assert.ok(d[1].length >= 70 && d[1].length <= 165,
              nome + ': descrição fora da faixa útil (' + d[1].length + ')');
    assert.match(t[1], /MyDesk/, nome + ': a marca precisa estar no título');
  });
});
