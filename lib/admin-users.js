// lib/admin-users.js — diretório de contas do Firebase Authentication, para o painel.
//
// POR QUE ESTE ENDPOINT EXISTE
// O Realtime Database do MyDesk guarda perfil, plano e presença, mas NÃO guarda
// três coisas que um painel administrativo precisa:
//
//   • data de cadastro   — nada no perfil registra quando a conta nasceu
//   • último acesso      — presence/{uid} some no onDisconnect, então só diz
//                          "está online agora", nunca "esteve online quando"
//   • conta bloqueada    — o app não tem esse conceito no banco
//
// As três existem no Firebase Authentication (creationTime, lastSignInTime,
// disabled) e só o Admin SDK as lê. A alternativa seria criar campos novos no
// banco e migrar os usuários existentes — que ficariam sem histórico de
// qualquer forma, porque o dado do passado não pode ser inventado. Ler da
// fonte que já tem o dado é mais honesto e não mexe no schema.
//
// O bloqueio (disabled) também é aplicado aqui, e é de verdade: uma conta
// desativada no Auth não consegue mais obter token, então perde acesso ao app
// E ao banco na mesma hora. Marcar uma flag no banco seria decorativo.
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertSafeFirebaseEnvironment } = require('./collab-safety');

async function dbRest(method, path, value) {
  const token = (await getApp().options.credential.getAccessToken()).access_token;
  const url = `${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${token}`;
  const opts = { method };
  if (value !== undefined) opts.body = JSON.stringify(value);
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
    // checkRevoked: uma conta recém-bloqueada por este mesmo painel não deve
    // conseguir continuar operando com o token que já tinha em mãos.
    caller = await getAuth().verifyIdToken(idToken, true);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou sessão expirada' });
  }

  if (caller.admin !== true) return res.status(403).json({ error: 'Apenas administradores' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = body.action || 'list';

  try {
    // ── Diretório completo de contas ──
    if (action === 'list') {
      const contas = [];
      let pageToken;
      do {
        const page = await getAuth().listUsers(1000, pageToken);
        page.users.forEach(u => contas.push({
          uid:           u.uid,
          email:         u.email || null,
          emailVerified: !!u.emailVerified,
          disabled:      !!u.disabled,
          admin:         u.customClaims?.admin === true,
          criadoEm:      u.metadata?.creationTime  ? Date.parse(u.metadata.creationTime)  : null,
          ultimoAcesso:  u.metadata?.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : null,
          provedores:    (u.providerData || []).map(p => p.providerId),
        }));
        pageToken = page.pageToken;
      } while (pageToken);
      return res.status(200).json({ ok: true, contas });
    }

    /* ── Receita, direto da Stripe ──
       POR QUE AQUI, e não numa função nova: o plano Hobby da Vercel permite 12
       Functions e o projeto já tem 12. Uma 13ª quebraria o deploy inteiro por
       causa de um painel — então esta ação mora junto das outras de admin.

       Os números saem da Stripe a cada chamada, sem cache no banco: assinatura
       cancelada, cartão recusado e upgrade acontecem lá, e um espelho no
       Firebase envelheceria em silêncio. É uma tela de conferência, aberta
       algumas vezes por dia — não vale trocar exatidão por velocidade. */
    if (action === 'revenue') {
      let stripe;
      try {
        stripe = require('../lib/stripe-billing').getStripe();
      } catch (e) {
        return res.status(503).json({ error: 'Stripe não configurada nesta implantação.' });
      }

      const meses = v => Math.round(Number(v) || 0);
      const resumo = {
        ativos: 0, cancelando: 0, inadimplentes: 0, testando: 0,
        mrrCentavos: 0, fundadores: 0, padrao: 0,
        proximos30Centavos: 0, emAbertoCentavos: 0, emAbertoQtd: 0,
        // Vira true quando o teto de paginação é atingido: melhor dizer que o
        // número está incompleto do que apresentá-lo como total.
        parcial: false,
        porPreco: {},
      };

      const agora = Math.floor(Date.now() / 1000);
      const em30dias = agora + 30 * 86400;

      // Uma assinatura anual não é "12x mais receita neste mês": para o MRR
      // fazer sentido ao lado da mensal, o valor anual entra dividido por 12.
      const paraMensal = (centavos, intervalo, contagem) => {
        const n = Math.max(1, Number(contagem) || 1);
        if (intervalo === 'year')  return centavos / (12 * n);
        if (intervalo === 'week')  return (centavos * 52) / (12 * n);
        if (intervalo === 'day')   return (centavos * 365) / (12 * n);
        return centavos / n;   // month
      };

      /* for await pagina a Stripe INTEIRA. Sem teto, a função estourava o tempo
         da Vercel e a conexão caía antes de qualquer resposta — no painel isso
         chega como "Failed to fetch", sem status e sem motivo, que foi
         exatamente o que a consulta de receita passou a mostrar. O teto abaixo
         garante resposta; quando ele é atingido, o resumo sai marcado como
         parcial em vez de mentir um número completo. */
      const TETO_ASSINATURAS = 2000;
      const TETO_FATURAS = 1000;
      let lidasAssinaturas = 0;

      for await (const sub of stripe.subscriptions.list({
        status: 'all', limit: 100, expand: ['data.items.data.price'],
      })) {
        if (++lidasAssinaturas > TETO_ASSINATURAS) { resumo.parcial = true; break; }
        const st = sub.status;
        if (st === 'canceled' || st === 'incomplete_expired') continue;
        if (st === 'trialing') resumo.testando++;
        if (st === 'past_due' || st === 'unpaid') resumo.inadimplentes++;
        const vivo = st === 'active' || st === 'trialing' || st === 'past_due';
        if (!vivo) continue;
        resumo.ativos++;
        if (sub.cancel_at_period_end) resumo.cancelando++;

        (sub.items?.data || []).forEach(item => {
          const preco = item.price || {};
          const valor = (Number(preco.unit_amount) || 0) * (Number(item.quantity) || 1);
          const rec = preco.recurring || {};
          resumo.mrrCentavos += paraMensal(valor, rec.interval, rec.interval_count);

          const rotulo = (preco.nickname || preco.id || 'sem preço') +
                         ' · ' + (rec.interval === 'year' ? 'anual' : 'mensal');
          resumo.porPreco[rotulo] = resumo.porPreco[rotulo] || { assinantes: 0, centavos: 0 };
          resumo.porPreco[rotulo].assinantes++;
          resumo.porPreco[rotulo].centavos += valor;

          /* Fundador é quem paga menos que o preço de tabela de hoje — não há
             etiqueta na Stripe dizendo isso, e comparar pelo valor é o único
             critério que sobrevive à criação de novos Price IDs. */
          const mensalizado = paraMensal(valor, rec.interval, rec.interval_count);
          if (mensalizado < 1500) resumo.fundadores++; else resumo.padrao++;
        });

        // Renovação prevista para os próximos 30 dias: é o "quanto espero
        // gerar" que a operação realmente usa.
        const fim = Number(sub.current_period_end) || 0;
        if (fim > agora && fim <= em30dias) {
          (sub.items?.data || []).forEach(item => {
            resumo.proximos30Centavos +=
              (Number(item.price?.unit_amount) || 0) * (Number(item.quantity) || 1);
          });
        }
      }

      // Boletos e faturas emitidos e ainda não pagos.
      try {
        let lidasFaturas = 0;
        for await (const inv of stripe.invoices.list({ status: 'open', limit: 100 })) {
          if (++lidasFaturas > TETO_FATURAS) { resumo.parcial = true; break; }
          resumo.emAbertoQtd++;
          resumo.emAbertoCentavos += Number(inv.amount_due) || 0;
        }
      } catch (_) { /* sem permissão de leitura de faturas: segue sem esse dado */ }

      resumo.mrrCentavos = meses(resumo.mrrCentavos);
      resumo.arrCentavos = meses(resumo.mrrCentavos * 12);
      resumo.porAssinanteCentavos = resumo.ativos
        ? meses(resumo.mrrCentavos / resumo.ativos) : 0;
      resumo.atualizadoEm = Date.now();
      return res.status(200).json({ ok: true, receita: resumo });
    }

    // ── Bloquear / desbloquear ──
    if (action === 'setDisabled') {
      const uid = String(body.uid || '');
      if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return res.status(400).json({ error: 'uid inválido' });
      const bloquear = body.disabled === true;

      // Um admin trancando a si mesmo para fora não teria como se destrancar.
      if (uid === caller.uid && bloquear) {
        return res.status(400).json({ error: 'Você não pode bloquear a sua própria conta.' });
      }

      let alvo;
      try { alvo = await getAuth().getUser(uid); }
      catch (e) { return res.status(404).json({ error: 'Usuário não encontrado' }); }

      await getAuth().updateUser(uid, { disabled: bloquear });
      // Sem revogar, quem já estava logado seguiria usando o token de até 1h.
      if (bloquear) await getAuth().revokeRefreshTokens(uid).catch(() => {});

      await dbRest('POST', 'adminLog', {
        at: Date.now(),
        acao: bloquear ? 'bloquear_conta' : 'reativar_conta',
        alvo: uid,
        alvoEmail: alvo.email || null,
        por: caller.uid,
        porEmail: caller.email || null,
      }).catch(() => {});

      return res.status(200).json({ ok: true, uid, disabled: bloquear });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });

  } catch (err) {
    console.error('admin-users:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
