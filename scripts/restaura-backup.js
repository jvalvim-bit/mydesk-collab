'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   RESTAURA UM QUADRO EXATAMENTE COMO ELE ESTAVA NUM BACKUP
   ═══════════════════════════════════════════════════════════════════════
   POR PADRÃO NÃO ESCREVE NADA.

     node scripts/restaura-backup.js <arquivo.json>            # simulação
     node scripts/restaura-backup.js <arquivo.json> --gravar   # aplica

   POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE SÓ DEVE RODAR COM O APP FECHADO
   `saveNotes` grava o quadro INTEIRO de uma vez (fbSet no nó `notes`), com o
   array que o navegador tem em memória. Não é escrita por nota: é substituição
   do quadro. Logo, qualquer aba aberta com um array velho apaga e reescreve o
   quadro inteiro no primeiro save — arrastar uma nota basta.

   Foi isso que desfez o reparo de 01/08/2026: o banco foi consertado com o app
   aberto, e uma aba com o estado antigo em memória regravou tudo por cima,
   levando junto 7 notas do quadro pessoal.

   Consertar dado com o cliente vivo é escrever contra alguém que escreve de
   volta. Feche o app em TODOS os dispositivos antes, e só reabra depois de
   verificar.
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

const GRAVAR = process.argv.includes('--gravar');
const arquivo = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : null;
if (!arquivo) {
  console.error('uso: node scripts/restaura-backup.js <arquivo.json> [--gravar]');
  process.exit(1);
}

const alvo = JSON.parse(fs.readFileSync(arquivo, 'utf8')).boards || {};

/* Só os quadros que o incidente tocou. Restaurar o banco inteiro mexeria em
   quadro de outra pessoa que nunca teve problema — e quadro que ninguém
   estragou não se conserta. */
const QUADROS = [
  'users/LFnyIWcUzDfwdtSOErKKlprCgw62/notes',
  'shared_boards/arturbanhos__jvalvim/notes',
  'group_boards/jvalvim_mmz2m907/notes',
];

async function main() {
  console.log(GRAVAR ? '### MODO GRAVAÇÃO ###\n' : '### SIMULAÇÃO (use --gravar para aplicar) ###\n');
  console.log(`Origem: ${path.basename(arquivo)}\n`);

  const patch = {};
  for (const caminho of QUADROS) {
    const desejado = alvo[caminho];
    if (!desejado) { console.log(`  (pulado, ausente no backup)  ${caminho}`); continue; }
    const atual = (await db.ref(caminho).once('value')).val() || {};

    const idsA = new Set(Object.keys(atual));
    const idsD = new Set(Object.keys(desejado));
    const somem  = [...idsA].filter(k => !idsD.has(k));
    const voltam = [...idsD].filter(k => !idsA.has(k));

    console.log(`  ${caminho.replace('/notes', '')}`);
    console.log(`     agora ${idsA.size} → restaurado ${idsD.size}` +
                `   (${voltam.length} voltam, ${somem.length} saem)`);
    voltam.slice(0, 10).forEach(k =>
      console.log(`        + ${String(desejado[k].title || '(sem título)').slice(0, 44)}`));
    somem.slice(0, 10).forEach(k =>
      console.log(`        − ${String(atual[k].title || '(sem título)').slice(0, 44)}`));

    // Substituição do nó inteiro: é o que garante "exatamente como estava".
    patch[caminho] = desejado;
  }

  if (!GRAVAR) {
    console.log('\n─── nada foi gravado. ───');
    process.exit(0);
  }
  await db.ref().update(patch);
  console.log('\n✓ quadros restaurados.');

  // Confere lendo de volta: escrever e acreditar é como o reparo anterior se
  // perdeu sem ninguém ver.
  for (const caminho of QUADROS) {
    if (!alvo[caminho]) continue;
    const v = (await db.ref(caminho).once('value')).val() || {};
    const ok = Object.keys(v).length === Object.keys(alvo[caminho]).length;
    console.log(`  ${ok ? '✓' : '✗'} ${caminho.replace('/notes', '')}: ${Object.keys(v).length} notas`);
  }
  process.exit(0);
}

main().catch(e => { console.error('falhou:', e.message); process.exit(1); });
