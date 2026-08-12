'use strict';
/* O aviso de etapa é o único e-mail do MyDesk que sai para alguém de FORA —
   uma pessoa que não tem conta, não escolheu receber nada e não pode desfazer
   o que chegou na caixa dela. Duas coisas seguram isso, e as duas são
   verificadas aqui:

   1. O DESTINATÁRIO vem da ficha lida no banco, nunca do corpo do pedido. Se
      um dia passar a vir de fora, esta função vira um servidor de envio aberto
      com o domínio do MyDesk no remetente.
   2. A ficha só é lida depois que resolveClientDestination confirma, no banco,
      que quem pede pertence ao quadro onde ela mora.

   O arquivo também guarda a remoção do e-mail "Nova resposta": ele já nasceu
   ligado uma vez, foi desligado por padrão e voltou a incomodar por causa dos
   formulários antigos. A varredura falha se o envio reaparecer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

/* Um banco de mentira e um Resend de mentira, com o mesmo formato de resposta
   que os de verdade. `bd` é lido e escrito por caminho, como o RTDB. */
function montarAmbiente(bd, { uid = 'uid-1' } = {}) {
  const formPath = require.resolve('../api/form');
  const appPath = require.resolve('firebase-admin/app');
  const authPath = require.resolve('firebase-admin/auth');
  const anteriores = new Map([
    [formPath, require.cache[formPath]],
    [appPath, require.cache[appPath]],
    [authPath, require.cache[authPath]],
  ]);
  const fetchOriginal = global.fetch;
  const envOriginal = {
    db: process.env.FIREBASE_DATABASE_URL,
    chave: process.env.RESEND_API_KEY,
    de: process.env.RESEND_FROM,
    emailHabilitado: process.env.MYDESK_ENABLE_EMAIL,
  };

  const instalar = (p, exports) => {
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
  };
  instalar(appPath, {
    cert: v => v,
    getApps: () => [{ name: 'test' }],
    getApp: () => ({
      options: { credential: { getAccessToken: async () => ({ access_token: 't' }) } },
    }),
    initializeApp: () => ({ name: 'test' }),
  });
  instalar(authPath, { getAuth: () => ({ verifyIdToken: async () => ({ uid }) }) });
  delete require.cache[formPath];

  process.env.FIREBASE_DATABASE_URL = 'https://db.example.test';
  process.env.RESEND_API_KEY = 'chave';
  process.env.RESEND_FROM = 'MyDesk Colab <formularios@example.test>';
  process.env.MYDESK_ENABLE_EMAIL = '1';

  const enviados = [];
  global.fetch = async (url, opcoes = {}) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      enviados.push(JSON.parse(opcoes.body));
      return { ok: true, status: 200, async json() { return { id: 'e1' }; },
               async text() { return ''; } };
    }
    const caminho = new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, '');
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') {
      return { ok: true, status: 200,
               async json() { return caminho in bd ? structuredClone(bd[caminho]) : null; } };
    }
    if (metodo === 'PUT' || metodo === 'POST') {
      bd[caminho] = JSON.parse(opcoes.body);
      return { ok: true, status: 200, async json() { return { name: '-r1' }; } };
    }
    throw new Error(`fetch inesperado: ${metodo} ${caminho}`);
  };

  return {
    handler: require('../api/form'),
    enviados,
    restaurar() {
      global.fetch = fetchOriginal;
      process.env.FIREBASE_DATABASE_URL = envOriginal.db;
      if (envOriginal.chave === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = envOriginal.chave;
    if (envOriginal.de === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = envOriginal.de;
    if (envOriginal.emailHabilitado === undefined) delete process.env.MYDESK_ENABLE_EMAIL;
    else process.env.MYDESK_ENABLE_EMAIL = envOriginal.emailHabilitado;
      for (const [p, mod] of anteriores) {
        if (mod) require.cache[p] = mod; else delete require.cache[p];
      }
    },
  };
}

const pedido = extra => ({
  method: 'POST',
  query: {},
  headers: { origin: 'https://mydesk.social', authorization: 'Bearer token' },
  body: { acao: 'avisarCandidato', destino: { tipo: 'pessoal' }, ...extra },
});

test('o aviso vai para o e-mail da FICHA, e não para o que veio no pedido', async () => {
  const bd = {
    'users/uid-1/notes/crm_a': {
      type: 'client', template: 'rh', name: 'André',
      email: 'andre@example.com', campos: { vaga: 'Analista' },
    },
    'uids/uid-1': 'vitoria',
    'users/uid-1/private/email': 'vitoria@example.com',
  };
  const amb = montarAmbiente(bd);
  try {
    const res = responseMock();
    await amb.handler(pedido({
      candidato: 'crm_a', etapa: 'Entrevista RH', situacao: 'avanco',
      recado: 'Quinta às 10h.',
      // O atacante escolhendo o destinatário. Precisa ser ignorado.
      email: 'vitima@example.com', para: ['vitima@example.com'],
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(amb.enviados.length, 1);
    assert.deepEqual(amb.enviados[0].to, ['andre@example.com']);
    assert.match(amb.enviados[0].html, /Entrevista RH/);
    assert.match(amb.enviados[0].html, /Quinta às 10h\./);
    // Quem recebe precisa conseguir responder para uma pessoa, não para o vazio.
    assert.equal(amb.enviados[0].reply_to, 'vitoria@example.com');
  } finally { amb.restaurar(); }
});

test('o recado do remetente entra escapado, e não como markup', async () => {
  const bd = {
    'users/uid-1/notes/crm_a': { type: 'client', name: 'Ana', email: 'ana@example.com' },
  };
  const amb = montarAmbiente(bd);
  try {
    const res = responseMock();
    await amb.handler(pedido({
      candidato: 'crm_a', etapa: 'Proposta',
      recado: '<script>alert(1)</script>',
    }), res);
    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(amb.enviados[0].html, /<script>/);
    assert.match(amb.enviados[0].html, /&lt;script&gt;/);
  } finally { amb.restaurar(); }
});

test('quadro de grupo do qual a pessoa não participa devolve 403 e não lê a ficha', async () => {
  const bd = {
    // A ficha existe; o que falta é o pedinte pertencer ao grupo.
    'group_boards/g1/notes/crm_a': { type: 'client', name: 'Ana', email: 'ana@example.com' },
    'uids/uid-1': 'vitoria',
    'groups/g1/members/vitoria': false,
    'groups/g1/owner': 'outra',
  };
  const amb = montarAmbiente(bd);
  try {
    const res = responseMock();
    await amb.handler(pedido({
      destino: { tipo: 'grupo', id: 'g1' }, candidato: 'crm_a', etapa: 'Proposta',
    }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(amb.enviados.length, 0);
  } finally { amb.restaurar(); }
});

test('candidato sem e-mail na ficha não vira envio, e a interface sabe por quê', async () => {
  const bd = { 'users/uid-1/notes/crm_a': { type: 'client', name: 'Ana', email: '' } };
  const amb = montarAmbiente(bd);
  try {
    const res = responseMock();
    await amb.handler(pedido({ candidato: 'crm_a', etapa: 'Triagem' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.codigo, 'sememail');
    assert.equal(amb.enviados.length, 0);
  } finally { amb.restaurar(); }
});

test('nota que não é ficha de cliente não serve de atalho para enviar e-mail', async () => {
  const bd = {
    // Nota comum do quadro, com um campo `email` qualquer dentro.
    'users/uid-1/notes/n1': { title: 'lembrete', email: 'alvo@example.com' },
  };
  const amb = montarAmbiente(bd);
  try {
    const res = responseMock();
    await amb.handler(pedido({ candidato: 'n1', etapa: 'Triagem' }), res);
    assert.equal(res.statusCode, 404);
    assert.equal(amb.enviados.length, 0);
  } finally { amb.restaurar(); }
});

test('o teto diário existe e barra o laço', async () => {
  const bd = {
    'users/uid-1/notes/crm_a': { type: 'client', name: 'Ana', email: 'ana@example.com' },
  };
  const amb = montarAmbiente(bd);
  try {
    let ultimo;
    for (let i = 0; i < 45; i++) {
      ultimo = responseMock();
      await amb.handler(pedido({ candidato: 'crm_a', etapa: 'Triagem' }), ultimo);
    }
    assert.equal(ultimo.statusCode, 429);
    assert.equal(ultimo.body.codigo, 'cota');
    assert.ok(amb.enviados.length <= 40,
      `o teto deixou passar ${amb.enviados.length} envios em um dia`);
  } finally { amb.restaurar(); }
});

test('responder o formulário NÃO manda mais e-mail para quem o criou', async () => {
  const bd = {
    'forms/form_teste': {
      owner: 'uid-1', titulo: 'Processo seletivo', publico: true,
      // Formulário antigo, com o aviso ligado no banco. Nem assim.
      notificar: true,
      campos: [{ id: 'c1', tipo: 'texto', rotulo: 'Nome', obrigatorio: true }],
    },
    'users/uid-1/private/email': 'vitoria@example.com',
  };
  const amb = montarAmbiente(bd);
  try {
    const res = responseMock();
    await amb.handler({
      method: 'POST',
      query: {},
      headers: { origin: 'https://mydesk.social' },
      body: { id: 'form_teste', valores: { c1: 'Ana' } },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(amb.enviados.length, 0,
      'a resposta voltou a gerar e-mail para o dono do formulário');
  } finally { amb.restaurar(); }
});

test('o código do aviso "Nova resposta" não voltou por outro caminho', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
  assert.doesNotMatch(fonte, /'Nova resposta/,
    'o e-mail a cada resposta reapareceu em api/form.js');
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  assert.doesNotMatch(app, /alternarAvisoFormulario/,
    'o interruptor do aviso reapareceu no app; ele não tem mais o que ligar');
});

test('os três botões do cartão levam ao aviso, inclusive o arrastar', () => {
  const rh = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

  /* O convite mora em `mover()`, que é por onde passam ‹, › e o arrasto. Se
     alguém o mudar para dentro do clique de um botão, o arrasto — que é o
     único caminho no celular — deixa de avisar sem que nada quebre. */
  const inicio = rh.indexOf('async function mover(');
  const fim = rh.indexOf('function _cartao(');
  assert.ok(inicio > 0 && fim > inicio);
  assert.match(rh.slice(inicio, fim), /crmAvisarCandidato/,
    'mover() deixou de oferecer o aviso; o arrasto ficaria sem ele');

  // E o ⋮, que é o caminho para avisar sem mudar ninguém de etapa.
  assert.match(app, /rh\.notice[^A-Za-z][\s\S]{0,200}crmAvisarCandidato\(id\)/,
    'o menu ⋮ perdeu a entrada de aviso por e-mail');
});

test('ficha sem e-mail nunca fica em silêncio', () => {
  /* O primeiro desenho escondia o item do menu quando a ficha nao tinha
     e-mail. Na base real quase nenhuma tem — o formulario da vaga so pedia o
     curriculo —, entao o recurso simplesmente nao existia na tela, e de fora
     isso e indistinguivel de estar quebrado. Duas saidas, e as duas precisam
     continuar existindo. */
  const rh = fs.readFileSync(path.join(RAIZ, 'docs/js/rh.js'), 'utf8');
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

  // 1. Mover um candidato sem e-mail diz por que nada aconteceu.
  const inicio = rh.indexOf('async function mover(');
  const fim = rh.indexOf('function _cartao(');
  assert.match(rh.slice(inicio, fim), /rh\.noticeNoEmailHint/,
    'mover candidato sem e-mail voltou a nao dizer nada');

  // 2. A janela aceita escrever o endereco, e ele vai para a FICHA antes do
  //    envio — o servidor continua lendo o destinatario de la, e nunca do
  //    corpo do pedido.
  const jan = app.indexOf('function crmAvisarCandidato(');
  const fimJan = app.indexOf('function crmAcoesDoCandidato(');
  const bloco = app.slice(jan, fimJan);
  assert.match(bloco, /id="rh-aviso-email"/, 'a janela perdeu o campo de e-mail');
  assert.match(bloco, /updateRecord\(rec\.id,\s*\{\s*email:/,
    'o e-mail digitado precisa ser gravado na ficha antes de enviar');
  const ondeGrava = bloco.indexOf('updateRecord(rec.id');
  const ondeEnvia = bloco.indexOf('_crmEnviarAviso(rec');
  assert.ok(ondeGrava > 0 && ondeGrava < ondeEnvia,
    'gravar depois de enviar faria o servidor ler a ficha antiga');

  // 3. E o item do menu nao depende mais de haver e-mail.
  /* Ate o FIM da funcao, e nao um pedaco de tamanho fixo: o menu ganhou
     "Avancar"/"Voltar uma etapa" quando as setas sairam do cartao, e um
     corte por contagem de caracteres passou a terminar antes do item. */
  const menu = app.slice(fimJan, app.indexOf('\n}', fimJan));
  assert.match(menu, /rh\.notice['"]/, 'o item de aviso sumiu do menu');
  assert.doesNotMatch(menu, /emailDe\(rec\)\s*\n?\s*\?/,
    'o item do menu voltou a aparecer so quando ha e-mail');
});
