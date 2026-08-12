const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeEntitlement,
  normalizePlan,
  planFromSubscription,
  subscriptionPeriodEndMs,
} = require('../lib/stripe-billing');

test('normaliza somente o plano anual e usa mensal como padrão seguro', () => {
  assert.equal(normalizePlan('anual'), 'anual');
  assert.equal(normalizePlan('mensal'), 'mensal');
  assert.equal(normalizePlan('premium-gratis'), 'mensal');
});

test('identifica o plano pelos metadados assinados da assinatura', () => {
  assert.equal(planFromSubscription({ metadata: { plano: 'anual' } }), 'anual');
  assert.equal(planFromSubscription({ metadata: { plano: 'mensal' } }), 'mensal');
});

test('usa o maior vencimento entre assinatura e itens da API Stripe', () => {
  const subscription = {
    current_period_end: 100,
    items: { data: [{ current_period_end: 200 }, { current_period_end: 150 }] },
  };
  assert.equal(subscriptionPeriodEndMs(subscription), 200_000);
});

test('assinatura ativa concede acesso até o fim do período pago', () => {
  const result = computeEntitlement({
    status: 'active',
    periodEndMs: 2_000,
    legacyExpiresAt: 0,
    now: 1_000,
  });
  assert.deepEqual(result, { active: true, expiresAt: 2_000 });
});

test('migração preserva um vencimento legado mais distante', () => {
  const result = computeEntitlement({
    status: 'active',
    periodEndMs: 2_000,
    legacyExpiresAt: 5_000,
    now: 1_000,
  });
  assert.deepEqual(result, { active: true, expiresAt: 5_000 });
});

test('cancelamento não remove acesso legado ainda pago', () => {
  const result = computeEntitlement({
    status: 'canceled',
    periodEndMs: 2_000,
    legacyExpiresAt: 5_000,
    now: 1_000,
  });
  assert.deepEqual(result, { active: true, expiresAt: 5_000 });
});

test('cancelamento antecipado preserva o fim do período Stripe já pago', () => {
  const result = computeEntitlement({
    status: 'canceled',
    periodEndMs: 5_000,
    legacyExpiresAt: 0,
    now: 1_000,
  });
  assert.deepEqual(result, { active: true, expiresAt: 5_000 });
});

test('pagamento em atraso recebe graça limitada a partir da primeira falha', () => {
  const day = 24 * 60 * 60 * 1000;
  const result = computeEntitlement({
    status: 'past_due',
    periodEndMs: 0,
    legacyExpiresAt: 0,
    pastDueSince: 1_000,
    now: 2_000,
    graceDays: 3,
  });
  assert.deepEqual(result, { active: true, expiresAt: 1_000 + 3 * day });
});
