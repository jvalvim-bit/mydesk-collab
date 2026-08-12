'use strict';
/* O ciclo que fecha o pedido: escolher um modelo monta o formulário, o cliente
   preenche, e a resposta cai na ficha SEM ninguém redigitar. Os dois lados —
   gerar campos e traduzir a resposta de volta — são extraídos do app.js real e
   executados aqui, para o teste falhar se um dos lados mudar sem o outro. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

const janela = {};
vm.runInContext(
  fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'nichos.js'), 'utf8'),
  vm.createContext({ window: janela })
);

/* Recorta uma função do app.js pelo nome, contando chaves. Evita copiar a
   lógica para o teste, que é o que faria o teste passar com o app quebrado. */
function recortar(nome) {
  const ini = fonte.indexOf('function ' + nome + '(');
  assert.ok(ini > -1, 'função não encontrada: ' + nome);
  let prof = 0, i = fonte.indexOf('{', ini);
  const abre = i;
  for (; i < fonte.length; i++) {
    if (fonte[i] === '{') prof++;
    else if (fonte[i] === '}') { prof--; if (!prof) break; }
  }
  assert.ok(i > abre, 'não fechou: ' + nome);
  return fonte.slice(ini, i + 1);
}

const ctx = vm.createContext({
  /* O teto sai do arquivo, e nao de um numero copiado aqui: copia esconde
     divergencia, que e justamente o que este teste existe para pegar. */
  window: janela, MD_NICHOS: janela.MD_NICHOS,
  _appText: (chave, padrao) => String(padrao === undefined ? chave : padrao),
  console, Date,
});
/* As tabelas de mapeamento que a tradução usa. Extraídas do mesmo arquivo,
   pelo mesmo motivo: cópia no teste esconderia divergência. */
function recortarConst(nome) {
  const ini = fonte.indexOf('const ' + nome + ' =');
  assert.ok(ini > -1, 'const não encontrada: ' + nome);
  const fim = fonte.indexOf('\n};', ini);
  const fimLinha = fonte.indexOf(';', ini);
  // Objeto multilinha termina em "\n};"; expressão simples, no primeiro ";".
  return fim > -1 && (fimLinha > fim || fonte.slice(ini, fimLinha).includes('{'))
    ? fonte.slice(ini, fim + 3)
    : fonte.slice(ini, fimLinha + 1);
}
['CRM_MAPA_FORM', 'CRM_ROTULO_FICHA', 'CRM_CAMPOS_FICHA', 'FM_MAX_CAMPOS']
  .forEach(c => vm.runInContext(recortarConst(c), ctx));

/* `recortarConst` procura o fim no fecho de OBJETO. A lista do cadastro
   padrao fecha em colchete — e com o extrator de objeto ela engolia o arquivo
   inteiro ate o proximo objeto multilinha. */
function recortarLista(nome) {
  const ini = fonte.indexOf('const ' + nome + ' = [');
  assert.ok(ini > -1, 'lista nao encontrada: ' + nome);
  const fim = fonte.indexOf('\n];', ini);
  assert.ok(fim > ini, 'lista nao fechou: ' + nome);
  return fonte.slice(ini, fim + 3);
}
vm.runInContext(recortarLista('FM_CADASTRO_PADRAO'), ctx);

vm.runInContext(recortar('_fmCamposDoNicho'), ctx);
vm.runInContext(recortar('_crmDadosDaResposta'), ctx);
const _fmCamposDoNicho = vm.runInContext('_fmCamposDoNicho', ctx);
const _crmDadosDaResposta = vm.runInContext('_crmDadosDaResposta', ctx);

const N = janela.MD_NICHOS;

test('o modelo monta o formulário com cadastro + campos do nicho', () => {
  const campos = _fmCamposDoNicho(N.porChave.odontologia);
  assert.equal(campos[0].rotulo, 'Nome completo');
  assert.equal(campos[1].tipo, 'email');
  assert.equal(campos[2].tipo, 'telefone');
  // Cada campo do modelo carrega a chave no id — é o elo do ciclo.
  N.porChave.odontologia.campos.filter(c => !c.interno).forEach(c => {
    const gerado = campos.find(x => x.id === 'n_' + c.k);
    assert.ok(gerado, 'faltou o campo ' + c.k);
    assert.equal(gerado.rotulo, c.rot);
  });
});

test('campo interno nunca vira pergunta de formulário', () => {
  // O que é registro de quem atende — honorários, parecer, risco, evolução —
  // não pode ser perguntado a quem preenche.
  N.lista.forEach(m => {
    const campos = _fmCamposDoNicho(m);
    m.campos.filter(c => c.interno).forEach(c => {
      assert.ok(!campos.some(x => x.id === 'n_' + c.k),
                m.key + ': o campo interno "' + c.k + '" vazou para o formulário');
    });
  });
  // E a psicologia, que foi o caso mais sensível, mantém risco e evolução fora.
  const psi = _fmCamposDoNicho(N.porChave.psicologia).map(c => c.id);
  ['n_risco', 'n_evolucao', 'n_plano'].forEach(id =>
    assert.ok(!psi.includes(id), id + ' não pode ser perguntado ao paciente'));
  // Mas o que ajuda o atendimento continua sendo perguntado.
  ['n_motivo', 'n_medicacao', 'n_emergencia'].forEach(id =>
    assert.ok(psi.includes(id), id + ' deveria estar no formulário'));
});

test('todo modelo com anexo gera o campo de arquivo, e só um', () => {
  N.lista.filter(m => m.anexo).forEach(m => {
    const arquivos = _fmCamposDoNicho(m).filter(c => c.tipo === 'arquivo');
    assert.equal(arquivos.length, 1, m.key + ': esperava exatamente um anexo');
    assert.equal(arquivos[0].rotulo, m.anexo);
  });
  // Modelo sem anexo não pede arquivo nenhum.
  N.lista.filter(m => !m.anexo).forEach(m => {
    assert.equal(_fmCamposDoNicho(m).filter(c => c.tipo === 'arquivo').length, 0, m.key);
  });
});

/* A FOTO É SÓ DO FORMULÁRIO DE VAGA.

   Ela existe porque o funil desenha um rosto em cada cartão, e a resposta é o
   único caminho da imagem do celular de quem se candidata até quem recruta.
   Num orçamento ou numa ficha de paciente seria coleta de dado pessoal sem uso
   nenhum — e o que não serve a nada não se pede. */
test('só o modelo de recrutamento pede foto', () => {
  const rh = _fmCamposDoNicho(N.porChave.rh);
  const fotos = rh.filter(c => c.tipo === 'foto');
  assert.equal(fotos.length, 1, 'o formulário da vaga precisa de um campo de foto');
  assert.equal(fotos[0].obrigatorio, false, 'foto não pode barrar uma candidatura');

  N.lista.filter(m => m.key !== 'rh').forEach(m => {
    assert.equal(_fmCamposDoNicho(m).filter(c => c.tipo === 'foto').length, 0,
      m.key + ': pediu foto sem ter onde usá-la');
  });
});

test('campo com etiqueta vira seleção com as mesmas opções', () => {
  const campos = _fmCamposDoNicho(N.porChave.imobiliaria);
  const visita = campos.find(c => c.id === 'n_visita');
  assert.equal(visita.tipo, 'selecao');
  assert.deepEqual(visita.opcoes, N.porChave.imobiliaria.campos.find(c => c.k === 'visita').selo);
});

test('nenhum modelo estoura o teto de campos do formulário', () => {
  /* O teto vem do arquivo — copiar o numero aqui esconderia divergencia. E a
     conta que importa: identificacao (3) + cadastro padrao (9) + as perguntas
     do nicho tem de caber, senao o corte cai justamente nas perguntas, que
     sao o motivo de a ficha existir. */
  const teto = vm.runInContext('FM_MAX_CAMPOS', ctx);
  N.lista.forEach(m => {
    const n = _fmCamposDoNicho(m).length;
    assert.ok(n <= teto, m.key + ': ' + n + ' campos, teto ' + teto);
  });
});

test('toda ficha especializada pergunta o cadastro completo', () => {
  /* Sem estes campos, o cliente chegava a carteira com metade da ficha em
     branco — e a pessoa ja tinha respondido tudo o que foi perguntado. */
  N.lista.filter(m => m.key !== 'rh').forEach(m => {
    const campos = _fmCamposDoNicho(m);
    ['cpf', 'nascimento', 'genero', 'estado_civil', 'escolaridade',
     'profissao', 'cep', 'municipio', 'estado'].forEach(k => {
      const c = campos.find(x => x.id === 'p_' + k);
      assert.ok(c, m.key + ' ficou sem o campo ' + k);
      /* O TIPO especializado, e nao `texto`: e o tipo que liga o campo ao
         registro do cliente. Como texto, chegaria em branco na carteira. */
      assert.equal(c.tipo, k, m.key + ': ' + k + ' virou ' + c.tipo);
    });
  });
});

test('nome, e-mail e telefone sao obrigatorios; o cadastro nao', () => {
  /* Sem os tres nao da para identificar nem responder. Ja exigir CPF de quem
     pede um orcamento troca uma ficha incompleta por nenhuma ficha — quem
     quiser exigir marca no passo Estrutura. */
  const campos = _fmCamposDoNicho(N.porChave.psicologia);
  assert.equal(campos[0].obrigatorio, true, 'nome');
  assert.equal(campos[1].obrigatorio, true, 'e-mail');
  assert.equal(campos[2].obrigatorio, true, 'telefone');
  campos.filter(c => String(c.id).startsWith('p_'))
    .forEach(c => assert.equal(c.obrigatorio, false, c.id + ' nasceu obrigatorio'));
});

test('a identificacao vem ANTES das perguntas do nicho', () => {
  /* Um formulario que comeca perguntando a queixa clinica e volta ao CEP no
     fim faz a pessoa trocar de assunto duas vezes. */
  const campos = _fmCamposDoNicho(N.porChave.psicologia);
  const ultimoPadrao = campos.map(c => c.id).lastIndexOf('p_estado');
  const primeiroNicho = campos.findIndex(c => String(c.id).startsWith('n_'));
  assert.ok(primeiroNicho > ultimoPadrao, 'as perguntas do nicho subiram');
});

test('a resposta cai nos campos da ficha, não em texto solto', () => {
  const modelo = N.porChave.advocacia;
  const campos = _fmCamposDoNicho(modelo);
  const resp = {
    ts: Date.now(),
    valores: {
      c1: 'Ana Beatriz Almeida',
      c2: 'ana@exemplo.com',
      c3: '(11) 99999-0000',
      n_processo: '0001234-56.2026.8.26.0100',
      n_prazo: '2026-05-28',
      n_vara: '3ª Vara Cível',
    },
  };
  const dados = _crmDadosDaResposta(campos, resp, 'Cadastro jurídico', 'advocacia');

  assert.equal(dados.template, 'advocacia');
  assert.equal(dados.name, 'Ana Beatriz Almeida');
  assert.equal(dados.email, 'ana@exemplo.com');
  assert.equal(dados.phone, '(11) 99999-0000');
  assert.equal(dados.campos.processo, '0001234-56.2026.8.26.0100');
  assert.equal(dados.campos.prazo, '2026-05-28');
  assert.equal(dados.campos.vara, '3ª Vara Cível');
  // O que virou campo da ficha não pode aparecer também nas anotações: seria o
  // mesmo dado em dois lugares, e o das anotações envelheceria sozinho.
  assert.ok(!/processo/i.test(dados.description),
            'o número do processo vazou para as anotações');
  // A ficha nasce com as etapas do trabalho, desmarcadas.
  assert.equal(dados.checklist.length, modelo.checklist.length);
  assert.ok(dados.checklist.every(i => i.ok === false));
});

test('resposta de campo com etiqueta vira o selo de estado', () => {
  const modelo = N.porChave.imobiliaria;
  const campos = _fmCamposDoNicho(modelo);
  const dados = _crmDadosDaResposta(campos, { valores: {
    c1: 'Carlos', n_visita: 'Confirmado', n_imovel: 'Apto 41, Centro',
  } }, 'Interesse', 'imobiliaria');
  assert.equal(dados.campos.visita__selo, 'Confirmado');
  assert.equal(dados.campos.imovel, 'Apto 41, Centro');
});

test('formulário sem modelo continua funcionando como antes', () => {
  const campos = [
    { id: 'c1', tipo: 'texto', rotulo: 'Nome completo' },
    { id: 'c2', tipo: 'email', rotulo: 'E-mail' },
    { id: 'c3', tipo: 'longo', rotulo: 'Mensagem' },
  ];
  const dados = _crmDadosDaResposta(campos,
    { valores: { c1: 'João', c2: 'j@x.com', c3: 'Quero um orçamento' } }, 'Contato', '');
  assert.equal(dados.name, 'João');
  assert.equal(dados.email, 'j@x.com');
  assert.equal(dados.template, undefined, 'sem modelo não deve inventar um');
  assert.match(dados.description, /Quero um orçamento/);
  assert.match(dados.description, /via formulário "Contato"/);
});

test('campo do modelo em branco não cria chave vazia na ficha', () => {
  const campos = _fmCamposDoNicho(N.porChave.advocacia);
  const dados = _crmDadosDaResposta(campos,
    { valores: { c1: 'Ana', n_processo: '   ' } }, 'F', 'advocacia');
  assert.equal(dados.campos.processo, undefined);
});

/* ── As três portas de entrada gravam a mesma ficha ──
   Nota de Cliente pelo board, cadastro da aba Clientes e resposta de
   formulário escrevem no MESMO registro. Se uma delas parar de gravar
   `template`, `campos` ou `checklist`, a personalização passa a depender de
   por onde a pessoa entrou — que foi exatamente o defeito relatado. */
test('as três portas de entrada gravam template, campos e checklist', () => {
  const chamadas = [...fonte.matchAll(/createRecord\(\{([\s\S]{0,600}?)\}\)/g)].map(m => m[1]);
  assert.ok(chamadas.length >= 2, 'esperava ao menos duas chamadas a createRecord');

  // A criação a partir do board (modal "Nota de Cliente")
  const doBoard = chamadas.find(c => c.includes('_mcTemplate'));
  assert.ok(doBoard, 'o modal Nota de Cliente não passa modelo ao createRecord');
  ['template', 'campos', 'checklist'].forEach(k =>
    assert.ok(doBoard.includes(k + ':'), 'Nota de Cliente não grava ' + k));

  // O cadastro completo da aba Clientes
  const doCadastro = chamadas.find(c => c.includes('tplSel.value'));
  assert.ok(doCadastro, 'o cadastro da aba Clientes não passa modelo');
  ['template', 'campos', 'checklist'].forEach(k =>
    assert.ok(doCadastro.includes(k + ':'), 'cadastro não grava ' + k));

  // E o registro guarda os três campos
  const iniCriacao = fonte.indexOf('async function createRecord(');
  const criacao = fonte.slice(iniCriacao, fonte.indexOf('const db = _crmDB();', iniCriacao));
  ['template:', 'campos:', 'checklist:'].forEach(k =>
    assert.ok(criacao.includes(k), 'createRecord não persiste ' + k));
});

test('a nota lê a ficha do registro, e não de uma cópia própria', () => {
  const pintar = fonte.slice(fonte.indexOf('function _pintarBlocoCliente('),
                             fonte.indexOf('function _crmMarcarEtapa('));
  assert.ok(pintar.includes('rec.campos'), 'a nota não lê rec.campos');
  assert.ok(pintar.includes('rec.checklist'), 'a nota não lê rec.checklist');
  assert.ok(pintar.includes('MD_NICHOS.modeloDe') || pintar.includes('N.modeloDe'),
            'a nota não resolve o modelo pelo catálogo');
});
