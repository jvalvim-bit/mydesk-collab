# Stripe em produção

O MyDesk usa Stripe Checkout em modo `subscription`, Billing, Customer Portal e
webhooks assinados.

## Três faixas de preço convivendo

Preço na Stripe é **imutável**: reajustar significa criar outro Price e apontar
a variável para ele. Quem já assinou continua no preço que contratou, então o
catálogo (`lib/stripe-billing.js`, `PLAN_CATALOG`) carrega as três faixas ao
mesmo tempo — e é ele, não este documento, a fonte da verdade.

| Faixa | Mensal | Anual | Para quem |
|---|---|---|---|
| **novo** | R$ 19,99 | R$ 199,99 | preço de tabela atual |
| **fundador** | R$ 10,00 | R$ 100,00 | quem entrou na largada |
| **legado** | R$ 10,00 | R$ 100,00 | assinaturas anteriores ao reajuste |

Vende-se sempre a faixa `novo`, se a variável `_NEW` existir; sem ela, cai na
variável de sempre. Os centavos são conferidos exatos (1999, não 1990; 19999,
não 19900) porque são os valores que existem de fato na conta.

## Segredos da Vercel

Configure somente no ambiente **Production**:

```env
STRIPE_SECRET_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Preço de tabela — é o que o checkout vende hoje
STRIPE_PRICE_MONTHLY_NEW=price_...      # R$ 19,99
STRIPE_PRICE_ANNUAL_NEW=price_...       # R$ 199,99

# Fundador
STRIPE_PRICE_MONTHLY_FOUNDER=price_...  # R$ 10,00
STRIPE_PRICE_ANNUAL_FOUNDER=price_...   # R$ 100,00

# Legado — assinaturas anteriores ao reajuste
STRIPE_PRICE_MONTHLY=price_...          # R$ 10,00
STRIPE_PRICE_ANNUAL=price_...           # R$ 100,00

APP_URL=https://mydesk.social
STRIPE_GRACE_PERIOD_DAYS=3
```

**Ao reajustar, não trave a variável antiga em um valor esperado.** O caminho
natural de quem reajusta é repontar a variável que já existe para o preço novo;
com valor fixo no código, o preço legítimo era recusado e a venda inteira caía.
A proteção hoje é um *conjunto* de valores praticados: Price ID de outro
produto, de outra moeda ou de valor arbitrário continua sendo recusado.

Prefira uma restricted API key (`rk_live_`) com o mínimo necessário para:

- ler Prices;
- ler e criar Customers;
- criar Checkout Sessions;
- ler Subscriptions;
- criar Billing Portal Sessions.

Nunca coloque a chave ou o segredo do webhook no repositório.

## Webhook

Crie um endpoint live em:

`https://mydesk-eta.vercel.app/api/webhook`

Selecione a versão `2026-06-24.dahlia` e estes eventos:

- `checkout.session.completed`;
- `checkout.session.async_payment_succeeded`;
- `customer.subscription.created`;
- `customer.subscription.updated`;
- `customer.subscription.deleted`;
- `customer.subscription.paused`;
- `customer.subscription.resumed`;
- `invoice.paid`;
- `invoice.payment_failed`.

Copie o signing secret `whsec_...` diretamente para
`STRIPE_WEBHOOK_SECRET` na Vercel. O endpoint rejeita corpos modificados,
assinaturas inválidas, eventos duplicados e UIDs que não existam no MyDesk.

## Customer Portal e cobrança

Ative o Customer Portal em modo live com atualização da forma de pagamento,
histórico de faturas e cancelamento ao fim do período. O Checkout não fixa
`payment_method_types`: habilite no Dashboard os métodos compatíveis com
assinaturas que deseja oferecer.

Stripe Tax permanece desligado até haver um cadastro fiscal ativo e revisado.

## Verificação antes de abrir para clientes

1. Faça uma assinatura live de valor real com uma conta MyDesk controlada.
2. Confirme no Firebase `users/{uid}/plan` os campos `stripeStatus`,
   `stripeSubscriptionId`, `planExpiresAt` e `plan: premium`.
3. Abra “Gerenciar assinatura” e confirme o acesso ao Customer Portal.
4. Cancele ao fim do período e confirme que o acesso continua até o vencimento.
5. Confira no Workbench da Stripe que todos os eventos receberam HTTP 200.
