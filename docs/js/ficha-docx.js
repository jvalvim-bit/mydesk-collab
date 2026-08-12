'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   FICHA DE CLIENTE NO MODELO OFICIAL
   ═══════════════════════════════════════════════════════════════════════
   A exportação de ficha era uma lista de "rótulo: valor" em RTF. Saía correta
   e parecia rascunho — o que a pessoa manda para o cliente dela é a cara do
   trabalho dela, não do nosso.

   Agora o que sai é `docs/modelos/ficha-mydesk.docx`, o modelo oficial, com os
   dados preenchidos nos lugares. O modelo é um .docx de verdade, com as
   tabelas, as cores e o logo — e ele é a ÚNICA fonte do layout: para mudar o
   desenho, troca-se o arquivo, sem tocar em código.

   COMO É POSSÍVEL SEM BIBLIOTECA
   Um .docx é um ZIP de XMLs. Três coisas tornam isto simples aqui:

     1. Os marcadores do modelo ({{nome_razao_social}}) estão INTEIROS dentro
        de um <w:t> só. Word costuma picar texto em vários pedaços quando é
        digitado à mão, o que exigiria remontar os pedaços antes de procurar;
        este modelo foi gerado por programa e não tem esse problema. Os 172
        marcadores foram conferidos um a um.
     2. Ao remontar o ZIP, só uma entrada muda de tamanho. Todas as outras são
        copiadas byte a byte, com a compressão original — não é preciso
        comprimir nada.
     3. A entrada modificada é gravada SEM compressão (método "stored"), que o
        ZIP permite e o Word aceita. Some a necessidade de um compressor.

   Sobra só descomprimir os dois XMLs que mudam, e para isso o próprio
   navegador tem DecompressionStream. Zero dependência, zero build.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  /* Marca de versão do gerador, anunciada no console a cada ficha.
     Existe porque duas correções seguidas pareceram "não mudar nada", e sem um
     jeito de saber qual código rodou não havia como separar "a correção falhou"
     de "o navegador serviu o arquivo antigo do cache". */
  const VERSAO = 5;
  const CAIXA_VAZIA = '☐';   // ☐, a caixinha do checklist no modelo
  const CAIXA_MARCADA = '☑'; // ☑
  const CAMINHO_MODELO = 'modelos/ficha-mydesk.docx';
  /* Os XMLs que levam texto visível. O rodapé é um arquivo à parte no Word —
     sem ele, o rodapé continuaria em português num documento em inglês. */
  const XMLS_COM_TEXTO = ['word/document.xml', 'word/footer1.xml'];

  // ── CRC32 ────────────────────────────────────────────────────────────
  // Exigido pelo formato ZIP em cada entrada. Só é calculado para a entrada
  // reescrita; as copiadas trazem o CRC original do arquivo.
  let _tabelaCrc = null;
  function _crc32(bytes) {
    if (!_tabelaCrc) {
      _tabelaCrc = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _tabelaCrc[i] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ _tabelaCrc[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── Leitura do ZIP ───────────────────────────────────────────────────
  /* Lê pelo DIRETÓRIO CENTRAL, no fim do arquivo, e não varrendo os cabeçalhos
     locais do começo: é o índice oficial do ZIP e o único lugar onde os
     tamanhos são sempre confiáveis (o cabeçalho local pode deixá-los para um
     descritor depois dos dados). */
  function _lerZip(buffer) {
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let eocd = -1;
    const minimo = Math.max(0, bytes.length - 66000);   // 64 KB de comentário + folga
    for (let i = bytes.length - 22; i >= minimo; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP sem diretório central');

    const total = dv.getUint16(eocd + 10, true);
    let pos = dv.getUint32(eocd + 16, true);
    const entradas = [];
    for (let i = 0; i < total; i++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) throw new Error('entrada de ZIP inválida');
      const metodo    = dv.getUint16(pos + 10, true);
      const crc       = dv.getUint32(pos + 16, true);
      const tamComp   = dv.getUint32(pos + 20, true);
      const tamCru    = dv.getUint32(pos + 24, true);
      const nomeLen   = dv.getUint16(pos + 28, true);
      const extraLen  = dv.getUint16(pos + 30, true);
      const comentLen = dv.getUint16(pos + 32, true);
      const offLocal  = dv.getUint32(pos + 42, true);
      const nome = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nomeLen));

      // O início dos dados só se sabe lendo o cabeçalho local: os campos de
      // nome e extra dele têm tamanho próprio, diferente do central.
      const nomeLocal  = dv.getUint16(offLocal + 26, true);
      const extraLocal = dv.getUint16(offLocal + 28, true);
      const inicio = offLocal + 30 + nomeLocal + extraLocal;

      entradas.push({
        nome, metodo, crc, tamCru,
        dados: bytes.subarray(inicio, inicio + tamComp),
      });
      pos += 46 + nomeLen + extraLen + comentLen;
    }
    return entradas;
  }

  async function _inflar(entrada) {
    if (entrada.metodo === 0) return entrada.dados;          // já sem compressão
    if (entrada.metodo !== 8) throw new Error('compressão não suportada: ' + entrada.metodo);
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Este navegador não sabe descomprimir o modelo.');
    }
    const fluxo = new Blob([entrada.dados]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }

  async function _deflacionar(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try {
      const fluxo = new Blob([bytes]).stream()
        .pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(fluxo).arrayBuffer());
    } catch (_) {
      return null;   // grava sem compressão; o ZIP aceita as duas formas
    }
  }

  // ── Escrita do ZIP ───────────────────────────────────────────────────
  function _escreverZip(entradas) {
    const codificador = new TextEncoder();
    const pedacos = [];
    const indice = [];
    let offset = 0;

    entradas.forEach(e => {
      const nome = codificador.encode(e.nome);
      const local = new Uint8Array(30 + nome.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);           // versão mínima
      dv.setUint16(6, 0x0800, true);       // nomes em UTF-8; sem descritor adiado
      dv.setUint16(8, e.metodo, true);
      dv.setUint16(10, 0, true);           // hora
      dv.setUint16(12, 0x21, true);        // data (1980-01-01): documento não tem
      dv.setUint32(14, e.crc, true);       //   histórico, e data fixa deixa a
      dv.setUint32(18, e.dados.length, true); //  saída igual para o mesmo dado
      dv.setUint32(22, e.tamCru, true);
      dv.setUint16(26, nome.length, true);
      dv.setUint16(28, 0, true);
      local.set(nome, 30);

      indice.push({ e, nome, offset });
      pedacos.push(local, e.dados);
      offset += local.length + e.dados.length;
    });

    const inicioDiretorio = offset;
    indice.forEach(({ e, nome, offset: off }) => {
      const central = new Uint8Array(46 + nome.length);
      const dv = new DataView(central.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, e.metodo, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0x21, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.dados.length, true);
      dv.setUint32(24, e.tamCru, true);
      dv.setUint16(28, nome.length, true);
      dv.setUint32(42, off, true);
      central.set(nome, 46);
      pedacos.push(central);
      offset += central.length;
    });

    const fim = new Uint8Array(22);
    const dvFim = new DataView(fim.buffer);
    dvFim.setUint32(0, 0x06054b50, true);
    dvFim.setUint16(8, indice.length, true);
    dvFim.setUint16(10, indice.length, true);
    dvFim.setUint32(12, offset - inicioDiretorio, true);
    dvFim.setUint32(16, inicioDiretorio, true);
    pedacos.push(fim);

    return new Blob(pedacos, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  // ── Texto ────────────────────────────────────────────────────────────
  function _xml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Quebra de linha dentro de uma célula precisa virar <w:br/>, senão o Word
     mostra tudo numa linha só — some a formatação de quem escreveu a descrição
     em parágrafos. Como estamos reescrevendo o <w:t> inteiro, dá para fechá-lo
     e reabri-lo em volta de cada quebra. */
  function _valorXml(valor, aberturaTag) {
    const partes = String(valor == null ? '' : valor).split(/\r?\n/);
    return partes.map(_xml).join('</w:t><w:br/>' + aberturaTag);
  }

  /* ── Largura das tabelas ──────────────────────────────────────────────
     O modelo declara toda tabela como `tblW type="auto"`, e diz a largura real
     só na grade de colunas (tblGrid). O Word resolve isso sozinho: ele soma a
     grade e desenha na largura certa. O importador do Google Docs não — ele lê
     "auto" como "encolha até caber o conteúdo".

     O estrago aparecia lá: os títulos de seção, que são tabelas de uma célula
     ocupando a largura da página, viravam caixinhas com o texto quebrado em
     três linhas; e as tabelas de dados encolhiam e, como têm jc="center",
     ficavam boiando no meio da página, cada uma num alinhamento diferente.

     A correção é dizer explicitamente o que o Word já calculava: largura =
     soma da grade, e layout fixo. Feito aqui, e não no arquivo, porque assim
     vale para qualquer modelo que alguém coloque na pasta — inclusive uma
     versão nova salva pelo Word, que voltaria a gravar "auto". */
  /* Largura útil da página, em twips: é contra ela que se sabe quais tabelas
     querem ocupar a linha inteira. Vem do próprio documento — chutar A4 daria
     errado no dia em que o modelo mudasse de tamanho de página. */
  function _larguraUtil(xml) {
    const secao = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    if (!secao) return 0;
    const pagina = Number((secao[0].match(/<w:pgSz[^>]*w:w="(\d+)"/) || [])[1] || 0);
    const margens = secao[0].match(/<w:pgMar[^>]*\/>/);
    if (!pagina || !margens) return 0;
    const esq = Number((margens[0].match(/w:left="(\d+)"/) || [])[1] || 0);
    const dir = Number((margens[0].match(/w:right="(\d+)"/) || [])[1] || 0);
    return pagina - esq - dir;
  }

  /* ── Tabelas coladas ──────────────────────────────────────────────────
     Onze tabelas do modelo terminam e a seguinte começa sem nada no meio:
     </w:tbl><w:tbl>. Em OOXML isso é ambíguo, e o Google Docs resolve FUNDINDO
     as duas numa tabela só.

     É daí que vinha a caixinha. A faixa de título é uma tabela de uma célula
     com a largura da página; fundida com a tabela de dados logo abaixo, ela
     vira apenas mais uma linha — e passa a valer a grade da tabela de baixo,
     cuja primeira coluna tem 1587 twips, ou 15% da página. O texto então
     quebra em três linhas dentro desses 15%, que é exatamente o que se via.

     Por isso nem largura em twips nem em porcentagem adiantaram: a faixa já
     não era uma tabela própria quando o Docs decidia o tamanho dela.

     A separação é um parágrafo vazio de 1 twip de altura e fonte de 1 ponto —
     invisível, e o bastante para as duas tabelas continuarem duas. */
  const SEPARADOR =
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/>' +
    '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';

  function _separarTabelasColadas(xml) {
    return xml.replace(/<\/w:tbl>\s*<w:tbl>/g, '</w:tbl>' + SEPARADOR + '<w:tbl>');
  }

  function _normalizarLarguraTabelas(xml) {
    const util = _larguraUtil(xml);
    return xml.replace(/<w:tbl>[\s\S]*?<\/w:tblGrid>/g, bloco => {
      const grade = bloco.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
      if (!grade) return bloco;
      const soma = [...grade[0].matchAll(/w:w="(\d+)"/g)]
        .reduce((total, m) => total + Number(m[1]), 0);
      if (!soma) return bloco;

      /* Twips não bastam para o Google Docs. Declarar a largura exata em
         unidade absoluta consertou nada: as faixas de título continuaram
         encolhendo até o texto, quebrando "1. INFORMAÇÕES GERAIS" em três
         linhas dentro de uma caixinha.

         Quem o importador respeita é a PORCENTAGEM. E são exatamente as faixas
         que pedem 100%: elas são as tabelas cuja grade ocupa a largura útil
         inteira da página. As de dados, mais estreitas que isso, já saem certas
         em twips — e ficam como estão, para não arriscar o Word, que hoje
         acerta todas. */
      const largura = (util && soma >= util)
        ? '<w:tblW w:type="pct" w:w="5000"/>'
        : `<w:tblW w:type="dxa" w:w="${soma}"/>`;
      const layout = '<w:tblLayout w:type="fixed"/>';
      let novo = /<w:tblW[^>]*\/>/.test(bloco)
        ? bloco.replace(/<w:tblW[^>]*\/>/, largura)
        // Tabela sem tblW: a propriedade entra no começo do bloco de propriedades.
        : bloco.replace('<w:tblPr>', '<w:tblPr>' + largura);
      if (!/<w:tblLayout/.test(novo)) novo = novo.replace(largura, largura + layout);
      return novo;
    });
  }

  /* Uma passada só sobre o conteúdo de cada <w:t>: quem tem marcador vira
     valor, quem não tem é rótulo fixo e vira tradução. Fazer isso pelo
     elemento, e não por busca-e-troca no arquivo todo, evita acertar nome de
     estilo, cor ou qualquer outro texto que mora em atributo. */
  function _preencherXml(xml, valores, dicionario) {
    let caixa = 0;
    return xml.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (todo, abre, conteudo, fecha) => {
      /* A caixinha do checklist é um CARACTERE no modelo (☐), não um controle
         de formulário — não há o que clicar, nem no Word nem no Google Docs, e
         .docx não tem como carregar a caixa clicável do Docs, que é um recurso
         só dele.

         O que a ficha pode fazer, e é o que serve, é sair com as etapas já
         concluídas marcadas. As caixas aparecem na ordem das linhas, então a
         enésima é a enésima etapa. */
      if (conteudo === CAIXA_VAZIA) {
        caixa++;
        return abre + _xml(valores['checklist_' + caixa + '_marca'] || CAIXA_VAZIA) + fecha;
      }
      if (conteudo.indexOf('{{') >= 0) {
        const preenchido = conteudo.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, chave) =>
          _valorXml(valores[chave], abre));
        return abre + preenchido + fecha;
      }
      if (dicionario) {
        const bruto = conteudo
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const traduzido = dicionario[bruto];
        if (traduzido) return abre + _xml(traduzido) + fecha;
      }
      return todo;
    });
  }

  // ── Montagem ─────────────────────────────────────────────────────────
  let _modeloCache = null;
  async function _carregarModelo(base) {
    if (_modeloCache) return _modeloCache;
    const resposta = await fetch((base || '') + CAMINHO_MODELO, { cache: 'force-cache' });
    if (!resposta.ok) throw new Error('modelo não encontrado (' + resposta.status + ')');
    _modeloCache = _lerZip(await resposta.arrayBuffer());
    return _modeloCache;
  }

  /* Devolve o .docx preenchido como Blob.
     `valores` são os marcadores; `dicionario` traduz os rótulos fixos (nulo
     mantém o português, que é o original do modelo). */
  async function gerar(valores, dicionario, base) {
    console.info('[ficha] gerador v' + VERSAO);
    const entradas = await _carregarModelo(base);
    const codificador = new TextEncoder();
    const saida = [];

    for (const entrada of entradas) {
      if (XMLS_COM_TEXTO.indexOf(entrada.nome) < 0) {
        saida.push(entrada);                       // cópia byte a byte
        continue;
      }
      const xml = _normalizarLarguraTabelas(
        _separarTabelasColadas(new TextDecoder().decode(await _inflar(entrada))));
      const novo = codificador.encode(_preencherXml(xml, valores || {}, dicionario));
      /* Comprimir é opcional: sem isto o arquivo sai válido, só maior (o XML
         desta ficha sozinho passa de 140 KB). Quando o navegador oferece o
         compressor, usa; quando não, grava cru e o Word abre igual. */
      const comprimido = await _deflacionar(novo);
      saida.push({
        nome: entrada.nome,
        metodo: comprimido ? 8 : 0,
        crc: _crc32(novo),
        tamCru: novo.length,
        dados: comprimido || novo,
      });
    }
    return _escreverZip(saida);
  }

  global.MD_FICHA_DOCX = {
    gerar, _preencherXml, _crc32, _normalizarLarguraTabelas, _separarTabelasColadas,
    CAMINHO_MODELO, VERSAO, CAIXA_VAZIA, CAIXA_MARCADA,
  };
})(window);
