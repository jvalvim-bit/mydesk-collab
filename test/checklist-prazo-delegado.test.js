'use strict';
/* Prazo e responsável por item de checklist. O que este arquivo protege não é
   a tela: é o FORMATO do dado, que viaja dentro de toda nota, em toda
   gravação, em todos os quadros. Um campo a mais gravado por engano em cada
   item se multiplica por centenas de itens e não volta atrás sozinho — e um
   campo perdido na leitura apaga um prazo que alguém marcou. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

function recortar(nome) {
  const ini = fonte.indexOf('function ' + nome + '(');
  assert.ok(ini > -1, 'função não encontrada: ' + nome);
  let prof = 0, i = fonte.indexOf('{', ini);
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') prof++;
    else if (fonte[i] === '}') { prof--; if (!prof) break; }
  }
  return fonte.slice(ini, i + 1);
}

/* As três funções puras do modelo, rodando de verdade — não é varredura de
   texto: o que interessa aqui é o objeto que sai. */
const ctx = vm.createContext({});
vm.runInContext(recortar('_itemDoChecklist'), ctx);
vm.runInContext(recortar('_normalizarChecklist'), ctx);
vm.runInContext(recortar('_clSituacaoDoPrazo'), ctx);
vm.runInContext(recortar('_clPrazoCurto'), ctx);
vm.runInContext(`
  const _clHojeISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  };`, ctx);
const { _itemDoChecklist, _normalizarChecklist, _clSituacaoDoPrazo, _clPrazoCurto } = ctx;

/* Os objetos nascem dentro do vm, com outro Object.prototype — comparação
   estrita reclama da identidade do protótipo antes de olhar o conteúdo. */
const puro = valor => JSON.parse(JSON.stringify(valor));

const hoje = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
};
/* Data LOCAL, e nao UTC. `toISOString()` devolve a data em UTC: das 21h a
   meia-noite no Brasil ele ja esta no dia seguinte, e um prazo de "ontem"
   virava "hoje" — o teste passava de manha e quebrava a noite, sem nada ter
   mudado no codigo. O app compara data local (ver _crmTodayLocalIso), e o
   teste tem de comparar a mesma coisa. */
const _diaLocal = ms => {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
};
const emDias = n => _diaLocal(Date.now() + n * 86400000);

test('item sem prazo e sem responsável não ganha campo nenhum', () => {
  /* Gravar prazo:'' e para:'' em todo item parece inofensivo e não é: o
     checklist viaja dentro da nota, a nota viaja em toda gravação, e um
     workspace com centenas de itens pagaria por dois campos vazios em cada um
     deles, para sempre. */
  assert.deepEqual(puro(_itemDoChecklist({ text: 'comprar café', done: false })),
    { text: 'comprar café', done: false });
  assert.deepEqual(Object.keys(_itemDoChecklist({ text: 'x', prazo: '', para: '' })),
    ['text', 'done']);
});

test('item antigo atravessa a leitura sem mudar — nada precisa ser migrado', () => {
  const antigos = [{ text: 'a', done: true }, { text: 'b', done: false }];
  assert.deepEqual(puro(_normalizarChecklist(antigos)), antigos);
  // E o formato de objeto indexado que o Firebase devolve continua funcionando.
  assert.deepEqual(puro(_normalizarChecklist({ 1: { text: 'b' }, 0: { text: 'a', done: true } })),
    [{ text: 'a', done: true }, { text: 'b', done: false }]);
});

test('prazo só entra no formato de data, e o resto é descartado', () => {
  assert.equal(_itemDoChecklist({ text: 'x', prazo: '2026-08-12' }).prazo, '2026-08-12');
  ['12/08/2026', '2026-8-1', 'amanhã', '2026-08-12T10:00', true, 42].forEach(lixo => {
    assert.ok(!('prazo' in _itemDoChecklist({ text: 'x', prazo: lixo })),
      'aceitou prazo inválido: ' + JSON.stringify(lixo));
  });
});

test('responsável é texto curto, e espaço em branco não conta como pessoa', () => {
  assert.equal(_itemDoChecklist({ text: 'x', para: 'vitoria' }).para, 'vitoria');
  assert.ok(!('para' in _itemDoChecklist({ text: 'x', para: '   ' })));
  assert.equal(_itemDoChecklist({ text: 'x', para: 'a'.repeat(200) }).para.length, 40);
});

test('atrasado, vence hoje, no prazo — e concluído nunca é atrasado', () => {
  assert.equal(_clSituacaoDoPrazo({ prazo: emDias(-1) }), 'atrasado');
  assert.equal(_clSituacaoDoPrazo({ prazo: hoje() }), 'hoje');
  assert.equal(_clSituacaoDoPrazo({ prazo: emDias(3) }), '');
  assert.equal(_clSituacaoDoPrazo({}), '');
  /* Item vencido que foi FEITO deixa de ser cobrado. Continuar vermelho seria
     cobrar o que já foi pago. */
  assert.equal(_clSituacaoDoPrazo({ prazo: emDias(-5), done: true }), '');
});

test('a comparação de data é por texto, e não por fuso', () => {
  /* `new Date('2026-08-02')` nasce em UTC: no Brasil, às 21h de 01/08 ele já
     é 02/08, e um prazo de hoje apareceria como atrasado — ou o contrário.
     Comparar aaaa-mm-dd como string não tem esse buraco. */
  const corpo = recortar('_clSituacaoDoPrazo');
  assert.ok(!/new Date\(/.test(corpo),
    'voltou a construir Date a partir do texto do prazo');
});

test('a data curta some com o ano corrente e o mostra quando muda', () => {
  const ano = new Date().getFullYear();
  assert.equal(_clPrazoCurto(ano + '-08-12'), '12/08');
  assert.equal(_clPrazoCurto((ano + 1) + '-08-12'), '12/08/' + String(ano + 1).slice(2));
  assert.equal(_clPrazoCurto(''), '');
});

test('o texto do item quebra linha: é textarea, e não input de uma linha', () => {
  const render = recortar('renderChecklist');
  assert.match(render, /<textarea class="n-cl-text"/,
    'o item voltou a ser input de uma linha e corta texto longo');
  assert.match(render, /_clAjustarAltura\(/,
    'sem reajustar a altura, a caixa não cresce com o conteúdo');
  // Enter continua criando o próximo item; Shift+Enter é que quebra linha.
  assert.match(render, /e\.key !== 'Enter' \|\| e\.shiftKey/);
});

test('a janelinha de prazo fecha por composedPath, não por contains', () => {
  /* A lista de participantes é redesenhada depois de carregar. Com `contains`,
     um clique num elemento que acabou de ser substituído chega ao document já
     fora do DOM e a janela se fecha sozinha no meio do uso — a armadilha que
     já mordeu o calendário e a navegação mobile. */
  const pop = recortar('_clAbrirOpcoes');
  assert.match(pop, /composedPath\(\)/);
  assert.ok(!/pop\.contains\(/.test(pop));
});
