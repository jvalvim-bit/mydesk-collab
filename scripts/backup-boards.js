'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   BACKUP DOS QUADROS, ANTES DE QUALQUER REPARO
   ═══════════════════════════════════════════════════════════════════════
   Este script NÃO escreve nada. Ele só lê e grava um arquivo local com o
   estado atual dos nós de nota — quadro pessoal, quadros pessoais nomeados,
   workspaces 1:1 e quadros de grupo — para que qualquer conserto depois tenha
   um ponto de retorno.

   Um reparo de dado sem exportação prévia é uma aposta: se a regra de conserto
   estiver errada, não há de onde voltar. Este arquivo é o de onde voltar.

     node scripts/backup-boards.js
     node scripts/backup-boards.js --uid <uid>   # limita a um usuário

   A saída vai para backups/boards-<timestamp>.json, fora do git.
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

const arg = nome => {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : null;
};

async function ler(caminho) {
  const snap = await db.ref(caminho).once('value');
  return snap.val();
}

/* Só o que interessa ao problema: os nós que guardam nota. O resto do banco
   (chat, presença, planos) fica de fora — backup gigante é backup que não se
   inspeciona. */
async function main() {
  const uidAlvo = arg('--uid');
  const saida = { geradoEm: new Date().toISOString(), projeto: chave.project_id, boards: {} };

  const users = await ler('users') || {};
  const uids = uidAlvo ? [uidAlvo] : Object.keys(users);
  console.log(`Usuários: ${uids.length}`);

  for (const uid of uids) {
    const u = users[uid] || {};
    if (u.notes) saida.boards[`users/${uid}/notes`] = u.notes;
    Object.entries(u.personalBoards || {}).forEach(([id, b]) => {
      if (b && b.notes) saida.boards[`users/${uid}/personalBoards/${id}/notes`] = b.notes;
    });
  }

  const shared = await ler('shared_boards') || {};
  Object.entries(shared).forEach(([k, b]) => {
    if (b && b.notes) saida.boards[`shared_boards/${k}/notes`] = b.notes;
  });

  const grupos = await ler('group_boards') || {};
  Object.entries(grupos).forEach(([k, b]) => {
    if (b && b.notes) saida.boards[`group_boards/${k}/notes`] = b.notes;
  });

  const dir = path.join(RAIZ, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir,
    `boards-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2), 'utf8');

  console.log(`\nQuadros salvos: ${Object.keys(saida.boards).length}`);
  Object.entries(saida.boards).forEach(([caminho, notas]) => {
    console.log(`  ${Object.keys(notas || {}).length.toString().padStart(4)} notas  ${caminho}`);
  });
  console.log(`\nArquivo: ${arquivo}`);
  console.log(`Tamanho: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
  process.exit(0);
}

main().catch(e => { console.error('falhou:', e.message); process.exit(1); });
