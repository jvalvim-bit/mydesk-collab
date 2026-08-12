// Recebe eventos Stripe, verifica a assinatura e sincroniza a assinatura no Firebase.
const { dbRest } = require('../lib/firebase-admin');
const {
  computeEntitlement,
  getStripe,
  objectId,
  planFromSubscription,
  subscriptionPeriodEndMs,
} = require('../lib/stripe-billing');
const {
  addObjectToMultipath,
  isActivePremium,
  premiumNotification,
  safeFirebaseKey,
} = require('../lib/admin-notifications');

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 1024 * 1024) throw new Error('Webhook maior que 1 MB');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function invoiceSubscriptionId(invoice) {
  return objectId(invoice?.parent?.subscription_details?.subscription)
    || objectId(invoice?.subscription);
}

async function currentSubscription(subscriptionOrId) {
  const subscriptionId = objectId(subscriptionOrId);
  if (!subscriptionId) return null;
  try {
    return await getStripe().subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (error?.code === 'resource_missing' && typeof subscriptionOrId === 'object') {
      return subscriptionOrId;
    }
    throw error;
  }
}

async function uidForSubscription(subscription) {
  const metadataUid = subscription?.metadata?.firebaseUid;
  if (metadataUid) return metadataUid;

  const customerId = objectId(subscription?.customer);
  if (!customerId) return null;
  const mapped = await dbRest('GET', `stripeCustomerUids/${customerId}`).catch(() => null);
  if (mapped) return mapped;

  const customer = await getStripe().customers.retrieve(customerId);
  return customer.deleted ? null : customer.metadata?.firebaseUid || null;
}

async function syncSubscription(subscription, event) {
  const uid = await uidForSubscription(subscription);
  if (!uid) throw new Error('firebaseUid não encontrado na assinatura Stripe');

  const ownerUsername = await dbRest('GET', `uids/${uid}`).catch(() => null);
  if (!ownerUsername) throw new Error('UID Stripe não pertence a uma conta MyDesk');

  const customerId = objectId(subscription.customer);
  const [customerRecord, currentPlan] = await Promise.all([
    // GET de caminho ausente já retorna null. Uma falha real precisa fazer a
    // Stripe repetir o webhook; continuar com estado vazio aceitaria evento
    // antigo, perderia legado e poderia avisar Premium duas vezes.
    dbRest('GET', `stripeCustomers/${uid}`),
    dbRest('GET', `users/${uid}/plan`),
  ]);

  const eventCreatedMs = Number(event.created) * 1000 || Date.now();
  const previousEventMs = Number(customerRecord?.lastEventCreated) || 0;
  if (previousEventMs > eventCreatedMs) {
    return { uid, ignored: 'older_event' };
  }

  const now = Date.now();
  const wasPremium = isActivePremium(currentPlan, now);
  const status = subscription.status || 'unknown';
  const plan = planFromSubscription(subscription);
  const periodEndMs = subscriptionPeriodEndMs(subscription);
  const pastDueSince = status === 'past_due'
    ? Number(customerRecord?.pastDueSince) || now
    : 0;
  const entitlement = computeEntitlement({
    status,
    periodEndMs,
    legacyExpiresAt: customerRecord?.legacyPlanExpiresAt,
    pastDueSince,
    now,
  });

  const stripeCurrentlyGrantsAccess = ['active', 'trialing', 'past_due'].includes(status)
    && entitlement.expiresAt > now;
  const planType = stripeCurrentlyGrantsAccess
    ? `stripe_${plan}`
    : entitlement.active
      ? currentPlan?.planTipo || 'legado'
      : null;

  const planPatch = {
    plan: entitlement.active ? 'premium' : 'free',
    planExpiresAt: entitlement.expiresAt || null,
    planActivatedAt: entitlement.active
      ? Number(currentPlan?.planActivatedAt) || now
      : null,
    planTipo: planType,
    lastChargeId: event.data?.object?.id || event.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeStatus: status,
    stripeCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };

  const customerPatch = {
    customerId,
    subscriptionId: subscription.id,
    plan,
    status,
    currentPeriodEnd: periodEndMs || null,
    pastDueSince: pastDueSince || null,
    lastEventCreated: eventCreatedMs,
    updatedAt: now,
    premiumActivationGeneration:
      Math.max(0, Number(customerRecord?.premiumActivationGeneration) || 0) || null,
  };

  // Uma atualização multipath na raiz mantém plano, mapeamento Stripe e aviso
  // administrativo no mesmo commit. Assim, um retry não consegue ativar o
  // Premium e perder o alerta por uma falha ocorrida entre duas escritas.
  const multipath = {};
  addObjectToMultipath(multipath, `users/${uid}/plan`, planPatch);
  addObjectToMultipath(multipath, `stripeCustomers/${uid}`, customerPatch);
  if (customerId) multipath[`stripeCustomerUids/${customerId}`] = uid;

  const becamePremium = entitlement.active
    && !wasPremium
    && stripeCurrentlyGrantsAccess;
  let notificationId = null;
  if (becamePremium) {
    // A geração distingue uma retomada no mesmo período pago, mas continua
    // estável entre os vários eventos equivalentes da mesma ativação.
    const activationGeneration =
      Math.max(0, Number(customerRecord?.premiumActivationGeneration) || 0) + 1;
    customerPatch.premiumActivationGeneration = activationGeneration;
    multipath[`stripeCustomers/${uid}/premiumActivationGeneration`] = activationGeneration;
    notificationId = safeFirebaseKey(
      'stripe',
      subscription.id,
      periodEndMs || eventCreatedMs,
      'g' + activationGeneration,
    );
    multipath[`adminNotifications/${notificationId}`] = premiumNotification({
      uid,
      username: ownerUsername,
      source: 'stripe',
      billingCycle: plan,
      planExpiresAt: planPatch.planExpiresAt,
      // Ordenação administrativa é por chegada. O horário original continua
      // separado para auditoria de webhooks atrasados.
      createdAt: now,
      stripeEventCreatedAt: eventCreatedMs,
      stripeSubscriptionId: subscription.id,
      stripeEventId: event.id,
      activationGeneration,
    });
  }

  await dbRest('PATCH', '', multipath);

  return {
    uid,
    plan: planPatch.plan,
    expiresAt: planPatch.planExpiresAt,
    notificationId,
  };
}

async function subscriptionFromEvent(event) {
  const object = event.data.object;

  if (event.type.startsWith('checkout.session.')) {
    return currentSubscription(object.subscription);
  }
  if (event.type.startsWith('customer.subscription.')) {
    return currentSubscription(object);
  }
  if (event.type.startsWith('invoice.')) {
    return currentSubscription(invoiceSubscriptionId(object));
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: 'Assinatura Stripe ausente' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.warn('Webhook Stripe rejeitado:', error.message);
    return res.status(400).json({ error: 'Webhook inválido' });
  }

  try {
    const alreadyProcessed = await dbRest('GET', `stripeEvents/${event.id}`).catch(() => null);
    if (alreadyProcessed) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    let result = { ignored: true };
    if (HANDLED_EVENTS.has(event.type)) {
      const subscription = await subscriptionFromEvent(event);
      if (subscription) result = await syncSubscription(subscription, event);
    }

    await dbRest('PUT', `stripeEvents/${event.id}`, {
      type: event.type,
      processedAt: Date.now(),
    });

    console.log('Webhook Stripe processado:', event.type, event.id);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error('Webhook Stripe:', event.type, error?.type || error?.code || error.message);
    return res.status(500).json({ error: 'Falha ao sincronizar assinatura' });
  }
};

module.exports._test = {
  syncSubscription,
};
