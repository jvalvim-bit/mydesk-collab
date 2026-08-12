'use strict';

/*
 * Guardrails for the isolated collaboration copy.
 *
 * These checks do not contain credentials and do not authorize access to any
 * environment. They prevent the known MyDesk production identifiers from
 * being used accidentally if someone copies old environment variables locally.
 */

const PRODUCTION_FIREBASE_PROJECT = 'mydesk-ad0da';
const PRODUCTION_FIREBASE_HOST = 'mydesk-ad0da-default-rtdb.firebaseio.com';
const PRODUCTION_HOSTS = new Set([
  'mydesk.social',
  'www.mydesk.social',
  'mydesk-eta.vercel.app',
  'jvalvim-bit.github.io',
]);

function safetyError(message) {
  const error = new Error(`MyDesk-Colab bloqueou esta operação: ${message}`);
  error.code = 'MYDESK_COLLAB_SAFETY';
  error.statusCode = 503;
  return error;
}

function hostname(value) {
  try {
    return new URL(String(value || '')).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isProductionHost(value) {
  const host = hostname(value) || String(value || '').toLowerCase();
  return PRODUCTION_HOSTS.has(host)
    || host.endsWith('.mydesk.social')
    || host === PRODUCTION_FIREBASE_HOST;
}

function assertSafeFirebaseEnvironment(env = process.env) {
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim().toLowerCase();
  const databaseUrl = String(env.FIREBASE_DATABASE_URL || '').trim();

  if (projectId === PRODUCTION_FIREBASE_PROJECT || isProductionHost(databaseUrl)) {
    throw safetyError('as credenciais/configuração do Firebase de produção não podem ser usadas nesta cópia. Use um projeto Firebase de desenvolvimento ou o Emulator.');
  }
}

function assertSafeAppUrl(value) {
  const configured = String(value || '').trim().replace(/\/+$/, '');
  if (!configured) {
    throw safetyError('APP_URL deve apontar para um ambiente de desenvolvimento antes de habilitar este recurso.');
  }

  let url;
  try {
    url = new URL(configured);
  } catch (_) {
    throw safetyError('APP_URL deve ser uma URL válida.');
  }

  const localHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localHttp) {
    throw safetyError('APP_URL deve usar HTTPS ou http://localhost em desenvolvimento.');
  }
  if (isProductionHost(url.href)) {
    throw safetyError('APP_URL não pode apontar para um domínio do MyDesk de produção.');
  }
  return configured;
}

function assertBillingEnabled(env = process.env) {
  if (env.MYDESK_ENABLE_BILLING !== '1') {
    throw safetyError('o billing está desativado nesta cópia. Defina MYDESK_ENABLE_BILLING=1 somente com credenciais Stripe de teste próprias.');
  }
  if (/^(?:sk|rk)_live_/i.test(String(env.STRIPE_SECRET_KEY || '').trim())) {
    throw safetyError('chaves Stripe live são proibidas no MyDesk-Colab. Use uma chave de teste.');
  }
}

function assertEmailEnabled(env = process.env) {
  if (env.MYDESK_ENABLE_EMAIL !== '1') {
    throw safetyError('o envio de e-mail está desativado nesta cópia. Defina MYDESK_ENABLE_EMAIL=1 somente com uma conta de teste própria.');
  }
  const sender = String(env.RESEND_FROM || env.REMETENTE || '').trim();
  if (!sender) {
    throw safetyError('defina RESEND_FROM ou REMETENTE com um remetente de desenvolvimento.');
  }
  if (/@(?:[a-z0-9-]+\.)?mydesk\.social\b/i.test(sender)) {
    throw safetyError('o remetente de produção do MyDesk não pode ser usado nesta cópia.');
  }
}

function assertAiEnabled(env = process.env) {
  if (env.MYDESK_ENABLE_AI !== '1') {
    throw safetyError('recursos de IA estão desativados nesta cópia. Defina MYDESK_ENABLE_AI=1 somente com chaves próprias de desenvolvimento.');
  }
}

function assertScheduledJobsEnabled(env = process.env) {
  if (env.MYDESK_COLLAB_MODE !== '1' || env.MYDESK_ENABLE_SCHEDULED_JOBS !== '1') {
    throw safetyError('tarefas agendadas estão desativadas nesta cópia. Elas exigem MYDESK_COLLAB_MODE=1 e MYDESK_ENABLE_SCHEDULED_JOBS=1.');
  }
}

module.exports = {
  assertAiEnabled,
  assertBillingEnabled,
  assertEmailEnabled,
  assertSafeAppUrl,
  assertSafeFirebaseEnvironment,
  assertScheduledJobsEnabled,
  isProductionHost,
};
