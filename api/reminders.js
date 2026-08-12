// api/reminders.js — lembretes de prazo por e-mail (recurso Premium).
//
// Roda uma vez por dia pelo Vercel Cron (ver "crons" no vercel.json) e manda,
// para quem assinou E ligou o aviso, um resumo do que vence nos próximos dias:
// prazos de notas, vencimentos de clientes do CRM e o próprio Premium prestes
// a expirar — este último é o que evita a pessoa perder acesso sem perceber.
//
// Config necessária (variáveis de ambiente na Vercel):
//   RESEND_API_KEY   chave da Resend (https://resend.com) — sem ela o endpoint
//                    responde "não configurado" e não envia nada
//   RESEND_FROM      remetente verificado, ex.: "MyDesk <avisos@seudominio>"
//   CRON_SECRET      opcional; se definido, a Vercel manda no Authorization e
//                    aqui só passamos adiante quando bate
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const {
  assertEmailEnabled,
  assertSafeAppUrl,
  assertSafeFirebaseEnvironment,
  assertScheduledJobsEnabled,
} = require('../lib/collab-safety');

const DIAS_PADRAO = 3;
const appUrl = () => assertSafeAppUrl(process.env.APP_URL);

function ensureFirebase() {
  assertSafeFirebaseEnvironment();
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
}

async function dbRest(caminho, query) {
  const token = (await getApp().options.credential.getAccessToken()).access_token;
  const url = `${process.env.FIREBASE_DATABASE_URL}/${caminho}.json?access_token=${token}` +
              (query ? '&' + query : '');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`DB ${r.status} em ${caminho}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function dbPut(caminho, valor) {
  const token = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${caminho}.json?access_token=${token}`,
    { method: 'PUT', body: JSON.stringify(valor) });
  return r.ok;
}

const iso = d => d.toISOString().slice(0, 10);
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = s => {
  const [a, m, d] = String(s).split('-');
  return d ? `${d}/${m}/${a}` : s;
};
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Busca num nó de notas o que vence na janela. Duas consultas porque nota usa
   `end` e cliente do CRM usa `dueDate` — e um índice só serve a um campo. */
async function venceNaJanela(caminho, de, ate) {
  const achados = [];
  for (const campo of ['end', 'dueDate']) {
    let r = null;
    try {
      r = await dbRest(caminho, `orderBy=%22${campo}%22&startAt=%22${de}%22&endAt=%22${ate}%22`);
    } catch (e) {
      continue;   // sem índice para o campo neste nó: ignora em silêncio
    }
    Object.values(r || {}).forEach(item => {
      if (!item || typeof item !== 'object') return;
      const quando = item[campo];
      if (!quando) return;
      achados.push({
        titulo: item.title || item.name || '(sem título)',
        quando,
        valor: item.type === 'client' ? item.value : null,
        cliente: item.type === 'client',
      });
    });
  }
  return achados;
}

function montarEmail(nome, itens, premiumVence) {
  const linhas = itens.map(i => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid #eee;">${esc(i.titulo)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #eee;color:#6b6b7b;white-space:nowrap;">
        ${i.cliente ? 'Cliente' : 'Nota'}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
        ${i.valor != null ? brl(i.valor) + ' · ' : ''}${dataBR(i.quando)}
        ${i.faltam === 0 ? '<b style="color:#dc2626;"> · hoje</b>'
          : i.faltam === 1 ? '<b style="color:#ea580c;"> · amanhã</b>'
          : i.faltam != null ? `<span style="color:#6b6b7b;"> · em ${i.faltam} dias</span>` : ''}</td>
    </tr>`).join('');

  const avisoPremium = premiumVence ? `
    <div style="margin:22px 0 0;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
      <b style="color:#9a3412;">Seu Premium vence em ${premiumVence} dia${premiumVence > 1 ? 's' : ''}.</b>
      <div style="color:#7c2d12;font-size:13px;margin-top:4px;">
        Sua assinatura é gerenciada pela Stripe. Abra o MyDesk para revisar a cobrança ou a forma de pagamento.
      </div>
    </div>` : '';

  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;padding:24px;font-family:Inter,Arial,sans-serif;color:#14141c;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:30px 32px;">
      <div style="font-family:Syne,Arial,sans-serif;font-weight:800;color:#6366f1;font-size:19px;margin-bottom:18px;">MyDesk</div>
      <h1 style="font-size:19px;margin:0 0 6px;">Oi, ${esc(nome)} — o que vence por aí</h1>
      <p style="color:#5b5b6b;font-size:14px;margin:0 0 20px;">Prazos e vencimentos dos próximos dias.</p>
      ${itens.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">${linhas}</table>` : ''}
      ${avisoPremium}
       <a href="${appUrl()}" style="display:inline-block;margin-top:24px;background:#6366f1;color:#fff;
         text-decoration:none;padding:11px 22px;border-radius:9px;font-weight:600;font-size:14px;">Abrir o MyDesk</a>
      <p style="color:#9a9aa8;font-size:12px;margin:24px 0 0;border-top:1px solid #eee;padding-top:14px;">
        Você recebe este aviso porque ligou os lembretes por e-mail no MyDesk.
        Para parar, desligue a opção no Painel pessoal do app.
      </p>
    </div></body></html>`;
}

async function enviar(para, assunto, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'MyDesk <onboarding@resend.dev>',
      to: [para], subject: assunto, html,
    }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 160));
}

module.exports = async (req, res) => {
  // Esta rota nunca é pública: sem segredo, ela poderia disparar e-mails.
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== 'Bearer ' + segredo) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    assertScheduledJobsEnabled();
    assertEmailEnabled();
    appUrl();
  } catch (error) {
    return res.status(error.statusCode || 503).json({ error: error.message });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: false, motivo: 'RESEND_API_KEY não configurada — nada foi enviado' });
  }

  try {
    ensureFirebase();
    const hoje = new Date();
    const uids = await dbRest('uids', 'shallow=true') || {};
    const resumo = { verificados: 0, enviados: 0, semEmail: 0, semPremium: 0, semNada: 0, erros: 0 };

    for (const uid of Object.keys(uids)) {
      resumo.verificados++;
      try {
        const [plano, privado] = await Promise.all([
          dbRest(`users/${uid}/plan`).catch(() => null),
          dbRest(`users/${uid}/private`).catch(() => null),
        ]);

        const ehPremium = plano?.plan === 'premium' &&
          (!plano.planExpiresAt || plano.planExpiresAt > Date.now());
        if (!ehPremium) { resumo.semPremium++; continue; }

        const notif = privado?.notif || {};
        if (!notif.email) continue;                       // não optou por receber
        const email = privado?.email;
        if (!email) { resumo.semEmail++; continue; }

        // Um envio por dia, no máximo
        if (notif.ultimoEnvio && iso(new Date(notif.ultimoEnvio)) === iso(hoje)) continue;

        /* MARCOS, em vez de uma janela corrida.
           Antes o e-mail trazia tudo que vencia nos próximos N dias, todo dia —
           o mesmo prazo aparecia N vezes seguidas e a pessoa parava de ler.
           Agora avisa em 3, 2 e 1 dia antes, e no próprio dia: quatro toques
           espaçados, cada um com o que de fato mudou de faixa. O aviso de 20
           minutos não cabe aqui — este cron roda uma vez por dia; ele é dado
           pelo app, com o quadro aberto. */
        const teto = Math.min(30, Math.max(1, Number(notif.diasAntes) || DIAS_PADRAO));
        const marcos = [0, 1, 2, 3].filter(d => d <= teto);
        const ate = new Date(hoje.getTime() + Math.max(...marcos) * 86400000);

        const caminhos = [`users/${uid}/notes`];
        const boards = await dbRest(`users/${uid}/personalBoards`, 'shallow=true').catch(() => null);
        Object.keys(boards || {}).forEach(bid => caminhos.push(`users/${uid}/personalBoards/${bid}/notes`));

        let itens = [];
        for (const c of caminhos) itens = itens.concat(await venceNaJanela(c, iso(hoje), iso(ate)));
        // Só o que cai exatamente num dos marcos: o que vence em 5 dias espera
        // chegar aos 3 para ser mencionado.
        const diasAte = q => Math.round((new Date(q + 'T00:00:00') - hoje) / 86400000);
        itens = itens.filter(it => marcos.includes(diasAte(it.quando)));
        itens.forEach(it => { it.faltam = diasAte(it.quando); });
        itens.sort((a, b) => a.faltam - b.faltam || String(a.titulo).localeCompare(String(b.titulo)));

        const faltamDias = plano.planExpiresAt
          ? Math.ceil((plano.planExpiresAt - Date.now()) / 86400000) : null;
        const premiumVence = (faltamDias !== null && faltamDias <= 3 && faltamDias >= 0) ? faltamDias : null;

        if (!itens.length && !premiumVence) { resumo.semNada++; continue; }

        const nome = (await dbRest(`users/${uid}/profile/name`).catch(() => null)) || 'tudo bem?';
        const assunto = itens.length
          ? `${itens.length} ${itens.length > 1 ? 'prazos' : 'prazo'} chegando no MyDesk`
          : 'Seu Premium do MyDesk está para vencer';

        await enviar(email, assunto, montarEmail(nome, itens, premiumVence));
        await dbPut(`users/${uid}/private/notif/ultimoEnvio`, Date.now());
        resumo.enviados++;
      } catch (e) {
        resumo.erros++;
        console.error('reminders uid', uid.slice(0, 8), e.message);
      }
    }

    console.log('reminders:', JSON.stringify(resumo));
    return res.status(200).json({ ok: true, ...resumo });
  } catch (e) {
    console.error('reminders:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
