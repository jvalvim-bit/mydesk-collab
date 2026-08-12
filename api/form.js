// api/form.js — formulários públicos do MyDesk.
//
// POR QUE ISTO É UM ENDPOINT, e não o navegador falando direto com o banco
// Quem responde um formulário NÃO tem conta no MyDesk: é o cliente do outro
// lado, que recebeu um link. Para o navegador dele ler a definição e gravar a
// resposta direto no Realtime Database, seria preciso abrir esses dois nós a
// quem não está autenticado — e regra aberta a "todo mundo" não distingue o
// cliente respondendo de alguém varrendo o banco. Aqui a service account faz o
// acesso (ela ignora as regras) e o RTDB continua fechado por completo.
//
// O que esta função aceita:
//   GET  ?id=…                    → devolve a definição pública do formulário
//   POST { id, valores, arquivo } → grava uma resposta (sem login)
//   POST { acao:'enviarLink', … } → manda o link por e-mail (exige login e ser
//                                   o dono do formulário)
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertEmailEnabled, assertSafeFirebaseEnvironment } = require('../lib/collab-safety');
const brazil = require('../lib/brazil-services');
const {
  clientFromResponse,
  resolveClientDestination,
  safeFirebaseKey,
} = require('../lib/form-clients');
/* O MESMO gerador que o navegador usa para o botão "Baixar PDF". É de
   propósito: o arquivo que quem recruta baixa e o que o candidato recebe
   anexado têm de ser o mesmo documento, e duas implementações separadas
   divergem no primeiro ajuste que alguém fizer de um lado só. */
const propostaPdf = require('../docs/js/proposta-pdf.js');

const MAX_RESPOSTAS   = 500;              // por formulário
const MAX_TEXTO       = 300;              // campo curto
const MAX_LONGO       = 4000;             // campo de texto longo
/* 5 MB de arquivo. O teto é medido no dataURL, que é base64 e ocupa cerca de
   um terço a mais que o arquivo original — daí os 7 milhões de caracteres para
   5 MB reais. Vale lembrar que isto vai para o Realtime Database como texto:
   cada anexo de 5 MB pesa ~7 MB no banco e é lido inteiro junto da resposta. */
const MAX_ARQUIVO     = 7_000_000;
/* A foto do candidato. Ela chega da página pública já recortada em 128×128 e
   gravada como JPEG — cerca de 6 KB. O teto de 400 mil caracteres é folgado de
   propósito: serve de trava contra quem manda o corpo do POST na mão, não de
   régua para o navegador honesto. Ele precisa continuar pequeno porque esta
   imagem viaja DENTRO da resposta, e a resposta é lida inteira. */
const MAX_FOTO        = 400_000;
const MAX_DESTINOS    = 10;               // e-mails por envio de link
/* Avisos de etapa por pessoa, por dia. Não é para conter abuso de quem paga —
   é para que um laço acidental na interface não queime a cota diária do
   provedor de e-mail, que é da conta inteira e não deste usuário. Um processo
   seletivo grande move algumas dezenas de candidatos por dia; 40 cabe nisso e
   não cabe num laço. */
const MAX_AVISOS_DIA  = 40;
const MAX_RECADO      = 600;              // recado escrito à mão no aviso
const ESCOLARIDADES = [
  'Ensino fundamental incompleto', 'Ensino fundamental completo',
  'Ensino médio incompleto', 'Ensino médio completo',
  'Ensino superior incompleto', 'Ensino superior completo',
  'Pós-graduação', 'Mestrado', 'Doutorado', 'Prefiro não informar',
];
const ESTADOS_CIVIS = [
  'Solteiro(a)', 'Casado(a)', 'União estável', 'Separado(a)',
  'Divorciado(a)', 'Viúvo(a)', 'Prefiro não informar',
];
const DATA_SAO_PAULO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dataCivilSaoPauloIso(agora = new Date()) {
  const partes = {};
  DATA_SAO_PAULO.formatToParts(agora).forEach(({ type, value }) => {
    if (type !== 'literal') partes[type] = value;
  });
  return `${partes.year}-${partes.month}-${partes.day}`;
}

const ALLOWED_ORIGINS = [
  'https://mydesk.social',
  'https://jvalvim-bit.github.io',
  'https://mydesk-eta.vercel.app',
];

const BRAZIL_CACHE = {
  cep: 'public, s-maxage=2592000, stale-while-revalidate=86400',
  cnpj: 'public, s-maxage=86400, stale-while-revalidate=3600',
  estados: 'public, s-maxage=2592000, stale-while-revalidate=86400',
  municipios: 'public, s-maxage=2592000, stale-while-revalidate=86400',
  bancos: 'public, s-maxage=604800, stale-while-revalidate=86400',
  ddd: 'public, s-maxage=2592000, stale-while-revalidate=86400',
  feriados: 'public, s-maxage=31536000, stale-while-revalidate=86400',
};

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function consultarBrasil(req, res) {
  const recurso = String(req.query?.recurso || '').trim().toLowerCase();
  try {
    let data;
    if (recurso === 'cep') data = await brazil.lookupCep(req.query?.cep);
    else if (recurso === 'cnpj') data = await brazil.lookupCnpj(req.query?.cnpj);
    else if (recurso === 'estados') data = await brazil.listStates();
    else if (recurso === 'municipios') data = await brazil.listCities(req.query?.uf);
    else if (recurso === 'bancos') data = await brazil.listBanks();
    else if (recurso === 'ddd') data = await brazil.lookupDdd(req.query?.ddd);
    else if (recurso === 'feriados') data = await brazil.listHolidays(req.query?.ano);
    else return res.status(400).json({ error: 'Consulta inválida.' });

    res.setHeader('Cache-Control', BRAZIL_CACHE[recurso] || 'public, s-maxage=3600');
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    const status = Number(error.status) || 502;
    if (status >= 500) console.error('brasil:', recurso, error.message);
    return res.status(status).json({
      error: error.message || 'Não foi possível realizar a consulta.',
      code: error.code || 'UPSTREAM_ERROR',
    });
  }
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

async function dbGet(path) {
  const t = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${t}`);
  if (!r.ok) throw new Error(`DB GET ${path} ${r.status}`);
  return r.json();
}
async function dbPush(path, valor) {
  const t = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${t}`,
    { method: 'POST', body: JSON.stringify(valor) });
  if (!r.ok) throw new Error(`DB PUSH ${path} ${r.status}`);
  return r.json();   // { name: "<pushId>" }
}
async function dbRemove(path) {
  const t = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${t}`,
    { method: 'DELETE' });
  if (!r.ok) throw new Error(`DB DELETE ${path} ${r.status}`);
}
async function dbPut(path, valor) {
  const t = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${t}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valor),
    });
  if (!r.ok) throw new Error(`DB PUT ${path} ${r.status}`);
  return r.json();
}

/* ═══════════════════════════════════════════════════════════════════════
   O PAPEL TIMBRADO DOS E-MAILS
   ═══════════════════════════════════════════════════════════════════════
   Cada e-mail daqui montava o próprio HTML: uma `div` com Arial e alguns
   parágrafos. Chegava sem marca, sem cartão, sem nada — do lado de quem
   recebe, indistinguível de mensagem automática de sistema qualquer. E o
   contraste era visível dentro do próprio produto: o lembrete de compromisso,
   que sai pelo Worker do Cloudflare, sempre teve cabeçalho com a marca. Dois
   caminhos de envio, duas caras.

   Agora existe UM envelope, e todo e-mail passa por ele. O interior continua
   sendo o de cada mensagem — o que muda é a moldura.

   POR QUE TABELA E ESTILO NA MARRA: cliente de e-mail não é navegador. Gmail,
   Outlook e Apple Mail descartam `<style>`, ignoram flex e grid, e o Outlook
   ainda usa o motor do Word para renderizar. Tabela com atributos e style
   inline é o que funciona nos três — é feio de escrever e é o que chega
   inteiro do outro lado.

   A LOGO VAI POR URL, e não embutida. Parte dos clientes bloqueia imagem
   remota até a pessoa liberar, e nesse caso o `alt` mostra "MyDesk" — que é
   melhor do que anexar a imagem em toda mensagem e ela aparecer como arquivo
   junto do PDF que de fato importa. É também o que o Worker já faz, e o
   endereço é o mesmo. */
function _emailEnvelope(interior, o) {
  o = o || {};
  const app = process.env.APP_URL || 'http://localhost:3000';
  const logo = process.env.LOGO_URL || (app + '/img/logo-mydesk.png?v=3');
  const chapeu = o.chapeu
    ? `<p style="margin:0 0 10px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#6b6b7b;">${esc(o.chapeu)}</p>`
    : '';
  const pe = o.rodape
    ? `<p style="margin:22px 0 0;font-size:12px;color:#8a8a99;line-height:1.6;">${o.rodape}</p>`
    : '';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px 12px;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e4e4ea;">
    <tr><td style="padding:26px 30px 0;">
      <img src="${esc(logo)}" alt="MyDesk" width="132" style="display:block;border:0;max-width:132px;height:auto;">
    </td></tr>
    <tr><td style="padding:20px 30px 28px;color:#14141c;font-size:15px;line-height:1.6;">
      ${chapeu}${interior}${pe}
    </td></tr>
  </table>
  <p style="max-width:560px;margin:14px auto 0;font-size:11px;color:#9a9aa8;text-align:center;">
    Enviado pelo MyDesk · <a href="${esc(app)}" style="color:#9a9aa8;">${esc(app.replace(/^https?:\/\//, ''))}</a>
  </p>
</body></html>`;
}

function emailConfiguration() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM || '').trim();
  const enabled = process.env.MYDESK_ENABLE_EMAIL === '1';
  const productionFrom = /@(?:[a-z0-9-]+\.)?mydesk\.social\b/i.test(from);
  return {
    apiKey,
    from,
    configured: Boolean(enabled && apiKey && from && !productionFrom),
    missing: [
      !enabled ? 'MYDESK_ENABLE_EMAIL=1' : null,
      !apiKey ? 'RESEND_API_KEY' : null,
      !from ? 'RESEND_FROM' : null,
      productionFrom ? 'RESEND_FROM de desenvolvimento' : null,
    ].filter(Boolean),
  };
}

/* Erro de envio que a interface precisa distinguir. `indisponivel` marca o que
   não adianta tentar de novo agora — cota do mês esgotada, limite por segundo,
   provedor fora do ar. Quem está do outro lado não tem o que fazer com esse
   detalhe, e expor "acabou a cota" conta da nossa operação mais do que ajuda
   quem só queria mandar um link. */
class ErroEnvioEmail extends Error {
  constructor(mensagem, indisponivel) {
    super(mensagem);
    this.name = 'ErroEnvioEmail';
    this.indisponivel = !!indisponivel;
  }
}

async function enviarEmail(para, assunto, html, opcoes) {
  const config = emailConfiguration();
  if (!config.configured) {
    throw new ErroEnvioEmail(`${config.missing.join(' e ')} ausente`, true);
  }
  assertEmailEnabled();
  const anexos = Array.isArray(opcoes?.anexos) ? opcoes.anexos : null;
  /* `reply_to` existe para o aviso ao candidato. O remetente é um endereço de
     sistema que não lê resposta nenhuma, e um e-mail sobre processo seletivo é
     exatamente o tipo de mensagem que a pessoa responde ("posso remarcar?").
     Sem isto, a resposta dela cai no vazio e ela conclui que ninguém leu. */
  const responderPara = String(opcoes?.responderPara || '').trim();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + config.apiKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: para, subject: assunto, html,
      ...(responderPara ? { reply_to: responderPara } : {}),
      ...(anexos && anexos.length ? { attachments: anexos } : {}),
    }),
  });
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 200);
    /* 429 é limite de envio; 402 é cobrança; 403 costuma vir com "quota" ou
       "limit" no corpo quando o teto do plano estourou. Tudo isso é a mesma
       coisa para quem clicou no botão: agora não dá, tente daqui a pouco. */
    const semCota = r.status === 429 || r.status === 402 ||
                    (r.status === 403 && /quota|limit|exceed/i.test(corpo));
    throw new ErroEnvioEmail('resend ' + r.status + ' ' + corpo, semCota || r.status >= 500);
  }
}

/* Escapa para HTML de e-mail. O nome e as respostas vêm de quem preencheu o
   formulário — texto de estranho não entra em markup sem passar por aqui. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════════════════
   O AVISO DE ETAPA AO CANDIDATO
   ═══════════════════════════════════════════════════════════════════════
   Quem se candidata fica no escuro. O funil do MyDesk sabe exatamente em que
   etapa a pessoa está, e ela é a única que não sabe — o silêncio depois de uma
   entrevista é a queixa mais comum de quem procura emprego. Mover o cartão
   passa a poder mover também um e-mail.

   O TEXTO É DAQUI, e não do navegador. Se o corpo do e-mail viesse pronto do
   cliente, qualquer conta autenticada teria um servidor de envio com o domínio
   do MyDesk no remetente — é assim que um domínio vai para lista de bloqueio.
   O que o cliente manda são DADOS: quem, qual etapa, e um recado opcional que
   entra escapado, num parágrafo próprio.

   O DESTINATÁRIO TAMBÉM É DAQUI. O e-mail sai da ficha lida no banco, nunca de
   um endereço enviado no corpo do pedido — e a ficha só é lida depois de
   confirmar que quem pede pertence ao workspace onde ela mora. Na prática:
   só dá para escrever a quem já é candidato seu. */
const AVISO_TEXTOS = {
  pt: {
    chapeu:    'Processo seletivo',
    assunto:   'Sua candidatura {vaga}',
    ola:       'Olá, {nome}',
    avanco:    'Sua candidatura avançou para a etapa <b>{etapa}</b>.',
    atual:     'Sua candidatura está agora na etapa <b>{etapa}</b>.',
    fim:       'Você concluiu todas as etapas do processo seletivo.',
    vagaLinha: 'Vaga: {vaga}',
    rodape:    'Enviado por {quem} pelo MyDesk. Responda a este e-mail para falar com quem cuida do processo.',
  },
  en: {
    chapeu:    'Hiring process',
    assunto:   'Your application {vaga}',
    ola:       'Hi, {nome}',
    avanco:    'Your application has moved forward to the <b>{etapa}</b> stage.',
    atual:     'Your application is now at the <b>{etapa}</b> stage.',
    fim:       'You have completed every stage of the hiring process.',
    vagaLinha: 'Role: {vaga}',
    rodape:    'Sent by {quem} through MyDesk. Reply to this email to reach the person running the process.',
  },
  es: {
    chapeu:    'Proceso de selección',
    assunto:   'Tu candidatura {vaga}',
    ola:       'Hola, {nome}',
    avanco:    'Tu candidatura avanzó a la etapa <b>{etapa}</b>.',
    atual:     'Tu candidatura está ahora en la etapa <b>{etapa}</b>.',
    fim:       'Completaste todas las etapas del proceso de selección.',
    vagaLinha: 'Vacante: {vaga}',
    rodape:    'Enviado por {quem} mediante MyDesk. Responde a este correo para hablar con quien lleva el proceso.',
  },
};

function _preencher(modelo, vars) {
  return String(modelo).replace(/\{(\w+)\}/g,
    (achado, k) => (vars[k] !== undefined ? vars[k] : achado));
}

/* `etapa` e `recado` são os dois pedaços escritos por gente e vão para dentro
   de markup — os dois passam por `esc` ANTES de chegar aqui, e o `<b>` dos
   modelos acima é o único HTML que a mensagem carrega. */
function corpoDoAviso(idioma, dados) {
  const T = AVISO_TEXTOS[idioma] || AVISO_TEXTOS.pt;
  const linha = dados.situacao === 'fim' ? T.fim
              : dados.situacao === 'volta' ? _preencher(T.atual, dados)
              : _preencher(T.avanco, dados);
  return {
    assunto: _preencher(T.assunto, { vaga: dados.vaga ? '— ' + dados.vaga : '' }).trim(),
    html: _emailEnvelope(`
        <p style="margin:0 0 14px">${_preencher(T.ola, dados)},</p>
        <p style="margin:0 0 14px;font-size:16px">${linha}</p>
        ${dados.vaga ? `<p style="margin:0 0 14px;color:#555">${_preencher(T.vagaLinha, dados)}</p>` : ''}
        ${dados.recado ? `<p style="margin:0 0 14px;white-space:pre-wrap;border-left:3px solid #6366f1;
           padding-left:12px;color:#333">${dados.recado}</p>` : ''}`,
      { chapeu: T.chapeu, rodape: _preencher(T.rodape, dados) }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   A CARTA DE PROPOSTA
   ═══════════════════════════════════════════════════════════════════════
   Texto e destinatário são DAQUI, como em todo e-mail que o MyDesk manda
   para fora. O navegador informa o candidato e o idioma; o resto sai da
   proposta gravada na ficha.

   O e-mail é curto de propósito: o documento é o anexo, e um corpo que
   repete a proposta inteira só cria duas versões da mesma coisa — e a que
   vale é a que tem linha de assinatura. */
const CARTA_TEXTOS = {
  pt: {
    chapeu: 'Proposta de trabalho',
    assunto: 'Proposta de trabalho — {empresa}',
    ola: 'Olá, {nome}',
    corpo: 'Segue em anexo a nossa proposta de trabalho, em PDF.',
    comoAceitar: 'Para aceitar, assine no campo indicado e devolva o arquivo para <b>{email}</b>{prazo}.',
    ate: ' até {data}',
    duvidas: 'Qualquer dúvida, é só responder a este e-mail.',
    arquivo: 'Proposta',
    saudacao: 'Prezada(o) {nome},',
    titulo: 'Proposta de Contratação',
    linhaVaga: 'Vaga de {vaga}',
    p1: 'Obrigado por todo o cuidado e o tempo que você dedicou ao nosso processo seletivo. Conversamos com muita gente boa, e a sua trajetória foi a que mais se aproximou do que procurávamos.',
    p2: 'É com muita satisfação que convidamos você a fazer parte da nossa equipe{cargo}.',
    p3: 'No dia a dia, você vai {atividades}',
    p4: 'Ficaríamos felizes em ter você conosco a partir de {inicio}. Abaixo estão as condições que combinamos. Se algo aqui não corresponder ao que conversamos, por favor, informe antes de assinar; preferimos acertar agora do que começar com dúvida.',
    p5: 'Esperamos a sua resposta com expectativa, e desde já damos as boas-vindas.',
    aCombinar: 'data a combinar',
    comoCargo: ' como {cargo}',
    tituloCondicoes: 'CONDIÇÕES DA PROPOSTA',
    responder: 'Para aceitar, assine no campo abaixo e devolva este documento para {email}{prazo}. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.',
    responderSemEmail: 'Para aceitar, assine no campo abaixo e devolva este documento a quem enviou esta proposta. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.',
    fecho: 'Atenciosamente,',
    assinatura: 'Assinatura do(a) candidato(a)',
    dataLinha: 'Data:  ___/___/______',
    rodape: 'Documento gerado pelo MyDesk em {data}.',
    rotulos: { cargo: 'Cargo', salario: 'Salário', beneficios: 'Benefícios',
               contrato: 'Modalidade', jornada: 'Jornada', inicio: 'Data de início',
               atividades: 'O que você vai fazer' },
  },
  en: {
    chapeu: 'Job offer',
    assunto: 'Job offer — {empresa}',
    ola: 'Hi, {nome}',
    corpo: 'Please find our job offer attached, as a PDF.',
    comoAceitar: 'To accept, sign in the marked field and send the file back to <b>{email}</b>{prazo}.',
    ate: ' by {data}',
    duvidas: 'Any questions, just reply to this email.',
    arquivo: 'Offer',
    saudacao: 'Dear {nome},',
    titulo: 'Offer of Employment',
    linhaVaga: 'Opening for {vaga}',
    p1: 'Thank you for the care and the time you gave our hiring process. We met a lot of great people, and your track record came closest to what we were looking for.',
    p2: 'It is with great pleasure that we invite you to join our team{cargo}.',
    p3: 'Day to day, you will {atividades}',
    p4: 'We would be glad to have you with us from {inicio}. The terms we agreed on are below. If anything here does not match what we discussed, please say so before signing; we would rather sort it out now than start with a doubt.',
    p5: 'We look forward to your answer, and welcome aboard in advance.',
    aCombinar: 'a date to be agreed',
    comoCargo: ' as {cargo}',
    tituloCondicoes: 'OFFER TERMS',
    responder: 'To accept, sign below and send this document back to {email}{prazo}. We look forward to your answer, and welcome aboard in advance.',
    responderSemEmail: 'To accept, sign below and send this document back to whoever sent you this offer. We look forward to your answer, and welcome aboard in advance.',
    fecho: 'Best regards,',
    assinatura: 'Signature of the candidate',
    dataLinha: 'Date:  ___/___/______',
    rodape: 'Document generated by MyDesk on {data}.',
    rotulos: { cargo: 'Role', salario: 'Salary', beneficios: 'Benefits',
               contrato: 'Contract', jornada: 'Working hours', inicio: 'Start date',
               atividades: 'What you will do' },
  },
  es: {
    chapeu: 'Propuesta de trabajo',
    assunto: 'Propuesta de trabajo — {empresa}',
    ola: 'Hola, {nome}',
    corpo: 'Adjuntamos nuestra propuesta de trabajo, en PDF.',
    comoAceitar: 'Para aceptar, firma en el campo indicado y devuelve el archivo a <b>{email}</b>{prazo}.',
    ate: ' hasta {data}',
    duvidas: 'Cualquier duda, responde a este correo.',
    arquivo: 'Propuesta',
    saudacao: 'Estimada(o) {nome}:',
    titulo: 'Propuesta de Contratación',
    linhaVaga: 'Vacante de {vaga}',
    p1: 'Gracias por todo el cuidado y el tiempo que dedicaste a nuestro proceso de selección. Conversamos con mucha gente valiosa, y tu trayectoria fue la que más se acercó a lo que buscábamos.',
    p2: 'Es con mucha satisfacción que te invitamos a formar parte de nuestro equipo{cargo}.',
    p3: 'En el día a día, vas a {atividades}',
    p4: 'Nos encantaría tenerte con nosotros a partir de {inicio}. Abajo están las condiciones que acordamos. Si algo aquí no corresponde a lo que conversamos, por favor, avísanos antes de firmar; preferimos ajustarlo ahora que empezar con una duda.',
    p5: 'Esperamos tu respuesta con entusiasmo, y desde ya te damos la bienvenida.',
    aCombinar: 'una fecha a acordar',
    comoCargo: ' como {cargo}',
    tituloCondicoes: 'CONDICIONES DE LA PROPUESTA',
    responder: 'Para aceptar, firma abajo y devuelve este documento a {email}{prazo}. Esperamos tu respuesta con entusiasmo, y desde ya te damos la bienvenida.',
    responderSemEmail: 'Para aceptar, firma abajo y devuelve este documento a quien te envió esta propuesta. Esperamos tu respuesta con entusiasmo, y desde ya te damos la bienvenida.',
    fecho: 'Atentamente,',
    assinatura: 'Firma del candidato(a)',
    dataLinha: 'Fecha:  ___/___/______',
    rodape: 'Documento generado por MyDesk el {data}.',
    rotulos: { cargo: 'Puesto', salario: 'Salario', beneficios: 'Beneficios',
               contrato: 'Modalidad', jornada: 'Jornada', inicio: 'Fecha de inicio',
               atividades: 'Qué vas a hacer' },
  },
};

/* O e-mail que leva o recibo. Curto de proposito: o documento e o anexo, e o
   corpo so precisa dizer o que e, de quem veio e o que fazer com ele. */
/* O e-mail de cobranca. Firme e educado: uma cobranca que se desculpa por
   existir nao e levada a serio, e uma que ameaca queima o cliente por uma
   fatura. Ele diz o que esta em aberto, desde quando, e deixa o resto para o
   recado que a pessoa escreve. */
const COBRANCA_TEXTOS = {
  pt: {
    chapeu: 'Cobranca',
    assunto: 'Valor em aberto: {valor} — {emitente}',
    ola: 'Ola, {nome}!',
    atrasado: 'Passando para lembrar de {valor}, com vencimento em {data} — {dias} dias atras.',
    noPrazo: 'Passando para lembrar de {valor}, com vencimento em {data}.',
    semData: 'Passando para lembrar de {valor}, ainda em aberto.',
    parcial: 'Deste contrato de {total}, ja recebemos {pago} — resta o valor acima.',
    referente: 'Referente a: {ref}',
    fecho: 'Se ja tiver sido pago, e so desconsiderar e nos avisar. Qualquer duvida, e so responder este e-mail.',
  },
  en: {
    chapeu: 'Payment reminder',
    assunto: 'Outstanding amount: {valor} — {emitente}',
    ola: 'Hi, {nome}!',
    atrasado: 'A reminder about {valor}, due on {data} — {dias} days ago.',
    noPrazo: 'A reminder about {valor}, due on {data}.',
    semData: 'A reminder about {valor}, still outstanding.',
    parcial: 'Of this {total} contract, {pago} has come in — the amount above is what remains.',
    referente: 'For: {ref}',
    fecho: 'If it has already been paid, please disregard this and let us know. Any questions, just reply to this email.',
  },
  es: {
    chapeu: 'Cobro',
    assunto: 'Importe pendiente: {valor} — {emitente}',
    ola: 'Hola, {nome}!',
    atrasado: 'Un recordatorio de {valor}, con vencimiento el {data} — hace {dias} dias.',
    noPrazo: 'Un recordatorio de {valor}, con vencimiento el {data}.',
    semData: 'Un recordatorio de {valor}, aun pendiente.',
    parcial: 'De este contrato de {total}, ya recibimos {pago} — resta el importe de arriba.',
    referente: 'Referente a: {ref}',
    fecho: 'Si ya fue pagado, ignora este mensaje y avisanos. Cualquier duda, responde a este correo.',
  },
};

const RECIBO_TEXTOS = {
  pt: {
    chapeu: 'Recibo',
    assunto: 'Recibo {numero} — {emitente}',
    ola: 'Ola, {nome}',
    corpo: 'Segue em anexo o recibo de {valor}, referente a {referente}, emitido por {emitente}.',
    assine: 'O documento tem duas linhas de assinatura. Assine a sua e devolva uma via para {resposta}.',
    assineSemEmail: 'O documento tem duas linhas de assinatura. Assine a sua e devolva uma via a quem enviou este recibo.',
    rodape: 'Guarde este recibo: ele e a sua prova de pagamento.',
  },
  en: {
    chapeu: 'Receipt',
    assunto: 'Receipt {numero} — {emitente}',
    ola: 'Hi, {nome}',
    corpo: 'Please find attached the receipt for {valor}, for {referente}, issued by {emitente}.',
    assine: 'The document has two signature lines. Sign yours and send a copy back to {resposta}.',
    assineSemEmail: 'The document has two signature lines. Sign yours and send a copy back to whoever sent you this receipt.',
    rodape: 'Keep this receipt: it is your proof of payment.',
  },
  es: {
    chapeu: 'Recibo',
    assunto: 'Recibo {numero} — {emitente}',
    ola: 'Hola, {nome}',
    corpo: 'Adjuntamos el recibo de {valor}, referente a {referente}, emitido por {emitente}.',
    assine: 'El documento tiene dos lineas de firma. Firma la tuya y devuelve una via a {resposta}.',
    assineSemEmail: 'El documento tiene dos lineas de firma. Firma la tuya y devuelve una via a quien te envio este recibo.',
    rodape: 'Guarda este recibo: es tu comprobante de pago.',
  },
};

const CONTRATO_ROTULO = {
  clt: 'CLT', pj: 'PJ', estagio: 'Estágio', temporario: 'Temporário',
  freelancer: 'Freelancer', aprendiz: 'Jovem aprendiz', outro: 'Outro',
};

function _dataLegivel(iso, idioma) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const [a, m, d] = iso.split('-');
  const local = idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR';
  try {
    return new Intl.DateTimeFormat(local, { day: '2-digit', month: 'long', year: 'numeric' })
      .format(new Date(Date.UTC(Number(a), Number(m) - 1, Number(d), 12)));
  } catch (_) { return `${d}/${m}/${a}`; }
}

function _moeda(valor, idioma) {
  const n = Number(valor) || 0;
  if (!n) return '';
  const local = idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR';
  try {
    return new Intl.NumberFormat(local, { style: 'currency', currency: 'BRL' }).format(n);
  } catch (_) { return 'R$ ' + n.toFixed(2); }
}

function _nomeArquivo(base, nome) {
  const limpo = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${base}-${limpo || 'candidato'}.pdf`;
}

/* A marca do papel timbrado, lida do disco uma vez por instância. É o MESMO
   arquivo que o navegador busca para o PDF baixado — o documento que a pessoa
   vê antes de enviar e o que chega ao candidato têm de ser o mesmo papel.
   Falhar aqui não derruba o envio: sai sem a marca. */
let _marcaCache;
function _marcaDoPapel() {
  if (_marcaCache !== undefined) return _marcaCache;
  try {
    _marcaCache = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'docs', 'img', 'logo-proposta.png'));
  } catch (e) {
    console.warn('form: marca do papel não lida —', e.message);
    _marcaCache = null;
  }
  return _marcaCache;
}

function cartaDaProposta(idioma, ficha, proposta) {
  const T = CARTA_TEXTOS[idioma] || CARTA_TEXTOS.pt;
  const nome = String(ficha.name || '').slice(0, 120);
  const cargo = String(proposta.cargo || (ficha.campos && ficha.campos.vaga) || '').slice(0, 120);
  const empresa = String(proposta.empresa || proposta.responsavel || 'MyDesk').slice(0, 80);
  const emailResposta = String(proposta.emailResposta || '').slice(0, 160);
  const prazoTexto = proposta.prazo
    ? _preencher(T.ate, { data: _dataLegivel(proposta.prazo, idioma) }) : '';

  const atividades = String(proposta.descricao || '').slice(0, 900);
  const documento = {
    /* O MESMO papel que sai pelo botão de baixar, com o mesmo texto: é o
       modelo que ela desenhou no Word, e o que muda aqui é só o que depende
       de dado. Duas versões do documento — uma na tela, outra no e-mail — é
       divergência que ninguém percebe até um candidato receber a errada. */
    titulo: T.titulo,
    linhaVaga: cargo ? _preencher(T.linhaVaga, { vaga: cargo }) : '',
    logo: _marcaDoPapel(),
    saudacao: _preencher(T.saudacao, { nome }),
    paragrafos: [
      T.p1,
      _preencher(T.p2, { cargo: cargo ? _preencher(T.comoCargo, { cargo }) : '' }),
      _preencher(T.p4, {
        inicio: _dataLegivel(proposta.inicio, idioma) || T.aCombinar }),
    ],
    tituloCondicoes: T.tituloCondicoes,
    condicoes: [
      [T.rotulos.cargo, cargo],
      [T.rotulos.salario, _moeda(proposta.salario, idioma)],
      [T.rotulos.beneficios, String(proposta.beneficios || '').slice(0, 200)],
      [T.rotulos.contrato, CONTRATO_ROTULO[proposta.contrato] || ''],
      [T.rotulos.jornada, String(proposta.jornada || '').slice(0, 120)],
      [T.rotulos.inicio, _dataLegivel(proposta.inicio, idioma)],
      /* O que a pessoa vai fazer e dado, e nao frase: como paragrafo, um campo
         preenchido com "Software" virava "No dia a dia, voce vai Software.".
         Nenhum molde de frase sobrevive a todo texto que cabe num campo livre. */
      [T.rotulos.atividades, atividades],
    ],
    paragrafosFinais: [
      emailResposta
        ? _preencher(T.responder, { email: emailResposta, prazo: prazoTexto })
        : T.responderSemEmail,
    ],
    rotuloAssinatura: T.assinatura,
    rotuloData: T.dataLinha,
  };

  return {
    documento,
    arquivo: _nomeArquivo(T.arquivo, nome),
    assunto: _preencher(T.assunto, { empresa }),
    html: _emailEnvelope(`
        <p style="margin:0 0 14px">${_preencher(esc(T.ola), { nome: esc(nome) })},</p>
        <p style="margin:0 0 14px;font-size:16px">${esc(T.corpo)}</p>
        <p style="margin:0 0 14px">${_preencher(T.comoAceitar, {
          email: esc(emailResposta), prazo: esc(prazoTexto) })}</p>`,
      { chapeu: T.chapeu, rodape: esc(T.duvidas) }),
  };
}

/* Teto diário por pessoa, em leitura e escrita simples. Não é transação: duas
   abas enviando ao mesmo tempo podem passar um aviso do teto, e isso não é
   problema nenhum — o teto existe contra laço, não contra concorrência. */
async function consumirCotaDeAviso(uid, hoje) {
  const caminho = `avisosCandidato/${uid}`;
  let atual = null;
  try { atual = await dbGet(caminho); } catch (_) { atual = null; }
  const usados = atual && atual.dia === hoje ? Number(atual.n) || 0 : 0;
  if (usados >= MAX_AVISOS_DIA) return false;
  try { await dbPut(caminho, { dia: hoje, n: usados + 1 }); } catch (_) {}
  return true;
}

/* A definição que vai para a página pública NÃO é o objeto do banco: ele traz
   o dono, o quadro de origem, as respostas já recebidas e o e-mail de quem
   criou. Nada disso é da conta de quem responde. */
function definicaoPublica(f, id) {
  return {
    id,
    titulo:    String(f.titulo || 'Formulário').slice(0, 120),
    descricao: String(f.descricao || '').slice(0, 400),
    tema:      f.tema || {},
    campos: (f.campos || []).map(c => ({
      id: String(c.id || ''),
      tipo: String(c.tipo || 'texto'),
      rotulo: String(c.rotulo || '').slice(0, 120),
      obrigatorio: !!c.obrigatorio,
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.slice(0, 20).map(o => String(o).slice(0, 80)) : [],
    })),
  };
}

/* Valida a resposta CONTRA A DEFINIÇÃO, não contra o que o cliente mandou:
   o corpo do POST é de quem quiser, então campo que não existe no formulário é
   descartado em silêncio, e obrigatório que faltou barra o envio. */
/* A resposta traz alguma coisa?
   A trava existe para barrar envio vazio — não para exigir TEXTO. O anexo
   viaja em `body.arquivo` e nunca em `valores`, então um formulário cujo ÚNICO
   campo é o arquivo chegava aqui com valores={} e era recusado com "Preencha
   ao menos um campo" mesmo com o currículo anexado: impossível de enviar, e
   sem nenhuma pista na tela do porquê. É o mesmo erro que o campo de arquivo
   obrigatório já tinha cometido um passo antes (ver validarValores logo
   abaixo): tratar o anexo como se não fosse conteúdo. Um arquivo é conteúdo.
   A foto entra pela mesma porta e pelo mesmo motivo: ela também não viaja em
   `valores`, e uma candidatura que trouxe só o rosto trouxe alguma coisa. */
function respostaTemConteudo(valores, anexo, foto) {
  return Object.keys(valores || {}).length > 0 || !!anexo || !!foto;
}

function validarValores(campos, recebidos, agora = new Date()) {
  const valores = {};
  for (const c of campos) {
    /* Anexo não passa por aqui. O arquivo viaja em `body.arquivo`, e nunca em
       `valores` — então um campo de arquivo marcado como obrigatório caía no
       teste de "campo vazio" e devolvia 'Preencha "Arquivos"' mesmo com o
       arquivo anexado. Era um formulário impossível de enviar. O anexo é
       validado no seu próprio bloco, mais abaixo. A foto viaja em
       `body.foto`, pelo mesmo caminho e pela mesma razão. */
    if (c.tipo === 'arquivo' || c.tipo === 'foto') continue;
    const bruto = recebidos ? recebidos[c.id] : undefined;
    let v = bruto == null ? '' : String(bruto).trim();

    if (c.tipo === 'longo') v = v.slice(0, MAX_LONGO);
    else                    v = v.slice(0, MAX_TEXTO);

    if (!v) {
      if (c.obrigatorio) return { erro: `Preencha "${c.rotulo || 'campo obrigatório'}".` };
      continue;
    }
    if (c.tipo === 'email' && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)) {
      return { erro: `O e-mail informado em "${c.rotulo}" não parece válido.` };
    }
    if (c.tipo === 'cpf') {
      if (!brazil.isValidCpf(v)) return { erro: `Informe um CPF válido em "${c.rotulo}".` };
      const cpf = v.replace(/\D/g, '');
      v = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }
    if (c.tipo === 'nascimento') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const date = match ? new Date(`${v}T12:00:00Z`) : null;
      const todayKey = dataCivilSaoPauloIso(agora);
      if (!date || Number.isNaN(date.getTime())
          || date.toISOString().slice(0, 10) !== v
          || v < '1900-01-01' || v > todayKey) {
        return { erro: `Informe uma data de nascimento válida em "${c.rotulo}".` };
      }
    }
    if (c.tipo === 'escolaridade' && !ESCOLARIDADES.includes(v)) {
      return { erro: `Escolha uma escolaridade válida em "${c.rotulo}".` };
    }
    if (c.tipo === 'estado_civil' && !ESTADOS_CIVIS.includes(v)) {
      return { erro: `Escolha um estado civil válido em "${c.rotulo}".` };
    }
    if (c.tipo === 'selecao' && Array.isArray(c.opcoes) && c.opcoes.length
        && !c.opcoes.map(String).includes(v)) {
      return { erro: `Escolha uma das opções em "${c.rotulo}".` };
    }
    if (c.tipo === 'cep') {
      const cep = v.replace(/\D/g, '');
      if (!/^\d{8}$/.test(cep)) return { erro: `Informe um CEP válido em "${c.rotulo}".` };
      v = cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    }
    if (c.tipo === 'cnpj' && !brazil.isValidCnpj(v)) {
      return { erro: `Informe um CNPJ válido em "${c.rotulo}".` };
    }
    if (c.tipo === 'estado') {
      v = v.toUpperCase();
      if (!/^[A-Z]{2}$/.test(v)) return { erro: `Escolha um estado em "${c.rotulo}".` };
    }
    if (c.tipo === 'municipio' && !/^[\p{L}\d ./'-]{2,120}$/u.test(v)) {
      return { erro: `Escolha um município válido em "${c.rotulo}".` };
    }
    valores[c.id] = v;
  }
  return { valores };
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Compartilha esta função com /api/brasil (rewrite em vercel.json) para não
  // criar uma 13ª Function no plano Hobby. A consulta não depende do Firebase.
  if (req.method === 'GET' && req.query?.acao === 'brasil') {
    return consultarBrasil(req, res);
  }

  try {
    ensureFirebase();
  } catch (e) {
    console.error('form: firebase', e.message);
    return res.status(503).json({ error: 'Serviço indisponível.' });
  }

  // ── Ler a definição (página pública, sem login) ──
  if (req.method === 'GET') {
    const id = String(req.query?.id || '').trim();
    if (!/^form_[A-Za-z0-9_-]{4,40}$/.test(id)) {
      return res.status(400).json({ error: 'Formulário não encontrado.' });
    }
    let f;
    try { f = await dbGet('forms/' + id); } catch (e) { f = null; }
    if (!f) return res.status(404).json({ error: 'Este formulário não existe ou foi removido.' });
    if (f.publico !== true) {
      return res.status(403).json({ error: 'Este formulário não está aberto para respostas.' });
    }
    const total = f.respostas ? Object.keys(f.respostas).length : 0;
    if (total >= MAX_RESPOSTAS) {
      return res.status(403).json({ error: 'Este formulário atingiu o limite de respostas.' });
    }
    return res.status(200).json({ ok: true, form: definicaoPublica(f, id) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  /* ═══════════════════════════════════════════════════════════════════════
     A LISTA DOS SEUS FORMULÁRIOS
     ═══════════════════════════════════════════════════════════════════════
     O app sabia quais formulários existiam olhando as NOTAS do quadro: cada
     formulário publicado criava uma, e era ela que guardava o id. Isso amarra
     a vida do link à vida de uma nota — some a nota, some o caminho para o
     formulário, ainda que ele continue inteiro no banco, recebendo respostas
     que ninguém mais consegue ler. Em 01/08/2026 foi o que aconteceu: as notas
     se perderam e 25 formulários ficaram órfãos.

     A lista passa a vir daqui, de onde os formulários realmente moram. O link
     é permanente: só some quando alguém pede para excluir.

     POR QUE PELO ENDPOINT, e não direto do banco: as regras liberam a leitura
     de `forms/{id}` só para o dono daquele id — não existe permissão para
     LISTAR, e criá-la significaria abrir o nó inteiro. Aqui a service account
     lê, e o filtro por dono é feito depois de verificar o token. */
  if (body.acao === 'meusFormularios' || body.acao === 'excluirFormulario') {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Não autenticado' });
    let quem;
    try { quem = await getAuth().verifyIdToken(idToken); }
    catch (_) { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }

    if (body.acao === 'excluirFormulario') {
      const alvo = String(body.id || '').trim();
      if (!/^form_[A-Za-z0-9_-]{4,40}$/.test(alvo)) {
        return res.status(400).json({ error: 'Formulário não encontrado.' });
      }
      let alvoF;
      try { alvoF = await dbGet('forms/' + alvo); } catch (_) { alvoF = null; }
      if (!alvoF) return res.status(404).json({ error: 'Este formulário não existe ou foi removido.' });
      if (alvoF.owner !== quem.uid) return res.status(403).json({ error: 'Este formulário não é seu.' });
      try { await dbRemove('forms/' + alvo); }
      catch (e) {
        console.error('form: excluir', e.message);
        return res.status(500).json({ error: 'Não foi possível excluir agora. Tente de novo.' });
      }
      return res.status(200).json({ ok: true });
    }

    let todos;
    try { todos = await dbGet('forms'); } catch (e) { todos = null; }
    const meus = Object.entries(todos || {})
      .filter(([, f]) => f && f.owner === quem.uid)
      /* Só o que a lista precisa mostrar. Os campos, as respostas e os anexos
         ficam de fora: são o corpo do formulário, e mandá-los aqui seria trocar
         uma lista por um despejo de banco a cada abertura do menu. */
      .map(([fid, f]) => ({
        id: fid,
        titulo: String(f.titulo || '').slice(0, 120),
        nicho: String(f.nicho || ''),
        criadoEm: Number(f.criadoEm) || 0,
        publico: f.publico === true,
        respostas: f.respostas ? Object.keys(f.respostas).length : 0,
      }))
      .sort((a, b) => b.criadoEm - a.criadoEm);
    return res.status(200).json({ ok: true, formularios: meus });
  }

  // ── Avisar o candidato da etapa em que ele está (exige login) ──
  if (body.acao === 'avisarCandidato') {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Não autenticado' });
    let quem;
    try { quem = await getAuth().verifyIdToken(idToken); }
    catch (_) { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }

    /* O workspace vem do cliente, mas quem confere é o servidor:
       resolveClientDestination só devolve caminho de grupo ou de 1:1 depois de
       ver, no banco, que este uid participa dele. Workspace de outra pessoa
       não vira caminho — vira 403. */
    let caminho;
    try {
      const destino = await resolveClientDestination(
        { criarCliente: true, crmDestino: body.destino, owner: quem.uid }, dbGet);
      caminho = destino && destino.path;
    } catch (e) {
      console.warn('form: destino do aviso —', e.message);
      return res.status(403).json({ error: 'Você não tem acesso a este quadro.' });
    }
    if (!caminho) return res.status(400).json({ error: 'Destino inválido.' });

    const fichaId = safeFirebaseKey(body.candidato, 120);
    if (!fichaId) return res.status(400).json({ error: 'Candidato não encontrado.' });
    let ficha;
    try { ficha = await dbGet(`${caminho}/${fichaId}`); } catch (_) { ficha = null; }
    if (!ficha || ficha.type !== 'client') {
      return res.status(404).json({ error: 'Candidato não encontrado.' });
    }

    const para = String(ficha.email || '').trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(para)) {
      return res.status(400).json({
        error: 'Este candidato não tem e-mail na ficha.', codigo: 'sememail' });
    }
    if (!emailConfiguration().configured) {
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        code: 'EMAIL_NOT_CONFIGURED',
        indisponivel: true,
      });
    }

    if (!(await consumirCotaDeAviso(quem.uid, dataCivilSaoPauloIso()))) {
      return res.status(429).json({
        error: `Você já enviou ${MAX_AVISOS_DIA} avisos hoje. Tente amanhã.`,
        codigo: 'cota',
      });
    }

    const situacao = ['avanco', 'volta', 'fim'].includes(body.situacao) ? body.situacao : 'avanco';
    const idioma = ['pt', 'en', 'es'].includes(body.idioma) ? body.idioma : 'pt';
    // Quem assina é o @ do índice protegido por uid, não um nome que veio no
    // corpo do pedido.
    const assina = await dbGet(`uids/${quem.uid}`).catch(() => null);
    const responderPara = await dbGet(`users/${quem.uid}/private/email`).catch(() => null);

    const { assunto, html } = corpoDoAviso(idioma, {
      nome:  esc(String(ficha.name || '').slice(0, 120)) || '—',
      etapa: esc(String(body.etapa || '').slice(0, 120)),
      vaga:  esc(String((ficha.campos && ficha.campos.vaga) || '').slice(0, 120)),
      recado: esc(String(body.recado || '').slice(0, MAX_RECADO).trim()),
      quem:  esc(assina ? '@' + assina : 'MyDesk'),
      situacao,
    });

    try {
      await enviarEmail([para], assunto, html,
        { responderPara: typeof responderPara === 'string' ? responderPara : '' });
    } catch (e) {
      console.error('form: aviso ao candidato —', e.message);
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        indisponivel: true,
      });
    }
    return res.status(200).json({ ok: true, para });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     A COBRANÇA
     ═══════════════════════════════════════════════════════════════════════
     Mesmo cerco do recibo e da proposta, e pelo mesmo motivo: o DESTINATÁRIO
     sai da ficha lida no banco, e a ficha só é lida depois que
     `resolveClientDestination` confirma que quem pede pertence àquele quadro.
     Na prática: só dá para cobrar quem já é cliente seu.

     O TEXTO É MONTADO AQUI, a partir do que a ficha guarda — valor em aberto,
     vencimento, o que já entrou. Do navegador vem só o id e o recado escrito
     à mão. Aceitar o corpo pronto seria deixar qualquer um mandar qualquer
     texto com o nosso domínio no remetente.

     E o `reply_to` é o e-mail que o prestador declarou no perfil de emitente:
     cobrança que não se pode responder é cobrança que não se pode resolver. */
  if (body.acao === 'cobrarCliente') {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Não autenticado' });
    let quem;
    try { quem = await getAuth().verifyIdToken(idToken); }
    catch (_) { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }

    let caminho;
    try {
      const destino = await resolveClientDestination(
        { criarCliente: true, crmDestino: body.destino, owner: quem.uid }, dbGet);
      caminho = destino && destino.path;
    } catch (e) {
      console.warn('form: destino da cobrança —', e.message);
      return res.status(403).json({ error: 'Você não tem acesso a este quadro.' });
    }
    if (!caminho) return res.status(400).json({ error: 'Destino inválido.' });

    const fichaId = safeFirebaseKey(body.cliente, 120);
    if (!fichaId) return res.status(400).json({ error: 'Cliente não encontrado.' });
    let ficha;
    try { ficha = await dbGet(`${caminho}/${fichaId}`); } catch (_) { ficha = null; }
    if (!ficha || ficha.type !== 'client') {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const para = String(ficha.email || '').trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(para)) {
      return res.status(400).json({
        error: 'Este cliente não tem e-mail na ficha.', codigo: 'sememail' });
    }

    /* O VALOR EM ABERTO É CALCULADO AQUI, e não recebido pronto. Um valor
       vindo do corpo do POST seria um numero que o servidor afirma sem ter
       conferido — e cobranca com valor errado destrói a confianca do cliente
       na conta inteira, nao so naquele e-mail. */
    const valorCheio = Number(ficha.value) || 0;
    const recebido = ficha.status === 'paid' ? valorCheio
      : ficha.status === 'partial'
        ? Math.min(Math.max(Number(ficha.paidAmount) || 0, 0), valorCheio)
        : 0;
    const falta = Math.max(0, valorCheio - recebido);
    if (falta <= 0) {
      return res.status(400).json({
        error: 'Este cliente não tem valor em aberto.', codigo: 'quitado' });
    }

    if (!emailConfiguration().configured) {
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        code: 'EMAIL_NOT_CONFIGURED', indisponivel: true,
      });
    }
    if (!(await consumirCotaDeAviso(quem.uid, dataCivilSaoPauloIso()))) {
      return res.status(429).json({
        error: `Você já enviou ${MAX_AVISOS_DIA} mensagens hoje. Tente amanhã.`,
        codigo: 'cota',
      });
    }

    const idioma = ['pt', 'en', 'es'].includes(body.idioma) ? body.idioma : 'pt';
    const T = COBRANCA_TEXTOS[idioma] || COBRANCA_TEXTOS.pt;
    const hoje = dataCivilSaoPauloIso();
    const venc = /^\d{4}-\d{2}-\d{2}$/.test(String(ficha.dueDate || '')) ? ficha.dueDate : '';
    const dias = venc && venc < hoje
      ? Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(venc + 'T12:00:00Z')) / 86400000)
      : 0;
    const recado = String(body.recado || '').slice(0, MAX_RECADO);

    let emitente = '', respostaPara = '';
    try {
      const perfil = await dbGet(`users/${quem.uid}/personal/emitente`);
      emitente = String((perfil && perfil.nome) || '').slice(0, 120);
      if (/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(perfil && perfil.email || ''))) {
        respostaPara = String(perfil.email);
      }
    } catch (_) { /* perfil ainda não preenchido: segue sem */ }
    if (!respostaPara) {
      try {
        const conta = await getAuth().getUser(quem.uid);
        if (/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(conta.email || ''))) respostaPara = conta.email;
      } catch (_) { respostaPara = ''; }
    }

    const linha = dias > 0
      ? _preencher(T.atrasado, { valor: _moeda(falta, idioma),
          data: _dataLegivel(venc, idioma), dias })
      : venc
        ? _preencher(T.noPrazo, { valor: _moeda(falta, idioma), data: _dataLegivel(venc, idioma) })
        : _preencher(T.semData, { valor: _moeda(falta, idioma) });

    const html = _emailEnvelope(`
        <p style="margin:0 0 14px">${_preencher(esc(T.ola), { nome: esc(ficha.name || '') })}</p>
        <p style="margin:0 0 14px;font-size:16px">${esc(linha)}</p>
        ${recebido > 0 ? `<p style="margin:0 0 14px;color:#555">${_preencher(esc(T.parcial), {
          total: esc(_moeda(valorCheio, idioma)), pago: esc(_moeda(recebido, idioma)) })}</p>` : ''}
        ${ficha.description ? `<p style="margin:0 0 14px;color:#555">${
          _preencher(esc(T.referente), { ref: esc(String(ficha.description).slice(0, 300)) })}</p>` : ''}
        ${recado ? `<p style="margin:0 0 14px;white-space:pre-wrap;border-left:3px solid #6366f1;
           padding-left:12px;color:#333">${esc(recado)}</p>` : ''}`,
      { chapeu: T.chapeu, rodape: esc(T.fecho) });

    try {
      await enviarEmail([para], _preencher(T.assunto, {
        valor: _moeda(falta, idioma), emitente: emitente || 'MyDesk' }), html,
      { responderPara: respostaPara });
    } catch (e) {
      console.error('form: envio da cobrança —', e.message);
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.', indisponivel: true });
    }
    return res.status(200).json({ ok: true, para, valor: falta });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     O RECIBO, PARA O CLIENTE ASSINAR A VIA DELE
     ═══════════════════════════════════════════════════════════════════════
     Enquanto o recibo tinha uma assinatura só, ele não precisava sair daqui:
     saía pronto do gerador e ia para a impressora. Com o campo de assinatura
     do pagante, ele precisa CHEGAR ao pagante — senão a segunda linha nunca é
     assinada e o campo vira enfeite.

     O PDF vem do navegador, e não é montado aqui: o recibo depende de coisas
     que não estão no banco — os dados do emitente, a assinatura desenhada à
     mão, a cidade, a forma de pagamento. Reproduzir isso no servidor seria uma
     segunda implementação do mesmo documento, e duas divergem no primeiro
     ajuste que alguém fizer de um lado só.

     O cerco é o mesmo da proposta, e é ele que impede isto de virar um serviço
     de envio de e-mail com o nosso domínio no remetente:
       · exige login;
       · o quadro é conferido no banco contra o uid de quem pede;
       · o DESTINATÁRIO sai da ficha do cliente, nunca do corpo do POST;
       · o anexo só passa se declarar PDF no próprio cabeçalho e couber no teto;
       · a cota diária de mensagens continua valendo.
     Dá para mandar recibo para os PRÓPRIOS clientes, e nada além disso. */
  if (body.acao === 'enviarRecibo') {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Não autenticado' });
    let quem;
    try { quem = await getAuth().verifyIdToken(idToken); }
    catch (_) { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }

    let caminho;
    try {
      const destino = await resolveClientDestination(
        { criarCliente: true, crmDestino: body.destino, owner: quem.uid }, dbGet);
      caminho = destino && destino.path;
    } catch (e) {
      console.warn('form: destino do recibo —', e.message);
      return res.status(403).json({ error: 'Você não tem acesso a este quadro.' });
    }
    if (!caminho) return res.status(400).json({ error: 'Destino inválido.' });

    const fichaId = safeFirebaseKey(body.cliente, 120);
    if (!fichaId) return res.status(400).json({ error: 'Cliente não encontrado.' });
    let ficha;
    try { ficha = await dbGet(`${caminho}/${fichaId}`); } catch (_) { ficha = null; }
    if (!ficha || ficha.type !== 'client') {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const para = String(ficha.email || '').trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(para)) {
      return res.status(400).json({
        error: 'Este cliente não tem e-mail na ficha.', codigo: 'sememail' });
    }

    const arq = body.arquivo;
    if (!arq || typeof arq !== 'object' || typeof arq.dataUrl !== 'string' || !arq.dataUrl) {
      return res.status(400).json({ error: 'Recibo não recebido.', codigo: 'semarquivo' });
    }
    if (arq.dataUrl.length > MAX_ARQUIVO) {
      return res.status(413).json({ error: 'O arquivo passa de 5 MB.', codigo: 'grande' });
    }
    const cab = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(arq.dataUrl);
    if (!cab) return res.status(400).json({ error: 'O recibo precisa ser um PDF.', codigo: 'arquivo' });
    /* Barra e quebra de linha no nome se injetam no cabeçalho do e-mail. */
    const nomeArq = String(arq.nome || '').replace(/[\\/\r\n"]+/g, ' ').trim().slice(0, 120);

    if (!emailConfiguration().configured) {
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        code: 'EMAIL_NOT_CONFIGURED', indisponivel: true,
      });
    }
    if (!(await consumirCotaDeAviso(quem.uid, dataCivilSaoPauloIso()))) {
      return res.status(429).json({
        error: `Você já enviou ${MAX_AVISOS_DIA} mensagens hoje. Tente amanhã.`,
        codigo: 'cota',
      });
    }

    const idioma = ['pt', 'en', 'es'].includes(body.idioma) ? body.idioma : 'pt';
    const T = RECIBO_TEXTOS[idioma] || RECIBO_TEXTOS.pt;
    const numero = Number(body.numero) > 0
      ? String(Math.floor(Number(body.numero))).padStart(4, '0') : '';
    const emitente = String(body.emitente || '').slice(0, 120);
    const referente = String(body.referente || '').slice(0, 300);
    const valor = _moeda(body.valor, idioma);

    /* ── PARA ONDE A VIA ASSINADA VOLTA ──────────────────────────────────
       O remetente é um endereço de sistema que não lê resposta nenhuma. Sem
       um `reply_to` certo, "responda a este e-mail" manda o cliente escrever
       para o vazio — e ele conclui que devolveu o recibo quando não devolveu.

       O endereço é o que o prestador do serviço declarou na tela do recibo,
       lido de users/{uid}/personal/emitente. Vem do BANCO, e não do corpo do
       POST: cabeçalho de e-mail montado com dado do cliente é o caminho curto
       para alguém mandar uma mensagem com a nossa cara e a resposta indo para
       outro lugar. O e-mail da conta é só o retorno quando ele não declarou —
       o e-mail de login não é necessariamente o de trabalho. */
    const emailValido = e => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(e || ''));
    let respostaPara = '';
    try {
      const emitente = await dbGet(`users/${quem.uid}/personal/emitente`);
      if (emailValido(emitente && emitente.email)) respostaPara = String(emitente.email);
    } catch (_) { respostaPara = ''; }
    if (!respostaPara) {
      try {
        const conta = await getAuth().getUser(quem.uid);
        if (emailValido(conta.email)) respostaPara = conta.email;
      } catch (_) { respostaPara = ''; }
    }

    const html = _emailEnvelope(`
        <p style="margin:0 0 14px">${_preencher(esc(T.ola), { nome: esc(ficha.name || '') })},</p>
        <p style="margin:0 0 14px;font-size:16px">${_preencher(esc(T.corpo), {
          valor: esc(valor), referente: esc(referente), emitente: esc(emitente) })}</p>
        <p style="margin:0 0 14px">${respostaPara
          ? _preencher(esc(T.assine), { resposta: '<b>' + esc(respostaPara) + '</b>' })
          : esc(T.assineSemEmail)}</p>`,
      { chapeu: T.chapeu, rodape: esc(T.rodape) });

    try {
      await enviarEmail([para], _preencher(T.assunto, { numero, emitente }), html, {
        responderPara: respostaPara,
        anexos: [{ filename: nomeArq || 'recibo.pdf', content: cab[1] }],
      });
    } catch (e) {
      console.error('form: envio do recibo —', e.message);
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.', indisponivel: true });
    }
    return res.status(200).json({ ok: true, para });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     A PROPOSTA DE TRABALHO, EM PDF, PARA O CANDIDATO
     ═══════════════════════════════════════════════════════════════════════
     Mesmas duas travas do aviso de etapa, e pelo mesmo motivo: o
     DESTINATÁRIO sai da ficha lida no banco, e a ficha só é lida depois que
     `resolveClientDestination` confirma no banco que quem pede pertence
     àquele quadro. Na prática: só dá para mandar proposta a quem já é
     candidato seu.

     O PDF É MONTADO AQUI por padrão, a partir da proposta gravada na ficha —
     o navegador manda apenas o id. Quando ela escolhe o próprio modelo, o
     arquivo vem no corpo e passa pelas checagens de tipo e tamanho (ver o
     bloco do anexo, mais abaixo).

     O `reply_to` é o e-mail que a PROPOSTA declara. É a diferença entre o
     candidato conseguir responder a quem contratou e responder a um endereço
     de sistema que não lê nada. */
  if (body.acao === 'enviarProposta') {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Não autenticado' });
    let quem;
    try { quem = await getAuth().verifyIdToken(idToken); }
    catch (_) { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }

    let caminho;
    try {
      const destino = await resolveClientDestination(
        { criarCliente: true, crmDestino: body.destino, owner: quem.uid }, dbGet);
      caminho = destino && destino.path;
    } catch (e) {
      console.warn('form: destino da proposta —', e.message);
      return res.status(403).json({ error: 'Você não tem acesso a este quadro.' });
    }
    if (!caminho) return res.status(400).json({ error: 'Destino inválido.' });

    const fichaId = safeFirebaseKey(body.candidato, 120);
    if (!fichaId) return res.status(400).json({ error: 'Candidato não encontrado.' });
    let ficha;
    try { ficha = await dbGet(`${caminho}/${fichaId}`); } catch (_) { ficha = null; }
    if (!ficha || ficha.type !== 'client') {
      return res.status(404).json({ error: 'Candidato não encontrado.' });
    }

    const para = String(ficha.email || '').trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(para)) {
      return res.status(400).json({
        error: 'Este candidato não tem e-mail na ficha.', codigo: 'sememail' });
    }
    const proposta = (ficha.proposta && typeof ficha.proposta === 'object') ? ficha.proposta : null;
    if (!proposta) {
      return res.status(400).json({
        error: 'Não há proposta gravada para este candidato.', codigo: 'semproposta' });
    }
    if (!emailConfiguration().configured) {
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        code: 'EMAIL_NOT_CONFIGURED', indisponivel: true,
      });
    }
    if (!(await consumirCotaDeAviso(quem.uid, dataCivilSaoPauloIso()))) {
      return res.status(429).json({
        error: `Você já enviou ${MAX_AVISOS_DIA} mensagens hoje. Tente amanhã.`,
        codigo: 'cota',
      });
    }

    const idioma = ['pt', 'en', 'es'].includes(body.idioma) ? body.idioma : 'pt';
    const carta = cartaDaProposta(idioma, ficha, proposta);

    /* ── O MODELO PRÓPRIO ────────────────────────────────────────────────
       Quem já tem papel timbrado e texto aprovado pelo jurídico manda o
       documento dele. O anexo vem do navegador, e é o ÚNICO dado do corpo do
       POST que vira conteúdo enviado — por isso passa por três checagens:
       o cabeçalho do dataURL tem de declarar um dos três tipos aceitos, o
       corpo tem de ser base64 puro, e o tamanho tem teto.

       O que continua NÃO vindo do corpo: o destinatário (sai da ficha), o
       quadro (conferido no banco contra o uid de quem pede) e o endereço de
       resposta (sai da proposta gravada). Sem essas três, isto seria um
       serviço de envio de e-mail arbitrário com o nosso domínio no remetente,
       que é como um domínio vai para lista de bloqueio. */
    const TIPOS_PROPOSTA = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };
    let anexo = null;
    const arq = body.arquivo;
    if (arq && typeof arq === 'object' && typeof arq.dataUrl === 'string' && arq.dataUrl) {
      if (arq.dataUrl.length > MAX_ARQUIVO) {
        return res.status(413).json({ error: 'O arquivo passa de 5 MB.', codigo: 'grande' });
      }
      const cabecalho = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]*)$/.exec(arq.dataUrl);
      if (!cabecalho || !TIPOS_PROPOSTA[cabecalho[1]] || !cabecalho[2]) {
        return res.status(400).json({
          error: 'Envie um PDF ou um documento do Word (.doc ou .docx).', codigo: 'arquivo' });
      }
      const extensao = TIPOS_PROPOSTA[cabecalho[1]];
      const nome = String(arq.nome || '').replace(/[\\/\r\n"]+/g, ' ').trim().slice(0, 120);
      anexo = {
        filename: new RegExp('\\.' + extensao + '$', 'i').test(nome)
          ? nome : (nome || carta.arquivo.replace(/\.pdf$/i, '')) + '.' + extensao,
        content: cabecalho[2],
      };
    }

    if (!anexo) {
      try {
        anexo = { filename: carta.arquivo, content: propostaPdf.paraBase64(carta.documento) };
      } catch (e) {
        console.error('form: pdf da proposta —', e.message);
        return res.status(500).json({ error: 'Não foi possível gerar o PDF da proposta.' });
      }
    }

    /* O e-mail responde para quem CONTRATA, e nunca para o remetente de
       sistema. Endereço inválido na proposta não vira reply_to torto: fica
       sem, e o corpo continua dizendo por escrito para onde responder. */
    const respostaPara = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(proposta.emailResposta || ''))
      ? String(proposta.emailResposta) : '';

    try {
      await enviarEmail([para], carta.assunto, carta.html, {
        responderPara: respostaPara,
        anexos: [anexo],
      });
    } catch (e) {
      console.error('form: envio da proposta —', e.message);
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.', indisponivel: true });
    }
    return res.status(200).json({ ok: true, para });
  }

  const id = String(body.id || '').trim();
  if (!/^form_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return res.status(400).json({ error: 'Formulário não encontrado.' });
  }

  let f;
  try { f = await dbGet('forms/' + id); } catch (e) { f = null; }
  if (!f) return res.status(404).json({ error: 'Este formulário não existe ou foi removido.' });

  // ── Enviar o link por e-mail (só o dono, com login) ──
  if (body.acao === 'enviarLink') {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Não autenticado' });
    let quem;
    try { quem = await getAuth().verifyIdToken(idToken); }
    catch (_) { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }
    if (f.owner !== quem.uid) return res.status(403).json({ error: 'Este formulário não é seu.' });

    const destinos = (Array.isArray(body.para) ? body.para : [])
      .map(e => String(e || '').trim())
      .filter(e => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e))
      .slice(0, MAX_DESTINOS);
    if (!destinos.length) return res.status(400).json({ error: 'Informe ao menos um e-mail válido.' });
    if (!emailConfiguration().configured) {
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        code: 'EMAIL_NOT_CONFIGURED',
        indisponivel: true,
      });
    }

    const link = String(body.link || '').slice(0, 300);
    if (!/^https:\/\/(mydesk\.social|jvalvim-bit\.github\.io)\//.test(link)) {
      return res.status(400).json({ error: 'Link inválido.' });
    }
    const msg = String(body.mensagem || '').slice(0, 500);

    try {
      await enviarEmail(destinos, esc(f.titulo || 'Formulário'), _emailEnvelope(`
          <h2 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#14141c;">${esc(f.titulo || 'Formulário')}</h2>
          ${f.descricao ? `<p style="margin:0 0 14px;color:#555">${esc(f.descricao)}</p>` : ''}
          ${msg ? `<p style="margin:0 0 14px">${esc(msg)}</p>` : ''}
          <p style="margin:20px 0 0">
            <a href="${esc(link)}" style="background:#4f46e5;color:#fff;text-decoration:none;
               padding:12px 22px;border-radius:9px;display:inline-block;font-weight:bold">Preencher formulário</a>
          </p>`,
        { chapeu: 'Formulário', rodape: 'Enviado por ' + esc(f.ownerUser || 'um usuário') + ' pelo MyDesk.' }));
    } catch (e) {
      console.error('form: e-mail', e.message);
      /* O motivo real fica no log do servidor; para quem clicou, a informação
         útil é que o link continua funcionando. `indisponivel` diz à interface
         para mostrar o aviso de serviço temporariamente fora, em vez de um
         erro vermelho que parece culpa de quem clicou. */
      return res.status(503).json({
        error: 'O envio por e-mail está temporariamente indisponível.',
        indisponivel: true,
      });
    }
    return res.status(200).json({ ok: true, enviados: destinos.length });
  }

  // ── Gravar uma resposta (sem login) ──
  if (f.publico !== true) {
    return res.status(403).json({
      error: 'Este formulário não está aberto para respostas.', codigo: 'fechado' });
  }
  const total = f.respostas ? Object.keys(f.respostas).length : 0;
  if (total >= MAX_RESPOSTAS) {
    return res.status(403).json({
      error: 'Este formulário atingiu o limite de respostas.', codigo: 'limite' });
  }

  const { valores, erro } = validarValores(f.campos || [], body.valores);
  if (erro) return res.status(400).json({ error: erro });

  // Anexo: só entra se o formulário tem um campo de arquivo. O teto é bem menor
  // que o dos anexos de nota — isto vem de fora, sem conta e sem cota.
  const temCampoArquivo = (f.campos || []).some(c => c.tipo === 'arquivo');
  const arq = body.arquivo;
  let anexo = null;
  if (temCampoArquivo && arq && typeof arq.dataUrl === 'string' && arq.dataUrl) {
    if (arq.dataUrl.length > MAX_ARQUIVO) {
      return res.status(413).json({ error: 'O arquivo passa de 5 MB.', codigo: 'grande' });
    }
    if (!/^data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]*$/.test(arq.dataUrl)) {
      return res.status(400).json({ error: 'Arquivo inválido.', codigo: 'arquivo' });
    }
    anexo = {
      name: String(arq.name || 'arquivo').slice(0, 120),
      type: String(arq.type || '').slice(0, 80),
      dataUrl: arq.dataUrl,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     A FOTO DO CANDIDATO
     ═══════════════════════════════════════════════════════════════════════
     Ela só entra se o formulário tem um campo de foto — como o anexo, e pela
     mesma razão: o corpo do POST é de quem quiser.

     POR QUE ELA VIAJA NA RESPOSTA. No MyDesk a foto de uma pessoa mora no
     IndexedDB do navegador de quem recruta, e nunca no banco (registro viaja
     inteiro a cada leitura do quadro). Mas o candidato não tem esse
     navegador: a resposta é o ÚNICO caminho do celular dele até ela. A foto
     passa por aqui, fica na resposta, e o app a move para o IndexedDB na
     primeira vez que desenha a ficha — depois disso ela nunca mais é lida do
     banco.

     Só imagem, e só formato que o navegador de fato produz no `canvas`. Um
     `data:` de outro tipo iria parar num `img.src` do lado de lá. */
  const temCampoFoto = (f.campos || []).some(c => c.tipo === 'foto');
  let foto = '';
  if (temCampoFoto && typeof body.foto === 'string' && body.foto) {
    if (body.foto.length > MAX_FOTO) {
      return res.status(413).json({ error: 'A foto é grande demais.', codigo: 'fotogrande' });
    }
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.foto)) {
      return res.status(400).json({ error: 'Foto inválida.', codigo: 'foto' });
    }
    foto = body.foto;
  }

  if (!respostaTemConteudo(valores, anexo, foto)) {
    return res.status(400).json({ error: 'Preencha ao menos um campo.', codigo: 'vazio' });
  }

  const resposta = { ts: Date.now(), valores };
  if (anexo) resposta.arquivo = anexo;
  if (foto)  resposta.foto = foto;

  let respostaId;
  try {
    const gravada = await dbPush('forms/' + id + '/respostas', resposta);
    respostaId = gravada?.name;
  } catch (e) {
    console.error('form: gravar', e.message);
    return res.status(500).json({
      error: 'Não foi possível registrar sua resposta. Tente de novo.', codigo: 'gravar' });
  }

  /*
   * Integração opcional com Clientes. A opção e o destino pertencem à
   * definição autenticada do formulário (`f`); qualquer `criarCliente` ou
   * `crmDestino` enviado pelo respondente é ignorado. Falhar aqui não apaga a
   * resposta já recebida.
   */
  let clienteCriado = false;
  if (f.criarCliente === true && respostaId) {
    try {
      const destination = await resolveClientDestination(f, dbGet);
      if (destination) {
        const client = clientFromResponse({ ...f, id }, resposta, respostaId);
        await dbPut(`${destination.path}/${client.id}`, client);
        clienteCriado = true;
      }
    } catch (e) {
      console.warn('form: cliente não criado —', e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     NÃO EXISTE MAIS E-MAIL A CADA RESPOSTA
     ═══════════════════════════════════════════════════════════════════════
     Cada resposta virava um e-mail "Nova resposta: …" para quem criou o
     formulário. Um formulário divulgado — uma vaga, um orçamento — enche a
     caixa de entrada em uma tarde, e o e-mail não contava NADA que o app já
     não mostrasse: a resposta chega ao quadro, ao contador da nota, ao aviso
     na tela, ao feed de atividade e, quando é de vaga, ao funil.

     O interruptor por formulário existiu por um dia e não resolveu: quem já
     tinha vinte e cinco formulários com o aviso ligado teria de desligar um
     por um, e a caixa de entrada continuava enchendo enquanto isso. Ligado por
     engano, o padrão custa caro; desligado, não custa nada.

     Os envios de e-mail deste arquivo passam a ser só os que alguém PEDE, um
     por vez: o link do formulário e o aviso de etapa ao candidato. */

  return res.status(200).json({ ok: true, clienteCriado });
};

// Funções puras expostas apenas para testes; o export principal continua sendo
// o handler serverless esperado pela Vercel.
module.exports._test = {
  validarValores,
  respostaTemConteudo,
  definicaoPublica,
  consultarBrasil,
  dataCivilSaoPauloIso,
  emailConfiguration,
  corpoDoAviso,
  esc,
};
