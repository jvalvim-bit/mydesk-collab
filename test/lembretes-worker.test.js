'use strict';
/* A lógica de quando disparar cada aviso — que é onde erro de fuso e aviso
   retroativo aparecem. As funções são recortadas do worker real e executadas
   aqui; o Node tem Intl com America/Sao_Paulo, então o cálculo é o mesmo. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'worker.js'), 'utf8');
/* Recorta contando o delimitador certo: função abre em `{`, mas AVISOS é um
   array e abre em `[` — parar no primeiro `{` pegaria só o primeiro item. */
function recortar(nome, tipo = 'function') {
  const marca = tipo === 'const' ? 'const ' + nome + ' =' : 'function ' + nome + '(';
  const ini = src.indexOf(marca);
  assert.ok(ini > -1, nome);
  const posChave = src.indexOf('{', ini), posColch = src.indexOf('[', ini);
  const abre = tipo === 'const' && posColch > -1 && posColch < posChave ? '[' : '{';
  const fecha = abre === '[' ? ']' : '}';
  let prof = 0, i = src.indexOf(abre, ini);
  for (; i < src.length; i++) {
    if (src[i] === abre) prof++;
    else if (src[i] === fecha) { prof--; if (!prof) break; }
  }
  return src.slice(ini, i + 1) + (tipo === 'const' ? ';' : '');
}

const ctx = vm.createContext({ Intl, Date, Number, String, console });
vm.runInContext('const FUSO = "America/Sao_Paulo"; const HORA_DO_DIA = 8;', ctx);
vm.runInContext(recortar('AVISOS', 'const'), ctx);
['partesEmSP', 'instanteEmSP', 'decidir'].forEach(n => vm.runInContext(recortar(n), ctx));
const instanteEmSP = vm.runInContext('instanteEmSP', ctx);
const decidir = vm.runInContext('decidir', ctx);

test('data civil de São Paulo vira o instante certo em UTC', () => {
  // 30/07/2026 09:00 em SP (UTC-3) é 12:00 UTC.
  const t = instanteEmSP('2026-07-30', '09:00');
  assert.equal(new Date(t).toISOString(), '2026-07-30T12:00:00.000Z');
});

test('com hora marcada, o aviso da véspera sai no MESMO horário', () => {
  /* Quem marcou consulta às 19h é avisado às 19h do dia anterior. Às 8h da
     manhã o horário do dia seguinte ainda não diz nada a ninguém. */
  const inicio = instanteEmSP('2026-08-10', '19:00');
  const vespera19h = instanteEmSP('2026-08-09', '19:00');
  const r = decidir({ startsAt: inicio, hasTime: true }, vespera19h + 60000);
  assert.ok(r.enviar, 'o aviso da véspera deveria sair');
  assert.equal(r.enviar.chave, '1d');
  assert.equal(r.proximo, instanteEmSP('2026-08-10', '08:00'),
               'depois dele resta o aviso do dia, às 8h');
});

test('sem hora marcada, a véspera sai às 8h', () => {
  // Sem horário não há onde ancorar; 8h é o padrão.
  const inicio = instanteEmSP('2026-08-10', '');
  const r = decidir({ startsAt: inicio, hasTime: false },
                    instanteEmSP('2026-08-09', '08:00') + 60000);
  assert.equal(r.enviar.chave, '1d');
});

test('quem marca em cima da hora ainda recebe o aviso do dia', () => {
  /* Era a lacuna do aviso único: marcar hoje à noite algo para amanhã à tarde
     não rendia e-mail nenhum, porque a véspera já tinha passado. */
  const inicio = instanteEmSP('2026-08-10', '14:00');
  const marcadoOntemANoite = instanteEmSP('2026-08-09', '22:00');
  const nada = decidir({ startsAt: inicio, hasTime: true }, marcadoOntemANoite);
  assert.equal(nada.enviar, null, 'nada devido às 22h');
  assert.equal(nada.proximo, instanteEmSP('2026-08-10', '08:00'),
               'mas o aviso do dia está a caminho');

  const r = decidir({ startsAt: inicio, hasTime: true },
                    instanteEmSP('2026-08-10', '08:00') + 60000);
  assert.equal(r.enviar.chave, 'day');
});

test('compromisso de madrugada não recebe o aviso "é hoje"', () => {
  // Avisar às 8h que algo é hoje às 6h chegaria depois da hora.
  const inicio = instanteEmSP('2026-08-10', '06:00');
  const r = decidir({ startsAt: inicio, hasTime: true },
                    instanteEmSP('2026-08-10', '08:00'));
  assert.ok(!r.enviar || r.enviar.chave !== 'day');
});

test('são no máximo dois avisos, e nenhum de horário', () => {
  /* Seis avisos por compromisso contra 100 e-mails por dia davam dezesseis
     compromissos diários para a base inteira. Se alguém reintroduzir os avisos
     de horário sem pensar na cota, este teste avisa. */
  const inicio = instanteEmSP('2026-08-12', '14:00');
  const chaves = new Set();
  for (let t = inicio - 4 * 86400000; t <= inicio + 3600000; t += 60000) {
    const r = decidir({ startsAt: inicio, hasTime: true }, t);
    if (r.enviar) chaves.add(r.enviar.chave);
  }
  assert.deepEqual([...chaves].sort(), ['1d', 'day']);
});

test('aviso antigo demais não é disparado com atraso', () => {
  const inicio = instanteEmSP('2026-08-10', '14:00');
  const r = decidir({ startsAt: inicio, hasTime: true }, inicio + 3600000);
  assert.equal(r.enviar, null);
  assert.equal(r.proximo, null);
});
