'use strict';

const FIREBASE_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;

function isActivePremium(plan, now = Date.now()) {
  if (!plan || plan.plan !== 'premium') return false;
  const expiresAt = Number(plan.planExpiresAt) || 0;
  return !expiresAt || expiresAt > now;
}

function safeFirebaseKey(...parts) {
  return parts
    .filter(part => part !== undefined && part !== null && part !== '')
    .map(part => String(part).replace(FIREBASE_FORBIDDEN_KEY_CHARS, '_'))
    .join('_')
    .slice(0, 240);
}

function premiumNotification({
  uid,
  username,
  source,
  billingCycle,
  planExpiresAt,
  createdAt = Date.now(),
  stripeSubscriptionId,
  stripeEventId,
  stripeEventCreatedAt,
  activationGeneration,
  grantedBy,
}) {
  return {
    type: 'premium_activated',
    uid: String(uid),
    username: username ? String(username).slice(0, 80) : null,
    source: source === 'stripe' ? 'stripe' : 'courtesy',
    billingCycle: billingCycle === 'anual' || billingCycle === 'mensal'
      ? billingCycle
      : null,
    planExpiresAt: Number(planExpiresAt) || null,
    createdAt: Number(createdAt) || Date.now(),
    stripeSubscriptionId: stripeSubscriptionId || null,
    stripeEventId: stripeEventId || null,
    stripeEventCreatedAt: Number(stripeEventCreatedAt) || null,
    activationGeneration: Math.max(0, Number(activationGeneration) || 0) || null,
    grantedBy: grantedBy || null,
  };
}

function addObjectToMultipath(update, path, value) {
  Object.entries(value || {}).forEach(([key, fieldValue]) => {
    update[`${path}/${key}`] = fieldValue;
  });
  return update;
}

module.exports = {
  addObjectToMultipath,
  isActivePremium,
  premiumNotification,
  safeFirebaseKey,
};
