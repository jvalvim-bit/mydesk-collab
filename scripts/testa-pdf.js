/* Gera um PDF com o código real do app e confere a estrutura do arquivo:
   cada offset da tabela xref tem de apontar para o começo do objeto certo,
   senão o leitor recusa o arquivo. */
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync('C:/Users/jvalv/MyDesk/docs/js/app.js', 'utf8');

const noop = () => {};
const elFake = () => ({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, appendChild: noop, remove: noop, click: noop,
  querySelector: () => elFake(), querySelectorAll: () => [],
  getContext: () => null,   // força o caminho de estimativa da largura
  set innerHTML(v) {}, get innerHTML() { return ''; },
});
const doc = {
  addEventListener: noop, createElement: elFake, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [], body: elFake(), head: elFake(),
  documentElement: elFake(), readyState: 'complete',
};
const store = { getItem: () => null, setItem: noop, removeItem: noop };
const win = {
  addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  localStorage: store, sessionStorage: store, location: { href: '', search: '', hostname: 'localhost' },
  navigator: { userAgent: 'node' }, requestAnimationFrame: noop, setTimeout, setInterval: () => 1,
  clearTimeout, clearInterval, innerWidth: 1440, innerHeight: 900, indexedDB: { open: () => ({}) }, console,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: noop },
};
const sandbox = Object.assign(Object.create(null), win, {
  window: win, document: doc, localStorage: store, sessionStorage: store, console,
  navigator: win.navigator, location: win.location, URL: win.URL,
  fetch: () => Promise.resolve({}), CSS: { escape: s => s }, Blob: function (p) { this.parts = p; },
  Image: function () {}, Audio: function () { return { play: noop }; }, AudioContext: function () {},
  URLSearchParams, TextEncoder, TextDecoder, performance: { now: () => 0 }, screen: {},
});
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'app.js' });

// ── monta um documento parecido com o relatório real ──
const d = sandbox._pdfNovoDoc();
d.texto(48, 62, 'Relatório financeiro', { tam: 20, negrito: true });
d.texto(48, 80, 'Ação, coração, José · gerado em 26/07/2026', { tam: 9, cor: [0.4, 0.4, 0.5] });
d.linha(48, 92, 547, 92);
d.retangulo(48, 110, 120, 46, { borda: [0.87, 0.87, 0.9] });
d.texto(547, 140, 'R$ 13.623,00', { tam: 12, negrito: true, alinhar: 'dir' });
d.novaPagina();
d.texto(48, 60, 'Página 2 (quebra funcionando)', { tam: 11 });
const bytes = d.bytes();

const arq = 'C:/Users/jvalv/AppData/Local/Temp/claude/C--Users-jvalv/6bfe74ab-4905-462b-b79e-9a24a2ce84cf/scratchpad/teste.pdf';
fs.writeFileSync(arq, Buffer.from(bytes));
const buf = fs.readFileSync(arq);
const txt = buf.toString('latin1');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK  ' : ' FALHA') + ' │ ' + msg); if (!cond) falhas++; };

ok(txt.startsWith('%PDF-1.4'), 'cabeçalho %PDF');
ok(txt.trimEnd().endsWith('%%EOF'), 'termina com %%EOF');

// xref: confere cada offset
const mXref = /startxref\s+(\d+)/.exec(txt);
ok(!!mXref, 'startxref presente');
const inicio = Number(mXref[1]);
ok(txt.slice(inicio, inicio + 4) === 'xref', 'startxref aponta para a tabela xref');

const corpoXref = txt.slice(inicio);
const mTam = /xref\s+0 (\d+)/.exec(corpoXref);
const total = Number(mTam[1]);
// [0]="xref" [1]="0 N" [2]=entrada livre do objeto 0 → os objetos reais começam em [3]
const linhas = corpoXref.split('\n').slice(3, 3 + total - 1);
let offsetsOk = true;
linhas.forEach((l, i) => {
  const off = Number(l.slice(0, 10));
  const esperado = `${i + 1} 0 obj`;
  if (txt.slice(off, off + esperado.length) !== esperado) {
    offsetsOk = false;
    console.log('       offset errado no objeto', i + 1, '→', JSON.stringify(txt.slice(off, off + 12)));
  }
});
ok(offsetsOk, `todos os ${total - 1} offsets do xref apontam para o objeto certo`);
ok(/\/Type \/Catalog/.test(txt), 'catálogo presente');
ok((txt.match(/\/Type \/Page[^s]/g) || []).length === 2, 'duas páginas geradas');
ok(/Ação, coração, José/.test(txt), 'acento gravado em latin-1');
ok(/\/Encoding \/WinAnsiEncoding/.test(txt), 'fonte com WinAnsiEncoding');

// /Length de cada stream tem de bater com o conteúdo
let lens = true;
const re = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g;
let m;
while ((m = re.exec(txt))) if (Number(m[1]) !== m[2].length) { lens = false; }
ok(lens, '/Length de cada stream confere');

console.log('\narquivo:', arq, '·', buf.length, 'bytes');
console.log(falhas ? falhas + ' FALHA(S)' : 'estrutura do PDF válida');
process.exit(falhas ? 1 : 0);
