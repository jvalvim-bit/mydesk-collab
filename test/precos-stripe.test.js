'use strict';
/* A troca de preço mexe em cobrança de gente real. Estes testes guardam as três
   coisas que não podem dar errado: quem já assinava não vai para o preço novo,
   nada quebra antes de os preços novos existirem na Stripe, e uma variável
   trocada por engano não passa despercebida. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'lib', 'stripe-billing.js'), 'utf8');

/* Recorta o catálogo e as funções puras — carregar o módulo inteiro exigiria o
   pacote da Stripe instalado, que é justamente o que falha neste ambiente. */
function monta(env) {
  const ctx = vm.createContext({ process: { env }, console });
  const pedacos = [];
  const pega = (marca, fim) => {
    const i = fonte.indexOf(marca);
    assert.ok(i > -1, marca);
    const f = fonte.indexOf(fim, i);
    pedacos.push(fonte.slice(i, f));
  };
  pega('const PLAN_CATALOG', 'let stripeClient');
  pega('function planFromSubscription', 'function subscriptionPeriodEndMs');
  vm.runInContext(pedacos.join('\n') + `
    function normalizePlan(v){ return v === 'anual' ? 'anual' : 'mensal'; }
    function objectId(v){ return !v ? null : (typeof v === 'string' ? v : v.id || null); }
  `, ctx);
  return {
    venda: plano => vm.runInContext(`faixaDeVenda(PLAN_CATALOG['${plano}'])`, ctx),
    tier: id => vm.runInContext(`tierDoPriceId(${JSON.stringify(id)})`, ctx),
    plano: sub => vm.runInContext(`planFromSubscription(${JSON.stringify(sub)})`, ctx),
  };
}

const ANTIGO = { STRIPE_PRICE_MONTHLY: 'price_velhoM', STRIPE_PRICE_ANNUAL: 'price_velhoA' };
const NOVO = { ...ANTIGO, STRIPE_PRICE_MONTHLY_NEW: 'price_novoM', STRIPE_PRICE_ANNUAL_NEW: 'price_novoA' };

test('sem os preços novos, o checkout continua com o preço de hoje', () => {
  // É o intervalo entre publicar o código e criar os preços na Stripe.
  const m = monta(ANTIGO);
  /* A variável de sempre aceita o valor antigo E o novo: quem reajusta costuma
     repontar a variável que já existe, em vez de criar outra. */
  assert.deepEqual(m.venda('mensal'), { tier: 'standard', priceId: 'price_velhoM', amounts: [1999, 1000] });
  assert.deepEqual(m.venda('anual'), { tier: 'standard', priceId: 'price_velhoA', amounts: [19999, 10000] });
});

test('com os preços novos, o checkout passa a vendê-los', () => {
  const m = monta(NOVO);
  assert.deepEqual(m.venda('mensal'), { tier: 'standard', priceId: 'price_novoM', amounts: [1999] });
  assert.deepEqual(m.venda('anual'), { tier: 'standard', priceId: 'price_novoA', amounts: [19999] });
});

test('quem assinou no preço antigo é reconhecido como fundador', () => {
  const m = monta(NOVO);
  assert.equal(m.tier('price_velhoM'), 'founder');
  assert.equal(m.tier('price_velhoA'), 'founder');
  assert.equal(m.tier('price_novoM'), 'standard');
  assert.equal(m.tier(null), 'standard');
});

test('assinatura anual antiga não é confundida com mensal', () => {
  /* O código olhava só uma variável anual. Com três ids possíveis, assinante
     antigo virava "mensal" e o vencimento aparecia errado. */
  const m = monta(NOVO);
  assert.equal(m.plano({ items: { data: [{ price: 'price_velhoA' }] } }), 'anual');
  assert.equal(m.plano({ items: { data: [{ price: 'price_novoA' }] } }), 'anual');
  assert.equal(m.plano({ items: { data: [{ price: 'price_novoM' }] } }), 'mensal');
});

test('o intervalo do preço decide quando o id é desconhecido', () => {
  const m = monta(NOVO);
  const sub = { items: { data: [{ price: { id: 'price_desconhecido', recurring: { interval: 'year' } } }] } };
  assert.equal(m.plano(sub), 'anual');
});

test('o metadado da assinatura tem prioridade sobre o preço', () => {
  const m = monta(NOVO);
  assert.equal(m.plano({ metadata: { plano: 'anual' }, items: { data: [{ price: 'price_novoM' }] } }), 'anual');
});

test('os valores esperados batem com os preços anunciados', () => {
  /* 1999 e 19999 centavos: R$ 19,99 e R$ 199,99 — os valores realmente criados
     na Stripe. Errar aqui cobra o valor errado de todo mundo. */
  const m = monta(NOVO);
  assert.ok(m.venda('mensal').amounts.includes(1999));
  assert.ok(m.venda('anual').amounts.includes(19999));
});
