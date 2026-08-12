'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   ATALHOS NA BARRA
   ═══════════════════════════════════════════════════════════════════════
   Admin, idioma e Sair moravam soltos na barra: três controles de uso raro
   ocupando largura fixa ao lado dos de uso diário. Agora ficam atrás de um
   botão só.

   O ponto delicado é que eles NÃO podiam ser recriados. São os mesmos
   elementos, com os mesmos ids: o código que liga o Admin para quem é
   administradora procura `#btn-admin`, o seletor de idioma se monta sozinho
   no host dele, e a folha do celular espelha os dois pelo id e pelo
   `style.display`. Recriar qualquer um deles quebraria essas três coisas em
   silêncio — o botão apareceria, e não faria nada.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
const APP  = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const CSS  = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
const HANDLERS = fs.readFileSync(path.join(RAIZ, 'docs/js/handlers-app.js'), 'utf8');
const MOBILE = fs.readFileSync(path.join(RAIZ, 'docs/js/mobile.js'), 'utf8');

function recortar(nome, ate = '\n}') {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return APP.slice(i, APP.indexOf(ate, i) + ate.length);
}

const barra = HTML.slice(HTML.indexOf('<div id="toolbar"'),
                         HTML.indexOf('<!-- PERSONAL WORKSPACE PANEL -->'));
const painel = barra.slice(barra.indexOf('<div id="atalhos-pop"'),
                           barra.indexOf('</div>\n  </div>\n</div>'));

test('os tres controles saem da barra e entram no painel', () => {
  assert.match(barra, /id="btn-atalhos"/);
  ['btn-admin', 'data-language-selector', 'btn-exit'].forEach(alvo => {
    assert.match(painel, new RegExp(alvo.replace(/[-[\]]/g, '\\$&')),
      alvo + ' ficou fora do painel');
  });
});

test('sao os MESMOS elementos, e nao copias', () => {
  /* Cada id aparece uma vez so na barra: dois `#btn-exit` fariam o
     getElementById do resto do app achar o errado. */
  ['id="btn-admin"', 'id="btn-exit"', 'data-language-selector'].forEach(alvo => {
    const n = barra.split(alvo).length - 1;
    assert.equal(n, 1, alvo + ' aparece ' + n + ' vezes na barra');
  });
  // E o Admin conserva o handler e o display que o app controla.
  assert.match(painel, /id="btn-admin" style="display:none;" data-h="a6"/);
});

test('a folha do celular continua achando Admin e Sair', () => {
  /* Ela espelha os botoes por id e le o `style.display` do original para
     saber se o app os escondeu. Mover de lugar nao muda nenhuma das duas
     coisas — recriar mudaria. */
  assert.match(MOBILE, /id: 'btn-admin'/);
  assert.match(MOBILE, /id: 'btn-exit'/);
  assert.match(MOBILE, /const orig = document\.getElementById\(item\.id\)/);
  assert.match(MOBILE, /if \(orig\.style\.display === 'none'\) return;/);
});

test('o botao abre e fecha, e se anuncia como menu', () => {
  assert.match(HANDLERS, /\['a81', 'click', function \(event\) \{ event\.stopPropagation\(\); toggleAtalhos\(\) \}\]/);
  assert.match(barra, /aria-haspopup="true"/);
  assert.match(barra, /aria-expanded="false"/);
  assert.match(barra, /aria-controls="atalhos-pop"/);
  assert.match(barra, /role="menu"/);
  const fn = recortar('function toggleAtalhos(');
  assert.match(fn, /if \(_atalhosAberto\(\)\) \{ fecharAtalhos\(\); return; \}/);
  assert.match(fn, /btn\.setAttribute\('aria-expanded', 'true'\)/);
});

test('o foco vai para a primeira opcao VISIVEL', () => {
  /* O Admin fica oculto para quem nao e administradora: mandar o foco para
     um botao invisivel prenderia o teclado num lugar que a tela nao mostra. */
  const fn = recortar('function toggleAtalhos(');
  assert.match(fn, /\.find\(el => el\.offsetParent !== null\)/);
});

test('Ctrl+K abre, e so quando o app esta de pe', () => {
  /* Ctrl+K do navegador vai para a barra de enderecos. Sequestrar a tecla na
     tela de login seria tirar da pessoa um atalho que ela usa. */
  assert.match(APP, /if \(k === 'k' && \(ev\.ctrlKey \|\| ev\.metaKey\)\)/);
  assert.match(APP, /if \(!barra \|\| barra\.style\.display === 'none'\) return;/);
  assert.match(APP, /ev\.preventDefault\(\);\s*\n\s*toggleAtalhos\(\);/);
  // E Esc fecha, devolvendo o foco a quem abriu.
  assert.match(APP, /if \(ev\.key === 'Escape' && _atalhosAberto\(\)\)/);
  assert.match(APP, /document\.getElementById\('btn-atalhos'\)\?\.focus\(\)/);
});

test('a tecla anunciada muda no Mac', () => {
  /* Escrever "Ctrl" para quem aperta Command e uma instrucao errada. */
  assert.match(APP, /chip\.textContent = mac \? '⌘ K' : 'Ctrl K'/);
  assert.match(barra, /id="atalhos-kbd"/);
  assert.match(CSS, /\.t-kbd\{/);
});

test('clicar fora fecha, mas escolher idioma NAO fecha', () => {
  /* O seletor de idioma se redesenha ao trocar de lingua, e o elemento
     clicado pode ja nao estar no DOM quando o evento chega: com `contains`,
     escolher um idioma fechava o painel junto. */
  /* A ancora nao pode presumir a quebra de linha: em checkout Windows o
     arquivo chega com CRLF (core.autocrlf) e um "\n" cru nunca casa — o teste
     ficava vermelho na maquina e verde na CI, que e o pior dos dois mundos. */
  const i = APP.search(/document\.addEventListener\('click', ev => \{\s*if \(!_atalhosAberto\(\)\)/);
  assert.ok(i > 0, 'sumiu o fechar-ao-clicar-fora do painel');
  const trecho = APP.slice(i);
  assert.match(trecho.slice(0, 600), /ev\.composedPath \? ev\.composedPath\(\) : \[ev\.target\]/);
  assert.match(trecho.slice(0, 600), /caminho\.includes\(host\)\) return;/);
});

test('no painel os botoes viram linhas, e o menu de idioma abre por cima', () => {
  assert.match(CSS, /\.atalhos-pop \.t-btn\{width:100%;justify-content:flex-start/);
  assert.match(CSS, /\.atalhos-pop \.i18n-selector\{position:relative;z-index:2;\}/);
  // No celular o painel encosta na esquerda e a tecla some.
  assert.match(CSS, /#btn-atalhos \.t-kbd\{display:none;\}/);
});

test('o rotulo e traduzido pelo span, e nao reescrevendo o botao', () => {
  /* setBtnTxt reescreve o botao inteiro e levaria a tecla junto. */
  assert.match(APP, /const _atLbl = document\.getElementById\('atalhos-label'\)/);
  assert.equal(/setBtnTxt\('btn-atalhos'/.test(APP), false);
  const CAT = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
  ['app.shortcuts', 'app.shortcutsHint', 'app.language'].forEach(k =>
    assert.match(CAT, new RegExp("'" + k.replace('.', '\\.') + "':")));
});

/* ═══════════════════════════════════════════════════════════════════════
   O PAINEL NAO PODE ABRIR FORA DA TELA
   ═══════════════════════════════════════════════════════════════════════
   O CSS mede o painel da DIREITA do botao para tras (`right:0`), e isso
   bastava enquanto o botao morava no fim da barra. So que a barra ganhou
   `flex-wrap` (ver barra-notebook.test.js): em tela de notebook ela quebra, o
   botao desce para o COMECO da segunda linha, e 216px medidos para tras dele
   terminam na margem esquerda — fora da tela. O painel abria; metade dele
   ficava invisivel.

   Aqui a funcao de verdade e recortada do app.js e rodada contra uma
   geometria falsa. Testar o texto do codigo diria que a conta existe; rodar
   diz que ela acerta. */
function _rodarPosiciona({ janela, hostLeft, hostRight, larguraPainel }) {
  const fonte = recortar('function _atalhosPosiciona(');
  const pop  = { style: {}, offsetWidth: larguraPainel };
  const host = { getBoundingClientRect: () => ({ left: hostLeft, right: hostRight }) };
  const doc  = { getElementById: () => pop, querySelector: () => host };
  new Function('document', 'innerWidth', '_atalhosAberto',
               fonte + '\nreturn _atalhosPosiciona;')(doc, janela, () => true)();
  /* `left` sai em coordenada do host, que e o pai posicionado. */
  const esq = hostLeft + parseFloat(pop.style.left);
  return { esq, dir: esq + larguraPainel, right: pop.style.right };
}

test('na barra que quebrou linha, o painel encosta na margem em vez de vazar', () => {
  /* Notebook de 1360px com a barra em duas linhas: o botao fica na ponta
     esquerda da segunda. Sem a conta, o painel nasceria em -71px. */
  const r = _rodarPosiciona({ janela: 1360, hostLeft: 14, hostRight: 145, larguraPainel: 216 });
  assert.equal(145 - 216 < 0, true, 'o cenario tem de ser o que cortava');
  assert.ok(r.esq >= 8, `painel comecou em ${r.esq}px — fora da tela pela esquerda`);
  assert.ok(r.dir <= 1360, `painel terminou em ${r.dir}px — passou da janela`);
});

test('com o botao no fim da barra, o alinhamento pela direita continua', () => {
  /* A correcao nao pode mudar o que ja estava certo: em tela larga o painel
     segue casando a borda direita com a do botao. */
  const r = _rodarPosiciona({ janela: 1920, hostLeft: 1719, hostRight: 1850, larguraPainel: 216 });
  assert.equal(Math.round(r.dir), 1850, 'o painel descolou da direita do botao');
  assert.equal(r.right, 'auto', 'sem zerar o `right`, o CSS e o `left` brigam');
});

test('em tela estreita o painel tambem cabe', () => {
  const r = _rodarPosiciona({ janela: 390, hostLeft: 8, hostRight: 100, larguraPainel: 240 });
  assert.ok(r.esq >= 8 && r.dir <= 390, `painel em ${r.esq}..${r.dir} numa janela de 390px`);
  // E a folha segura o tamanho quando nem 240px cabem.
  assert.match(CSS, /\.atalhos-pop\{[^}]*max-width:calc\(100vw - 16px\)/);
});

test('quem abre o painel manda posicionar, e o resize acompanha', () => {
  const fn = recortar('function toggleAtalhos(');
  const i = fn.indexOf('_atalhosPosiciona()');
  assert.ok(i > 0, 'abrir sem posicionar deixa o painel no lugar velho');
  assert.ok(i > fn.indexOf("pop.style.display = ''"),
    'medir antes do display daria offsetWidth 0');
  /* Encaixar a janela na metade da tela muda onde a barra quebra. */
  assert.match(APP, /window\.addEventListener\('resize', \(\) => \{ if \(_atalhosAberto\(\)\) _atalhosPosiciona\(\); \}\)/);
});

test('Convidar tambem mora no painel de Atalhos', () => {
  /* Mesmo elemento, mesmo id, mesmo handler: mobile.js e o resto do app
     continuam achando #btn-invite onde sempre acharam. */
  assert.match(painel, /id="btn-invite"/);
  assert.match(painel, /data-h="a3"/);
  const n = barra.split('id="btn-invite"').length - 1;
  assert.equal(n, 1, 'o Convidar aparece ' + n + ' vezes na barra');
});
