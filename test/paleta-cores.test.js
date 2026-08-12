'use strict';
/* A paleta cresceu para 38 cores, e boa parte delas é premium. Três coisas
   aqui falham em silêncio se alguém acrescentar uma cor sem cuidado: a chave
   sem tradução (nome em português no app em inglês), o gradiente sem trava de
   plano (recurso pago aberto de graça) e o fundo claro demais (nota bonita na
   paleta e ilegível em uso, porque o texto é claro). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

function lerPaleta() {
  const i = APP.indexOf('const PAL = {');
  const corpo = APP.slice(i, APP.indexOf('\nconst PKEYS'));
  const contexto = {};
  vm.runInNewContext(corpo + '\nglobalThis.__PAL = PAL;', contexto);
  return contexto.__PAL;
}

function catalogo() {
  const i18n = fs.readFileSync(path.join(RAIZ, 'docs/js/i18n.js'), 'utf8');
  return chave => i18n.includes(`'${chave}'`);
}

test('toda cor tem nome traduzido em inglês e espanhol', () => {
  const PAL = lerPaleta();
  const existe = catalogo();
  const faltando = Object.keys(PAL).filter(k => !existe('app.pal_' + k));
  assert.deepEqual(faltando, [], 'cor sem tradução aparece em português no app inteiro em outro idioma');
  assert.ok(Object.keys(PAL).length >= 38, 'a paleta encolheu');
});

test('todo gradiente é premium, e a cor chapada não é', () => {
  /* A trava é o que separa o plano pago do gratuito. Um gradiente sem
     `premium` fica disponível para todo mundo sem ninguém perceber — o seletor
     não reclama, ele simplesmente não desenha o cadeado. */
  const PAL = lerPaleta();
  for (const [k, p] of Object.entries(PAL)) {
    const temGradiente = !!p.grad || String(p.bg).includes('gradient');
    if (temGradiente) {
      assert.equal(p.premium, 1, `${k} tem gradiente e precisa ser premium`);
    } else {
      assert.equal(p.premium, undefined, `${k} é cor chapada e não deveria ser paga`);
    }
  }
});

/* Luminância relativa com correção de gama e razão de contraste — a mesma
   conta que a WCAG usa, e a mesma que _fmContrastText já faz no app. */
function _luz(hex) {
  const canais = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}
function _contraste(a, b) {
  const [claro, escuro] = [_luz(a), _luz(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}
// Branco com opacidade `op` desenhado sobre `fundo`: o que o olho vê.
function _brancoSobre(fundo, op) {
  const canais = [1, 3, 5].map(i =>
    Math.round(op * 255 + (1 - op) * parseInt(fundo.slice(i, i + 2), 16)));
  return '#' + canais.map(v => v.toString(16).padStart(2, '0')).join('');
}

test('o degradê vibrante continua legível, com a conta de contraste da WCAG', () => {
  /* O corpo da nota é branco a 50%. Sobre o fundo quase preto padrão isso
     contrasta de sobra; sobre um fundo colorido, some — foi esse limite que
     por um tempo obrigou os degradês a serem escuros e sem graça.

     A saída foi inverter a conta: fixado o fundo colorido, subir a opacidade
     do texto até o contraste voltar. A classe `vibrante` leva o corpo a 0.78.
     Este teste cobra as duas pontas — que a cor esteja marcada como vibrante,
     e que nessa opacidade cada parada do gradiente passe de 4,5:1. */
  const PAL = lerPaleta();
  const css = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');

  const regra = css.slice(css.indexOf('.note.vibrante .n-text{'));
  const opacidade = Number((regra.match(/rgba\(255,255,255,\.(\d+)\)/) || [])[1]) / 100;
  assert.ok(opacidade >= 0.7, `o corpo em ${opacidade} não sustenta fundo colorido`);

  const comFundoGradiente = Object.entries(PAL)
    .filter(([, p]) => String(p.bg).includes('gradient'));
  assert.ok(comFundoGradiente.length >= 10, 'esperava ao menos dez degradês de nota inteira');

  for (const [k, p] of comFundoGradiente) {
    assert.equal(p.vibrante, 1,
      `${k} tem fundo colorido e precisa de \`vibrante\`, senão o texto fica apagado nele`);
    const paradas = String(p.bg).match(/#[0-9a-f]{6}/gi) || [];
    assert.ok(paradas.length >= 2, `${k} precisa de pelo menos duas paradas`);
    for (const cor of paradas) {
      const corpo = _contraste(_brancoSobre(cor, opacidade), cor);
      assert.ok(corpo >= 4.5,
        `${k}: sobre ${cor} o corpo fica em ${corpo.toFixed(2)}:1, abaixo do mínimo de 4,5`);
      const titulo = _contraste('#ffffff', cor);
      assert.ok(titulo >= 4.5, `${k}: o título em ${cor} fica em ${titulo.toFixed(2)}:1`);
    }
  }
});

test('as cores vibrantes são coloridas de verdade, e não quase pretas', () => {
  /* O contrário do teste acima. Nada impede que alguém "conserte" um problema
     de contraste escurecendo o fundo até quase preto — e aí o recurso deixa de
     existir sem nenhum teste reclamar. As paradas precisam ter cor. */
  const PAL = lerPaleta();
  const chapadoEscuro = _luz('#0f1029');   // o fundo padrão de hoje
  for (const [k, p] of Object.entries(PAL)) {
    if (!p.vibrante || !String(p.bg).includes('gradient')) continue;
    const paradas = String(p.bg).match(/#[0-9a-f]{6}/gi) || [];
    const media = paradas.reduce((t, c) => t + _luz(c), 0) / paradas.length;
    assert.ok(media > chapadoEscuro * 2.5,
      `${k} ficou tão escuro quanto o fundo padrão — deixou de ser vibrante`);
  }
});

test('a cor que se move dissolve um tom no outro, sem salto', () => {
  const PAL = lerPaleta();
  const animadas = Object.entries(PAL).filter(([, p]) => p.anim);
  assert.equal(animadas.length, 1, 'mais de uma cor animada confunde a escolha');
  const [chave, cor] = animadas[0];
  assert.equal(cor.premium, 1, 'a cor animada é do plano pago');
  assert.doesNotMatch(String(cor.bg), /gradient/,
    'o fundo dela é uma reserva chapada: quem anima é o CSS, e se ele faltar a nota precisa nascer legível');

  const css = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');
  assert.match(css, /\.note\.cor-viva/, 'falta a regra da cor animada');

  /* Duas versões erraram antes desta, por motivos opostos.

     A primeira deslizava a POSIÇÃO de um gradiente gigante: no papel
     funcionava, na tela não aparecia — e parado o fundo continua um degradê
     bonito, indistinguível de uma cor comum. Nada acusa.

     A segunda trocava o gradiente INTEIRO a cada passo: aparecia, mas em
     saltos secos, porque imagem de fundo não interpola.

     A que ficou separa as duas coisas: anima `background-color`, que o
     navegador dissolve sozinho, e deixa o aspecto de degradê num véu fixo. */
  assert.doesNotMatch(css, /animation:corViva[^;]*;[\s\S]{0,300}background-position/,
    'animar background-position traz de volta a falha silenciosa');
  assert.doesNotMatch(css, /animation:corViva[A-Za-z]* [\d.]+s steps/,
    'steps volta a dar salto seco entre as cores');

  const ciclo = css.slice(css.indexOf('@keyframes corViva{'));
  const corpoCiclo = ciclo.slice(0, ciclo.indexOf('\n}'));
  const paradas = (corpoCiclo.match(/\d+%\s*\{/g) || []).length;
  assert.ok(paradas >= 10, `esperava dez tons no ciclo, achei ${paradas}`);
  assert.match(corpoCiclo, /background-color:#[0-9a-f]{6}/,
    'o que anima é a cor, que interpola — e não a imagem de fundo, que não');
  assert.doesNotMatch(corpoCiclo, /linear-gradient/,
    'gradiente dentro do ciclo volta a saltar: ele tem de ficar no véu fixo');

  // E o véu fixo é o que dá o aspecto de degradê enquanto a cor viaja.
  const camada = css.slice(css.indexOf('.note.cor-viva::before'));
  assert.match(camada.slice(0, 900), /background-image:linear-gradient/,
    'sem o véu o cartão vira cor chapada em vez de degradê');

  /* Vai num ::before porque `.note` já tem outras animações (entrada do app,
     pulso de atrasado, mudança de status) e só uma declaração `animation`
     vence por elemento. */
  assert.match(css, /\.note\.cor-viva::before/,
    'a animação precisa de camada própria para não disputar com as outras de .note');
  assert.doesNotMatch(css, /\.note\.cor-viva, \.stack-wrap\.cor-viva\{[^}]*position:/,
    'declarar position na nota quebra o layout: ela é fixed, static ou absolute conforme o caso');

  // Movimento contínuo é exatamente o que incomoda quem pediu para reduzi-lo.
  const trecho = css.slice(css.indexOf('.note.cor-viva'));
  assert.match(trecho, /prefers-reduced-motion[\s\S]*cor-viva[\s\S]*animation:\s*none/,
    'a cor animada precisa parar para quem pediu menos movimento');

  // E o app tem de marcar a nota, senão o CSS nunca pega.
  assert.match(APP, /function _palAplicarClasses\(el, key\)/);
  assert.match(APP, /classList\.toggle\('cor-viva'/);
  assert.match(APP, /classList\.toggle\('vibrante'/);
  assert.ok((APP.match(/_palAplicarClasses\(/g) || []).length >= 3,
    'montar a nota, trocar a cor e desenhar a pasta precisam aplicar as classes');
  assert.ok(chave.startsWith('g'), 'a chave segue o padrão das cores de gradiente');

  /* A duração importa, e por dois lados. Ciclo longo demais e ninguém percebe
     a troca — foi o que aconteceu com 42 segundos. Curto demais e dez trocas
     viram piscada: com dez paradas, 3s dá 3,3 trocas por segundo, que é o
     limite a partir do qual conteúdo pisca a ponto de incomodar. */
  /* O que importa é o tempo POR COR, e não a duração do ciclo: com dez
     paradas, é ele que decide entre "muda" e "pisca". O piso de 0,33s é o
     limite de três trocas por segundo, a partir do qual há quem passe mal. O
     teto existe para a troca não sumir de vista. */
  const duracao = Number((trecho.match(/animation:corViva ([\d.]+)s/) || [])[1]);
  const porTroca = duracao / 10;
  assert.ok(porTroca >= 0.33,
    `${porTroca.toFixed(2)}s por cor passa de três trocas por segundo — vira piscada`);
  assert.ok(porTroca <= 4,
    `${porTroca.toFixed(2)}s por cor é lento demais para se perceber a troca`);

  /* Parada por "reduzir movimento" é indistinguível de quebrada. O app avisa
     no console em vez de deixar a pessoa adivinhar — foi assim que este caso
     consumiu várias idas e vindas. */
  assert.match(APP, /function _avisarMovimentoReduzido\(\)/);
  assert.match(APP, /prefers-reduced-motion: reduce/);

  /* A amostra do seletor também precisa se mover. Parada, ela é um gradiente
     como outro qualquer — e a pessoa só descobre o que a cor faz depois de
     aplicar na nota, que é tarde. */
  assert.match(css, /\.m-sw\.cor-viva|\.swatch\.cor-viva/,
    'a amostra do seletor precisa animar');
  assert.match(APP, /function _palMarcarAmostra\(el, key\)/);
  assert.ok((APP.match(/_palMarcarAmostra\(/g) || []).length >= 5,
    'todos os seletores de cor — nota, modal e pasta — precisam marcar a amostra');
});

test('as cores de gradiente são todas do Premium, e as chapadas todas livres', () => {
  /* A separação é o que sustenta o plano pago. Uma cor de gradiente sem
     `premium` fica aberta para todo mundo sem ninguém perceber: o seletor não
     reclama, ele só deixa de desenhar o cadeado. */
  const PAL = lerPaleta();
  const pagas = Object.keys(PAL).filter(k => PAL[k].premium);
  const livres = Object.keys(PAL).filter(k => !PAL[k].premium);

  assert.ok(pagas.length >= 19, 'a família paga encolheu');
  assert.ok(livres.length >= 19, 'a família gratuita encolheu');
  assert.ok(pagas.includes('gCorViva'), 'a cor que se move é do plano pago');
  for (const k of ['gNebulosa', 'gCrepusculo', 'gFloresta', 'gAbissal', 'gVulcao',
                   'gAmetista', 'gTundra', 'gDeserto', 'gOrquidea', 'gEclipse']) {
    assert.ok(pagas.includes(k), `${k} escapou da trava de plano`);
  }
  // Nenhuma cor paga pode ser chapada: seria pagar pelo que já existe de graça.
  for (const k of pagas) {
    const p = PAL[k];
    assert.ok(!!p.grad || String(p.bg).includes('gradient'),
      `${k} é paga mas não tem gradiente — não entrega nada a mais`);
  }
});
