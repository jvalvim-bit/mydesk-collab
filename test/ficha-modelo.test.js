'use strict';
/* A ficha exportada passou a sair no modelo oficial (docs/modelos/ficha-mydesk.docx).
   O modelo é um .docx de verdade — um ZIP de XMLs — preenchido no navegador
   sem biblioteca nenhuma. Isto só se sustenta enquanto três coisas forem
   verdade, e é o que estes testes guardam:

     1. os 172 marcadores continuam INTEIROS dentro de um <w:t> só (se alguém
        editar o modelo no Word e salvar, o Word pica o texto em pedaços e a
        substituição para de achar os marcadores — em silêncio);
     2. o ZIP que geramos é um ZIP válido, com XML bem formado dentro;
     3. todo rótulo visível do modelo tem tradução em inglês e espanhol. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const RAIZ = path.resolve(__dirname, '..');
const MODELO = path.join(RAIZ, 'docs/modelos/ficha-mydesk.docx');

/* Leitor de ZIP mínimo, só para o teste — não reaproveita o do app de
   propósito: se o do app quebrar, este continua sabendo ler o modelo e o teste
   aponta o culpado certo. */
function lerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'ZIP sem diretório central');
  const total = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const entradas = {};
  for (let i = 0; i < total; i++) {
    assert.equal(buf.readUInt32LE(pos), 0x02014b50, 'entrada de ZIP inválida');
    const metodo = buf.readUInt16LE(pos + 10);
    const tamComp = buf.readUInt32LE(pos + 20);
    const nomeLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const comentLen = buf.readUInt16LE(pos + 32);
    const offLocal = buf.readUInt32LE(pos + 42);
    const nome = buf.subarray(pos + 46, pos + 46 + nomeLen).toString('utf8');
    const inicio = offLocal + 30 + buf.readUInt16LE(offLocal + 26) + buf.readUInt16LE(offLocal + 28);
    const dados = buf.subarray(inicio, inicio + tamComp);
    entradas[nome] = metodo === 8 ? zlib.inflateRawSync(dados) : dados;
    pos += 46 + nomeLen + extraLen + comentLen;
  }
  return entradas;
}

function carregarGerador() {
  const janela = {};
  global.window = janela;
  global.fetch = async () => {
    const b = fs.readFileSync(MODELO);
    return {
      ok: true, status: 200,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    };
  };
  (0, eval)(fs.readFileSync(path.join(RAIZ, 'docs/js/ficha-docx.js'), 'utf8'));
  (0, eval)(fs.readFileSync(path.join(RAIZ, 'docs/js/ficha-modelo-i18n.js'), 'utf8'));
  return janela;
}

function rotulosDoModelo() {
  const zip = lerZip(fs.readFileSync(MODELO));
  const vistos = [];
  for (const arq of ['word/document.xml', 'word/footer1.xml']) {
    const xml = zip[arq].toString('utf8');
    for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
      const t = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      if (!t.trim() || t.includes('{{')) continue;
      if (!vistos.includes(t)) vistos.push(t);
    }
  }
  return vistos;
}

test('o modelo existe e traz os marcadores inteiros', () => {
  assert.ok(fs.existsSync(MODELO), 'o .docx do modelo precisa estar no repositório');
  const zip = lerZip(fs.readFileSync(MODELO));
  const xml = zip['word/document.xml'].toString('utf8');

  const marcadores = [...new Set([...xml.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map(m => m[1]))];
  assert.ok(marcadores.length >= 170, `esperava ~172 marcadores, achei ${marcadores.length}`);

  /* Cada marcador precisa caber num <w:t> sozinho. Salvar o modelo pelo Word
     costuma partir o texto em vários pedaços — o arquivo continua abrindo
     normal, e a substituição simplesmente para de funcionar. */
  const partidos = marcadores.filter(m =>
    !new RegExp('<w:t(?:\\s[^>]*)?>[^<]*\\{\\{' + m + '\\}\\}').test(xml));
  assert.deepEqual(partidos, [], 'marcador partido entre pedaços de texto não é encontrado');
});

test('o .docx gerado é um ZIP válido, com XML bem formado e sem marcador sobrando', async () => {
  const janela = carregarGerador();
  const valores = {
    nome_razao_social: 'Ana & Cia <Ltda>',   // testa escape de XML
    titulo: 'Projeto Alfa',
    email: 'ana@exemplo.com',
    descricao_detalhada: 'Primeira linha\nSegunda linha',
  };
  const blob = await janela.MD_FICHA_DOCX.gerar(valores, null, '');
  const buf = Buffer.from(await blob.arrayBuffer());

  const zip = lerZip(buf);
  assert.ok(zip['word/document.xml'], 'o documento precisa continuar no pacote');
  assert.ok(zip['[Content_Types].xml'], 'sem Content_Types o Word recusa o arquivo');
  assert.ok(zip['word/media/image1.png'], 'o logo é copiado byte a byte');

  const xml = zip['word/document.xml'].toString('utf8');
  assert.equal((xml.match(/\{\{[a-z0-9_]+\}\}/g) || []).length, 0,
    'marcador sobrando aparece como {{campo}} no documento final');
  assert.match(xml, /Ana &amp; Cia &lt;Ltda&gt;/, 'valor precisa entrar escapado');
  assert.match(xml, /Primeira linha<\/w:t><w:br\/>/, 'quebra de linha vira <w:br/>');

  // Bem formado: um XML inválido faz o Word dizer que o arquivo está corrompido.
  const { XMLParser } = (() => { try { return require('fast-xml-parser'); } catch { return {}; } })();
  if (XMLParser) new XMLParser().parse(xml);
  assert.equal((xml.match(/<w:t/g) || []).length > 0, true);
  assert.equal(xml.startsWith('<?xml'), true, 'o XML precisa manter a declaração');
});

test('as tabelas saem com largura explícita, senão o Google Docs as encolhe', async () => {
  /* O modelo declara toda tabela como tblW type="auto" e diz a largura real só
     na grade de colunas. O Word soma a grade e desenha certo; o importador do
     Google Docs lê "auto" como "encolha até o conteúdo".

     O estrago: títulos de seção, que são tabelas de uma célula do tamanho da
     página, viravam caixinhas com o texto quebrado em três linhas — e as
     tabelas de dados encolhiam e, por terem jc="center", ficavam boiando no
     meio, cada uma num alinhamento. */
  const original = lerZip(fs.readFileSync(MODELO))['word/document.xml'].toString('utf8');
  assert.match(original, /<w:tblW w:type="auto"/,
    'o modelo é assim mesmo; quem conserta é a geração, para valer também numa versão nova dele');

  const janela = carregarGerador();
  const blob = await janela.MD_FICHA_DOCX.gerar({}, null, '');
  const xml = lerZip(Buffer.from(await blob.arrayBuffer()))['word/document.xml'].toString('utf8');

  assert.doesNotMatch(xml, /<w:tblW w:type="auto"/,
    'largura automática é o que faz o Docs encolher a tabela');

  const tabelas = (xml.match(/<w:tbl>/g) || []).length;
  const fixas = (xml.match(/<w:tblLayout w:type="fixed"\/>/g) || []).length;
  assert.equal(fixas, tabelas, 'toda tabela precisa de layout fixo');

  /* Twips não bastaram: declarar a largura exata em unidade absoluta não
     impediu o Docs de encolher as faixas de título. Quem ele respeita é a
     PORCENTAGEM — e são justamente as faixas que querem 100%, por serem as
     tabelas cuja grade ocupa a largura útil inteira da página.

     As demais continuam em twips de propósito: já saem certas assim, e o Word
     acerta todas hoje — mexer nelas seria arriscar o que funciona. */
  const util = 11906 - 709 - 709;          // A4 menos as margens do modelo
  let emPorcentagem = 0;
  for (const bloco of xml.match(/<w:tbl>[\s\S]*?<\/w:tblGrid>/g) || []) {
    const grade = bloco.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)[0];
    const soma = [...grade.matchAll(/w:w="(\d+)"/g)].reduce((t, m) => t + Number(m[1]), 0);
    const decl = bloco.match(/<w:tblW w:type="(pct|dxa)" w:w="(\d+)"\/>/);
    assert.ok(decl, 'toda tabela precisa declarar largura');
    if (soma >= util) {
      assert.equal(decl[1], 'pct', 'faixa de largura cheia precisa ir em porcentagem');
      assert.equal(decl[2], '5000', 'porcentagem cheia é 5000 (100%)');
      emPorcentagem++;
    } else {
      assert.equal(decl[1], 'dxa', 'tabela mais estreita fica em twips');
      assert.equal(Number(decl[2]), soma, 'largura em twips tem de bater com a grade');
    }
  }
  assert.ok(emPorcentagem >= 10,
    `esperava as faixas de seção em porcentagem, achei ${emPorcentagem}`);
});

test('tabelas coladas são separadas, senão o Docs funde as duas', async () => {
  /* Onze tabelas do modelo terminam e a seguinte começa sem nada no meio:
     </w:tbl><w:tbl>. Em OOXML isso é ambíguo, e o Google Docs resolve fundindo
     as duas numa tabela só.

     Era daí que vinha a caixinha do título. A faixa é uma tabela de uma célula
     com a largura da página; fundida com a tabela de dados abaixo, ela vira só
     mais uma linha e passa a valer a grade da outra — cuja primeira coluna tem
     1587 twips, 15% da página. O texto quebrava em três linhas nesses 15%.

     Foi por isso que declarar largura, em twips e depois em porcentagem, não
     mudou nada: a faixa já não era uma tabela própria quando o Docs decidia o
     tamanho dela. */
  const original = lerZip(fs.readFileSync(MODELO))['word/document.xml'].toString('utf8');
  const coladasNoModelo = (original.match(/<\/w:tbl>\s*<w:tbl>/g) || []).length;
  assert.ok(coladasNoModelo >= 10,
    'o modelo é assim mesmo; quem separa é a geração, para valer em qualquer versão dele');

  const janela = carregarGerador();
  const blob = await janela.MD_FICHA_DOCX.gerar({}, null, '');
  const xml = lerZip(Buffer.from(await blob.arrayBuffer()))['word/document.xml'].toString('utf8');

  assert.equal((xml.match(/<\/w:tbl>\s*<w:tbl>/g) || []).length, 0,
    'tabela colada na seguinte volta a ser fundida pelo Docs');

  /* O separador precisa ser invisível: um parágrafo comum entre cada seção
     empurraria o documento e criaria vãos que não existem no modelo. */
  const separadores = (xml.match(/<w:p><w:pPr><w:spacing[^>]*w:lineRule="exact"/g) || []).length;
  assert.equal(separadores, coladasNoModelo, 'um separador para cada emenda');
  assert.match(xml, /w:line="1" w:lineRule="exact"/, 'altura de 1 twip');
  assert.match(xml, /<w:sz w:val="2"\/>/, 'fonte de 1 ponto');
});

test('a largura útil vem do documento, e não de um A4 presumido', () => {
  /* É contra a largura útil que se decide quem quer a linha inteira. Fixar A4
     no código daria errado no dia em que o modelo mudasse de página ou de
     margem — e daria errado em silêncio, com as faixas voltando a encolher. */
  const fonte = fs.readFileSync(path.join(RAIZ, 'docs/js/ficha-docx.js'), 'utf8');
  assert.match(fonte, /function _larguraUtil\(xml\)/);
  assert.match(fonte, /<w:pgSz\[\^>\]\*w:w=/, 'a largura da página vem do sectPr');
  assert.match(fonte, /w:left=|w:right=/, 'as margens também');

  const janela = carregarGerador();
  const xml = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="709" w:right="709" w:bottom="680" w:left="709"/></w:sectPr>';
  // 11906 - 709 - 709 = 10488
  const tabela = '<w:tbl><w:tblPr><w:tblW w:type="auto" w:w="0"/></w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="10488"/></w:tblGrid>';
  const saida = janela.MD_FICHA_DOCX._normalizarLarguraTabelas(tabela + xml);
  assert.match(saida, /<w:tblW w:type="pct" w:w="5000"\/>/);
});

test('os rótulos do modelo têm tradução em inglês e espanhol', () => {
  const janela = carregarGerador();
  const trad = janela.MD_FICHA_TRAD;
  // Símbolos e a marca não se traduzem.
  const dispensados = ['✓', '☐', 'MyDesk'];
  const rotulos = rotulosDoModelo().filter(r => !dispensados.includes(r));

  const semTraducao = rotulos.filter(r => !trad[r]);
  assert.deepEqual(semTraducao, [], 'rótulo sem tradução sai em português no documento');

  for (const [pt, par] of Object.entries(trad)) {
    assert.equal(par.length, 2, `${pt} precisa de [inglês, espanhol]`);
    par.forEach(v => assert.ok(String(v).trim(), `${pt} tem tradução vazia`));
  }

  // Entrada que não existe mais no modelo é dicionário desatualizado.
  const orfas = Object.keys(trad).filter(k => !rotulosDoModelo().includes(k));
  assert.deepEqual(orfas, [], 'entrada do dicionário que não existe no modelo');
});

test('o documento em inglês troca os rótulos e mantém os dados', async () => {
  const janela = carregarGerador();
  const dicionario = {};
  Object.keys(janela.MD_FICHA_TRAD).forEach(pt => { dicionario[pt] = janela.MD_FICHA_TRAD[pt][0]; });

  const blob = await janela.MD_FICHA_DOCX.gerar({ titulo: 'Projeto Alfa' }, dicionario, '');
  const xml = lerZip(Buffer.from(await blob.arrayBuffer()))['word/document.xml'].toString('utf8');

  assert.match(xml, />OFFICIAL MYDESK TEMPLATE</);
  assert.match(xml, />1\. GENERAL INFORMATION</);
  assert.match(xml, />Name \/ Legal name</);
  assert.doesNotMatch(xml, />1\. INFORMAÇÕES GERAIS</, 'sobrou seção em português');
  assert.match(xml, />Projeto Alfa</, 'o dado do usuário não pode ser traduzido');
});

test('todo marcador do modelo é preenchido, e nenhum nome foi digitado errado', () => {
  /* Este é o erro que não dá sintoma: um marcador escrito com nome diferente
     no app sai como campo vazio na ficha, e um marcador do modelo que o app
     esqueceu sai como "{{campo}}" impresso. Nos dois casos o documento abre
     normalmente — só está errado. A conferência é nos DOIS sentidos. */
  const zip = lerZip(fs.readFileSync(MODELO));
  const xml = zip['word/document.xml'].toString('utf8');
  const doModelo = new Set([...xml.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map(m => m[1]));

  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const corpo = app.slice(
    app.indexOf('function _fichaValores(rec)'),
    app.indexOf('function _nomeArquivoFicha')
  );
  assert.ok(corpo.length > 500, 'não achei o corpo de _fichaValores');

  const produz = new Set();
  for (const m of corpo.matchAll(/^\s{4}([a-z0-9_]+):/gm)) produz.add(m[1]);
  for (const m of corpo.matchAll(/v\['([a-z0-9_]+)'\]/g)) produz.add(m[1]);
  // As famílias repetidas são montadas em laço; expande do mesmo jeito.
  const laços = [
    ['checklist_', 6, ['item', 'responsavel', 'prazo', 'situacao']],
    ['anexo_', 5, ['nome', 'tipo', 'data', 'responsavel']],
    ['historico_', 6, ['data', 'responsavel', 'acao', 'atualizacao', 'observacao']],
    ['documento_', 5, ['nome', 'status', 'solicitado', 'prazo', 'recebido']],
    ['campo_', 14, ['nome', 'valor']],
  ];
  for (const [prefixo, n, sufixos] of laços) {
    for (let i = 1; i <= n; i++) for (const s of sufixos) produz.add(prefixo + i + '_' + s);
  }

  const esquecidos = [...doModelo].filter(m => !produz.has(m));
  assert.deepEqual(esquecidos, [], 'marcador do modelo que o app não preenche sai impresso na ficha');

  /* checklist_N_marca não é marcador do modelo: a caixinha lá é um caractere
     solto (☐), e o preenchimento a troca pela posição, não pelo nome. Fica de
     fora da conferência por isso, e não por descuido. */
  const foraDoModelo = /^checklist_\d+_marca$/;
  const inventados = [...produz].filter(m => !doModelo.has(m) && !foraDoModelo.test(m));
  assert.deepEqual(inventados, [], 'o app preenche um nome que o modelo não tem — campo fica vazio');
});

test('a caixinha do checklist sai marcada quando a etapa está concluída', async () => {
  /* A caixinha do modelo é um caractere, não um controle de formulário — não
     há o que clicar, nem no Word nem no Docs, e .docx não sabe carregar a
     caixa clicável do Google Docs, que é um recurso só dele. O que a ficha
     pode fazer é sair com o que já foi feito marcado; sem isso todas saíam
     vazias e a única pista era a coluna "Situação". */
  const janela = carregarGerador();
  const M = janela.MD_FICHA_DOCX;
  const modelo = lerZip(fs.readFileSync(MODELO))['word/document.xml'].toString('utf8');
  const caixas = (modelo.match(new RegExp(M.CAIXA_VAZIA, 'g')) || []).length;
  assert.ok(caixas >= 6, 'o modelo precisa ter uma caixinha por linha do checklist');

  // Etapas 1 e 3 concluídas, as demais pendentes.
  const feitas = [true, false, true, false, false, false];
  const valores = {};
  feitas.forEach((ok, i) => {
    valores['checklist_' + (i + 1) + '_marca'] = ok ? M.CAIXA_MARCADA : M.CAIXA_VAZIA;
  });

  const blob = await M.gerar(valores, null, '');
  const xml = lerZip(Buffer.from(await blob.arrayBuffer()))['word/document.xml'].toString('utf8');

  // A ordem importa: a enésima caixa é a enésima etapa.
  const sequencia = [...xml].filter(c => c === M.CAIXA_VAZIA || c === M.CAIXA_MARCADA)
    .map(c => c === M.CAIXA_MARCADA);
  assert.deepEqual(sequencia.slice(0, 6), feitas,
    'caixa marcada fora de ordem aponta a etapa errada como concluída');

  // Sem valores, nada é marcado — ficha em branco não pode inventar progresso.
  const vazio = await M.gerar({}, null, '');
  const xmlVazio = lerZip(Buffer.from(await vazio.arrayBuffer()))['word/document.xml'].toString('utf8');
  assert.equal((xmlVazio.match(new RegExp(M.CAIXA_MARCADA, 'g')) || []).length, 0);
});

test('a ficha aceita as duas formas de data que o registro guarda', () => {
  /* Um cliente guarda data de dois jeitos: campo preenchido pela pessoa vem
     como texto 'AAAA-MM-DD', e createdAt vem como número (Date.now()). O
     formatador do CRM só entende o texto — ele faz iso.split('-'). Passar o
     número quebrava a montagem inteira com "iso.split is not a function", e
     como o erro era engolido pelo mesmo catch do modelo, a exportação caía em
     silêncio na versão de texto: o modelo estava lá o tempo todo. */
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const corpo = app.slice(
    app.indexOf('function _fichaValores(rec)'),
    app.indexOf('function _nomeArquivoFicha')
  );

  assert.doesNotMatch(corpo, /const data\s*=\s*v\s*=>\s*_crmFmtDate\(v\)/,
    'passar o valor cru ao formatador quebra com createdAt numérico');
  assert.match(corpo, /typeof v === 'number'/,
    'a ficha precisa reconhecer a data em número');
  assert.match(corpo, /_crmFmtDate\(v\)/,
    'e continuar usando o formatador do CRM para o texto AAAA-MM-DD');

  /* E os dois erros — montar os dados e carregar o modelo — não podem voltar a
     se disfarçar um do outro. */
  assert.match(app, /function _fichaValoresSeguros\(rec\)/);
  assert.match(app, /falha ao montar os dados da ficha/);
});

test('o Google Docs pede a autorização antes de montar o arquivo', () => {
  /* requestAccessToken abre uma janela, e o navegador só permite abrir janela
     enquanto o clique da pessoa ainda conta como gesto. Montar a ficha antes
     significa buscar o modelo na rede, descomprimir e remontar o .docx —
     centenas de milissegundos — e a janela, quando ia abrir, já era bloqueada.
     Foi o que quebrou o recurso quando o modelo entrou no caminho: o botão
     ficava preso em "Conectando…". A ordem é a correção. */
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const fn = app.slice(app.indexOf('async function exportClientToGoogleDocs('));
  const corpo = fn.slice(0, fn.indexOf('\n}'));

  const token = corpo.indexOf('await _googleWorkspaceAccessToken()');
  const monta = corpo.indexOf('_fichaParaGoogleDocs(');
  assert.ok(token > 0, 'o token precisa ser pedido explicitamente');
  assert.ok(monta > 0, 'a ficha precisa ser montada');
  assert.ok(token < monta,
    'pedir o token DEPOIS de montar o arquivo faz o navegador bloquear a janela');
});

test('o erro de API desativada nomeia a API certa e não desiste da ficha', () => {
  /* A mensagem citava "Google Docs API e Google Sheets API" fixo, porque por
     muito tempo foram as únicas em uso. Desde que a ficha passou a subir pelo
     Drive, quem esbarra na API desativada é a do DRIVE — e mandar ativar a API
     errada faz a pessoa procurar no lugar errado. O Google diz qual é no corpo
     da resposta; é de lá que o nome sai. */
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const fn = app.slice(app.indexOf('function _googleWorkspaceError('));
  const corpo = fn.slice(0, fn.indexOf('\n}'));
  assert.match(corpo, /message\.match\(/, 'o nome da API vem da resposta do Google');
  assert.match(corpo, /app\.googleApiDisabledNamed/);
  assert.match(corpo, /extendedHelp/, 'o link de ativação que o Google manda é útil demais para descartar');

  // E a regex precisa mesmo extrair o nome das mensagens que o Google envia.
  const regex = /^([A-Za-z0-9 .]*API)\b/;
  assert.equal(('Google Drive API has not been used in project 1 before or it is disabled.'
    .match(regex) || [])[1], 'Google Drive API');
  assert.equal(('Google Docs API has not been used in project 1 before.'
    .match(regex) || [])[1], 'Google Docs API');

  /* Com o Drive desativado o botão não pode ficar sem entregar nada: cai no
     documento de texto e diz por que saiu sem o desenho. */
  const ficha = app.slice(app.indexOf('async function _fichaParaGoogleDocs('));
  assert.match(ficha.slice(0, 2600), /_fichaAvisoGoogle = msg/);
  assert.match(ficha.slice(0, 2600), /throw erro/,
    'só a API desativada desiste em silêncio — o resto sobe');
});

test('uma falha do Google não pode travar as exportações da sessão', () => {
  /* Docs e Planilha dividem a trava _googleWorkspaceBusy, liberada num
     `finally`. Quando o script do Google falha por dentro (origem não
     autorizada, por exemplo) ele não chama callback nem error_callback: a
     promessa nunca se resolve, o `finally` nunca roda e a trava fica presa —
     dali em diante as duas exportações respondem "já está em andamento" até
     recarregar a página. */
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
  const fn = app.slice(app.indexOf('function _googleWorkspaceAccessToken('));
  const corpo = fn.slice(0, fn.indexOf('\n}'));

  assert.match(corpo, /expirar = setTimeout\(/,
    'sem prazo máximo, a promessa do token pode nunca se resolver');
  assert.match(corpo, /app\.googleConnectTimeout/,
    'o prazo estourado precisa virar mensagem, não silêncio');
  // O cancelamento fica no `finally` que fecha a função, depois do corpo.
  const ateOFim = fn.slice(0, fn.indexOf('\nfunction ', 1));
  assert.match(ateOFim, /clearTimeout\(expirar\)/,
    'o prazo tem de ser cancelado quando a resposta chega');
});

test('a exportação usa o modelo e cai no texto simples se ele faltar', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');

  const word = app.slice(app.indexOf('async function exportClientCard('));
  assert.match(word.slice(0, 1200), /MD_FICHA_DOCX\.gerar\(valores, _fichaDicionario\(\)\)/);
  assert.match(word.slice(0, 1200), /_exportClientCardSimples\(rec\)/,
    'modelo indisponível não pode deixar o botão sem fazer nada');

  /* No Google Docs o mesmo .docx sobe para o Drive pedindo conversão — é o que
     faz o resultado sair igual ao Word em vez de texto corrido. */
  const gdocs = app.slice(app.indexOf('async function _fichaParaGoogleDocs('));
  assert.match(gdocs.slice(0, 1600), /application\/vnd\.google-apps\.document/,
    'sem este mimeType no metadado o Drive guarda o .docx sem converter');
  assert.match(gdocs.slice(0, 1600), /uploadType=multipart/);
  assert.match(gdocs.slice(0, 1600), /return null/,
    'sem modelo, devolve null para o chamador seguir pelo caminho de texto');
});
