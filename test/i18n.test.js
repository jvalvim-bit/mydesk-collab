'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function carregarI18n(language = 'pt-BR') {
  const storage = new Map();
  const events = [];
  const document = {
    body: null,
    documentElement: { lang: '', dataset: {} },
    addEventListener() {},
    querySelectorAll() { return []; },
  };
  const window = {
    addEventListener() {},
    dispatchEvent(event) { events.push(event); },
  };
  const context = {
    window,
    document,
    navigator: { language },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class MutationObserver {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'docs/js/i18n.js'), 'utf8'),
    context,
    { filename: 'i18n.js' }
  );
  return { api: window.MyDeskI18n, storage, events };
}

test('catálogo compartilhado tem PT-BR, EN e ES completos', () => {
  const { api } = carregarI18n();
  assert.deepEqual(Array.from(api.languages), ['pt', 'en', 'es']);
  assert.ok(Object.keys(api.catalog).length >= 900);
  for (const [key, values] of Object.entries(api.catalog)) {
    assert.equal(values.length, 3, `${key} precisa ter três traduções`);
    values.forEach((value, index) => {
      assert.ok(String(value).trim(), `${key}[${index}] não pode ser vazio`);
    });
  }
});

test('idioma persiste, interpola variáveis e emite o evento público', () => {
  const { api, storage, events } = carregarI18n();
  assert.equal(api.setLanguage('en-US'), true);
  assert.equal(storage.get('md_lang'), 'en');
  assert.equal(api.t('app.delegateSuccess', { name: 'ana' }), 'Note delegated to @ana.');
  assert.equal(events.at(-1).type, 'mydesk:languagechange');
  assert.equal(events.at(-1).detail.language, 'en');
  assert.equal(events.at(-1).detail.locale, 'en-US');
});

test('tradução dinâmica só altera nós marcados, não conteúdo do usuário', () => {
  const { api } = carregarI18n('en-US');
  const userNode = {
    nodeType: 1,
    textContent: 'Estado',
    getAttribute() { return null; },
    hasAttribute() { return false; },
    querySelectorAll() { return []; },
  };
  api.translate(userNode);
  assert.equal(userNode.textContent, 'Estado');

  const uiNode = {
    nodeType: 1,
    textContent: 'Estado',
    getAttribute(name) { return name === 'data-i18n' ? 'form.state' : null; },
    hasAttribute() { return false; },
    querySelectorAll() { return []; },
  };
  api.translate(uiNode);
  assert.equal(uiNode.textContent, 'State');
});

test('páginas públicas e app carregam o seletor antes do JS específico', () => {
  const pages = [
    ['docs/landing.html', 'js/landing.js'],
    ['docs/login.html', 'js/login.js'],
    ['docs/formulario.html', 'js/formulario.js'],
    ['docs/index.html', 'js/app.js'],
    ['docs/admin/index.html', 'admin.js'],
  ];
  for (const [file, pageScript] of pages) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi), match => match[1]);
    const i18nIndex = scripts.findIndex(src => /(?:^|\/)js\/i18n\.js(?:\?|$)/.test(src));
    const pageIndex = scripts.findIndex(src => src.split('?')[0].endsWith(pageScript));
    assert.match(html, /data-language-selector/);
    assert.match(html, /css\/i18n\.css/);
    assert.ok(i18nIndex >= 0, `${file} deve carregar i18n.js`);
    assert.ok(pageIndex > i18nIndex, `${file} deve carregar i18n antes de ${pageScript}`);
  }
});

/* Carrega nichos.js com o dicionário, sem navegador. */
function carregarNichos(language) {
  const janela = {
    document: { readyState: 'complete', addEventListener() {} },
    addEventListener() {},
    MyDeskI18n: { getLanguage: () => language },
  };
  const contexto = { window: janela };
  contexto.global = contexto;
  for (const arquivo of ['docs/js/nichos-i18n.js', 'docs/js/nichos.js']) {
    vm.runInNewContext(
      fs.readFileSync(path.join(ROOT, arquivo), 'utf8'),
      contexto, { filename: arquivo }
    );
  }
  janela.MD_NICHOS.aplicarIdioma();
  return janela;
}

test('o catálogo cobre as chaves que o construtor de formulário passa por variável', () => {
  /* O teste de cobertura do catálogo procura _appText('chave' literal. Os tipos
     e grupos de campo do formulário passam a chave por VARIÁVEL
     (_appText(FM_TIPO_I18N[tipo], …)), então escapavam dele — e dezoito ficaram
     sem entrada, aparecendo em português com o app inteiro em inglês. */
  const { api } = carregarI18n();
  const app = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');

  for (const bloco of ['FM_TIPO_I18N', 'FM_GRUPO_I18N']) {
    const i = app.indexOf(`const ${bloco} = {`);
    assert.ok(i > 0, `${bloco} precisa existir`);
    const corpo = app.slice(i, app.indexOf('};', i));
    const chaves = [...corpo.matchAll(/'(app\.[A-Za-z0-9_]+)'/g)].map(m => m[1]);
    assert.ok(chaves.length > 4, `${bloco} parece vazio`);
    for (const chave of chaves) {
      assert.ok(Object.hasOwn(api.catalog, chave), `${bloco}: chave ausente no catálogo: ${chave}`);
    }
  }

  // Nome de cor do formulário: vai no title e no aria-label do seletor.
  const cores = app.slice(app.indexOf('const FM_CORES = ['), app.indexOf('];', app.indexOf('const FM_CORES = [')));
  for (const key of [...cores.matchAll(/key:'([a-z]+)'/g)].map(m => m[1])) {
    assert.ok(Object.hasOwn(api.catalog, 'app.color_' + key), `falta app.color_${key}`);
  }

  /* A página pública do formulário tem catálogo próprio (form.*) e helper
     próprio (mdFormT) — quem responde não tem conta, e o idioma dele é o do
     navegador dele. */
  const publico = fs.readFileSync(path.join(ROOT, 'docs/js/formulario.js'), 'utf8');
  const usadas = [...new Set([...publico.matchAll(/'(form\.[A-Za-z0-9_]+)'/g)].map(m => m[1]))];
  assert.ok(usadas.length > 40, 'a cobertura da página pública regrediu');
  for (const chave of usadas) {
    assert.ok(Object.hasOwn(api.catalog, chave), `chave ausente no catálogo: ${chave}`);
  }
});

test('os modelos de ficha estão traduzidos em EN e ES, e sem tradução dupla', () => {
  /* Os modelos nasceram em português e o português é a chave do dicionário —
     as chaves de dado (`key`, `k`) vão para o banco e não podem mudar de
     idioma. Aqui se cobra que todo texto que a pessoa lê tenha par nos dois
     idiomas: rótulo de campo, nome e tag do modelo, papel, documento, anexo,
     etapas do checklist e os selos de estado. */
  const pt = carregarNichos('pt');
  const dic = pt.MD_NICHOS_TRAD;
  const semPar = new Set();
  pt.MD_NICHOS.lista.forEach(m => {
    const o = m._pt;
    [o.nome, o.tag, o.papel, o.documento, o.anexo].forEach(s => { if (s && !dic[s]) semPar.add(s); });
    o.campos.forEach(c => {
      if (!dic[c.rot]) semPar.add(c.rot);
      (c.selo || []).forEach(s => { if (!dic[s]) semPar.add(s); });
    });
    o.checklist.forEach(s => { if (!dic[s]) semPar.add(s); });
  });
  assert.deepEqual([...semPar], [], 'texto de modelo sem tradução aparece em português');

  for (const [texto, par] of Object.entries(dic)) {
    assert.equal(par.length, 2, `${texto} precisa de [inglês, espanhol]`);
    par.forEach(v => assert.ok(String(v).trim(), `${texto} tem tradução vazia`));
  }

  const en = carregarNichos('en');
  const es = carregarNichos('es');
  assert.equal(en.MD_NICHOS.porChave.advocacia.nome, 'Legal case tracking');
  assert.equal(es.MD_NICHOS.porChave.advocacia.nome, 'Seguimiento jurídico');
  assert.equal(en.MD_NICHOS.porChave.advocacia.campos[0].rot, 'Practice area');
  assert.equal(en.MD_NICHOS.porChave.advocacia.checklist[0], 'Initial consultation');

  /* Os arrays de selo são COMPARTILHADOS entre modelos (o mesmo S.agenda em
     vários). Se a tradução mutasse o array de origem, o segundo modelo a ser
     traduzido receberia texto já traduzido — e o terceiro, lixo. */
  // join: os arrays vêm de outro realm do vm, então deepEqual estrito reprova
  // por protótipo mesmo com o conteúdo idêntico.
  assert.equal(en.MD_NICHOS.selos.andamento.join(' | '),
    'Em andamento | Aguardando | Concluído | Parado',
    'o selo compartilhado não pode ser mutado na origem');

  // Aplicar de novo não pode traduzir a tradução.
  en.MD_NICHOS.aplicarIdioma();
  en.MD_NICHOS.aplicarIdioma();
  assert.equal(en.MD_NICHOS.porChave.advocacia.nome, 'Legal case tracking');
});

test('modo retrato mantém navegação, board e formulários em layout compacto', () => {
  const mobileCss = fs.readFileSync(path.join(ROOT, 'docs/css/mobile.css'), 'utf8');
  const mainCss = fs.readFileSync(path.join(ROOT, 'docs/css/main.css'), 'utf8');
  const mobileJs = fs.readFileSync(path.join(ROOT, 'docs/js/mobile.js'), 'utf8');
  assert.match(mobileCss, /orientation:\s*portrait/);
  assert.match(mobileCss, /body\.layout-portrait #board/);
  assert.match(mobileCss, /body\.layout-portrait #toolbar/);
  assert.match(mobileCss, /body\.layout-portrait \.crm-client-modal \.crm-modal-row/);
  assert.match(mobileJs, /classList\.toggle\('layout-portrait'/);
  assert.doesNotMatch(mobileCss, /orientation:\s*portrait[^{}]*max-width:\s*1600px/);
  assert.match(mainCss, /\.n-text\{max-height:290px/);
});

test('o limite do monitor vertical é uma frase só, lida do motor de CSS', () => {
  /* Este limite já esteve escrito em três lugares com três valores: o CSS
     pedia proporção <= 25/28 e largura >= 861px, o app.js aceitava >= 600px e
     o mobile.js exigia > 860px. Os dois JS marcam a MESMA classe nos mesmos
     eventos de resize, então quem rodasse por último vencia — e havia faixa em
     que a classe ligava sem o CSS que a acompanha: o quadro virava coluna, a
     nota era esticada para a largura dela e continuava presa (position:fixed)
     na coordenada do quadro horizontal, por cima do resto.

     A trava é: ninguém recalcula o limite em JS. Os dois arquivos consultam a
     mesma media query, e os dois blocos de CSS declaram a mesma condição. */
  const mobileCss = fs.readFileSync(path.join(ROOT, 'docs/css/mobile.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  const mobileJs = fs.readFileSync(path.join(ROOT, 'docs/js/mobile.js'), 'utf8');

  const condicao = /\(orientation: portrait\) and \(min-width: 861px\) and\s*'?\s*\+?\s*'?\(max-aspect-ratio: 25\/28\) and \(any-pointer: fine\)/;
  assert.match(appJs, condicao, 'app.js precisa usar a condição do CSS');
  assert.match(mobileJs, condicao, 'mobile.js precisa usar a MESMA condição');

  // Os dois blocos de retrato do CSS: o que põe os cartões em fluxo e o que
  // faz a coluna central. Um sem o outro é o layout quebrado.
  const blocosRetrato = mobileCss.match(
    /@media[^{]*\(orientation: portrait\)[^{]*\(min-width: 861px\)[^{]*\{/g
  ) || [];
  assert.ok(blocosRetrato.length >= 1, 'falta o bloco de monitor vertical');
  for (const bloco of blocosRetrato) {
    assert.match(bloco, /max-aspect-ratio:\s*25\/28/,
      'bloco de retrato sem trava de proporção pega numa faixa que o outro não pega');
    assert.match(bloco, /any-pointer:\s*fine/,
      'sem any-pointer o layout de monitor cai em tablet na vertical');
  }

  // Ninguém volta a recalcular o limite na mão.
  assert.doesNotMatch(appJs, /innerWidth\s*\*\s*1\.12/,
    'o limite não pode ser recalculado em JS — consulte a media query');
  assert.doesNotMatch(mobileJs, /innerHeight\s*>\s*window\.innerWidth\s*\*\s*1\.12/,
    'o limite não pode ser recalculado em JS — consulte a media query');
});

test('nota e pasta em coluna não carregam medida do quadro horizontal', () => {
  /* No celular e no monitor vertical o lugar e o tamanho de cada cartão são do
     CSS. O que sobrava era a altura gravada pelo redimensionamento no style
     inline: medida com a nota em 240px, ela virava cartão vazio e alto na
     coluna de 760px — e a alça que a ajustaria não existe nesses layouts. */
  const mobileCss = fs.readFileSync(path.join(ROOT, 'docs/css/mobile.css'), 'utf8');
  const bloco = mobileCss.slice(mobileCss.indexOf('body.layout-portrait #board > .note'));
  const regra = bloco.slice(0, bloco.indexOf('}'));
  assert.match(regra, /height:\s*auto\s*!important/);
  assert.match(regra, /max-height:\s*none\s*!important/);

  /* E o bloco de fluxo continua sendo quem tira os cartões do posicionamento
     absoluto — sem isso a largura acima seria a única coisa a pegar. Tem de
     ser `relative` com z-index, e não `static`: as camadas de fundo do quadro
     são absolutas, e elemento posicionado pinta acima do fundo de irmão em
     fluxo não posicionado. Com `static` o cartão ia para DEBAIXO do papel de
     parede — era a nota "transparente" com os campos soltos sobre a foto. */
  for (const seletor of ['.note', '.stack-wrap']) {
    const i = mobileCss.indexOf(`\n  ${seletor} {`);
    assert.ok(i > 0, `falta a regra de fluxo de ${seletor}`);
    const corpo = mobileCss.slice(i, mobileCss.indexOf('}', i));
    assert.match(corpo, /position:\s*relative\s*!important/,
      `${seletor} em fluxo precisa ficar posicionado, senão pinta sob o wallpaper`);
    assert.match(corpo, /z-index:\s*1\s*!important/,
      `${seletor} precisa de z-index acima das camadas de fundo do quadro`);
    assert.match(corpo, /left:\s*auto\s*!important/,
      'sem left/top em auto, relative deslocaria o cartão');
  }
});

test('nota dentro de pasta nunca se desenha solta no quadro', () => {
  /* Esconder a nota empilhada era passo de desenho da pasta (renderStack).
     Quem montasse a nota depois dela — sincronização do colega, restaurar,
     trocar de workspace — criava um cartão solto que ninguém escondia: a nota
     aparecia na linha da pasta E flutuando. O Reorganizar então movia as notas
     da pasta para a coordenada da própria pasta, largando esse cartão em cima
     dela. Por isso a decisão passou para a montagem. */
  const appJs = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  const mount = appJs.slice(appJs.indexOf('function mountNote('));
  const corpo = mount.slice(0, 2600);
  assert.match(corpo, /if \(n\.stackId\) el\.style\.display = 'none';/,
    'mountNote precisa esconder a nota que já pertence a uma pasta');

  /* O Reorganizar mede a coluna das pastas em vez de presumir 280px, que era
     menor que uma pasta alargada pela borda. Vale nos DOIS caminhos: quem o
     botão chama é _applySortFilter — shuffleAll não é chamado por ninguém. */
  const medidas = appJs.match(/const larguraDaColuna = stackIds\.reduce/g) || [];
  assert.ok(medidas.length >= 2,
    'a coluna de pastas precisa ser medida em _applySortFilter e em shuffleAll');
  assert.doesNotMatch(appJs, /notesStartX = stackIds\.length > 0 \? PAD_X \+ 280 \+ GAP/,
    'largura de coluna presumida foi o que jogava nota dentro da pasta');

  /* E a nota aberta pelo ⤢ entra na reorganização. Ela continua sendo membro
     da pasta, então um filtro por `!n.stackId` a deixava de fora — era o único
     cartão que o botão não mexia, e parecia que ele tinha parado. */
  assert.match(appJs, /function _notaNoQuadro\(n\)/);
  assert.match(appJs, /const visibleNotes = notes\.filter\(_notaNoQuadro\)/,
    'reorganizar precisa considerar todo cartão que está no quadro');
  assert.doesNotMatch(appJs, /const visibleNotes = notes\.filter\(n => !n\.stackId\)/);
});

test('a pasta guarda o próprio lugar, e não o da primeira nota', () => {
  /* renderStack cai no x/y da primeira nota quando a pasta não tem coordenada
     salva. Enquanto nada gravava essa coordenada, a pasta reperguntava à nota
     onde ficava a cada desenho — e ia junto para onde a nota fosse. */
  const appJs = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');

  const criacao = appJs.slice(appJs.indexOf('const ehPastaExistente'));
  assert.match(criacao.slice(0, 1400), /_persistStackMeta\(\{\s*\[stackId \+ '_x'\]/,
    'pasta precisa nascer com coordenada própria');

  const render = appJs.slice(appJs.indexOf('function renderStack('));
  assert.match(render.slice(0, 2400), /!temSalvo && !_layoutRetratoAtivo\(\)/,
    'pasta antiga precisa fixar o lugar herdado uma vez — e não no layout em coluna');
  /* Pasta VAZIA se desenha, desde que exista de fato no mapa de metadados —
     é o que permite criar uma pela tela de "Nova nota" e ela aparecer no
     quadro para receber a primeira. Sem coordenada salva ela não é
     desenhada: 0,0 seria pior do que não desenhar. */
  assert.match(render.slice(0, 2400), /if \(vazia && !getStackTitles\(\)\[stackId\]\) return;/);
  assert.match(render.slice(0, 2400), /if \(vazia && !temSalvo\) return;/);

  const coluna = appJs.slice(appJs.indexOf('function _arrumarColunaDePastas('));
  const corpo = coluna.slice(0, coluna.indexOf('\n}'));
  assert.match(corpo, /if \(_layoutRetratoAtivo\(\)\) return;/,
    'em coluna quem empilha as pastas é o CSS');

  /* Aqui havia uma terceira exigência: que a arrumação TAMBÉM gravasse o
     lugar. Ela cobrava o mecanismo, e não a garantia.

     Quem impede a pasta de seguir a primeira nota é a gravação única do
     renderStack, conferida logo acima — e ela continua lá. Gravar de novo no
     passe de arrumação era supérfluo e acabou sendo nocivo: a altura sai de
     offsetHeight, que é diferente em cada tela, e duas pessoas no mesmo
     quadro passavam a se sobrescrever sem parar, piscando e consumindo banco
     a cada volta. O passe de arrumação é visual.

     Ver test/pastas-laco.test.js para o laço em si. */
  /* Sem comentários: o comentário que explica a remoção cita o nome do que
     foi removido, e não pode ser confundido com a volta dele. */
  const codigo = corpo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/_persistStackMeta\(/.test(codigo), false,
    'a arrumação voltou a gravar posição medida na tela — as duas pessoas brigam');
  assert.equal(/saveNotes\(/.test(codigo), false,
    'a arrumação voltou a reescrever o quadro inteiro, com anexos');
});

test('em coluna dá para reordenar os cartões, e a ordem sobrevive', () => {
  /* No celular e no monitor vertical o lugar do cartão é do CSS, então
     arrastar livre não funciona — o cartão voltaria sozinho para a fila. O que
     dá para mudar é a ordem. Sem isto o layout em coluna tirava do usuário
     qualquer controle sobre a sequência dos cartões. */
  const appJs = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(ROOT, 'docs/css/mobile.css'), 'utf8');

  for (const fn of ['_colunaItens', '_aplicarOrdemColuna', '_persistirOrdemColuna',
                    '_iniciarArrastoColuna', '_moverArrastoColuna', '_terminarArrastoColuna']) {
    assert.match(appJs, new RegExp(`function ${fn}\\(`), `falta ${fn}`);
  }

  /* Pressionar e segurar, não arrastar de imediato: nestes layouts o gesto
     vertical é a rolagem da lista, e qualquer movimento antes do tempo tem de
     devolver o gesto para ela. */
  assert.match(appJs, /COLUNA_PRESSAO_MS\s*=\s*\d+/);
  const move = appJs.slice(appJs.indexOf("document.addEventListener('pointermove'"));
  assert.match(move.slice(0, 700), /COLUNA_TOLERANCIA_PX/,
    'mover antes do tempo precisa cancelar a reordenação');

  // Fora da coluna o `order` não pode sobrar, senão bagunça o quadro livre.
  const aplicar = appJs.slice(appJs.indexOf('function _aplicarOrdemColuna('));
  assert.match(aplicar.slice(0, 600), /!_layoutRetratoAtivo\(\)[\s\S]*?style\.order = ''/);

  /* A ordem mora no mapa de metadados que já sincroniza — acrescentar um campo
     à nota exigiria mexer nas onze listas de serialização escritas à mão. */
  assert.match(appJs, /'nota_' \+ _idSeguro\(item\.nota\.id\) \+ '_ord'/);
  assert.match(appJs, /\['nota_' \+ _idSeguro\(id\) \+ '_ord'\]: null/,
    'apagar a nota precisa limpar a chave de ordem');
  assert.match(appJs, /\[stackId \+ '_ord'\]: null/,
    'apagar a pasta precisa limpar a chave de ordem');

  // A pega é a faixa do topo, não o cartão inteiro: .n-head é quase o cartão
  // todo, e sem superfície livre não dá para rolar a lista com o dedo.
  assert.match(appJs, /\.closest\('\.n-chip-row, \.stack-header'\)/);
  assert.match(mobileCss, /\.n-chip-row, \.stack-header \{[^}]*touch-action: none/);

  /* Reorganizar precisa reordenar em vez de recalcular x/y — em coluna as
     coordenadas são inertes, e o botão parecia morto. */
  assert.match(appJs, /function _reorganizarColuna\(comparador\)/);
  const shuffle = appJs.slice(appJs.indexOf('function shuffleAll('));
  assert.match(shuffle.slice(0, 400), /_layoutRetratoAtivo\(\)\) \{ _reorganizarColuna/,
    'Reorganizar precisa reordenar a coluna');
  const sort = appJs.slice(appJs.indexOf('function _applySortFilter('));
  assert.match(sort.slice(0, 2200), /_layoutRetratoAtivo\(\)\)\s*\{\s*_reorganizarColuna\(comparador\)/,
    'a ordenação escolhida precisa valer na coluna');
});

test('cartão em coluna não encolhe abaixo do próprio conteúdo', () => {
  /* Item de flex encolhe por padrão, e o #board é uma coluna com altura
     definida (overflow-y:auto). Assim que o conteúdo passava da tela — abrir a
     segunda nota bastava — o navegador espremia as pastas para caber; como a
     pasta tem overflow:hidden, as linhas de dentro sumiam e ela dizia "5"
     mostrando três. A .note já tinha a trava; a .stack-wrap, não. */
  const mobileCss = fs.readFileSync(path.join(ROOT, 'docs/css/mobile.css'), 'utf8');
  for (const seletor of ['.note', '.stack-wrap']) {
    const i = mobileCss.indexOf(`\n  ${seletor} {`);
    assert.ok(i > 0, `falta a regra de fluxo de ${seletor}`);
    const corpo = mobileCss.slice(i, mobileCss.indexOf('}', i));
    assert.match(corpo, /flex-shrink:\s*0/,
      `${seletor} sem flex-shrink:0 é espremido e corta o próprio conteúdo`);
  }
});

test('arrumar pastas não reescreve a posição das notas de dentro', () => {
  /* O inverso do bug anterior. Cada arrumação de coluna gravava a posição da
     pasta em TODAS as notas dela — resquício de quando a pasta herdava o lugar
     da primeira nota. Como a nota aberta pelo ⤢ continua sendo membro, toda
     arrumação a teleportava de volta para cima da pasta: era o "movo a pasta e
     a nota vai junto", e o Reorganizar mandando a nota para onde a pasta está. */
  const appJs = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');

  assert.doesNotMatch(appJs, /getStackNotes\(sid\)\.forEach\(n => \{ n\.y =/,
    'arrumar a coluna não pode reposicionar as notas de dentro da pasta');
  assert.doesNotMatch(appJs, /members\.forEach\(n => \{ n\.x = PAD_X/,
    'reorganizar não pode reposicionar as notas de dentro da pasta');
  assert.doesNotMatch(appJs, /n\.stackId === sid\)\.forEach\(n => \{ n\.x = PAD_X/,
    'reorganizar não pode reposicionar as notas de dentro da pasta');
  /* O arrasto do cabeçalho era o caminho mais direto de todos, e o último a
     sair: escrevia a coordenada da pasta em cada nota a cada quadro do gesto. */
  assert.doesNotMatch(appJs, /stackNs\.forEach\(n => \{ n\.x = nx/,
    'arrastar a pasta não pode arrastar as notas de dentro junto');
  assert.doesNotMatch(appJs, /n\.stackId === sid\)\.forEach\(n => \{ n\.y = curY/,
    'empurrar a pasta de baixo não pode reposicionar as notas dela');

  // Todas passaram a gravar no lugar certo.
  assert.match(appJs, /function _fixarLugarDaPasta\(stackId, x, y\)/);
  const usos = appJs.match(/_fixarLugarDaPasta\(/g) || [];
  assert.ok(usos.length >= 5,
    'arrasto, empurrão e as duas reorganizações gravam só na pasta');

  /* E a nota aberta pelo ⤢ leva o lugar para o modelo, senão o próximo
     redesenho a puxa de volta para a pasta. */
  const pop = appJs.slice(appJs.indexOf('function popNoteFromStack('));
  const corpoPop = pop.slice(0, pop.indexOf('\n}'));
  assert.match(corpoPop, /n\.x = Math\.round\(r\.right \+ 16\)/);
  assert.match(corpoPop, /saveNotes\(\)/);

  // E ela não pode sumir quando a pasta se redesenha.
  assert.match(appJs, /el\.dataset\.popped !== '1'\) el\.style\.display = 'none'/,
    'a nota aberta pelo ⤢ precisa sobreviver ao redesenho da pasta');
});

test('atalho Admin/Reporte está carregado e usa o rótulo móvel atualizado', () => {
  const index = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
  const reporting = fs.readFileSync(path.join(ROOT, 'docs/js/reporting.js'), 'utf8');
  const mobile = fs.readFileSync(path.join(ROOT, 'docs/js/mobile.js'), 'utf8');
  assert.match(index, /css\/reporting\.css/);
  assert.match(index, /js\/reporting\.js/);
  assert.match(reporting, /dataset\.mobileLabel\s*=\s*label/);
  assert.match(mobile, /orig\.dataset\.mobileLabel/);
});

test('todas as chaves literais usadas por _appText existem no catálogo', () => {
  const { api } = carregarI18n();
  const app = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  const usadas = Array.from(
    app.matchAll(/_appText\(\s*['"]([^'"]+)['"]/g),
    match => match[1]
  );
  assert.ok(new Set(usadas).size >= 450, 'a cobertura dinâmica do app regrediu');
  for (const key of new Set(usadas)) {
    assert.ok(Object.hasOwn(api.catalog, key), `chave ausente no catálogo: ${key}`);
  }
});

test('fluxos dinâmicos prioritários têm tradução PT, EN e ES', () => {
  const { api } = carregarI18n();
  const keys = [
    'app.premiumUnlockTitle',
    'app.stripeSecureCheckout',
    'app.formBuilderTitle',
    'app.responses',
    'app.comments',
    'app.chooseDay',
    'app.expenses',
    'app.monthTaskPlaceholder',
    'app.workspaceListTitle',
    'app.delegateTaskFor',
    'app.crmPremiumOnly',
    'app.birthDate',
    'app.attachDocument',
    'app.createGoogleDocsCard',
    'app.clientsExportedMany',
    'app.summarizeAiTitle',
  ];
  for (const key of keys) {
    assert.ok(Object.hasOwn(api.catalog, key), `${key} precisa existir`);
    const values = api.catalog[key];
    assert.equal(values.length, 3);
    assert.ok(new Set(values).size >= 2, `${key} precisa variar entre idiomas`);
  }
});

test('troca de idioma preserva conteúdo criado pelo usuário no app', () => {
  const app = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  assert.match(app, />\$\{xe\(n\.title\)\}<\/textarea>/);
  assert.match(app, />\$\{xe\(n\.body\)\}<\/textarea>/);
  assert.match(app, /txt\.textContent\s*=\s*c\.texto/);
  assert.match(app, /val\.textContent\s*=\s*v/);
  assert.match(app, /bubble\.textContent\s*=\s*msg\.text\s*\|\|\s*''/);
  assert.doesNotMatch(app, /_appText\([^;\n]*c\.texto/);
  assert.doesNotMatch(app, /_appText\([^;\n]*msg\.text/);
});

test('applyLang mantém Pixel Art na terceira seção de fundos', () => {
  const app = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  const start = app.indexOf('const wpKeys = [');
  const end = app.indexOf('wpsecs.forEach', start);
  assert.ok(start >= 0 && end > start);
  const block = app.slice(start, end);
  const keys = Array.from(block.matchAll(/_appText\('([^']+)'/g), match => match[1]);
  assert.deepEqual(keys, [
    'app.solidColors',
    'app.gradients',
    'app.pixelArt',
    'app.collection',
    'app.loopVideo',
  ]);
  assert.doesNotMatch(block, /\[T\.wpSolids,\s*T\.wpGrads,\s*T\.wpCustom\]/);
});

test('troca de idioma repinta painéis dinâmicos abertos', () => {
  const app = fs.readFileSync(path.join(ROOT, 'docs/js/app.js'), 'utf8');
  const start = app.indexOf('function _refreshDynamicLanguage()');
  const end = app.indexOf("window.addEventListener('mydesk:languagechange'", start);
  assert.ok(start >= 0 && end > start);
  const block = app.slice(start, end);
  for (const renderer of [
    '_updatePremiumBadge',
    '_fmDesenhar',
    'renderCalendario',
    'montarListaWorkspaces',
    'renderPwPanel',
    'renderRecordsTable',
  ]) {
    assert.match(block, new RegExp(`\\b${renderer}\\s*\\(`), `${renderer} precisa ser repintado`);
  }
});
