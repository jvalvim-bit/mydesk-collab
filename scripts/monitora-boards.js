'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   OLHA OS QUADROS AO VIVO E DIZ QUANDO ALGUÉM ESCREVE
   ═══════════════════════════════════════════════════════════════════════
   Só lê. Serve para duas coisas:

     · confirmar que o banco está PARADO antes de restaurar — restaurar com
       alguém escrevendo é o que desfez os reparos de 01/08/2026;
     · flagrar a escrita no ato, e não pelo estrago depois. Cada mudança sai
       com hora, quadro, quantas notas entraram e quantas saíram.

     node scripts/monitora-boards.js            # até Ctrl+C
     node scripts/monitora-boards.js --seg 60   # para sozinho após 60s
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

const QUADROS = {
  'pessoal':    'users/LFnyIWcUzDfwdtSOErKKlprCgw62/notes',
  'socios 1:1': 'shared_boards/arturbanhos__jvalvim/notes',
  'MyDesk Devs': 'group_boards/jvalvim_mmz2m907/notes',
};

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const limite = Number(arg('--seg')) || 0;

const hora = () => new Date().toLocaleTimeString('pt-BR');
const anterior = {};
let mudou = false;

console.log('Observando. Ctrl+C para parar.\n');

Object.entries(QUADROS).forEach(([nome, caminho]) => {
  db.ref(caminho).on('value', snap => {
    const v = snap.val() || {};
    const ids = new Set(Object.keys(v));
    const antes = anterior[nome];
    anterior[nome] = ids;

    if (!antes) {                                   // primeira leitura
      console.log(`${hora()}  ${nome.padEnd(12)} ${String(ids.size).padStart(3)} notas`);
      return;
    }
    const entraram = [...ids].filter(k => !antes.has(k));
    const sairam   = [...antes].filter(k => !ids.has(k));
    if (!entraram.length && !sairam.length) return;

    mudou = true;
    console.log(`\n${hora()}  ESCRITA em ${nome}: ${antes.size} → ${ids.size}`);
    entraram.slice(0, 8).forEach(k =>
      console.log(`     + ${String(v[k]?.title || '(sem título)').slice(0, 44)}`));
    sairam.slice(0, 8).forEach(k => console.log(`     − ${k}`));
    if (entraram.length > 8 || sairam.length > 8) console.log('     …');
  });
});

if (limite) {
  setTimeout(() => {
    console.log(mudou
      ? `\n─── houve escrita nesses ${limite}s. O app AINDA está aberto em algum lugar. ───`
      : `\n─── ${limite}s sem nenhuma escrita: o banco está parado, pode restaurar. ───`);
    process.exit(0);
  }, limite * 1000);
}
