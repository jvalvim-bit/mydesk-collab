#!/usr/bin/env node
/**
 * Remove permissão administrativa de um usuário.
 * Preserva todas as outras Custom Claims existentes.
 *
 * Uso:
 *   node scripts/remove-admin.js usuario@email.com
 *   node scripts/remove-admin.js --uid UID_DO_USUARIO
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return;

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    const serviceAccount = require(require('path').resolve(keyPath));
    admin.initializeApp({
      credential:  admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL ||
                   `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
    });
    return;
  }

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const dbURL       = process.env.FIREBASE_DATABASE_URL;

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      '\nErro: credenciais não encontradas.\n' +
      'Configure GOOGLE_APPLICATION_CREDENTIALS ou as variáveis individuais.\n' +
      'Veja scripts/.env.example para exemplos.\n'
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential:  admin.credential.cert({ projectId, clientEmail, privateKey }),
    databaseURL: dbURL,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Uso: node scripts/remove-admin.js email@exemplo.com');
    console.error('      node scripts/remove-admin.js --uid UID_DO_USUARIO');
    process.exit(1);
  }

  initAdmin();
  const auth = admin.auth();

  let user;
  try {
    if (args[0] === '--uid') {
      const uid = args[1];
      if (!uid) { console.error('Informe o UID após --uid'); process.exit(1); }
      user = await auth.getUser(uid);
    } else {
      user = await auth.getUserByEmail(args[0]);
    }
  } catch (e) {
    console.error('\nUsuário não encontrado:', e.message, '\n');
    process.exit(1);
  }

  const existingClaims = user.customClaims || {};

  if (!existingClaims.admin) {
    console.log('\nℹ️  Este usuário não possui permissão administrativa. Nenhuma alteração feita.\n');
    process.exit(0);
  }

  // Remove admin, preserva o restante
  const { admin: _removed, ...remainingClaims } = existingClaims;
  await auth.setCustomUserClaims(user.uid, Object.keys(remainingClaims).length ? remainingClaims : null);

  console.log('\n✅ Permissão administrativa removida!');
  console.log('   UID:               ', user.uid);
  console.log('   E-mail:            ', user.email);
  console.log('   Claims restantes:  ', JSON.stringify(remainingClaims));
  console.log('\nO usuário precisa renovar o token para que a remoção tenha efeito.\n');
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
