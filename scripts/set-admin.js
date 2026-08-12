#!/usr/bin/env node
/**
 * Concede permissão administrativa (Custom Claim admin:true) a um usuário.
 *
 * Uso:
 *   node scripts/set-admin.js usuario@email.com
 *   node scripts/set-admin.js --uid UID_DO_USUARIO
 *
 * Requer variável de ambiente com credenciais do Firebase Admin SDK.
 * Veja scripts/.env.example para detalhes.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const admin = require('firebase-admin');

// ── Inicialização do Firebase Admin ──────────────────────────────────────────
function initAdmin() {
  if (admin.apps.length) return;

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    // Modo 1: arquivo de service account via GOOGLE_APPLICATION_CREDENTIALS
    const serviceAccount = require(require('path').resolve(keyPath));
    admin.initializeApp({
      credential:  admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL ||
                   `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
    });
    return;
  }

  // Modo 2: variáveis individuais (mesmo padrão do api/webhook.js)
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const dbURL       = process.env.FIREBASE_DATABASE_URL;

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      '\nErro: credenciais não encontradas.\n' +
      'Configure GOOGLE_APPLICATION_CREDENTIALS ou as variáveis\n' +
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL.\n' +
      'Veja scripts/.env.example para exemplos.\n'
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential:  admin.credential.cert({ projectId, clientEmail, privateKey }),
    databaseURL: dbURL,
  });
}

// ── Lógica principal ──────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Uso: node scripts/set-admin.js email@exemplo.com');
    console.error('      node scripts/set-admin.js --uid UID_DO_USUARIO');
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

  // Preserva claims existentes e adiciona admin:true
  const existingClaims = user.customClaims || {};
  const newClaims      = { ...existingClaims, admin: true };

  await auth.setCustomUserClaims(user.uid, newClaims);

  console.log('\n✅ Administrador concedido com sucesso!');
  console.log('   UID:      ', user.uid);
  console.log('   E-mail:   ', user.email);
  console.log('   Claims:   ', JSON.stringify(newClaims));
  console.log('\nO usuário precisa renovar o token para que a claim tenha efeito.');
  console.log('Instrua-o a fazer logout/login, ou force via refreshAdminClaim() no frontend.\n');
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
