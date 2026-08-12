'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   DE QUAL QUADRO CADA NOTA VEIO
   ═══════════════════════════════════════════════════════════════════════
   Saber que uma nota está em dois quadros não diz em qual ela NASCEU, e é a
   origem que decide de onde a cópia deve sair. Apagar do lado errado apaga o
   original.

   Duas testemunhas independentes, as duas escritas no momento do ato e nunca
   copiadas junto com a nota:

     `atividade`         — registrarAtividade('criou', título) grava no quadro
                           compartilhado em que a pessoa estava. Só existe em
                           quadro compartilhado e de grupo (o pessoal não tem
                           com quem se comunicar), então a ausência em todos
                           eles é, por si, indício de nota pessoal.
     `noteCollaboration` — presença e delegação, gravadas por nota e por quadro.

   Este script só lê. Ele não conclui nada sozinho: imprime as testemunhas
   para a decisão ser tomada com evidência à vista.

     node scripts/origem-das-notas.js
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
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
const ler = async c => (await db.ref(c).once('value')).val();

const dir = path.join(RAIZ, 'backups');
const arqs = fs.readdirSync(dir).filter(f => f.startsWith('boards-')).sort();
const dados = JSON.parse(fs.readFileSync(path.join(dir, arqs[arqs.length - 1]), 'utf8'));
const boards = dados.boards;

const CONTAMINADOS = [
  'users/LFnyIWcUzDfwdtSOErKKlprCgw62/notes',
  'shared_boards/arturbanhos__jvalvim/notes',
  'group_boards/jvalvim_mmz2m907/notes',
];

/* Normaliza o título para casar com o que o feed guardou: ele corta em 60
   caracteres e pode ter sido gravado antes ou depois da corrupção de acento. */
const norm = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[ÃÂ]./g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40);

async function main() {
  // ── Testemunha 1: feeds de atividade ──
  const feeds = {};
  for (const base of ['shared_boards/arturbanhos__jvalvim', 'group_boards/jvalvim_mmz2m907',
                      'group_boards/jvalvim_mmy6nszz', 'shared_boards/doru__morais']) {
    const at = await ler(base + '/atividade') || {};
    feeds[base] = Object.values(at);
    console.log(`feed ${base}: ${feeds[base].length} eventos`);
  }

  // ── Testemunha 2: colaboração por nota ──
  const colab = {};
  const cg = await ler('noteCollaboration/groups') || {};
  const cs = await ler('noteCollaboration/shared') || {};
  Object.entries(cg).forEach(([gid, v]) => {
    Object.keys((v || {}).delegacoes || (v || {}).presence || {}).forEach(nid => {
      (colab[nid] = colab[nid] || []).push('group_boards/' + gid);
    });
  });
  Object.entries(cs).forEach(([k, v]) => {
    Object.keys((v || {}).delegacoes || (v || {}).presence || {}).forEach(nid => {
      (colab[nid] = colab[nid] || []).push('shared_boards/' + k);
    });
  });

  // ── Cruzamento ──
  const onde = new Map();
  CONTAMINADOS.forEach(c => Object.values(boards[c] || {}).forEach(n => {
    const id = String(n.id);
    (onde.get(id) || onde.set(id, []).get(id)).push({ c, n });
  }));

  console.log('\n═══ TESTEMUNHAS, NOTA A NOTA ═══\n');
  for (const [id, ocorr] of onde) {
    if (ocorr.length < 2) continue;
    const titulo = ocorr[0].n.title || '(sem título)';
    const alvo = norm(titulo);
    const criadaEm = Object.entries(feeds)
      .filter(([, ev]) => ev.some(e => e.acao === 'criou' && norm(e.alvo) === alvo && alvo))
      .map(([b]) => b);
    console.log(`${titulo.slice(0, 44)}`);
    console.log(`   está em: ${ocorr.map(o => o.c.replace('/notes', '')).join(' , ')}`);
    console.log(`   "criou" no feed de: ${criadaEm.length ? criadaEm.join(', ') : '— nenhum —'}`);
    if (colab[id]) console.log(`   colaboração em: ${[...new Set(colab[id])].join(', ')}`);
    console.log('');
  }
  process.exit(0);
}
main().catch(e => { console.error('falhou:', e.message); process.exit(1); });
