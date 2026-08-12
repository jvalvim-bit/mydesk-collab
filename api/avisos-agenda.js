// api/avisos-agenda.js — e-mail avisando que um compromisso está para começar.
//
// POR QUE ESTE ENDPOINT EXISTE SEPARADO DO /api/reminders
// O cron da Vercel no plano Hobby roda no MÁXIMO uma vez por dia, e nem no
// horário pedido — ela escolhe qualquer minuto daquela hora para distribuir
// carga. Com isso é impossível avisar "20 minutos antes" de um compromisso.
//
// A saída, sem pagar plano: a Vercel limita o cron DELA, não quantas vezes a
// função é chamada. Um agendador externo gratuito (cron-job.org e similares)
// chama este endereço de 5 em 5 minutos e o aviso sai na hora certa.
//
// Como este endereço fica exposto, ele EXIGE o CRON_SECRET no Authorization —
// sem ele, qualquer um dispararia envio de e-mail em nome do MyDesk.
//
// Variáveis usadas: as mesmas de /api/reminders (FIREBASE_*, RESEND_API_KEY,
// RESEND_FROM) mais CRON_SECRET, que aqui é obrigatório.
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const {
  assertEmailEnabled,
  assertSafeAppUrl,
  assertSafeFirebaseEnvironment,
  assertScheduledJobsEnabled,
} = require('../lib/collab-safety');

const ANTES_MIN = 20;     // quanto antes avisar
const JANELA_MIN = 8;     // tolerância: cobre o intervalo entre duas chamadas

async function token() {
  return (await getApp().options.credential.getAccessToken()).access_token;
}
async function dbGet(caminho, extra) {
  const t = await token();
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${caminho}.json?access_token=${t}${extra ? '&' + extra : ''}`);
  if (!r.ok) throw new Error(`DB GET ${caminho} ${r.status}`);
  return r.json();
}
async function dbPut(caminho, valor) {
  const t = await token();
  await fetch(`${process.env.FIREBASE_DATABASE_URL}/${caminho}.json?access_token=${t}`,
    { method: 'PUT', body: JSON.stringify(valor) });
}

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

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function montarEmail(nome, compromissos) {
  const linhas = compromissos.map(c => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(c.titulo)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;
                 font-family:monospace;color:#4f46e5;font-size:15px;">${esc(c.hora)}</td>
    </tr>`).join('');

  const quando = compromissos.length === 1
    ? `começa às ${esc(compromissos[0].hora)}`
    : 'começam em instantes';

  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;padding:24px;font-family:Inter,Arial,sans-serif;color:#14141c;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 30px;">
      <div style="font-family:Syne,Arial,sans-serif;font-weight:800;color:#6366f1;font-size:19px;margin-bottom:16px;">MyDesk</div>
      <h1 style="font-size:19px;margin:0 0 6px;">Daqui a pouco, ${esc(nome)}</h1>
      <p style="color:#5b5b6b;font-size:14px;margin:0 0 18px;">
        ${compromissos.length > 1 ? compromissos.length + ' compromissos ' + quando : 'Seu compromisso ' + quando}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${linhas}</table>
      <a href="${assertSafeAppUrl(process.env.APP_URL)}"
         style="display:inline-block;margin-top:22px;background:#6366f1;color:#fff;text-decoration:none;
                padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600;">Abrir o MyDesk</a>
      <p style="color:#9a9aab;font-size:12px;margin:20px 0 0;">
        Você recebe isto porque ligou os lembretes por e-mail no painel pessoal.</p>
    </div>
  </body></html>`;
}

async function enviar(para, assunto, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'MyDesk <onboarding@resend.dev>',
      to: [para], subject: assunto, html,
    }),
  });
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

module.exports = async (req, res) => {
  // Endereço público chamado de fora: sem segredo, qualquer um dispararia
  // envio de e-mail em nome do MyDesk. Aqui ele NÃO é opcional.
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return res.status(503).json({ error: 'CRON_SECRET não configurado' });
  if (req.headers.authorization !== 'Bearer ' + segredo) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    assertScheduledJobsEnabled();
    assertEmailEnabled();
    assertSafeAppUrl(process.env.APP_URL);
  } catch (error) {
    return res.status(error.statusCode || 503).json({ error: error.message });
  }
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'RESEND_API_KEY não configurado' });

  const resumo = { verificados: 0, enviados: 0, semEmail: 0, erros: 0 };

  try {
    ensureFirebase();
    const agora = new Date();

    /* Janela: de ANTES_MIN até ANTES_MIN-JANELA antes do compromisso. Ela existe
       porque o agendador externo chama a cada poucos minutos — sem tolerância,
       um compromisso cairia entre duas chamadas e nunca seria avisado. */
    const de  = new Date(agora.getTime() + (ANTES_MIN - JANELA_MIN) * 60000);
    const ate = new Date(agora.getTime() + ANTES_MIN * 60000);

    const uids = Object.keys((await dbGet('uids')) || {});
    for (const uid of uids) {
      try {
        const agenda = await dbGet(`users/${uid}/personal/agenda`).catch(() => null);
        if (!agenda) continue;

        const proximos = Object.entries(agenda)
          .map(([id, c]) => ({ id, ...c }))
          .filter(c => {
            if (!c.data || !c.hora) return false;   // sem hora não há o que avisar
            const quando = new Date(c.data + 'T' + c.hora + ':00');
            return isFinite(quando) && quando >= de && quando <= ate;
          });
        if (!proximos.length) continue;
        resumo.verificados++;

        const privado = await dbGet(`users/${uid}/private`).catch(() => null) || {};
        if (!privado.notif?.email) continue;             // não optou por receber
        const email = privado.email;
        if (!email) { resumo.semEmail++; continue; }

        // Um aviso por compromisso, para sempre. O carimbo fica no próprio
        // item — sem ele, cada chamada do agendador reenviaria o mesmo e-mail.
        const aEnviar = [];
        for (const c of proximos) {
          if (c.avisadoEm) continue;
          aEnviar.push(c);
        }
        if (!aEnviar.length) continue;

        const nome = (await dbGet(`users/${uid}/profile/name`).catch(() => null)) || 'tudo bem?';
        const assunto = aEnviar.length === 1
          ? `${aEnviar[0].titulo} às ${aEnviar[0].hora}`
          : `${aEnviar.length} compromissos daqui a pouco`;

        await enviar(email, assunto, montarEmail(nome, aEnviar));
        for (const c of aEnviar) {
          await dbPut(`users/${uid}/personal/agenda/${c.id}/avisadoEm`, Date.now()).catch(() => {});
        }
        resumo.enviados++;
      } catch (e) {
        resumo.erros++;
        console.error('avisos-agenda uid', uid.slice(0, 8), e.message);
      }
    }

    console.log('avisos-agenda:', JSON.stringify(resumo));
    return res.status(200).json({ ok: true, ...resumo });

  } catch (err) {
    console.error('avisos-agenda:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
