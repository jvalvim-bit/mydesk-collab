'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  addObjectToMultipath,
  isActivePremium,
  premiumNotification,
  safeFirebaseKey,
} = require('../lib/admin-notifications');

test('reconhece apenas Premium ainda ativo', () => {
  const now = 1_000_000;
  assert.equal(isActivePremium({ plan: 'free' }, now), false);
  assert.equal(isActivePremium({ plan: 'premium', planExpiresAt: null }, now), true);
  assert.equal(isActivePremium({ plan: 'premium', planExpiresAt: now + 1 }, now), true);
  assert.equal(isActivePremium({ plan: 'premium', planExpiresAt: now }, now), false);
});

test('gera chave Firebase estável e payload administrativo normalizado', () => {
  assert.equal(
    safeFirebaseKey('stripe', 'sub/1', 'period.2'),
    'stripe_sub_1_period_2',
  );
  const payload = premiumNotification({
    uid: 'user-1',
    username: 'alice',
    source: 'stripe',
    billingCycle: 'anual',
    planExpiresAt: 123,
    createdAt: 99,
    stripeSubscriptionId: 'sub_1',
  });
  assert.deepEqual(payload, {
    type: 'premium_activated',
    uid: 'user-1',
    username: 'alice',
    source: 'stripe',
    billingCycle: 'anual',
    planExpiresAt: 123,
    createdAt: 99,
    stripeSubscriptionId: 'sub_1',
    stripeEventId: null,
    stripeEventCreatedAt: null,
    activationGeneration: null,
    grantedBy: null,
  });
});

test('monta atualização multipath sem perder valores nulos', () => {
  const update = {};
  addObjectToMultipath(update, 'users/u1/plan', {
    plan: 'premium',
    planExpiresAt: null,
  });
  assert.deepEqual(update, {
    'users/u1/plan/plan': 'premium',
    'users/u1/plan/planExpiresAt': null,
  });
});

test('painel não consome alerta Premium enquanto a aba está oculta', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'docs', 'admin', 'admin.js'),
    'utf8',
  );
  assert.match(source, /if \(!stack \|\| document\.hidden\) return/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /marcarPremiumLido\(el\.dataset\.notificationId\)/);
  assert.doesNotMatch(
    source,
    /stack\.appendChild\(el\);[\s\S]{0,350}adminNotificationReads/,
    'inserir o cartão não pode marcá-lo imediatamente como lido',
  );
});
