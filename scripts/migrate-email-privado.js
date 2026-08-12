/* Move o e-mail de users/{uid}/profile e users/{@}/profile para
   users/{uid}/private/email.
   O perfil é legível por qualquer usuário logado (é o que faz a busca por @
   funcionar) e regra de leitura no Firebase cascateia — não dá para esconder
   só um campo. Então o e-mail muda de lugar.

   Uso:
     node scripts/migrate-email-privado.js           → simulação (não grava nada)
     node scripts/migrate-email-privado.js --apply   → grava de verdade

   Precisa do serviceAccountKey.json na raiz do repositório. */
const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');

const APLICAR = process.argv.includes('--apply');

admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: 'https://mydesk-ad0da-default-rtdb.firebaseio.com',
});

const db = admin.database();

(async () => {
  const uids = (await db.ref('uids').once('value')).val() || {};
  const total = Object.keys(uids).length;
  console.log(`${APLICAR ? 'MIGRANDO' : 'SIMULANDO'} — ${total} usuário(s) em uids/\n`);

  let movidos = 0, jaOk = 0, semEmail = 0, erros = 0;

  for (const [uid, username] of Object.entries(uids)) {
    try {
      const [perfilUid, perfilUser, privado] = await Promise.all([
        db.ref(`users/${uid}/profile`).once('value').then(s => s.val()),
        db.ref(`users/${username}/profile`).once('value').then(s => s.val()),
        db.ref(`users/${uid}/private/email`).once('value').then(s => s.val()),
      ]);

      const email = perfilUid?.email || perfilUser?.email || null;

      if (!email && !privado) { semEmail++; console.log(`  –  @${username}: sem e-mail em lugar nenhum`); continue; }
      if (!email && privado)  { jaOk++;     console.log(`  ✓  @${username}: já migrado`); continue; }

      const destino = privado || email;
      console.log(`  →  @${username}: ${email}  →  users/${uid}/private/email` +
                  (privado && privado !== email ? `  (já havia "${privado}", mantido)` : ''));

      if (APLICAR) {
        const patch = {};
        if (!privado) patch[`users/${uid}/private/email`] = destino;
        if (perfilUid?.email)  patch[`users/${uid}/profile/email`] = null;
        if (perfilUser?.email) patch[`users/${username}/profile/email`] = null;
        await db.ref().update(patch);
      }
      movidos++;
    } catch (e) {
      erros++;
      console.log(`  !  @${username}: ${e.message}`);
    }
  }

  console.log(`\n${movidos} a migrar · ${jaOk} já ok · ${semEmail} sem e-mail · ${erros} erro(s)`);
  if (!APLICAR && movidos) console.log('\nNada foi gravado. Rode de novo com --apply para valer.');
  process.exit(0);
})();
