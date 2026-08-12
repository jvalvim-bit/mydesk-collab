'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   COBRAR
   ═══════════════════════════════════════════════════════════════════════
   O app já sabia quem devia, quanto, desde quando e há quantos dias — isso
   aparecia na tabela, no painel e no relatório, e morria ali. Quem cobra
   ainda abria o e-mail, procurava o cliente, lembrava o valor, conferia a
   data e escrevia tudo à mão, uma vez por devedor.

   O que este arquivo cobra não é o texto: é que o VALOR não venha do
   navegador, que o destinatário saia da ficha, e que ninguém consiga
   disparar cobrança em nome de outra pessoa.
   ═══════════════════════════════════════════════════════════════════════ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const API = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'docs/css/main.css'), 'utf8');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

/* Roda as duas funções puras num contexto de mentira. O resto da tela é
   verificado por leitura do fonte, como no resto do projeto. */
function montar(hoje = '2026-08-05') {
  const ctx = vm.createContext({
    _crmTodayLocalIso: () => hoje,
    _crmFmtDate: iso => String(iso).split('-').reverse().join('/'),
    fmtBRL: v => 'R$ ' + Number(v).toFixed(2),
    _appText: (k, f, v) => String(f == null ? k : f)
      .replace(/\{(\w+)\}/g, (_, n) => (v && v[n] !== undefined ? v[n] : '')),
    _crmRecebido: r => (r.status === 'paid' ? Number(r.value) || 0
      : r.status === 'partial' ? Math.min(Math.max(Number(r.paidAmount) || 0, 0), Number(r.value) || 0)
      : 0),
    Number, String, Math, Date, Object,
  });
  ctx._crmAReceber = r => Math.max(0, (Number(r.value) || 0) - ctx._crmRecebido(r));
  vm.runInContext(recortar(APP, 'function _crmDiasDeAtraso('), ctx);
  vm.runInContext(recortar(APP, 'function _crmTextoDaCobranca('), ctx);
  return ctx;
}

const REG = (extra) => Object.assign({
  id: 'crm_1', name: 'Padaria do Ze', value: 1000, status: 'pending',
  dueDate: '2026-07-29', description: '',
}, extra || {});

test('os dias de atraso saem de texto, e nao de fuso', () => {
  /* `new Date('2026-08-05')` nasce em UTC: no Brasil, as 21h de 04/08 ele ja
     e 05/08, e um vencimento de hoje apareceria como atrasado. Comparar
     aaaa-mm-dd como string nao tem esse buraco. */
  const ctx = montar('2026-08-05');
  assert.equal(ctx._crmDiasDeAtraso(REG({ dueDate: '2026-07-29' })), 7);
  assert.equal(ctx._crmDiasDeAtraso(REG({ dueDate: '2026-08-05' })), 0, 'vence hoje nao esta atrasado');
  assert.equal(ctx._crmDiasDeAtraso(REG({ dueDate: '2026-09-01' })), 0);
  assert.equal(ctx._crmDiasDeAtraso(REG({ dueDate: '' })), 0, 'sem data nao ha atraso');
  const fn = recortar(APP, 'function _crmDiasDeAtraso(');
  assert.equal(/new Date\(venc\)|new Date\(hoje\)/.test(fn), false,
    'voltou a construir Date a partir da string, e com isso o fuso volta');
});

test('quem ja pagou parte e cobrado pelo que FALTA, e o texto diz isso', () => {
  /* Cobrar o valor cheio de quem ja pagou metade e o erro que faz o cliente
     parar de responder. */
  const ctx = montar();
  const txt = ctx._crmTextoDaCobranca(REG({ status: 'partial', paidAmount: 400 }), '');
  assert.match(txt, /R\$ 600\.00/, 'cobrou o valor cheio');
  assert.match(txt, /ja recebemos R\$ 400\.00|já recebemos R\$ 400\.00/,
    'o texto nao reconhece o que ja entrou');
});

test('o texto muda quando ha atraso, e quando nao ha data', () => {
  const ctx = montar('2026-08-05');
  assert.match(ctx._crmTextoDaCobranca(REG(), ''), /7 dias/);
  assert.match(ctx._crmTextoDaCobranca(REG({ dueDate: '2026-09-10' }), ''), /vencimento em 10\/09\/2026/);
  assert.match(ctx._crmTextoDaCobranca(REG({ dueDate: '' }), ''), /ainda em aberto/);
});

test('o recado escrito a mao entra no texto', () => {
  const ctx = montar();
  assert.match(ctx._crmTextoDaCobranca(REG(), 'Consegue confirmar?'), /Consegue confirmar\?/);
});

test('a previa e o e-mail saem do MESMO texto', () => {
  /* Um texto na tela e outro no e-mail seria a pessoa mandar uma coisa
     achando que mandou outra. */
  const fn = APP.slice(APP.indexOf('async function crmCobrarCliente('),
                       APP.indexOf('async function crmEnviarCobrancaPorEmail('));
  assert.match(fn, /previa\.textContent = _crmTextoDaCobranca\(rec, recado\.value\)/);
  assert.match(fn, /recado\.addEventListener\('input', repintar\)/,
    'a previa precisa acompanhar o que esta sendo digitado');
});

test('o valor da cobranca e calculado NO SERVIDOR', () => {
  /* Um valor vindo do corpo do POST seria um numero que o servidor afirma
     sem ter conferido — e cobranca com valor errado destroi a confianca do
     cliente na conta inteira, nao so naquele e-mail. */
  const i = API.indexOf("body.acao === 'cobrarCliente'");
  assert.ok(i > 0, 'a rota da cobranca sumiu');
  const bloco = API.slice(i, API.indexOf("body.acao === 'enviarRecibo'"));
  assert.match(bloco, /const valorCheio = Number\(ficha\.value\)/);
  assert.match(bloco, /const falta = Math\.max\(0, valorCheio - recebido\)/);
  assert.equal(/body\.(valor|falta|total|vencimento)/.test(bloco), false,
    'o valor passou a vir do cliente');
  // Nada a receber nao vira e-mail.
  assert.match(bloco, /if \(falta <= 0\)/);
});

test('a cobranca so alcanca os proprios clientes', () => {
  const i = API.indexOf("body.acao === 'cobrarCliente'");
  const bloco = API.slice(i, API.indexOf("body.acao === 'enviarRecibo'"));
  assert.match(bloco, /verifyIdToken/, 'envio sem login');
  assert.match(bloco, /resolveClientDestination/, 'sumiu a trava de quadro');
  assert.match(bloco, /ficha\.email/, 'o destinatario tem de sair da ficha');
  assert.match(bloco, /consumirCotaDeAviso/, 'envio sem teto queima a cota do provedor');
  /* Cobranca que nao se pode responder e cobranca que nao se pode resolver. */
  assert.match(bloco, /personal\/emitente/);
  assert.match(bloco, /responderPara: respostaPara/);
});

test('a data da ultima cobranca fica na ficha', () => {
  /* Sem ela, ninguem sabe se ja cobrou — e cobrar a mesma pessoa duas vezes
     no mesmo dia e o que faz um cliente bom deixar de responder. */
  const fn = APP.slice(APP.indexOf('async function crmCobrarCliente('),
                       APP.indexOf('async function crmEnviarCobrancaPorEmail('));
  assert.match(fn, /cobradoEm: _crmTodayLocalIso\(\)/);
  assert.match(fn, /app\.dunLastSent/, 'a tela precisa dizer quando foi a ultima');
});

test('cobrar aparece no menu so quando ha valor em aberto', () => {
  /* Abrir uma janela de cobranca para quem ja pagou seria oferecer o caminho
     de um constrangimento. */
  const fn = recortar(APP, 'function crmAbrirAcoesLinha(');
  assert.match(fn, /_crmAReceber\(_records\.find\(r => r\.id === id\) \|\| \{\}\) > 0/);
  assert.match(fn, /app\.dunAction/);
  assert.match(CSS, /\.cob-previa\{/);
  /* Os botoes usam as classes dos outros modais. Inventar nomes novos foi o
     que deixou os tres crus na tela: sem regra de CSS, o navegador desenha o
     botao padrao dele. */
  const janela = APP.slice(APP.indexOf('async function crmCobrarCliente('),
                           APP.indexOf('async function crmEnviarCobrancaPorEmail('));
  assert.match(janela, /class="m-btns"/);
  assert.match(janela, /class="m-confirm" id="cob-enviar"/);
  // `m-btn` seguido de aspas ou espaco — senao a regex casa com `m-btns`.
  assert.equal(/class="m-btn[" ]/.test(janela), false,
    'voltaram as classes que nao existem');
  assert.match(CSS, /\.campo-erro\{/, 'a linha de erro dos modais ficou sem regra');
});
