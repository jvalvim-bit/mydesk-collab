const Stripe = require('stripe');
const { assertBillingEnabled, assertSafeAppUrl } = require('./collab-safety');

const STRIPE_API_VERSION = '2026-06-24.dahlia';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
// Uma assinatura cancelada continua dando acesso até o current_period_end do
// item. No cancelamento ao fim do período esse instante já será "agora"; no
// cancelamento antecipado, preserva o que a pessoa já pagou.
const PAID_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'canceled']);

/* ═══════════════════════════════════════════════════════════════════════
   PREÇOS: O NOVO E O DE QUEM JÁ ASSINAVA
   ═══════════════════════════════════════════════════════════════════════
   O preço subiu de R$ 10 para R$ 19,90 no mensal e de R$ 100 para R$ 199 no
   anual. Quem já assinava fica no preço antigo enquanto a assinatura seguir
   ativa — é o Plano Fundador.

   Isso não é gentileza opcional: a Stripe cobra pelo Price ID gravado na
   assinatura, então quem já assinou CONTINUA pagando o valor antigo sozinho,
   sem nada do nosso lado. O que este código precisa garantir é o contrário —
   não empurrar essa gente para o preço novo e reconhecer, ao ler a assinatura,
   em qual dos dois ela está.

   `novo` é o que vai para checkout de agora em diante. `fundador` só existe
   para RECONHECER assinatura antiga; nunca é oferecido a ninguém.

   A compatibilidade importa mais que a novidade: enquanto STRIPE_PRICE_*_NEW
   não estiver configurada na Vercel, o checkout continua usando a variável
   antiga e o preço de hoje. Nada quebra no intervalo entre publicar este
   código e criar os preços na Stripe.
   ═══════════════════════════════════════════════════════════════════════ */
const PLAN_CATALOG = Object.freeze({
  mensal: Object.freeze({
    currency: 'brl',
    interval: 'month',
    // 1999, não 1990: o preço criado na Stripe é R$ 19,99. Mesmo motivo do
    // anual — preço lá é imutável, e o código valida o centavo exato.
    novo:     Object.freeze({ env: 'STRIPE_PRICE_MONTHLY_NEW',     amount: 1999 }),
    fundador: Object.freeze({ env: 'STRIPE_PRICE_MONTHLY_FOUNDER', amount: 1000 }),
    legado:   Object.freeze({ env: 'STRIPE_PRICE_MONTHLY',         amount: 1000 }),
  }),
  anual: Object.freeze({
    currency: 'brl',
    interval: 'year',
    // 19999 e não 19900: o preço criado na Stripe é R$ 199,99, e preço lá é
    // imutável — alinhar o código ao que existe custa uma linha; criar outro
    // preço deixaria dois anuais novos convivendo, e um deles errado.
    novo:     Object.freeze({ env: 'STRIPE_PRICE_ANNUAL_NEW',     amount: 19999 }),
    fundador: Object.freeze({ env: 'STRIPE_PRICE_ANNUAL_FOUNDER', amount: 10000 }),
    legado:   Object.freeze({ env: 'STRIPE_PRICE_ANNUAL',         amount: 10000 }),
  }),
});

const RE_PRICE = /^price_[A-Za-z0-9]+$/;

/* Qual preço vender agora: a variável _NEW, se existir; senão a de sempre.

   A variável de sempre NÃO tem valor fixo esperado, e isso vem de um erro que
   custou caro: presumi que ela continuaria apontando para o preço antigo, mas o
   caminho natural de quem reajusta é repontar a variável que já existe para o
   preço novo. Com valor fixo, o código recusava o preço legítimo e derrubava a
   venda inteira.

   A proteção continua existindo, só que declarada como conjunto: o preço
   precisa bater com UM dos valores que o produto pratica. Um Price ID trocado
   por engano — de outro produto, de outra moeda, de valor arbitrário — segue
   sendo recusado; o que passa a ser aceito é o reajuste feito no lugar óbvio. */
function faixaDeVenda(definition) {
  const novo = process.env[definition.novo.env];
  if (RE_PRICE.test(novo || '')) {
    return { tier: 'standard', priceId: novo, amounts: [definition.novo.amount] };
  }
  const legado = process.env[definition.legado.env];
  if (RE_PRICE.test(legado || '')) {
    return {
      tier: 'standard',
      priceId: legado,
      // Preço novo (repontado) ou o histórico, se ainda não foi reajustado.
      amounts: [definition.novo.amount, definition.legado.amount],
    };
  }
  return null;
}

/* Em qual faixa está uma assinatura existente. Compara pelo Price ID, e não
   pelo valor: o valor pode coincidir entre preços diferentes, o id não. */
function tierDoPriceId(priceId) {
  if (!priceId) return 'standard';
  const antigos = ['STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_ANNUAL',
                   'STRIPE_PRICE_MONTHLY_FOUNDER', 'STRIPE_PRICE_ANNUAL_FOUNDER'];
  return antigos.some(e => process.env[e] && process.env[e] === priceId)
    ? 'founder' : 'standard';
}

let stripeClient;
const priceCache = new Map();

function isProduction() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function getStripe() {
  if (stripeClient) return stripeClient;

  assertBillingEnabled();
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) throw new Error('STRIPE_SECRET_KEY não configurada');
  if (isProduction() && !/^(rk|sk)_live_/.test(apiKey)) {
    throw new Error('A produção exige uma chave live da Stripe');
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: 'MyDesk-Colab', version: '1.0.0' },
  });
  return stripeClient;
}

function appUrl() {
  return assertSafeAppUrl(process.env.APP_URL);
}

function normalizePlan(value) {
  return value === 'anual' ? 'anual' : 'mensal';
}

function objectId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

async function getPlanPrice(plan) {
  const normalized = normalizePlan(plan);
  const definition = PLAN_CATALOG[normalized];
  const faixa = faixaDeVenda(definition);
  if (!faixa) {
    throw new Error(`${definition.novo.env} (ou ${definition.legado.env}) não configurada`);
  }
  const { priceId, amounts, tier } = faixa;

  const cached = priceCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) {
    return { plan: normalized, priceId, price: cached.price, tier };
  }

  const price = await getStripe().prices.retrieve(priceId);
  /* A conferência do valor continua: um Price ID trocado por engano na Vercel
     cobraria outra coisa de todo mundo, em silêncio. O valor esperado agora
     depende de qual faixa está em uso. */
  const valid = price.active
    && price.type === 'recurring'
    && price.currency === definition.currency
    && amounts.includes(price.unit_amount)
    && price.recurring?.interval === definition.interval
    && price.recurring?.interval_count === 1;

  if (!valid || (isProduction() && !price.livemode)) {
    /* Dizer QUAL checagem falhou. "Preço inválido" sozinho custou uma noite:
       o log acusava o problema e não distinguia preço arquivado de valor
       diferente, de moeda errada, de chave de teste. Cada motivo tem conserto
       diferente, e nenhum deles se descobre por tentativa. */
    const motivos = [];
    if (!price.active) motivos.push('preço arquivado/inativo na Stripe');
    if (price.type !== 'recurring') motivos.push(`tipo ${price.type} (esperado recurring)`);
    if (price.currency !== definition.currency) motivos.push(`moeda ${price.currency} (esperado ${definition.currency})`);
    if (!amounts.includes(price.unit_amount)) motivos.push(`valor ${price.unit_amount} (esperado ${amounts.join(' ou ')})`);
    if (price.recurring?.interval !== definition.interval) motivos.push(`intervalo ${price.recurring?.interval} (esperado ${definition.interval})`);
    if (price.recurring?.interval_count !== 1) motivos.push(`interval_count ${price.recurring?.interval_count}`);
    if (isProduction() && !price.livemode) motivos.push('preço do modo de teste em produção');
    throw new Error(`Preço Stripe inválido para o plano ${normalized} ` +
                    `(${priceId}, faixa ${tier}): ${motivos.join('; ') || 'motivo desconhecido'}`);
  }

  priceCache.set(priceId, { price, expiresAt: Date.now() + 5 * 60 * 1000 });
  return { plan: normalized, priceId, price, tier };
}

function planFromSubscription(subscription) {
  const metadataPlan = subscription?.metadata?.plano;
  if (metadataPlan === 'mensal' || metadataPlan === 'anual') return metadataPlan;

  /* Sem metadado, decide pelo Price ID — e agora existem TRÊS ids anuais
     possíveis: o novo, o de fundador e o legado. Olhar só um deles classificava
     assinante antigo como mensal e mostrava o vencimento errado. */
  const priceId = objectId(subscription?.items?.data?.[0]?.price);
  const anuais = ['STRIPE_PRICE_ANNUAL_NEW', 'STRIPE_PRICE_ANNUAL_FOUNDER', 'STRIPE_PRICE_ANNUAL']
    .map(e => process.env[e]).filter(Boolean);
  if (priceId && anuais.includes(priceId)) return 'anual';

  // Último recurso: o intervalo declarado no próprio preço expandido.
  const intervalo = subscription?.items?.data?.[0]?.price?.recurring?.interval;
  if (intervalo === 'year') return 'anual';
  return 'mensal';
}

/* Faixa de cobrança de uma assinatura: 'founder' para quem entrou no preço
   antigo, 'standard' para o resto. Vai para o entitlement, e é o que permite
   ao painel mostrar quantos assinantes estão em cada preço. */
function tierFromSubscription(subscription) {
  return tierDoPriceId(objectId(subscription?.items?.data?.[0]?.price));
}

function subscriptionPeriodEndMs(subscription) {
  const itemEnds = (subscription?.items?.data || [])
    .map(item => Number(item.current_period_end) || 0);
  const endSeconds = Math.max(Number(subscription?.current_period_end) || 0, ...itemEnds);
  return endSeconds > 0 ? endSeconds * 1000 : 0;
}

function computeEntitlement({
  status,
  periodEndMs,
  legacyExpiresAt = 0,
  pastDueSince = 0,
  now = Date.now(),
  graceDays = Number(process.env.STRIPE_GRACE_PERIOD_DAYS || 3),
}) {
  const legacyEnd = Number(legacyExpiresAt) || 0;
  const paidEnd = PAID_SUBSCRIPTION_STATUSES.has(status) ? Number(periodEndMs) || 0 : 0;
  const safeGraceDays = Math.min(14, Math.max(0, Number(graceDays) || 0));
  const graceEnd = status === 'past_due' && pastDueSince
    ? Number(pastDueSince) + safeGraceDays * 24 * 60 * 60 * 1000
    : 0;
  const expiresAt = Math.max(legacyEnd, paidEnd, graceEnd);

  return {
    active: expiresAt > now,
    expiresAt,
  };
}

function hasActiveSubscriptionStatus(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

module.exports = {
  tierFromSubscription,
  tierDoPriceId,
  PLAN_CATALOG,
  STRIPE_API_VERSION,
  appUrl,
  computeEntitlement,
  getPlanPrice,
  getStripe,
  hasActiveSubscriptionStatus,
  normalizePlan,
  objectId,
  planFromSubscription,
  subscriptionPeriodEndMs,
};
