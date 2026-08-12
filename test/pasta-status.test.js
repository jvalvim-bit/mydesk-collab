'use strict';
/* Uma pasta de status tem duas fontes de verdade que precisam concordar:
   TIPOS_PASTA, que cria a pasta com um título e um tipo, e _smartStackKind,
   que redescobre o tipo lendo o título de volta. Quando as duas discordam, a
   pasta troca de tipo sozinha no login — _reconcileSmartStack vê a divergência,
   regrava a marca e reescreve o status de todas as notas de dentro.

   Foi assim que "Finalizado" (criada como closed) virava done: passavam a
   existir duas pastas done, e findSmartStackId escolhia entre elas por
   contagem de notas — a nota pulava de pasta quando o número mudava.

   Este teste é a ida e volta: todo título que o app cria precisa ser relido
   como o mesmo tipo. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

function recortarFuncao(nome) {
  const ini = fonte.indexOf('function ' + nome + '(');
  assert.ok(ini > -1, 'função não encontrada: ' + nome);
  let prof = 0, i = fonte.indexOf('{', ini);
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') prof++;
    else if (fonte[i] === '}') { prof--; if (!prof) break; }
  }
  return fonte.slice(ini, i + 1);
}

function recortarArray(nome) {
  const ini = fonte.indexOf('const ' + nome + ' = [');
  assert.ok(ini > -1, 'const não encontrada: ' + nome);
  const fim = fonte.indexOf('\n];', ini);
  assert.ok(fim > ini, 'array não fechou: ' + nome);
  return fonte.slice(ini, fim + 3);
}

const ctx = vm.createContext({});
vm.runInContext(recortarArray('TIPOS_PASTA'), ctx);
vm.runInContext(recortarFuncao('_smartStackKind'), ctx);
const TIPOS_PASTA = vm.runInContext('TIPOS_PASTA', ctx);
const _smartStackKind = vm.runInContext('_smartStackKind', ctx);

test('o título que cria a pasta é relido como o mesmo tipo', () => {
  const divergentes = [];
  for (const tipo of TIPOS_PASTA) {
    if (!tipo.kind) continue;                 // pasta de nome livre não tem tipo
    const relido = _smartStackKind(tipo.titulo);
    if (relido !== tipo.kind) {
      divergentes.push(`"${tipo.titulo}" foi criada como ${tipo.kind} e é relida como ${relido}`);
    }
  }
  assert.deepEqual(divergentes, [],
    'a pasta trocaria de tipo sozinha no login e levaria as notas junto');
});

test('pasta de nome livre não vira pasta de status', () => {
  const livre = TIPOS_PASTA.find(t => t.livre);
  assert.ok(livre, 'a opção de nome livre precisa continuar existindo');
  assert.equal(livre.kind, null);
  // Nome de assunto não pode cair por acidente numa das listas de palavra-chave.
  ['Clientes', 'Projeto novo', 'Ideias', 'Reportes'].forEach(nome => {
    assert.equal(_smartStackKind(nome), null, nome + ' virou pasta de status');
  });
});

test('cada tipo de status tem um título só, sem dois donos', () => {
  const porTipo = new Map();
  for (const tipo of TIPOS_PASTA) {
    if (!tipo.kind) continue;
    assert.ok(!porTipo.has(tipo.kind),
      `dois títulos criam o tipo ${tipo.kind}: "${porTipo.get(tipo.kind)}" e "${tipo.titulo}"`);
    porTipo.set(tipo.kind, tipo.titulo);
  }
});
