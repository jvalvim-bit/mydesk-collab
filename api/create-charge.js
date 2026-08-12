// Cria uma assinatura recorrente no Stripe Checkout.
const { authenticatedUser, dbRest } = require('../lib/firebase-admin');
const {
  appUrl,
  getPlanPrice,
  getStripe,
  hasActiveSubscriptionStatus,
  normalizePlan,
} = require('../lib/stripe-billing');

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

async function enforceRateLimit(uid) {
  const windowMs = 60_000;
  const maximum = 4;
  const path = `rateLimit/charge/${uid}`;
  const record = await dbRest('GET', path).catch(() => null);
  const now = Date.now();
  const startedAt = Number(record?.inicio) || 0;
  const count = Number(record?.n) || 0;

  if (now - startedAt < windowMs) {
    if (count >= maximum) {
      return Math.ceil((windowMs - (now - startedAt)) / 1000);
    }
    await dbRest('PUT', path, { inicio: startedAt, n: count + 1 }).catch(() => {});
  } else {
    await dbRest('PUT', path, { inicio: now, n: 1 }).catch(() => {});
  }
  return 0;
}

async function ensureStripeCustomer({ uid, email, name }, customerRecord) {
  const stripe = getStripe();
  if (customerRecord?.customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerRecord.customerId);
      if (!existing.deleted) return existing.id;
    } catch (error) {
      if (error?.code !== 'resource_missing') throw error;
    }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { firebaseUid: uid },
  }, {
    idempotencyKey: `mydesk-customer-${uid}`,
  });

  await Promise.all([
    dbRest('PATCH', `stripeCustomers/${uid}`, { customerId: customer.id }),
    dbRest('PUT', `stripeCustomerUids/${customer.id}`, uid),
  ]);
  return customer.id;
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await authenticatedUser(req);
    const retryAfter = await enforceRateLimit(user.uid);
    if (retryAfter) {
      return res.status(429).json({
        error: `Muitas tentativas seguidas. Tente de novo em ${retryAfter}s.`,
        retryAfter,
      });
    }

    const plan = normalizePlan(req.body?.plano);
    const [{ priceId }, currentPlan, customerRecord] = await Promise.all([
      getPlanPrice(plan),
      dbRest('GET', `users/${user.uid}/plan`).catch(() => null),
      dbRest('GET', `stripeCustomers/${user.uid}`).catch(() => null),
    ]);

    const stripe = getStripe();
    if (customerRecord?.subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(customerRecord.subscriptionId);
        if (hasActiveSubscriptionStatus(subscription.status)) {
          return res.status(409).json({
            error: 'Você já possui uma assinatura Stripe. Use “Gerenciar assinatura”.',
            code: 'subscription_exists',
          });
        }
      } catch (error) {
        if (error?.code !== 'resource_missing') throw error;
      }
    }

    const customerId = await ensureStripeCustomer(user, customerRecord);
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    const existingSubscription = subscriptions.data.find(item =>
      hasActiveSubscriptionStatus(item.status));
    if (existingSubscription) {
      await dbRest('PATCH', `stripeCustomers/${user.uid}`, {
        customerId,
        subscriptionId: existingSubscription.id,
        status: existingSubscription.status,
        updatedAt: Date.now(),
      });
      return res.status(409).json({
        error: 'Você já possui uma assinatura Stripe. Use “Gerenciar assinatura”.',
        code: 'subscription_exists',
      });
    }

    const legacyPlanExpiresAt = Math.max(
      Number(customerRecord?.legacyPlanExpiresAt) || 0,
      currentPlan?.plan === 'premium' ? Number(currentPlan?.planExpiresAt) || 0 : 0,
    );

    await Promise.all([
      dbRest('PATCH', `stripeCustomers/${user.uid}`, {
        customerId,
        legacyPlanExpiresAt,
        updatedAt: Date.now(),
      }),
      dbRest('PUT', `stripeCustomerUids/${customerId}`, user.uid),
    ]);

    const baseUrl = appUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.uid,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { firebaseUid: user.uid, plano: plan },
      subscription_data: {
        metadata: { firebaseUid: user.uid, plano: plan },
      },
      payment_method_options: {
        boleto: { expires_after_days: 3 },
      },
      customer_update: { name: 'auto', address: 'auto' },
      locale: 'pt-BR',
      success_url: `${baseUrl}/?premium=activated&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?premium=cancelled`,
      integration_identifier: 'mydesk_checkout_kqjvmtla',
    }, {
      idempotencyKey: [
        'mydesk-checkout',
        user.uid,
        plan,
        Math.floor(Date.now() / (5 * 60 * 1000)),
      ].join('-'),
    });

    return res.status(200).json({ ok: true, id: session.id, url: session.url });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Stripe checkout:', error?.type || error?.code || error.message);
    }
    return res.status(status).json({
      error: status === 500 ? 'Serviço de pagamento indisponível' : error.message,
    });
  }
};
