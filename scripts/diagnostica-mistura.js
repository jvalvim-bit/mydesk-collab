'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   DIAGNÓSTICO: NOTAS QUE ESTÃO EM MAIS DE UM QUADRO
   ═══════════════════════════════════════════════════════════════════════
   Lê o arquivo de backup — não o banco — e responde três perguntas:

     1. Que notas aparecem no MESMO id em dois quadros diferentes? Um id de
        nota é `Date.now()` no instante da criação: ele nasce num quadro só.
        A mesma nota em dois lugares é cópia, não coincidência.
     2. As cópias são idênticas ou divergiram depois?
     3. Quantas notas têm o texto com acentuação corrompida (mojibake),
        e em que quadros.

   Não escreve nada, nem no banco nem no backup. Serve para decidir o reparo
   com número na mão em vez de palpite.

     node scripts/diagnostica-mistura.js [arquivo-de-backup.json]
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const dir = path.join(RAIZ, 'backups');

const arquivo = process.argv[2] || (() => {
  const arqs = fs.readdirSync(dir).filter(f => f.startsWith('boards-')).sort();
  if (!arqs.length) { console.error('nenhum backup em backups/'); process.exit(1); }
  return path.join(dir, arqs[arqs.length - 1]);
})();

const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const boards = dados.boards || {};
console.log(`Backup: ${path.basename(arquivo)}  (${dados.geradoEm})\n`);

/* Mojibake de UTF-8 lido como Latin-1: "ç" vira "Ã§", "ã" vira "Ã£".
   O sinal é o Ã (ou Â) seguido de um caractere de pontuação/símbolo. */
const MOJIBAKE = /[ÃÂ][-¿‘-”©®±µ¶·¹º»¼½¾¿§¨ª]/;
const temMojibake = n =>
  MOJIBAKE.test(String(n?.title || '')) || MOJIBAKE.test(String(n?.body || ''));

const resumo = n => String(n?.title || '(sem título)').slice(0, 42);

// ── 1. Índice: id da nota → quadros em que ela aparece ─────────────────────
const onde = new Map();
Object.entries(boards).forEach(([caminho, notas]) => {
  Object.entries(notas || {}).forEach(([chave, n]) => {
    const id = String(n?.id ?? chave);
    if (!onde.has(id)) onde.set(id, []);
    onde.get(id).push({ caminho, chave, n });
  });
});

const duplicadas = [...onde.entries()].filter(([, v]) => v.length > 1);

console.log('═══ 1. NOTAS PRESENTES EM MAIS DE UM QUADRO ═══');
if (!duplicadas.length) {
  console.log('nenhuma — os quadros não têm nota em comum.\n');
} else {
  console.log(`${duplicadas.length} notas aparecem em mais de um quadro.\n`);
  const pares = new Map();
  duplicadas.forEach(([id, ocorr]) => {
    const par = ocorr.map(o => o.caminho).sort().join('\n        ↕  ');
    if (!pares.has(par)) pares.set(par, []);
    pares.get(par).push({ id, ocorr });
  });
  pares.forEach((lista, par) => {
    console.log(`  ${lista.length} notas em comum entre:\n        ${par}`);
    lista.slice(0, 40).forEach(({ id, ocorr }) => {
      const a = JSON.stringify(ocorr[0].n);
      const iguais = ocorr.every(o => JSON.stringify(o.n) === a);
      console.log(`      ${iguais ? '=' : '≠'} ${id}  ${resumo(ocorr[0].n)}`);
    });
    if (lista.length > 40) console.log(`      … e mais ${lista.length - 40}`);
    console.log('');
  });
  console.log('  legenda: "=" cópias idênticas · "≠" divergiram depois da cópia\n');
}

// ── 2. Mojibake ────────────────────────────────────────────────────────────
console.log('═══ 2. ACENTUAÇÃO CORROMPIDA (gravada no banco) ═══');
let totalMoji = 0;
Object.entries(boards).forEach(([caminho, notas]) => {
  const lista = Object.values(notas || {});
  const ruins = lista.filter(temMojibake);
  totalMoji += ruins.length;
  if (ruins.length) {
    console.log(`  ${ruins.length}/${lista.length}  ${caminho}`);
    ruins.slice(0, 6).forEach(n => console.log(`        ${resumo(n)}`));
    if (ruins.length > 6) console.log(`        … e mais ${ruins.length - 6}`);
  }
});
console.log(totalMoji
  ? `\n  TOTAL: ${totalMoji} notas com texto corrompido no banco.\n`
  : '  nenhuma — a acentuação no banco está íntegra.\n');

// ── 3. Panorama ────────────────────────────────────────────────────────────
console.log('═══ 3. PANORAMA DOS QUADROS ═══');
Object.entries(boards).forEach(([caminho, notas]) => {
  const lista = Object.values(notas || {});
  const cli = lista.filter(n => n?._isClientNote).length;
  const form = lista.filter(n => n?._isFormNote).length;
  const dup = lista.filter(n => (onde.get(String(n?.id)) || []).length > 1).length;
  console.log(`  ${String(lista.length).padStart(3)} notas  ${caminho}`);
  console.log(`           ${dup} em outro quadro · ${cli} de cliente · ${form} de formulário`);
});
console.log('');
