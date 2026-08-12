const assert = require('node:assert/strict');
const test = require('node:test');

test('cria o Checkout preservando o vencimento legado do cliente', async t => {
  const firebasePath = require.resolve('../lib/firebase-admin');
  const billingPath = require.resolve('../lib/stripe-billing');
  const handlerPath = require.resolve('../api/create-charge');
  const originalFirebase = require.cache[firebasePath];
  const originalBilling = require.cache[billingPath];
  const originalHandler = require.cache[handlerPath];
  const writes = [];
  let checkoutParameters;

  t.after(() => {
    if (originalFirebase) require.cache[firebasePath] = originalFirebase;
    else delete require.cache[firebasePath];
    if (originalBilling) require.cache[billingPath] = originalBilling;
    else delete require.cache[billingPath];
    if (originalHandler) require.cache[handlerPath] = originalHandler;
    else delete require.cache[handlerPath];
  });

  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: {
      authenticatedUser: async () => ({
        uid: 'user-1',
        email: 'cliente@example.com',
        name: 'Cliente',
      }),
      dbRest: async (method, path, body) => {
        if (method === 'GET' && path === 'rateLimit/charge/user-1') return null;
        if (method === 'GET' && path === 'users/user-1/plan') {
          return { plan: 'premium', planExpiresAt: 123 };
        }
        if (method === 'GET' && path === 'stripeCustomers/user-1') {
          return { customerId: 'cus_existing', legacyPlanExpiresAt: 456 };
        }
        writes.push({ method, path, body });
        return null;
      },
    },
  };

  const stripe = {
    customers: {
      retrieve: async () => ({ id: 'cus_existing', deleted: false }),
    },
    subscriptions: {
      list: async () => ({ data: [] }),
    },
    checkout: {
      sessions: {
        create: async parameters => {
          checkoutParameters = parameters;
          return {
            id: 'cs_live',
            url: 'https://checkout.stripe.com/c/pay/cs_live',
          };
        },
      },
    },
  };

  require.cache[billingPath] = {
    id: billingPath,
    filename: billingPath,
    loaded: true,
    exports: {
      appUrl: () => 'https://mydesk.social',
      getPlanPrice: async () => ({ priceId: 'price_live' }),
      getStripe: () => stripe,
      hasActiveSubscriptionStatus: () => false,
      normalizePlan: () => 'mensal',
    },
  };
  delete require.cache[handlerPath];

  const handler = require(handlerPath);
  const req = {
    method: 'POST',
    headers: { origin: 'https://mydesk.social' },
    body: { plano: 'mensal' },
  };
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.url, 'https://checkout.stripe.com/c/pay/cs_live');
  const customerWrite = writes.find(
    write => write.method === 'PATCH' && write.path === 'stripeCustomers/user-1',
  );
  assert.equal(customerWrite.body.legacyPlanExpiresAt, 456);
  assert.equal(checkoutParameters.payment_method_options.boleto.expires_after_days, 3);
  assert.deepEqual(checkoutParameters.customer_update, {
    name: 'auto',
    address: 'auto',
  });
});
