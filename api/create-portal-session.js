// Abre o Customer Portal da Stripe para trocar forma de pagamento ou cancelar.
const { authenticatedUser, dbRest } = require('../lib/firebase-admin');
const { appUrl, getStripe } = require('../lib/stripe-billing');

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

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ALLOWED_ORIGINS.includes(req.headers.origin || '')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await authenticatedUser(req);
    const record = await dbRest('GET', `stripeCustomers/${user.uid}`).catch(() => null);
    if (!record?.customerId) {
      return res.status(409).json({ error: 'Nenhuma assinatura Stripe encontrada' });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: record.customerId,
      return_url: appUrl(),
    });
    return res.status(200).json({ ok: true, url: session.url });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Stripe portal:', error?.type || error?.code || error.message);
    }
    return res.status(status).json({
      error: status === 500 ? 'Portal de assinatura indisponível' : error.message,
    });
  }
};
