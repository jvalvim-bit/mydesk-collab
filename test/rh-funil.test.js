'use strict';
/* O funil de recrutamento lê etapa, vaga e resultado de registros que já
   existiam — a moldura mudou, o dado não. O que pode quebrar em silêncio é
   justamente essa leitura: um candidato parado na coluna errada não dá erro
   nenhum, só mente na tela. Este arquivo roda o rh.js real do navegador em
   Node, com o catálogo de nichos real por baixo. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, 'docs', 'js', f), 'utf8');

const janela = { localStorage: new Map() };
janela.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
};
const contexto = vm.createContext({ window: janela, localStorage: janela.localStorage });
vm.runInContext(ler('nichos.js'), contexto);
vm.runInContext(ler('rh.js'), contexto);

const N = janela.MD_NICHOS;
const RH = janela.MD_RH;
const ETAPAS = N.porChave.rh.checklist;

/* Candidato como o app grava: modelo 'rh', checklist do próprio modelo e os
   campos que a ficha de processo seletivo pergunta. */
function candidato(nome, feitas, extra) {
  return Object.assign({
    id: 'crm_' + nome,
    name: nome,
    template: 'rh',
    createdAt: Date.UTC(2026, 0, 10),
    updatedAt: Date.UTC(2026, 0, 30),
    checklist: ETAPAS.map((t, i) => ({ t, ok: i < feitas })),
    campos: {},
  }, extra || {});
}

test('o modelo de recrutamento existe e traz as etapas do processo', () => {
  assert.ok(RH.disponivel(), 'rh.js não achou o nicho de recrutamento');
  assert.deepEqual(RH.etapas(), ETAPAS);
  assert.ok(ETAPAS.length >= 5, 'funil raso demais: ' + ETAPAS.length);
});

test('o padrão é financeiro — trocar de modelo é escolha, não surpresa', () => {
  assert.equal(RH.modelo(), 'financeiro');
  assert.equal(RH.ativo(), false);
  RH.definirModelo('rh');
  assert.equal(RH.ativo(), true);
  RH.definirModelo('financeiro');
  assert.equal(RH.ativo(), false);
});

test('a etapa é uma casa DEPOIS da última concluída', () => {
  assert.equal(RH.etapaDe(candidato('a', 0)).indice, 0, 'ninguém marcado → primeira etapa');
  assert.equal(RH.etapaDe(candidato('b', 1)).indice, 1);
  assert.equal(RH.etapaDe(candidato('c', 3)).indice, 3);
});

test('todas as etapas marcadas = processo concluído, e ele não some do funil', () => {
  const e = RH.etapaDe(candidato('d', ETAPAS.length));
  assert.equal(e.concluido, true);
  assert.equal(e.indice, ETAPAS.length - 1, 'concluído tem de ficar na última coluna');
});

test('etapa marcada fora de ordem conta como avanço, e não volta para o começo', () => {
  /* Quem marcou "Entrevista técnica" sem marcar a triagem avançou de verdade.
     Ler pela PRIMEIRA em branco jogaria essa pessoa de volta à coluna 0 e
     apagaria da tela um trabalho que foi feito. */
  const salteado = candidato('e', 0);
  salteado.checklist[2].ok = true;
  assert.equal(RH.etapaDe(salteado).indice, 3);
});

test('ficha sem checklist nenhum começa na primeira etapa em vez de quebrar', () => {
  const cru = candidato('f', 0);
  delete cru.checklist;
  const e = RH.etapaDe(cru);
  assert.equal(e.indice, 0);
  assert.equal(e.concluido, false);
});

test('só entra no funil quem usa o modelo de recrutamento', () => {
  const lista = [candidato('g', 1), { id: 'crm_x', name: 'Cliente', template: 'advocacia' },
                 { id: 'crm_y', name: 'Avulso' }];
  assert.deepEqual(RH.candidatos(lista).map(r => r.name), ['g']);
});

test('reprovado é reconhecido nos três idiomas do selo', () => {
  const campoVaga = N.porChave.rh.campos.find(c => c.k === 'vaga');
  const rotuloPt = campoVaga.selo[3];
  assert.ok(RH.reprovado(candidato('h', 1, { campos: { vaga__selo: rotuloPt } })));
  assert.ok(RH.reprovado(candidato('i', 1, { campos: { vaga__selo: 'Rejected' } })));
  assert.ok(RH.reprovado(candidato('j', 1, { campos: { vaga__selo: 'Rechazado' } })));
  assert.equal(RH.reprovado(candidato('k', 1, { campos: { vaga__selo: campoVaga.selo[2] } })), false);
});

test('a entrevista só vale como data quando é uma data', () => {
  assert.equal(RH.entrevistaDe(candidato('l', 1, { campos: { entrevista: '2026-08-14' } })), '2026-08-14');
  assert.equal(RH.entrevistaDe(candidato('m', 1, { campos: { entrevista: 'quinta' } })), '');
  assert.equal(RH.entrevistaDe(candidato('n', 1)), '');
});

test('os indicadores separam quem está em processo, quem entrou e quem saiu', () => {
  const campoVaga = N.porChave.rh.campos.find(c => c.k === 'vaga');
  const lista = [
    candidato('andando', 2, { campos: { vaga: 'Analista' } }),
    candidato('admitido', ETAPAS.length, { campos: { vaga: 'Analista' } }),
    candidato('reprovado', 1, { campos: { vaga: 'Designer', vaga__selo: campoVaga.selo[3] } }),
    { id: 'crm_z', name: 'Cliente comum', template: 'advocacia', value: 900 },
  ];
  const d = RH.indicadores(lista);
  assert.equal(d.total, 3, 'o cliente de outro nicho não é candidato');
  assert.equal(d.admitidos, 1);
  assert.equal(d.emProcesso, 1, 'reprovado e admitido não estão em processo');
  assert.equal(d.reprovados, 1);
  assert.equal(Math.round(d.aproveitamento * 100), 33);
  /* `vagas` passou a devolver {chave, rotulo} em vez de texto solto: a vaga
     virou registro, e duas vagas de mesmo nome precisam continuar separadas.
     Aqui não há vaga cadastrada, então a chave CONTINUA sendo o texto antigo
     — é isso que mantém o candidato de antes filtrável sem migração. */
  assert.deepEqual(d.vagas.map(v => v.rotulo), ['Analista', 'Designer']);
  assert.deepEqual(d.vagas.map(v => v.chave), ['Analista', 'Designer'],
    'sem vaga cadastrada, a chave tem de cair no texto legado');
  assert.equal(d.vagas.every(v => v.legado), true,
    'vaga que só existe escrita no candidato precisa se declarar legada');
  assert.equal(d.porEtapa.length, ETAPAS.length);
  assert.equal(d.porEtapa.reduce((a, e) => a + e.n, 0), 2, 'reprovado não ocupa coluna');
});

test('o tempo médio até admitir sai da própria ficha, em dias', () => {
  const c = candidato('rapido', ETAPAS.length);
  c.createdAt = Date.UTC(2026, 0, 1);
  c.updatedAt = Date.UTC(2026, 0, 11);
  assert.equal(Math.round(RH.indicadores([c]).tempoMedio), 10);
});

test('filtro de vaga e de etapa recortam o funil sem apagar o resto', () => {
  const lista = [
    candidato('ana',  0, { campos: { vaga: 'Analista' } }),
    candidato('bruno', 2, { campos: { vaga: 'Analista' } }),
    candidato('caio',  0, { campos: { vaga: 'Designer' } }),
  ];
  RH.filtroVaga('Analista'); RH.filtroEtapa(-1);
  assert.deepEqual(RH.visiveis(lista, '').map(r => r.name), ['ana', 'bruno']);
  assert.ok(RH.temFiltro());

  RH.filtroVaga(''); RH.filtroEtapa(0);
  assert.deepEqual(RH.visiveis(lista, '').map(r => r.name), ['ana', 'caio']);

  RH.filtroVaga(''); RH.filtroEtapa(-1);
  assert.equal(RH.temFiltro(), false);
  assert.equal(RH.visiveis(lista, '').length, 3);
});

test('a busca da faixa acha candidato por nome e por vaga', () => {
  const lista = [
    candidato('Marina', 1, { campos: { vaga: 'Pessoa Desenvolvedora' }, email: 'm@x.com' }),
    candidato('Tiago',  1, { campos: { vaga: 'Analista de dados' } }),
  ];
  RH.filtroVaga(''); RH.filtroEtapa(-1);
  assert.deepEqual(RH.visiveis(lista, 'marina').map(r => r.name), ['Marina']);
  assert.deepEqual(RH.visiveis(lista, 'dados').map(r => r.name), ['Tiago']);
  assert.deepEqual(RH.visiveis(lista, 'm@x').map(r => r.name), ['Marina']);
});

test('mover o cartão reescreve o checklist inteiro — e desfazer volta ao que era', async () => {
  /* Mover para a coluna i significa "ele ESTÁ na etapa i": tudo antes dela
     concluído, ela e o que vem depois em aberto. Sem reescrever o que vem
     depois, arrastar para trás deixaria etapas futuras marcadas. */
  const c = candidato('marta', 4);
  const lista = [c];
  const escritas = [];
  contexto.updateRecord = async (id, mudancas) => {
    escritas.push({ id, mudancas });
    Object.assign(c, mudancas);
    return c;
  };

  await RH.mover(c.id, 1, lista);
  assert.deepEqual(c.checklist.map(i => i.ok), ETAPAS.map((_, i) => i < 1));
  assert.equal(RH.etapaDe(c).indice, 1);

  await RH.mover(c.id, 3, lista);
  assert.deepEqual(c.checklist.map(i => i.ok), ETAPAS.map((_, i) => i < 3));
  assert.equal(escritas.length, 2);
  assert.deepEqual(Object.keys(escritas[0].mudancas), ['checklist'],
    'mover etapa não pode tocar em mais nada da ficha');
});

/* ── Triagem de currículos ──
   O que sobe para o Gemini é o que ele vai ler. Um candidato que cai fora do
   texto some da analise sem erro nenhum, e um curriculo que nao foi extraido
   viraria silencio — a leitura sairia como se a pessoa nao tivesse anexado
   nada. As duas coisas precisam aparecer no texto. */
test('o texto da triagem leva vaga, requisitos, ficha e currículo de cada um', async () => {
  contexto._textoDeDocumento = async doc => doc.name === 'ana.pdf'
    ? { situacao: 'ok', texto: 'Cinco anos com SQL e Python em time de dados.', nome: doc.name }
    : { situacao: 'imagem', texto: '', nome: doc.name };

  const lista = [
    candidato('Ana', 1, {
      campos: { vaga: 'Analista', experiencia: 'Estágio em BI', formacao: 'Estatística' },
      documents: [{ name: 'ana.pdf', type: 'application/pdf', dataUrl: 'data:,' }],
    }),
    candidato('Rui', 1, {
      campos: { vaga: 'Analista' },
      documents: [{ name: 'foto.png', type: 'image/png', dataUrl: 'data:,' }],
    }),
  ];

  const { texto, lidos, leituras } = await RH.textoDaTriagem(
    lista, 'Analista de dados', 'SQL e Python');
  assert.ok(texto.includes('Analista de dados'), 'a vaga tem de estar no texto');
  assert.ok(texto.includes('SQL e Python'), 'os requisitos tem de estar no texto');
  /* Cada bloco vai numerado: dois candidatos com o mesmo nome, ou com o mesmo
     currículo, eram lidos pelo modelo como um só e a análise voltava com uma
     entrada a menos do que os candidatos enviados. */
  assert.ok(texto.includes('Ana') && texto.includes('Rui'), 'todo candidato entra na lista');
  assert.match(texto, /CANDIDATO 1 DE 2/, 'o bloco precisa dizer a posição e o total');
  assert.match(texto, /CANDIDATO 2 DE 2/);
  assert.ok(texto.includes('Cinco anos com SQL'), 'o currículo lido tem de subir');
  assert.ok(texto.includes('Estágio em BI'), 'a ficha entra junto do currículo');
  assert.equal(lidos, 1);

  /* O MOTIVO precisa viajar junto. Sem ele o modelo confunde "não temos como
     abrir o arquivo" com "a pessoa não tem experiência", e a nota do candidato
     cai por um problema que é nosso, não dele. */
  assert.match(texto, /NÃO LIDO/, 'o bloco tem de declarar que o currículo não foi lido');
  assert.match(texto, /imagem \(digitalizado ou foto\)/,
    'o motivo específico tem de chegar ao modelo, e não uma frase genérica');
  assert.deepEqual(leituras.map(l => l.situacao), ['ok', 'imagem'],
    'a tela precisa saber o que houve com cada currículo');
  delete contexto._textoDeDocumento;
});

test('valor que não é texto NUNCA vira "[object Object]" no prompt', async () => {
  /* Foi o que apareceu na tela: o modelo descrevendo o candidato como "erro de
     formato do anexo (object Object)". Um campo malformado — ficha antiga,
     dado gravado por outro caminho — virava essa string e subia como se fosse
     o conteúdo. Perder o campo é melhor do que mandar lixo com aparência de
     resposta sobre uma pessoa real. */
  contexto._textoDeDocumento = async () => ({ situacao: 'semarquivo', texto: '' });
  const c = candidato('Ana', 1, {
    campos: {
      vaga: { algo: 'objeto' },          // malformado
      experiencia: ['lista', 'errada'],  // malformado
      formacao: 'Estatística',           // bom
      pretensao: 4500,                   // número é aproveitável
    },
  });
  const { texto } = await RH.textoDaTriagem([c], 'Analista', '');
  assert.ok(!texto.includes('[object Object]'), 'objeto vazou para o prompt');
  assert.ok(!/lista,errada/.test(texto), 'array vazou para o prompt');
  assert.ok(texto.includes('Estatística'), 'o campo bom não pode ser perdido junto');
  assert.ok(texto.includes('4500'), 'número é dado aproveitável, e deve passar');
  delete contexto._textoDeDocumento;
});

test('o nome do candidato também passa pelo crivo', async () => {
  contexto._textoDeDocumento = async () => ({ situacao: 'semarquivo', texto: '' });
  const c = candidato('x', 1);
  c.name = { nome: 'objeto' };
  const { texto } = await RH.textoDaTriagem([c], 'Analista', '');
  assert.ok(!texto.includes('[OBJECT OBJECT]') && !texto.includes('[object Object]'));
  delete contexto._textoDeDocumento;
});

test('candidato sem anexo nenhum é declarado como tal, e não como ilegível', async () => {
  contexto._textoDeDocumento = async () => ({ situacao: 'erro', texto: '' });
  const c = candidato('Zé', 1, { campos: { vaga: 'Analista' } });   // sem documents
  const { texto, leituras } = await RH.textoDaTriagem([c], 'Analista', '');
  assert.equal(leituras[0].situacao, 'semarquivo');
  assert.match(texto, /Nenhum currículo anexado/);
  delete contexto._textoDeDocumento;
});

/* ── Leitura da resposta do modelo ──
   A resposta chega como texto e é o prompt que fixa o formato. Se o leitor
   errar, o resultado não quebra: ele simplesmente perde a nota, os pontos e a
   ordem, e vira um bloco de texto — uma degradação silenciosa, do tipo que
   ninguém nota até comparar com o que deveria estar na tela. */
test('a resposta do modelo vira cartões com nota, prós e contras', () => {
  const bruto = [
    'Vaga: Analista de dados',
    'Requisitos considerados: SQL, Python e BI.',
    '1. Ana Souza',
    'Nota: 82/100',
    'Por quê: cinco anos na função, com as ferramentas pedidas.',
    '+ Cinco anos com SQL e Python',
    '+ Painéis em Power BI',
    '- Não menciona experiência com nuvem',
    'Falta saber: nível de inglês.',
    '2. Rui Lima',
    'Nota: sem nota',
    '- Currículo não lido',
    'Falta saber: toda a trajetória.',
    'Como usar: isto é triagem; a entrevista decide.',
  ].join('\n');

  const r = RH.lerTriagem(bruto);
  assert.equal(r.itens.length, 2);
  assert.equal(r.itens[0].nome, 'Ana Souza');
  assert.equal(r.itens[0].nota, 82);
  assert.equal(r.itens[0].mais.length, 2);
  assert.equal(r.itens[0].menos.length, 1);
  assert.match(r.itens[0].falta, /inglês/);
  assert.equal(r.itens[1].nota, null);
  assert.equal(r.itens[1].semNota, true, '"sem nota" não pode virar zero');
  assert.match(r.rodape, /triagem/);
  assert.equal(r.cab.length, 2, 'o cabeçalho não pode ser engolido');
});

/* ── Reprovar ──
   Reprovar é diferente de excluir, e a diferença é o que responde "por que não
   seguimos com fulano?" seis meses depois. O candidato continua na base, com a
   etapa em que parou e o motivo anotado. */
test('reprovar marca o selo sem mexer na etapa em que o candidato parou', async () => {
  const c = candidato('Ana', 3, { campos: { vaga: 'Analista' } });
  const lista = [c];
  contexto.updateRecord = async (id, mudancas) => { Object.assign(c, mudancas); return c; };

  const etapaAntes = RH.etapaDe(c).indice;
  await RH.reprovar(c.id, '', lista);
  assert.equal(RH.reprovado(c), true);
  assert.equal(RH.etapaDe(c).indice, etapaAntes,
    'zerar a etapa apagaria em que ponto do processo a pessoa caiu');
  assert.equal(c.campos.vaga, 'Analista', 'a vaga não pode ser sobrescrita pelo selo');
});

test('o motivo vai para o parecer, que é interno e nunca sobe para a IA', async () => {
  const c = candidato('Ana', 1);
  const lista = [c];
  contexto.updateRecord = async (id, mudancas) => { Object.assign(c, mudancas); return c; };
  contexto._textoDeDocumento = async () => ({ situacao: 'semarquivo', texto: '' });

  await RH.reprovar(c.id, 'Sem experiência com a ferramenta principal.', lista);
  assert.match(c.campos.parecer, /Sem experiência com a ferramenta principal\./);
  assert.match(c.campos.parecer, /Reprovado em/, 'a data situa a anotação no tempo');

  const { texto } = await RH.textoDaTriagem([c], 'Analista', '');
  assert.ok(!texto.includes('Sem experiência com a ferramenta'),
    'parecer é anotação de quem avalia: não pode voltar ao modelo como se fosse do candidato');
  delete contexto._textoDeDocumento;
});

test('reprovar duas vezes não empilha parecer perdido', async () => {
  const c = candidato('Ana', 1, { campos: { parecer: 'Nota antiga da entrevista.' } });
  const lista = [c];
  contexto.updateRecord = async (id, mudancas) => { Object.assign(c, mudancas); return c; };
  await RH.reprovar(c.id, 'Motivo novo.', lista);
  assert.match(c.campos.parecer, /Nota antiga da entrevista\./, 'o parecer anterior foi apagado');
  assert.match(c.campos.parecer, /Motivo novo\./);
});

test('desfazer tira a marca sem pôr outra no lugar', async () => {
  const c = candidato('Ana', 2);
  const lista = [c];
  contexto.updateRecord = async (id, mudancas) => { Object.assign(c, mudancas); return c; };

  await RH.reprovar(c.id, '', lista);
  await RH.desfazerReprovacao(c.id, lista);
  assert.equal(RH.reprovado(c), false);
  assert.equal(RH.aprovado(c), false, 'desfazer não pode virar aprovação');
  assert.equal(c.campos.vaga__selo, undefined);
});

test('o filtro de reprovados mostra SÓ eles, e o padrão esconde', () => {
  const seloRep = N.porChave.rh.campos.find(c => c.k === 'vaga').selo[3];
  const lista = [
    candidato('Ana', 1),
    candidato('Léo', 1, { campos: { vaga__selo: seloRep } }),
  ];
  RH.filtroVaga(''); RH.filtroEtapa(-1); RH.filtroReprovados(false);
  assert.deepEqual(RH.visiveis(lista, '').map(r => r.name), ['Ana']);
  assert.equal(RH.temFiltro(), false, 'o padrão não pode parecer um filtro ligado');

  RH.filtroReprovados(true);
  assert.deepEqual(RH.visiveis(lista, '').map(r => r.name), ['Léo']);
  assert.equal(RH.temFiltro(), true);
  RH.filtroReprovados(false);
});

test('reprovado sai da análise por IA', async () => {
  /* Gastar chamada e espaço de leitura com quem já foi descartado empurraria
     candidato vivo para fora do orçamento de texto. */
  const seloRep = N.porChave.rh.campos.find(c => c.k === 'vaga').selo[3];
  const lista = [
    candidato('Ana', 1),
    candidato('Léo', 1, { campos: { vaga__selo: seloRep } }),
  ];
  const d = RH.indicadores(lista);
  assert.equal(d.reprovados, 1);
  assert.equal(d.emProcesso, 1, 'reprovado não conta como em processo');
  assert.equal(d.porEtapa.reduce((a, e) => a + e.n, 0), 1,
    'reprovado não pode ocupar coluna na contagem do funil');
});

test('a faixa da nota vem sempre com nome, e nunca só com cor', () => {
  /* Cor sozinha não diz nada a quem não distingue verde de âmbar, e o que
     está em jogo aqui é a leitura de uma candidatura. */
  [0, 24, 25, 49, 50, 69, 70, 84, 85, 100].forEach(n => {
    const f = RH.faixaDaNota(n);
    assert.ok(f.k, n + ': faixa sem chave de cor');
    assert.ok(f.rot && f.rot.trim().length > 3, n + ': faixa sem rótulo escrito');
  });
  assert.notEqual(RH.faixaDaNota(84).k, RH.faixaDaNota(85).k, 'a borda da faixa não separa');
});

test('linha fora do formato combinado não é perdida', () => {
  /* Um leitor que engole o que não entende seria pior do que não ter leitor:
     a informação some da tela sem deixar rastro. */
  const r = RH.lerTriagem('1. Ana\nNota: 70/100\nObservação livre do modelo aqui.');
  assert.deepEqual(r.itens[0].solto, ['Observação livre do modelo aqui.']);
});

test('o parecer do avaliador NÃO vai para a IA', async () => {
  /* O parecer é a opinião de quem entrevista, marcada como interna no modelo.
     Mandá-la junto faria o modelo repetir de volta a conclusão de quem
     escreveu, com cara de leitura independente. */
  contexto._textoDeDocumento = async () => '';
  const c = candidato('Ana', 1, {
    campos: { vaga: 'Analista', parecer: 'Achei fraca na entrevista', experiencia: 'BI' },
  });
  const { texto } = await RH.textoDaTriagem([c], 'Analista', '');
  assert.ok(!texto.includes('Achei fraca'), 'parecer interno vazou para o prompt');
  assert.ok(texto.includes('BI'));
  delete contexto._textoDeDocumento;
});

/* ── Desenho ──
   Sem navegador não dá para conferir a aparência, mas dá para conferir o que
   quebra em silêncio: um `${}` chamando função que não existe derruba a
   montagem inteira e deixa o quadro em branco. Um DOM de mentirinha, com o
   mínimo que o desenho toca, é suficiente para pegar isso. */
function domFalso() {
  const nos = new Map();
  const elemento = () => ({
    innerHTML: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  });
  ['crm-funil', 'crm-count-badge', 'crm-relatorio', 'crm-chart-bars',
   'crm-bars-range', 'crm-line-chart'].forEach(id => nos.set(id, elemento()));
  return {
    nos,
    getElementById: id => nos.get(id) || null,
    addEventListener() {},
  };
}

test('o funil se desenha sem quebrar, com candidato, com filtro e vazio', () => {
  const doc = domFalso();
  contexto.document = doc;
  const campoVaga = N.porChave.rh.campos.find(c => c.k === 'vaga');
  const lista = [
    candidato('Ana', 2, { campos: { vaga: 'Analista', pretensao: 4200, entrevista: '2026-09-02' } }),
    candidato('Rui', ETAPAS.length, { campos: { vaga: 'Analista' } }),
    candidato('Léo', 1, { campos: { vaga: 'Designer', vaga__selo: campoVaga.selo[3] } }),
    { id: 'crm_fora', name: 'Cliente antigo', template: '' },
  ];

  RH.filtroVaga(''); RH.filtroEtapa(-1);
  RH.renderFunil(lista, '');
  const html = doc.nos.get('crm-funil').innerHTML;
  ETAPAS.forEach(e => assert.ok(html.includes(e), 'faltou a coluna ' + e));
  assert.ok(html.includes('Ana') && html.includes('Rui'));
  /* Reprovado sai das colunas: o funil é o que ainda está em pé. Mas o quadro
     precisa DIZER que ele está fora — esconder sem avisar é indistinguível de
     perder o candidato. */
  assert.ok(!html.includes('Léo'), 'reprovado continua ocupando coluna no funil');
  assert.match(html, /rh-ocultos/, 'sumiu o aviso de quantos estão fora do funil');
  assert.match(html, /1 candidato reprovado/, 'o aviso precisa dizer quantos são');
  /* Registro de outro modelo fica de fora em silêncio, e sem faixa de aviso:
     a barra ficava fixa no topo repetindo, a cada carregamento, algo que só
     interessa uma vez — e num workspace misto ela nunca ia embora. */
  assert.ok(!html.includes('Cliente antigo'), 'registro fora do modelo entrou no funil');
  assert.ok(!/rh-fora|não usam o modelo/.test(html), 'a faixa de aviso voltou ao funil');
  assert.ok(doc.nos.get('crm-count-badge').textContent.includes('3'));

  RH.filtroVaga('Designer');
  RH.renderFunil(lista, '');
  assert.ok(!doc.nos.get('crm-funil').innerHTML.includes('Ana'));

  RH.filtroVaga(''); RH.filtroEtapa(-1);
  RH.renderFunil([], '');
  assert.ok(/rh-vazio/.test(doc.nos.get('crm-funil').innerHTML));
  delete contexto.document;
});

test('o relatório de recrutamento se monta com e sem vaga informada', () => {
  const doc = domFalso();
  doc.nos.get('crm-relatorio').querySelector = () => ({ addEventListener() {} });
  contexto.document = doc;
  const lista = [
    candidato('Ana', 2, { campos: { vaga: 'Analista' } }),
    candidato('Rui', ETAPAS.length),                      // sem vaga informada
  ];
  RH.relatorio(lista);
  const html = doc.nos.get('crm-relatorio').innerHTML;
  assert.ok(html.includes('rel-folha'));
  assert.ok(html.includes('Ana') && html.includes('Rui'));
  assert.ok(html.includes('Analista'));
  assert.ok(!/undefined|NaN|\[object/.test(html), 'buraco no relatório: ' + html.slice(0, 300));
  delete contexto.document;
});

test('as barras do funil se desenham e somam os candidatos certos', () => {
  const doc = domFalso();
  contexto.document = doc;
  RH.renderGraficos([candidato('Ana', 2), candidato('Rui', 4)]);
  const barras = doc.nos.get('crm-chart-bars').innerHTML;
  assert.ok(barras.includes('rh-fb-linha'));
  assert.ok(!/undefined|NaN/.test(barras));
  assert.ok(doc.nos.get('crm-bars-range').textContent.includes('2'));
  delete contexto.document;
});

test('avançar a partir da última etapa conclui o processo', async () => {
  const c = candidato('ze', ETAPAS.length - 1);
  const lista = [c];
  contexto.updateRecord = async (id, mudancas) => { Object.assign(c, mudancas); return c; };

  assert.equal(RH.etapaDe(c).indice, ETAPAS.length - 1);
  await RH.mover(c.id, ETAPAS.length, lista);
  assert.equal(RH.etapaDe(c).concluido, true);
  assert.ok(c.checklist.every(i => i.ok));
});

test('soltar o cartão na própria última coluna NÃO admite ninguém sem querer', () => {
  /* Concluir é gesto à parte. Se arrastar para a última coluna concluísse, um
     cartão largado de volta no lugar viraria uma admissão que ninguém pediu. */
  const c = candidato('quase', ETAPAS.length - 1);
  const lista = [c];
  let escrito = null;
  contexto.updateRecord = async (id, mudancas) => { escrito = mudancas; Object.assign(c, mudancas); return c; };

  return RH.mover(c.id, ETAPAS.length - 1, lista).then(() => {
    assert.equal(RH.etapaDe(c).concluido, false);
    assert.equal(escrito.checklist[ETAPAS.length - 1].ok, false);
  });
});

test('voltar de concluído devolve o candidato à última etapa, ainda em aberto', async () => {
  const c = candidato('voltando', ETAPAS.length);
  const lista = [c];
  contexto.updateRecord = async (id, mudancas) => { Object.assign(c, mudancas); return c; };

  assert.equal(RH.etapaDe(c).concluido, true);
  await RH.mover(c.id, ETAPAS.length - 1, lista);
  assert.equal(RH.etapaDe(c).concluido, false);
  assert.equal(RH.etapaDe(c).indice, ETAPAS.length - 1);
});

/* ── O nome no relatório de triagem ──────────────────────────────────────
   Houve uma tentativa de garantir o nome da ficha REMONTANDO a lista no
   cliente: ignorar o nome escrito pelo modelo e recolocá-lo pela posição. A
   validação parecia bastar — mesma quantidade, todos na faixa, sem repetição.

   Não bastava. Quando o modelo responde ordenado por nota e renumera de 1 a N,
   a lista passa em todas essas checagens e mesmo assim cada nome cai na
   análise de outra pessoa. Em 02/08/2026 o currículo do Victor saiu com o nome
   do Artur. Num relatório de recrutamento isso não é detalhe de tela: é
   atribuir formação, experiência e nota de alguém a outra pessoa.

   O erro de fundo foi tratar um número escrito pelo modelo como chave
   confiável de identidade. "1" tanto pode ser o bloco 1 quanto o primeiro
   colocado, e as duas leituras produzem sequências idênticas — não há
   validação capaz de distingui-las depois do fato. */

test('o nome fica colado na análise, e não é remontado por posição', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'rh.js'), 'utf8');
  const i = fonte.indexOf('function mostrarTriagem(');
  assert.ok(i > 0, 'mostrarTriagem sumiu');
  const corpo = fonte.slice(i, i + 4000);

  assert.ok(!/pos\s*-\s*1\]/.test(corpo),
    'alguém voltou a indexar a lista de candidatos pelo número escrito pelo modelo');
  assert.ok(!/nomesDaFicha/.test(fonte),
    'a remontagem de nomes por posição voltou ao rh.js');
  assert.ok(/esc\(it\.nome\)/.test(corpo),
    'o cartão precisa mostrar o nome que veio junto da análise');
});

test('a garantia do nome da ficha mora na instrução do servidor', () => {
  /* É ela que não depende de numeração: o modelo copia o nome do cabeçalho do
     bloco, e o nome sai colado na análise que ele mesmo escreveu. */
  const ia = fs.readFileSync(path.join(RAIZ, 'api', 'ia.js'), 'utf8');
  const bloco = ia.slice(ia.indexOf('curriculos: {'), ia.indexOf('semana: {'));
  assert.match(bloco, /cabe[çc]alho daquele bloco/i,
    'a regra de copiar o nome do cabeçalho sumiu do prompt');
  assert.match(bloco, /Sem nome/,
    'o prompt precisa dizer que "Sem nome" também se copia como está');
  assert.match(bloco, /n[úu]mero do BLOCO/i,
    'o prompt precisa fixar que N é o número do bloco, e não a posição no ranking');
});

test('o texto enviado ao modelo declara o nome da ficha, e não o do currículo', async () => {
  const lista = [candidato('Sem nome', 0), candidato('Mateus', 0)];
  const { texto } = await RH.textoDaTriagem(lista, 'Atendente', '');
  assert.match(texto, /CANDIDATO 1 DE 2: Sem nome/);
  assert.match(texto, /CANDIDATO 2 DE 2: Mateus/);
});

/* ── O CARTÃO É O DO CONCEITO ─────────────────────────────────────────────
   As imagens que ela mandou não são referência solta: o pedido é 1:1. O
   cartão do funil traz, nesta ordem, retrato, nome, cargo, e o rodapé com o
   LOCAL da pessoa à esquerda e HÁ QUANTO TEMPO a candidatura chegou à
   direita. Faltava tudo isso — a ficha já guardava cidade e UF, e o cartão
   simplesmente não olhava. Numa coluna com dezenas de nomes, o local e o
   tempo de espera são o que distingue uma pessoa da outra. */
test('o cartão mostra local e há quanto tempo a candidatura chegou', () => {
  const fonte = ler('rh.js');
  const corpo = fonte.slice(fonte.indexOf('function _cartao('),
                            fonte.indexOf('function renderFunil('));
  assert.match(corpo, /rh-card-cargo/, 'o cargo/vaga saiu do cartão');
  assert.match(corpo, /rh-card-local/, 'o local da pessoa não aparece no cartão');
  assert.match(corpo, /localDe\(rec\)/);
  assert.match(corpo, /chegouHa\(rec\)/, 'o tempo desde a candidatura não aparece');
  assert.match(corpo, /rh-card-estrela/, 'a estrela de nota alta sumiu');

  // As setas ‹ › saíram do cartão — o movimento tem de sobreviver no menu.
  assert.equal(/data-mv=/.test(fonte), false, 'as setas voltaram ao cartão');
  const app = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');
  const menu = app.slice(app.indexOf('function crmAcoesDoCandidato('));
  const ateFim = menu.slice(0, menu.indexOf('\n}'));
  assert.match(ateFim, /rh\.stepForward/,
    'sem avançar no menu, quem usa toque ou teclado perde o movimento');
  assert.match(ateFim, /rh\.stepBack/);
});

test('o local prefere Remoto, e nunca escreve vírgula sem o outro lado', () => {
  const remoto = candidato('Ana', 0, { city: 'Recife', uf: 'PE',
                                       campos: { modelo: 'Remoto' } });
  assert.equal(RH.localDe(remoto), 'Remoto',
    'quem informou trabalho remoto não é descrito pela cidade');
  assert.equal(RH.localDe(candidato('B', 0, { city: 'Recife', uf: 'PE' })), 'Recife, PE');
  assert.equal(RH.localDe(candidato('C', 0, { city: 'Recife' })), 'Recife');
  assert.equal(RH.localDe(candidato('D', 0, { uf: 'PE' })), 'PE');
  assert.equal(RH.localDe(candidato('E', 0)), '', 'sem dado, nada é afirmado');
});

test('o tempo desde a candidatura vira minutos, horas, dias e meses', () => {
  const agora = Date.now();
  const em = ms => RH.chegouHa({ createdAt: agora - ms });
  assert.equal(em(30 * 1000), 'agora');
  assert.equal(em(5 * 60000), 'há 5min');
  assert.equal(em(3 * 3600000), 'há 3h');
  assert.equal(em(4 * 86400000), 'há 4d');
  assert.equal(em(70 * 86400000), 'há 2m');
  assert.equal(RH.chegouHa({}), '', 'ficha sem data não inventa um tempo');
});

test('toda coluna tem como criar candidato já nela', () => {
  /* Quem chega por indicação entra na entrevista, não na triagem — obrigar a
     criar no começo e arrastar é trabalho que a tela pode poupar. */
  const fonte = ler('rh.js');
  assert.match(fonte, /rh-col-add/);
  assert.match(fonte, /rh\.addCandidate/);
  const liga = fonte.slice(fonte.indexOf("querySelectorAll('.rh-col-add')"));
  assert.match(liga.slice(0, 700), /ok: i < coluna/,
    'o candidato precisa nascer na coluna em que foi criado');
});

/* ── QUEM FOI ADMITIDO SAI DO FUNIL ──────────────────────────────────────
   O funil é o processo que ainda corre. Quem virou colaborador terminou o
   dele, e continuava ocupando a coluna Admissão: a contratação era contada
   de novo a cada olhada, e com dois homônimos ficava impossível saber qual
   dos dois ainda estava em processo. Sai da COLUNA, nunca do banco — a ficha
   guarda currículo, parecer e nota da triagem. */
test('candidato que virou colaborador some das colunas, e o rodapé avisa', () => {
  const admitido = candidato('Ja contratado', 5);
  const emProcesso = candidato('Ainda em processo', 5);
  const lista = [admitido, emProcesso];

  // Sem colaborador nenhum ligado, os dois aparecem.
  janela._colaboradorDoCandidato = () => null;
  assert.equal(RH.visiveis(lista, '').length, 2);

  // Com o vínculo, o admitido sai.
  janela._colaboradorDoCandidato = id =>
    (id === admitido.id ? { id: 'crm_colab_1', nome: 'Ja contratado' } : null);
  assert.equal(RH.jaAdmitido(admitido), true);
  assert.equal(RH.jaAdmitido(emProcesso), false);
  assert.deepEqual(RH.visiveis(lista, '').map(r => r.name), ['Ainda em processo']);

  // E dá para trazê-lo de volta à tela, como acontece com os reprovados.
  RH.filtroAdmitidos(true);
  assert.deepEqual(RH.visiveis(lista, '').map(r => r.name), ['Ja contratado']);
  RH.filtroAdmitidos(false);

  const fonte = ler('rh.js');
  assert.match(fonte, /rh\.hiredOutOne/, 'esconder sem avisar é indistinguível de perder');
  assert.match(fonte, /id="rh-ver-admitidos"/);
  janela._colaboradorDoCandidato = undefined;
});

/* ── OS DOIS NÚMEROS QUE MENTIAM NO PAINEL ───────────────────────────────── */

test('a taxa de contratação conta quem virou colaborador', () => {
  /* O painel media admissão pelo checklist inteiro marcado — o único sinal que
     existia antes de o colaborador existir. O resultado era "sem admissão
     ainda" com gente já contratada no quadro de colaboradores: duas telas
     discordando sobre o mesmo fato. */
  const contratado = candidato('Contratado', 5);      // na Admissão, checklist aberto
  const emProcesso = candidato('Em processo', 1);
  const lista = [contratado, emProcesso];

  janela._colaboradorDoCandidato = () => null;
  assert.equal(RH.indicadores(lista).admitidos, 0, 'ninguém foi contratado ainda');

  janela._colaboradorDoCandidato = id => (id === contratado.id ? { id: 'c1' } : null);
  const d = RH.indicadores(lista);
  assert.equal(d.admitidos, 1);
  assert.equal(d.emProcesso, 1, 'quem foi contratado saiu de "em processo"');
  assert.ok(d.aproveitamento > 0, 'a taxa de contratação não pode ficar em zero');

  // Checklist inteiro marcado continua contando: ficha antiga só tem esse sinal.
  janela._colaboradorDoCandidato = () => null;
  const antiga = candidato('Antiga', ETAPAS.length);
  assert.equal(RH.indicadores([antiga]).admitidos, 1,
    'trocar o sinal apagaria as contratações já registradas');
  janela._colaboradorDoCandidato = undefined;
});

test('quem está na coluna de entrevista conta como entrevista marcada', () => {
  /* O cartão só contava quem tinha a DATA preenchida na ficha: arrastar
     alguém para "Entrevista RH" não mexia no número, e o painel dizia zero
     com metade do funil ali dentro. */
  assert.deepEqual(RH.etapasDeEntrevista(), [1, 2],
    'as etapas de entrevista são achadas pelo nome, não pela posição fixa');

  const naEntrevista = candidato('Na entrevista', 1);     // coluna Entrevista RH
  const naTriagem = candidato('Na triagem', 0);
  assert.equal(RH.indicadores([naEntrevista, naTriagem]).agendadas, 1);

  // A data continua valendo para quem já passou das colunas de entrevista.
  const comData = candidato('Com data', 3, { campos: { entrevista: '2099-01-01' } });
  assert.equal(RH.indicadores([comData]).agendadas, 1);
  // E data vencida não conta.
  const vencida = candidato('Vencida', 3, { campos: { entrevista: '2000-01-01' } });
  assert.equal(RH.indicadores([vencida]).agendadas, 0);
});
