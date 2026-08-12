'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('webhook cria um único alerta multipath na transição para Premium', async () => {
  const webhookPath = require.resolve('../api/webhook');
  const firebasePath = require.resolve('../lib/firebase-admin');
  const billingPath = require.resolve('../lib/stripe-billing');
  const originals = new Map([
    [webhookPath, require.cache[webhookPath]],
    [firebasePath, require.cache[firebasePath]],
    [billingPath, require.cache[billingPath]],
  ]);
  let currentPlan = { plan: 'free', planExpiresAt: null };
  let customerRecord = {};
  const rootPatches = [];

  function install(path, exports) {
    require.cache[path] = { id: path, filename: path, loaded: true, exports };
  }

  install(firebasePath, {
    dbRest: async (method, path, value) => {
      if (method === 'GET' && path === 'uids/user-1') return 'alice';
      if (method === 'GET' && path === 'stripeCustomers/user-1') return customerRecord;
      if (method === 'GET' && path === 'users/user-1/plan') return currentPlan;
      if (method === 'PATCH' && path === '') {
        rootPatches.push(structuredClone(value));
        const nextPlan = { ...currentPlan };
        const nextCustomer = { ...customerRecord };
        Object.entries(value).forEach(([key, fieldValue]) => {
          const planPrefix = 'users/user-1/plan/';
          const customerPrefix = 'stripeCustomers/user-1/';
          if (key.startsWith(planPrefix)) nextPlan[key.slice(planPrefix.length)] = fieldValue;
          if (key.startsWith(customerPrefix)) nextCustomer[key.slice(customerPrefix.length)] = fieldValue;
        });
        currentPlan = nextPlan;
        customerRecord = nextCustomer;
        return null;
      }
      return null;
    },
  });
  install(billingPath, {
    computeEntitlement: ({ status, periodEndMs }) => status === 'paused'
      ? ({ active: false, expiresAt: 0 })
      : ({ active: true, expiresAt: periodEndMs }),
    getStripe: () => { throw new Error('Stripe não deveria ser consultada neste teste'); },
    objectId: value => typeof value === 'string' ? value : value?.id || null,
    planFromSubscription: () => 'mensal',
    subscriptionPeriodEndMs: () => 2_000_000_000_000,
  });
  delete require.cache[webhookPath];

  try {
    const webhook = require('../api/webhook');
    const subscription = {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { firebaseUid: 'user-1', plano: 'mensal' },
    };
    const first = await webhook._test.syncSubscription(subscription, {
      id: 'evt_first',
      created: 1000,
      data: { object: { id: 'evt_object_first' } },
    });

    assert.equal(first.plan, 'premium');
    assert.equal(first.notificationId, 'stripe_sub_1_2000000000000_g1');
    const notificationKeys = Object.keys(rootPatches[0])
      .filter(key => key.startsWith('adminNotifications/'));
    assert.deepEqual(notificationKeys, ['adminNotifications/stripe_sub_1_2000000000000_g1']);
    assert.equal(rootPatches[0][notificationKeys[0]].uid, 'user-1');
    assert.equal(rootPatches[0][notificationKeys[0]].source, 'stripe');
    assert.equal(rootPatches[0]['users/user-1/plan/plan'], 'premium');

    const second = await webhook._test.syncSubscription(subscription, {
      id: 'evt_second',
      created: 1001,
      data: { object: { id: 'evt_object_second' } },
    });
    assert.equal(second.notificationId, null);
    assert.equal(
      Object.keys(rootPatches[1]).some(key => key.startsWith('adminNotifications/')),
      false,
    );

    subscription.status = 'paused';
    const paused = await webhook._test.syncSubscription(subscription, {
      id: 'evt_paused',
      created: 1002,
      data: { object: { id: 'evt_object_paused' } },
    });
    assert.equal(paused.plan, 'free');
    assert.equal(paused.notificationId, null);

    subscription.status = 'active';
    const resumed = await webhook._test.syncSubscription(subscription, {
      id: 'evt_resumed',
      created: 1003,
      data: { object: { id: 'evt_object_resumed' } },
    });
    assert.equal(resumed.plan, 'premium');
    assert.equal(resumed.notificationId, 'stripe_sub_1_2000000000000_g2');
    const resumedNotification = Object.keys(rootPatches[3])
      .find(key => key.startsWith('adminNotifications/'));
    assert.equal(
      resumedNotification,
      'adminNotifications/stripe_sub_1_2000000000000_g2',
    );
    assert.equal(rootPatches[3][resumedNotification].activationGeneration, 2);
    assert.equal(rootPatches[3][resumedNotification].stripeEventCreatedAt, 1003000);
  } finally {
    for (const [path, original] of originals) {
      if (original) require.cache[path] = original;
      else delete require.cache[path];
    }
  }
});
