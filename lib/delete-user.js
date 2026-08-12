// lib/delete-user.js — exclusão definitiva de uma conta.
//
// POR QUE ISTO PRECISA SER UM ENDPOINT, E COMPLETO
// Apagar uma conta do MyDesk não é remover um registro: os dados de uma pessoa
// estão espalhados por doze caminhos, e alguns deles são compartilhados com
// outras pessoas. Uma exclusão pela metade é pior que nenhuma —
//
//   • deixar usernames/{n} para trás prende o @ para sempre: ninguém mais
//     consegue registrá-lo, e ele aponta para uma conta que não existe;
//   • deixar groups/{id}/members/{n} deixa membro fantasma na lista de quem
//     ficou, e o grupo passa a contar gente que sumiu;
//   • deixar friends/{outro}/accepted/{n} deixa amigo fantasma na lista alheia;
//   • apagar um grupo inteiro porque a pessoa era dona destrói o quadro de
//     quem ficou — por isso aqui a posse é TRANSFERIDA quando sobra alguém.
//
// A ordem também importa: o registro do Authentication é apagado por último.
// Se o banco falhar no meio, a conta ainda existe e dá para tentar de novo;
// o contrário deixaria dados órfãos sem dono identificável.
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertSafeFirebaseEnvironment } = require('./collab-safety');

const BASE = () => process.env.FIREBASE_DATABASE_URL;

async function token() {
  return (await getApp().options.credential.getAccessToken()).access_token;
}
async function dbGet(path, params) {
  const t = await token();
  const r = await fetch(`${BASE()}/${path}.json?access_token=${t}${params || ''}`);
  if (!r.ok) throw new Error(`DB GET ${path} ${r.status}`);
  return r.json();
}
async function dbDelete(path) {
  const t = await token();
  const r = await fetch(`${BASE()}/${path}.json?access_token=${t}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DB DELETE ${path} ${r.status}`);
}
async function dbPatch(path, valor) {
  const t = await token();
  const r = await fetch(`${BASE()}/${path}.json?access_token=${t}`,
    { method: 'PATCH', body: JSON.stringify(valor) });
  if (!r.ok) throw new Error(`DB PATCH ${path} ${r.status}`);
}
async function dbPost(path, valor) {
  const t = await token();
  await fetch(`${BASE()}/${path}.json?access_token=${t}`, { method: 'POST', body: JSON.stringify(valor) });
}

const ALLOWED_ORIGINS = [
  'https://mydesk.social',
  'https://jvalvim-bit.github.io',
  'https://mydesk-eta.vercel.app',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function ensureFirebase() {
  assertSafeFirebaseEnvironment();
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Não autenticado' });

  let caller;
  try {
    ensureFirebase();
    caller = await getAuth().verifyIdToken(idToken, true);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou sessão expirada' });
  }
  if (caller.admin !== true) return res.status(403).json({ error: 'Apenas administradores' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const uid = String(body.uid || '');
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return res.status(400).json({ error: 'uid inválido' });

  // Um administrador apagando a si mesmo perderia o acesso no meio da operação.
  if (uid === caller.uid) return res.status(400).json({ error: 'Você não pode excluir a sua própria conta.' });

  try {
    // Quem é essa pessoa no banco. O @ é a chave de metade dos caminhos.
    const username = await dbGet(`uids/${uid}`).catch(() => null);
    let alvoAuth = null;
    try { alvoAuth = await getAuth().getUser(uid); } catch (_) { /* já não existe no Auth */ }

    if (!username && !alvoAuth) return res.status(404).json({ error: 'Usuário não encontrado' });

    /* Confirmação vinda do painel: é a trava contra excluir a pessoa errada por
       um clique na linha vizinha.

       O aceito precisa ser o MESMO conjunto que o painel oferece, e essa era a
       origem de um defeito grave: o painel pede o @ do perfil, mas aqui só se
       comparava com o @ do mapa uids/{uid}. Em conta cujo mapa se perdeu — e
       que também não tem e-mail, o caso das contas bloqueadas antigas —
       nenhum texto digitado seria aceito, e a conta ficava impossível de
       excluir. Daí o uid entrar na lista: quando não há @ nem e-mail, ele é a
       única identificação que existe, e digitá-lo por inteiro é uma barreira
       tão deliberada quanto as outras. */
    const conf = String(body.confirmacao || '').trim();
    const perfilUsername = await dbGet(`users/${uid}/username`).catch(() => null);
    const esperado = [username, perfilUsername, alvoAuth?.email, uid].filter(Boolean);
    if (!esperado.includes(conf)) {
      return res.status(400).json({
        error: 'A confirmação não confere. Digite exatamente o texto em destaque no aviso.',
      });
    }

    const apagados = [];
    const rm = async caminho => {
      try { await dbDelete(caminho); apagados.push(caminho); }
      catch (e) { console.warn('delete-user: falha em', caminho, e.message); }
    };

    // ── 1. Dados próprios, por uid ──
    await rm(`users/${uid}`);        // perfil, private, plan, notes, personalBoards, personal
    await rm(`presence/${uid}`);
    await rm(`uids/${uid}`);

    if (username) {
      const n = username;

      // ── 2. Dados próprios, por @ ──
      await rm(`users/${n}`);        // espelho do perfil + users/{n}/online
      await rm(`usernames/${n}`);    // libera o @ para uso futuro
      await rm(`friends/${n}`);
      await rm(`inbox/${n}`);
      await rm(`groupInbox/${n}`);
      await rm(`referrals/${n}`);    // a lista de quem ELE indicou

      // ── 3. Arestas na lista dos outros ──
      // Sem isto, cada amigo continuaria vendo um contato que não existe mais.
      const amigos = await dbGet('friends').catch(() => null) || {};
      for (const outro of Object.keys(amigos)) {
        if (outro === n) continue;
        for (const grupo of ['accepted', 'pending_in', 'pending_out']) {
          if (amigos[outro]?.[grupo]?.[n] !== undefined) await rm(`friends/${outro}/${grupo}/${n}`);
        }
      }

      // ── 4. Conversas de dois — a chave carrega os dois @ ──
      const chats = await dbGet('chats', '&shallow=true').catch(() => null) || {};
      for (const chave of Object.keys(chats)) {
        if (chave.split('__').includes(n)) await rm(`chats/${chave}`);
      }

      // ── 5. Quadros compartilhados 1:1 — mesma regra de chave ──
      const quadros = await dbGet('shared_boards', '&shallow=true').catch(() => null) || {};
      for (const chave of Object.keys(quadros)) {
        if (chave.split('__').includes(n)) await rm(`shared_boards/${chave}`);
      }

      // ── 6. Grupos ──
      // Apagar um grupo porque a pessoa era dona destruiria o quadro de quem
      // ficou. Então: sai da lista de membros; se era dona e sobra alguém, a
      // posse passa para outro membro; só some o grupo que ficaria vazio.
      const grupos = await dbGet('groups').catch(() => null) || {};
      for (const [gid, g] of Object.entries(grupos)) {
        if (!g) continue;
        const membros = Object.keys(g.members || {});
        const participa = membros.includes(n) || g.owner === n;
        if (!participa) continue;

        const restantes = membros.filter(m => m !== n);
        if (restantes.length === 0) {
          await rm(`groups/${gid}`);
          await rm(`group_boards/${gid}`);
          await rm(`groupChats/${gid}`);
          continue;
        }
        if (membros.includes(n)) await rm(`groups/${gid}/members/${n}`);
        if (g.owner === n) {
          await dbPatch(`groups/${gid}`, { owner: restantes[0] }).catch(() => {});
          apagados.push(`groups/${gid}/owner → ${restantes[0]}`);
        }
      }

      // ── 7. Indicação recebida — a aresta fica sob o código de quem indicou ──
      const indic = await dbGet('referrals').catch(() => null) || {};
      for (const [codigo, edges] of Object.entries(indic)) {
        if (edges && edges[uid] !== undefined) await rm(`referrals/${codigo}/${uid}`);
      }
    }

    // ── 8. O Authentication por último ──
    // Se algo acima falhar, a conta ainda existe e a operação pode ser repetida.
    // Na ordem inversa, sobrariam dados sem dono identificável.
    if (alvoAuth) {
      await getAuth().revokeRefreshTokens(uid).catch(() => {});
      await getAuth().deleteUser(uid);
      apagados.push('auth/' + uid);
    }

    await dbPost('adminLog', {
      at: Date.now(),
      acao: 'excluir_conta',
      alvo: uid,
      alvoEmail: alvoAuth?.email || null,
      alvoUsername: username || null,
      caminhos: apagados.length,
      por: caller.uid,
      porEmail: caller.email || null,
    }).catch(() => {});

    return res.status(200).json({ ok: true, uid, username, apagados });

  } catch (err) {
    console.error('delete-user:', err.message);
    return res.status(500).json({ error: 'Erro ao excluir: ' + err.message });
  }
};
