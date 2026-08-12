/* ═══════════════════════════════════════════════════════════════════════
   MYDESK — LEMBRETES POR E-MAIL (Cloudflare Worker)
   ═══════════════════════════════════════════════════════════════════════
   O aviso de compromisso existia em api/reminders.js, um cron da Vercel que
   no plano Hobby roda UMA VEZ POR DIA e em minuto escolhido por ela. Com isso
   "20 minutos antes" nunca teve como funcionar, e "no horário" muito menos.
   Aqui o cron é de cinco em cinco minutos, que é o que torna esses dois
   avisos possíveis.

   POR QUE NÃO VARRER O BANCO
   Ler users/ inteiro a cada cinco minutos seria baixar a base toda 288 vezes
   por dia para achar meia dúzia de compromissos. Em vez disso o app escreve,
   junto do compromisso, uma entrada enxuta em reminderJobs/{uid}_{eventId}
   com o próximo instante a checar (nextRunAt). O Worker pergunta só por
   nextRunAt <= agora, ordenado e limitado — uma consulta pequena, sempre.

   O QUE ESTE ARQUIVO NÃO FAZ
   · Não guarda segredo nenhum: tudo vem de env (secrets da Cloudflare).
   · Não aceita destinatário de fora. O e-mail sai do perfil privado do dono
     do UID e de mais lugar nenhum — senão isto viraria um disparador de
     e-mail aberto na internet.
   · Não expõe rota que envie e-mail. O fetch tem só /health, sem dado.
   ═══════════════════════════════════════════════════════════════════════ */

/* Versão publicada. Existe por um motivo prático: sem ela, não há como saber
   de fora QUAL código está rodando na Cloudflare — e a pergunta "eu já
   republiquei isso?" só se responde por tentativa e erro, esperando o próximo
   e-mail para descobrir. Suba este número junto com qualquer mudança de
   comportamento; /health passa a respondê-lo. */
const VERSAO = '2026-07-30.3';   // dois avisos: véspera no horário + no dia às 8h

const MAX_JOBS = 60;          // por execução; o resto fica para daqui a 5 min
const MAX_TENTATIVAS = 5;
const FUSO = 'America/Sao_Paulo';
const HORA_DO_DIA = 8;        // "no dia do compromisso" sai às 8h de SP

function assertSafeCollabEnvironment(env) {
  if (env.MYDESK_COLLAB_MODE !== '1' || env.MYDESK_ENABLE_SCHEDULED_JOBS !== '1') {
    throw new Error('tarefas agendadas estão desativadas no MyDesk-Colab');
  }
  if (env.MYDESK_ENABLE_EMAIL !== '1') {
    throw new Error('envio de e-mail está desativado no MyDesk-Colab');
  }
  if (String(env.FIREBASE_PROJECT_ID || '').toLowerCase() === 'mydesk-ad0da'
      || String(env.FIREBASE_DATABASE_URL || '').toLowerCase().includes('mydesk-ad0da')) {
    throw new Error('Firebase de produção é bloqueado no MyDesk-Colab');
  }
  if (/@(?:[a-z0-9-]+\.)?mydesk\.social\b/i.test(String(env.REMETENTE || ''))) {
    throw new Error('remetente de produção é bloqueado no MyDesk-Colab');
  }
}

/* DOIS avisos por compromisso, e nunca mais que isso.

   Eram seis (3 dias, 2 dias, 1 dia, no dia, 20 minutos antes e na hora). O
   problema não era técnico, era de custo: seis e-mails por compromisso contra
   um teto de 100 por dia no plano da Resend dão dezesseis compromissos diários
   para a base inteira. Dois avisos rendem cinquenta.

   Quando cada um sai:

     1d   um dia antes. Se o compromisso TEM hora marcada, sai exatamente 24h
          antes — quem marcou consulta às 19h é avisado às 19h da véspera, e não
          às 8h da manhã, quando o horário ainda não diz nada. Sem hora marcada,
          não há de onde ancorar: sai às 8h da véspera.

     day  no dia, às 8h. Existe por causa de quem marca em cima da hora: com só
          o aviso de um dia, marcar hoje à noite algo para amanhã à tarde não
          renderia e-mail nenhum, porque o momento do aviso já teria passado.
          Some sozinho quando o compromisso é de madrugada — avisar "é hoje"
          depois da hora seria pior que não avisar.

   `chave` entra no id da entrega e é o que impede o mesmo aviso sair duas
   vezes. A lista continua sendo uma lista de propósito: mudar a política é
   mexer aqui, e nada além disso muda. */
const AVISOS = [
  { chave: '1d',  antes: 1 * 86400000, texto: 'amanhã' },
  { chave: 'day', antes: 0, noDia: true, texto: 'hoje' },
];

/* ── Fuso ──
   Trabalhar em timestamp absoluto e converter só na hora de mostrar. Somar
   "-3h" na mão erraria no dia em que o horário de verão voltasse. */
function partesEmSP(ts) {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  fmt.formatToParts(new Date(ts)).forEach(({ type, value }) => { if (type !== 'literal') p[type] = value; });
  return p;
}

/* Instante exato de uma data/hora civil de São Paulo. Descobre o deslocamento
   do fuso naquele dia comparando a leitura em SP com a leitura em UTC — assim
   o horário de verão, se voltar, entra sozinho na conta. */
function instanteEmSP(data, hora) {
  const [a, m, d] = String(data).split('-').map(Number);
  const [hh, mm] = (hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora : '00:00').split(':').map(Number);
  const palpite = Date.UTC(a, m - 1, d, hh, mm);
  const p = partesEmSP(palpite);
  const lidoComoUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
                               Number(p.hour), Number(p.minute));
  return palpite + (palpite - lidoComoUTC);
}

function dataBR(data) {
  const [a, m, d] = String(data).split('-');
  return d ? `${d}/${m}/${a}` : String(data);
}

/* ── Firebase por REST, com token de conta de serviço ──
   firebase-admin depende de APIs de Node que o Worker não tem. O caminho é
   assinar um JWT com Web Crypto, trocá-lo por um access token e falar REST. */
let _tokenCache = { valor: null, expira: 0 };

function base64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemParaArrayBuffer(pem) {
  const limpo = String(pem).replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(limpo);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function accessToken(env) {
  const agora = Date.now();
  // Renova um minuto antes de vencer: token que expira no meio da execução
  // derrubaria a rodada inteira por um detalhe de relógio.
  if (_tokenCache.valor && _tokenCache.expira > agora + 60000) return _tokenCache.valor;

  const cabecalho = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const iat = Math.floor(agora / 1000);
  const corpo = base64url(new TextEncoder().encode(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
  })));

  const chave = await crypto.subtle.importKey(
    'pkcs8', pemParaArrayBuffer(env.FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(cabecalho + '.' + corpo)
  );
  const jwt = cabecalho + '.' + corpo + '.' + base64url(assinatura);

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error('oauth ' + r.status);
  const j = await r.json();
  _tokenCache = { valor: j.access_token, expira: agora + (j.expires_in || 3600) * 1000 };
  return _tokenCache.valor;
}

/* Opções recebidas como um objeto só, e desestruturadas dentro: com valores
   padrão na assinatura, o verificador de tipos do editor infere um formato
   fechado a partir da primeira chamada e passa a acusar "propriedade não
   existe" em todas as outras. São avisos, não erros — mas ruído no editor
   custa atenção de quem for mexer nisto depois. */
async function db(env, caminho, opcoes) {
  const { metodo = 'GET', corpo, query = '', cabecalhos = {} } = opcoes || {};
  const token = await accessToken(env);
  const url = `${env.FIREBASE_DATABASE_URL}/${caminho}.json?access_token=${encodeURIComponent(token)}${query ? '&' + query : ''}`;
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (r.status === 412) return { conflito: true };      // If-Match falhou
  if (!r.ok) throw new Error(`db ${metodo} ${r.status} em ${caminho}`);
  const txt = await r.text();
  return { dados: txt ? JSON.parse(txt) : null };
}

/* ── Trava de entrega ──
   "Confere se existe, não existe, envia" é justamente a sequência que manda
   e-mail duplicado quando duas execuções se cruzam. Aqui a criação é
   condicional: só grava se o nó ainda não existir, e quem perder a corrida
   recebe 412 e desiste sem enviar nada.

   O ETag de um nó inexistente no Realtime Database é a string `null_etag`, e
   NÃO a palavra "null" — que foi como escrevi da primeira vez. O efeito foi
   silencioso e completo: toda reserva era recusada com 412, o Worker concluía
   que outra execução já havia enviado aquele aviso, e nenhum e-mail saía
   nunca. Os jobs eram reagendados normalmente, então de fora tudo parecia
   funcionar — só faltava o e-mail. Confirmado contra o banco: com "null" vem
   412; com `null_etag` vem 200, e a segunda tentativa no mesmo nó vem 412,
   que é exatamente a proteção pretendida. */
const ETAG_INEXISTENTE = 'null_etag';

async function reservarEntrega(env, id) {
  const r = await db(env, 'reminderDeliveries/' + id, {
    metodo: 'PUT',
    corpo: { status: 'processing', createdAt: Date.now(), attempts: 1 },
    cabecalhos: { 'if-match': ETAG_INEXISTENTE },
  });
  return !r.conflito;
}

/* Erro de envio com a informação que decide o destino dele: dá para tentar de
   novo, ou é definitivo? Uma classe em vez de propriedades penduradas num Error
   comum — pendurar campo em Error funciona, mas o editor acusa a cada uso. */
class ErroEnvio extends Error {
  constructor(mensagem, temporario, detalhe) {
    super(mensagem);
    this.name = 'ErroEnvio';
    this.temporario = temporario;
    this.detalhe = detalhe;
  }
}

/* ── Resend ──
   A Idempotency-Key é a segunda camada: se a trava passar mas a resposta se
   perder na rede e o Worker reenviar, a Resend reconhece o mesmo envio. */
async function enviarEmail(env, { para, assunto, html, texto, chave }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Idempotency-Key': chave,
    },
    body: JSON.stringify({
      from: env.REMETENTE || 'MyDesk Colab <reminders@example.test>',
      to: [para], subject: assunto, html, text: texto,
    }),
  });
  const corpo = await r.text();
  if (!r.ok) {
    // 429 e 5xx merecem nova tentativa; 4xx restante é definitivo.
    throw new ErroEnvio('resend ' + r.status,
                        r.status === 429 || r.status >= 500,
                        corpo.slice(0, 200));
  }
  try { return JSON.parse(corpo).id || null; } catch (_) { return null; }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Assunto sem detalhe demais: ele aparece na tela bloqueada do celular, e o
   título do compromisso pode ser particular ("Consulta com Dr. X"). */
function montarAssunto(aviso, titulo) {
  const t = String(titulo || 'Compromisso').slice(0, 60);
  if (aviso.chave === 'now') return 'Agora: ' + t;
  if (aviso.chave === '20m') return 'Lembrete: ' + t + ' em 20 minutos';
  if (aviso.chave === 'day') return 'Compromisso de hoje: ' + t;
  return 'Lembrete: ' + t + ' ' + aviso.texto;
}

function montarHtml(env, { titulo, data, hora, quando }) {
  const app = env.APP_URL || 'http://localhost:3000';
  const logo = env.LOGO_URL || (app + '/img/logo-mydesk.png?v=3');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px 12px;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e4e4ea;">
    <tr><td style="padding:26px 28px 0;">
      <img src="${esc(logo)}" alt="MyDesk" width="132" style="display:block;border:0;max-width:132px;height:auto;">
    </td></tr>
    <tr><td style="padding:20px 28px 0;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b6b7b;">Lembrete de compromisso</p>
      <h1 style="margin:0 0 4px;font-size:21px;line-height:1.3;color:#14141c;">${esc(titulo)}</h1>
      <p style="margin:0;font-size:15px;color:#4f46e5;font-weight:bold;">${esc(quando)}</p>
    </td></tr>
    <tr><td style="padding:18px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#14141c;">
        <tr><td style="padding:3px 14px 3px 0;color:#6b6b7b;">Data</td><td style="padding:3px 0;">${esc(dataBR(data))}</td></tr>
        ${hora ? `<tr><td style="padding:3px 14px 3px 0;color:#6b6b7b;">Horário</td><td style="padding:3px 0;">${esc(hora)}</td></tr>` : ''}
      </table>
    </td></tr>
    <tr><td style="padding:22px 28px 28px;">
      <a href="${esc(app)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:bold;">Abrir o MyDesk</a>
      <p style="margin:20px 0 0;font-size:12px;color:#8a8a99;line-height:1.6;">
        Você recebe este aviso porque os lembretes por e-mail estão ligados no seu Painel Pessoal.
        Para parar, desligue "Lembretes por e-mail" lá.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function montarTexto(env, { titulo, data, hora, quando }) {
  return [
    'MyDesk — lembrete de compromisso', '',
    titulo, quando, '',
    'Data: ' + dataBR(data),
    hora ? 'Horário: ' + hora : '',
    '', 'Abra o MyDesk: ' + (env.APP_URL || 'http://localhost:3000'), '',
    'Você recebe este aviso porque os lembretes por e-mail estão ligados no seu Painel Pessoal.',
  ].filter(l => l !== '').join('\n');
}

/* Qual aviso cabe AGORA, e quando é o próximo.
   Nunca dispara aviso vencido: compromisso criado dez minutos antes da hora
   não deve render de uma vez os avisos de 3 dias, 2 dias, 1 dia e 20 minutos.
   A janela de tolerância é o próprio passo do cron, com folga. */
function decidir(job, agora) {
  const inicio = Number(job.startsAt) || 0;
  const temHora = !!job.hasTime;
  const JANELA = 6 * 60000;

  const oitoDoDiaDe = ts => {
    const p = partesEmSP(ts);
    return instanteEmSP(`${p.year}-${p.month}-${p.day}`,
                        String(HORA_DO_DIA).padStart(2, '0') + ':00');
  };

  const instantes = AVISOS
    .map(a => {
      let quandoDisparar;
      if (a.noDia) {
        // "É hoje", às 8h. Compromisso de madrugada perde este aviso: mandá-lo
        // depois da hora seria pior que não mandar.
        quandoDisparar = oitoDoDiaDe(inicio);
        if (quandoDisparar > inicio) quandoDisparar = null;
      } else if (temHora) {
        /* Com hora marcada, o aviso da véspera é ancorado no horário do
           próprio compromisso: quem marcou às 19h é avisado às 19h do dia
           anterior. Às 8h da manhã o horário ainda não diz nada a ninguém. */
        quandoDisparar = inicio - a.antes;
      } else {
        // Sem hora não há onde ancorar; 8h da véspera é o padrão.
        quandoDisparar = oitoDoDiaDe(inicio - a.antes);
      }
      return quandoDisparar ? { ...a, quando: quandoDisparar } : null;
    })
    .filter(Boolean)
    .sort((x, y) => x.quando - y.quando);

  const devidos = instantes.filter(a => a.quando <= agora && agora - a.quando <= JANELA);
  const futuros = instantes.filter(a => a.quando > agora);
  return {
    // Se mais de um caiu na janela, manda só o mais próximo do evento: dois
    // e-mails seguidos dizendo coisas diferentes confundem mais que ajudam.
    enviar: devidos.length ? devidos[devidos.length - 1] : null,
    proximo: futuros.length ? futuros[0].quando : null,
  };
}

/* ── Desfecho real de cada envio ──
   A Resend guarda o que aconteceu depois: entregue, devolvido, marcado como
   spam, suprimido. Sem consultar isso, o nosso registro para no aceite e
   afirma o que não sabe — foi assim que "enviado" conviveu com caixa de
   entrada vazia por horas.

   A consulta é barata e limitada: no máximo vinte por rodada, só das entregas
   ainda sem desfecho, e desiste depois de algumas tentativas para não ficar
   perguntando eternamente sobre um e-mail que a Resend já esqueceu. */
const DESFECHO_FINAL = ['delivered', 'bounced', 'complained', 'delivery_delayed', 'canceled'];

async function conferirEntregas(env, log) {
  if (!env.RESEND_API_KEY) return;
  let pendentes;
  try {
    const r = await db(env, 'reminderDeliveries', {
      query: `orderBy=${encodeURIComponent('"status"')}&equalTo=${encodeURIComponent('"aceito"')}&limitToFirst=20`,
    });
    pendentes = r.dados ? Object.entries(r.dados) : [];
  } catch (_) { return; }   // sem índice ainda: não vale derrubar a rodada

  for (const [id, entrega] of pendentes) {
    if (!entrega || !entrega.resendId) continue;
    const tentativas = (Number(entrega.conferencias) || 0) + 1;
    try {
      const r = await fetch('https://api.resend.com/emails/' + entrega.resendId, {
        headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY },
      });
      if (!r.ok) throw new Error('resend ' + r.status);
      const j = await r.json();
      const evento = String(j.last_event || '').toLowerCase();
      const desistir = tentativas >= 6;   // ~30 min de espera pelo desfecho

      if (DESFECHO_FINAL.includes(evento) || (evento && evento !== 'sent' && evento !== 'queued')) {
        await db(env, 'reminderDeliveries/' + id, {
          metodo: 'PATCH', corpo: { status: evento, conferidoEm: Date.now(), conferencias: tentativas },
        });
        if (evento === 'delivered') log.entregues++; else log.naoEntregues++;
      } else {
        await db(env, 'reminderDeliveries/' + id, {
          metodo: 'PATCH',
          corpo: desistir
            ? { status: 'sem_desfecho', conferidoEm: Date.now(), conferencias: tentativas }
            : { conferencias: tentativas },
        });
      }
    } catch (_) {
      await db(env, 'reminderDeliveries/' + id, { metodo: 'PATCH', corpo: { conferencias: tentativas } })
        .catch(() => {});
    }
  }
}

async function processar(env, agora, log) {
  const { dados } = await db(env, 'reminderJobs', {
    query: `orderBy=${encodeURIComponent('"nextRunAt"')}&endAt=${agora}&limitToFirst=${MAX_JOBS}`,
  });
  const jobs = dados ? Object.entries(dados) : [];
  log.encontrados = jobs.length;

  for (const [jobId, job] of jobs) {
    try {
      if (!job || !job.uid || !job.startsAt) {
        await db(env, 'reminderJobs/' + jobId, { metodo: 'DELETE' });
        log.ignorados++;
        continue;
      }
      /* Desligado NÃO é apagado. O compromisso continua existindo, e religar os
         lembretes tem de voltar a avisar sobre ele — apagar aqui obrigaria a
         pessoa a recriar o compromisso para reaver o aviso. Fica adiado. */
      if (job.enabled === false) {
        await db(env, 'reminderJobs/' + jobId + '/nextRunAt', { metodo: 'PUT', corpo: agora + 86400000 });
        log.desligados++;
        continue;
      }

      /* A preferência é conferida agora, e não no que o job guardou: entre a
         criação e este minuto a pessoa pode ter desligado os lembretes, e o
         desligamento tem de valer na hora. */
      const { dados: pref } = await db(env, `users/${job.uid}/private/notif`);
      if (!pref || pref.email !== true) {
        /* Adiar, e não zerar: com nextRunAt = 0 o job voltaria em TODA rodada,
           de cinco em cinco minutos, para sempre — justamente o desperdício
           que esta fila existe para evitar. Um dia à frente basta: ao religar,
           o app reescreve a fila e o aviso volta na hora. */
        await db(env, 'reminderJobs/' + jobId, {
          metodo: 'PATCH', corpo: { enabled: false, nextRunAt: agora + 86400000 },
        });
        log.desligados++;
        continue;
      }

      // O compromisso ainda existe? Apagado no app, o job morre com ele.
      const { dados: evento } = await db(env, `users/${job.uid}/personal/agenda/${job.eventId}`);
      if (!evento || !evento.data) {
        await db(env, 'reminderJobs/' + jobId, { metodo: 'DELETE' });
        log.ignorados++;
        continue;
      }

      const { enviar, proximo } = decidir(job, agora);
      if (!enviar) {
        // Nada devido: só reagenda. Sem próximo aviso, o job já cumpriu o papel.
        if (proximo) await db(env, 'reminderJobs/' + jobId + '/nextRunAt', { metodo: 'PUT', corpo: proximo });
        else await db(env, 'reminderJobs/' + jobId, { metodo: 'DELETE' });
        log.semAviso++;
        continue;
      }

      /* Destinatário: exclusivamente o e-mail da conta dona do UID. O job não
         carrega endereço nenhum, de propósito — com um campo "para" no job,
         qualquer pessoa autenticada poderia usar isto para disparar e-mail
         para terceiros. */
      const { dados: email } = await db(env, `users/${job.uid}/private/email`);
      if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(email))) {
        log.semEmail++;
        if (proximo) await db(env, 'reminderJobs/' + jobId + '/nextRunAt', { metodo: 'PUT', corpo: proximo });
        else await db(env, 'reminderJobs/' + jobId, { metodo: 'DELETE' });
        continue;
      }

      const entregaId = `${job.uid}_${job.eventId}_${enviar.chave}_${job.startsAt}`
        .replace(/[.#$/[\]]/g, '-');
      if (!(await reservarEntrega(env, entregaId))) {
        log.duplicados++;
        if (proximo) await db(env, 'reminderJobs/' + jobId + '/nextRunAt', { metodo: 'PUT', corpo: proximo });
        continue;
      }

      const conteudo = {
        titulo: evento.titulo || 'Compromisso',
        data: evento.data,
        hora: evento.hora || '',
        quando: enviar.chave === 'now' ? 'Começa agora'
              : enviar.chave === 'day' ? 'É hoje' + (evento.hora ? ' às ' + evento.hora : '')
              : 'Começa ' + enviar.texto + (evento.hora ? ', às ' + evento.hora : ''),
      };

      try {
        const idResend = await enviarEmail(env, {
          para: String(email),
          assunto: montarAssunto(enviar, evento.titulo),
          html: montarHtml(env, conteudo),
          texto: montarTexto(env, conteudo),
          chave: entregaId,
        });
        /* "aceito", e não "enviado". A Resend responder 200 significa que ela
           recebeu o pedido — não que a mensagem chegou. A diferença apareceu
           na prática: com o endereço na lista de supressão dela, o pedido é
           aceito, o registro dizia "enviado" e nenhum e-mail existia. O
           desfecho real é conferido na rodada seguinte, em conferirEntregas. */
        await db(env, 'reminderDeliveries/' + entregaId, {
          metodo: 'PATCH',
          corpo: { status: 'aceito', aceitoEm: Date.now(), resendId: idResend, conferencias: 0 },
        });
        log.enviados++;
        if (proximo) await db(env, 'reminderJobs/' + jobId + '/nextRunAt', { metodo: 'PUT', corpo: proximo });
        else await db(env, 'reminderJobs/' + jobId, { metodo: 'DELETE' });
      } catch (e) {
        const tentativas = (Number(job.attempts) || 0) + 1;
        const desiste = !e.temporario || tentativas >= MAX_TENTATIVAS;
        await db(env, 'reminderDeliveries/' + entregaId, {
          metodo: 'PATCH',
          corpo: { status: desiste ? 'failed' : 'retry', attempts: tentativas, erro: String(e.message || '') },
        });
        if (desiste) {
          // Erro definitivo não pode virar laço: segue para o próximo aviso.
          if (proximo) await db(env, 'reminderJobs/' + jobId + '/nextRunAt', { metodo: 'PUT', corpo: proximo });
          else await db(env, 'reminderJobs/' + jobId, { metodo: 'DELETE' });
        } else {
          // Recuo progressivo, para não martelar a Resend fora do ar.
          const espera = Math.min(30, 2 ** tentativas) * 60000;
          await db(env, 'reminderJobs/' + jobId, {
            metodo: 'PATCH', corpo: { nextRunAt: agora + espera, attempts: tentativas },
          });
        }
        log.erros++;
      }
    } catch (e) {
      log.erros++;
      // Sem detalhe do usuário no log: id do job já basta para investigar.
      console.warn('job', jobId, String(e.message || e).slice(0, 120));
    }
  }
}

export default {
  async scheduled(controller, env, ctx) {
    const inicio = Date.now();
    const log = { encontrados: 0, enviados: 0, ignorados: 0, desligados: 0,
                  semAviso: 0, semEmail: 0, duplicados: 0, erros: 0,
                  entregues: 0, naoEntregues: 0 };
    try {
      assertSafeCollabEnvironment(env);
      await processar(env, controller.scheduledTime || Date.now(), log);
      // Depois de enviar, conferir o que a Resend fez com os envios anteriores.
      await conferirEntregas(env, log);
    } catch (e) {
      console.error('rodada falhou:', String(e.message || e).slice(0, 160));
    }
    console.log('lembretes', JSON.stringify({ ...log, ms: Date.now() - inicio }));
  },

  /* Sem rota que envie e-mail. A rota pública de teste que existia durante a
     integração saiu: uma URL que dispara e-mail ao ser aberta é um disparador
     aberto na internet, e basta alguém achar o endereço. O que sobra é um
     sinal de vida, sem dado de ninguém. */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        servico: 'mydesk-collab-reminders',
        versao: VERSAO,
        avisos: AVISOS.map(a => a.chave),   // confere a política sem abrir o editor
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Not found', { status: 404 });
  },
};
