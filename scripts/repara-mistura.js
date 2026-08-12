'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   REPARO: DEVOLVE CADA NOTA AO SEU QUADRO, E CONSERTA A ACENTUAÇÃO
   ═══════════════════════════════════════════════════════════════════════
   POR PADRÃO NÃO ESCREVE NADA. Sem --gravar ele só imprime o que faria.

     node scripts/repara-mistura.js              # simulação
     node scripts/repara-mistura.js --gravar     # aplica

   REGRA DE OURO: a remoção acontece sempre no quadro que RECEBEU a cópia,
   nunca no que criou a nota. A origem foi determinada por duas testemunhas
   escritas no momento do ato e que não viajam junto com a cópia — ver
   scripts/origem-das-notas.js:

     · nota com "criou" no feed de um quadro compartilhado nasceu ali;
     · nota sem "criou" em feed nenhum nasceu no quadro pessoal, que não tem
       feed por não ter com quem se comunicar.

   O texto NÃO é reescrito por adivinhação: o conserto de acento só é aplicado
   quando a decodificação é reversível — desfazer o mojibake e refazer tem de
   devolver exatamente a string original. Caso contrário a nota fica como está
   e é listada como não tratada, porque um texto errado de outro jeito é pior
   do que o texto errado que já se conhece.
   ═══════════════════════════════════════════════════════════════════════ */
const path = require('node:path');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const RAIZ = path.resolve(__dirname, '..');
const chave = require(path.join(RAIZ, 'serviceAccountKey.json'));
if (!getApps().length) {
  initializeApp({
    credential: cert(chave),
    databaseURL: process.env.FIREBASE_DATABASE_URL ||
      `https://${chave.project_id}-default-rtdb.firebaseio.com`,
  });
}
const db = getDatabase();
const GRAVAR = process.argv.includes('--gravar');

const PESSOAL = 'users/LFnyIWcUzDfwdtSOErKKlprCgw62/notes';
const UM_A_UM = 'shared_boards/arturbanhos__jvalvim/notes';
const GRUPO   = 'group_boards/jvalvim_mmz2m907/notes';

const ler = async c => (await db.ref(c).once('value')).val() || {};

/* ── Mojibake ──
   UTF-8 lido como Latin-1. "ç" (C3 A7) vira "Ã§". Desfazer é ler cada
   caractere como byte e decodificar de novo como UTF-8. */
function desfazMojibake(s) {
  const bytes = Uint8Array.from([...String(s)].map(c => c.charCodeAt(0) & 0xff));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (_) { return null; }                       // não era mojibake
}
/* Só aceita o conserto se ele for REVERSÍVEL: recodificar o resultado tem de
   reproduzir a string estragada, caractere por caractere. É essa ida e volta
   que separa "eu sei o que isto era" de "eu chutei". */
function consertaTexto(s) {
  const t = String(s == null ? '' : s);
  if (!/[ÃÂ]./.test(t)) return null;               // não parece corrompido
  const limpo = desfazMojibake(t);
  if (limpo === null || limpo === t) return null;
  const devolta = [...new TextEncoder().encode(limpo)]
    .map(b => String.fromCharCode(b)).join('');
  return devolta === t ? limpo : null;             // não fecha: não mexe
}

async function main() {
  console.log(GRAVAR ? '### MODO GRAVAÇÃO ###\n' : '### SIMULAÇÃO (use --gravar para aplicar) ###\n');

  const pessoal = await ler(PESSOAL);
  const umAUm   = await ler(UM_A_UM);
  const grupo   = await ler(GRUPO);

  const idsDe = o => new Set(Object.values(o).map(n => String(n.id)));
  const idsPessoal = idsDe(pessoal);
  const idsUmAUm   = idsDe(umAUm);

  const remocoes = [];

  // ── 1. Grupo: sai o que nasceu no pessoal ou no 1:1 ──
  Object.entries(grupo).forEach(([k, n]) => {
    const id = String(n.id);
    if (idsPessoal.has(id)) remocoes.push({ base: GRUPO, k, n, origem: 'quadro pessoal' });
    else if (idsUmAUm.has(id)) remocoes.push({ base: GRUPO, k, n, origem: 'workspace 1:1' });
  });

  // ── 2. Workspace 1:1: sai o que nasceu no pessoal ──
  Object.entries(umAUm).forEach(([k, n]) => {
    if (idsPessoal.has(String(n.id))) {
      remocoes.push({ base: UM_A_UM, k, n, origem: 'quadro pessoal' });
    }
  });

  console.log('═══ CÓPIAS A REMOVER ═══');
  [GRUPO, UM_A_UM].forEach(base => {
    const doBase = remocoes.filter(r => r.base === base);
    const total = Object.keys(base === GRUPO ? grupo : umAUm).length;
    console.log(`\n  ${base.replace('/notes', '')}`);
    console.log(`  ${doBase.length} cópias saem, ${total - doBase.length} notas próprias ficam`);
    doBase.forEach(r => console.log(
      `      − ${String(r.n.title || '(sem título)').slice(0, 46).padEnd(48)} (nasceu no ${r.origem})`));
  });

  // ── 3. Acentuação, só no quadro de origem ──
  console.log('\n═══ ACENTUAÇÃO ═══');
  const consertos = [];
  const naoTratadas = [];
  Object.entries(pessoal).forEach(([k, n]) => {
    const mudou = {};
    ['title', 'body'].forEach(campo => {
      const novo = consertaTexto(n[campo]);
      if (novo !== null) mudou[campo] = novo;
    });
    if (Object.keys(mudou).length) consertos.push({ base: PESSOAL, k, n, mudou });
    else if (/[ÃÂ]./.test(String(n.title || '') + String(n.body || ''))) naoTratadas.push(n);
  });
  console.log(`\n  ${consertos.length} notas com conserto reversível:`);
  consertos.forEach(c => {
    const antes  = String(c.n.title || '(sem título)').slice(0, 34);
    const depois = String(c.mudou.title || c.n.title || '(sem título)').slice(0, 34);
    console.log(`      ${antes.padEnd(36)} →  ${depois}`);
  });
  if (naoTratadas.length) {
    console.log(`\n  ${naoTratadas.length} não tratadas (a ida e volta não fecha — ficam como estão):`);
    naoTratadas.forEach(n => console.log(`      ${String(n.title || '').slice(0, 46)}`));
  }

  if (!GRAVAR) {
    console.log(`\n─── nada foi gravado. ${remocoes.length} remoções e ${consertos.length} correções prontas. ───`);
    process.exit(0);
  }

  const patch = {};
  remocoes.forEach(r => { patch[`${r.base}/${r.k}`] = null; });
  consertos.forEach(c => Object.entries(c.mudou)
    .forEach(([campo, v]) => { patch[`${c.base}/${c.k}/${campo}`] = v; }));

  // Uma escrita só: ou tudo entra, ou nada entra. Meia limpeza deixaria o
  // banco num estado que nem o backup nem o diagnóstico descrevem.
  await db.ref().update(patch);
  console.log(`\n✓ ${remocoes.length} cópias removidas, ${consertos.length} notas corrigidas.`);
  process.exit(0);
}

main().catch(e => { console.error('falhou:', e.message); process.exit(1); });
