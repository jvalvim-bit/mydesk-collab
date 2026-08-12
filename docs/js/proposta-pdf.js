'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A CARTA DE PROPOSTA, EM PDF DE VERDADE
   ═══════════════════════════════════════════════════════════════════════
   Antes isto era `window.print()`. Abria a caixa de impressão do navegador e
   dependia de a pessoa escolher "Salvar como PDF" — o que não é baixar um
   PDF, e não serve de jeito nenhum para ANEXAR num e-mail. Uma proposta de
   trabalho é um documento que sai da empresa e chega no candidato: ele tem
   de existir como arquivo.

   POR QUE ESCRITO À MÃO, e não com uma biblioteca: as que fazem isso pesam
   de 300 kB a 1 MB e seriam baixadas por todo mundo que abre o MyDesk, para
   um botão que poucos clicam. Um PDF de uma página com texto é um formato
   simples: objetos numerados, um fluxo de conteúdo e uma tabela de posições.
   As fontes são as 14 padrão do formato (Helvetica), que todo leitor de PDF
   já tem — nada é embutido.

   O MESMO ARQUIVO roda no navegador e no servidor (api/form.js). É de
   propósito: o PDF que a pessoa baixa e o que o candidato recebe por e-mail
   PRECISAM ser o mesmo documento, e duas implementações separadas divergem
   no primeiro ajuste que alguém fizer de um lado só.
   ═══════════════════════════════════════════════════════════════════════ */
(function (raiz, definir) {
  const api = definir();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.MD_PROPOSTA_PDF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ── Larguras das letras ────────────────────────────────────────────────
     Em milésimos do tamanho da fonte, como manda o formato. Sem elas não há
     como quebrar linha nem centralizar: o texto sairia estourando a margem
     ou com espaços tortos, que é exatamente a cara de documento amador.
     Só o ASCII imprimível; letra acentuada usa a largura da letra base, o
     que é verdade em Helvetica. */
  const L_NORMAL = ('278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 ' +
    '556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 ' +
    '667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 ' +
    '278 278 278 469 556 333 ' +
    '556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 ' +
    '334 260 334 584').split(' ').map(Number);
  const L_NEGRITO = ('278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 ' +
    '556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 ' +
    '722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 ' +
    '333 278 333 584 556 333 ' +
    '556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 ' +
    '389 280 389 584').split(' ').map(Number);

  /* Acento fora do ASCII: mede pela letra sem acento. */
  const SEM_ACENTO = {
    'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a', 'é': 'e', 'ê': 'e', 'è': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ó': 'o', 'õ': 'o', 'ô': 'o', 'ò': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n',
    'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'É': 'E', 'Ê': 'E', 'Í': 'I',
    'Ó': 'O', 'Õ': 'O', 'Ô': 'O', 'Ú': 'U', 'Ü': 'U', 'Ç': 'C', 'Ñ': 'N',
  };

  /* Quatro fontes. `negrito` é o seletor: false e true são as duas Helvéticas
     (fora de uso no documento, mas o módulo é de uso geral), 'serif' e
     'serif-negrito' são as Times. A escolha é uma função, e não um mapa: as
     tabelas do Times são declaradas mais abaixo, e um objeto montado aqui
     encostaria nelas antes da hora. */
  function tabelaDe(negrito) {
    if (negrito === 'serif') return L_TIMES;
    if (negrito === 'serif-negrito') return L_TIMES_NEGRITO;
    return negrito ? L_NEGRITO : L_NORMAL;
  }
  function largura(texto, tamanho, negrito) {
    const tab = tabelaDe(negrito);
    let soma = 0;
    for (const ch of String(texto)) {
      const base = SEM_ACENTO[ch] || ch;
      const cod = base.charCodeAt(0);
      soma += (cod >= 32 && cod <= 126) ? tab[cod - 32] : 556;
    }
    return soma * tamanho / 1000;
  }

  /* Quebra em linhas que cabem na largura pedida. Palavra que sozinha não
     cabe é cortada — melhor um corte do que uma linha invadindo a margem. */
  function quebrar(texto, tamanho, negrito, maxima) {
    const linhas = [];
    String(texto).split(/\r?\n/).forEach(paragrafo => {
      const palavras = paragrafo.split(/\s+/).filter(Boolean);
      if (!palavras.length) { linhas.push(''); return; }
      let atual = '';
      palavras.forEach(palavra => {
        const tentativa = atual ? atual + ' ' + palavra : palavra;
        if (largura(tentativa, tamanho, negrito) <= maxima) { atual = tentativa; return; }
        if (atual) linhas.push(atual);
        if (largura(palavra, tamanho, negrito) <= maxima) { atual = palavra; return; }
        let pedaco = '';
        for (const ch of palavra) {
          if (largura(pedaco + ch, tamanho, negrito) > maxima) { linhas.push(pedaco); pedaco = ch; }
          else pedaco += ch;
        }
        atual = pedaco;
      });
      if (atual) linhas.push(atual);
    });
    return linhas;
  }

  /* WinAnsi é praticamente Latin-1: cada caractere vira UM byte. O que não
     couber (emoji, símbolo de outro alfabeto) vira '?' em vez de quebrar o
     arquivo — PDF ilegível seria pior do que uma letra trocada. */
  function bytesTexto(texto) {
    const saida = [];
    for (const ch of String(texto)) {
      let cod = ch.charCodeAt(0);
      if (cod > 255) { const b = SEM_ACENTO[ch]; cod = b ? b.charCodeAt(0) : 63; }
      if (cod === 40 || cod === 41 || cod === 92) saida.push(92);   // ( ) \ escapados
      saida.push(cod);
    }
    return saida;
  }

  /* ── Larguras do Times ──────────────────────────────────────────────────
     O DOCUMENTO INTEIRO É SERIFADO. O modelo escreve o título e a linha da
     vaga em Cambria; o corpo saía em Helvetica, e a folha ficava com duas
     famílias brigando — cabeçalho de carta e corpo de formulário. A ABNT
     aceita Times ou Arial, e Times é a serifada das 14 padrão do PDF: a única
     que se usa sem embutir arquivo de fonte no arquivo. */
  const L_TIMES = ('250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 ' +
    '500 500 500 500 500 500 500 500 500 500 278 278 564 564 564 444 921 ' +
    '722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 ' +
    '333 278 333 469 500 333 ' +
    '444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 ' +
    '480 200 480 541').split(' ').map(Number);
  const L_TIMES_NEGRITO = ('250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278 ' +
    '500 500 500 500 500 500 500 500 500 500 333 333 570 570 570 500 930 ' +
    '722 667 722 722 667 611 778 778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 ' +
    '333 278 333 581 500 333 ' +
    '500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556 556 444 389 333 556 500 722 500 500 444 ' +
    '394 220 394 520').split(' ').map(Number);

  const A4 = { largura: 595.28, altura: 841.89 };
  /* ── AS MEDIDAS SAEM DO MODELO ──────────────────────────────────────────
     Não são escolha de gosto: foram lidas do .docx que ela desenhou e da
     página que o Word renderiza a partir dele, em pontos contados do TOPO
     (que é como o Word conta). O PDF conta do rodapé — daí o `deTopo`. */
  const CM = 28.3465;             // 1 cm em pontos
  const M = {
    barraTopo:   51.5,          // faixa azul do cabeçalho
    barraPe:     22.5,          // faixa azul do rodapé
    logoTopo:    89,            // a marca, e não a caixa branca em volta dela
    logoLarg:    176.2,
    tituloBase:  209,
    vagaBase:    263,
    /* ── O TEXTO SEGUE A ABNT (NBR 14724) ────────────────────────────────
       Margens 3 cm à esquerda e 2 cm à direita, entrelinha 1,5, corpo em 12,
       recuo de 1,25 cm na primeira linha de cada parágrafo e texto
       justificado. O modelo trazia o corpo colado nas bordas — 11,75 pt de
       margem, quase 110 caracteres por linha —, e uma linha desse tamanho
       cansa de ler: o olho perde o começo da seguinte. Com 3 cm de margem a
       medida cai para 75 caracteres, que é a faixa em que se lê sem esforço.
       O timbre (faixas, marca, galão, título) continua sendo o dela. */
    margemEsq:   3 * CM,        // 85.04
    margemDir:   2 * CM,        // 56.69
    recuoPar:    1.25 * CM,     // 35.43 — primeira linha do parágrafo
    margemPe:    2 * CM,        // limite inferior do texto
    corpoTam:    12,
    corpoSalto:  18,            // 1,5 de entrelinha em 12 pt
    /* A ABNT não pede espaço entre parágrafos — o recuo já os separa. Mas
       com margem de 3 cm e entrelinha 1,5 num texto curto, tudo colado vira
       um bloco só: foi a primeira coisa que ela viu. Meia linha entre eles
       resolve sem brigar com a norma. */
    paraFolga:   10,
    /* DUAS FOLHAS NÃO SÃO PROBLEMA — ela disse isso quando perguntei, e
       muda o desenho inteiro. Tudo o que estava espremido para caber numa
       folha só volta ao tamanho certo: o cabeçalho é o do modelo, o corpo
       respira entre parágrafos e o pé tem a folga que o modelo pede.
       Comprimir para caber é a decisão que estraga documento. */
    corpoBase:   330,           // "Prezada(o) …"
    assLarg:     180.1,         // linha da assinatura
    assFolga:    43.2,          // da linha até o rótulo debaixo dela
    assSalto:    16.3,
  };
  const ESQ  = M.margemEsq;
  const DIR  = A4.largura - M.margemDir;
  const UTIL = DIR - ESQ;
  const MARGEM = ESQ;
  const PISO = M.margemPe;         // abaixo disto, vira página nova

  const deTopo = y => A4.altura - y;

  /* O timbre entra NA CRIAÇÃO da folha, e não no fim do desenho: o PDF pinta
     na ordem em que os comandos aparecem, e o galão desenhado depois cobria a
     assinatura da segunda folha — texto preto sumindo atrás de um fundo claro,
     sem erro nenhum em lugar nenhum. */
  function novaPagina() {
    const p = { ops: [], y: deTopo(M.barraTopo + 40) };
    timbre(p);
    return p;
  }

  /* ── QUEBRA DE PÁGINA ────────────────────────────────────────────────────
     Uma descrição de vaga bem escrita passa fácil de meia página, e a versão
     anterior desenhava por cima da margem: o texto sumia por baixo da linha
     de assinatura e a proposta chegava incompleta ao candidato, sem nada
     avisando. Cortar o texto seria pior ainda — é o que a pessoa vai fazer no
     trabalho. O documento passa a ter quantas páginas precisar. */
  function doc() {
    const p = novaPagina();
    return { paginas: [p], atual: p };
  }
  /* `piso` é opcional porque o pé da carta não é texto corrido: a margem de
     2 cm da ABNT vale para o BLOCO DE TEXTO, e exigi-la também abaixo da linha
     de assinatura empurrava a assinatura para uma folha nova com meia página
     em branco em cima. Abaixo dela basta não encostar na faixa azul. */
  function espaco(d, altura, piso) {
    if (d.atual.y - altura >= (piso === undefined ? PISO : piso)) return d.atual;
    const nova = novaPagina();
    d.paginas.push(nova);
    d.atual = nova;
    return nova;
  }

  function _num(v) { return (Math.round(v * 100) / 100).toString(); }

  /* ── As primitivas de desenho ─────────────────────────────────────────── */
  /* `negrito` aceita três valores porque são três fontes: false (Helvetica),
     true (Helvetica-Bold) e 'serif' (Times, do título e da linha da vaga).
     `espacoExtra` é o que justifica o texto: o PDF distribui a sobra da linha
     nos espaços, via Tw, em vez de esticar as letras. */
  function texto(p, str, x, y, tamanho, negrito, cor, espacoExtra) {
    if (!String(str).length) return;
    const c = cor || [0.13, 0.13, 0.15];
    const fonte = negrito === 'serif' ? 'F3'
      : negrito === 'serif-negrito' ? 'F4'
      : negrito ? 'F2' : 'F1';
    p.ops.push('BT', _num(c[0]) + ' ' + _num(c[1]) + ' ' + _num(c[2]) + ' rg',
      '/' + fonte + ' ' + _num(tamanho) + ' Tf');
    if (espacoExtra) p.ops.push(_num(espacoExtra) + ' Tw');
    p.ops.push('1 0 0 1 ' + _num(x) + ' ' + _num(y) + ' Tm', { texto: str }, 'Tj');
    if (espacoExtra) p.ops.push('0 Tw');
    p.ops.push('ET');
  }

  function textoCentrado(p, str, centro, y, tamanho, negrito, cor) {
    texto(p, str, centro - largura(str, tamanho, negrito) / 2, y, tamanho, negrito, cor);
  }
  function retangulo(p, x, y, larg, alt, cor) {
    p.ops.push(_num(cor[0]) + ' ' + _num(cor[1]) + ' ' + _num(cor[2]) + ' rg',
      _num(x) + ' ' + _num(y) + ' ' + _num(larg) + ' ' + _num(alt) + ' re', 'f');
  }
  function linhaH(p, x1, x2, y, cor, espessura) {
    p.ops.push(_num(cor[0]) + ' ' + _num(cor[1]) + ' ' + _num(cor[2]) + ' RG',
      _num(espessura || 0.7) + ' w',
      _num(x1) + ' ' + _num(y) + ' m ' + _num(x2) + ' ' + _num(y) + ' l', 'S');
  }

  const TINTA   = [0.0, 0.0, 0.0];          // o modelo escreve em preto
  const CINZA   = [0.35, 0.38, 0.43];
  const FIO     = [0.78, 0.81, 0.88];       // separador dentro do quadro
  const AZUL    = [0.145, 0.557, 0.976];    // #258EF9 — as duas faixas
  const MARCA   = [0.931, 0.943, 1.0];      // #506FFF a 10%, como no modelo

  /* Escreve linha a linha, pedindo espaço antes de cada uma: assim um
     parágrafo longo continua na página seguinte em vez de sumir por baixo da
     margem.

     JUSTIFICADO, como no modelo: toda linha menos a última do parágrafo tem a
     sobra distribuída nos espaços. Alinhado só à esquerda, o bloco de texto
     fica com a borda direita serrilhada e a página perde o ar de documento —
     que é justamente o que ela reclamou da versão anterior. */
  function paragrafo(d, str, tamanho, negrito, cor, entrelinha, recuo) {
    const salto = entrelinha || tamanho * 1.55;
    const dente = recuo || 0;
    /* A primeira linha é medida com a largura JÁ descontada do recuo, senão
       ela avança sob a margem direita — o recuo empurra o começo, não estica
       o fim. */
    const linhas = [];
    let resto = String(str);
    for (let n = 0; resto !== null; n++) {
      const disponivel = UTIL - (n === 0 ? dente : 0);
      const parte = quebrar(resto, tamanho, negrito, disponivel);
      linhas.push(parte[0]);
      resto = parte.length > 1 ? parte.slice(1).join(' ') : null;
      if (n > 400) break;                 // trava contra medida degenerada
    }
    linhas.forEach((l, i) => {
      const p = espaco(d, salto);
      const x = MARGEM + (i === 0 ? dente : 0);
      const medida = UTIL - (i === 0 ? dente : 0);
      const ultima = i === linhas.length - 1;
      const espacos = (l.match(/ /g) || []).length;
      const sobra = medida - largura(l, tamanho, negrito);
      /* Sobra grande demais numa linha curta não se estica: ela é a última de
         verdade, ou uma quebra forçada, e esticá-la abriria buracos. */
      const extra = (!ultima && espacos && sobra > 0 && sobra / espacos < tamanho * 0.6)
        ? sobra / espacos : 0;
      texto(p, l, x, p.y, tamanho, negrito, cor, extra);
      p.y -= salto;
    });
  }

  function poligono(p, pontos, cor) {
    p.ops.push(_num(cor[0]) + ' ' + _num(cor[1]) + ' ' + _num(cor[2]) + ' rg');
    pontos.forEach((pt, i) => {
      p.ops.push(_num(pt[0]) + ' ' + _num(pt[1]) + (i ? ' l' : ' m'));
    });
    p.ops.push('h', 'f');
  }

  /* ── O TIMBRE DA PÁGINA ─────────────────────────────────────────────────
     Duas faixas azuis e o galão claro atrás do texto, exatamente onde o
     modelo os põe. Vai em TODA folha: uma proposta que vira a página e chega
     na segunda com papel branco parece outro documento, ou uma folha que se
     perdeu do conjunto. */
  const GALAO = [
    [314.4, 691.0], [128.7, 691.0], [0, 600.1], [0, 296.0], [209.0, 0],
    [314.4, 0], [314.4, 122.4], [75.1, 461.3], [314.4, 630.2], [314.4, 691.0],
  ];
  function timbre(p) {
    retangulo(p, 0, deTopo(M.barraTopo), A4.largura, M.barraTopo, AZUL);
    retangulo(p, 0, 0, A4.largura, M.barraPe, AZUL);
    poligono(p, GALAO.map(([x, y]) => [281.1 + x, deTopo(101.9 + y)]), MARCA);
  }

  /* A marca entra como imagem: o logo é um desenho com brilho, e redesenhá-lo
     em vetor daria outra coisa parecida — que num papel timbrado é pior do que
     não ter logo nenhum. Sem a imagem em mãos, o documento sai sem ela em vez
     de sair quebrado. */
  function marca(p, logo) {
    if (!logo || !logo.largura || !logo.altura) return;
    const larg = M.logoLarg;
    const alt  = larg * logo.altura / logo.largura;
    const x    = (A4.largura - larg) / 2;
    const y    = deTopo(M.logoTopo + alt);
    p.ops.push('q', [larg, 0, 0, alt, x, y].map(_num).join(' ') + ' cm', '/Im1 Do', 'Q');
  }

  /* ── O QUADRO DE CONDIÇÕES ────────────────────────────────────────────
     Era uma lista solta no meio do texto: rótulo cinza, valor em negrito, sem
     nada em volta. Some no corpo do documento — e é justamente a parte que se
     relê depois de guardar o arquivo, quando alguém quer conferir o salário
     ou a data de início sem ler a carta inteira.

     Agora é um quadro: fundo claríssimo (o mesmo tom do galão, para não
     introduzir cor nova numa folha que já tem duas), uma barra azul na borda
     esquerda que o ancora, o título em azul com fio embaixo e um fio finíssimo
     entre as linhas. Nada disso é enfeite — cada elemento existe para o olho
     achar a linha certa sem varrer de cima para baixo.

     O DESENHO ACONTECE EM DUAS PASSADAS. O fundo tem de ser pintado ANTES do
     texto (o PDF pinta na ordem dos comandos), e a altura do fundo só se sabe
     depois de medir as linhas — inclusive as do que a pessoa vai fazer, que
     quebram em várias. Então primeiro mede-se tudo e reparte-se por folha,
     depois desenha-se folha por folha. Sem isso, um quadro que atravessa a
     página apareceria com o fundo cortado no meio. */
  /* ACIMA e ABAIXO são a altura da letra em volta da linha de base: o PDF
     escreve sobre a base, e um quadro medido só por ela sai com o dobro de ar
     embaixo do que em cima — foi o que aconteceu na primeira versão. */
  const COND = {
    padTopo: 16, padBaixo: 15, padEsq: 18, padDir: 16,
    tituloAlt: 28, linhaAlt: 22, valorEsq: 150, borda: 3.5,
    acima: 8, abaixo: 3,
  };

  function medirCondicoes(itens, temTitulo) {
    const larguraValor = UTIL - COND.padEsq - COND.padDir - COND.valorEsq;
    const linhas = [];
    if (temTitulo) linhas.push({ titulo: true, alt: COND.tituloAlt });
    itens.forEach(([rot, val], i) => {
      const partes = quebrar(String(val), 12, 'serif-negrito', larguraValor);
      partes.forEach((txt, j) => {
        linhas.push({
          rotulo: j === 0 ? rot : '', valor: txt,
          fio: j === 0 && i > 0, alt: COND.linhaAlt,
        });
      });
    });
    return linhas;
  }

  function desenharCondicoes(d0, itens, titulo) {
    const linhas = medirCondicoes(itens, !!titulo);
    /* O quadro é medido pelas LINHAS DE BASE, e o fundo tem de sobrar o mesmo
       tanto em cima e embaixo do texto: daí o `acima` na borda superior e o
       `abaixo` na inferior, descontando o salto da última linha, que não tem
       nenhuma depois dela para ocupá-lo. */
    const piso = COND.acima + COND.abaixo + COND.padTopo + COND.padBaixo;
    let i = 0;
    while (i < linhas.length) {
      // Duas linhas no mínimo: um quadro que mal cabe pingaria uma por folha.
      const pg = espaco(d0, piso + COND.linhaAlt);
      const topo = pg.y + COND.acima + COND.padTopo;
      let corridas = 0, fim = i;
      while (fim < linhas.length) {
        const alt = corridas + linhas[fim].alt;
        const base = topo - (COND.acima + COND.padTopo + alt -
          linhas[fim].alt + COND.abaixo + COND.padBaixo);
        if (base < PISO) break;
        corridas = alt;
        fim++;
      }
      if (fim === i) { fim = i + 1; corridas = linhas[i].alt; }   // nunca travar
      const alto = COND.acima + COND.padTopo +
        (corridas - linhas[fim - 1].alt) + COND.abaixo + COND.padBaixo;

      retangulo(pg, ESQ, topo - alto, UTIL, alto, MARCA);
      retangulo(pg, ESQ, topo - alto, COND.borda, alto, AZUL);

      let y = pg.y;
      for (let k = i; k < fim; k++) {
        const l = linhas[k];
        if (l.titulo) {
          texto(pg, titulo, ESQ + COND.padEsq, y, 11, 'serif-negrito', AZUL);
          linhaH(pg, ESQ + COND.padEsq, DIR - COND.padDir, y - 8, AZUL, 0.7);
          y -= l.alt;
          continue;
        }
        if (l.fio) linhaH(pg, ESQ + COND.padEsq, DIR - COND.padDir, y + 12, FIO, 0.4);
        if (l.rotulo) texto(pg, l.rotulo, ESQ + COND.padEsq, y, 12, 'serif', CINZA);
        texto(pg, l.valor, ESQ + COND.padEsq + COND.valorEsq, y, 12, 'serif-negrito', TINTA);
        y -= l.alt;
      }
      pg.y = topo - alto;
      i = fim;
    }
  }

  /* ── O documento ──────────────────────────────────────────────────────
     O TIMBRE É O DELA; O TEXTO SEGUE A ABNT.

     A versão anterior desta função era invenção minha e ficou com cara de
     modelo de site de currículo. Ela refez o documento no Word — faixas
     azuis, marca centrada, título e linha da vaga em serifada, assinatura do
     candidato no pé — e isso continua igual, medida por medida.

     O que mudou é o BLOCO DE TEXTO, a pedido dela: margens de 3 cm e 2 cm,
     entrelinha 1,5, corpo em 12, recuo de 1,25 cm na primeira linha e texto
     justificado — ABNT NBR 14724. No modelo o corpo ia de borda a borda, com
     quase 110 caracteres por linha, e nada marcava onde um parágrafo acabava
     e o outro começava.

     As CONDIÇÕES o modelo não previa, porque não tinha como saber o tamanho —
     mas o texto dela promete "abaixo estão as condições que combinamos", e
     precisa haver algo abaixo. Elas são um quadro próprio (ver acima).
     ───────────────────────────────────────────────────────────────────── */
  function desenhar(d) {
    const doc0 = doc();
    const p = doc0.atual;

    marca(p, d.logo);

    /* Título e linha da vaga: serifada, como no modelo. */
    textoCentrado(p, d.titulo || 'Proposta de Contratação',
      A4.largura / 2, deTopo(M.tituloBase), 24, 'serif', TINTA);

    /* Recuo pendente na linha da vaga, como no modelo — mas ancorado na
       margem de 3 cm, e não fora dela: linha de texto que começa antes da
       margem do documento é o tipo de detalhe que denuncia improviso. */
    if (d.linhaVaga) {
      let yv = deTopo(M.vagaBase);
      let esq = ESQ;
      let resto = String(d.linhaVaga);
      const limite = DIR - 130;      // estreita, para não passar sob o galão
      while (resto) {
        const cabe = quebrar(resto, 19, 'serif', limite - esq);
        texto(p, cabe[0], esq, yv, 19, 'serif', TINTA);
        resto = cabe.length > 1 ? cabe.slice(1).join(' ') : '';
        esq = ESQ + M.recuoPar;
        yv -= 26.2;
        if (yv < deTopo(M.corpoBase - 22)) break;   // não invade a saudação
      }
    }

    /* A saudação NÃO leva recuo: é vocativo, e não parágrafo de texto. */
    doc0.atual.y = deTopo(M.corpoBase);
    texto(p, d.saudacao, ESQ, doc0.atual.y, M.corpoTam, 'serif', TINTA);
    doc0.atual.y -= M.corpoSalto + M.paraFolga;

    const escreverBloco = lista => {
      (lista || []).filter(Boolean).forEach(txt => {
        paragrafo(doc0, txt, M.corpoTam, 'serif', TINTA, M.corpoSalto, M.recuoPar);
        doc0.atual.y -= M.paraFolga;
      });
    };
    /* Quanto um bloco vai ocupar, sem escrevê-lo. Serve para decidir a quebra
       de página ANTES de começar, e não no meio. */
    const medirBloco = lista => (lista || []).filter(Boolean).reduce((soma, txt) => {
      const primeira = quebrar(txt, M.corpoTam, 'serif', UTIL - M.recuoPar)[0] || '';
      const resto = txt.slice(primeira.length).trim();
      const linhas = 1 + (resto ? quebrar(resto, M.corpoTam, 'serif', UTIL).length : 0);
      return soma + linhas * M.corpoSalto + M.paraFolga;
    }, 0);

    escreverBloco(d.paragrafos);

    const itens = (d.condicoes || []).filter(i => i && i[1]);
    if (itens.length) {
      doc0.atual.y -= 12;
      desenharCondicoes(doc0, itens, d.tituloCondicoes);
      doc0.atual.y -= 28;
    }

    /* ── O pé: linha, assinatura e data ──────────────────────────────────
       Vão juntos e centrados, como no modelo.

       E vão junto com o ÚLTIMO PARÁGRAFO. Sozinha numa folha nova, a
       assinatura vira uma página em branco com dois traços no meio — quem
       recebe olha e acha que o arquivo veio quebrado. Se o fim não couber
       aqui, o parágrafo de aceite desce junto e a folha seguinte tem texto
       antes da linha, que é como um documento se comporta. */
    const PISO_PE = M.barraPe + 12;      // não encostar na faixa azul
    const alturaPe = M.assFolga + M.assSalto + 34;
    if (doc0.atual.y - (medirBloco(d.paragrafosFinais) + alturaPe) < PISO_PE) {
      espaco(doc0, doc0.atual.y);        // força a folha nova agora
    }
    escreverBloco(d.paragrafosFinais);

    const pf = espaco(doc0, alturaPe, PISO_PE);
    /* Na FOLHA DO CABEÇALHO a linha fica onde o modelo a pôs, enquanto o texto
       deixar; se o texto passar dali, ela desce junto. Numa folha de
       continuação essa posição não quer dizer nada — o cabeçalho não está lá —
       e prendê-la ali abria um vão morto de meia página entre o último
       parágrafo e o traço. Ali ela vem logo depois do texto. */
    const yLinha = pf === doc0.paginas[0]
      ? Math.min(pf.y - 34, deTopo(599.1))
      : pf.y - 60;
    const meia = (A4.largura - M.assLarg) / 2;
    linhaH(pf, meia, meia + M.assLarg, yLinha, TINTA, 0.8);
    textoCentrado(pf, d.rotuloAssinatura, A4.largura / 2,
      yLinha - M.assFolga, 12, 'serif', TINTA);
    textoCentrado(pf, d.rotuloData, A4.largura / 2,
      yLinha - M.assFolga - M.assSalto, 12, 'serif', TINTA);

    /* Numeração da ABNT: canto superior direito, na fonte do texto, e só
       quando há mais de uma folha — "1" sozinho numa página só é ruído. */
    doc0.paginas.forEach((pg, i) => {
      if (doc0.paginas.length > 1) {
        const n = String(i + 1);
        texto(pg, n, DIR - largura(n, 10, 'serif'), deTopo(M.barraTopo + 22),
          10, 'serif', CINZA);
      }
    });
    return doc0.paginas;
  }

  /* ── O PNG DA MARCA, SEM DESCOMPACTAR NADA ────────────────────────────
     Um PNG guarda os pixels em deflate com os filtros de linha do próprio
     PNG. O PDF sabe ler exatamente isso: FlateDecode com /Predictor 15. Então
     os bytes do IDAT entram no arquivo COMO ESTÃO — nada de inflar, refiltrar
     ou depender de zlib, que no navegador e no servidor seriam dois caminhos
     diferentes para o mesmo desenho.

     Só imagem de paleta (cor 3) e RGB direto (cor 2), sem entrelaçamento. Com
     canal alfa (4 e 6) o PDF precisaria de uma máscara em objeto separado, e
     para isso os pixels teriam de ser lidos de fato — por isso a marca é
     achatada sobre branco antes de entrar no repositório. Formato que não dá
     para ler devolve null, e o documento sai sem a marca em vez de sair
     corrompido. */
  function lerPng(entrada) {
    if (!entrada) return null;
    const b = entrada;
    const u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const ASSINATURA = [137, 80, 78, 71, 13, 10, 26, 10];
    if (b.length < 33 || ASSINATURA.some((v, i) => b[i] !== v)) return null;

    let i = 8, paleta = null;
    const dados = [];
    let largura = 0, altura = 0, bits = 0, cor = 0;
    while (i + 8 <= b.length) {
      const tam = u32(i);
      const tipo = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      const corpo = i + 8;
      if (tipo === 'IHDR') {
        largura = u32(corpo); altura = u32(corpo + 4);
        bits = b[corpo + 8]; cor = b[corpo + 9];
        if (b[corpo + 12]) return null;                 // entrelaçado
        if (cor !== 2 && cor !== 3) return null;         // com alfa, não dá
      } else if (tipo === 'PLTE') {
        paleta = [];
        for (let k = 0; k < tam; k++) paleta.push(b[corpo + k]);
      } else if (tipo === 'IDAT') {
        for (let k = 0; k < tam; k++) dados.push(b[corpo + k]);
      } else if (tipo === 'IEND') break;
      i = corpo + tam + 4;
    }
    if (!largura || !altura || !dados.length) return null;
    if (cor === 3 && !paleta) return null;
    return { largura, altura, bits, cor, paleta, dados };
  }

  const HEX = '0123456789ABCDEF';
  const paraHex = arr => {
    let s = '';
    for (let i = 0; i < arr.length; i++) s += HEX[arr[i] >> 4] + HEX[arr[i] & 15];
    return s;
  };

  /* ── Serialização ─────────────────────────────────────────────────────── */
  function montar(paginas, logo) {
    const bytes = [];
    const escrever = s => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff); };

    const fluxoDe = pagina => {
      const fluxo = [];
      pagina.ops.forEach(op => {
        if (typeof op === 'object' && op !== null) {
          fluxo.push(40);                       // (
          bytesTexto(op.texto).forEach(b => fluxo.push(b));
          fluxo.push(41);                       // )
        } else {
          for (let i = 0; i < op.length; i++) fluxo.push(op.charCodeAt(i) & 0xff);
        }
        fluxo.push(10);
      });
      return fluxo;
    };

    /* Numeração: 1 catálogo, 2 índice de páginas, 3/4/5 as fontes, 6 a marca
       quando existe, e daí em diante um par (página, conteúdo) por folha. */
    const idImagem = logo ? 7 : 0;
    const primeiro = logo ? 8 : 7;
    const idPagina = i => primeiro + i * 2;
    const idFluxo  = i => primeiro + i * 2 + 1;
    const kids = paginas.map((_, i) => idPagina(i) + ' 0 R').join(' ');

    const objetos = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [' + kids + '] /Count ' + paginas.length + ' >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
    ];
    if (logo) {
      const espaco = logo.cor === 3
        ? '[/Indexed /DeviceRGB ' + (logo.paleta.length / 3 - 1) + ' <' + paraHex(logo.paleta) + '>]'
        : '/DeviceRGB';
      const cores = logo.cor === 3 ? 1 : 3;
      objetos.push({
        dic: '<< /Type /XObject /Subtype /Image /Width ' + logo.largura +
             ' /Height ' + logo.altura + ' /ColorSpace ' + espaco +
             ' /BitsPerComponent ' + logo.bits + ' /Filter /FlateDecode' +
             ' /DecodeParms << /Predictor 15 /Colors ' + cores +
             ' /BitsPerComponent ' + logo.bits + ' /Columns ' + logo.largura + ' >>',
        bytes: logo.dados,
      });
    }
    const recursos = '/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>' +
      (logo ? ' /XObject << /Im1 ' + idImagem + ' 0 R >>' : '') + ' >>';
    paginas.forEach((pagina, i) => {
      objetos.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + _num(A4.largura) + ' ' +
        _num(A4.altura) + '] ' + recursos + ' /Contents ' + idFluxo(i) + ' 0 R >>');
      objetos.push(fluxoDe(pagina));           // array = fluxo de conteúdo
    });

    escrever('%PDF-1.4\n');
    const posicoes = [];
    objetos.forEach((corpo, i) => {
      posicoes.push(bytes.length);
      escrever((i + 1) + ' 0 obj\n');
      if (Array.isArray(corpo)) {
        escrever('<< /Length ' + corpo.length + ' >>\nstream\n');
        corpo.forEach(b => bytes.push(b));
        escrever('\nendstream');
      } else if (corpo && corpo.dic) {
        escrever(corpo.dic + ' /Length ' + corpo.bytes.length + ' >>\nstream\n');
        for (let k = 0; k < corpo.bytes.length; k++) bytes.push(corpo.bytes[k]);
        escrever('\nendstream');
      } else {
        escrever(corpo);
      }
      escrever('\nendobj\n');
    });

    const inicioXref = bytes.length;
    escrever('xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n');
    posicoes.forEach(pos => {
      escrever(String(pos).padStart(10, '0') + ' 00000 n \n');
    });
    escrever('trailer\n<< /Size ' + (objetos.length + 1) + ' /Root 1 0 R >>\nstartxref\n' +
             inicioXref + '\n%%EOF\n');

    return bytes;
  }

  /* `dados` já vem pronto para o papel: quem chama decide os textos, porque
     eles são traduzidos e este arquivo não conhece o catálogo de idiomas.
     `dados.logo` são os BYTES do PNG da marca — o navegador busca o arquivo,
     o servidor lê do disco, e os dois entregam a mesma coisa aqui. */
  function gerar(dados) {
    const d = Object.assign({}, dados || {});
    d.logo = lerPng(d.logo);
    return montar(desenhar(d), d.logo);
  }

  function paraUint8(dados) {
    const bytes = gerar(dados);
    const saida = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) saida[i] = bytes[i];
    return saida;
  }

  function paraBase64(dados) {
    const bytes = gerar(dados);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let bruto = '';
    for (let i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);
    return btoa(bruto);
  }

  return { gerar, paraUint8, paraBase64, largura, quebrar, lerPng };
});
