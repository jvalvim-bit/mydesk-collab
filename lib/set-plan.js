// lib/set-plan.js — concede ou remove Premium pelo painel administrativo.
//
// Por que isto não é feito direto do navegador, como quase tudo no app:
// as regras do Realtime Database tratam o plano como dinheiro. A regra de
// users/{uid}/plan/plan só aceita 'premium' quando o valor JÁ era 'premium' —
// ou seja, ninguém promove ninguém pelo cliente, nem um admin. E .validate,
// diferente de .write, não é dispensado por permissão herdada da raiz: vale
// para todo mundo. Quem escapa das regras é só a service account, que vive
// aqui. Sem este endpoint, o botão do painel bateria de frente com a regra
// que impediu, no teste de invasão, qualquer conta virar premium sozinha.
//
// O caminho normal de virar Premium é o webhook assinado da Stripe.
// Este é o caminho manual: cortesia, suporte, resgate de indicação (que hoje
// chega por e-mail) e correção de pagamento que não caiu.
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertSafeFirebaseEnvironment } = require('./collab-safety');
const {
  addObjectToMultipath,
  isActivePremium,
  premiumNotification,
  safeFirebaseKey,
} = require('../lib/admin-notifications');

async function dbRest(method, path, value) {
  const token = (await getApp().options.credential.getAccessToken()).access_token;
  const baseUrl = String(process.env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
  const url = `${baseUrl}/${path}.json?access_token=${encodeURIComponent(token)}`;
  const opts = { method, headers: {} };
  if (value !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(value);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(`DB ${method} ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const ALLOWED_ORIGINS = [
  'https://mydesk.social',            // domínio oficial do site
  'https://jvalvim-bit.github.io',    // publicação antiga do Pages, ainda em links soltos
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

const DIA = 24 * 60 * 60 * 1000;

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
    caller = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // A claim vem do token verificado aqui pelo servidor. Nada nesta rota confia
  // em nada que o navegador tenha mandado sobre quem ele é.
  if (caller.admin !== true) return res.status(403).json({ error: 'Apenas administradores' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const uid  = String(body.uid || '');
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return res.status(400).json({ error: 'uid inválido' });

  const premium = body.plan === 'premium';

  // dias ausente/0 = cortesia sem prazo. O teto de 3650 evita que um dedo
  // escorregado no prompt grave um vencimento no ano 3000.
  const dias = Math.min(3650, Math.max(0, Math.floor(Number(body.dias) || 0)));

  // Vencimento por data absoluta — o painel precisa poder corrigir uma data,
  // não só somar dias a partir de hoje. Quando vem, tem prioridade sobre dias.
  // O teto é o mesmo (10 anos), pela mesma razão.
  const expiraEm = Number(body.expiraEm) > 0
    ? Math.min(Date.now() + 3650 * DIA, Math.floor(Number(body.expiraEm)))
    : null;

  try {
    let target;
    try {
      target = await getAuth().getUser(uid);
    } catch (e) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const now = Date.now();
    const [currentPlan, username] = await Promise.all([
      // Ausência já volta como 200/null. Erro de leitura precisa abortar a
      // concessão: tratá-lo como plano inexistente poderia cortar validade
      // ainda paga e também produzir um alerta Premium duplicado.
      dbRest('GET', `users/${uid}/plan`),
      dbRest('GET', `uids/${uid}`).catch(() => null),
    ]);
    const wasPremium = isActivePremium(currentPlan, now);
    let planExpiresAt = null;
    let notificationId = null;

    if (premium) {
      if (expiraEm) {
        // Data escolhida à mão: vale como está, sem somar nada.
        planExpiresAt = expiraEm;
      } else if (dias > 0) {
        // Mesma regra do webhook: prazo novo parte do vencimento atual quando
        // ele ainda está no futuro, para não queimar dias já pagos.
        const atual = Number(currentPlan?.planExpiresAt) || 0;
        planExpiresAt = (atual > now ? atual : now) + dias * DIA;
      }
      const planPatch = {
        plan: 'premium',
        planExpiresAt,                       // null = sem prazo
        planActivatedAt: wasPremium
          ? Number(currentPlan?.planActivatedAt) || now
          : now,
        planTipo: 'cortesia',
        // Zera o contador do mês: quem sai do grátis não deve carregar um
        // limite já gasto se um dia voltar para o plano gratuito.
        notesCreatedThisMonth: 0,
        lastReset: new Date().toISOString().slice(0, 7),
      };
      const multipath = {};
      addObjectToMultipath(multipath, `users/${uid}/plan`, planPatch);

      if (!wasPremium) {
        notificationId = safeFirebaseKey('courtesy', uid, now);
        multipath[`adminNotifications/${notificationId}`] = premiumNotification({
          uid,
          username,
          source: 'courtesy',
          planExpiresAt,
          createdAt: now,
          grantedBy: caller.uid,
        });
      }

      // Plano e ledger entram juntos: ou ambos existem, ou nenhum existe.
      await dbRest('PATCH', '', multipath);
    } else {
      // Rebaixar apaga o vencimento e o tipo — deixar 'planTipo' para trás faria
      // a conta parecer premium expirado em vez de gratuita.
      await dbRest('PATCH', `users/${uid}/plan`, {
        plan: 'free',
        planExpiresAt: null,
        planTipo: null,
      });
    }

    // Plano é dinheiro: toda mudança manual fica registrada com quem fez.
    await dbRest('POST', 'adminLog', {
      at: now,
      acao: premium ? (expiraEm ? 'alterar_vencimento' : 'conceder_premium') : 'remover_premium',
      alvo: uid,
      alvoEmail: target.email || null,
      dias: premium && !expiraEm ? (dias || null) : null,
      expiraEm: planExpiresAt || null,
      obs: typeof body.obs === 'string' ? body.obs.slice(0, 200) : null,
      por: caller.uid,
      porEmail: caller.email || null,
    }).catch(() => {});

    return res.status(200).json({
      ok: true,
      uid,
      plan: premium ? 'premium' : 'free',
      planExpiresAt,
      notificationId,
    });

  } catch (err) {
    console.error('set-plan:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
