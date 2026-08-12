/* O database.rules.json do projeto é JSON anotado: tem linhas de comentário
   com // e, em alguns pontos, com uma barra invertida solta. Para validar,
   removo essas linhas antes de dar JSON.parse. */
const fs = require('node:fs');
const path = require('node:path');
const bruto = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
const limpo = bruto.split('\n')
  .filter(l => {
    const t = l.trim();
    return !(t.startsWith('//') || t.startsWith('\\'));
  })
  .join('\n');

const { test } = require('node:test');
const assert = require('node:assert');

const cfg = JSON.parse(limpo);
const r = cfg.rules;
const checagens = [
  ['índice em nextRunAt', JSON.stringify(r.reminderJobs['.indexOn']) === '["nextRunAt"]'],
  ['fila não é legível por qualquer um no nó pai', r.reminderJobs['.read'] === undefined],
  ['dono do job não pode ser trocado', /auth\.uid/.test(r.reminderJobs.$jobId.uid['.validate'])],
  ['campo livre é recusado', r.reminderJobs.$jobId.$outro['.validate'] === false],
  ['entregas fechadas ao navegador',
   r.reminderDeliveries['.read'] === false && r.reminderDeliveries['.write'] === false],
  ['nada de e-mail na fila', !JSON.stringify(r.reminderJobs).toLowerCase().includes('email')],
];

checagens.forEach(([nome, ok]) => test('regras — ' + nome, () => assert.ok(ok)));
