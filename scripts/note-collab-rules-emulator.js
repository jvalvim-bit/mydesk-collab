'use strict';

/* Teste local das regras de presença/delegação.
   Executar com:
   firebase emulators:exec --only database "node scripts/note-collab-rules-emulator.js"

   O Admin SDK apontado para o Emulator permite preparar o cenário sem criar
   contas nem tocar nos dados de produção. As instâncias com
   databaseAuthVariableOverride passam pelas regras como cada usuário. */
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');

const projectId = 'mydesk-ad0da';
const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
const users = {
  a: { uid: 'rules_uid_a', username: 'rules_user_a' },
  b: { uid: 'rules_uid_b', username: 'rules_user_b' },
  c: { uid: 'rules_uid_c', username: 'rules_user_c' },
};
const boardKey = [users.a.username, users.b.username].sort().join('__');
const pair = [users.a.uid, users.b.uid].sort();
const sharedBase = `noteCollaboration/shared/${pair[0]}/${pair[1]}/${boardKey}`;
const groupId = 'rules_group';
let scenarioCount = 0;

function appFor(name, auth) {
  const options = {
    projectId,
    databaseURL,
  };
  if (auth) options.databaseAuthVariableOverride = auth;
  return initializeApp(options, name);
}

async function allowed(label, operation) {
  try {
    await operation();
    scenarioCount++;
    console.log('OK permitido:', label);
  } catch (error) {
    throw new Error(`esperava permitir "${label}", mas recebeu ${error.code || error.message}`);
  }
}

async function denied(label, operation) {
  try {
    await operation();
    throw new Error(`esperava negar "${label}", mas a operação foi aceita`);
  } catch (error) {
    if (/esperava negar/.test(error.message)) throw error;
    scenarioCount++;
    console.log('OK negado:', label);
  }
}

(async () => {
  const apps = [];
  try {
    const adminApp = appFor('rules-admin', null);
    const appA = appFor('rules-a', { uid: users.a.uid });
    const appB = appFor('rules-b', { uid: users.b.uid });
    const appC = appFor('rules-c', { uid: users.c.uid });
    apps.push(adminApp, appA, appB, appC);
    const adminDb = getDatabase(adminApp);
    const dbA = getDatabase(appA);
    const dbB = getDatabase(appB);
    const dbC = getDatabase(appC);

    await adminDb.ref().set({
      uids: {
        [users.a.uid]: users.a.username,
        [users.b.uid]: users.b.username,
        [users.c.uid]: users.c.username,
      },
      shared_boards: {
        [boardKey]: {
          members: { [users.a.username]: true, [users.b.username]: true },
          notes: { n1: { id: 'n1', title: 'Nota 1' } },
          // Metadados de pasta: é o que a regra de delegatedFolders confere
          // para saber que a pasta existe.
          stacks: { stk_1: 'Pasta 1', stk_1_color: 'indigo' },
        },
      },
      groups: {
        [groupId]: {
          owner: users.b.username,
          members: { [users.a.username]: true, [users.b.username]: true },
        },
      },
      group_boards: {
        [groupId]: {
          notes: {
            n1: { id: 'n1', title: 'Nota 1' },
            n2: { id: 'n2', title: 'Nota 2' },
          },
          stacks: { stk_1: 'Pasta 1', stk_2: 'Pasta 2' },
        },
      },
    });

    const ownPresence = {
      username: users.a.username,
      state: 'editing',
      ts: ServerValue.TIMESTAMP,
    };
    const peerPresence = {
      username: users.b.username,
      state: 'editing',
      ts: ServerValue.TIMESTAMP,
    };
    /* assignedBy é obrigatório na regra: é ele que amarra a delegação a quem a
       fez. Sem este campo o banco recusa por validate ANTES de olhar permissão
       — e um cenário escrito assim testa a lista de campos, não a regra que diz
       quem pode delegar quem. Era o que acontecia aqui. */
    const aDelegaA = {
      username: users.a.username,
      assignedBy: users.a.username,
      ts: ServerValue.TIMESTAMP,
    };
    const aDelegaB = {
      username: users.b.username,
      assignedBy: users.a.username,
      ts: ServerValue.TIMESTAMP,
    };
    const bDelegaB = {
      username: users.b.username,
      assignedBy: users.b.username,
      ts: ServerValue.TIMESTAMP,
    };
    const bDelegaA = {
      username: users.a.username,
      assignedBy: users.b.username,
      ts: ServerValue.TIMESTAMP,
    };

    // ── Workspace 1:1 ────────────────────────────────────────────────
    await allowed('presença própria no 1:1', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/aba1`).set(ownPresence));
    await allowed('segunda aba do mesmo usuário', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/aba2`).set({
        ...ownPresence, state: 'moving',
      }));
    await allowed('terceira sessão do mesmo usuário', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/aba3`).set(ownPresence));
    await allowed('quarta sessão do mesmo usuário', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/aba4`).set(ownPresence));
    await allowed('quinta sessão do mesmo usuário', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/aba5`).set(ownPresence));
    await denied('presença em nota 1:1 inexistente', () =>
      dbA.ref(`${sharedBase}/presence/fantasma/${users.a.uid}/aba1`).set(ownPresence));
    await denied('delegação em nota 1:1 inexistente', () =>
      dbA.ref(`${sharedBase}/delegated/fantasma/${users.a.uid}`).set(aDelegaA));
    await allowed('outro participante lê o 1:1', () => dbB.ref(sharedBase).get());
    await denied('terceiro lê o 1:1', () => dbC.ref(sharedBase).get());
    await denied('usuário escreve sob UID alheio', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.b.uid}/forjada`).set({
        username: users.b.username, state: 'editing', ts: ServerValue.TIMESTAMP,
      }));
    await denied('usuário forja username', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/forjada`).set({
        username: users.b.username, state: 'editing', ts: ServerValue.TIMESTAMP,
      }));
    await allowed('autodelegação no 1:1', () =>
      dbA.ref(`${sharedBase}/delegated/n1/${users.a.uid}`).set(aDelegaA));
    /* Delegar o OUTRO participante é o recurso, não um furo: o menu "Delegar
       tarefa para" lista os dois lados do quadro. O que a regra impede é
       assinar a delegação com o @ de outra pessoa — a linha seguinte. */
    await allowed('delegar o outro participante no 1:1', () =>
      dbA.ref(`${sharedBase}/delegated/n1/${users.b.uid}`).set(aDelegaB));
    await denied('forjar o autor da delegação no 1:1', () =>
      dbA.ref(`${sharedBase}/delegated/n1/${users.b.uid}`).set(bDelegaB));
    await allowed('outro participante publica a própria presença', () =>
      dbB.ref(`${sharedBase}/presence/n1/${users.b.uid}/aba1`).set(peerPresence));
    await allowed('outro participante se autodelega', () =>
      dbB.ref(`${sharedBase}/delegated/n1/${users.b.uid}`).set(bDelegaB));

    // ── Delegação de pasta no 1:1 ────────────────────────────────────
    await allowed('delegar pasta existente no 1:1', () =>
      dbA.ref(`${sharedBase}/delegatedFolders/stk_1/${users.a.uid}`).set(aDelegaA));
    await allowed('delegar a pasta ao outro participante', () =>
      dbA.ref(`${sharedBase}/delegatedFolders/stk_1/${users.b.uid}`).set(aDelegaB));
    await denied('delegar pasta 1:1 inexistente', () =>
      dbA.ref(`${sharedBase}/delegatedFolders/stk_fantasma/${users.a.uid}`).set(aDelegaA));
    await denied('forjar o autor da delegação de pasta', () =>
      dbA.ref(`${sharedBase}/delegatedFolders/stk_1/${users.b.uid}`).set(bDelegaB));
    await denied('terceiro delega pasta do quadro alheio', () =>
      dbC.ref(`${sharedBase}/delegatedFolders/stk_1/${users.c.uid}`).set({
        username: users.c.username, assignedBy: users.c.username, ts: ServerValue.TIMESTAMP,
      }));
    await allowed('soltar a própria delegação de pasta', () =>
      dbB.ref(`${sharedBase}/delegatedFolders/stk_1/${users.b.uid}`).remove());

    // Depois que a nota fonte some, cada usuário ainda consegue apagar o próprio
    // estado e um participante atual consegue podar o subtree órfão inteiro.
    await adminDb.ref(`shared_boards/${boardKey}/notes/n1`).remove();
    await allowed('autolimpeza de uma sessão 1:1 após apagar a nota', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}/aba1`).remove());
    await allowed('autolimpeza das sessões restantes após apagar a nota', () =>
      dbA.ref(`${sharedBase}/presence/n1/${users.a.uid}`).remove());
    await allowed('autolimpeza da delegação 1:1 após apagar a nota', () =>
      dbA.ref(`${sharedBase}/delegated/n1/${users.a.uid}`).remove());
    await allowed('limpeza da delegação do outro após apagar a nota', () =>
      dbA.ref(`${sharedBase}/delegated/n1/${users.b.uid}`).remove());
    await allowed('remoção do subtree de presença órfão no 1:1', () =>
      dbA.ref(`${sharedBase}/presence/n1`).remove());
    await allowed('remoção do subtree de delegação órfão no 1:1', () =>
      dbA.ref(`${sharedBase}/delegated/n1`).remove());

    // Mesma poda para pasta: só depois que a pasta some de stacks/.
    await denied('podar delegação de pasta que ainda existe', () =>
      dbA.ref(`${sharedBase}/delegatedFolders/stk_1`).remove());
    await adminDb.ref(`shared_boards/${boardKey}/stacks/stk_1`).remove();
    await allowed('podar o subtree de delegação da pasta apagada', () =>
      dbA.ref(`${sharedBase}/delegatedFolders/stk_1`).remove());

    // ── Workspace de grupo ───────────────────────────────────────────
    const groupBase = `noteCollaboration/groups/${groupId}`;
    await allowed('presença própria no grupo', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/aba1`).set(ownPresence));
    await allowed('segunda sessão no grupo', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/aba2`).set(ownPresence));
    await allowed('terceira sessão no grupo', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/aba3`).set(ownPresence));
    await allowed('quarta sessão no grupo', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/aba4`).set(ownPresence));
    await allowed('quinta sessão no grupo', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/aba5`).set(ownPresence));
    await allowed('autodelegação no grupo', () =>
      dbA.ref(`${groupBase}/delegated/n1/${users.a.uid}`).set(aDelegaA));
    await denied('presença em nota de grupo inexistente', () =>
      dbA.ref(`${groupBase}/presence/fantasma/${users.a.uid}/aba1`).set(ownPresence));
    await denied('delegação em nota de grupo inexistente', () =>
      dbA.ref(`${groupBase}/delegated/fantasma/${users.a.uid}`).set(aDelegaA));
    await denied('não membro lê colaboração do grupo', () => dbC.ref(groupBase).get());
    await allowed('membro delega outro membro no grupo', () =>
      dbA.ref(`${groupBase}/delegated/n1/${users.b.uid}`).set(aDelegaB));
    await denied('membro forja o autor da delegação no grupo', () =>
      dbA.ref(`${groupBase}/delegated/n1/${users.b.uid}`).set(bDelegaB));

    // ── Delegação de pasta no grupo ──────────────────────────────────
    await allowed('delegar pasta existente no grupo', () =>
      dbA.ref(`${groupBase}/delegatedFolders/stk_1/${users.b.uid}`).set(aDelegaB));
    await denied('delegar pasta de grupo inexistente', () =>
      dbA.ref(`${groupBase}/delegatedFolders/stk_fantasma/${users.a.uid}`).set(aDelegaA));
    await denied('não membro delega pasta do grupo', () =>
      dbC.ref(`${groupBase}/delegatedFolders/stk_1/${users.c.uid}`).set({
        username: users.c.username, assignedBy: users.c.username, ts: ServerValue.TIMESTAMP,
      }));
    await denied('delegar pasta a quem não é do grupo', () =>
      dbA.ref(`${groupBase}/delegatedFolders/stk_1/${users.c.uid}`).set({
        username: users.c.username, assignedBy: users.a.username, ts: ServerValue.TIMESTAMP,
      }));
    await allowed('soltar a delegação de pasta que recebeu', () =>
      dbB.ref(`${groupBase}/delegatedFolders/stk_1/${users.b.uid}`).remove());

    // O owner pode limpar o estado de um membro sem ganhar permissão para
    // publicar presença em nome dele nem assinar delegação com o @ dele.
    await allowed('owner limpa todas as sessões de um membro', () =>
      dbB.ref(`${groupBase}/presence/n1/${users.a.uid}`).remove());
    await allowed('owner limpa a delegação de um membro', () =>
      dbB.ref(`${groupBase}/delegated/n1/${users.a.uid}`).remove());
    await denied('owner não cria presença em nome do membro', () =>
      dbB.ref(`${groupBase}/presence/n1/${users.a.uid}/forjada-owner`).set(ownPresence));
    await denied('owner não assina delegação com o @ do membro', () =>
      dbB.ref(`${groupBase}/delegated/n1/${users.a.uid}`).set(aDelegaA));
    await allowed('owner delega o membro assinando a própria delegação', () =>
      dbB.ref(`${groupBase}/delegated/n1/${users.a.uid}`).set(bDelegaA));
    await allowed('owner desfaz a delegação que fez', () =>
      dbB.ref(`${groupBase}/delegated/n1/${users.a.uid}`).remove());

    // Recria estado legítimo e então simula o kick. A pessoa expulsa perde
    // leitura/criação, mas ainda pode apagar somente os próprios resíduos.
    await allowed('membro recria a primeira sessão antes do kick', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/kick1`).set(ownPresence));
    await allowed('membro recria a segunda sessão antes do kick', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/kick2`).set(ownPresence));
    await allowed('membro recria a delegação antes do kick', () =>
      dbA.ref(`${groupBase}/delegated/n1/${users.a.uid}`).set(aDelegaA));
    await allowed('membro assume uma pasta antes do kick', () =>
      dbA.ref(`${groupBase}/delegatedFolders/stk_1/${users.a.uid}`).set(aDelegaA));
    await adminDb.ref(`groups/${groupId}/members/${users.a.username}`).remove();
    await denied('ex-membro lê colaboração do grupo', () => dbA.ref(groupBase).get());
    await denied('ex-membro volta a publicar presença', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/depois`).set(ownPresence));
    await allowed('ex-membro remove uma sessão própria após o kick', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}/kick1`).remove());
    await allowed('ex-membro remove as sessões próprias restantes', () =>
      dbA.ref(`${groupBase}/presence/n1/${users.a.uid}`).remove());
    await allowed('ex-membro remove a própria delegação após o kick', () =>
      dbA.ref(`${groupBase}/delegated/n1/${users.a.uid}`).remove());
    await denied('ex-membro volta a assumir a pasta', () =>
      dbA.ref(`${groupBase}/delegatedFolders/stk_2/${users.a.uid}`).set(aDelegaA));
    await allowed('ex-membro solta a pasta que tinha assumido', () =>
      dbA.ref(`${groupBase}/delegatedFolders/stk_1/${users.a.uid}`).remove());

    // Um cliente pode cair antes de autolimpar. O owner continua autorizado a
    // remover apenas esses resíduos, inclusive depois do kick.
    await adminDb.ref(`${groupBase}/presence/n1/${users.a.uid}/orfao`).set({
      username: users.a.username, state: 'editing', ts: Date.now(),
    });
    await adminDb.ref(`${groupBase}/delegated/n1/${users.a.uid}`).set({
      username: users.a.username, assignedBy: users.a.username, ts: Date.now(),
    });
    await allowed('owner limpa sessões órfãs depois do kick', () =>
      dbB.ref(`${groupBase}/presence/n1/${users.a.uid}`).remove());
    await allowed('owner limpa delegação órfã depois do kick', () =>
      dbB.ref(`${groupBase}/delegated/n1/${users.a.uid}`).remove());

    // Exclusão da nota n2 libera a poda atômica dos subtrees de todos os UIDs.
    await allowed('owner publica a própria presença na nota n2', () =>
      dbB.ref(`${groupBase}/presence/n2/${users.b.uid}/aba1`).set(peerPresence));
    await allowed('owner se autodelega à nota n2', () =>
      dbB.ref(`${groupBase}/delegated/n2/${users.b.uid}`).set(bDelegaB));
    await adminDb.ref(`${groupBase}/presence/n2/${users.a.uid}/orfao`).set({
      username: users.a.username, state: 'editing', ts: Date.now(),
    });
    await adminDb.ref(`${groupBase}/delegated/n2/${users.a.uid}`).set({
      username: users.a.username, assignedBy: users.a.username, ts: Date.now(),
    });
    await adminDb.ref(`group_boards/${groupId}/notes/n2`).remove();
    await allowed('owner remove subtree de presença depois de apagar a nota', () =>
      dbB.ref(`${groupBase}/presence/n2`).remove());
    await allowed('owner remove subtree de delegação depois de apagar a nota', () =>
      dbB.ref(`${groupBase}/delegated/n2`).remove());

    console.log(`Regras de colaboração: ${scenarioCount} cenários aprovados.`);
  } finally {
    await Promise.all(apps.map(app => deleteApp(app).catch(() => {})));
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
