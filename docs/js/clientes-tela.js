'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MODELO CLIENTES — a tela
   ═══════════════════════════════════════════════════════════════════════
   `clientes.js` responde às perguntas (quem está ativo, quando é o próximo
   contato, o que já se conversou). Este arquivo só desenha as respostas.

   Duas telas, nunca as duas juntas:

     LISTA     a carteira inteira, com indicadores, resumo do período e a fila
               de próximas ações.
     DETALHE   um cliente só, ocupando a área inteira abaixo da barra.

   O detalhe SUBSTITUI a lista — não é modal, gaveta, painel lateral nem
   expansão da linha. A razão não é estética: a página do cliente tem abas,
   linha do tempo e documentos, e tudo isso dentro de uma sobreposição faria a
   pessoa navegar por cima de uma tela que continua ali, com dois níveis de
   rolagem e dois lugares para apertar Esc.

   SOBRE innerHTML: a moldura (ícones, títulos fixos) é montada com innerHTML
   porque não tem dado de ninguém dentro. Tudo o que vem do banco entra por
   `textContent` — nome de cliente, tag, descrição e observação são texto que
   a pessoa digitou, e texto digitado nunca vira marcação.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  const t = (chave, padrao, vars) => {
    if (typeof _appText === 'function') return _appText(chave, padrao, vars);
    return String(padrao).replace(/\{(\w+)\}/g,
      (achado, k) => (vars && vars[k] !== undefined ? String(vars[k]) : achado));
  };

  const M = () => global.MD_CLI;

  /* O ESTADO DA TELA. Fica neste arquivo porque e daqui que ele e mexido:
     declarado no outro IIFE, cada leitura seria um ReferenceError na primeira
     vez que a linha rodasse — e o modelo abriria em branco. */
  let _tela = 'lista';      // 'lista' | 'detalhe'
  let _aberto = null;       // id do cliente na tela detalhada
  let _ligado = false;      // ouvintes de rota e teclado pendurados?
  let _abrindo = false;     // trava contra clique repetido durante a troca

  /* ── Montagem de elemento ────────────────────────────────────────────
     `texto` sempre por textContent. `html` existe só para a moldura, e quem
     escrever dado de gente ali está errado por construção. */
  function el(tag, opcoes, filhos) {
    const o = opcoes || {};
    const n = document.createElement(tag);
    if (o.cls) n.className = o.cls;
    if (o.id) n.id = o.id;
    if (o.texto !== undefined && o.texto !== null) n.textContent = String(o.texto);
    if (o.html) n.innerHTML = o.html;
    if (o.attrs) Object.keys(o.attrs).forEach(k => {
      const v = o.attrs[k];
      if (v === false || v === null || v === undefined) return;
      n.setAttribute(k, String(v));
    });
    if (o.onClick) n.addEventListener('click', o.onClick);
    if (o.style) n.setAttribute('style', o.style);
    (filhos || []).forEach(f => { if (f) n.appendChild(f); });
    return n;
  }

  const ICO = {
    users:    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
    pulse:    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    filter:   '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    plus:     '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    back:     '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    dots:     '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    star:     '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    mail:     '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>',
    phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    pin:      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    note:     '<path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v5h5"/>',
    check:    '<polyline points="20 6 9 17 4 12"/>',
    chat:     '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
    file:     '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
    flag:     '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    form:     '<path d="M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="4" rx="1"/>',
    smile:    '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    user:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    trocar:   '<path d="M4 7h11"/><path d="M4 17h11"/><polyline points="17 4 20 7 17 10"/><polyline points="17 14 20 17 17 20"/>',
    colunas:  '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9.5" y1="4" x2="9.5" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>',
    baixar:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    ajustes:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    checkc:   '<circle cx="12" cy="12" r="9.2"/><polyline points="8.3 12.2 11 14.9 15.9 9.6"/>',
  };

  const svg = (chave, tam) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
    + (tam ? ' style="width:' + tam + 'px;height:' + tam + 'px"' : '') + '>'
    + (ICO[chave] || '') + '</svg>';

  const iniciais = nome => String(nome || '?').trim().split(/\s+/).slice(0, 2)
    .map(p => p[0] || '').join('').toUpperCase() || '?';

  /* Cor estável por cliente: a mesma inicial não pode mudar de cor a cada
     repintura, senão a lista pisca e o avatar deixa de servir para reconhecer
     alguém de relance. */
  const PALETA = ['#6366f1', '#10b981', '#f59e0b', '#22d3ee', '#ec4899', '#8b5cf6', '#14b8a6'];
  function corDe(id) {
    const s = String(id || '');
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return PALETA[n % PALETA.length];
  }

  /* ═════════════════════════════════════════════════════════════════════
     A CASCA
     ═════════════════════════════════════════════════════════════════════ */

  function raiz() {
    let v = document.getElementById('cli-view');
    if (v) return v;
    v = el('div', { id: 'cli-view' });
    const crm = document.getElementById('crm-view');
    if (crm) crm.appendChild(v); else document.body.appendChild(v);
    return v;
  }

  /* Id que veio da URL e ainda não pôde ser resolvido, porque a carteira não
     chegou. Ver `entrar`. */
  let _pendente = '';

  function entrar() {
    ligarRota();
    /* Entrar pela URL de um cliente tem de abrir aquele cliente, e não a
       lista — senão o link que alguém guardou deixa de valer.

       MAS A CARTEIRA PODE NÃO TER CHEGADO. `entrar` roda logo depois de
       `loadRecords`, que é assíncrono: no arranque, `_records` está vazio, e
       procurar o cliente ali devolvia "não encontrado" para um cliente que
       existe. Era o que acontecia ao abrir o painel com um endereço de
       cliente guardado: a tela de erro no lugar da carteira.
       Então: se o cliente está em mãos, abre. Se a carteira ainda está vazia,
       guarda o pedido e mostra a lista — `atualizar` resolve quando os
       registros chegarem. Só damos "não encontrado" quando há carteira
       carregada e o cliente não está nela, que é quando a resposta é verdade. */
    _pendente = '';
    const alvo = idDaRota();
    if (!alvo) { pintarLista(); return; }
    if (porId(alvo)) { abrirCliente(alvo, { semRota: true }); return; }
    if (!M().carteira().length) { _pendente = alvo; pintarLista(); return; }
    erroCliente();
  }

  function sair() {
    desligarRota();
    /* `semPintura`: sem ele, fechar o detalhe redesenharia a carteira inteira
       um instante antes de a tela ser esvaziada — trabalho jogado fora, e
       sobre um DOM que já está sendo desmontado.
       E nada de `raiz()` aqui: ela CRIA o container se não existir, e sair de
       um modelo em que nunca se entrou passaria a deixar um elemento vazio no
       painel dos outros dois. */
    fecharDetalhe({ semRota: true, semPintura: true });
    _pendente = '';
    /* O ENDEREÇO TAMBÉM SAI. Ele é a rota do modelo de clientes, e o modelo
       deixou de estar no ar: deixando `#clientes/xxx` para trás, a próxima
       entrada no painel reabria aquele cliente — mesmo vindo de um clique em
       "Clientes", que quer dizer "me mostre a carteira".
       `replaceState`, e não `pushState`: sair de uma tela não é um lugar novo
       para onde o botão voltar deva levar. */
    limparRota();
    const v = document.getElementById('cli-view');
    if (v) v.innerHTML = '';
  }

  /* Repintar de fora: o ouvinte do CRM chama isto quando um registro muda.
     Sem ele, marcar um acompanhamento como concluído em outra aba não
     apareceria aqui até trocar de tela. */
  function atualizar() {
    if (!M() || !M().ativo()) return;
    /* O pedido que ficou esperando a carteira. Assim que o cliente aparece,
       ele abre; se a carteira chegou e ele não está nela, aí sim o endereço
       aponta para algo que não existe. */
    if (_pendente) {
      const alvo = _pendente;
      if (porId(alvo)) {
        _pendente = '';
        abrirCliente(alvo, { semRota: true });
        return;
      }
      if (M().carteira().length) { _pendente = ''; erroCliente(); return; }
    }
    if (M().telaAtual() === 'detalhe' && M().clienteAberto()) {
      pintarDetalhe(M().clienteAberto(), { manterAba: true });
    } else if (document.getElementById('cli-lista')) {
      pintarLista({ manterScroll: true });
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     TELA 1 — A CARTEIRA
     ═════════════════════════════════════════════════════════════════════ */

  function pintarLista(opcoes) {
    const o = opcoes || {};
    const v = raiz();
    const scrollAntes = o.manterScroll ? (document.getElementById('crm-view')?.scrollTop || 0) : 0;
    v.innerHTML = '';
    /* CABECALHO E INDICADORES NA MESMA FAIXA. Antes eram dois blocos soltos
       sobre o preto da pagina, e o olho lia tres regioes onde ha uma: a
       apresentacao da carteira. Envolve-los na mesma superficie e o que da
       ao topo o peso que ele tem na referencia. */
    const faixa = el('div', { cls: 'cli-faixa' });
    faixa.appendChild(cabecalhoLista());
    faixa.appendChild(cartoesIndicadores());
    v.appendChild(faixa);

    const corpo = el('div', { cls: 'cli-corpo' });
    corpo.appendChild(painelTabela());
    const lado = el('div', { cls: 'cli-lado' });
    lado.appendChild(cartaoResumo());
    lado.appendChild(cartaoProximasAcoes());
    corpo.appendChild(lado);
    v.appendChild(corpo);

    const cv = document.getElementById('crm-view');
    if (cv) cv.scrollTop = o.manterScroll ? scrollAntes : (M().S.scroll || 0);

    /* Devolver o foco à linha de onde se saiu, e destacá-la por um instante:
       voltar de uma página e não saber onde se estava é perder o lugar. */
    if (M().S.selecionado) {
      const linha = v.querySelector('.cli-linha[data-id="' + cssId(M().S.selecionado) + '"]');
      if (linha) {
        linha.classList.add('voltou');
        linha.focus({ preventScroll: true });
        setTimeout(() => linha.classList.remove('voltou'), 1400);
      }
      M().S.selecionado = null;
    }
  }

  const cssId = s => String(s || '').replace(/["\\]/g, '');

  /* O CAMINHO DE VOLTA PARA OS OUTROS DOIS MODELOS. O botao "Alterar modelo"
     de sempre vive no heroi, e o heroi e parte do painel que este modelo
     substitui: sem um botao proprio, quem entra em Clientes fica sem saida
     para o Financeiro e para o Recrutamento. Ele passa a si mesmo como
     ancora, porque o botao antigo esta escondido e o menu abriria no lugar
     errado. */
  function botaoModelo() {
    return el('button', {
      cls: 'cli-btn cli-btn-fantasma cli-btn-modelo', attrs: { type: 'button',
        title: t('cli.switchModelHint',
          'Alternar entre Financeiro, Recrutamento e Clientes') },
      html: svg('trocar') + '<span>' + t('cli.model', 'Modelo: Clientes') + '</span>',
      onClick: e => {
        if (typeof crmAlterarModelo === 'function') crmAlterarModelo(e.currentTarget);
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     DUAS MANEIRAS DE UM CLIENTE ENTRAR NA CARTEIRA
     ═════════════════════════════════════════════════════════════════════
     Preenchendo você, que é o formulário de sempre. Ou pedindo para a pessoa
     preencher: um formulário que sai daqui por link ou e-mail, e cuja
     resposta vira cliente sozinha.

     O segundo caminho não é novo — o construtor de formulários existe, e já
     sabe transformar resposta em cliente (`criarCliente`). O que faltava era
     alguém dizer isso a quem está na carteira: o botão "+ Novo cliente" só
     oferecia digitar, e quem não conhecia o construtor por outro caminho
     nunca descobria que dava para não digitar nada.

     A pergunta só aparece no botão de criar. Editar um cliente que existe
     continua abrindo o formulário direto — ali não há dois caminhos. */
  function novoCliente() {
    if (typeof _escolherCaminho !== 'function'
        || typeof abrirConstrutorFormulario !== 'function') {
      /* Sem o construtor por perto, uma pergunta de dois caminhos com um
         caminho só seria um clique a mais para chegar ao mesmo lugar. */
      abrirFormulario(null);
      return;
    }
    _escolherCaminho(
      t('cli.newClientHow', 'Como quer cadastrar este cliente?'),
      t('cli.newClientHowSub',
        'Você pode preencher agora ou deixar que a própria pessoa preencha.'),
      [
        { valor: 'agora', titulo: t('cli.fillNow', 'Preencher agora'),
          sub: t('cli.fillNowSub', 'Você digita os dados que já tem em mãos.') },
        { valor: 'formulario', titulo: t('cli.askToFill', 'Pedir para o cliente preencher'),
          sub: t('cli.askToFillSub',
            'Monta um formulário com os campos que você escolher e envia por link ou e-mail. A resposta entra aqui como cliente.') },
      ],
    ).then(escolha => {
      if (escolha === 'agora') abrirFormulario(null);
      else if (escolha === 'formulario') abrirFormularioDeCadastro();
    });
  }

  /* O construtor abre já sabendo o destino: a resposta tem de virar cliente
     NESTE quadro, e não no pessoal de quem montou o formulário. */
  function abrirFormularioDeCadastro() {
    abrirConstrutorFormulario({
      criarCliente: true,
      titulo: t('cli.formDefaultTitle', 'Cadastro de cliente'),
    });
  }

  function cabecalhoLista() {
    const S = M().S;
    const cab = el('div', { cls: 'cli-cab' });

    const titulos = el('div', { cls: 'cli-cab-txt' }, [
      el('h1', { cls: 'cli-titulo', texto: t('cli.panelTitle', 'Painel de Clientes') }),
      el('p', { cls: 'cli-sub', texto: t('cli.panelSubtitle',
        'Gerencie sua carteira e acompanhe cada relacionamento em um só lugar.') }),
    ]);

    const busca = el('div', { cls: 'cli-busca', html: svg('search') });
    const inp = el('input', { cls: 'cli-busca-inp', attrs: {
      type: 'search', placeholder: t('cli.searchPlaceholder', 'Buscar clientes...'),
      'aria-label': t('cli.searchPlaceholder', 'Buscar clientes...'),
      value: S.busca, maxlength: '80',
    } });
    /* Debounce: sem ele, cada tecla refaz a lista inteira. Não é leitura do
       banco (os dados já estão em memória), mas é DOM refeito a cada letra. */
    let timer = 0;
    inp.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        S.busca = inp.value;
        S.pagina = 1;
        repintarTabela();
      }, 220);
    });
    busca.appendChild(inp);

    const btnFiltro = el('button', {
      cls: 'cli-btn cli-btn-fantasma' + (M().temFiltro() ? ' ativo' : ''),
      attrs: { type: 'button' },
      html: svg('filter') + '<span>' + t('cli.filters', 'Filtros') + '</span>',
      onClick: e => abrirFiltros(e.currentTarget),
    });

    const btnNovo = el('button', {
      cls: 'cli-btn cli-btn-forte', attrs: { type: 'button' },
      html: svg('plus') + '<span>' + t('cli.newClient', 'Novo cliente') + '</span>',
      onClick: () => novoCliente(),
    });

    const acoes = el('div', { cls: 'cli-cab-acoes' },
      [busca, botaoModelo(), btnFiltro, btnNovo]);
    cab.appendChild(titulos);
    cab.appendChild(acoes);
    return cab;
  }

  function cartaoIndicador(chave, rotulo, numero, secundario, cor) {
    return el('div', { cls: 'cli-kpi', style: '--kpi-cor:' + cor }, [
      el('div', { cls: 'cli-kpi-ico', html: svg(chave) }),
      el('div', { cls: 'cli-kpi-txt' }, [
        el('div', { cls: 'cli-kpi-rot', texto: rotulo }),
        /* O numero tem tamanho FIXO, e nao proporcional aos digitos: "1" e
           "128" dizem a mesma coisa sobre a importancia do indicador, e um
           "1" miudo faria a carteira nova parecer um erro de carregamento. */
        el('div', { cls: 'cli-kpi-num', texto: String(numero) }),
        el('div', { cls: 'cli-kpi-sub', texto: secundario }),
      ]),
    ]);
  }

  function cartoesIndicadores() {
    const i = M().indicadores();
    const caixa = el('div', { cls: 'cli-kpis' });

    caixa.appendChild(cartaoIndicador('users',
      t('cli.kpiActive', 'Clientes ativos'), i.ativos,
      i.novos7 > 0 ? t('cli.kpiAddedWeek', '{n} nos últimos 7 dias', { n: i.novos7 })
                   : t('cli.kpiOfTotal', 'de {n} na carteira', { n: i.total }),
      '#22d3ee'));

    caixa.appendChild(cartaoIndicador('pulse',
      t('cli.kpiNewMonth', 'Novos este mês'), i.novosMes,
      /* A variação só aparece quando há mês anterior com o que comparar:
         sobre base zero todo cliente novo viraria "+100%". */
      i.variacao === null
        ? t('cli.kpiNoCompare', 'sem mês anterior para comparar')
        : t('cli.kpiVsMonth', '{n}% vs mês anterior',
            { n: (i.variacao > 0 ? '+' : '') + i.variacao }),
      '#10b981'));

    caixa.appendChild(cartaoIndicador('clock',
      t('cli.kpiToday', 'Acompanhamentos hoje'), i.hojeContatos,
      i.atrasados > 0 ? t('cli.kpiLate', '{n} atrasados', { n: i.atrasados })
                      : t('cli.kpiNoLate', 'nenhum atrasado'),
      '#f59e0b'));

    caixa.appendChild(cartaoIndicador('calendar',
      t('cli.kpiNextReturns', 'Próximos retornos'), i.proximos30,
      t('cli.kpiNextWeek', '{n} nesta semana', { n: i.proximos7 }),
      '#8b5cf6'));

    return caixa;
  }

  /* ── A tabela ─────────────────────────────────────────────────────── */

  function painelTabela() {
    const painel = el('div', { cls: 'cli-painel', id: 'cli-painel-tabela' });
    const btn = (rotulo, ico, aoClicar) => el('button', {
      cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
      html: svg(ico, 13) + '<span>' + rotulo + '</span>',
      onClick: e => aoClicar(e.currentTarget),
    });
    painel.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('div', { cls: 'cli-painel-tit-linha' }, [
        el('h2', { cls: 'cli-painel-tit', texto: t('cli.clients', 'Clientes') }),
        /* O total ao lado do titulo: sem ele, "Clientes" e so um rotulo, e
           quantos existem so se descobre no rodape, depois de rolar. */
        el('span', { cls: 'cli-conta', texto: String(M().visiveis().length) }),
      ]),
      el('div', { cls: 'cli-painel-acoes' }, [
        btn(t('cli.columns', 'Colunas'), 'colunas', menuDeColunas),
        btn(t('cli.export', 'Exportar'), 'baixar', () => exportarClientes()),
        btn(t('cli.viewSettings', 'Visualização'), 'ajustes', menuDeAjustes),
        botaoOrdem(),
      ]),
    ]));
    painel.appendChild(el('div', { cls: 'cli-tabela-wrap', id: 'cli-lista' }));
    repintarTabela(painel);
    return painel;
  }

  function botaoOrdem() {
    const atual = M().ORDENS.find(o => o.key === M().S.ordem) || M().ORDENS[0];
    return el('button', {
      cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
      texto: t('cli.sortBy', 'Ordenar: {n}', { n: t(atual.i18n, atual.pt) }),
      onClick: e => {
        _cdashMenu(e.currentTarget, M().ORDENS.map(o => ({
          label: t(o.i18n, o.pt), sel: M().S.ordem === o.key,
          onClick: () => { M().S.ordem = o.key; M().S.pagina = 1; pintarLista(); },
        })));
      },
    });
  }

  /* ── Os controles do painel da tabela ─────────────────────────────────
     Contador ao lado do título, e três botões. Nenhum decorativo: cada um faz
     o que promete, e o que eu não fosse implementar não entraria como botão
     apagado — botão que não funciona ensina a não confiar nos outros. */
  const CLI_COLUNAS = [
    { key: 'segmento',   i18n: 'cli.colSegment', pt: 'Segmento' },
    { key: 'status',     i18n: 'cli.colStatus',  pt: 'Status' },
    { key: 'ultimo',     i18n: 'cli.colLast',    pt: 'Último contato' },
    { key: 'proximo',    i18n: 'cli.colNext',    pt: 'Próximo contato' },
    { key: 'tags',       i18n: 'cli.colTags',    pt: 'Tags' },
    { key: 'responsavel',i18n: 'cli.colOwner',   pt: 'Responsável' },
  ];

  const colunaVisivel = k => M().S.colunas.indexOf(k) !== -1;

  function menuDeColunas(ancora) {
    _cdashMenu(ancora, CLI_COLUNAS.map(c => ({
      label: t(c.i18n, c.pt),
      sel: colunaVisivel(c.key),
      onClick: () => {
        const S = M().S;
        /* A coluna Cliente e a de Ações não entram na lista: sem nome não há
           o que ler, e sem ações não há o que fazer. */
        S.colunas = colunaVisivel(c.key)
          ? S.colunas.filter(x => x !== c.key)
          : S.colunas.concat([c.key]);
        repintarTabela();
      },
    })), t('cli.columns', 'Colunas'));
  }

  function menuDeAjustes(ancora) {
    const S = M().S;
    _cdashMenu(ancora, [
      { label: t('cli.densityCozy', 'Densidade confortável'), sel: S.densidade !== 'compacta',
        onClick: () => { S.densidade = 'normal'; pintarLista(); } },
      { label: t('cli.densityCompact', 'Densidade compacta'), sel: S.densidade === 'compacta',
        onClick: () => { S.densidade = 'compacta'; pintarLista(); } },
      { label: t('cli.showSecondary', 'Mostrar contato sob o nome'), sel: S.verSecundario,
        onClick: () => { S.verSecundario = !S.verSecundario; repintarTabela(); } },
      { label: t('cli.resetView', 'Restaurar visualização'),
        onClick: () => {
          S.colunas = CLI_COLUNAS.map(c => c.key);
          S.densidade = 'normal';
          S.verSecundario = true;
          S.porPagina = 10;
          pintarLista();
        } },
    ], t('cli.viewSettings', 'Visualização'));
  }

  /* EXPORTAR. Só o que está na tela: os clientes do quadro atual, já passados
     pela busca e pelos filtros. Exportar a carteira inteira quando a pessoa
     filtrou por "atrasados" entregaria um arquivo que não é o que ela estava
     olhando. Sem dado financeiro e sem dado de recrutamento — este modelo não
     os lê nem os escreve. */
  function exportarClientes() {
    const lista = M().visiveis();
    if (!lista.length) {
      toast('ℹ️', t('cli.nothingToExport', 'Não há clientes para exportar com os filtros atuais.'));
      return;
    }
    const cabecalho = [
      t('cli.name', 'Nome'), t('cli.company', 'Empresa'), t('cli.contact', 'Contato principal'),
      t('cli.email', 'E-mail'), t('cli.phone', 'Telefone'),
      t('cli.colSegment', 'Segmento'), t('cli.colStatus', 'Status'),
      t('cli.colTags', 'Tags'), t('cli.colOwner', 'Responsável'),
      t('cli.colLast', 'Último contato'), t('cli.colNext', 'Próximo contato'),
      t('cli.city', 'Cidade'), t('cli.state', 'Estado'),
    ];
    const linhas = lista.map(r => [
      M().nomeDe(r), r.companyName || '', M().contatoDe(r),
      M().emailDe(r), M().telDe(r),
      M().segmentoDe(r) ? M().rotuloDe(global.CLI_SEGMENTOS, M().segmentoDe(r)) : '',
      t(M().statusInfo(M().statusDe(r)).i18n, M().statusInfo(M().statusDe(r)).pt),
      M().tagsDe(r).join(' | '), M().responsavelDe(r),
      M().fmtData(M().ultimoContato(r)), M().fmtData(M().proximoContato(r)),
      r.city || '', r.uf || '',
    ]);
    /* Ponto e vírgula e BOM: é o que faz o Excel em português abrir o arquivo
       em colunas e com acento certo, em vez de tudo numa célula só. */
    const csv = [cabecalho].concat(linhas)
      .map(l => l.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';'))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes-' + M().hojeIso() + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('📄', t('cli.exported', '{n} clientes exportados.', { n: lista.length }));
  }

  function repintarTabela(dentro) {
    const alvo = (dentro || document).querySelector
      ? (dentro || document).querySelector('#cli-lista')
      : null;
    const caixa = alvo || document.getElementById('cli-lista');
    if (!caixa) return;
    caixa.innerHTML = '';

    const S = M().S;
    const todos = M().visiveis();

    /* FILTRO ATIVO PRECISA APARECER, sempre — e não só quando ele zera a
       lista. O aviso de "Limpar filtros" morava dentro do estado vazio, então
       bastava sobrar UM cliente para que os escondidos não tivessem caminho de
       volta: a pessoa via a carteira encolher e nada dizendo por quê. */
    const barraFiltros = barraDeFiltrosAtivos();
    if (barraFiltros) caixa.appendChild(barraFiltros);

    if (!todos.length) {
      caixa.appendChild(vazio());
      return;
    }

    const paginas = Math.max(1, Math.ceil(todos.length / S.porPagina));
    if (S.pagina > paginas) S.pagina = paginas;
    const inicio = (S.pagina - 1) * S.porPagina;
    const pagina = todos.slice(inicio, inicio + S.porPagina);

    const selecao = barraDeSelecao();
    if (selecao) caixa.appendChild(selecao);

    const tab = el('table', { cls: 'cli-tabela'
      + (S.densidade === 'compacta' ? ' compacta' : '') });
    const thead = el('thead');
    const trh = el('tr');
    /* A caixinha do cabecalho marca a PAGINA, e nao a carteira: marcar
       trezentos clientes que nao estao a vista, com um clique, e o tipo de
       coisa que so se descobre depois de apertar Excluir. */
    const thSel = el('th', { cls: 'cli-td-sel' });
    const todosDaPagina = pagina.every(r => M().S.selecionados.indexOf(r.id) !== -1);
    const chkTodos = el('input', { cls: 'cli-chk', attrs: {
      type: 'checkbox', 'aria-label': t('cli.selectPage', 'Selecionar esta página'),
    } });
    if (pagina.length && todosDaPagina) {
      chkTodos.checked = true;
      chkTodos.setAttribute('checked', 'checked');
    }
    chkTodos.addEventListener('change', () => {
      pagina.forEach(r => alternarSelecao(r.id, chkTodos.checked, true));
      repintarTabela();
    });
    thSel.appendChild(chkTodos);
    trh.appendChild(thSel);
    trh.appendChild(el('th', { texto: t('cli.colClient', 'Cliente') }));
    CLI_COLUNAS.forEach(c => {
      if (colunaVisivel(c.key)) trh.appendChild(el('th', { texto: t(c.i18n, c.pt) }));
    });
    trh.appendChild(el('th', { texto: t('cli.colActions', 'Ações') }));
    thead.appendChild(trh);
    tab.appendChild(thead);

    const tbody = el('tbody');
    pagina.forEach((r, i) => tbody.appendChild(linhaDoCliente(r, i)));
    tab.appendChild(tbody);
    caixa.appendChild(tab);

    caixa.appendChild(rodapeDaTabela(todos.length, paginas, inicio, pagina.length));
  }

  function linhaDoCliente(r, i) {
    const tr = el('tr', {
      cls: 'cli-linha', attrs: {
        'data-id': r.id, tabindex: '0', role: 'button',
        'aria-label': t('cli.openClient', 'Abrir {n}', { n: M().nomeDe(r) }),
      },
    });
    tr.style.animationDelay = Math.min(i, 10) * 22 + 'ms';

    /* Seleção. O clique nela NÃO abre o cliente: marcar linhas é outra
       intenção, e abrir a página por engano tira a pessoa da lista onde ela
       estava marcando. */
    const tdSel = el('td', { cls: 'cli-td-sel' });
    const marcado = M().S.selecionados.indexOf(r.id) !== -1;
    const chk = el('input', { cls: 'cli-chk', attrs: {
      type: 'checkbox',
      'aria-label': t('cli.selectClient', 'Selecionar {n}', { n: M().nomeDe(r) }),
    } });
    if (marcado) { chk.checked = true; chk.setAttribute('checked', 'checked'); }
    chk.addEventListener('click', e => e.stopPropagation());
    chk.addEventListener('change', () => alternarSelecao(r.id, chk.checked));
    tdSel.appendChild(chk);
    tr.appendChild(tdSel);
    if (marcado) tr.classList.add('selecionada');

    // Cliente
    const av = el('div', { cls: 'cli-avatar', texto: iniciais(M().nomeDe(r)),
      style: 'background:' + corDe(r.id) });
    const linha1 = el('div', { cls: 'cli-nome' }, [
      el('span', { texto: M().nomeDe(r) }),
    ]);
    if (M().favorito(r)) linha1.appendChild(el('span', { cls: 'cli-fav', html: svg('star', 12) }));
    /* O contato sob o nome sai pela Visualizacao: em tela estreita ele e a
       primeira coisa que sobra. */
    const sub = M().S.verSecundario
      ? (M().contatoDe(r) || M().emailDe(r) || M().telDe(r)) : '';
    const tdCli = el('td', {}, [
      el('div', { cls: 'cli-cel-cliente' }, [av, el('div', {}, [
        linha1,
        sub ? el('div', { cls: 'cli-nome-sub', texto: sub }) : null,
      ])]),
    ]);
    tr.appendChild(tdCli);

    /* Cada coluna so e montada se estiver visivel — e na MESMA ordem do
       cabecalho, senao o dado cai embaixo do rotulo errado. */
    const celulas = {
      segmento: () => {
        const seg = M().segmentoDe(r);
        return el('td', {}, [seg
          ? el('span', { cls: 'cli-chip cli-chip-seg',
              texto: M().rotuloDe(global.CLI_SEGMENTOS, seg) })
          : el('span', { cls: 'cli-vazio', texto: '—' })]);
      },
      status: () => {
        const st = M().statusInfo(M().statusDe(r));
        return el('td', {}, [
          el('span', { cls: 'cli-status', style: '--st:' + st.cor }, [
            el('span', { cls: 'cli-status-ponto' }),
            el('span', { texto: t(st.i18n, st.pt) }),
          ]),
        ]);
      },
      ultimo: () => {
        const ult = M().ultimoContato(r);
        return el('td', {}, [
          el('div', { cls: 'cli-data', texto: ult ? M().fmtData(ult) : '—' }),
          ult ? el('div', { cls: 'cli-data-sub', texto: M().fmtRelativo(ult) }) : null,
        ]);
      },
      proximo: () => {
        const prox = M().proximoContato(r);
        const atraso = M().atrasado(r);
        return el('td', {}, [
          el('div', { cls: 'cli-data' + (atraso ? ' atrasado' : ''),
            texto: prox ? M().fmtData(prox) : '—' }),
          prox ? el('div', { cls: 'cli-data-sub' + (atraso ? ' atrasado' : ''),
            texto: atraso ? t('cli.lateBy', 'atrasado') : M().fmtRelativo(prox) }) : null,
        ]);
      },
      tags: () => {
        const tags = M().tagsDe(r);
        const tdTags = el('td', { cls: 'cli-td-tags' });
        tags.slice(0, 2).forEach(x =>
          tdTags.appendChild(el('span', { cls: 'cli-chip', texto: x })));
        if (tags.length > 2) {
          tdTags.appendChild(el('span', { cls: 'cli-chip cli-chip-mais',
            texto: '+' + (tags.length - 2),
            attrs: { title: tags.slice(2).join(', ') } }));
        }
        if (!tags.length) tdTags.appendChild(el('span', { cls: 'cli-vazio', texto: '—' }));
        return tdTags;
      },
      responsavel: () => {
        const resp = M().responsavelDe(r);
        return el('td', {}, [resp
          ? el('span', { cls: 'cli-resp', texto: resp })
          : el('span', { cls: 'cli-vazio', texto: '—' })]);
      },
    };
    CLI_COLUNAS.forEach(c => {
      if (colunaVisivel(c.key)) tr.appendChild(celulas[c.key]());
    });

    // Ações
    const btn = el('button', {
      cls: 'cli-acoes-btn', attrs: {
        type: 'button', 'aria-label': t('cli.rowActions', 'Ações do cliente'),
      }, html: svg('dots', 16),
    });
    btn.addEventListener('click', e => { e.stopPropagation(); menuDaLinha(btn, r); });
    tr.appendChild(el('td', { cls: 'cli-td-acoes' }, [btn]));

    tr.addEventListener('click', () => abrirCliente(r.id));
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCliente(r.id); }
    });
    return tr;
  }

  /* A SELECAO PRECISA LEVAR A ALGUM LUGAR. Uma caixinha que marca e nao
     oferece nada e o mesmo defeito do botao que nao clica: ela promete uma
     acao que nao existe. */
  function alternarSelecao(id, ligar, semRepintar) {
    const S = M().S;
    const i = S.selecionados.indexOf(id);
    if (ligar && i === -1) S.selecionados.push(id);
    if (!ligar && i !== -1) S.selecionados.splice(i, 1);
    if (!semRepintar) repintarTabela();
  }

  function barraDeSelecao() {
    const S = M().S;
    /* Só o que continua visível conta: quem marcou cinco e depois filtrou não
       pode apagar os que sumiram da tela. */
    const visiveis = M().visiveis();
    const marcados = visiveis.filter(r => S.selecionados.indexOf(r.id) !== -1);
    if (!marcados.length) return null;

    const barra = el('div', { cls: 'cli-selecao' });
    barra.appendChild(el('span', { cls: 'cli-selecao-conta',
      texto: t('cli.nSelected', '{n} selecionados', { n: marcados.length }) }));
    const acao = (rotulo, aoClicar, perigo) => barra.appendChild(el('button', {
      cls: 'cli-btn cli-btn-fantasma cli-btn-peq' + (perigo ? ' perigo' : ''),
      attrs: { type: 'button' }, texto: rotulo, onClick: e => aoClicar(e.currentTarget),
    }));

    acao(t('cli.changeStatus', 'Alterar status'), ancora => {
      _cdashMenu(ancora, (global.CLI_STATUS || []).map(st => ({
        label: t(st.i18n, st.pt),
        onClick: async () => {
          for (const r of marcados) await mudarStatus(r, st.key);
          limparSelecao();
        },
      })), t('cli.changeStatus', 'Alterar status'));
    });

    acao(t('cli.addTag', 'Adicionar tag'), () => {
      _pedirTexto({
        titulo: t('cli.addTag', 'Adicionar tag'), rotulo: t('cli.tagLabel', 'Tag'),
        dica: t('cli.tagHint', 'Ex.: VIP, Estratégico, Recorrente'), max: 24,
        aoConfirmar: async valor => {
          for (const r of marcados) {
            const atuais = M().tagsDe(r);
            if (atuais.some(x => x.toLowerCase() === valor.toLowerCase())) continue;
            if (atuais.length >= 12) continue;
            await updateRecord(r.id, { tags: atuais.concat([valor]) });
          }
          limparSelecao();
        },
      });
    });

    acao(t('cli.archive', 'Arquivar'), () => {
      _confirmarPerigo({
        icone: '🗄',
        titulo: t('cli.archiveNQ', 'Arquivar {n} clientes?', { n: marcados.length }),
        texto: t('cli.archiveNDesc',
          'Eles saem da lista padrão e continuam achaveis pelo filtro "Arquivados".'),
        confirmar: t('cli.archive', 'Arquivar'),
        aoConfirmar: async () => {
          for (const r of marcados) await updateRecord(r.id, { archived: true });
          limparSelecao();
        },
      });
    });

    acao(t('cli.delete', 'Excluir'), () => {
      // Mesma decisão do excluir de um só — ver `excluir`.
      _confirmarPerigo({
        icone: '🗑',
        titulo: t('cli.deleteNQ', 'Excluir {n} clientes?', { n: marcados.length }),
        texto: t('cli.deleteNDesc',
          'Sai o cadastro, o historico e os documentos de cada um. As notas do quadro nao sao apagadas.')
          + ' ' + t('cli.deleteAlsoFinanceN',
            'Os registros deles no Financeiro também são apagados.'),
        alternativa: {
          rotulo: t('cli.removeFromWalletOnly', 'Tirar só da carteira'),
          explica: t('cli.removeFromWalletDesc',
            'Ele sai da lista de clientes e continua no Financeiro, com valores e vencimentos.'),
          aoEscolher: async () => {
            for (const r of marcados) {
              if (typeof updateRecord === 'function') {
                await updateRecord(r.id, { foraDaCarteira: true });
              }
            }
            toast('👋', t('cli.removedFromWalletN',
              '{n} clientes saíram da carteira. O financeiro deles continua lá.',
              { n: marcados.length }));
            limparSelecao();
          },
        },
        confirmar: t('cli.deleteEverywhere', 'Excluir de tudo'),
        aoConfirmar: async () => {
          for (const r of marcados) {
            if (typeof deleteRecord === 'function') await deleteRecord(r.id);
          }
          limparSelecao();
        },
      });
    });

    barra.appendChild(el('button', {
      cls: 'cli-selecao-limpar', attrs: { type: 'button' },
      texto: t('cli.clearSelection', 'Limpar seleção'), onClick: () => limparSelecao(),
    }));
    return barra;
  }

  function limparSelecao() {
    M().S.selecionados = [];
    atualizar();
  }

  function rodapeDaTabela(total, paginas, inicio, nesta) {
    const S = M().S;
    const rod = el('div', { cls: 'cli-rodape' });
    rod.appendChild(el('span', { cls: 'cli-rodape-txt',
      texto: t('cli.showingRange', 'Mostrando {a} a {b} de {n} clientes',
        { a: inicio + 1, b: inicio + nesta, n: total }) }));

    const nav = el('div', { cls: 'cli-pag' });
    const irPara = p => { S.pagina = p; repintarTabela(); };
    nav.appendChild(el('button', {
      cls: 'cli-pag-btn', attrs: { type: 'button', 'aria-label': t('cli.prev', 'Anterior'),
        disabled: S.pagina <= 1 }, texto: '‹',
      onClick: () => irPara(Math.max(1, S.pagina - 1)),
    }));
    /* Até 5 números, sempre em volta da página atual: cem páginas não cabem e
       "1 … 47 48 49 … 100" diz o mesmo com menos ruído. */
    const de = Math.max(1, Math.min(S.pagina - 2, paginas - 4));
    const ate = Math.min(paginas, de + 4);
    for (let p = de; p <= ate; p++) {
      nav.appendChild(el('button', {
        cls: 'cli-pag-btn' + (p === S.pagina ? ' sel' : ''),
        attrs: { type: 'button', 'aria-current': p === S.pagina ? 'page' : false },
        texto: String(p), onClick: () => irPara(p),
      }));
    }
    nav.appendChild(el('button', {
      cls: 'cli-pag-btn', attrs: { type: 'button', 'aria-label': t('cli.next', 'Próxima'),
        disabled: S.pagina >= paginas }, texto: '›',
      onClick: () => irPara(Math.min(paginas, S.pagina + 1)),
    }));
    rod.appendChild(nav);

    const sel = el('select', { cls: 'cli-porpag',
      attrs: { 'aria-label': t('cli.perPage', 'Linhas por página') } });
    [10, 25, 50].forEach(n => {
      const op = el('option', { texto: String(n), attrs: { value: String(n) } });
      if (n === S.porPagina) op.setAttribute('selected', 'selected');
      sel.appendChild(op);
    });
    sel.addEventListener('change', () => {
      S.porPagina = Number(sel.value) || 10;
      S.pagina = 1;
      repintarTabela();
    });
    rod.appendChild(el('label', { cls: 'cli-porpag-rot',
      texto: t('cli.perPage', 'Linhas por página') }, [sel]));
    return rod;
  }

  /* ── Estados vazios ───────────────────────────────────────────────────
     Três situações diferentes, três respostas diferentes. "Nenhum cliente
     encontrado" numa carteira vazia manda a pessoa procurar o que ela nunca
     cadastrou. */
  function vazio() {
    const temCarteira = M().carteira().length > 0;
    const caixa = el('div', { cls: 'cli-vazio-box' });
    caixa.appendChild(el('div', { cls: 'cli-vazio-ico', html: svg('users', 34) }));
    if (!temCarteira && !M().temFiltro() && !M().S.busca) {
      caixa.appendChild(el('div', { cls: 'cli-vazio-tit',
        texto: t('cli.emptyTitle', 'Sua carteira está vazia') }));
      caixa.appendChild(el('div', { cls: 'cli-vazio-txt',
        texto: t('cli.emptyDesc', 'Cadastre o primeiro cliente para começar a acompanhar contatos, retornos e histórico.') }));
      caixa.appendChild(el('div', { cls: 'cli-vazio-btns' }, [
        el('button', { cls: 'cli-btn cli-btn-forte',
          attrs: { type: 'button' }, texto: t('cli.emptyCta', 'Adicionar primeiro cliente'),
          onClick: () => novoCliente() }),
        /* O segundo caminho à vista na carteira vazia: é onde ele mais serve,
           e escondê-lo atrás do mesmo botao faria quem esta comecando achar
           que so existe digitar um por um. */
        el('button', { cls: 'cli-btn cli-btn-fantasma',
          attrs: { type: 'button' }, texto: t('cli.askToFill', 'Pedir para o cliente preencher'),
          onClick: () => abrirFormularioDeCadastro() }),
      ]));
    } else {
      caixa.appendChild(el('div', { cls: 'cli-vazio-tit',
        texto: t('cli.noResults', 'Nenhum cliente encontrado') }));
      caixa.appendChild(el('div', { cls: 'cli-vazio-txt',
        texto: t('cli.noResultsDesc', 'Nenhum cliente atende à busca e aos filtros atuais.') }));
      caixa.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma',
        attrs: { type: 'button' }, texto: t('cli.clearFilters', 'Limpar filtros'),
        onClick: () => limparFiltros() }));
    }
    return caixa;
  }

  function limparFiltros() {
    const S = M().S;
    S.busca = '';
    Object.keys(S.filtros).forEach(k => {
      S.filtros[k] = (typeof S.filtros[k] === 'boolean') ? false : '';
    });
    S.pagina = 1;
    pintarLista();
  }

  /* O que cada filtro ligado diz de si mesmo. Sem isto a barra mostraria
     "semana" e "negociacao", que são chaves de código e não respostas. */
  const CLI_CONTATO_ROTULOS = [
    { key: 'atrasados',  i18n: 'cli.fLate',   pt: 'Acompanhamentos atrasados' },
    { key: 'semana',     i18n: 'cli.fWeek',   pt: 'Retorno nesta semana' },
    { key: 'semproximo', i18n: 'cli.fNoNext', pt: 'Sem próximo contato' },
  ];

  function _rotuloDoFiltro(chave, valor) {
    const daLista = (lista, v) => {
      const achado = (lista || []).find(o => o.key === v);
      return achado ? t(achado.i18n, achado.pt) : v;
    };
    switch (chave) {
      case 'status':     return daLista(global.CLI_STATUS, valor);
      case 'segmento':   return daLista(global.CLI_SEGMENTOS, valor);
      case 'tipo':       return daLista(global.CLI_TIPOS, valor);
      case 'prioridade': return daLista(global.CLI_PRIORIDADES, valor);
      case 'origem':     return daLista(global.CLI_ORIGENS, valor);
      case 'contato':    return daLista(CLI_CONTATO_ROTULOS, valor);
      case 'tag':        return t('cli.colTags', 'Tags') + ': ' + valor;
      case 'responsavel':return t('cli.colOwner', 'Responsável') + ': ' + valor;
      case 'arquivados': return t('cli.chipArchived', 'Só arquivados');
      case 'fora':       return t('cli.chipOutOfWallet', 'Só quem saiu da carteira');
      /* Filtro booleano sem rótulo próprio mostraria "true" na ficha — foi o
         que apareceu na primeira vez que `fora` entrou aqui. O nome da chave
         é uma resposta ruim, mas é uma resposta; "true" não é nenhuma. */
      default:           return (valor === true) ? chave : String(valor);
    }
  }

  function barraDeFiltrosAtivos() {
    const S = M().S;
    const ligados = Object.keys(S.filtros).filter(k => !!S.filtros[k]);
    const busca = S.busca.trim();
    if (!ligados.length && !busca) return null;

    const barra = el('div', { cls: 'cli-filtros-ativos' });
    barra.appendChild(el('span', { cls: 'cli-filtros-ativos-rot',
      texto: t('cli.filteringBy', 'Filtrando por:') }));

    const ficha = (texto, aoTirar) => {
      const c = el('span', { cls: 'cli-filtro-ficha' }, [
        el('span', { texto }),
      ]);
      c.appendChild(el('button', { cls: 'cli-filtro-ficha-x',
        attrs: { type: 'button', 'aria-label':
          t('cli.removeFilter', 'Remover filtro {n}', { n: texto }) },
        texto: '✕', onClick: () => { aoTirar(); S.pagina = 1; pintarLista(); } }));
      barra.appendChild(c);
    };

    if (busca) {
      ficha(t('cli.searchChip', 'Busca: "{q}"', { q: busca }), () => { S.busca = ''; });
    }
    ligados.forEach(k => {
      ficha(_rotuloDoFiltro(k, S.filtros[k]),
        () => { S.filtros[k] = (typeof S.filtros[k] === 'boolean') ? false : ''; });
    });

    /* Quantos ficaram de fora: é a frase que explica o sumiço sem obrigar a
       contar. */
    const escondidos = M().carteira().length - M().visiveis().length;
    if (escondidos > 0) {
      barra.appendChild(el('span', { cls: 'cli-filtros-ativos-conta',
        texto: t('cli.hiddenByFilter', '{n} fora do filtro', { n: escondidos }) }));
    }

    barra.appendChild(el('button', { cls: 'cli-filtros-ativos-limpar',
      attrs: { type: 'button' }, texto: t('cli.clearFilters', 'Limpar filtros'),
      onClick: () => limparFiltros() }));
    return barra;
  }

  /* ── Resumo rápido ────────────────────────────────────────────────── */

  function cartaoResumo() {
    const S = M().S;
    const r = M().resumo(S.periodo);
    const painel = el('div', { cls: 'cli-painel cli-painel-lado' });

    const per = M().PERIODOS.find(p => p.key === S.periodo) || M().PERIODOS[0];
    painel.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.quickSummary', 'Resumo rápido') }),
      el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq',
        attrs: { type: 'button' }, texto: t(per.i18n, per.pt),
        onClick: e => _cdashMenu(e.currentTarget, M().PERIODOS.map(p => ({
          label: t(p.i18n, p.pt), sel: S.periodo === p.key,
          onClick: () => { S.periodo = p.key; pintarLista(); },
        }))) }),
    ]));

    const linhas = el('div', { cls: 'cli-resumo' });
    /* A VARIACAO SO APARECE ONDE PODE SER CALCULADA. "Novos clientes" tem
       periodo anterior para comparar; "clientes ativos" nao — sabemos quantos
       estao ativos HOJE, e nao quantos estavam no mes passado, porque o
       registro guarda o status atual e nao a historia dele. Inventar uma seta
       ali seria dar ares de medida a um palpite. */
    const linha = (rot, val, tom, delta) => {
      const dir = el('span', { cls: 'cli-resumo-dir' }, [
        el('span', { cls: 'cli-resumo-val' + (tom ? ' ' + tom : ''), texto: String(val) }),
      ]);
      if (delta !== null && delta !== undefined) {
        dir.appendChild(el('span', {
          cls: 'cli-delta ' + (delta > 0 ? 'sobe' : delta < 0 ? 'desce' : 'igual'),
          texto: (delta > 0 ? '+' : '') + delta + '%',
        }));
      }
      linhas.appendChild(el('div', { cls: 'cli-resumo-linha' }, [
        el('span', { cls: 'cli-resumo-rot', texto: rot }), dir,
      ]));
    };
    linha(t('cli.sumNew', 'Novos clientes'), r.novos, '', r.variacaoNovos);
    linha(t('cli.sumActive', 'Clientes ativos'), r.ativos, 'bom');
    linha(t('cli.sumInactive', 'Inativos'), r.inativos);
    linha(t('cli.sumWaiting', 'Aguardando retorno'), r.aguardando);
    linha(t('cli.sumPending', 'Acompanhamentos pendentes'), r.pendentes,
      r.pendentes > 0 ? 'alerta' : '');
    linha(t('cli.sumReturnRate', 'Taxa de retorno'),
      r.taxa === null ? t('cli.noData', 'sem dados') : r.taxa + '%');

    /* A BARRA DA TAXA DE RETORNO, e nao a distribuicao por status. Antes a
       barra que aparecia embaixo desta linha era a de status — e com um
       cliente so, todo ativo, ela ficava 100% verde debaixo do texto "sem
       dados". Duas coisas contrarias no mesmo lugar, e a que se ve primeiro e
       a barra cheia. Sem dados ela fica vazia, que e o que "sem dados"
       significa. */
    const trilho = el('div', { cls: 'cli-taxa' + (r.taxa === null ? ' vazia' : '') });
    trilho.appendChild(el('span', {
      style: 'width:' + (r.taxa === null ? 0 : Math.max(2, r.taxa)) + '%' }));
    linhas.appendChild(trilho);
    if (r.taxa === null) {
      linhas.appendChild(el('div', { cls: 'cli-taxa-nota',
        texto: t('cli.notEnoughData', 'Sem dados suficientes para calcular.') }));
    }
    painel.appendChild(linhas);

    /* Distribuição por status: uma barra só, dividida, com o rótulo dela.
       Seis números soltos não mostram proporção, que é a pergunta que esta
       linha responde — mas ela precisa dizer de que fala, senão empresta o
       sentido da linha de cima. */
    if (r.total > 0) {
      painel.appendChild(el('div', { cls: 'cli-dist-rot',
        texto: t('cli.distByStatus', 'Distribuição por status') }));
      const barra = el('div', { cls: 'cli-dist',
        attrs: { role: 'img', 'aria-label': t('cli.distByStatus', 'Distribuição por status') } });
      (global.CLI_STATUS || []).forEach(s => {
        const n = r.porStatus[s.key] || 0;
        if (!n) return;
        barra.appendChild(el('span', {
          style: 'width:' + ((n / r.total) * 100).toFixed(1) + '%;background:' + s.cor,
          attrs: { title: t(s.i18n, s.pt) + ': ' + n },
        }));
      });
      painel.appendChild(barra);
    }

    painel.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-largo',
      attrs: { type: 'button' }, texto: t('cli.fullReport', 'Ver relatório completo'),
      onClick: () => relatorioDeClientes() }));
    return painel;
  }

  /* ── Próximas ações ───────────────────────────────────────────────── */

  function cartaoProximasAcoes() {
    const itens = M().proximasAcoes(6);
    const painel = el('div', { cls: 'cli-painel cli-painel-lado' });
    painel.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.nextActions', 'Próximas ações') }),
      el('span', { cls: 'cli-conta', texto: String(itens.length) }),
    ]));

    if (!itens.length) {
      /* Estado vazio com saida: um cartao grande e vazio nao diz o que fazer
         em seguida. */
      painel.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noNextActions', 'Nenhuma ação programada.') }));
      painel.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-largo',
        attrs: { type: 'button' }, texto: t('cli.newFollowup', 'Criar acompanhamento'),
        onClick: () => {
          const primeiro = M().carteira()[0];
          if (primeiro) agendarParaCliente(primeiro);
          else toast('ℹ️', t('cli.needClientFirst',
            'Cadastre um cliente para marcar um acompanhamento.'));
        } }));
      return painel;
    }

    /* TIMELINE, e nao lista solta: o fio ligando os pontos e o que diz que
       estes itens estao em ordem de tempo — e nao apenas empilhados. */
    const lista = el('div', { cls: 'cli-acoes-lista' });
    itens.forEach(a => {
      const quando = a.atrasado ? 'atrasada'
        : a.data === M().hojeIso() ? 'hoje' : 'futura';
      const item = el('button', { cls: 'cli-acao ' + quando, attrs: { type: 'button' } });
      item.appendChild(el('span', { cls: 'cli-acao-ponto' }));
      const txt = el('div', { cls: 'cli-acao-txt' });
      txt.appendChild(el('div', { cls: 'cli-acao-tipo',
        texto: a.tipo === 'contato' ? t('cli.nextContactAction', 'Próximo contato')
                                    : t('cli.inEvent', 'Evento') }));
      txt.appendChild(el('div', { cls: 'cli-acao-tit', texto: a.titulo }));
      txt.appendChild(el('div', { cls: 'cli-acao-cli', texto: a.cliente }));
      txt.appendChild(el('div', { cls: 'cli-acao-quando',
        texto: M().fmtData(a.data) + (a.hora ? ' · ' + a.hora : '')
          + (a.atrasado ? ' · ' + t('cli.lateBy', 'atrasado')
             : quando === 'hoje' ? ' · ' + t('cli.today', 'hoje') : '') }));
      item.appendChild(txt);
      /* Clicar leva ao cliente E à seção do acompanhamento: abrir a página no
         topo obrigaria a procurar de novo o que a pessoa acabou de apontar. */
      item.addEventListener('click', () => abrirCliente(a.clienteId, { irPara: 'acomp' }));
      lista.appendChild(item);
    });
    painel.appendChild(lista);
    /* "VER TODAS AS AÇÕES" MOSTRA AS AÇÕES — e não uma carteira filtrada.
       Ele aplicava `filtros.contato = 'semana'` na tabela de clientes, o que é
       outra coisa e pior de três jeitos: escondia todo cliente sem retorno nos
       próximos sete dias (quem tinha dois clientes ficava com um e achava que
       o outro sumiu), escondia inclusive o cliente da ação que a pessoa
       acabara de olhar, se o compromisso dele fosse para depois da semana, e
       não deixava pista nenhuma de como desfazer. */
    painel.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-largo',
      attrs: { type: 'button' }, texto: t('cli.allActions', 'Ver todas as ações'),
      onClick: () => abrirTodasAsAcoes() }));
    return painel;
  }

  /* A agenda inteira da carteira, numa lista só e em ordem de data. Nada aqui
     mexe na tabela de clientes: olhar a agenda não é filtrar a carteira. */
  function abrirTodasAsAcoes() {
    document.querySelector('.cli-acoes-bg')?.remove();
    const itens = M().proximasAcoes();
    const bg = el('div', { cls: 'modal-bg cli-acoes-bg' });
    const cx = el('div', { cls: 'modal cli-acoes-modal' });

    cx.appendChild(el('div', { cls: 'cli-filtros-cab' }, [
      el('div', { cls: 'm-h1', texto: t('cli.allActions', 'Ver todas as ações') }),
      el('button', { cls: 'cli-fechar', attrs: { type: 'button', 'aria-label':
        t('common.close', 'Fechar') }, texto: '✕', onClick: () => bg.remove() }),
    ]));

    if (!itens.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noNextActions', 'Nenhuma ação programada.') }));
    } else {
      const hoje = M().hojeIso();
      const atrasadas = itens.filter(a => a.atrasado).length;
      /* "1 ações no total" é o tipo de frase que denuncia que ninguém leu a
         tela com um item só dentro. */
      const total = itens.length === 1
        ? t('cli.actionsSummaryOne', '1 ação no total')
        : t('cli.actionsSummary', '{n} ações no total', { n: itens.length });
      cx.appendChild(el('div', { cls: 'cli-acoes-resumo', texto: atrasadas
        ? total + ' · ' + (atrasadas === 1
            ? t('cli.actionsLateOne', '1 atrasada')
            : t('cli.actionsLateMany', '{a} atrasadas', { a: atrasadas }))
        : total }));

      const lista = el('div', { cls: 'cli-acoes-lista cli-acoes-lista-todas' });
      itens.forEach(a => {
        const quando = a.atrasado ? 'atrasada' : a.data === hoje ? 'hoje' : 'futura';
        const item = el('button', { cls: 'cli-acao ' + quando, attrs: { type: 'button' } });
        item.appendChild(el('span', { cls: 'cli-acao-ponto' }));
        const txt = el('div', { cls: 'cli-acao-txt' });
        txt.appendChild(el('div', { cls: 'cli-acao-tipo',
          texto: a.tipo === 'contato' ? t('cli.nextContactAction', 'Próximo contato')
                                      : t('cli.inEvent', 'Evento') }));
        txt.appendChild(el('div', { cls: 'cli-acao-tit', texto: a.titulo }));
        txt.appendChild(el('div', { cls: 'cli-acao-cli', texto: a.cliente }));
        txt.appendChild(el('div', { cls: 'cli-acao-quando',
          texto: M().fmtData(a.data) + (a.hora ? ' · ' + a.hora : '')
            + (a.atrasado ? ' · ' + t('cli.lateBy', 'atrasado')
               : quando === 'hoje' ? ' · ' + t('cli.today', 'hoje') : '') }));
        item.appendChild(txt);
        item.addEventListener('click', () => {
          bg.remove();
          abrirCliente(a.clienteId, { irPara: 'acomp' });
        });
        lista.appendChild(item);
      });
      cx.appendChild(lista);
    }

    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  /* ═════════════════════════════════════════════════════════════════════
     FILTROS
     ═════════════════════════════════════════════════════════════════════
     Painel próprio, e não uma lista de menu: são oito filtros e um menu de
     uma coluna com oito submenus obrigaria a abrir e fechar oito vezes para
     montar uma pergunta só. */
  function abrirFiltros() {
    document.querySelector('.cli-filtros-bg')?.remove();
    const S = M().S;
    const bg = el('div', { cls: 'modal-bg cli-filtros-bg' });
    const cx = el('div', { cls: 'modal cli-filtros' });

    cx.appendChild(el('div', { cls: 'cli-filtros-cab' }, [
      el('div', { cls: 'm-h1', texto: t('cli.filters', 'Filtros') }),
      el('button', { cls: 'cli-fechar', attrs: { type: 'button',
        'aria-label': t('common.close', 'Fechar') }, texto: '✕',
        onClick: () => bg.remove() }),
    ]));

    const grade = el('div', { cls: 'cli-filtros-grade' });
    const campo = (rotulo, chave, lista, rotuloTodos) => {
      const sel = el('select', { cls: 'm-inp', attrs: { id: 'cli-f-' + chave } });
      sel.appendChild(el('option', { texto: rotuloTodos, attrs: { value: '' } }));
      lista.forEach(o => {
        const op = el('option', { texto: t(o.i18n, o.pt), attrs: { value: o.key } });
        if (S.filtros[chave] === o.key) op.setAttribute('selected', 'selected');
        sel.appendChild(op);
      });
      sel.addEventListener('change', () => { S.filtros[chave] = sel.value; });
      grade.appendChild(el('div', { cls: 'crm-modal-col' }, [
        el('label', { cls: 'crm-modal-lbl', texto: rotulo,
          attrs: { for: 'cli-f-' + chave } }),
        sel,
      ]));
    };

    campo(t('cli.colStatus', 'Status'), 'status', global.CLI_STATUS || [],
      t('cli.allStatus', 'Todos os status'));
    campo(t('cli.colSegment', 'Segmento'), 'segmento', global.CLI_SEGMENTOS || [],
      t('cli.allSegments', 'Todos os segmentos'));
    campo(t('cli.clientType', 'Tipo de cliente'), 'tipo', global.CLI_TIPOS || [],
      t('cli.allTypes', 'Todos os tipos'));
    campo(t('cli.priority', 'Prioridade'), 'prioridade', global.CLI_PRIORIDADES || [],
      t('cli.allPriorities', 'Todas'));
    campo(t('cli.origin', 'Origem'), 'origem', global.CLI_ORIGENS || [],
      t('cli.allOrigins', 'Todas'));
    campo(t('cli.contactFilter', 'Contato'), 'contato', [
      { key: 'atrasados',  i18n: 'cli.fLate',    pt: 'Acompanhamentos atrasados' },
      { key: 'semana',     i18n: 'cli.fWeek',    pt: 'Retorno nesta semana' },
      { key: 'semproximo', i18n: 'cli.fNoNext',  pt: 'Sem próximo contato' },
    ], t('cli.anyContact', 'Qualquer'));

    /* Tag e responsável saem do que existe na carteira, e não de uma lista
       fixa: filtrar por uma tag que ninguém usou não devolveria nada. */
    const tags = new Set();
    const resps = new Set();
    M().carteira().forEach(r => {
      M().tagsDe(r).forEach(x => tags.add(x));
      if (r.responsibleUserId) resps.add(String(r.responsibleUserId));
    });
    campo(t('cli.colTags', 'Tags'), 'tag',
      [...tags].sort().map(x => ({ key: x, i18n: '', pt: x })),
      t('cli.allTags', 'Todas as tags'));
    campo(t('cli.colOwner', 'Responsável'), 'responsavel',
      [...resps].sort().map(x => ({ key: x, i18n: '', pt: x })),
      t('cli.allOwners', 'Todos'));

    cx.appendChild(grade);

    const arq = el('label', { cls: 'cli-check-linha' });
    const chk = el('input', { attrs: { type: 'checkbox' } });
    if (S.filtros.arquivados) chk.setAttribute('checked', 'checked');
    chk.addEventListener('change', () => {
      S.filtros.arquivados = chk.checked;
      if (chk.checked) { S.filtros.fora = false; chkFora.checked = false; }
    });
    arq.appendChild(chk);
    arq.appendChild(el('span', { texto: t('cli.showArchived', 'Mostrar apenas arquivados') }));
    cx.appendChild(arq);

    /* A porta de volta de quem foi "tirado só da carteira". Sem ela o registro
       continuaria no Financeiro, íntegro, e invisível para sempre do lado dos
       clientes. */
    const foraLinha = el('label', { cls: 'cli-check-linha' });
    const chkFora = el('input', { attrs: { type: 'checkbox' } });
    if (S.filtros.fora) chkFora.setAttribute('checked', 'checked');
    chkFora.addEventListener('change', () => {
      S.filtros.fora = chkFora.checked;
      if (chkFora.checked) { S.filtros.arquivados = false; chk.checked = false; }
    });
    foraLinha.appendChild(chkFora);
    foraLinha.appendChild(el('span', { texto: t('cli.showOutOfWallet',
      'Mostrar apenas quem saiu da carteira (segue no Financeiro)') }));
    cx.appendChild(foraLinha);

    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('cli.clearFilters', 'Limpar filtros'),
        onClick: () => { bg.remove(); limparFiltros(); } }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.apply', 'Aplicar'),
        onClick: () => { bg.remove(); S.pagina = 1; pintarLista(); } }),
    ]));

    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  /* ═════════════════════════════════════════════════════════════════════
     MENU DA LINHA
     ═════════════════════════════════════════════════════════════════════ */
  function menuDaLinha(ancora, r) {
    _cdashMenu(ancora, [
      { label: t('cli.viewDetails', 'Ver detalhes'), onClick: () => abrirCliente(r.id) },
      { label: t('cli.editClient', 'Editar cliente'), onClick: () => abrirFormulario(r) },
      { label: t('cli.changeStatus', 'Alterar status'),
        onClick: () => menuDeStatus(ancora, r) },
      { label: t('cli.addTag', 'Adicionar tag'), onClick: () => pedirTag(r) },
      { label: M().favorito(r) ? t('cli.unfavorite', 'Desfavoritar')
                               : t('cli.favorite', 'Favoritar'),
        onClick: () => alternarFavorito(r) },
      { label: t('cli.duplicate', 'Duplicar'), onClick: () => duplicar(r) },
      { label: M().arquivado(r) ? t('cli.unarchive', 'Desarquivar')
                                : t('cli.archive', 'Arquivar'),
        onClick: () => arquivar(r) },
      /* Só aparece para quem está fora: um "trazer de volta" ao lado de todo
         cliente que já está na carteira não responde pergunta nenhuma. */
      ...(M().foraDaCarteira(r)
        ? [{ label: t('cli.backToWallet', 'Trazer de volta para a carteira'),
             onClick: () => voltarParaCarteira(r) }]
        : []),
      { label: t('cli.delete', 'Excluir'), danger: true,
        onClick: () => excluir(r) },
    ]);
  }

  async function voltarParaCarteira(r) {
    if (typeof updateRecord === 'function') {
      await updateRecord(r.id, { foraDaCarteira: false });
    }
    toast('🤝', t('cli.backInWallet', '"{n}" voltou para a carteira.',
      { n: M().nomeDe(r) }));
    atualizar();
  }

  function menuDeStatus(ancora, r) {
    const atual = M().statusDe(r);
    _cdashMenu(ancora, (global.CLI_STATUS || []).map(s => ({
      label: t(s.i18n, s.pt), sel: s.key === atual,
      onClick: () => mudarStatus(r, s.key),
    })), t('cli.changeStatus', 'Alterar status'));
  }

  /* Toda mudança que valha história entra na linha do tempo. Sem isso, a aba
     de interações contaria só o que foi digitado à mão, e a pergunta "desde
     quando ele está inativo?" não teria resposta em lugar nenhum. */
  async function registrar(r, tipo, texto) {
    const agora = new Date();
    const hora = String(agora.getHours()).padStart(2, '0') + ':'
      + String(agora.getMinutes()).padStart(2, '0');
    const eu = (typeof CU !== 'undefined' && CU) ? (CU.username || CU.uid || '') : '';
    const nova = {
      id: 'int_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      tipo, data: M().hojeIso(), hora, autor: eu, texto: String(texto || ''),
      em: Date.now(),
    };
    const antes = M().interacoesDe(r);
    /* Teto de 200: o registro inteiro é baixado a cada mudança, e uma linha do
       tempo sem limite faria o quadro pesar mais a cada ligação anotada. */
    const lista = antes.concat([nova]).slice(-200);
    return updateRecord(r.id, { interactions: lista, lastContactAt: nova.data });
  }

  async function mudarStatus(r, chave) {
    const de = M().statusInfo(M().statusDe(r));
    const para = M().statusInfo(chave);
    await updateRecord(r.id, { relationshipStatus: chave });
    await registrar(r, 'status', t('cli.statusChanged', 'Status: {de} → {para}', {
      de: t(de.i18n, de.pt), para: t(para.i18n, para.pt) }));
    toast('✅', t('cli.statusSaved', 'Status atualizado.'));
    atualizar();
  }

  function pedirTag(r) {
    _pedirTexto({
      titulo: t('cli.addTag', 'Adicionar tag'),
      rotulo: t('cli.tagLabel', 'Tag'),
      dica: t('cli.tagHint', 'Ex.: VIP, Estratégico, Recorrente'),
      max: 24,
      aoConfirmar: async valor => {
        const atuais = M().tagsDe(r);
        if (atuais.some(x => x.toLowerCase() === valor.toLowerCase())) {
          toast('ℹ️', t('cli.tagAlready', 'Esta tag já está no cliente.'));
          return;
        }
        if (atuais.length >= 12) {
          toast('⚠', t('cli.tagLimit', 'Limite de 12 tags por cliente.'));
          return;
        }
        await updateRecord(r.id, { tags: atuais.concat([valor]) });
        atualizar();
      },
    });
  }

  async function alternarFavorito(r) {
    await updateRecord(r.id, { favorite: !M().favorito(r) });
    atualizar();
  }

  /* Duplicar copia o CADASTRO, e nada do que aconteceu. Interação, documento e
     acompanhamento pertencem ao cliente que os viveu — copiá-los criaria um
     histórico que nunca existiu. */
  async function duplicar(r) {
    const copia = await createRecord({
      name: M().nomeDe(r) + ' ' + t('cli.copySuffix', '(cópia)'),
      description: r.description || '',
      email: '', phone: '',
      cpf: '', cep: r.cep || '', address: r.address || '',
      neighborhood: r.neighborhood || '', city: r.city || '', uf: r.uf || '',
      clientType: r.clientType || '', companyName: r.companyName || '',
      contactName: '', segment: r.segment || '',
      relationshipStatus: 'negociacao',
      tags: M().tagsDe(r), responsibleUserId: r.responsibleUserId || '',
      origin: r.origin || '', priority: r.priority || 'media',
      color: r.color || 'indigo',
    });
    if (copia) {
      toast('✅', t('cli.duplicated', 'Cliente duplicado.'));
      atualizar();
    }
  }

  async function arquivar(r) {
    const indo = !M().arquivado(r);
    await updateRecord(r.id, { archived: indo });
    toast('🗄', indo ? t('cli.archived', 'Cliente arquivado. Ele continua na busca por "Arquivados".')
                     : t('cli.unarchived', 'Cliente desarquivado.'));
    if (indo && M().telaAtual() === 'detalhe') fecharDetalhe();
    else atualizar();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EXCLUIR CLIENTE NÃO É EXCLUIR O FINANCEIRO
     ═══════════════════════════════════════════════════════════════════════
     Cliente e cobrança são o MESMO registro — a aba Clientes e a aba
     Financeiro leem o mesmo dado e fazem perguntas diferentes sobre ele. A
     consequência era invisível até doer: excluir da carteira apagava do
     financeiro junto, levando valores, vencimentos e recebimentos de quem
     nunca pediu isso.

     Que a carteira crie um registro financeiro para cada cliente é o desenho
     e continua valendo. O que não pode continuar é a volta: sair da carteira
     não decide nada sobre o financeiro. Quem decide é quem está excluindo, e
     por isso a pergunta agora tem duas saídas. */
  function excluir(r) {
    const notas = (typeof notes !== 'undefined' && Array.isArray(notes))
      ? notes.filter(n => n && n._crmRecordId === r.id).length : 0;
    const docs = Array.isArray(r.documents) ? r.documents.length : 0;
    const interacoes = M().interacoesDe(r).length;

    /* Dizer o tamanho do estrago ANTES: "tem certeza?" sem número nenhum é uma
       pergunta que não dá para responder. */
    const partes = [];
    if (interacoes) partes.push(t('cli.impactInteractions', '{n} interações', { n: interacoes }));
    if (docs) partes.push(t('cli.impactDocs', '{n} documentos', { n: docs }));
    if (notas) partes.push(t('cli.impactNotes', '{n} notas ligadas', { n: notas }));

    _confirmarPerigo({
      icone: '🗑',
      titulo: t('cli.deleteQuestion', 'Excluir "{n}"?', { n: M().nomeDe(r) }),
      texto: (partes.length
        ? t('cli.deleteImpact', 'Saem junto: {lista}. As notas do quadro não são apagadas.',
            { lista: partes.join(', ') })
        : t('cli.deleteNoImpact', 'Este cliente não tem histórico registrado.'))
        + ' ' + t('cli.deleteAlsoFinance',
          'O registro dele no Financeiro também é apagado.'),
      alternativa: {
        rotulo: t('cli.removeFromWalletOnly', 'Tirar só da carteira'),
        explica: t('cli.removeFromWalletDesc',
          'Ele sai da lista de clientes e continua no Financeiro, com valores e vencimentos.'),
        aoEscolher: async () => {
          if (typeof updateRecord === 'function') {
            await updateRecord(r.id, { foraDaCarteira: true });
          }
          toast('👋', t('cli.removedFromWallet',
            '"{n}" saiu da carteira. O financeiro dele continua lá.',
            { n: M().nomeDe(r) }));
          if (M().telaAtual() === 'detalhe') fecharDetalhe();
          else atualizar();
        },
      },
      confirmar: t('cli.deleteEverywhere', 'Excluir de tudo'),
      aoConfirmar: async () => {
        if (typeof deleteRecord === 'function') await deleteRecord(r.id);
        if (M().telaAtual() === 'detalhe') fecharDetalhe();
        else atualizar();
      },
    });
  }

  /* ── Duas caixinhas de uso geral deste modelo ───────────────────────── */

  function _pedirTexto(o) {
    document.querySelector('.cli-pedir-bg')?.remove();
    const bg = el('div', { cls: 'modal-bg cli-pedir-bg' });
    const cx = el('div', { cls: 'modal cli-pedir' });
    cx.appendChild(el('div', { cls: 'm-h1', texto: o.titulo }));
    cx.appendChild(el('label', { cls: 'crm-modal-lbl', texto: o.rotulo,
      attrs: { for: 'cli-pedir-inp' } }));
    const inp = el('input', { cls: 'm-inp', id: 'cli-pedir-inp', attrs: {
      type: 'text', maxlength: String(o.max || 120), placeholder: o.dica || '',
      autocomplete: 'off',
    } });
    cx.appendChild(inp);
    const erro = el('div', { cls: 'campo-erro', style: 'display:none' });
    cx.appendChild(erro);
    const confirmar = () => {
      const v = inp.value.trim();
      if (!v) {
        erro.textContent = t('cli.typeSomething', 'Escreva alguma coisa.');
        erro.style.display = '';
        inp.focus();
        return;
      }
      bg.remove();
      o.aoConfirmar(v);
    };
    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.confirm', 'Confirmar'), onClick: confirmar }),
    ]));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar(); });
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    setTimeout(() => inp.focus(), 40);
  }

  function _confirmarPerigo(o) {
    document.querySelector('.cli-conf-bg')?.remove();
    const bg = el('div', { cls: 'confirm-clear-pop cli-conf-bg' });
    const card = el('div', { cls: 'confirm-clear-card' }, [
      el('div', { cls: 'confirm-clear-icon', texto: o.icone || '⚠' }),
      el('div', { cls: 'confirm-clear-title', texto: o.titulo }),
      el('div', { cls: 'confirm-clear-desc', texto: o.texto }),
    ]);
    /* Uma terceira saída, quando ela existe. "Cancelar ou destruir" é uma
       pergunta de duas respostas para uma decisão que às vezes tem três — e a
       do meio (guardar o que não se quer perder) é justamente a que a pessoa
       procuraria se soubesse que existe. */
    if (o.alternativa) {
      card.appendChild(el('button', { cls: 'confirm-clear-alt',
        attrs: { type: 'button' }, texto: o.alternativa.rotulo,
        onClick: () => { fechar(); o.alternativa.aoEscolher(); } }));
      if (o.alternativa.explica) {
        card.appendChild(el('div', { cls: 'confirm-clear-alt-txt',
          texto: o.alternativa.explica }));
      }
    }

    const btns = el('div', { cls: 'confirm-clear-btns' }, [
      el('button', { cls: 'confirm-clear-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => fechar() }),
      el('button', { cls: 'confirm-clear-ok', attrs: { type: 'button' },
        texto: o.confirmar, onClick: () => { fechar(); o.aoConfirmar(); } }),
    ]);
    card.appendChild(btns);
    bg.appendChild(card);
    function fechar() {
      bg.classList.remove('visible');
      setTimeout(() => bg.remove(), 200);
    }
    bg.addEventListener('click', e => { if (e.target === bg) fechar(); });
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('visible'));
  }
  /* ═════════════════════════════════════════════════════════════════════
     ENTRAR E SAIR DA PÁGINA DO CLIENTE
     ═════════════════════════════════════════════════════════════════════ */

  function porId(id) {
    return M().carteira().find(r => String(r.id) === String(id))
      /* Arquivado também abre pelo id: quem chegou por link ou pelo filtro de
         arquivados não pode receber "não encontrado" de um cliente que existe. */
      || (typeof _registrosClientes === 'function'
          ? _registrosClientes().find(r => String(r.id) === String(id)) : null)
      || null;
  }

  function abrirCliente(id, opcoes) {
    const o = opcoes || {};
    if (_abrindo) return;              // clique repetido durante a troca
    const r = porId(id);
    if (!r) { erroCliente(); return; }

    _abrindo = true;
    const S = M().S;
    S.scroll = document.getElementById('crm-view')?.scrollTop || 0;
    S.selecionado = null;

    const linha = document.querySelector('.cli-linha[data-id="' + cssId(id) + '"]');
    if (linha) linha.classList.add('indo');

    const v = raiz();
    v.classList.add('saindo');
    setTimeout(() => {
      v.classList.remove('saindo');
      _tela = 'detalhe';
      _aberto = String(id);
      if (!o.semRota) escreverRota('#clientes/' + id);
      pintarDetalhe(id, { irPara: o.irPara });
      _abrindo = false;
    }, 190);
  }

  function fecharDetalhe(opcoes) {
    const o = opcoes || {};
    const voltandoDe = _aberto;
    _tela = 'lista';
    _aberto = null;
    pararParallax();
    if (!o.semRota) escreverRota('#clientes');
    if (o.semPintura) return;
    M().S.selecionado = voltandoDe;
    pintarLista();
  }

  function erroCliente() {
    const v = raiz();
    v.innerHTML = '';
    const caixa = el('div', { cls: 'cli-vazio-box' }, [
      el('div', { cls: 'cli-vazio-ico', html: svg('users', 34) }),
      el('div', { cls: 'cli-vazio-tit', texto: t('cli.notFound', 'Cliente não encontrado') }),
      el('div', { cls: 'cli-vazio-txt', texto: t('cli.notFoundDesc',
        'Ele pode ter sido excluído, ou pertencer a outro espaço de trabalho.') }),
      el('button', { cls: 'cli-btn cli-btn-forte', attrs: { type: 'button' },
        texto: t('cli.backToClients', 'Voltar para clientes'),
        onClick: () => { _tela = 'lista'; _aberto = null; escreverRota('#clientes'); pintarLista(); } }),
    ]);
    v.appendChild(caixa);
  }

  /* ═════════════════════════════════════════════════════════════════════
     TELA 2 — A PÁGINA DO CLIENTE
     ═════════════════════════════════════════════════════════════════════ */

  function pintarDetalhe(id, opcoes) {
    const o = opcoes || {};
    const r = porId(id);
    if (!r) { erroCliente(); return; }
    if (!o.manterAba) M().S.aba = o.aba || 'visao';

    const v = raiz();
    v.innerHTML = '';
    const pag = el('div', { cls: 'cli-det' });

    pag.appendChild(fundoAnimado());
    pag.appendChild(cabecalhoDetalhe(r));

    const topo = el('div', { cls: 'cli-det-topo' });
    topo.appendChild(cartaoEmFoco(r));
    const dir = el('div', { cls: 'cli-det-dir' });
    dir.appendChild(indicadoresDoCliente(r));
    dir.appendChild(blocoAcompanhamentos(r));
    topo.appendChild(dir);
    pag.appendChild(topo);

    pag.appendChild(abas(r));
    pag.appendChild(el('div', { cls: 'cli-aba-corpo', id: 'cli-aba-corpo' }));
    v.appendChild(pag);

    pintarAba(r);
    ligarParallax(pag);

    const cv = document.getElementById('crm-view');
    if (cv) cv.scrollTop = 0;

    /* Foco no nome do cliente: quem abriu pelo teclado precisa continuar de
       onde a tela nova começa, e não do topo do documento. */
    const alvoFoco = pag.querySelector('.cli-foco-nome');
    if (alvoFoco) alvoFoco.focus({ preventScroll: true });

    if (o.irPara === 'acomp') {
      const bloco = pag.querySelector('.cli-acomp');
      if (bloco) {
        bloco.classList.add('destacado');
        setTimeout(() => bloco.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
        setTimeout(() => bloco.classList.remove('destacado'), 2200);
      }
    }
  }

  /* ── O fundo animado ─────────────────────────────────────────────────
     Quatro camadas independentes, todas decorativas e nenhuma clicável. O
     movimento é só transform e opacity — animar width/top/left obrigaria o
     navegador a refazer o layout sessenta vezes por segundo, e a página tem
     tabela e linha do tempo por cima.
     Quantidade de partículas: menos no celular. Quem decide é uma medida de
     largura, e não o "é celular?" — uma janela estreita no desktop tem o mesmo
     problema de espaço. Movimento reduzido é respeitado no CSS. */
  function fundoAnimado() {
    const estreito = (global.innerWidth || 1200) < 720;
    const fundo = el('div', { cls: 'cli-fundo', attrs: { 'aria-hidden': 'true' } });
    fundo.appendChild(el('div', { cls: 'cli-fundo-base' }));
    fundo.appendChild(cenaDaOnda());
    for (let i = 1; i <= 3; i++) fundo.appendChild(el('div', { cls: 'cli-brilho b' + i }));
    /* Secundarias, e nao protagonistas: a malha e o elemento principal. */
    const quantas = estreito ? 3 : 10;
    for (let i = 0; i < quantas; i++) {
      /* Posição, tamanho, duração e atraso diferentes por partícula: com os
         mesmos valores as catorze piscam juntas, e o efeito vira um pulso. */
      const esq = (7 + (i * 6.6) % 86).toFixed(1);
      const topo = (12 + (i * 13.7) % 70).toFixed(1);
      const tam = (2 + (i % 4)).toFixed(0);
      const dur = (9 + (i % 7) * 1.4).toFixed(1);
      const atraso = (i * 0.83).toFixed(1);
      fundo.appendChild(el('span', { cls: 'cli-part', style:
        'left:' + esq + '%;top:' + topo + '%;width:' + tam + 'px;height:' + tam
        + 'px;animation-duration:' + dur + 's;animation-delay:' + atraso + 's' }));
    }
    return fundo;
  }

  /* ═════════════════════════════════════════════════════════════════════
     A MALHA ONDULADA DO CABEÇALHO
     ═════════════════════════════════════════════════════════════════════
     A versão anterior era feita de colunas verticais pontilhadas. Cada
     coluna subia e descia no seu tempo, e o resultado — corretamente
     descrito como equalizador — dizia "áudio", não "superfície". O erro não
     era de ajuste: era de eixo. Uma malha de terreno se lê pelas curvas que
     atravessam a cena da esquerda para a direita; barras que sobem
     individualmente nunca formam superfície, por mais que se acerte a cor.

     Agora são CAMINHOS horizontais: curvas Bézier que percorrem a cena
     inteira, empilhadas com pequenos deslocamentos. A malha nasce do fato de
     serem quase a mesma curva — variações da MESMA superfície, e não
     desenhos diferentes lado a lado.

     Os pontos vêm de `stroke-dasharray` sobre a curva: o traço curto segue o
     caminho, então os pontos acompanham a onda em vez de se alinharem em
     coluna. É o mesmo efeito de antes, no eixo certo.

     Três grupos, três profundidades. O que está longe é menor, mais
     transparente, mais desfocado e mais lento — que é como a distância se
     parece. Animação só nos GRUPOS: animar vinte e cinco caminhos
     separadamente seria vinte e cinco animações para dizer o que três dizem. */

  /* A superfície de base. Duas elevações — uma no primeiro terço, a maior
     depois do meio —, começando e terminando fora da cena, para a curva não
     ter ponta visível. */
  const ONDA_BASE = [
    [-120, 308], [180, 276], [268, 124], [520, 192],
    [764, 264], [836, 72], [1084, 144],
    [1292, 202], [1392, 292], [1720, 224],
  ];

  /* Uma variação da superfície: mesma curva, deslocada e com a altura das
     elevações multiplicada. `amp` menor achata a onda — é o que faz as linhas
     de baixo da malha parecerem o mesmo terreno visto mais de longe. */
  function caminhoDaOnda(desloc, amp) {
    /* 258 e a linha de repouso da superficie: as elevacoes sao medidas a
       partir dela, e `amp` as achata sem mexer no nivel do terreno. */
    const y = v => (258 + (v - 258) * amp + desloc).toFixed(1);
    const p = ONDA_BASE;
    return 'M ' + p[0][0] + ' ' + y(p[0][1])
      + ' C ' + p[1][0] + ' ' + y(p[1][1]) + ', ' + p[2][0] + ' ' + y(p[2][1])
      + ', ' + p[3][0] + ' ' + y(p[3][1])
      + ' C ' + p[4][0] + ' ' + y(p[4][1]) + ', ' + p[5][0] + ' ' + y(p[5][1])
      + ', ' + p[6][0] + ' ' + y(p[6][1])
      + ' C ' + p[7][0] + ' ' + y(p[7][1]) + ', ' + p[8][0] + ' ' + y(p[8][1])
      + ', ' + p[9][0] + ' ' + y(p[9][1]);
  }

  /* Um grupo da malha. `quantos` caminhos, empilhados a cada `passo` pixels.
     A cada três, um é linha contínua em vez de pontilhado: são elas que
     amarram a malha visualmente — só pontos viram poeira, só linhas viram
     mapa de contorno. */
  function grupoDaOnda(classe, quantos, passo, deDesloc, cor, opacidadeBase) {
    const partes = [];
    for (let i = 0; i < quantos; i++) {
      const desloc = deDesloc + i * passo;
      /* A onda achata conforme desce: no alto ficam as cristas, embaixo o
         terreno quase plano. */
      const amp = 1 - i * (0.55 / Math.max(1, quantos - 1));
      const contorno = i % 3 === 2;
      const op = (opacidadeBase * (1 - i * 0.045)).toFixed(3);
      partes.push('<path class="' + (contorno ? 'cli-onda-linha' : 'cli-onda-pontos')
        + '" d="' + caminhoDaOnda(desloc, amp) + '"'
        + ' stroke="' + cor + '" stroke-opacity="' + op + '"'
        + ' style="animation-delay:' + (-i * 1.7).toFixed(1) + 's"/>');
    }
    return '<g class="cli-camada ' + classe + '">' + partes.join('') + '</g>';
  }

  function cenaDaOnda() {
    const larg = global.innerWidth || 1200;
    const celular = larg < 720;
    const tablet = larg < 1080;

    /* Entre 14 e 30 caminhos no desktop; menos conforme a tela encolhe, e a
       camada mais distante sai primeiro — ela é a que menos se vê e a que
       mais custa, por causa do desfoque. */
    const grupos = [];
    /* Os deslocamentos mantem a malha inteira DENTRO da moldura. O SVG usa
       `slice`, que corta o excedente: uma crista acima de y=0 nao aparece
       cortada — ela some, e a onda fica com o topo raspado. */
    if (!tablet) {
      grupos.push(grupoDaOnda('cli-camada-tras', 8, 15, -10, '#0f766e', 0.34));
    }
    grupos.push(grupoDaOnda('cli-camada-meio', celular ? 6 : 12, celular ? 18 : 10,
      20, '#2dd4bf', celular ? 0.3 : 0.35));
    grupos.push(grupoDaOnda('cli-camada-frente', celular ? 3 : 5, 16, 52,
      '#22d3ee', 0.42));

    const cena = el('div', { cls: 'cli-onda-cena', attrs: { 'aria-hidden': 'true' } });
    cena.innerHTML = '<svg class="cli-onda-svg" viewBox="0 0 1600 420" '
      + 'preserveAspectRatio="xMidYMid slice" fill="none">'
      + grupos.join('') + '</svg>';
    return cena;
  }

  /* Parallax: opcional, só no desktop com ponteiro fino, nunca em texto nem
     botão, deslocamento de poucos pixels e ouvinte removido ao sair. */
  let _parallaxAlvo = null;
  let _parallaxFn = null;
  let _parallaxRaf = 0;

  function ligarParallax(pag) {
    pararParallax();
    if (!global.matchMedia) return;
    if (global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (global.matchMedia('(hover: none)').matches) return;   // touch fica de fora
    const fundo = pag.querySelector('.cli-fundo');
    if (!fundo) return;
    _parallaxAlvo = fundo;
    _parallaxFn = ev => {
      if (_parallaxRaf) return;
      _parallaxRaf = requestAnimationFrame(() => {
        _parallaxRaf = 0;
        const x = (ev.clientX / (global.innerWidth || 1) - 0.5) * 6;
        const y = (ev.clientY / (global.innerHeight || 1) - 0.5) * 4;
        fundo.style.setProperty('--px', x.toFixed(2) + 'px');
        fundo.style.setProperty('--py', y.toFixed(2) + 'px');
      });
    };
    global.addEventListener('mousemove', _parallaxFn, { passive: true });
  }

  function pararParallax() {
    if (_parallaxFn) global.removeEventListener('mousemove', _parallaxFn);
    if (_parallaxRaf) cancelAnimationFrame(_parallaxRaf);
    _parallaxFn = null; _parallaxRaf = 0; _parallaxAlvo = null;
  }

  function cabecalhoDetalhe(r) {
    const cab = el('div', { cls: 'cli-det-cab' });
    const esq = el('div', { cls: 'cli-det-cab-esq' });
    esq.appendChild(el('button', {
      cls: 'cli-voltar', attrs: { type: 'button' },
      html: svg('back', 15) + '<span>' + t('cli.backToClients', 'Voltar para clientes') + '</span>',
      onClick: () => fecharDetalhe(),
    }));
    esq.appendChild(el('h1', { cls: 'cli-titulo', texto: t('cli.panelTitle', 'Painel de Clientes') }));
    esq.appendChild(el('p', { cls: 'cli-sub', texto: t('cli.detailSubtitle',
      'Relacionamentos que impulsionam resultados.') }));
    cab.appendChild(esq);
    /* Tambem aqui: quem chegou pela URL de um cliente entra direto nesta tela,
       e nao pode depender de voltar para a lista para trocar de modelo. */
    cab.appendChild(el('div', { cls: 'cli-cab-acoes' }, [
      botaoModelo(),
      el('button', {
        cls: 'cli-btn cli-btn-forte', attrs: { type: 'button' },
        html: svg('plus') + '<span>' + t('cli.newClient', 'Novo cliente') + '</span>',
        onClick: () => novoCliente(),
      }),
    ]));
    return cab;
  }

  function cartaoEmFoco(r) {
    const cx = el('div', { cls: 'cli-painel cli-foco' });
    cx.appendChild(el('div', { cls: 'cli-foco-selo' }, [
      el('span', { cls: 'cli-foco-ponto' }),
      el('span', { texto: t('cli.inFocus', 'Cliente em foco') }),
    ]));

    const av = el('div', { cls: 'cli-foco-av', texto: iniciais(M().nomeDe(r)),
      style: 'background:' + corDe(r.id) });
    cx.appendChild(av);

    const nome = el('h2', { cls: 'cli-foco-nome', texto: M().nomeDe(r),
      attrs: { tabindex: '-1' } });
    const estrela = el('button', {
      cls: 'cli-fav-btn' + (M().favorito(r) ? ' on' : ''),
      attrs: { type: 'button', 'aria-pressed': M().favorito(r) ? 'true' : 'false',
        'aria-label': t('cli.favorite', 'Favoritar') },
      html: svg('star', 15), onClick: () => alternarFavorito(r),
    });
    cx.appendChild(el('div', { cls: 'cli-foco-linha-nome' }, [nome, estrela]));

    const tipo = M().tipoDe(r);
    if (tipo) cx.appendChild(el('span', { cls: 'cli-chip cli-chip-tipo',
      texto: M().rotuloDe(global.CLI_TIPOS, tipo) }));

    if (r.description) cx.appendChild(el('p', { cls: 'cli-foco-desc', texto: r.description }));

    const dados = el('div', { cls: 'cli-foco-dados' });
    const linhaDado = (ico, valor, href) => {
      if (!valor) return;
      const conteudo = href
        ? el('a', { cls: 'cli-foco-link', texto: valor, attrs: { href } })
        : el('span', { texto: valor });
      dados.appendChild(el('div', { cls: 'cli-foco-dado' }, [
        el('span', { cls: 'cli-foco-ico', html: svg(ico, 14) }), conteudo,
      ]));
    };
    linhaDado('mail', M().emailDe(r), M().emailDe(r) ? 'mailto:' + M().emailDe(r) : '');
    linhaDado('phone', M().telDe(r), M().telDe(r) ? 'tel:' + M().telDe(r).replace(/[^\d+]/g, '') : '');
    const local = [r.city, r.uf].filter(Boolean).join(', ');
    linhaDado('pin', local, '');
    cx.appendChild(dados);

    const selos = el('div', { cls: 'cli-foco-selos' });
    const st = M().statusInfo(M().statusDe(r));
    selos.appendChild(el('span', { cls: 'cli-status', style: '--st:' + st.cor }, [
      el('span', { cls: 'cli-status-ponto' }), el('span', { texto: t(st.i18n, st.pt) }),
    ]));
    if (M().segmentoDe(r)) selos.appendChild(el('span', { cls: 'cli-chip cli-chip-seg',
      texto: M().rotuloDe(global.CLI_SEGMENTOS, M().segmentoDe(r)) }));
    M().tagsDe(r).slice(0, 4).forEach(x =>
      selos.appendChild(el('span', { cls: 'cli-chip', texto: x })));
    cx.appendChild(selos);

    const desde = M().cadastroEm(r);
    if (desde) cx.appendChild(el('div', { cls: 'cli-foco-desde',
      texto: t('cli.since', 'Desde {n}', { n: M().fmtData(desde) }) }));

    cx.appendChild(acoesRapidas(r));
    return cx;
  }

  /* ── Ações rápidas ────────────────────────────────────────────────────
     Cada uma leva a um caminho que JÁ existe no MyDesk, com o cliente já
     preenchido. Ligar sem telefone e e-mail sem endereço ficam desligados com
     o motivo no título: um botão que não faz nada ensina a não confiar nos
     outros. */
  function acoesRapidas(r) {
    const cx = el('div', { cls: 'cli-rapidas' });
    const btn = (ico, rotulo, aoClicar, impedido) => {
      const b = el('button', {
        cls: 'cli-rapida' + (impedido ? ' off' : ''),
        attrs: { type: 'button', disabled: !!impedido, title: impedido || rotulo },
        html: svg(ico, 15) + '<span>' + rotulo + '</span>',
      });
      if (!impedido) b.addEventListener('click', aoClicar);
      cx.appendChild(b);
    };

    btn('note', t('cli.quickNote', 'Nova nota'), () => novaNotaDoCliente(r));
    btn('check', t('cli.quickTask', 'Nova tarefa'), () => novaTarefaDoCliente(r));
    btn('calendar', t('cli.quickSchedule', 'Agendar'), () => agendarParaCliente(r));
    btn('mail', t('cli.quickEmail', 'Enviar e-mail'),
      () => { global.location.href = 'mailto:' + M().emailDe(r); },
      M().emailDe(r) ? '' : t('cli.noEmail', 'Este cliente não tem e-mail cadastrado'));
    btn('phone', t('cli.quickCall', 'Ligar'),
      () => { global.location.href = 'tel:' + M().telDe(r).replace(/[^\d+]/g, ''); },
      M().telDe(r) ? '' : t('cli.noPhone', 'Este cliente não tem telefone cadastrado'));
    btn('user', t('cli.quickProfile', 'Ver perfil'),
      () => { M().S.aba = 'dados'; pintarDetalhe(r.id, { manterAba: true }); });
    return cx;
  }

  function novaNotaDoCliente(r) {
    _pedirTexto({
      titulo: t('cli.quickNote', 'Nova nota'),
      rotulo: t('cli.noteText', 'O que registrar'),
      dica: t('cli.noteHint', 'Ex.: cliente pediu proposta revisada'),
      max: 400,
      aoConfirmar: async v => { await registrar(r, 'nota', v); atualizar(); },
    });
  }

  function novaTarefaDoCliente(r) {
    _pedirTexto({
      titulo: t('cli.quickTask', 'Nova tarefa'),
      rotulo: t('cli.taskText', 'A tarefa'),
      dica: t('cli.taskHint', 'Ex.: enviar contrato revisado'),
      max: 200,
      aoConfirmar: async v => { await registrar(r, 'tarefa', v); atualizar(); },
    });
  }

  /* Agendar usa a agenda que já existe — a mesma que manda o aviso por e-mail.
     O vínculo com o cliente é um campo a mais no compromisso, e não uma
     segunda agenda paralela. */
  function agendarParaCliente(r) {
    document.querySelector('.cli-agendar-bg')?.remove();
    const bg = el('div', { cls: 'modal-bg cli-agendar-bg' });
    const cx = el('div', { cls: 'modal cli-pedir' });
    cx.appendChild(el('div', { cls: 'm-h1', texto: t('cli.scheduleFor', 'Agendar com {n}',
      { n: M().nomeDe(r) }) }));

    cx.appendChild(el('label', { cls: 'crm-modal-lbl', texto: t('cli.subject', 'Assunto'),
      attrs: { for: 'cli-ag-tit' } }));
    const tit = el('input', { cls: 'm-inp', id: 'cli-ag-tit', attrs: {
      type: 'text', maxlength: '120', autocomplete: 'off',
      placeholder: t('cli.subjectHint', 'Ex.: Reunião de alinhamento') } });
    cx.appendChild(tit);

    const linha = el('div', { cls: 'crm-modal-row' });
    const colD = el('div', { cls: 'crm-modal-col' });
    colD.appendChild(el('label', { cls: 'crm-modal-lbl', texto: t('cli.date', 'Data'),
      attrs: { for: 'cli-ag-data' } }));
    const data = el('input', { cls: 'm-inp', id: 'cli-ag-data',
      attrs: { type: 'date', value: M().somarDias(M().hojeIso(), 1) } });
    colD.appendChild(data);
    const colH = el('div', { cls: 'crm-modal-col' });
    colH.appendChild(el('label', { cls: 'crm-modal-lbl', texto: t('cli.time', 'Horário'),
      attrs: { for: 'cli-ag-hora' } }));
    const hora = el('input', { cls: 'm-inp', id: 'cli-ag-hora',
      attrs: { type: 'time', value: '10:00' } });
    colH.appendChild(hora);
    linha.appendChild(colD); linha.appendChild(colH);
    cx.appendChild(linha);

    const erro = el('div', { cls: 'campo-erro', style: 'display:none' });
    cx.appendChild(erro);

    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.schedule', 'Agendar'), onClick: async () => {
          const titulo = tit.value.trim();
          if (!titulo) {
            erro.textContent = t('cli.subjectRequired', 'Diga do que se trata.');
            erro.style.display = ''; tit.focus(); return;
          }
          if (!M().ehIso(data.value)) {
            erro.textContent = t('cli.dateRequired', 'Escolha uma data válida.');
            erro.style.display = ''; data.focus(); return;
          }
          bg.remove();
          await salvarAcompanhamento(r, {
            titulo, data: data.value, hora: hora.value || '',
          });
        } }),
    ]));
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    setTimeout(() => tit.focus(), 40);
  }

  async function salvarAcompanhamento(r, dados) {
    const item = {
      id: 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      titulo: dados.titulo, data: dados.data, hora: dados.hora || '',
      cor: r.color || 'indigo', clienteId: String(r.id),
    };
    if (typeof _salvarCompromisso === 'function') {
      if (typeof _agenda !== 'undefined' && Array.isArray(_agenda)) _agenda.push(item);
      await _salvarCompromisso(item);
    }
    /* O próximo contato do cliente acompanha o compromisso mais próximo: sem
       isso a coluna da tabela continuaria dizendo a data antiga. */
    const prox = M().proximoContato(r);
    if (prox) await updateRecord(r.id, { nextContactAt: prox });
    await registrar(r, 'evento', dados.titulo + ' — ' + M().fmtData(dados.data)
      + (dados.hora ? ' ' + dados.hora : ''));
    toast('📅', t('cli.scheduled', 'Acompanhamento agendado.'));
    atualizar();
  }

  /* ── Sparkline ────────────────────────────────────────────────────────
     A referência põe um risco pequeno no pé de cada indicador. Ele podia ser
     enfeite — e é assim que costuma ser feito —, mas um gráfico com forma
     inventada mente sobre uma tendência que ninguém mediu. Este sai dos
     dados do próprio cliente: oito semanas, uma coluna por semana.
     Sem nada medido, ele não é desenhado: linha reta no zero também é uma
     afirmação, e falsa. */
  function sparkline(valores, cor) {
    const v = (valores || []).map(x => Number(x) || 0);
    if (!v.length || v.every(x => x === 0)) return null;
    const max = Math.max.apply(null, v) || 1;
    const larg = 100, alt = 22;
    const passo = v.length > 1 ? larg / (v.length - 1) : larg;
    const pontos = v.map((n, i) =>
      (i * passo).toFixed(1) + ',' + (alt - (n / max) * (alt - 3) - 1.5).toFixed(1));
    const cx = el('div', { cls: 'cli-spark' });
    cx.innerHTML = '<svg viewBox="0 0 ' + larg + ' ' + alt + '" preserveAspectRatio="none" '
      + 'fill="none" stroke="' + cor + '" stroke-width="1.6" stroke-linecap="round" '
      + 'stroke-linejoin="round"><polyline points="' + pontos.join(' ') + '"/></svg>';
    return cx;
  }

  /* Oito semanas para trás, contando o que caiu em cada uma. É a mesma janela
     para os quatro indicadores, senão os riscos não se comparam entre si. */
  function porSemana(datas) {
    const hoje = M().hojeIso();
    const baldes = new Array(8).fill(0);
    (datas || []).forEach(d => {
      if (!M().ehIso(d)) return;
      const dias = M().diasEntre(d, hoje);
      if (dias === null || dias < 0 || dias > 55) return;
      baldes[7 - Math.floor(dias / 7)] += 1;
    });
    return baldes;
  }

  function indicadoresDoCliente(r) {
    const cx = el('div', { cls: 'cli-det-kpis' });
    const inter = M().interacoesDe(r);
    const hoje = M().hojeIso();
    const de30 = M().somarDias(hoje, -30);
    const recentes = inter.filter(i => i.data && i.data >= de30).length;
    const marcados = M().acompanhamentos(r);
    const pendentes = marcados.filter(a => a.data >= hoje).length
      + (M().ehIso(r.nextContactAt) && r.nextContactAt >= hoje ? 1 : 0);
    const nota = Number(r.satisfaction) || 0;

    /* A forma vem da referencia: anel a esquerda, rotulo pequeno em cima do
       numero grande, e o risco ocupando a LARGURA do cartao, embaixo. O
       espaco do risco e reservado mesmo quando nao ha o que desenhar — sem
       isso, um cartao sem dado fica mais baixo que os outros e a fileira
       perde a linha de base. */
    const cartao = (ico, rot, num, sub, cor, faixa, alerta) => {
      const bloco = el('div', { cls: 'cli-det-kpi', style: '--kpi-cor:' + cor });
      bloco.appendChild(el('div', { cls: 'cli-det-kpi-topo' }, [
        el('div', { cls: 'cli-kpi-anel', html: svg(ico) }),
        el('div', { cls: 'cli-kpi-txt' }, [
          el('div', { cls: 'cli-kpi-rot', texto: rot }),
          el('div', { cls: 'cli-kpi-num', texto: String(num) }),
          el('div', { cls: 'cli-kpi-sub' + (alerta ? ' alerta' : ''), texto: sub }),
        ]),
      ]));
      const risco = sparkline(faixa, cor);
      bloco.appendChild(risco || el('div', { cls: 'cli-spark cli-spark-vazio' }));
      cx.appendChild(bloco);
    };

    cartao('users', t('cli.kpiInteractions', 'Interações realizadas'), inter.length,
      inter.length ? t('cli.kpiLastOn', 'última em {n}',
        { n: M().fmtData(M().ultimoContato(r)) })
        : t('cli.noActivity', 'Nenhuma atividade'),
      '#22d3ee', porSemana(inter.map(i => i.data)));

    cartao('pulse', t('cli.kpiRecent', 'Atividades recentes'), recentes,
      t('cli.kpiLast30', 'nos últimos 30 dias'), '#10b981',
      porSemana(inter.filter(i => i.data >= de30).map(i => i.data)));

    cartao('checkc', t('cli.kpiPending', 'Acompanhamentos pendentes'), pendentes,
      M().atrasado(r) ? t('cli.kpiOneLate', 'há um atrasado')
                      : t('cli.kpiNoLate', 'nenhum atrasado'), '#f59e0b',
      porSemana(marcados.map(a => a.data)), M().atrasado(r));

    /* Nota zero não é nota: é ausência de avaliação, e mostrar "0,0" seria um
       julgamento que ninguém fez. */
    cartao('smile', t('cli.kpiSatisfaction', 'Satisfação média'),
      nota > 0 ? nota.toFixed(1).replace('.', ',') : '—',
      nota > 0 ? t('cli.kpiRatedOn', 'baseado no que você registrou')
               : t('cli.noRatings', 'Sem avaliações'), '#8b5cf6', null);
    return cx;
  }

  /* ── Próximos acompanhamentos ───────────────────────────────────────── */

  function blocoAcompanhamentos(r) {
    const cx = el('div', { cls: 'cli-painel cli-acomp' });
    cx.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.nextFollowups', 'Próximos acompanhamentos') }),
      el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
        html: svg('calendar', 13) + '<span>' + t('cli.viewCalendar', 'Ver calendário') + '</span>',
        onClick: () => verCalendario(r) }),
    ]));

    const itens = M().acompanhamentos(r).slice().sort((a, b) =>
      (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));

    if (!itens.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noFollowups', 'Nenhum acompanhamento marcado para este cliente.') }));
    } else {
      const lista = el('div', { cls: 'cli-acomp-lista' });
      itens.forEach(a => lista.appendChild(linhaAcompanhamento(r, a)));
      cx.appendChild(lista);
    }

    cx.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-largo',
      attrs: { type: 'button' }, texto: t('cli.newFollowup', 'Criar acompanhamento'),
      onClick: () => agendarParaCliente(r) }));
    return cx;
  }

  function linhaAcompanhamento(r, a) {
    const atrasado = a.data < M().hojeIso();
    const [ano, mes, dia] = String(a.data).split('-');
    const mesCurto = new Date(Date.UTC(Number(ano), Number(mes) - 1, 1))
      .toLocaleDateString(typeof _appLocale === 'function' ? _appLocale() : 'pt-BR',
        { month: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase();

    const linha = el('div', { cls: 'cli-acomp-item' + (atrasado ? ' atrasado' : '') });
    linha.appendChild(el('div', { cls: 'cli-acomp-data' }, [
      el('span', { cls: 'cli-acomp-dia', texto: dia }),
      el('span', { cls: 'cli-acomp-mes', texto: mesCurto }),
    ]));
    linha.appendChild(el('span', { cls: 'cli-acomp-hora', texto: a.hora || '—' }));
    /* O PONTO DIZ QUANDO, e nao quem. Ele saia da paleta do cliente, sorteada
       pelo id — e a paleta tem rosa, que numa lista de compromissos nao quer
       dizer nada e ainda puxa o olho mais que o proprio assunto. Aqui ele
       responde a unica pergunta que essa lista faz: passou, e hoje, ou ainda
       vem? */
    const quando = a.data < M().hojeIso() ? 'atrasado'
                 : a.data === M().hojeIso() ? 'hoje' : 'futuro';
    linha.appendChild(el('span', { cls: 'cli-acomp-ponto ' + quando }));
    const txt = el('div', { cls: 'cli-acomp-txt' }, [
      el('div', { cls: 'cli-acomp-tit', texto: a.titulo || '' }),
      el('div', { cls: 'cli-acomp-cli',
        texto: M().nomeDe(r) + (atrasado ? ' · ' + t('cli.lateBy', 'atrasado') : '') }),
    ]);
    linha.appendChild(txt);
    /* Quem cuida, no fim da linha: iniciais no circulo e o nome ao lado. */
    const quem = M().responsavelDe(r) || t('cli.you', 'Você');
    linha.appendChild(el('div', { cls: 'cli-acomp-quem' }, [
      el('span', { cls: 'cli-acomp-av', texto: iniciais(quem) }),
      el('span', { cls: 'cli-acomp-nome', texto: quem }),
    ]));
    const btn = el('button', { cls: 'cli-acoes-btn', attrs: { type: 'button',
      'aria-label': t('cli.followupActions', 'Ações do acompanhamento') }, html: svg('dots', 15) });
    btn.addEventListener('click', () => _cdashMenu(btn, [
      { label: t('cli.complete', 'Concluir'), onClick: () => concluirAcompanhamento(r, a) },
      { label: t('cli.reschedule', 'Reagendar'), onClick: () => reagendar(r, a) },
      { label: t('cli.deleteFollowup', 'Excluir'), danger: true,
        onClick: () => excluirAcompanhamento(r, a) },
    ]));
    linha.appendChild(btn);
    return linha;
  }

  async function concluirAcompanhamento(r, a) {
    await registrar(r, 'reuniao', t('cli.done', 'Concluído: {n}', { n: a.titulo || '' }));
    await removerCompromisso(a.id);
    const prox = M().proximoContato(r);
    await updateRecord(r.id, { nextContactAt: prox && prox >= M().hojeIso() ? prox : '' });
    toast('✅', t('cli.followupDone', 'Acompanhamento concluído.'));
    atualizar();
  }

  function reagendar(r, a) {
    agendarParaCliente(r);
  }

  function excluirAcompanhamento(r, a) {
    _confirmarPerigo({
      icone: '📅',
      titulo: t('cli.deleteFollowupQ', 'Excluir este acompanhamento?'),
      texto: t('cli.deleteFollowupDesc', 'O compromisso sai do calendário e o aviso por e-mail é cancelado.'),
      confirmar: t('cli.delete', 'Excluir'),
      aoConfirmar: async () => { await removerCompromisso(a.id); atualizar(); },
    });
  }

  async function removerCompromisso(id) {
    if (typeof _agenda !== 'undefined' && Array.isArray(_agenda)) {
      const i = _agenda.findIndex(x => String(x.id) === String(id));
      if (i !== -1) _agenda.splice(i, 1);
    }
    if (typeof _apagarCompromisso === 'function') await _apagarCompromisso(id);
  }

  function verCalendario(r) {
    /* O calendário do MyDesk é a agenda pessoal, e ela já mostra estes
       compromissos: o que falta é chegar lá sem perder o cliente de vista. */
    if (typeof toggleEventsPanel === 'function') {
      const painel = document.getElementById('events-panel');
      if (!painel || !painel.classList.contains('open')) toggleEventsPanel();
      toast('📅', t('cli.calendarOpened', 'Os acompanhamentos de {n} estão no calendário.',
        { n: M().nomeDe(r) }));
      return;
    }
    toast('📅', t('cli.calendarHint', 'Os acompanhamentos aparecem no calendário do MyDesk.'));
  }
  /* ═════════════════════════════════════════════════════════════════════
     ABAS
     ═════════════════════════════════════════════════════════════════════
     A primeira dobra continua sendo o cartão do cliente, os indicadores e os
     acompanhamentos. As abas ficam abaixo: quem quiser o histórico inteiro
     desce ou troca de aba, e quem só queria saber "como está" já sabe. */
  const ABAS = [
    { key: 'visao',      i18n: 'cli.tabOverview',  pt: 'Visão geral' },
    { key: 'interacoes', i18n: 'cli.tabTimeline',  pt: 'Interações' },
    { key: 'atividades', i18n: 'cli.tabActivity',  pt: 'Atividades' },
    { key: 'observacoes',i18n: 'cli.tabNotes',     pt: 'Observações' },
    { key: 'documentos', i18n: 'cli.tabDocs',      pt: 'Documentos' },
    { key: 'dados',      i18n: 'cli.tabData',      pt: 'Dados do cliente' },
  ];

  /* As abas do cliente. A de Processos entra so na ficha juridica — uma lista
     por ramo, e nao uma aba fixa que a maioria dos clientes nunca usa. */
  function abasDoCliente(r) {
    if (!ehJuridico(r)) return ABAS;
    const fora = ABAS.slice(0, 3);
    return fora.concat([{ key: 'processos', i18n: 'cli.tabCases', pt: 'Processos' }])
      .concat(ABAS.slice(3));
  }

  function abas(r) {
    const cx = el('div', { cls: 'cli-abas', attrs: { role: 'tablist' } });
    abasDoCliente(r).forEach(a => {
      const sel = M().S.aba === a.key;
      cx.appendChild(el('button', {
        cls: 'cli-aba' + (sel ? ' sel' : ''),
        /* A aba se identifica por CHAVE, e não pelo rótulo que está escrito
           nela: o rótulo muda com o idioma, e comparar texto para saber qual
           aba foi clicada deixaria de funcionar em inglês. */
        attrs: { type: 'button', role: 'tab', 'data-aba': a.key,
          'aria-selected': sel ? 'true' : 'false' },
        texto: t(a.i18n, a.pt),
        onClick: () => {
          M().S.aba = a.key;
          cx.querySelectorAll('.cli-aba').forEach(b => {
            const eSel = b.dataset.aba === a.key;
            b.classList.toggle('sel', eSel);
            b.setAttribute('aria-selected', eSel ? 'true' : 'false');
          });
          pintarAba(r);
        },
      }));
    });
    return cx;
  }

  function pintarAba(r) {
    const corpo = document.getElementById('cli-aba-corpo');
    if (!corpo) return;
    corpo.innerHTML = '';
    /* Trocar de cliente pode deixar a aba num lugar que nao existe mais: quem
       estava em Processos e abre um nutricionista tem de cair na visao geral,
       e nao numa tela em branco. */
    if (M().S.aba === 'processos' && !ehJuridico(r)) M().S.aba = 'visao';
    switch (M().S.aba) {
      case 'processos':  corpo.appendChild(abaProcessos(r)); break;
      case 'interacoes': corpo.appendChild(abaInteracoes(r)); break;
      case 'atividades': corpo.appendChild(abaAtividades(r)); break;
      case 'observacoes': corpo.appendChild(abaObservacoes(r)); break;
      case 'documentos': corpo.appendChild(abaDocumentos(r)); break;
      case 'dados':      corpo.appendChild(abaDados(r)); break;
      default:           corpo.appendChild(abaVisao(r));
    }
  }

  /* ── Visão geral ─────────────────────────────────────────────────────
     Um resumo do que as outras abas têm por inteiro: as últimas interações e
     a descrição. Repetir tudo aqui faria as abas não servirem para nada. */
  /* DO MAIS RECENTE PARA O MAIS ANTIGO, pela DATA — e não pela ordem em que
     os itens entraram no array. Parece a mesma coisa porque quase sempre é: o
     registro nasce no fim da lista com a data de hoje. Mas o formulário de
     "registrar interação" deixa escolher a data, e uma ligação de mês passado
     anotada agora entraria no fim do array com data antiga — e apareceria no
     TOPO da linha do tempo, dizendo que foi a última coisa que aconteceu.
     `em` desempata dois itens do mesmo dia sem hora. */
  function interacoesEmOrdem(r) {
    return M().interacoesDe(r).slice().sort((a, b) => {
      const x = (a.data || '') + (a.hora || '') + String(a.em || '');
      const y = (b.data || '') + (b.hora || '') + String(b.em || '');
      return y.localeCompare(x);
    });
  }

  function abaVisao(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('h2', { cls: 'cli-painel-tit',
      texto: t('cli.recentHistory', 'Histórico recente') }));
    const inter = interacoesEmOrdem(r).slice(0, 5);
    if (!inter.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noActivityLogged', 'Nenhuma atividade registrada.') }));
    } else {
      cx.appendChild(linhaDoTempo(r, inter));
    }
    /* A nota fixa nao se repete aqui: ela tem aba propria agora, e o mesmo
       texto em dois lugares faz a pessoa duvidar de qual e o de verdade. */
    cx.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-largo',
      attrs: { type: 'button' }, texto: t('cli.logInteraction', 'Registrar interação'),
      onClick: () => registrarInteracaoManual(r) }));
    return cx;
  }

  /* ── Interações ─────────────────────────────────────────────────────── */
  function abaInteracoes(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.tabTimeline', 'Interações') }),
      el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
        texto: t('cli.logInteraction', 'Registrar interação'),
        onClick: () => registrarInteracaoManual(r) }),
    ]));

    const filtros = el('div', { cls: 'cli-filtro-pilulas' });
    const opcoes = [{ key: '', i18n: 'cli.allTypes2', pt: 'Todos' }]
      .concat(global.CLI_TIPOS_INTERACAO || []);
    opcoes.forEach(o => {
      const sel = M().S.filtroInteracao === o.key;
      filtros.appendChild(el('button', {
        cls: 'cli-pilula' + (sel ? ' sel' : ''), attrs: { type: 'button' },
        texto: t(o.i18n, o.pt),
        onClick: () => { M().S.filtroInteracao = o.key; pintarAba(r); },
      }));
    });
    cx.appendChild(filtros);

    /* Do mais recente para o mais antigo: a última coisa que aconteceu é a
       que responde "em que pé estamos". */
    let itens = interacoesEmOrdem(r);
    if (M().S.filtroInteracao) itens = itens.filter(i => i.tipo === M().S.filtroInteracao);

    if (!itens.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noActivityLogged', 'Nenhuma atividade registrada.') }));
    } else {
      cx.appendChild(linhaDoTempo(r, itens));
    }
    return cx;
  }

  function linhaDoTempo(r, itens) {
    const lista = el('div', { cls: 'cli-tempo' });
    itens.forEach(i => {
      const def = (global.CLI_TIPOS_INTERACAO || []).find(x => x.key === i.tipo)
        || { ico: 'note', i18n: '', pt: i.tipo };
      const item = el('div', { cls: 'cli-tempo-item' });
      item.appendChild(el('span', { cls: 'cli-tempo-ico', html: svg(def.ico, 13) }));
      const txt = el('div', { cls: 'cli-tempo-txt' });
      txt.appendChild(el('div', { cls: 'cli-tempo-cab' }, [
        el('span', { cls: 'cli-tempo-tipo', texto: t(def.i18n, def.pt) }),
        el('span', { cls: 'cli-tempo-quando',
          texto: (i.data ? M().fmtData(i.data) : '') + (i.hora ? ' · ' + i.hora : '') }),
      ]));
      if (i.texto) txt.appendChild(el('div', { cls: 'cli-tempo-corpo', texto: i.texto }));
      if (i.autor) txt.appendChild(el('div', { cls: 'cli-tempo-autor',
        texto: t('cli.by', 'por {n}', { n: i.autor }) }));
      item.appendChild(txt);
      /* EXCLUIR A ENTRADA. Faltava: dava para registrar uma tarefa, uma
         ligacao ou uma nota e nao dava para tirar — nem a que nasceu de um
         dedo errado. O que o sistema escreveu sozinho (mudanca de status,
         documento anexado) tambem sai, porque e historico de quem usa, e nao
         registro contabil. */
      item.appendChild(el('button', {
        cls: 'cli-tempo-x', attrs: { type: 'button',
          title: t('cli.deleteEntry', 'Excluir esta entrada'),
          'aria-label': t('cli.deleteEntry', 'Excluir esta entrada') },
        texto: '✕', onClick: () => excluirInteracao(r, i),
      }));
      lista.appendChild(item);
    });
    return lista;
  }

  function excluirInteracao(r, i) {
    _confirmarPerigo({
      icone: '🗑',
      titulo: t('cli.deleteEntryQ', 'Excluir esta entrada?'),
      texto: t('cli.deleteEntryDesc',
        'Ela sai da linha do tempo deste cliente e nao volta.'),
      confirmar: t('cli.delete', 'Excluir'),
      aoConfirmar: async () => {
        const lista = M().interacoesDe(r).filter(x => x.id !== i.id);
        await updateRecord(r.id, { interactions: lista });
        atualizar();
      },
    });
  }

  function registrarInteracaoManual(r) {
    document.querySelector('.cli-int-bg')?.remove();
    const bg = el('div', { cls: 'modal-bg cli-int-bg' });
    const cx = el('div', { cls: 'modal cli-pedir' });
    cx.appendChild(el('div', { cls: 'm-h1', texto: t('cli.logInteraction', 'Registrar interação') }));

    cx.appendChild(el('label', { cls: 'crm-modal-lbl', texto: t('cli.type', 'Tipo'),
      attrs: { for: 'cli-int-tipo' } }));
    const sel = el('select', { cls: 'm-inp', id: 'cli-int-tipo' });
    (global.CLI_TIPOS_INTERACAO || []).forEach(o =>
      sel.appendChild(el('option', { texto: t(o.i18n, o.pt), attrs: { value: o.key } })));
    cx.appendChild(sel);

    const linha = el('div', { cls: 'crm-modal-row' });
    const colD = el('div', { cls: 'crm-modal-col' }, [
      el('label', { cls: 'crm-modal-lbl', texto: t('cli.date', 'Data'),
        attrs: { for: 'cli-int-data' } }),
    ]);
    const data = el('input', { cls: 'm-inp', id: 'cli-int-data',
      attrs: { type: 'date', value: M().hojeIso() } });
    colD.appendChild(data);
    const colH = el('div', { cls: 'crm-modal-col' }, [
      el('label', { cls: 'crm-modal-lbl', texto: t('cli.time', 'Horário'),
        attrs: { for: 'cli-int-hora' } }),
    ]);
    const hora = el('input', { cls: 'm-inp', id: 'cli-int-hora', attrs: { type: 'time' } });
    colH.appendChild(hora);
    linha.appendChild(colD); linha.appendChild(colH);
    cx.appendChild(linha);

    cx.appendChild(el('label', { cls: 'crm-modal-lbl', texto: t('cli.whatHappened', 'O que aconteceu'),
      attrs: { for: 'cli-int-txt' } }));
    const txt = el('textarea', { cls: 'm-inp cli-area', id: 'cli-int-txt',
      attrs: { maxlength: '600', rows: '3' } });
    cx.appendChild(txt);

    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.save', 'Salvar'), onClick: async () => {
          bg.remove();
          const nova = {
            id: 'int_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            tipo: sel.value, data: M().ehIso(data.value) ? data.value : M().hojeIso(),
            hora: hora.value || '',
            autor: (typeof CU !== 'undefined' && CU) ? (CU.username || CU.uid || '') : '',
            texto: txt.value.trim(), em: Date.now(),
          };
          const lista = M().interacoesDe(r).concat([nova]).slice(-200);
          await updateRecord(r.id, { interactions: lista, lastContactAt: nova.data });
          atualizar();
        } }),
    ]));
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  /* ── Atividades ───────────────────────────────────────────────────────
     Compromissos do calendário e o que foi registrado como tarefa. Ao
     contrário da aba de interações, aqui o eixo é o ESTADO: o que ainda vai
     acontecer, o que passou e o que ficou para trás. */
  function abaAtividades(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('h2', { cls: 'cli-painel-tit', texto: t('cli.tabActivity', 'Atividades') }));

    const filtros = el('div', { cls: 'cli-filtro-pilulas' });
    [
      { key: 'todas',      i18n: 'cli.fAll',       pt: 'Todas' },
      { key: 'pendentes',  i18n: 'cli.fPending',   pt: 'Pendentes' },
      { key: 'futuras',    i18n: 'cli.fFuture',    pt: 'Futuras' },
      { key: 'atrasadas',  i18n: 'cli.fLate2',     pt: 'Atrasadas' },
      { key: 'concluidas', i18n: 'cli.fDone',      pt: 'Concluídas' },
    ].forEach(o => {
      const sel = M().S.filtroAtividade === o.key;
      filtros.appendChild(el('button', {
        cls: 'cli-pilula' + (sel ? ' sel' : ''), attrs: { type: 'button' },
        texto: t(o.i18n, o.pt),
        onClick: () => { M().S.filtroAtividade = o.key; pintarAba(r); },
      }));
    });
    cx.appendChild(filtros);

    const hoje = M().hojeIso();
    const marcados = M().acompanhamentos(r).map(a => ({
      titulo: a.titulo || '', data: a.data, hora: a.hora || '',
      estado: a.data < hoje ? 'atrasada' : 'futura', tipo: 'evento',
    }));
    const feitas = M().interacoesDe(r)
      .filter(i => i.tipo === 'tarefa' || i.tipo === 'reuniao')
      .map(i => ({ titulo: i.texto || '', data: i.data, hora: i.hora || '',
        estado: 'concluida', tipo: i.tipo }));

    let itens = marcados.concat(feitas);
    const f = M().S.filtroAtividade;
    if (f === 'pendentes')  itens = itens.filter(i => i.estado !== 'concluida');
    if (f === 'futuras')    itens = itens.filter(i => i.estado === 'futura');
    if (f === 'atrasadas')  itens = itens.filter(i => i.estado === 'atrasada');
    if (f === 'concluidas') itens = itens.filter(i => i.estado === 'concluida');
    itens.sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));

    if (!itens.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noActivities', 'Nenhuma atividade neste filtro.') }));
      return cx;
    }

    const lista = el('div', { cls: 'cli-ativs' });
    itens.forEach(i => {
      const item = el('div', { cls: 'cli-ativ cli-ativ-' + i.estado });
      item.appendChild(el('span', { cls: 'cli-ativ-ponto' }));
      item.appendChild(el('div', {}, [
        el('div', { cls: 'cli-ativ-tit', texto: i.titulo }),
        el('div', { cls: 'cli-ativ-sub',
          texto: (i.data ? M().fmtData(i.data) : '') + (i.hora ? ' · ' + i.hora : '')
            + ' · ' + rotuloEstado(i.estado) }),
      ]));
      lista.appendChild(item);
    });
    cx.appendChild(lista);
    return cx;
  }

  function rotuloEstado(e) {
    if (e === 'concluida') return t('cli.stDone', 'concluída');
    if (e === 'atrasada')  return t('cli.stLate', 'atrasada');
    return t('cli.stFuture', 'futura');
  }

  /* ── Observações do cliente ───────────────────────────────────────────
     O lugar de escrever à mão sobre o cliente, datado. É outra coisa que a
     aba de Interações: lá fica o que ACONTECEU, e boa parte é escrita pelo
     próprio sistema (mudou de status, anexou documento, agendou). Aqui fica
     o que a pessoa PENSA — "não gosta de reunião antes das 10", "pediu para
     só falarmos depois do balanço".

     No topo, a nota fixa: o que vale sempre, sem data, e que se quer ler
     antes de qualquer conversa. Abaixo, as entradas datadas, da mais recente
     para a mais antiga. */
  function abaObservacoes(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.tabNotes', 'Observações') }),
      el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
        html: svg('plus', 13) + '<span>' + t('cli.newNote', 'Nova observação') + '</span>',
        onClick: () => editarObservacao(r, null) }),
    ]));

    // ── Nota fixa ──
    const fixa = el('div', { cls: 'cli-obs-fixa' + (r.internalNotes ? '' : ' vazia') });
    fixa.appendChild(el('div', { cls: 'cli-obs-fixa-cab' }, [
      el('span', { cls: 'cli-obs-fixa-rot', html: svg('flag', 12)
        + '<span>' + t('cli.pinnedNote', 'Nota fixa') + '</span>' }),
      el('button', { cls: 'cli-obs-editar', attrs: { type: 'button' },
        texto: r.internalNotes ? t('cli.edit', 'Editar') : t('cli.write', 'Escrever'),
        onClick: () => editarNotaFixa(r) }),
    ]));
    fixa.appendChild(el('p', { cls: 'cli-obs-fixa-txt',
      texto: r.internalNotes || t('cli.pinnedHint',
        'O que vale sempre para este cliente, e que você quer ler antes de qualquer conversa.') }));
    cx.appendChild(fixa);

    // ── Entradas datadas ──
    const lista = observacoesEmOrdem(r);
    if (!lista.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noNotes', 'Nenhuma observação escrita ainda.') }));
      return cx;
    }

    const caixa = el('div', { cls: 'cli-obs-lista' });
    lista.forEach(o => {
      const item = el('div', { cls: 'cli-obs' });
      /* O cabecalho tem a mesma forma do da nota fixa: rotulo a esquerda,
         acoes a direita. Aqui o rotulo e a data, que e o que identifica a
         entrada. */
      item.appendChild(el('div', { cls: 'cli-obs-data' }, [
        el('span', { cls: 'cli-obs-dia' }, [
          el('span', { texto: M().fmtData(o.data) }),
          o.autor ? el('span', { cls: 'cli-obs-autor',
            texto: t('cli.by', 'por {n}', { n: o.autor }) }) : null,
        ]),
      ]));
      item.appendChild(el('p', { cls: 'cli-obs-txt', texto: o.texto }));
      const acoes = el('div', { cls: 'cli-obs-acoes' });
      acoes.appendChild(el('button', { cls: 'cli-obs-editar', attrs: { type: 'button' },
        texto: t('cli.edit', 'Editar'), onClick: () => editarObservacao(r, o) }));
      acoes.appendChild(el('button', { cls: 'cli-obs-editar perigo', attrs: { type: 'button' },
        texto: t('cli.delete', 'Excluir'), onClick: () => excluirObservacao(r, o) }));
      item.querySelector('.cli-obs-data').appendChild(acoes);
      caixa.appendChild(item);
    });
    cx.appendChild(caixa);
    return cx;
  }

  /* Da mais recente para a mais antiga, pela DATA escolhida — e não pela
     ordem de digitação. Quem anota hoje uma conversa de semana passada põe a
     data daquele dia, e a entrada tem de cair no lugar dela. */
  function observacoesEmOrdem(r) {
    const lista = Array.isArray(r && r.observations) ? r.observations.slice() : [];
    return lista.sort((a, b) => {
      const x = (a.data || '') + String(a.em || '');
      const y = (b.data || '') + String(b.em || '');
      return y.localeCompare(x);
    });
  }

  function editarObservacao(r, obs) {
    document.querySelector('.cli-obs-bg')?.remove();
    const bg = el('div', { cls: 'modal-bg cli-obs-bg' });
    const cx = el('div', { cls: 'modal cli-pedir' });
    cx.appendChild(el('div', { cls: 'm-h1', texto: obs
      ? t('cli.editNote', 'Editar observação') : t('cli.newNote', 'Nova observação') }));

    cx.appendChild(el('label', { cls: 'crm-modal-lbl', texto: t('cli.date', 'Data'),
      attrs: { for: 'cli-obs-data' } }));
    const data = el('input', { cls: 'm-inp', id: 'cli-obs-data', attrs: {
      type: 'date', value: (obs && obs.data) || M().hojeIso() } });
    cx.appendChild(data);

    cx.appendChild(el('label', { cls: 'crm-modal-lbl',
      texto: t('cli.noteAbout', 'A observação'), attrs: { for: 'cli-obs-txt' } }));
    const txt = el('textarea', { cls: 'm-inp cli-area', id: 'cli-obs-txt',
      attrs: { maxlength: '1200', rows: '5',
        placeholder: t('cli.noteAboutHint',
          'Ex.: prefere ser chamada de manhã; nao decide sem o socio; pediu revisao do escopo antes de renovar') } });
    txt.value = (obs && obs.texto) || '';
    cx.appendChild(txt);

    const erro = el('div', { cls: 'campo-erro', style: 'display:none' });
    cx.appendChild(erro);

    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.save', 'Salvar'), onClick: async () => {
          const valor = txt.value.trim();
          if (!valor) {
            erro.textContent = t('cli.typeSomething', 'Escreva alguma coisa.');
            erro.style.display = ''; txt.focus(); return;
          }
          if (!M().ehIso(data.value)) {
            erro.textContent = t('cli.dateInvalid', 'Data inválida.');
            erro.style.display = ''; data.focus(); return;
          }
          bg.remove();
          const atuais = Array.isArray(r.observations) ? r.observations.slice() : [];
          if (obs) {
            const i = atuais.findIndex(x => x.id === obs.id);
            if (i !== -1) atuais[i] = Object.assign({}, atuais[i],
              { data: data.value, texto: valor });
          } else {
            atuais.push({
              id: 'obs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
              data: data.value, texto: valor,
              autor: (typeof CU !== 'undefined' && CU) ? (CU.username || CU.uid || '') : '',
              em: Date.now(),
            });
          }
          await updateRecord(r.id, { observations: atuais.slice(-200) });
          atualizar();
        } }),
    ]));
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    setTimeout(() => txt.focus(), 40);
  }

  function excluirObservacao(r, obs) {
    _confirmarPerigo({
      icone: '📝',
      titulo: t('cli.deleteNoteQ', 'Excluir esta observação?'),
      texto: t('cli.deleteNoteDesc', 'Ela sai do histórico deste cliente e não volta.'),
      confirmar: t('cli.delete', 'Excluir'),
      aoConfirmar: async () => {
        const atuais = (r.observations || []).filter(x => x.id !== obs.id);
        await updateRecord(r.id, { observations: atuais });
        atualizar();
      },
    });
  }

  function editarNotaFixa(r) {
    document.querySelector('.cli-obs-bg')?.remove();
    const bg = el('div', { cls: 'modal-bg cli-obs-bg' });
    const cx = el('div', { cls: 'modal cli-pedir' });
    cx.appendChild(el('div', { cls: 'm-h1', texto: t('cli.pinnedNote', 'Nota fixa') }));
    cx.appendChild(el('div', { cls: 'm-sub', texto: t('cli.pinnedHint',
      'O que vale sempre para este cliente, e que você quer ler antes de qualquer conversa.') }));
    const txt = el('textarea', { cls: 'm-inp cli-area', id: 'cli-fixa-txt',
      attrs: { maxlength: '2000', rows: '5' } });
    txt.value = r.internalNotes || '';
    cx.appendChild(txt);
    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.save', 'Salvar'), onClick: async () => {
          bg.remove();
          await updateRecord(r.id, { internalNotes: txt.value.trim() });
          atualizar();
        } }),
    ]));
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    setTimeout(() => txt.focus(), 40);
  }

  /* ── Processos (só advocacia) ─────────────────────────────────────────
     A aba só existe para o cliente de uma ficha jurídica. Numa ficha de
     nutricionista ela seria uma aba permanentemente vazia — e aba vazia
     ensina a ignorar as outras. */
  const ehJuridico = r => String((r && r.template) || '') === 'advocacia';

  function abaProcessos(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.tabCases', 'Processos') }),
      el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
        html: svg('plus', 13) + '<span>' + t('cli.newCase', 'Novo processo') + '</span>',
        onClick: () => editarProcesso(r, null) }),
    ]));

    const lista = (Array.isArray(r.processos) ? r.processos.slice() : [])
      /* Do prazo mais próximo para o mais distante: o que vence antes é o que
         precisa de atenção. Sem prazo vai para o fim — não é urgente, é
         indefinido. */
      .sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0;
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return a.prazo.localeCompare(b.prazo);
      });

    if (!lista.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noCases', 'Nenhum processo cadastrado para este cliente.') }));
      /* Semear a partir da ficha: o formulário já perguntou número, vara e
         parte contrária, e obrigar a redigitar o que a pessoa acabou de
         mandar é trabalho inventado. */
      if (podeSemearProcesso(r)) {
        cx.appendChild(el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-largo',
          attrs: { type: 'button' },
          texto: t('cli.caseFromForm', 'Criar a partir do que veio no formulário'),
          onClick: () => editarProcesso(r, semearProcesso(r)) }));
      }
      return cx;
    }

    const caixa = el('div', { cls: 'cli-processos' });
    lista.forEach(p => caixa.appendChild(linhaDeProcesso(r, p)));
    cx.appendChild(caixa);
    return cx;
  }

  const campoDaFicha = (r, k) => String(((r && r.campos) || {})[k] || '').trim();

  function podeSemearProcesso(r) {
    return !!(campoDaFicha(r, 'processo') || campoDaFicha(r, 'vara')
      || campoDaFicha(r, 'parte') || campoDaFicha(r, 'area'));
  }

  function semearProcesso(r) {
    return {
      id: '', numero: campoDaFicha(r, 'processo'), area: campoDaFicha(r, 'area'),
      vara: campoDaFicha(r, 'vara'), parte: campoDaFicha(r, 'parte'),
      fase: 'consulta', prazo: campoDaFicha(r, 'prazo'),
      audiencia: campoDaFicha(r, 'audiencia'), valor: 0, honorarios: 0,
      notas: campoDaFicha(r, 'relato'),
    };
  }

  function faseInfo(k) {
    const lista = global.CLI_FASES_PROCESSO || [];
    return lista.find(f => f.key === k) || lista[0] || { key: k, i18n: '', pt: k };
  }

  function linhaDeProcesso(r, p) {
    const hoje = M().hojeIso();
    const atrasado = p.prazo && p.prazo < hoje;
    const item = el('div', { cls: 'cli-proc' + (atrasado ? ' atrasado' : '') });

    const cab = el('div', { cls: 'cli-proc-cab' }, [
      el('span', { cls: 'cli-proc-num',
        texto: p.numero || t('cli.caseNoNumber', 'Sem número') }),
      el('span', { cls: 'cli-proc-fase', texto: t(faseInfo(p.fase).i18n, faseInfo(p.fase).pt) }),
    ]);
    const acoes = el('div', { cls: 'cli-obs-acoes' }, [
      el('button', { cls: 'cli-obs-editar', attrs: { type: 'button' },
        texto: t('cli.edit', 'Editar'), onClick: () => editarProcesso(r, p) }),
      el('button', { cls: 'cli-obs-editar perigo', attrs: { type: 'button' },
        texto: t('cli.delete', 'Excluir'), onClick: () => excluirProcesso(r, p) }),
    ]);
    cab.appendChild(acoes);
    item.appendChild(cab);

    const linha = (rot, val) => {
      if (!val) return;
      item.appendChild(el('div', { cls: 'cli-proc-linha' }, [
        el('span', { cls: 'cli-proc-rot', texto: rot }),
        el('span', { cls: 'cli-proc-val', texto: val }),
      ]));
    };
    linha(t('cli.caseArea', 'Área'), p.area);
    linha(t('cli.caseCourt', 'Vara / Foro'), p.vara);
    linha(t('cli.caseParty', 'Parte contrária'), p.parte);
    linha(t('cli.caseDeadline', 'Prazo'),
      p.prazo ? M().fmtData(p.prazo) + (atrasado ? ' · ' + t('cli.lateBy', 'atrasado') : '') : '');
    linha(t('cli.caseHearing', 'Próxima audiência'),
      p.audiencia ? M().fmtData(p.audiencia) : '');
    linha(t('cli.caseValue', 'Valor da causa'), p.valor ? fmtBRL(p.valor) : '');
    linha(t('cli.caseFees', 'Honorários'), p.honorarios ? fmtBRL(p.honorarios) : '');
    if (p.notas) item.appendChild(el('p', { cls: 'cli-proc-notas', texto: p.notas }));
    return item;
  }

  function editarProcesso(r, proc) {
    document.querySelector('.cli-proc-bg')?.remove();
    const p = proc || {};
    const bg = el('div', { cls: 'modal-bg cli-proc-bg' });
    const cx = el('div', { cls: 'modal cli-form' });
    cx.appendChild(el('div', { cls: 'cli-form-cab' }, [
      el('div', {}, [
        el('div', { cls: 'm-h1', texto: p.id
          ? t('cli.editCase', 'Editar processo') : t('cli.newCase', 'Novo processo') }),
        el('div', { cls: 'm-sub', texto: t('cli.caseSub',
          'O que o escritório acompanha. Prazo e audiência entram nos avisos do cliente.') }),
      ]),
      el('button', { cls: 'cli-fechar', attrs: { type: 'button',
        'aria-label': t('common.close', 'Fechar') }, texto: '✕',
        onClick: () => bg.remove() }),
    ]));

    const campos = {};
    const corpo = el('div', { cls: 'cli-form-corpo' });
    const campo = (chave, rotulo, valor, tipo, max) => {
      const id = 'cli-pc-' + chave;
      const inp = el('input', { cls: 'm-inp', id, attrs: {
        type: tipo || 'text', maxlength: String(max || 120), autocomplete: 'off' } });
      inp.value = String(valor == null ? '' : valor);
      campos[chave] = inp;
      return el('div', { cls: 'crm-modal-col' }, [
        el('label', { cls: 'crm-modal-lbl', texto: rotulo, attrs: { for: id } }), inp,
      ]);
    };
    const linha = (...cols) => el('div', { cls: 'crm-modal-row' }, cols);

    const sel = el('select', { cls: 'm-inp', id: 'cli-pc-fase' });
    (global.CLI_FASES_PROCESSO || []).forEach(f => {
      const op = el('option', { texto: t(f.i18n, f.pt), attrs: { value: f.key } });
      if ((p.fase || 'consulta') === f.key) op.setAttribute('selected', 'selected');
      sel.appendChild(op);
    });
    campos.fase = sel;

    corpo.appendChild(linha(
      campo('numero', t('cli.caseNumber', 'Número do processo'), p.numero, 'text', 40),
      el('div', { cls: 'crm-modal-col' }, [
        el('label', { cls: 'crm-modal-lbl', texto: t('cli.casePhase', 'Fase'),
          attrs: { for: 'cli-pc-fase' } }), sel,
      ])));
    corpo.appendChild(linha(
      campo('area', t('cli.caseArea', 'Área'), p.area, 'text', 80),
      campo('vara', t('cli.caseCourt', 'Vara / Foro'), p.vara, 'text', 120)));
    corpo.appendChild(linha(
      campo('parte', t('cli.caseParty', 'Parte contrária'), p.parte, 'text', 120),
      campo('prazo', t('cli.caseDeadline', 'Prazo'), p.prazo, 'date')));
    corpo.appendChild(linha(
      campo('audiencia', t('cli.caseHearing', 'Próxima audiência'), p.audiencia, 'date'),
      campo('valor', t('cli.caseValue', 'Valor da causa'), p.valor || '', 'number')));
    corpo.appendChild(linha(
      campo('honorarios', t('cli.caseFees', 'Honorários'), p.honorarios || '', 'number')));

    const notas = el('textarea', { cls: 'm-inp cli-area', id: 'cli-pc-notas',
      attrs: { maxlength: '2000', rows: '4' } });
    notas.value = p.notas || '';
    campos.notas = notas;
    corpo.appendChild(el('div', { cls: 'crm-modal-col' }, [
      el('label', { cls: 'crm-modal-lbl', texto: t('cli.caseNotes', 'Andamento e observações'),
        attrs: { for: 'cli-pc-notas' } }), notas,
    ]));
    cx.appendChild(corpo);

    const erro = el('div', { cls: 'campo-erro', style: 'display:none' });
    cx.appendChild(erro);

    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: t('cli.save', 'Salvar'), onClick: async () => {
          /* Ao menos uma identificação: um processo sem número, sem área e sem
             vara é uma linha em branco na lista. */
          if (!campos.numero.value.trim() && !campos.area.value.trim()
              && !campos.vara.value.trim()) {
            erro.textContent = t('cli.caseNeedsSomething',
              'Informe ao menos o número, a área ou a vara.');
            erro.style.display = '';
            campos.numero.focus();
            return;
          }
          bg.remove();
          const atuais = Array.isArray(r.processos) ? r.processos.slice() : [];
          const dados = {
            id: p.id || ('proc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
            numero: campos.numero.value.trim(), area: campos.area.value.trim(),
            vara: campos.vara.value.trim(), parte: campos.parte.value.trim(),
            fase: campos.fase.value, prazo: campos.prazo.value,
            audiencia: campos.audiencia.value,
            valor: Number(campos.valor.value) || 0,
            honorarios: Number(campos.honorarios.value) || 0,
            notas: campos.notas.value.trim(), em: p.em || Date.now(),
          };
          const i = atuais.findIndex(x => x.id === dados.id);
          if (i === -1) atuais.push(dados); else atuais[i] = dados;
          await updateRecord(r.id, { processos: atuais.slice(-60) });
          atualizar();
        } }),
    ]));
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    setTimeout(() => campos.numero.focus(), 50);
  }

  function excluirProcesso(r, p) {
    _confirmarPerigo({
      icone: '⚖',
      titulo: t('cli.deleteCaseQ', 'Excluir este processo?'),
      texto: t('cli.deleteCaseDesc',
        'O acompanhamento dele sai da ficha deste cliente e não volta.'),
      confirmar: t('cli.delete', 'Excluir'),
      aoConfirmar: async () => {
        const atuais = (r.processos || []).filter(x => x.id !== p.id);
        await updateRecord(r.id, { processos: atuais });
        atualizar();
      },
    });
  }

  /* ── Documentos ───────────────────────────────────────────────────────
     Reusa o anexo que a ficha já tem: mesmo campo, mesma validação de tipo e
     tamanho, mesmo visualizador. Nada de um segundo lugar para guardar
     arquivo do mesmo cliente. */
  function abaDocumentos(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.tabDocs', 'Documentos') }),
      el('label', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq cli-arquivo',
        texto: t('cli.uploadDoc', 'Enviar arquivo') }, [criarInputArquivo(r)]),
    ]));

    const docs = Array.isArray(r.documents) ? r.documents : [];
    if (!docs.length) {
      cx.appendChild(el('div', { cls: 'cli-lado-vazio',
        texto: t('cli.noDocs', 'Nenhum documento vinculado.') }));
      return cx;
    }

    const lista = el('div', { cls: 'cli-docs' });
    docs.forEach((d, i) => {
      const item = el('div', { cls: 'cli-doc' });
      item.appendChild(el('span', { cls: 'cli-doc-ico', html: svg('file', 15) }));
      const txt = el('div', { cls: 'cli-doc-txt' });
      const nome = el('button', { cls: 'cli-doc-nome', attrs: { type: 'button',
        title: t('app.clickToView', 'Clique para visualizar') }, texto: d.name || '' });
      nome.addEventListener('click', () => {
        if (typeof viewDocumentFile === 'function') viewDocumentFile(d);
      });
      txt.appendChild(nome);
      txt.appendChild(el('div', { cls: 'cli-doc-sub',
        texto: ((Number(d.size) || 0) / 1024).toFixed(0) + ' KB'
          + (d.descricao ? ' · ' + d.descricao : '') }));
      item.appendChild(txt);

      const btn = el('button', { cls: 'cli-acoes-btn', attrs: { type: 'button',
        'aria-label': t('cli.docActions', 'Ações do documento') }, html: svg('dots', 15) });
      btn.addEventListener('click', () => _cdashMenu(btn, [
        { label: t('cli.docView', 'Visualizar'),
          onClick: () => { if (typeof viewDocumentFile === 'function') viewDocumentFile(d); } },
        { label: t('cli.docRename', 'Renomear'), onClick: () => renomearDoc(r, i) },
        { label: t('cli.docDescribe', 'Adicionar descrição'), onClick: () => descreverDoc(r, i) },
        { label: t('cli.docRemove', 'Remover'), danger: true, onClick: () => removerDoc(r, i) },
      ]));
      item.appendChild(btn);
      lista.appendChild(item);
    });
    cx.appendChild(lista);
    return cx;
  }

  function criarInputArquivo(r) {
    const inp = el('input', { attrs: { type: 'file', multiple: 'multiple' },
      style: 'display:none' });
    inp.addEventListener('change', async function () {
      const atuais = Array.isArray(r.documents) ? r.documents.slice() : [];
      for (const f of Array.from(this.files || [])) {
        /* As mesmas travas do resto do app: limite do plano e tipo permitido.
           Um caminho novo de upload sem elas seria a porta dos fundos. */
        if (typeof podeSubirArquivo === 'function') {
          const v = podeSubirArquivo(f);
          if (!v.ok) {
            toast('⚠', v.motivo);
            if (v.oferecerPremium && typeof showPremiumModal === 'function') showPremiumModal();
            continue;
          }
        }
        if (typeof safeFileType === 'function' && !safeFileType(f)) {
          if (typeof avisarArquivoRecusado === 'function') avisarArquivoRecusado(f);
          continue;
        }
        const dataUrl = await new Promise(ok => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result);
          fr.onerror = () => ok('');
          fr.readAsDataURL(f);
        });
        if (!dataUrl) continue;
        atuais.push({ name: f.name, size: f.size, type: f.type, data: dataUrl });
      }
      this.value = '';
      await updateRecord(r.id, { documents: atuais });
      await registrar(r, 'documento', t('cli.docAdded', 'Documento anexado'));
      atualizar();
    });
    return inp;
  }

  function renomearDoc(r, i) {
    _pedirTexto({
      titulo: t('cli.docRename', 'Renomear'), rotulo: t('cli.docName', 'Nome do arquivo'),
      dica: '', max: 120,
      aoConfirmar: async v => {
        const docs = (r.documents || []).slice();
        if (!docs[i]) return;
        docs[i] = Object.assign({}, docs[i], { name: v });
        await updateRecord(r.id, { documents: docs });
        atualizar();
      },
    });
  }

  function descreverDoc(r, i) {
    _pedirTexto({
      titulo: t('cli.docDescribe', 'Adicionar descrição'),
      rotulo: t('cli.docDesc', 'Descrição'), dica: '', max: 200,
      aoConfirmar: async v => {
        const docs = (r.documents || []).slice();
        if (!docs[i]) return;
        docs[i] = Object.assign({}, docs[i], { descricao: v });
        await updateRecord(r.id, { documents: docs });
        atualizar();
      },
    });
  }

  function removerDoc(r, i) {
    const doc = (r.documents || [])[i];
    if (!doc) return;
    _confirmarPerigo({
      icone: '📄',
      titulo: t('cli.docRemoveQ', 'Remover "{n}"?', { n: doc.name || '' }),
      texto: t('cli.docRemoveDesc', 'O arquivo sai da ficha deste cliente.'),
      confirmar: t('cli.docRemove', 'Remover'),
      aoConfirmar: async () => {
        const docs = (r.documents || []).slice();
        docs.splice(i, 1);
        await updateRecord(r.id, { documents: docs });
        atualizar();
      },
    });
  }

  /* ── Dados do cliente ─────────────────────────────────────────────── */
  function abaDados(r) {
    const cx = el('div', { cls: 'cli-painel' });
    cx.appendChild(el('div', { cls: 'cli-painel-cab' }, [
      el('h2', { cls: 'cli-painel-tit', texto: t('cli.tabData', 'Dados do cliente') }),
      el('button', { cls: 'cli-btn cli-btn-fantasma cli-btn-peq', attrs: { type: 'button' },
        html: svg('edit', 13) + '<span>' + t('cli.editClient', 'Editar cliente') + '</span>',
        onClick: () => abrirFormulario(r) }),
    ]));

    const grade = el('div', { cls: 'cli-dados' });
    /* Campo sem valor mostra "Não informado", e nunca some: a ausência é
       informação — mostra o que falta preencher. E nunca undefined. */
    const linha = (rot, val) => grade.appendChild(el('div', { cls: 'cli-dado' }, [
      el('span', { cls: 'cli-dado-rot', texto: rot }),
      el('span', { cls: 'cli-dado-val' + (val ? '' : ' vazio'),
        texto: val || t('cli.notInformed', 'Não informado') }),
    ]));

    linha(t('cli.name', 'Nome'), r.name || '');
    linha(t('cli.company', 'Empresa'), r.companyName || '');
    linha(t('cli.clientType', 'Tipo'), r.clientType
      ? M().rotuloDe(global.CLI_TIPOS, r.clientType) : '');
    linha(t('cli.contact', 'Contato principal'), M().contatoDe(r));
    linha('CPF', r.cpf || '');
    linha('CNPJ', (r.company && r.company.cnpj) || r.cnpj || '');
    linha(t('cli.email', 'E-mail'), M().emailDe(r));
    linha(t('cli.phone', 'Telefone'), M().telDe(r));
    linha('CEP', r.cep || '');
    linha(t('cli.address', 'Endereço'), r.address || '');
    linha(t('cli.city', 'Cidade'), r.city || '');
    linha(t('cli.state', 'Estado'), r.uf || '');
    linha(t('cli.colSegment', 'Segmento'), M().segmentoDe(r)
      ? M().rotuloDe(global.CLI_SEGMENTOS, M().segmentoDe(r)) : '');
    linha(t('cli.colStatus', 'Status'),
      t(M().statusInfo(M().statusDe(r)).i18n, M().statusInfo(M().statusDe(r)).pt));
    linha(t('cli.origin', 'Origem'), M().origemDe(r)
      ? M().rotuloDe(global.CLI_ORIGENS, M().origemDe(r)) : '');
    linha(t('cli.colOwner', 'Responsável'), M().responsavelDe(r));
    linha(t('cli.priority', 'Prioridade'), M().rotuloDe(global.CLI_PRIORIDADES, M().prioridadeDe(r)));
    linha(t('cli.colTags', 'Tags'), M().tagsDe(r).join(', '));
    linha(t('cli.description', 'Descrição'), r.description || '');
    linha(t('cli.registeredOn', 'Data de cadastro'), M().fmtData(M().cadastroEm(r)));
    linha(t('cli.colLast', 'Último contato'), M().fmtData(M().ultimoContato(r)));
    linha(t('cli.colNext', 'Próximo contato'), M().fmtData(M().proximoContato(r)));
    cx.appendChild(grade);
    return cx;
  }
  /* ═════════════════════════════════════════════════════════════════════
     CADASTRO E EDIÇÃO
     ═════════════════════════════════════════════════════════════════════
     Nenhum campo é obrigatório além do nome. Exigir CNPJ de quem está
     anotando um contato de corredor faz a pessoa inventar um número — e um
     campo com dado inventado é pior do que um campo vazio.
     O que é validado é o FORMATO do que foi preenchido: e-mail que não é
     e-mail, CPF que não fecha o dígito. Vazio passa. */
  function abrirFormulario(rec) {
    document.querySelector('.cli-form-bg')?.remove();
    const editando = !!(rec && rec.id);
    const v = rec || {};

    const bg = el('div', { cls: 'modal-bg cli-form-bg' });
    const cx = el('div', { cls: 'modal cli-form' });

    cx.appendChild(el('div', { cls: 'cli-form-cab' }, [
      el('div', {}, [
        el('div', { cls: 'm-h1', texto: editando
          ? t('cli.editClient', 'Editar cliente') : t('cli.newClient', 'Novo cliente') }),
        el('div', { cls: 'm-sub', texto: t('cli.formSub',
          'Só o nome é obrigatório. O resto pode entrar depois, conforme a relação avança.') }),
      ]),
      el('button', { cls: 'cli-fechar', attrs: { type: 'button',
        'aria-label': t('common.close', 'Fechar') }, texto: '✕',
        onClick: () => bg.remove() }),
    ]));

    const campos = {};
    const corpo = el('div', { cls: 'cli-form-corpo' });

    function texto(chave, rotulo, opcoes) {
      const o = opcoes || {};
      const id = 'cli-c-' + chave;
      const inp = el(o.area ? 'textarea' : 'input', {
        cls: 'm-inp' + (o.area ? ' cli-area' : ''), id,
        attrs: Object.assign({
          maxlength: String(o.max || 120), autocomplete: 'off',
        }, o.area ? { rows: String(o.linhas || 3) } : { type: o.tipo || 'text' },
          o.dica ? { placeholder: o.dica } : {}),
      });
      if (o.area) inp.value = String(o.valor || '');
      else inp.setAttribute('value', String(o.valor || ''));
      inp.value = String(o.valor || '');
      campos[chave] = inp;
      const bloco = el('div', { cls: 'crm-modal-col' }, [
        el('label', { cls: 'crm-modal-lbl', texto: rotulo, attrs: { for: id } }),
        inp,
        el('div', { cls: 'campo-erro', id: id + '-erro', style: 'display:none' }),
      ]);
      return bloco;
    }

    function escolha(chave, rotulo, lista, valor, vazio) {
      const id = 'cli-c-' + chave;
      const sel = el('select', { cls: 'm-inp', id });
      if (vazio !== false) sel.appendChild(el('option', { texto: vazio || '—', attrs: { value: '' } }));
      lista.forEach(o => {
        const op = el('option', { texto: t(o.i18n, o.pt), attrs: { value: o.key } });
        if (String(valor) === o.key) op.setAttribute('selected', 'selected');
        sel.appendChild(op);
      });
      campos[chave] = sel;
      return el('div', { cls: 'crm-modal-col' }, [
        el('label', { cls: 'crm-modal-lbl', texto: rotulo, attrs: { for: id } }),
        sel,
      ]);
    }

    const linha = (...cols) => el('div', { cls: 'crm-modal-row' }, cols);

    corpo.appendChild(linha(
      escolha('clientType', t('cli.clientType', 'Tipo de cliente'),
        global.CLI_TIPOS || [], v.clientType, t('cli.chooseType', 'Escolher')),
      texto('name', t('cli.name', 'Nome') + ' *', { valor: v.name || '', max: 120,
        dica: t('cli.nameHint', 'Como você chama este cliente') })));

    corpo.appendChild(linha(
      texto('companyName', t('cli.company', 'Empresa'), { valor: v.companyName || '' }),
      texto('contactName', t('cli.contact', 'Contato principal'), { valor: v.contactName || '' })));

    corpo.appendChild(linha(
      texto('email', t('cli.email', 'E-mail'), { valor: v.email || '', tipo: 'email', max: 120 }),
      texto('phone', t('cli.phone', 'Telefone'), { valor: v.phone || '', max: 24 })));

    corpo.appendChild(linha(
      texto('cpf', 'CPF', { valor: v.cpf || '', max: 18 }),
      texto('cnpj', 'CNPJ', { valor: (v.company && v.company.cnpj) || v.cnpj || '', max: 20 })));

    corpo.appendChild(linha(
      escolha('segment', t('cli.colSegment', 'Segmento'), global.CLI_SEGMENTOS || [],
        v.segment, t('cli.chooseSegment', 'Escolher')),
      texto('cep', 'CEP', { valor: v.cep || '', max: 10,
        dica: t('cli.cepHint', 'Preenche cidade e estado') })));

    corpo.appendChild(linha(
      texto('address', t('cli.address', 'Endereço'), { valor: v.address || '', max: 160 }),
      texto('city', t('cli.city', 'Cidade'), { valor: v.city || '', max: 80 })));

    corpo.appendChild(linha(
      texto('uf', t('cli.state', 'Estado'), { valor: v.uf || '', max: 2 }),
      escolha('relationshipStatus', t('cli.colStatus', 'Status'), global.CLI_STATUS || [],
        M().statusDe(v), false)));

    corpo.appendChild(linha(
      escolha('origin', t('cli.origin', 'Origem'), global.CLI_ORIGENS || [],
        v.origin, t('cli.chooseOrigin', 'Escolher')),
      texto('responsibleUserId', t('cli.colOwner', 'Responsável'),
        { valor: v.responsibleUserId || '', max: 64,
          dica: t('cli.ownerHint', 'Quem cuida desta conta') })));

    corpo.appendChild(linha(
      escolha('priority', t('cli.priority', 'Prioridade'), global.CLI_PRIORIDADES || [],
        M().prioridadeDe(v), false),
      texto('nextContactAt', t('cli.colNext', 'Próximo contato'),
        { valor: v.nextContactAt || '', tipo: 'date' })));

    corpo.appendChild(linha(
      texto('tags', t('cli.colTags', 'Tags'), { valor: M().tagsDe(v).join(', '), max: 300,
        dica: t('cli.tagsHint', 'Separe por vírgula') })));

    corpo.appendChild(linha(
      texto('lastContactAt', t('cli.colLast', 'Último contato'),
        { valor: v.lastContactAt || '', tipo: 'date' }),
      escolha('satisfaction', t('cli.satisfaction', 'Satisfação'), [
        { key: '5', i18n: 'cli.sat5', pt: '5 — ótima' },
        { key: '4', i18n: 'cli.sat4', pt: '4 — boa' },
        { key: '3', i18n: 'cli.sat3', pt: '3 — regular' },
        { key: '2', i18n: 'cli.sat2', pt: '2 — ruim' },
        { key: '1', i18n: 'cli.sat1', pt: '1 — péssima' },
      ], Number(v.satisfaction) ? String(Math.round(Number(v.satisfaction))) : '',
        t('cli.noRating', 'Sem avaliação'))));

    corpo.appendChild(linha(
      texto('description', t('cli.description', 'Descrição'),
        { valor: v.description || '', area: true, max: 600 })));

    /* A nota fixa e as observacoes datadas ficam na aba Observacoes, que e
       onde se escreve sobre o cliente. Aqui e o cadastro: repetir o campo nos
       dois lugares faria duas telas gravando o mesmo texto. */

    cx.appendChild(corpo);

    const erroGeral = el('div', { cls: 'campo-erro', style: 'display:none' });
    cx.appendChild(erroGeral);

    cx.appendChild(el('div', { cls: 'm-btns' }, [
      el('button', { cls: 'm-cancel', attrs: { type: 'button' },
        texto: t('app.cancel', 'Cancelar'), onClick: () => bg.remove() }),
      el('button', { cls: 'm-confirm', attrs: { type: 'button' },
        texto: editando ? t('cli.saveChanges', 'Salvar alterações')
                        : t('cli.createClient', 'Cadastrar cliente'),
        onClick: () => salvar() }),
    ]));

    /* CEP preenche cidade, estado e endereço. É o serviço que o projeto já
       usa; se ele não responder, nada trava — a pessoa digita. */
    campos.cep.addEventListener('blur', async () => {
      const cep = campos.cep.value.replace(/\D/g, '');
      if (cep.length !== 8 || !global.MyDeskBrasil) return;
      try {
        const r = await MyDeskBrasil.buscarCep(cep);
        if (r && r.localidade && !campos.city.value) campos.city.value = r.localidade;
        if (r && r.uf && !campos.uf.value) campos.uf.value = r.uf;
        if (r && r.logradouro && !campos.address.value) campos.address.value = r.logradouro;
      } catch (_) { /* silêncio: o CEP é conveniência, não requisito */ }
    });

    function marcarErro(chave, msg) {
      const alvo = document.getElementById('cli-c-' + chave + '-erro');
      if (alvo) { alvo.textContent = msg; alvo.style.display = ''; }
      campos[chave]?.classList.add('erro');
      campos[chave]?.focus();
    }

    function limparErros() {
      cx.querySelectorAll('.campo-erro').forEach(e => { e.style.display = 'none'; });
      cx.querySelectorAll('.m-inp.erro').forEach(e => e.classList.remove('erro'));
    }

    async function salvar() {
      limparErros();
      const nome = campos.name.value.trim();
      if (!nome) { marcarErro('name', t('cli.nameRequired', 'O nome é obrigatório.')); return; }

      const email = campos.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        marcarErro('email', t('cli.emailInvalid', 'E-mail inválido.')); return;
      }
      const fone = campos.phone.value.trim();
      if (fone && fone.replace(/\D/g, '').length < 8) {
        marcarErro('phone', t('cli.phoneInvalid', 'Telefone muito curto.')); return;
      }
      const cpf = campos.cpf.value.trim();
      if (cpf && global.MyDeskBrasil && !MyDeskBrasil.validarCpf(cpf)) {
        marcarErro('cpf', t('cli.cpfInvalid', 'CPF inválido.')); return;
      }
      const cnpj = campos.cnpj.value.trim();
      if (cnpj && global.MyDeskBrasil && !MyDeskBrasil.validarCnpj(cnpj)) {
        marcarErro('cnpj', t('cli.cnpjInvalid', 'CNPJ inválido.')); return;
      }
      const cep = campos.cep.value.trim();
      if (cep && cep.replace(/\D/g, '').length !== 8) {
        marcarErro('cep', t('cli.cepInvalid', 'CEP deve ter 8 dígitos.')); return;
      }
      const prox = campos.nextContactAt.value.trim();
      if (prox && !M().ehIso(prox)) {
        marcarErro('nextContactAt', t('cli.dateInvalid', 'Data inválida.')); return;
      }
      const ultimo = campos.lastContactAt.value.trim();
      if (ultimo && !M().ehIso(ultimo)) {
        marcarErro('lastContactAt', t('cli.dateInvalid', 'Data inválida.')); return;
      }
      /* Contato futuro nao e "ultimo contato": e compromisso, e o campo dele e
         o outro. Aceitar isso deixaria a coluna da tabela dizendo que a
         conversa aconteceu numa data que ainda nao chegou. */
      if (ultimo && ultimo > M().hojeIso()) {
        marcarErro('lastContactAt', t('cli.lastInFuture',
          'O último contato nao pode estar no futuro.')); return;
      }

      const dados = {
        name: nome,
        companyName: campos.companyName.value.trim(),
        contactName: campos.contactName.value.trim(),
        email, phone: fone, cpf, cep,
        address: campos.address.value.trim(),
        city: campos.city.value.trim(),
        uf: campos.uf.value.trim().toUpperCase().slice(0, 2),
        clientType: campos.clientType.value,
        segment: campos.segment.value,
        relationshipStatus: campos.relationshipStatus.value,
        origin: campos.origin.value,
        priority: campos.priority.value,
        responsibleUserId: campos.responsibleUserId.value.trim(),
        nextContactAt: prox,
        tags: campos.tags.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12),
        description: campos.description.value.trim(),
        lastContactAt: ultimo,
        satisfaction: Number(campos.satisfaction.value) || 0,
      };
      /* O CNPJ mora dentro de `company`, que é onde o resto do app já o
         procura. Guardá-lo solto criaria um segundo lugar para a mesma
         informação, e as duas telas discordariam na primeira edição. */
      if (cnpj) dados.company = Object.assign({}, v.company || {}, { cnpj });

      bg.remove();
      if (editando) {
        await updateRecord(v.id, dados);
        toast('✅', t('cli.saved', 'Cliente atualizado.'));
        atualizar();
      } else {
        const criado = await createRecord(dados);
        if (!criado) return;
        toast('✅', t('cli.created', 'Cliente cadastrado.'));
        /* Abrir o que acabou de nascer: quem cadastrou quer continuar nele —
           marcar o primeiro contato, anexar a proposta. */
        if (M().telaAtual() === 'detalhe') pintarDetalhe(criado.id);
        else { pintarLista(); abrirCliente(criado.id); }
      }
    }

    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    setTimeout(() => campos.name.focus(), 50);
  }

  /* ═════════════════════════════════════════════════════════════════════
     ROTA
     ═════════════════════════════════════════════════════════════════════
     `#clientes` e `#clientes/{id}`. O hash existe para uma coisa só: fazer o
     botão voltar do navegador significar "voltar para a lista". Sem ele, o
     voltar sairia do MyDesk inteiro depois de abrir um cliente — que é o
     comportamento que ninguém espera dentro de um aplicativo. */
  let _rotaFn = null;
  let _tecladoFn = null;
  let _ignorarRota = false;

  function idDaRota() {
    const h = String(global.location.hash || '');
    const m = h.match(/^#clientes\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function escreverRota(nova) {
    if (String(global.location.hash) === nova) return;
    _ignorarRota = true;
    try {
      if (global.history && global.history.pushState) {
        global.history.pushState({ cli: nova }, '', nova);
      } else {
        global.location.hash = nova;
      }
    } catch (_) { /* navegador sem History API: a tela funciona igual */ }
    setTimeout(() => { _ignorarRota = false; }, 0);
  }

  function limparRota() {
    if (!String(global.location.hash || '').startsWith('#clientes')) return;
    _ignorarRota = true;
    try {
      if (global.history && global.history.replaceState) {
        global.history.replaceState(null, '',
          global.location.pathname + global.location.search);
      } else {
        global.location.hash = '';
      }
    } catch (_) { /* navegador sem History API: o endereço fica, e o resto vale */ }
    setTimeout(() => { _ignorarRota = false; }, 0);
  }

  function ligarRota() {
    if (_ligado) return;
    _ligado = true;
    _rotaFn = () => {
      if (_ignorarRota) return;
      if (!M().ativo()) return;
      const id = idDaRota();
      if (id && String(id) !== String(_aberto)) abrirCliente(id, { semRota: true });
      else if (!id && _tela === 'detalhe') fecharDetalhe({ semRota: true });
    };
    global.addEventListener('popstate', _rotaFn);
    global.addEventListener('hashchange', _rotaFn);

    /* Esc volta para a lista — mas só quando não há nada aberto por cima. A
       página do cliente NÃO é modal: fechar por Esc com um formulário aberto
       fecharia a coisa errada. */
    _tecladoFn = ev => {
      if (ev.key !== 'Escape') return;
      if (!M().ativo() || _tela !== 'detalhe') return;
      if (document.querySelector('.modal-bg, .confirm-clear-pop, .cdash-menu')) return;
      fecharDetalhe();
    };
    document.addEventListener('keydown', _tecladoFn);
  }

  function desligarRota() {
    if (!_ligado) return;
    _ligado = false;
    if (_rotaFn) {
      global.removeEventListener('popstate', _rotaFn);
      global.removeEventListener('hashchange', _rotaFn);
    }
    if (_tecladoFn) document.removeEventListener('keydown', _tecladoFn);
    _rotaFn = null; _tecladoFn = null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     RELATÓRIO DA CARTEIRA
     ═════════════════════════════════════════════════════════════════════
     Só sobre clientes. Nada de dinheiro e nada de recrutamento: são outras
     duas leituras, e cada uma já tem o relatório dela. */
  function relatorioDeClientes() {
    const S = M().S;
    const r = M().resumo(S.periodo);
    const lista = M().carteira();
    const per = M().PERIODOS.find(p => p.key === S.periodo) || M().PERIODOS[0];

    document.querySelector('.cli-rel-bg')?.remove();
    const bg = el('div', { cls: 'modal-bg cli-rel-bg' });
    const cx = el('div', { cls: 'modal cli-rel' });
    cx.appendChild(el('div', { cls: 'cli-form-cab' }, [
      el('div', {}, [
        el('div', { cls: 'm-h1', texto: t('cli.reportTitle', 'Relatório da carteira') }),
        el('div', { cls: 'm-sub', texto: t(per.i18n, per.pt) }),
      ]),
      el('button', { cls: 'cli-fechar', attrs: { type: 'button',
        'aria-label': t('common.close', 'Fechar') }, texto: '✕',
        onClick: () => bg.remove() }),
    ]));

    const corpo = el('div', { cls: 'cli-rel-corpo' });
    const bloco = (titulo, linhas) => {
      corpo.appendChild(el('h3', { cls: 'cli-rel-tit', texto: titulo }));
      const caixa = el('div', { cls: 'cli-resumo' });
      linhas.forEach(([rot, val]) => caixa.appendChild(el('div', { cls: 'cli-resumo-linha' }, [
        el('span', { cls: 'cli-resumo-rot', texto: rot }),
        el('span', { cls: 'cli-resumo-val', texto: String(val) }),
      ])));
      corpo.appendChild(caixa);
    };

    bloco(t('cli.repGrowth', 'Crescimento da carteira'), [
      [t('cli.sumNew', 'Novos clientes'), r.novos],
      [t('cli.repTotal', 'Total na carteira'), r.total],
      [t('cli.sumActive', 'Clientes ativos'), r.ativos],
      [t('cli.sumInactive', 'Inativos'), r.inativos],
    ]);

    bloco(t('cli.repByStatus', 'Por status'),
      (global.CLI_STATUS || []).map(s => [t(s.i18n, s.pt), r.porStatus[s.key] || 0]));

    const porSeg = {};
    lista.forEach(c => {
      const k = M().segmentoDe(c) || 'outro';
      porSeg[k] = (porSeg[k] || 0) + 1;
    });
    bloco(t('cli.repBySegment', 'Por segmento'),
      Object.keys(porSeg).sort((a, b) => porSeg[b] - porSeg[a])
        .map(k => [M().rotuloDe(global.CLI_SEGMENTOS, k), porSeg[k]]));

    const interacoes = lista.reduce((s, c) => s + M().interacoesDe(c).length, 0);
    bloco(t('cli.repEngagement', 'Interações e acompanhamentos'), [
      [t('cli.repInteractions', 'Interações registradas'), interacoes],
      [t('cli.sumPending', 'Acompanhamentos pendentes'), r.pendentes],
      [t('cli.sumReturnRate', 'Taxa de retorno'),
        r.taxa === null ? t('cli.noData', 'sem dados') : r.taxa + '%'],
    ]);

    const porResp = {};
    lista.forEach(c => {
      const k = M().responsavelDe(c) || t('cli.noOwner', 'Sem responsável');
      porResp[k] = (porResp[k] || 0) + 1;
    });
    bloco(t('cli.repByOwner', 'Por responsável'),
      Object.keys(porResp).sort((a, b) => porResp[b] - porResp[a])
        .map(k => [k, porResp[k]]));

    cx.appendChild(corpo);
    bg.appendChild(cx);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  global.MD_CLI_TELA = {
    entrar, sair, atualizar, pintarLista, repintarTabela, limparFiltros,
    abrirCliente, fecharDetalhe, pintarDetalhe, abrirFormulario, abrirFiltros,
    relatorioDeClientes, registrar, idDaRota, ABAS, novoCliente,
    el, svg, ICO, iniciais, corDe, cssId, raiz, porId,
  };

  /* MD_CLI e MD_CLI_TELA sao o mesmo modelo partido em dois arquivos: um
     responde as perguntas, o outro desenha as respostas. Quem chama de fora
     (o app.js, ao trocar de modelo) nao precisa saber dessa divisao. */
  if (global.MD_CLI) {
    global.MD_CLI.entrar = entrar;
    global.MD_CLI.sair = sair;
    global.MD_CLI.atualizar = atualizar;
    global.MD_CLI.abrirCliente = abrirCliente;
    global.MD_CLI.telaAtual = () => _tela;
    global.MD_CLI.clienteAberto = () => _aberto;
  }

})(typeof window !== 'undefined' ? window : globalThis);
