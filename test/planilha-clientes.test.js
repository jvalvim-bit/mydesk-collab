'use strict';
/* A planilha de clientes precisa refletir as fichas por nicho. Antes tudo o
   que o ofício acompanha caía dentro de "Descrição", numa célula só — e
   planilha existe para filtrar, somar e ordenar, o que não funciona sobre um
   parágrafo. A função é extraída do app.js real e executada aqui. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');
const janela = {};
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'nichos.js'), 'utf8'),
                vm.createContext({ window: janela }));

function recortar(nome) {
  const ini = fonte.indexOf('function ' + nome + '(');
  assert.ok(ini > -1, nome);
  let prof = 0, i = fonte.indexOf('{', ini);
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') prof++;
    else if (fonte[i] === '}') { prof--; if (!prof) break; }
  }
  return fonte.slice(ini, i + 1);
}

const ctx = vm.createContext({
  window: janela, MD_NICHOS: janela.MD_NICHOS, console,
  _crmFmtDate: iso => (iso ? String(iso).split('-').reverse().join('/') : ''),
  getRecordDisplayStatus: rec => (
    rec.status === 'paid' ? 'paid' : rec.status === 'partial' ? 'partial' : 'pending'
  ),
});
/* As contas de dinheiro entram REAIS, lidas do app.js: a planilha promete
   somar, e um duble aqui aprovaria colunas que nao fecham no produto. */
vm.runInContext(recortar('_crmRecebido'), ctx);
vm.runInContext(recortar('_crmAReceber'), ctx);
vm.runInContext(recortar('_crmSheetRows'), ctx);
const _crmSheetRows = vm.runInContext('_crmSheetRows', ctx);

const advogado = {
  name: 'Ana Beatriz', email: 'ana@x.com', value: 2500, status: 'pending',
  template: 'advocacia',
  campos: { processo: '0001234-56', vara: '3ª Vara', prazo: '2026-05-28',
            prazo__selo: 'Em andamento', honorarios: '2500' },
  checklist: [{ t: 'Procuração', ok: true }, { t: 'Protocolo', ok: false }],
  documents: [{ name: 'rg.pdf' }, { name: 'contrato.pdf' }],
};
const dentista = {
  name: 'Carlos Eduardo', value: 800, status: 'paid', template: 'odontologia',
  campos: { procedimento: 'Clareamento', retorno: '2026-06-10', retorno__selo: 'Agendado' },
};
const simples = { name: 'Marina', value: 1000, status: 'pending', description: 'Criação de site' };

test('carteira sem modelo mantém a planilha antiga, sem colunas de nicho', () => {
  const [cab, linha] = _crmSheetRows([simples]);
  assert.equal(cab[0], 'Nome');
  assert.ok(!cab.includes('Modelo'), 'não deveria ter coluna Modelo');
  assert.equal(cab[cab.length - 1], 'Descrição');
  assert.equal(linha[0], 'Marina');
  assert.equal(linha[linha.length - 1], 'Criação de site');
});

test('um único modelo gera colunas sem prefixo', () => {
  const [cab, linha] = _crmSheetRows([advogado]);
  assert.ok(cab.includes('Processo'), 'faltou a coluna Processo');
  assert.ok(cab.includes('Prazo (situação)'), 'faltou a coluna da etiqueta');
  assert.ok(!cab.some(c => c.includes('·')), 'não deveria prefixar com um modelo só');
  assert.equal(linha[cab.indexOf('Processo')], '0001234-56');
  assert.equal(linha[cab.indexOf('Prazo (situação)')], 'Em andamento');
  assert.equal(linha[cab.indexOf('Modelo')], 'Acompanhamento jurídico');
});

test('campo interno aparece na planilha — quem lê é o dono da carteira', () => {
  const [cab, linha] = _crmSheetRows([advogado]);
  assert.ok(cab.includes('Honorários combinados'));
  assert.equal(linha[cab.indexOf('Honorários combinados')], 2500);
});

test('carteira mista prefixa as colunas para não colidir', () => {
  const [cab, l1, l2] = _crmSheetRows([advogado, dentista]);
  assert.ok(cab.includes('Advocacia · Processo'));
  assert.ok(cab.includes('Odontologia · Procedimento'));
  // Cada linha só preenche as colunas do seu próprio modelo.
  assert.equal(l1[cab.indexOf('Odontologia · Procedimento')], '');
  assert.equal(l2[cab.indexOf('Advocacia · Processo')], '');
  assert.equal(l2[cab.indexOf('Odontologia · Procedimento')], 'Clareamento');
});

test('etapas viram duas colunas legíveis, não um bloco de texto', () => {
  const [cab, linha] = _crmSheetRows([advogado]);
  assert.equal(linha[cab.indexOf('Etapas concluídas')], 'Procuração');
  assert.equal(linha[cab.indexOf('Etapas pendentes')], 'Protocolo');
});

test('anexos saem nomeados, e data vem em pt-BR', () => {
  const [cab, linha] = _crmSheetRows([advogado]);
  assert.equal(linha[cab.indexOf('Anexos')], 'rg.pdf · contrato.pdf');
  assert.equal(linha[cab.indexOf('Prazo')], '28/05/2026');
});

test('toda linha tem exatamente o tamanho do cabeçalho', () => {
  // Linha mais curta que o cabeçalho desalinha a planilha inteira.
  const tabela = _crmSheetRows([advogado, dentista, simples]);
  const largura = tabela[0].length;
  tabela.slice(1).forEach((l, i) =>
    assert.equal(l.length, largura, 'linha ' + (i + 1) + ' com largura diferente'));
});

test('parcial sai na planilha como duas colunas somaveis', () => {
  /* "Pago"/"Pendente" e texto: nao entra em SOMA. Quem exporta a carteira
     quer fechar caixa na propria planilha, entao o recebido e o que falta
     precisam ser NUMERO, e as duas colunas precisam somar o valor cheio. */
  const meio = {
    name: 'Joana', value: 1000, status: 'partial', paidAmount: 400,
    description: 'Entrada paga',
  };
  const [cab, linha] = _crmSheetRows([meio]);

  const iValor = cab.indexOf('Valor (R$)');
  const iRec   = cab.indexOf('Recebido (R$)');
  const iFalta = cab.indexOf('A receber (R$)');

  assert.ok(iRec > -1 && iFalta > -1, 'as colunas de parcial sumiram do cabecalho');
  assert.equal(typeof linha[iRec], 'number', 'recebido precisa ser numero');
  assert.equal(typeof linha[iFalta], 'number', 'a receber precisa ser numero');
  assert.equal(linha[iRec], 400);
  assert.equal(linha[iFalta], 600);
  assert.equal(linha[iRec] + linha[iFalta], linha[iValor], 'a soma nao fecha');
  assert.equal(linha[cab.indexOf('Status')], 'Parcial');
});

test('pago e pendente continuam somando certo nas colunas novas', () => {
  const [cab, pago, pendente] = _crmSheetRows([
    { name: 'Quitado', value: 500, status: 'paid' },
    { name: 'Devendo', value: 500, status: 'pending' },
  ]);
  const iRec = cab.indexOf('Recebido (R$)'), iFalta = cab.indexOf('A receber (R$)');

  assert.equal(pago[iRec], 500);
  assert.equal(pago[iFalta], 0);
  assert.equal(pendente[iRec], 0);
  assert.equal(pendente[iFalta], 500);
});
