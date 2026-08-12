'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O RELATÓRIO EM POWERPOINT
   ═══════════════════════════════════════════════════════════════════════
   Um .pptx é um ZIP de XML. Errar um byte do ZIP ou uma tag do XML não dá
   erro na geração: dá um arquivo que o PowerPoint recusa a abrir, com uma
   mensagem que não diz o que faltou — e isso só se descobre na frente de
   quem ia ver a apresentação.

   Por isso este arquivo abre o pacote de verdade: percorre o diretório
   central do ZIP, confere o CRC de cada entrada e olha as partes sem as
   quais o Office recusa o conjunto inteiro.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PPT = require(path.join(RAIZ, 'docs/js/relatorio-pptx.js'));
const FONTE = fs.readFileSync(path.join(RAIZ, 'docs/js/relatorio-pptx.js'), 'utf8');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

const brl = v => 'R$ ' + Number(v).toFixed(2);
const DADOS = {
  titulo: 'Relatório financeiro', subtitulo: 'Fulana', periodo: 'p', emitido: 'e',
  referencia: 'MD-1', rodape: 'r', fmt: brl, fmtCurto: brl, totalCarteira: brl(100),
  kpis: [{ rot: 'A', valor: brl(1), pe: 'x', cor: '0F7A52' }],
  meses: [{ rotulo: 'Jan', total: 10, pago: 5 }, { rotulo: 'Fev', total: 20, pago: 20 }],
  composicao: [{ rot: 'Recebido', valor: 60, cor: '0F7A52', detalhe: '1' },
    { rot: 'Vencido', valor: 40, cor: 'B3261E', detalhe: '2' }],
  aging: [{ rot: 'ate 30', valor: 10, cor: 'E0A33C', detalhe: '1' }],
  piorAtraso: 'Alguem — R$ 10, vencido ha 40 dias.',
  maiores: [{ nome: 'Cliente & Cia <teste>', valor: 60, pct: '60%' }],
  concentracao: 'c',
  vencimentos: [{ quando: '01/01', nome: 'X', valor: 5, situacao: 's' }],
  novos: [{ rotulo: 'Jan', n: 2 }],
  kpisBase: [{ rot: 'B', valor: '2', pe: 'y', cor: '4F46E5' }],
  leitura: [{ titulo: 'T', texto: 'x', cor: '4F46E5' }],
  aviso: 'a',
  t: { resumo: 'r', resumoSub: '', evolucao: 'e', evolucaoSub: '', faturado: 'f',
    recebido: 'rc', composicao: 'c', composicaoSub: '', total: 't', atraso: 'a',
    atrasoSub: '', piorAtraso: 'p', clientes: 'cl', clientesSub: '',
    concentracao: 'co', vencimentos: 'v', vencimentosSub: '', colData: 'd',
    colCliente: 'c', colSituacao: 's', colValor: 'val', semVencimentos: 'sv',
    base: 'b', baseSub: '', leitura: 'l', leituraSub: '' },
};

/* Leitor de ZIP mínimo: percorre o diretório central e devolve nome → bytes.
   As entradas são gravadas sem compressão, então basta recortar. */
function abrirZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fim > 0, 'nao achei o fim do diretorio central: o ZIP esta quebrado');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const saida = {};
  for (let i = 0; i < total; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'entrada ' + i + ' do diretorio corrompida');
    const metodo = buf.readUInt16LE(p + 10);
    const tam = buf.readUInt32LE(p + 24);
    const nomeLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const comentLen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + nomeLen).toString('utf8');
    assert.equal(metodo, 0, nome + ' saiu comprimido: o gerador nao usa deflate');
    assert.equal(buf.readUInt32LE(off), 0x04034b50, 'cabecalho local errado em ' + nome);
    const nomeLenL = buf.readUInt16LE(off + 26);
    const extraLenL = buf.readUInt16LE(off + 28);
    const ini = off + 30 + nomeLenL + extraLenL;
    saida[nome] = buf.slice(ini, ini + tam);
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return saida;
}

test('o pacote abre como ZIP e traz as partes que o Office exige', () => {
  const buf = Buffer.from(PPT.paraUint8(DADOS));
  assert.equal(buf.slice(0, 2).toString(), 'PK', 'nao e um ZIP');
  const partes = abrirZip(buf);
  /* Sem qualquer uma destas o PowerPoint recusa o arquivo inteiro, e a
     mensagem dele nao diz qual faltou. */
  ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels', 'ppt/theme/theme1.xml',
    'ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
  ].forEach(n => assert.ok(partes[n], 'faltou ' + n));

  for (let i = 1; i <= 9; i++) {
    assert.ok(partes['ppt/slides/slide' + i + '.xml'], 'faltou o slide ' + i);
    assert.ok(partes['ppt/slides/_rels/slide' + i + '.xml.rels'],
      'slide ' + i + ' sem rels: o Office recusa o pacote');
  }
  assert.ok(!partes['ppt/slides/slide10.xml'], 'apareceu slide a mais');
});

test('o CRC de cada entrada bate com o conteudo gravado', () => {
  /* CRC errado e um arquivo que o Windows lista e o PowerPoint recusa. */
  const buf = Buffer.from(PPT.paraUint8(DADOS));
  const partes = abrirZip(buf);
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  let conferidos = 0;
  for (let i = 0; i < total; i++) {
    const crc = buf.readUInt32LE(p + 16);
    const nomeLen = buf.readUInt16LE(p + 28);
    const nome = buf.slice(p + 46, p + 46 + nomeLen).toString('utf8');
    assert.equal(PPT.crc32(partes[nome]), crc, 'CRC errado em ' + nome);
    conferidos++;
    p += 46 + nomeLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  assert.equal(conferidos, total);
  assert.ok(total >= 20, 'o pacote perdeu partes');
});

test('nenhum & solto sobra no XML', () => {
  /* Uma & nao escapada quebra o arquivo inteiro, e um nome de cliente colado
     de outro sistema traz "&" com frequencia. */
  const partes = abrirZip(Buffer.from(PPT.paraUint8(DADOS)));
  Object.keys(partes).forEach(nome => {
    const s = partes[nome].toString('utf8');
    assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(s), false,
      nome + ': & solto quebra o XML');
  });
});

test('nome de cliente com & e < sai escapado', () => {
  const partes = abrirZip(Buffer.from(PPT.paraUint8(DADOS)));
  const s = partes['ppt/slides/slide6.xml'].toString('utf8');
  assert.match(s, /Cliente &amp; Cia &lt;teste&gt;/);
});

test('a fatia da rosca normaliza o angulo, senao a primeira sai deslocada', () => {
  /* O -90 poe a primeira fatia no topo, e com isso ela nasce em -90 graus. O
     PowerPoint nao normaliza esse valor: desenha a forma com o centro em
     outro lugar, e no slide ela aparece escorregada para fora da rosca. Foi
     exatamente o que aconteceu, e so com a primeira — a unica que cruza o
     zero. */
  assert.match(FONTE, /const norm = g => \(\(g % 360\) \+ 360\) % 360;/);
  const partes = abrirZip(Buffer.from(PPT.paraUint8(DADOS)));
  const s = partes['ppt/slides/slide4.xml'].toString('utf8');
  assert.equal(/fmla="val -\d/.test(s), false, 'sobrou angulo negativo na rosca');
});

test('cada forma do slide tem id proprio', () => {
  /* Dois shapes com o mesmo id fazem o PowerPoint recusar o slide. */
  const partes = abrirZip(Buffer.from(PPT.paraUint8(DADOS)));
  for (let i = 1; i <= 9; i++) {
    const s = partes['ppt/slides/slide' + i + '.xml'].toString('utf8');
    const ids = [...s.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'id repetido no slide ' + i);
  }
});

test('o botao do PowerPoint fica ao lado do PDF, e as contas sao as mesmas', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'docs/index.html'), 'utf8');
  assert.match(html, /js\/relatorio-pptx\.js\?v=/, 'a pagina nao carrega o gerador');
  assert.match(APP, /id="rel-pptx"/);
  assert.match(APP, /baixarRelatorioCRMemPPTX\(\)/);
  /* Uma segunda apuracao acabaria divergindo da primeira, e ninguem percebe
     ate alguem comparar dois documentos numa reuniao. */
  const fn = APP.slice(APP.indexOf('async function baixarRelatorioCRMemPPTX('));
  assert.match(fn.slice(0, 2500), /_relatorioDados\(\)/);
});
