'use strict';
/* Testa o catálogo de modelos de ficha rodando o arquivo real do navegador em
   Node com `window` simulado — sem cópia da lista, que passaria enquanto o app
   quebra. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const janela = {};
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'nichos.js'), 'utf8'),
  vm.createContext({ window: janela })
);
const N = janela.MD_NICHOS;

test('o catálogo cobre vários ofícios, não só um', () => {
  assert.ok(N.lista.length >= 20, 'poucos modelos: ' + N.lista.length);
});

test('toda chave é única e todo modelo está completo', () => {
  const vistas = new Set();
  N.lista.forEach(m => {
    assert.ok(m.key && !vistas.has(m.key), 'chave repetida ou vazia: ' + m.key);
    vistas.add(m.key);
    ['nome', 'tag', 'ico', 'papel', 'documento'].forEach(c =>
      assert.ok(m[c], m.key + ': falta ' + c));
    assert.ok(Array.isArray(m.campos) && m.campos.length, m.key + ': sem campos');
    assert.ok(Array.isArray(m.checklist) && m.checklist.length, m.key + ': sem checklist');
  });
});

test('campo tem chave única dentro do modelo e tipo conhecido', () => {
  const tipos = new Set(['texto', 'data', 'valor', 'longo']);
  N.lista.forEach(m => {
    const vistas = new Set();
    m.campos.forEach(c => {
      assert.ok(c.k && !vistas.has(c.k), m.key + ': chave de campo repetida — ' + c.k);
      vistas.add(c.k);
      assert.ok(c.rot && c.ico, m.key + '.' + c.k + ': falta rótulo ou ícone');
      assert.ok(tipos.has(c.tipo), m.key + '.' + c.k + ': tipo desconhecido ' + c.tipo);
      if (c.selo) assert.ok(Array.isArray(c.selo) && c.selo.length, m.key + '.' + c.k + ': selo vazio');
    });
  });
});

test('nenhuma chave de campo colide com campo da ficha base', () => {
  // `campos` é gravado num objeto separado, mas chave igual à da ficha base
  // convida a confusão na hora de ler o registro.
  const base = new Set(['id', 'name', 'value', 'status', 'dueDate', 'email', 'phone',
                        'cpf', 'documents', 'checklist', 'template', 'campos']);
  N.lista.forEach(m => m.campos.forEach(c =>
    assert.ok(!base.has(c.k), m.key + ': chave "' + c.k + '" colide com a ficha base')));
});

test('ficha sem modelo cai no genérico, sem quebrar', () => {
  assert.equal(N.modeloDe(null).key, 'generico');
  assert.equal(N.modeloDe({}).key, 'generico');
  assert.equal(N.modeloDe({ template: 'inexistente' }).key, 'generico');
  assert.equal(N.modeloDe({ template: 'advocacia' }).key, 'advocacia');
});

test('a sugestão acerta o ofício pelo texto', () => {
  assert.equal(N.sugerir('Audiência de conciliação'), 'advocacia');
  assert.equal(N.sugerir('Clareamento e profilaxia'), 'odontologia');
  assert.equal(N.sugerir('Visita ao apartamento'), 'imobiliaria');
  assert.equal(N.sugerir('Entrevista para a vaga de analista'), 'rh');
  assert.equal(N.sugerir('Revisão do veículo, placa ABC'), 'automotivo');
  // Sem pista não inventa modelo: melhor ficha simples que modelo errado.
  assert.equal(N.sugerir('Fulano de tal'), null);
  assert.equal(N.sugerir(''), null);
  assert.equal(N.sugerir(null), null);
});

test('checklist inicial sai desmarcado e na ordem do modelo', () => {
  const c = N.checklistInicial('advocacia');
  assert.equal(c.length, N.porChave.advocacia.checklist.length);
  assert.ok(c.every(i => i.ok === false), 'etapa não deveria nascer concluída');
  assert.equal(c[0].t, N.porChave.advocacia.checklist[0]);
  assert.deepEqual(N.checklistInicial('nao-existe'), []);
});

test('o progresso conta certo e não divide por zero', () => {
  assert.deepEqual(N.progresso([]), { feitas: 0, total: 0, pct: 0 });
  assert.deepEqual(N.progresso(null), { feitas: 0, total: 0, pct: 0 });
  const p = N.progresso([{ ok: true }, { ok: false }, { ok: true }, { ok: false }]);
  assert.equal(p.feitas, 2);
  assert.equal(p.total, 4);
  assert.equal(p.pct, 50);
});

test('cada ofício chama a pessoa pelo nome do seu meio', () => {
  // Chamar paciente de "cliente" numa clínica é o detalhe que faz o software
  // parecer estrangeiro ao ofício.
  assert.equal(N.porChave.odontologia.papel, 'Paciente');
  assert.equal(N.porChave.educacao.papel, 'Aluno');
  assert.equal(N.porChave.veterinaria.papel, 'Tutor');
  assert.equal(N.porChave.rh.papel, 'Candidato');
  assert.equal(N.porChave.seguros.papel, 'Segurado');
});
