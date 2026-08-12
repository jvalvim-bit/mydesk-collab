'use strict';

/* Varredura do aviso de consentimento (LGPD).
 *
 * O que esta varredura existe para impedir: que a tag do Google Ads volte a
 * carregar antes do Aceitar. Isso já aconteceu uma vez — a tag entrou em todas
 * as páginas enquanto a política de privacidade afirmava, por escrito, que o
 * site não usava cookie de publicidade. O erro não aparece na tela: a página
 * funciona igual, e só um olhar no que foi baixado denuncia.
 *
 * Por isso o teste não pergunta "o banner apareceu?", e sim "o arquivo do
 * Google foi baixado?" — é o download que grava o cookie.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const GTAG = 'googletagmanager.com/gtag/js';

/* ── DOM mínimo ─────────────────────────────────────────────────────────
   Só o que o analytics.js toca. Um DOM de verdade esconderia o que o
   arquivo depende: aqui, se ele passar a usar outra API, o teste quebra. */
function criarElemento(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    src: '',
    href: '',
    type: '',
    async: false,
    atributos: new Map(),
    filhos: [],
    ouvintes: new Map(),
    pai: null,
    appendChild(filho) {
      filho.pai = this;
      this.filhos.push(filho);
      return filho;
    },
    setAttribute(nome, valor) { this.atributos.set(nome, String(valor)); },
    getAttribute(nome) { return this.atributos.has(nome) ? this.atributos.get(nome) : null; },
    hasAttribute(nome) { return this.atributos.has(nome); },
    addEventListener(evento, fn) {
      if (!this.ouvintes.has(evento)) this.ouvintes.set(evento, []);
      this.ouvintes.get(evento).push(fn);
    },
    remove() {
      if (!this.pai) return;
      this.pai.filhos = this.pai.filhos.filter(item => item !== this);
      this.pai = null;
    },
    disparar(evento) {
      (this.ouvintes.get(evento) || []).forEach(fn => fn({ type: evento }));
    },
  };
}

function achatar(elemento, saida = []) {
  elemento.filhos.forEach(filho => {
    saida.push(filho);
    achatar(filho, saida);
  });
  return saida;
}

function carregarAnalytics(opcoes = {}) {
  const {
    hostname = 'mydesk.social',
    doNotTrack = null,
    consentimentoInicial = null,
    pathname = '/landing.html',
  } = opcoes;

  const guardado = new Map();
  if (consentimentoInicial) guardado.set('md_consent', consentimentoInicial);

  const html = criarElemento('html');
  const head = criarElemento('head');
  const body = criarElemento('body');
  html.appendChild(head);
  html.appendChild(body);

  const document = {
    readyState: 'complete',
    head,
    body,
    documentElement: html,
    addEventListener() {},
    createElement: criarElemento,
    getElementById(id) {
      return achatar(html).find(el => el.id === id) || null;
    },
    /* Só as duas formas que o arquivo usa: igualdade de src e "contém". */
    querySelector(seletor) {
      const exato = /^script\[src="(.+)"\]$/.exec(seletor);
      const contem = /^script\[src\*="(.+)"\]$/.exec(seletor);
      const scripts = achatar(html).filter(el => el.tagName === 'SCRIPT');
      if (exato) return scripts.find(el => el.src === exato[1]) || null;
      if (contem) return scripts.find(el => el.src.includes(contem[1])) || null;
      return null;
    },
  };

  const armazenamento = {
    getItem(chave) { return guardado.has(chave) ? guardado.get(chave) : null; },
    setItem(chave, valor) { guardado.set(chave, String(valor)); },
    removeItem(chave) { guardado.delete(chave); },
  };

  let recarregou = 0;

  const window = { addEventListener() {} };
  const contexto = {
    window,
    document,
    navigator: doNotTrack === null ? {} : { doNotTrack },
    location: {
      hostname,
      pathname,
      protocol: 'https:',
      search: '',
      origin: 'https://' + hostname,
      reload() { recarregou += 1; },
    },
    localStorage: armazenamento,
    sessionStorage: armazenamento,
    URLSearchParams,
    console: { warn() {}, info() {}, error() {} },
  };
  contexto.globalThis = contexto;

  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'docs/js/analytics.js'), 'utf8'),
    contexto,
    { filename: 'analytics.js' }
  );

  const todos = () => achatar(html);

  return {
    window,
    document,
    guardado,
    recarregadas: () => recarregou,
    /* A pergunta que importa: o arquivo do Google entrou na página? */
    tagCarregada: () => todos().some(el => el.tagName === 'SCRIPT' && el.src.includes(GTAG)),
    banner: () => document.getElementById('md-consent'),
    botao: classe => todos().find(el => el.className === classe) || null,
  };
}

test('sem decisão, o aviso aparece e a tag do Google NÃO carrega', () => {
  const app = carregarAnalytics();

  assert.ok(app.banner(), 'o aviso deveria estar na página');
  assert.equal(app.tagCarregada(), false, 'a tag não pode carregar antes do Aceitar');
  assert.equal(app.guardado.get('md_consent'), undefined, 'nada é decidido por omissão');
});

test('Aceitar carrega a tag e registra a decisão', () => {
  const app = carregarAnalytics();

  app.botao('md-consent-accept').disparar('click');

  assert.equal(app.guardado.get('md_consent'), 'granted');
  assert.equal(app.tagCarregada(), true, 'depois do Aceitar a tag precisa carregar');
  assert.equal(app.banner(), null, 'o aviso sai da tela depois de respondido');
});

test('Recusar não carrega nada e não deixa resíduo', () => {
  const app = carregarAnalytics();

  app.botao('md-consent-reject').disparar('click');

  assert.equal(app.guardado.get('md_consent'), 'denied');
  assert.equal(app.tagCarregada(), false, 'recusar não pode baixar o arquivo do Google');
  assert.equal(app.banner(), null);
});

test('quem já recusou não vê o aviso de novo, e a tag continua fora', () => {
  const app = carregarAnalytics({ consentimentoInicial: 'denied' });

  assert.equal(app.banner(), null, 'não se pergunta de novo a quem já respondeu');
  assert.equal(app.tagCarregada(), false);
});

test('quem já aceitou não vê o aviso, e a tag carrega direto', () => {
  const app = carregarAnalytics({ consentimentoInicial: 'granted' });

  assert.equal(app.banner(), null);
  assert.equal(app.tagCarregada(), true);
});

test('Do Not Track dispensa a pergunta: nem aviso, nem tag', () => {
  const app = carregarAnalytics({ doNotTrack: '1' });

  assert.equal(app.banner(), null, 'quem já pediu para não ser rastreado não precisa ser perguntado');
  assert.equal(app.tagCarregada(), false);
});

test('em localhost nada carrega e nada é perguntado', () => {
  const app = carregarAnalytics({ hostname: 'localhost' });

  assert.equal(app.banner(), null);
  assert.equal(app.tagCarregada(), false);
});

test('revogar registra a recusa e recarrega — a tag já baixada não se descarrega', () => {
  const app = carregarAnalytics({ consentimentoInicial: 'granted' });

  app.window.MyDeskConsent.revoke();

  assert.equal(app.guardado.get('md_consent'), 'denied');
  assert.equal(app.recarregadas(), 1, 'sem reload a revogação só valeria na próxima visita');
});

test('o aviso aponta para a política de privacidade certa em cada pasta', () => {
  const raiz = carregarAnalytics({ pathname: '/landing.html' });
  const admin = carregarAnalytics({ pathname: '/admin/index.html' });

  const href = app => achatar(app.document.documentElement)
    .find(el => el.tagName === 'A').href;

  assert.equal(href(raiz), 'privacidade.html');
  assert.equal(href(admin), '../privacidade.html', 'de dentro de /admin o link precisa subir uma pasta');
});

test('o texto do aviso está nos três idiomas do site', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'docs/js/i18n.js'), 'utf8');

  ['consent.region', 'consent.title', 'consent.text', 'consent.accept',
    'consent.reject', 'consent.manage'].forEach(chave => {
    assert.ok(i18n.includes(`'${chave}'`), `falta ${chave} no catálogo`);
  });
});

test('a política de privacidade descreve a tag e oferece como revogar', () => {
  const politica = fs.readFileSync(path.join(ROOT, 'docs/privacidade.html'), 'utf8');

  /* A frase que ficou falsa quando a tag entrou. Ela não pode voltar solta. */
  assert.equal(
    /Não usamos cookies de publicidade nem rastreamento entre sites/.test(politica),
    false,
    'a política não pode negar cookie de publicidade enquanto a tag existir'
  );

  assert.match(politica, /Google Ads/, 'a política precisa nomear quem recebe o dado');
  assert.match(politica, /id="md-consent-manage"/, 'revogar precisa de caminho na própria política');
  assert.match(politica, /js\/analytics\.js/, 'sem o script o botão de revogar não funciona');
});

test('todas as páginas que medem carregam a MESMA versão do analytics', () => {
  const paginas = ['index.html', 'landing.html', 'login.html', 'privacidade.html'];

  const versoes = paginas.map(nome => {
    const html = fs.readFileSync(path.join(ROOT, 'docs', nome), 'utf8');
    const achado = /js\/analytics\.js\?v=(\d+)/.exec(html);
    assert.ok(achado, `${nome} deveria carregar o analytics.js`);
    return achado[1];
  });

  assert.equal(
    new Set(versoes).size, 1,
    'versões diferentes deixam uma página com a regra de consentimento antiga em cache'
  );
});
