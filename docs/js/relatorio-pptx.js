'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O RELATÓRIO FINANCEIRO, EM POWERPOINT
   ═══════════════════════════════════════════════════════════════════════
   O relatório já existia na tela e em PDF. O PDF serve para arquivar e
   anexar; não serve para a reunião com o sócio, o contador ou o cliente —
   onde alguém vai querer apagar um slide, trocar a cor de uma barra ou
   colar um gráfico noutro lugar. É por isso que se pede PowerPoint, e não
   um PDF com outra extensão.

   POR QUE ESCRITO À MÃO. Um .pptx é um ZIP de XML (OOXML). As bibliotecas
   que geram isso pesam centenas de kB e seriam baixadas por todo mundo que
   abre o MyDesk, para um botão que se clica uma vez por mês. E há um atalho
   que dispensa qualquer dependência: o ZIP aceita entradas SEM COMPRESSÃO
   (método 0), então não é preciso deflate — só o CRC32 de cada arquivo, que
   são quinze linhas. O mesmo caminho do PDF da proposta.

   TUDO É FORMA NATIVA, e nada é imagem colada. As barras são retângulos, a
   rosca são fatias `pie` com um disco branco no meio, os números são caixas
   de texto. Quem abre no PowerPoint ou no Google Slides pode selecionar,
   recolorir, reescrever e reposicionar cada peça — que é exatamente o que um
   gráfico exportado como PNG não deixa fazer, e o motivo de existir este
   arquivo.

   O QUE ELE NÃO FAZ: gráfico "de dados" do Office (aquele com a planilha
   embutida, que se atualiza sozinho). Ele exige uma pasta `charts/` com
   XLSX dentro do pptx, e o ganho — poder reabrir a planilha — não paga o
   tamanho nem o risco de gerar um arquivo que o Slides recusa. Formas se
   editam em qualquer leitor.
   ═══════════════════════════════════════════════════════════════════════ */
(function (raiz, definir) {
  const api = definir();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.MD_RELATORIO_PPTX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ── ZIP sem compressão ────────────────────────────────────────────────
     Cada entrada entra crua, com o CRC32 no cabeçalho. É maior que um zip
     comprimido — um relatório sai com algumas centenas de kB —, e em troca
     não depende de zlib, que no navegador e no servidor seriam dois caminhos
     diferentes para o mesmo arquivo. */
  let _tabelaCrc = null;
  function crc32(bytes) {
    if (!_tabelaCrc) {
      _tabelaCrc = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _tabelaCrc[n] = c;
      }
    }
    let c = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) {
      c = (c >>> 8) ^ _tabelaCrc[(c ^ bytes[i]) & 0xFF];
    }
    return (c ^ (-1)) >>> 0;
  }

  /* UTF-8 na mão: TextEncoder existe nos dois lados, mas escrever o próprio
     conversor evita depender de um global que um ambiente antigo não tem. */
  function utf8(texto) {
    const s = String(texto);
    const saida = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.codePointAt(i);
      if (c > 0xFFFF) i++;
      if (c < 0x80) saida.push(c);
      else if (c < 0x800) saida.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) saida.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else saida.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63),
                      0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return saida;
  }

  function zip(entradas) {
    const bytes = [];
    const central = [];
    const p16 = (arr, v) => { arr.push(v & 255, (v >> 8) & 255); };
    const p32 = (arr, v) => { arr.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); };

    entradas.forEach(({ nome, dados }) => {
      const nomeB = utf8(nome);
      const crc = crc32(dados);
      const inicio = bytes.length;
      p32(bytes, 0x04034b50);
      p16(bytes, 20); p16(bytes, 0x0800); p16(bytes, 0);   // versão, flag UTF-8, método 0
      p16(bytes, 0); p16(bytes, 0x21);                     // hora/data fixas: 1980-01-01
      p32(bytes, crc); p32(bytes, dados.length); p32(bytes, dados.length);
      p16(bytes, nomeB.length); p16(bytes, 0);
      nomeB.forEach(b => bytes.push(b));
      for (let i = 0; i < dados.length; i++) bytes.push(dados[i]);

      p32(central, 0x02014b50);
      p16(central, 20); p16(central, 20); p16(central, 0x0800); p16(central, 0);
      p16(central, 0); p16(central, 0x21);
      p32(central, crc); p32(central, dados.length); p32(central, dados.length);
      p16(central, nomeB.length); p16(central, 0); p16(central, 0);
      p16(central, 0); p16(central, 0); p32(central, 0);
      p32(central, inicio);
      nomeB.forEach(b => central.push(b));
    });

    const inicioCentral = bytes.length;
    central.forEach(b => bytes.push(b));
    p32(bytes, 0x06054b50);
    p16(bytes, 0); p16(bytes, 0);
    p16(bytes, entradas.length); p16(bytes, entradas.length);
    p32(bytes, central.length); p32(bytes, inicioCentral);
    p16(bytes, 0);
    return bytes;
  }

  /* ── Medidas ───────────────────────────────────────────────────────────
     EMU é a unidade do Office: 914400 por polegada, 12700 por ponto. O slide
     é 16:9 — 13,333 × 7,5 polegadas —, que é o formato de qualquer projetor
     e de qualquer tela desde que o 4:3 morreu. */
  const PT = 12700;
  const L = 12192000, A = 6858000;          // largura e altura do slide
  const pt = v => Math.round(v * PT);

  function xml(texto) {
    return String(texto === undefined || texto === null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      /* Caractere de controle quebra o XML sem dó, e um nome de cliente colado
         de outro sistema traz tabulação e quebra de linha com frequência. */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /* ── Peças de slide ────────────────────────────────────────────────────
     Cada uma devolve o XML de UMA forma. `id` precisa ser único dentro do
     slide: o PowerPoint recusa o arquivo se dois shapes dividirem o mesmo. */
  let _id = 1;
  const proxId = () => ++_id;

  function moldura(nome, x, y, cx, cy, giro) {
    return `<p:nvSpPr><p:cNvPr id="${proxId()}" name="${xml(nome)}"/>` +
      `<p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm${giro ? ' rot="' + Math.round(giro * 60000) + '"' : ''}>` +
      `<a:off x="${Math.round(x)}" y="${Math.round(y)}"/>` +
      `<a:ext cx="${Math.round(Math.max(1, cx))}" cy="${Math.round(Math.max(1, cy))}"/></a:xfrm>`;
  }

  function forma(nome, x, y, cx, cy, o) {
    o = o || {};
    const geo = o.geo || 'rect';
    const ajustes = o.ajustes
      ? '<a:avLst>' + o.ajustes.map(([n, v]) =>
          `<a:gd name="${n}" fmla="val ${Math.round(v)}"/>`).join('') + '</a:avLst>'
      : '<a:avLst/>';
    const preenche = o.cor
      ? `<a:solidFill><a:srgbClr val="${o.cor}"${
          o.opacidade !== undefined
            ? `><a:alpha val="${Math.round(o.opacidade * 100000)}"/></a:srgbClr>`
            : '/>'}</a:solidFill>`
      : '<a:noFill/>';
    const traco = o.borda
      ? `<a:ln w="${pt(o.bordaLarg || 1)}"><a:solidFill><a:srgbClr val="${o.borda}"/></a:solidFill></a:ln>`
      : '<a:ln><a:noFill/></a:ln>';
    return `<p:sp>${moldura(nome, x, y, cx, cy, o.giro)}` +
      `<a:prstGeom prst="${geo}">${ajustes}</a:prstGeom>${preenche}${traco}</p:spPr>` +
      `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
  }

  /* Caixa de texto. `linhas` é uma lista de { t, tam, cor, negrito, espaco }
     — cada uma vira um parágrafo, e é assim que um título e a sua legenda
     ficam no mesmo bloco, alinhados entre si sem depender de duas caixas. */
  function texto(nome, x, y, cx, cy, linhas, o) {
    o = o || {};
    const alinhar = o.alinhar || 'l';
    const ancora = o.ancora || 't';
    const corpo = (Array.isArray(linhas) ? linhas : [linhas]).map(ln => {
      const l = typeof ln === 'string' ? { t: ln } : ln;
      const props = `<a:rPr lang="pt-BR" sz="${Math.round((l.tam || 14) * 100)}"` +
        `${l.negrito ? ' b="1"' : ''}${l.italico ? ' i="1"' : ''}` +
        `${l.espaco ? ` spc="${Math.round(l.espaco * 100)}"` : ''} dirty="0">` +
        `<a:solidFill><a:srgbClr val="${l.cor || '14141C'}"/></a:solidFill>` +
        `<a:latin typeface="${l.fonte || o.fonte || 'Calibri'}"/></a:rPr>`;
      const espacoAntes = l.antes ? `<a:spcBef><a:spcPts val="${Math.round(l.antes * 100)}"/></a:spcBef>` : '';
      return `<a:p><a:pPr algn="${l.alinhar || alinhar}">${espacoAntes}</a:pPr>` +
        `<a:r>${props}<a:t>${xml(l.t)}</a:t></a:r></a:p>`;
    }).join('');
    return `<p:sp>${moldura(nome, x, y, cx, cy)}` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="square" anchor="${ancora}" lIns="0" tIns="0" rIns="0" bIns="0">` +
      `<a:normAutofit/></a:bodyPr><a:lstStyle/>${corpo}</p:txBody></p:sp>`;
  }

  /* Fatia de pizza. O Office mede o ângulo em 1/60000 de grau, começando às
     3 horas e crescendo no sentido horário — daí o -90 para a primeira fatia
     sair do topo, que é onde todo mundo espera que ela comece. */
  function fatia(cx, cy, raio, grausInicio, grausFim, cor) {
    /* ÂNGULO NEGATIVO DESLOCA A FORMA. O -90 põe a primeira fatia no topo, e
       com isso ela nasce em -90°. O PowerPoint não normaliza esse valor: ele
       desenha a fatia com o centro em outro lugar, e no slide ela aparece
       escorregada para fora da rosca enquanto as outras se encaixam. Foi
       exatamente o que aconteceu — e só com a primeira, que é a única que
       cruza o zero. Normalizar para [0,360) resolve, e o arco continua o
       mesmo: quando o fim fica menor que o começo, o `pie` atravessa o zero,
       que é o comportamento certo. */
    const norm = g => ((g % 360) + 360) % 360;
    const a1 = norm(grausInicio - 90) * 60000;
    const a2 = norm(grausFim - 90) * 60000;
    return `<p:sp>${moldura('fatia', cx - raio, cy - raio, raio * 2, raio * 2)}` +
      `<a:prstGeom prst="pie"><a:avLst>` +
      `<a:gd name="adj1" fmla="val ${Math.round(a1)}"/>` +
      `<a:gd name="adj2" fmla="val ${Math.round(a2)}"/>` +
      `</a:avLst></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="${cor}"/></a:solidFill>` +
      `<a:ln w="${pt(1.5)}"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>` +
      `</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
  }

  /* ── O ESQUELETO DO ARQUIVO ────────────────────────────────────────────
     Um .pptx precisa de mais coisa do que os slides: a lista de tipos de
     conteúdo, as relações entre as partes, um slide-mestre, um layout e um
     tema. Nada disso aparece na tela — e sem qualquer um deles o PowerPoint
     recusa o arquivo inteiro, com uma mensagem que não diz o que faltou.

     São escritos no mínimo válido, de propósito: o desenho vive nos slides,
     e um mestre cheio de placeholders só serviria para o PowerPoint tentar
     "consertar" o que a gente posicionou. */
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const CAB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ARVORE_VAZIA =
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

  function slideXml(formas) {
    return CAB + `<p:sld ${NS}><p:cSld><p:spTree>${ARVORE_VAZIA}${formas.join('')}` +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }

  function temaXml() {
    const cor = (nome, val) => `<a:${nome}><a:srgbClr val="${val}"/></a:${nome}>`;
    const fonte = tag => `<a:${tag}><a:latin typeface="Calibri"/>` +
      '<a:ea typeface=""/><a:cs typeface=""/></a:' + tag + '>';
    const preenchimentos =
      '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
      '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
      '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>' +
      '<a:effectStyle><a:effectLst/></a:effectStyle>' +
      '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>';
    return CAB +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MyDesk">' +
      '<a:themeElements><a:clrScheme name="MyDesk">' +
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
      '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      cor('dk2', '14141C') + cor('lt2', 'F4F4F7') +
      cor('accent1', '4F46E5') + cor('accent2', '0F7A52') + cor('accent3', '0E7490') +
      cor('accent4', 'C98A04') + cor('accent5', 'B3261E') + cor('accent6', '6B6B7B') +
      cor('hlink', '4F46E5') + cor('folHlink', '6B6B7B') +
      '</a:clrScheme><a:fontScheme name="MyDesk">' +
      fonte('majorFont') + fonte('minorFont') +
      '</a:fontScheme><a:fmtScheme name="MyDesk">' + preenchimentos + '</a:fmtScheme>' +
      '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  function mestreXml() {
    return CAB + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr>` +
      '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      `<p:spTree>${ARVORE_VAZIA}</p:spTree></p:cSld>` +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
      'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" ' +
      'hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '</p:sldMaster>';
  }

  function layoutXml() {
    return CAB + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Em branco">` +
      `<p:spTree>${ARVORE_VAZIA}</p:spTree></p:cSld>` +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  }

  function pacote(slides, titulo) {
    const n = slides.length;
    const entradas = [];
    const add = (nome, texto) => entradas.push({ nome, dados: utf8(texto) });

    const tipos = CAB +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ` +
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join('') +
      '</Types>';
    add('[Content_Types].xml', tipos);

    add('_rels/.rels', CAB +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>');

    const agora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    add('docProps/core.xml', CAB +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xml(titulo)}</dc:title><dc:creator>MyDesk</dc:creator>` +
      `<cp:lastModifiedBy>MyDesk</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${agora}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${agora}</dcterms:modified>` +
      '</cp:coreProperties>');

    add('docProps/app.xml', CAB +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>MyDesk</Application>' +
      `<Slides>${n}</Slides><Company></Company></Properties>`);

    add('ppt/presentation.xml', CAB + `<p:presentation ${NS} saveSubsetFonts="1">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + slides.map((_, i) =>
        `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('') + '</p:sldIdLst>' +
      `<p:sldSz cx="${L}" cy="${A}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      '</p:presentation>');

    const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    add('ppt/_rels/presentation.xml.rels', CAB +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${rel}slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
      slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${rel}slide" ` +
        `Target="slides/slide${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 2}" Type="${rel}theme" Target="theme/theme1.xml"/>` +
      '</Relationships>');

    add('ppt/theme/theme1.xml', temaXml());
    add('ppt/slideMasters/slideMaster1.xml', mestreXml());
    add('ppt/slideMasters/_rels/slideMaster1.xml.rels', CAB +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${rel}slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
      `<Relationship Id="rId2" Type="${rel}theme" Target="../theme/theme1.xml"/>` +
      '</Relationships>');
    add('ppt/slideLayouts/slideLayout1.xml', layoutXml());
    add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', CAB +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${rel}slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
      '</Relationships>');

    slides.forEach((formas, i) => {
      add(`ppt/slides/slide${i + 1}.xml`, slideXml(formas));
      add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, CAB +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${rel}slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
        '</Relationships>');
    });

    return zip(entradas);
  }

  /* ── A PALETA ──────────────────────────────────────────────────────────
     A mesma do relatório em PDF, e não uma nova: o documento impresso e a
     apresentação falam do mesmo dinheiro, e verde querer dizer "pago" nos
     dois é o que dispensa legenda na segunda vez que alguém olha. Ela já
     passou pelo validador de daltonismo e de croma do projeto — por isso
     todo segmento carrega rótulo escrito, e a cor nunca é o único sinal. */
  const C = {
    pago: '0F7A52', parcial: '0E7490', pendente: 'C98A04', atraso: 'B3261E',
    marca: '4F46E5', marcaClara: 'C7D2FE', tinta: '14141C', fraca: '6B6B7B',
    linha: 'E4E4EA', fundo: 'F7F7FA', branco: 'FFFFFF', capa: '101020',
  };

  const M = pt(46);                    // margem lateral
  const LU = L - M * 2;                // largura útil

  /* Cabeçalho comum. A faixa fina no alto é o que dá unidade ao conjunto
     quando os slides passam um atrás do outro em tela cheia. */
  function cabecalho(titulo, legenda) {
    const f = [];
    f.push(forma('faixa', 0, 0, L, pt(6), { cor: C.marca }));
    f.push(texto('titulo', M, pt(38), LU, pt(40), [
      { t: titulo, tam: 26, negrito: true, cor: C.tinta },
    ]));
    if (legenda) {
      f.push(texto('legenda', M, pt(76), LU, pt(24), [
        { t: legenda, tam: 12, cor: C.fraca },
      ]));
    }
    return f;
  }

  function rodape(d, numero, total) {
    return [
      forma('fioPe', M, A - pt(46), LU, pt(0.8), { cor: C.linha }),
      texto('pe', M, A - pt(36), LU * 0.7, pt(20), [
        { t: d.rodape || '', tam: 9, cor: C.fraca },
      ]),
      texto('num', M + LU * 0.7, A - pt(36), LU * 0.3, pt(20), [
        { t: numero + ' / ' + total, tam: 9, cor: C.fraca, alinhar: 'r' },
      ]),
    ];
  }

  /* Cartão de indicador: rótulo pequeno, número grande, uma linha de pé. O
     filete colorido à esquerda existe para o olho achar o cartão certo sem
     ler o rótulo — é o mesmo recurso do quadro de condições da proposta. */
  function cartao(x, y, cx, cy, k) {
    return [
      forma('cartao', x, y, cx, cy, { cor: C.fundo }),
      forma('filete', x, y, pt(3.5), cy, { cor: k.cor || C.marca }),
      texto('kpiRot', x + pt(16), y + pt(14), cx - pt(28), pt(16), [
        { t: k.rot, tam: 9.5, negrito: true, cor: C.fraca, espaco: 1 },
      ]),
      texto('kpiNum', x + pt(16), y + pt(34), cx - pt(28), pt(34), [
        { t: k.valor, tam: k.tam || 24, negrito: true, cor: k.corNum || C.tinta },
      ]),
      texto('kpiPe', x + pt(16), y + cy - pt(24), cx - pt(28), pt(18), [
        { t: k.pe || '', tam: 9, cor: C.fraca },
      ]),
    ];
  }

  /* ── SLIDE 1 · capa ─────────────────────────────────────────────────── */
  function slideCapa(d) {
    return [
      forma('fundo', 0, 0, L, A, { cor: C.capa }),
      /* O galão é o mesmo do papel da proposta, virado e em escala de slide:
         é o que faz a apresentação e o documento parecerem da mesma casa. */
      forma('galao', L * 0.58, -pt(40), L * 0.5, A + pt(80),
        { cor: C.marca, opacidade: 0.16, geo: 'parallelogram', ajustes: [['adj', 40000]] }),
      forma('galao2', L * 0.72, -pt(40), L * 0.34, A + pt(80),
        { cor: C.marca, opacidade: 0.1, geo: 'parallelogram', ajustes: [['adj', 40000]] }),
      texto('marca', M, pt(58), LU, pt(24), [
        { t: 'MyDesk', tam: 13, negrito: true, cor: C.marcaClara, espaco: 3 },
      ]),
      texto('capaTit', M, A * 0.34, LU * 0.66, pt(120), [
        { t: d.titulo, tam: 40, negrito: true, cor: C.branco },
        { t: d.subtitulo || '', tam: 16, cor: 'A5B4FC', antes: 10 },
      ]),
      forma('fioCapa', M, A * 0.63, pt(90), pt(3), { cor: C.marca }),
      texto('capaPe', M, A * 0.72, LU * 0.66, pt(70), [
        { t: d.periodo || '', tam: 12, cor: 'C7C7D6' },
        { t: d.emitido || '', tam: 10.5, cor: '8A8A99', antes: 5 },
        { t: d.referencia ? 'Ref. ' + d.referencia : '', tam: 10.5, cor: '8A8A99', antes: 3 },
      ]),
    ];
  }

  /* ── SLIDE 2 · os números do período ────────────────────────────────── */
  function slideResumo(d) {
    const f = cabecalho(d.t.resumo, d.t.resumoSub);
    const cols = 3, linhas = 2;
    const gap = pt(14);
    const cx = (LU - gap * (cols - 1)) / cols;
    const cy = pt(104);
    const y0 = pt(120);
    (d.kpis || []).slice(0, cols * linhas).forEach((k, i) => {
      const x = M + (i % cols) * (cx + gap);
      const y = y0 + Math.floor(i / cols) * (cy + gap);
      cartao(x, y, cx, cy, k).forEach(p => f.push(p));
    });
    return f;
  }

  /* ── SLIDE 3 · evolução ─────────────────────────────────────────────── */
  function slideEvolucao(d) {
    const f = cabecalho(d.t.evolucao, d.t.evolucaoSub);
    const meses = d.meses || [];
    const areaX = M, areaY = pt(140), areaL = LU, areaA = pt(220);
    const maior = Math.max(1, ...meses.map(m => Math.max(m.total, m.pago)));
    const passo = areaL / Math.max(1, meses.length);
    const larguraBarra = Math.min(pt(34), passo * 0.3);

    // Réguas horizontais: sem elas, comparar a altura de duas colunas
    // distantes vira adivinhação.
    [0, 0.5, 1].forEach(fr => {
      const y = areaY + areaA - areaA * fr;
      f.push(forma('regua', areaX, y, areaL, pt(0.7), { cor: C.linha }));
      f.push(texto('reguaRot', areaX - pt(2), y - pt(14), pt(80), pt(14),
        [{ t: d.fmtCurto(maior * fr), tam: 8.5, cor: C.fraca }]));
    });

    meses.forEach((m, i) => {
      const centro = areaX + passo * i + passo / 2;
      const hT = Math.max(pt(1), areaA * (m.total / maior));
      const hP = Math.max(m.pago > 0 ? pt(1) : 0, areaA * (m.pago / maior));
      f.push(forma('barraTotal', centro - larguraBarra - pt(2), areaY + areaA - hT,
        larguraBarra, hT, { cor: C.marcaClara }));
      if (hP > 0) {
        f.push(forma('barraPago', centro + pt(2), areaY + areaA - hP,
          larguraBarra, hP, { cor: C.pago }));
      }
      f.push(texto('mes', centro - passo / 2, areaY + areaA + pt(8), passo, pt(16),
        [{ t: m.rotulo, tam: 9.5, cor: C.fraca, alinhar: 'ctr' }]));
      f.push(texto('valMes', centro - passo / 2, areaY + areaA + pt(24), passo, pt(16),
        [{ t: d.fmtCurto(m.total), tam: 9, negrito: true, cor: C.tinta, alinhar: 'ctr' }]));
    });

    // Legenda: cor NUNCA é o único sinal.
    const ly = A - pt(86);
    [[C.marcaClara, d.t.faturado], [C.pago, d.t.recebido]].forEach(([cor, rot], i) => {
      const x = M + i * pt(150);
      f.push(forma('legCor', x, ly + pt(3), pt(11), pt(11), { cor }));
      f.push(texto('legRot', x + pt(18), ly, pt(140), pt(16),
        [{ t: rot, tam: 10, cor: C.fraca }]));
    });
    return f;
  }

  /* ── SLIDE 4 · composição da carteira ───────────────────────────────── */
  function slideComposicao(d) {
    const f = cabecalho(d.t.composicao, d.t.composicaoSub);
    const itens = (d.composicao || []).filter(i => i.valor > 0);
    const soma = itens.reduce((s, i) => s + i.valor, 0) || 1;
    const raio = pt(112);
    const cx = M + pt(150), cy = pt(178) + raio;

    let ang = 0;
    itens.forEach(i => {
      const fatiaAng = (i.valor / soma) * 360;
      /* Uma fatia de 360° vira um `pie` degenerado — o Office desenha nada.
         Carteira inteira num estado só é caso comum (tudo pago, tudo em
         aberto), então ela vira um disco. */
      if (fatiaAng >= 359.9) {
        f.push(forma('discoUnico', cx - raio, cy - raio, raio * 2, raio * 2,
          { geo: 'ellipse', cor: i.cor }));
      } else {
        f.push(fatia(cx, cy, raio, ang, ang + fatiaAng, i.cor));
      }
      ang += fatiaAng;
    });
    f.push(forma('miolo', cx - raio * 0.56, cy - raio * 0.56, raio * 1.12, raio * 1.12,
      { geo: 'ellipse', cor: C.branco }));
    f.push(texto('total', cx - raio * 0.52, cy - pt(22), raio * 1.04, pt(46), [
      { t: d.totalCarteira, tam: 15, negrito: true, cor: C.tinta, alinhar: 'ctr' },
      { t: d.t.total, tam: 9, cor: C.fraca, alinhar: 'ctr', antes: 2 },
    ]));

    const lx = M + pt(330), ly = pt(178);
    itens.forEach((i, k) => {
      const y = ly + k * pt(46);
      f.push(forma('legCor', lx, y + pt(4), pt(12), pt(12), { cor: i.cor }));
      f.push(texto('legNome', lx + pt(22), y, pt(230), pt(18),
        [{ t: i.rot, tam: 12, negrito: true, cor: C.tinta }]));
      f.push(texto('legN', lx + pt(22), y + pt(18), pt(230), pt(16),
        [{ t: i.detalhe || '', tam: 9.5, cor: C.fraca }]));
      f.push(texto('legVal', lx + pt(258), y, pt(150), pt(20),
        [{ t: d.fmt(i.valor), tam: 12, negrito: true, cor: C.tinta, alinhar: 'r' }]));
      f.push(texto('legPct', lx + pt(414), y, pt(70), pt(20),
        [{ t: (i.valor / soma * 100).toFixed(1).replace('.', ',') + '%',
           tam: 11, cor: C.fraca, alinhar: 'r' }]));
    });
    return f;
  }

  /* ── SLIDE 5 · inadimplência ────────────────────────────────────────── */
  function slideAtraso(d) {
    const f = cabecalho(d.t.atraso, d.t.atrasoSub);
    const faixas = d.aging || [];
    const maior = Math.max(1, ...faixas.map(x => x.valor));
    const y0 = pt(146), alt = pt(30), gap = pt(16);
    const rotL = pt(120), barraL = LU * 0.42;

    faixas.forEach((x, i) => {
      const y = y0 + i * (alt + gap);
      f.push(texto('faixaRot', M, y + pt(6), rotL, pt(20),
        [{ t: x.rot, tam: 11, cor: C.tinta }]));
      f.push(forma('trilho', M + rotL, y, barraL, alt, { cor: C.fundo }));
      f.push(forma('barra', M + rotL, y, Math.max(pt(2), barraL * (x.valor / maior)), alt,
        { cor: x.cor || C.atraso }));
      f.push(texto('faixaVal', M + rotL + barraL + pt(14), y + pt(6), pt(150), pt(20),
        [{ t: d.fmt(x.valor), tam: 11, negrito: true, cor: C.tinta }]));
      f.push(texto('faixaN', M + rotL + barraL + pt(174), y + pt(6), pt(120), pt(20),
        [{ t: x.detalhe || '', tam: 10, cor: C.fraca }]));
    });

    if (d.piorAtraso) {
      const cy = pt(146) + faixas.length * (alt + gap) + pt(10);
      f.push(forma('destaque', M, cy, LU, pt(62), { cor: 'FDECEA' }));
      f.push(forma('destaqueFilete', M, cy, pt(3.5), pt(62), { cor: C.atraso }));
      f.push(texto('destaqueTxt', M + pt(18), cy + pt(14), LU - pt(36), pt(40), [
        { t: d.t.piorAtraso, tam: 9.5, negrito: true, cor: C.atraso, espaco: 1 },
        { t: d.piorAtraso, tam: 12.5, cor: C.tinta, antes: 4 },
      ]));
    }
    return f;
  }

  /* ── SLIDE 6 · maiores clientes ─────────────────────────────────────── */
  function slideClientes(d) {
    const f = cabecalho(d.t.clientes, d.t.clientesSub);
    const lista = (d.maiores || []).slice(0, 8);
    const maior = Math.max(1, ...lista.map(x => x.valor));
    const y0 = pt(132), alt = pt(22), gap = pt(11);
    const nomeL = LU * 0.28, barraL = LU * 0.40;

    lista.forEach((x, i) => {
      const y = y0 + i * (alt + gap);
      f.push(texto('cliNome', M, y + pt(3), nomeL, pt(18),
        [{ t: x.nome, tam: 11, cor: C.tinta }]));
      f.push(forma('cliTrilho', M + nomeL, y, barraL, alt, { cor: C.fundo }));
      f.push(forma('cliBarra', M + nomeL, y, Math.max(pt(2), barraL * (x.valor / maior)), alt,
        { cor: x.cor || C.marca }));
      f.push(texto('cliVal', M + nomeL + barraL + pt(14), y + pt(3), pt(140), pt(18),
        [{ t: d.fmt(x.valor), tam: 11, negrito: true, cor: C.tinta }]));
      f.push(texto('cliPct', M + nomeL + barraL + pt(164), y + pt(3), pt(90), pt(18),
        [{ t: x.pct, tam: 10, cor: C.fraca }]));
    });

    if (d.concentracao) {
      const cy = A - pt(118);
      f.push(forma('conc', M, cy, LU, pt(58), { cor: C.fundo }));
      f.push(forma('concFilete', M, cy, pt(3.5), pt(58), { cor: C.marca }));
      f.push(texto('concTxt', M + pt(18), cy + pt(12), LU - pt(36), pt(40), [
        { t: d.t.concentracao, tam: 9.5, negrito: true, cor: C.fraca, espaco: 1 },
        { t: d.concentracao, tam: 12.5, cor: C.tinta, antes: 4 },
      ]));
    }
    return f;
  }

  /* ── SLIDE 7 · próximos vencimentos ─────────────────────────────────── */
  function slideVencimentos(d) {
    const f = cabecalho(d.t.vencimentos, d.t.vencimentosSub);
    const linhas = (d.vencimentos || []).slice(0, 9);
    const y0 = pt(132), alt = pt(30);
    const cols = [pt(96), LU * 0.40, LU * 0.20];

    f.push(forma('cabTabela', M, y0 - pt(24), LU, pt(20), { cor: C.fundo }));
    [d.t.colData, d.t.colCliente, d.t.colSituacao].forEach((c, i) => {
      const x = M + pt(10) + (i === 0 ? 0 : i === 1 ? cols[0] : cols[0] + cols[1]);
      f.push(texto('cabCol', x, y0 - pt(19), cols[i] || pt(160), pt(16),
        [{ t: c, tam: 9, negrito: true, cor: C.fraca, espaco: 1 }]));
    });
    f.push(texto('cabValor', M + LU - pt(150), y0 - pt(19), pt(140), pt(16),
      [{ t: d.t.colValor, tam: 9, negrito: true, cor: C.fraca, espaco: 1, alinhar: 'r' }]));

    if (!linhas.length) {
      f.push(texto('vazio', M, y0 + pt(24), LU, pt(30),
        [{ t: d.t.semVencimentos, tam: 12, cor: C.fraca, alinhar: 'ctr' }]));
      return f;
    }

    linhas.forEach((v, i) => {
      const y = y0 + i * alt;
      if (i) f.push(forma('fio', M, y, LU, pt(0.6), { cor: C.linha }));
      f.push(texto('vData', M + pt(10), y + pt(8), cols[0], pt(18),
        [{ t: v.quando, tam: 11, cor: C.fraca }]));
      f.push(texto('vNome', M + pt(10) + cols[0], y + pt(8), cols[1], pt(18),
        [{ t: v.nome, tam: 11.5, cor: C.tinta }]));
      f.push(texto('vSit', M + pt(10) + cols[0] + cols[1], y + pt(8), cols[2], pt(18),
        [{ t: v.situacao, tam: 10.5, cor: v.cor || C.fraca }]));
      f.push(texto('vVal', M + LU - pt(150), y + pt(8), pt(140), pt(18),
        [{ t: d.fmt(v.valor), tam: 11.5, negrito: true, cor: C.tinta, alinhar: 'r' }]));
    });
    return f;
  }

  /* ── SLIDE 8 · base de clientes ─────────────────────────────────────── */
  function slideBase(d) {
    const f = cabecalho(d.t.base, d.t.baseSub);
    const novos = d.novos || [];
    const maior = Math.max(1, ...novos.map(m => m.n));
    const areaY = pt(150), areaA = pt(160);
    const passo = (LU * 0.58) / Math.max(1, novos.length);
    const larg = Math.min(pt(30), passo * 0.5);

    novos.forEach((m, i) => {
      const centro = M + passo * i + passo / 2;
      const h = Math.max(m.n > 0 ? pt(2) : 0, areaA * (m.n / maior));
      if (h > 0) {
        f.push(forma('novoBarra', centro - larg / 2, areaY + areaA - h, larg, h,
          { cor: C.marca }));
      }
      f.push(texto('novoN', centro - passo / 2, areaY + areaA - h - pt(17), passo, pt(15),
        [{ t: String(m.n), tam: 9.5, negrito: true, cor: C.tinta, alinhar: 'ctr' }]));
      f.push(texto('novoMes', centro - passo / 2, areaY + areaA + pt(8), passo, pt(15),
        [{ t: m.rotulo, tam: 9, cor: C.fraca, alinhar: 'ctr' }]));
    });

    const x = M + LU * 0.64;
    (d.kpisBase || []).forEach((k, i) => {
      cartao(x, pt(140) + i * pt(96), LU * 0.36, pt(84), k).forEach(p => f.push(p));
    });
    return f;
  }

  /* ── SLIDE 9 · leitura do período ───────────────────────────────────── */
  function slideLeitura(d) {
    const f = cabecalho(d.t.leitura, d.t.leituraSub);
    (d.leitura || []).slice(0, 5).forEach((l, i) => {
      const y = pt(136) + i * pt(64);
      f.push(forma('marcador', M, y + pt(4), pt(4), pt(46), { cor: l.cor || C.marca }));
      f.push(texto('leituraTxt', M + pt(20), y, LU - pt(30), pt(60), [
        { t: l.titulo, tam: 13.5, negrito: true, cor: C.tinta },
        { t: l.texto, tam: 11.5, cor: C.fraca, antes: 4 },
      ]));
    });
    if (d.aviso) {
      /* Sobe o suficiente para não encostar na última leitura: com cinco
         frases o bloco vai até 456 pt, e o aviso a 74 do pé caía em cima. */
      f.push(texto('aviso', M, A - pt(58), LU, pt(24),
        [{ t: d.aviso, tam: 9, italico: true, cor: C.fraca }]));
    }
    return f;
  }

  /* ── Montagem ──────────────────────────────────────────────────────── */
  function gerar(d) {
    _id = 1;
    const montadores = [slideCapa, slideResumo, slideEvolucao, slideComposicao,
      slideAtraso, slideClientes, slideVencimentos, slideBase, slideLeitura];
    const total = montadores.length;
    const slides = montadores.map((montar, i) => {
      const formas = montar(d);
      // A capa não leva rodapé: ela já diz a data e a referência.
      if (i > 0) rodape(d, i + 1, total).forEach(p => formas.push(p));
      return formas;
    });
    return pacote(slides, d.titulo || 'Relatório');
  }

  function paraUint8(d) {
    const bytes = gerar(d);
    const saida = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) saida[i] = bytes[i];
    return saida;
  }

  return { gerar, paraUint8, zip, crc32, utf8, xml, forma, texto, fatia, pacote, C };
});
