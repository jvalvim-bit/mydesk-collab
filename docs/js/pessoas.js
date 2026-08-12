'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   DEPOIS DO FUNIL: A PROPOSTA, A ADMISSÃO E O QUADRO DE GENTE
   ═══════════════════════════════════════════════════════════════════════
   O funil terminava em "Admissão" e parava ali. O que acontece depois de
   alguém aceitar — o que a proposta dizia, quando foi enviada, o que falta
   para a pessoa começar, e ela finalmente virando parte do time — não tinha
   onde morar. Quem contratou reabria a ficha do candidato meses depois para
   lembrar o salário combinado.

   Duas telas, as duas 1:1 com os conceitos que ela desenhou:

   PROPOSTA E ADMISSÃO (uma pessoa): o resumo do que foi oferecido, o
   histórico da proposta carimbado etapa por etapa, e o checklist de admissão
   com responsável por item. Termina em "Converter em colaborador", que é a
   porta para a outra tela.

   VISÃO GERAL DO RH (o quadro inteiro): quantos são, quem entrou, quem está
   em experiência, de férias, quem faz aniversário, o que está pendente.

   NENHUM NÚMERO É INVENTADO. Todo indicador aqui sai de dado que existe:
   `_colaboradores` (admissão, situação, departamento, nascimento) e as fichas
   de candidato. Onde não há dado, a tela diz que não há — nunca preenche com
   um número plausível, que é indistinguível de um número verdadeiro.

   Este arquivo NÃO escreve no Firebase. Toda gravação passa pelas funções do
   app.js (`updateRecord`, `criarColaborador`, `salvarProposta`), que são o
   único caminho de escrita do CRM.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  const t = (k, f, v) => (typeof global._appText === 'function' ? global._appText(k, f, v) : f);
  const esc = s => (typeof global.xe === 'function' ? global.xe(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const attr = s => (typeof global.sanitizeAttr === 'function'
    ? global.sanitizeAttr(String(s == null ? '' : s)) : esc(s));
  const dinheiro = v => (typeof global.fmtBRL === 'function' ? global.fmtBRL(v) : String(v));
  const data = iso => (iso && typeof global._crmFmtDate === 'function' ? global._crmFmtDate(iso) : (iso || '—'));
  const hoje = () => (typeof global._crmTodayLocalIso === 'function'
    ? global._crmTodayLocalIso() : new Date().toISOString().slice(0, 10));
  const aviso = (i, m) => { if (typeof global.toast === 'function') global.toast(i, m); };
  /* As listas vêm por FUNÇÃO, e não lidas direto: `let` de script não existe
     no window, e elas são reatribuídas a cada troca de quadro — guardar a
     referência aqui mostraria gente do quadro anterior. */
  const registros = () => (typeof global.crmRegistros === 'function'
    ? (global.crmRegistros() || []) : []);
  const equipe = () => (typeof global.crmColaboradores === 'function'
    ? (global.crmColaboradores() || []) : []);

  /* ── Datas ────────────────────────────────────────────────────────────
     Tudo aqui é ISO aaaa-mm-dd, que ordena como texto e não depende de fuso.
     `new Date(iso)` seria UTC e viraria o dia anterior à noite no Brasil. */
  function diasEntre(deIso, ateIso) {
    if (!deIso || !ateIso) return null;
    const [a1, m1, d1] = deIso.split('-').map(Number);
    const [a2, m2, d2] = ateIso.split('-').map(Number);
    if (!a1 || !a2) return null;
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }
  function somaDias(iso, n) {
    const [a, m, d] = String(iso).split('-').map(Number);
    if (!a) return '';
    const dt = new Date(Date.UTC(a, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  }
  function fimDoMes(anosAtras, mesesAtras) {
    const agora = new Date();
    const dt = new Date(agora.getFullYear(), agora.getMonth() - (mesesAtras || 0) + 1, 0);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') +
           '-' + String(dt.getDate()).padStart(2, '0');
  }
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function rotuloMes(mesesAtras) {
    const agora = new Date();
    const dt = new Date(agora.getFullYear(), agora.getMonth() - mesesAtras, 1);
    return t('rh.month' + dt.getMonth(), MESES[dt.getMonth()]);
  }
  const rotuloMesAtual = () => rotuloMes(0);

  /* ═══════════════════════════════════════════════════════════════════
     OS NÚMEROS DO QUADRO
     ═══════════════════════════════════════════════════════════════════ */

  /* "É do time" (só o desligamento tira) e "já começou" (a data chegou) são
     perguntas diferentes. Confundir as duas foi o que fez o painel dizer zero
     colaborador enquanto a pessoa aparecia logo abaixo, na tabela, como Ativo. */
  const ativo = c => (typeof global.colaboradorAtivo === 'function'
    ? global.colaboradorAtivo(c) : !!c && c.situacao !== 'desligado');
  /* O colaborador que nasceu de uma ficha — sempre pelo helper do app.js, que
     guarda a regra num lugar só: o vínculo é o id, nunca o nome, e as duas
     pontas precisam existir. Três cópias desta comparação espalhadas por aqui
     eram três chances de uma delas ficar para trás. */
  const colaboradorDe = rec => (typeof global._colaboradorDoCandidato === 'function'
    ? global._colaboradorDoCandidato(rec && rec.id)
    : null);
  const jaComecou = c => (typeof global.colaboradorJaComecou === 'function'
    ? global.colaboradorJaComecou(c)
    : ativo(c) && (!c.admitidoEm || c.admitidoEm <= hoje()));

  /* Quanta gente havia no fim de um dia qualquer. Serve tanto para o número
     de hoje quanto para a linha do tempo — uma conta só, sem contador
     desnormalizado que sai de sincronia no primeiro erro. */
  function quadroEm(iso) {
    return equipe().filter(c => {
      if (!c.admitidoEm || c.admitidoEm > iso) return false;
      if (c.desligadoEm && c.desligadoEm <= iso) return false;
      return true;
    }).length;
  }

  function admitidosNoMes(mesesAtras) {
    const agora = new Date();
    const alvo = new Date(agora.getFullYear(), agora.getMonth() - (mesesAtras || 0), 1);
    const prefixo = alvo.getFullYear() + '-' + String(alvo.getMonth() + 1).padStart(2, '0');
    return equipe().filter(c => String(c.admitidoEm || '').startsWith(prefixo));
  }

  /* Em experiência: dentro dos 90 dias de contrato. Quem passou disso é
     efetivo, e contá-lo aqui seria dizer que o time inteiro está em teste. */
  function emExperiencia() {
    const dias = global.EXPERIENCIA_DIAS || 90;
    return equipe().filter(c => {
      if (!jaComecou(c) || !c.admitidoEm) return false;
      const d = diasEntre(c.admitidoEm, hoje());
      return d !== null && d >= 0 && d < dias;
    });
  }

  /* Admitido para daqui a alguns dias. Não some da conta do time, mas o painel
     diz que ele ainda não começou — senão "5 ativos" incluiria alguém que a
     equipe só vai conhecer semana que vem, sem nada explicando. */
  function aindaNaoComecaram() {
    return equipe().filter(c => ativo(c) && !jaComecou(c));
  }

  /* Avaliação a fazer: os dois marcos do contrato de experiência (45 e 90
     dias) que já venceram e ninguém registrou. */
  function avaliacoesPendentes() {
    const d1 = global.EXPERIENCIA_1A_AVALIACAO || 45;
    const d2 = global.EXPERIENCIA_DIAS || 90;
    const saida = { experiencia: [], desempenho: [] };
    equipe().forEach(c => {
      if (!jaComecou(c) || !c.admitidoEm) return;
      const dias = diasEntre(c.admitidoEm, hoje());
      if (dias === null) return;
      if (dias >= d1 && dias < d2) saida.experiencia.push(c);
      else if (dias >= d2 && dias < d2 + 30) saida.desempenho.push(c);
    });
    return saida;
  }

  function porSituacao(s) { return equipe().filter(c => c.situacao === s && !c.desligadoEm); }

  /* Onboarding em andamento: admitido, mas com checklist por terminar. */
  function onboardings() {
    return equipe().filter(c => {
      if (!ativo(c)) return false;
      const itens = Array.isArray(c.checklist) ? c.checklist : [];
      return itens.length > 0 && itens.some(i => !i.ok);
    });
  }

  /* O que falta, item a item, somado entre todas as admissões em curso.
     Agrupa pelo texto do item porque é ele que a pessoa lê na tela — dois
     "Exames admissionais" de pessoas diferentes são a mesma pendência. */
  function documentosPendentes() {
    const mapa = new Map();
    onboardings().forEach(c => {
      (c.checklist || []).forEach(i => {
        if (i.ok || !i.t) return;
        mapa.set(i.t, (mapa.get(i.t) || 0) + 1);
      });
    });
    return [...mapa.entries()].map(([nome, n]) => ({ nome, n }))
      .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
  }

  function aniversariantes() {
    const mes = String(new Date().getMonth() + 1).padStart(2, '0');
    return equipe()
      .filter(c => ativo(c) && /^\d{4}-\d{2}-\d{2}$/.test(String(c.nascimento || '')))
      .filter(c => c.nascimento.slice(5, 7) === mes)
      .sort((a, b) => a.nascimento.slice(8) .localeCompare(b.nascimento.slice(8)));
  }

  /* Próximas admissões: quem já tem data marcada e ainda não começou. Vem dos
     DOIS lados — colaborador com admissão no futuro, e candidato com proposta
     aceita e data de início combinada. */
  /* QUEM AINDA NÃO É DO TIME. Colaborador já convertido não entra aqui, nem
     com a data de início na semana que vem: ele aparecia ao mesmo tempo no
     quadro de colaboradores e em "próximas admissões", e as duas leituras se
     contradiziam na mesma tela. Quem já foi admitido está no time — que ele
     comece na quinta é assunto do rodapé do cartão de colaboradores ativos. */
  function proximasAdmissoes() {
    const hj = hoje();
    return registros()
      .filter(r => r.template === 'rh' && typeof global.propostaDe === 'function')
      .map(r => ({ r, p: global.propostaDe(r) }))
      .filter(({ r, p }) => p.inicio && p.inicio > hj &&
        !colaboradorDe(r))
      .map(({ r, p }) => ({ quando: p.inicio, nome: r.name, cargo: p.cargo,
                            area: p.departamento, id: r.id, tipo: 'candidato' }))
      .sort((a, b) => a.quando.localeCompare(b.quando));
  }

  /* Pendências importantes: o que tem prazo e já passou dele, ou está perto.
     Cada linha diz de onde saiu — nenhuma é um aviso genérico. */
  function pendencias() {
    const saida = [];
    const docs = documentosPendentes();
    docs.forEach(d => {
      saida.push({
        texto: t('rh.pendItem', '{item} — admissões em andamento', { item: d.nome }),
        detalhe: t('rh.pendCount', '{n} pendente(s)', { n: d.n }),
        grave: false,
      });
    });
    const av = avaliacoesPendentes();
    if (av.experiencia.length) {
      saida.push({
        texto: t('rh.pendExp', 'Avaliação de experiência (45 dias)'),
        detalhe: t('rh.pendCount', '{n} pendente(s)', { n: av.experiencia.length }),
        grave: true,
      });
    }
    if (av.desempenho.length) {
      saida.push({
        texto: t('rh.pendPerf', 'Avaliação de efetivação (90 dias)'),
        detalhe: t('rh.pendCount', '{n} pendente(s)', { n: av.desempenho.length }),
        grave: true,
      });
    }
    /* Proposta enviada e sem resposta depois do prazo: é a pendência que
       custa candidato, e some da tela quando ninguém olha o funil. */
    registros().forEach(r => {
      if (r.template !== 'rh' || typeof global.propostaDe !== 'function') return;
      const p = global.propostaDe(r);
      const s = global.propostaSituacao(r);
      if (!p.prazo || !s.existe) return;
      if (s.indice >= 3) return;                        // já aceitou
      const dias = diasEntre(p.prazo, hoje());
      if (dias === null || dias < 0) return;
      saida.push({
        texto: t('rh.pendProposta', 'Proposta sem resposta — {nome}', { nome: r.name || '—' }),
        detalhe: dias === 0 ? t('rh.dueToday', 'vence hoje')
                            : t('rh.overdueDays', 'venceu há {n} dia(s)', { n: dias }),
        grave: true,
      });
    });
    return saida;
  }

  function porDepartamento() {
    const mapa = new Map();
    equipe().filter(ativo).forEach(c => {
      const nome = String(c.departamento || '').trim() || t('rh.noDept', 'Sem departamento');
      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });
    const total = [...mapa.values()].reduce((s, n) => s + n, 0);
    return {
      total,
      itens: [...mapa.entries()].map(([nome, n]) => ({
        nome, n, pct: total ? (n * 100 / total) : 0,
      })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)),
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     DESENHOS
     ═══════════════════════════════════════════════════════════════════
     SVG escrito à mão, sem biblioteca: são três formas simples e nenhuma
     delas justifica um download a mais na página. */

  function sparkline(serie) {
    const n = serie.length;
    if (n < 2) return '';
    const min = Math.min(...serie), max = Math.max(...serie);
    const alt = max - min || 1;
    const pts = serie.map((v, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 26 - ((v - min) / alt) * 22;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg class="rhv-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">'
      + '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function areaChart(serie, rotulos) {
    const n = serie.length;
    if (n < 2) return '<div class="rhv-vazio">' + esc(t('rh.noHistory',
      'Ainda não há histórico suficiente para desenhar a evolução.')) + '</div>';
    const min = Math.min(...serie, 0);
    const max = Math.max(...serie);
    const alt = max - min || 1;
    const px = i => (i / (n - 1)) * 100;
    const py = v => 100 - ((v - min) / alt) * 88 - 6;
    const linha = serie.map((v, i) => px(i).toFixed(2) + ',' + py(v).toFixed(2)).join(' ');
    const area = '0,100 ' + linha + ' 100,100';
    const eixo = rotulos.map((r, i) =>
      '<span style="left:' + px(i).toFixed(2) + '%">' + esc(r) + '</span>').join('');
    return `
      <div class="rhv-area">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="vgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(45,212,191,.34)"/>
            <stop offset="100%" stop-color="rgba(45,212,191,0)"/>
          </linearGradient></defs>
          <polygon points="${area}" fill="url(#vgGrad)"/>
          <polyline points="${linha}" fill="none" stroke="#2dd4bf" stroke-width="1.4"
                    vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        </svg>
        <div class="rhv-area-eixo">${eixo}</div>
        <div class="rhv-area-max">${esc(String(max))}</div>
        <div class="rhv-area-min">${esc(String(min))}</div>
      </div>`;
  }

  const DONUT_CORES = ['#38bdf8', '#6366f1', '#f59e0b', '#10b981', '#a78bfa',
                       '#94a3b8', '#34d399', '#f472b6', '#facc15', '#fb7185'];

  function donut(dados) {
    if (!dados.total) {
      /* Sem gente não há anel. Desenhar um círculo cheio de uma cor só seria
         afirmar uma composição que não existe. */
      return '<div class="rhv-vazio">' + esc(t('rh.noTeam',
        'Nenhum colaborador no quadro ainda. O departamento é preenchido na ficha de cada um — o cargo do candidato não vira departamento sozinho.')) + '</div>';
    }
    const raio = 15.9155;            // circunferência = 100, o que faz o
    let offset = 25;                 // dasharray virar porcentagem direta
    const aneis = dados.itens.map((it, i) => {
      const cor = DONUT_CORES[i % DONUT_CORES.length];
      const seg = `<circle class="rhv-donut-seg" cx="21" cy="21" r="${raio}" fill="none"
        stroke="${cor}" stroke-width="5.4"
        stroke-dasharray="${it.pct.toFixed(2)} ${(100 - it.pct).toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"><title>${esc(it.nome)}</title></circle>`;
      offset -= it.pct;
      return seg;
    }).join('');
    const legenda = dados.itens.map((it, i) => `
      <div class="rhv-leg-item">
        <span class="rhv-leg-cor" style="background:${DONUT_CORES[i % DONUT_CORES.length]}"></span>
        <span class="rhv-leg-nome">${esc(it.nome)}</span>
        <span class="rhv-leg-n">${it.n}</span>
        <span class="rhv-leg-pct">${it.pct.toFixed(1).replace('.', ',')}%</span>
      </div>`).join('');
    return `
      <div class="rhv-donut-wrap">
        <div class="rhv-donut">
          <svg viewBox="0 0 42 42" aria-hidden="true">${aneis}</svg>
          <div class="rhv-donut-centro">
            <b>${dados.total}</b>
            <span>${esc(t('rh.total', 'Total'))}</span>
          </div>
        </div>
        <div class="rhv-legenda">${legenda}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════
     TELA 1 — VISÃO GERAL DO RH
     ═══════════════════════════════════════════════════════════════════ */

  let _vgBusca = '';
  let _vgMeses = 12;
  /* Blocos que a pessoa mandou abrir por inteiro. Cada bloco mostra as
     primeiras linhas e um "Ver todos"; guardar isso aqui, e não no DOM, faz a
     escolha sobreviver a cada repintura (o painel se redesenha inteiro a cada
     busca, a cada troca de período e a cada gravação de ficha). */
  const _vgAberto = new Set();

  /* ═══════════════════════════════════════════════════════════════════════
     TELA CHEIA, E NÃO JANELA
     ═══════════════════════════════════════════════════════════════════════
     Isto nasceu como modal — quadro branco flutuando sobre o board, com fundo
     escurecido e fecho ao clicar fora. Errado para o que ele é: um painel com
     cinco indicadores, dois gráficos, sete blocos e a tabela do quadro
     inteiro. Numa janela sobra margem morta dos dois lados e falta largura
     para a tabela, que passa a rolar na horizontal dentro de um quadro que já
     rola na vertical. E o fecho ao clicar fora derruba a tela ao mirar um
     gráfico e errar por dois pixels.

     Agora ocupa a janela toda, com rolagem própria, e só sai por quem pediu:
     o ✕ ou Esc. */
  function abrirVisaoRH() {
    document.querySelector('.rhv-full')?.remove();
    const tela = document.createElement('div');
    tela.className = 'rhv-full';
    tela.innerHTML = `
      <div class="rhv-hero">
        <div class="rhv-h1">${esc(t('rh.hrOverview', 'Visão geral do RH'))}</div>
        <div class="rhv-hero-acoes">
          <label class="rhv-busca-wrap">
            ${svg('lupa', 15)}
            <input class="rhv-busca" id="rhv-busca" autocomplete="off"
                   placeholder="${attr(t('rh.hrSearch', 'Buscar colaborador, área ou documento...'))}">
          </label>
          <button class="rhv-pill" id="rhv-trocar">${svg('trocar', 14)}<span>${
            esc(t('rh.hrOverview', 'Visão geral do RH'))}</span></button>
          <button class="rhv-quadrado" id="rhv-novo"
                  title="${attr(t('rh.newCollaborator', 'Novo colaborador'))}"
                  aria-label="${attr(t('rh.newCollaborator', 'Novo colaborador'))}">${svg('mais', 17)}</button>
          <button class="rhv-quadrado rhv-sair" id="rhv-fechar"
                  title="${attr(t('common.close', 'Fechar'))}"
                  aria-label="${attr(t('common.close', 'Fechar'))}">✕</button>
        </div>
      </div>
      <div class="rhv-corpo" id="rhv-corpo"></div>`;
    document.body.appendChild(tela);
    document.body.classList.add('rhv-travado');

    const fechar = () => {
      tela.remove();
      document.body.classList.remove('rhv-travado');
      document.removeEventListener('keydown', porEsc);
    };
    /* Esc fecha o que está POR CIMA. Com a ficha de um colaborador aberta, ou
       com o menu de ações de uma linha, o Esc é dela — fechar o painel inteiro
       por baixo faria a pessoa perder de vista onde estava por ter cancelado
       um menuzinho. */
    function porEsc(ev) {
      if (ev.key !== 'Escape') return;
      if (document.querySelector('.modal-bg, .cdash-menu')) return;
      fechar();
    }
    document.addEventListener('keydown', porEsc);
    tela.querySelector('#rhv-fechar').addEventListener('click', fechar);
    tela.querySelector('#rhv-novo').addEventListener('click', () => formularioColaborador(null));

    /* O botão do meio troca de tela, e não de aba: é o mesmo par que o menu de
       recrutamento oferece, à mão de quem já está aqui. */
    tela.querySelector('#rhv-trocar').addEventListener('click', () => {
      fechar();
      if (typeof global.crmAbrirPropostas === 'function') global.crmAbrirPropostas();
    });

    const busca = tela.querySelector('#rhv-busca');
    busca.value = _vgBusca;
    let tmr = null;
    busca.addEventListener('input', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => { _vgBusca = busca.value; pintarVisaoRH(); }, 220);
    });

    pintarVisaoRH();
  }

  function _vgFiltrada(lista) {
    const q = String(_vgBusca || '').toLowerCase().trim();
    if (!q) return lista;
    /* A busca alcança o que a ficha guarda — inclusive CPF, cidade e as
       respostas do processo seletivo. "Buscar colaborador, área ou documento"
       promete isso, e procurar só por nome seria promessa não cumprida. */
    return lista.filter(c => [
      c.nome, c.cargo, c.departamento, c.email, c.telefone, c.cpf, c.rg,
      c.cidade, c.uf, c.profissao, c.escolaridade, c.bairro, c.endereco,
      Object.values(c.campos || {}).join(' '),
    ].join(' ').toLowerCase().includes(q));
  }

  function pintarVisaoRH() {
    const host = document.getElementById('rhv-corpo');
    if (!host) return;

    const todos = _vgFiltrada(equipe());
    const ativos = todos.filter(ativo);
    const hj = hoje();
    const fimMesPassado = fimDoMes(0, 1);
    const deltaQuadro = ativos.length - quadroEm(fimMesPassado);
    const esteMes = admitidosNoMes(0).length;
    const mesPassado = admitidosNoMes(1).length;
    const exp = emExperiencia();
    const porComecar = aindaNaoComecaram();
    const semNascimento = equipe().filter(c => ativo(c) && !c.nascimento);
    const ferias = porSituacao('ferias');
    const afastados = porSituacao('afastado');
    const docsPend = documentosPendentes();
    const totalPend = docsPend.reduce((s, d) => s + d.n, 0);
    const av = avaliacoesPendentes();
    const dep = porDepartamento();
    const onb = onboardings();
    const aniv = aniversariantes();
    const prox = proximasAdmissoes();
    const pend = pendencias();

    /* A série do gráfico e a dos KPIs saem da MESMA conta (`quadroEm`): dois
       cálculos para o mesmo número acabam divergindo, e ninguém percebe. */
    const meses = _vgMeses;
    const serie = [];
    const rotulos = [];
    for (let i = meses - 1; i >= 0; i--) {
      serie.push(quadroEm(fimDoMes(0, i)));
      rotulos.push(rotuloMes(i));
    }
    const serieAdm = [];
    for (let i = 5; i >= 0; i--) serieAdm.push(admitidosNoMes(i).length);

    /* O número grande, a variação e a linha do período dividem o cartão com a
       miniatura do gráfico à direita — é ela que diz se o número que está ali
       vinha subindo ou caindo, que é a pergunta seguinte a "quantos são". */
    const kpi = (rot, valor, delta, pe, serieMini) => {
      const sinal = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
      const classe = delta > 0 ? 'sobe' : delta < 0 ? 'desce' : 'igual';
      return `
        <div class="rhv-kpi">
          <div class="rhv-kpi-lbl">${esc(rot)}</div>
          <div class="rhv-kpi-linha">
            <div class="rhv-kpi-esq">
              <span class="rhv-kpi-num">${esc(String(valor))}</span>
              <span class="rhv-kpi-delta ${classe}">${sinal}${delta ? ' ' + Math.abs(delta) : ''}</span>
            </div>
            <span class="rhv-kpi-spark ${classe}">${serieMini ? sparkline(serieMini) : ''}</span>
          </div>
          <div class="rhv-kpi-pe">${esc(pe)}</div>
        </div>`;
    };

    /* VAZIO QUE EXPLICA. "Nada por aqui" num painel de RH é indistinguível de
       um painel quebrado — foi exatamente a leitura de quem abriu a tela com
       o quadro ainda sem ninguém. Cada bloco diz o que falta para ele ter o
       que mostrar. */
    const semQuadro = !equipe().length;

    /* CADA BLOCO MOSTRA UM PEDAÇO, E DIZ QUE HÁ MAIS.
       Cortar em seis e não avisar é esconder: quem tem nove documentos
       pendentes lê seis e vai embora achando que viu tudo. O rodapé conta o
       resto e abre ali mesmo — a tela é a mesma, e a lista completa não vale
       uma segunda janela. */
    const lista = (chave, titulo, itens, montarLinha, opcoes = {}) => {
      const limite = opcoes.limite || 6;
      const total  = itens.length;
      const aberto = _vgAberto.has(chave);
      const corpo  = (aberto ? itens : itens.slice(0, limite)).map(montarLinha).join('');
      const sobram = total - limite;
      return `
        <section class="rhv-bloco">
          <header class="rhv-bloco-cab">
            <span>${esc(titulo)}</span>
            <span class="rhv-bloco-n">${opcoes.n === undefined ? total : opcoes.n}</span>
          </header>
          <div class="rhv-bloco-corpo">${corpo ||
            '<div class="rhv-vazio">' + esc(semQuadro
              ? t('rh.emptyNoTeam', 'Ninguém no quadro ainda — converta um candidato admitido em "Propostas".')
              : (opcoes.vazio || t('rh.nothingHere', 'Nada por aqui.'))) + '</div>'}</div>
          ${sobram > 0 ? `<button type="button" class="rhv-ver" data-abrir="${attr(chave)}">
            <span>${esc(aberto
              ? t('rh.seeLess', 'Ver menos')
              : t('rh.seeAllN', 'Ver todos ({n})', { n: total }))}</span>${svg('seta', 13)}
          </button>` : ''}
        </section>`;
    };

    /* O ícone da linha sai do que o documento É. Um ícone só para tudo vira
       enfeite; um por assunto faz a lista se ler de relance. */
    const iconeDoc = nome => {
      const s = String(nome || '').toLowerCase();
      if (/assinat|contrato|termo|acordo/.test(s)) return svg('contrato', 15);
      if (/exame|m[eé]dic|sa[uú]de|aso/.test(s))   return svg('pulso', 15);
      if (/sigilo|confidenc|lgpd|nda/.test(s))     return svg('escudo', 15);
      if (/envio|upload|anexo|documento/.test(s))  return svg('upload', 15);
      return svg('contrato', 15);
    };
    const inicial = nome => String(nome || '?').trim().charAt(0).toUpperCase() || '?';

    host.innerHTML = `
      <div class="rhv-kpis">
        ${kpi(t('rh.activeCollaborators', 'Colaboradores ativos'), ativos.length, deltaQuadro,
              porComecar.length
                ? t('rh.startingSoon', '{n} ainda não começou/começaram', { n: porComecar.length })
                : t('rh.vsLastMonth', 'vs. mês anterior'), serie.slice(-8))}
        ${kpi(t('rh.hiresThisMonth', 'Contratações no mês'), esteMes, esteMes - mesPassado,
              t('rh.vsLastMonth', 'vs. mês anterior'), serieAdm)}
        ${kpi(t('rh.inProbation', 'Em experiência'), exp.length, 0,
              t('rh.probationFoot', 'até {n} dias de casa', { n: global.EXPERIENCIA_DIAS || 90 }), null)}
        ${kpi(t('rh.onVacation', 'Em férias'), ferias.length, 0,
              t('rh.plusAway', '+{n} afastado(s)', { n: afastados.length }), null)}
        ${kpi(t('rh.pendingRequests', 'Solicitações pendentes'), totalPend, 0,
              t('rh.fromOnboarding', 'itens de admissão em aberto'), null)}
      </div>

      <div class="rhv-graficos">
        <section class="rhv-bloco rhv-bloco-grande">
          <header class="rhv-bloco-cab">
            <span>${esc(t('rh.headcountEvolution', 'Evolução do quadro'))}</span>
            <span class="rhv-periodos">
              ${[6, 12, 24].map(m => `<button type="button" data-meses="${m}"
                 class="${m === meses ? 'sel' : ''}">${m} ${esc(t('rh.months', 'meses'))}</button>`).join('')}
            </span>
          </header>
          ${areaChart(serie, rotulos)}
        </section>
        <section class="rhv-bloco">
          <header class="rhv-bloco-cab">
            <span>${esc(t('rh.byDepartment', 'Colaboradores por departamento'))}</span>
          </header>
          ${donut(dep)}
        </section>
      </div>

      <div class="rhv-blocos">
        ${lista('onb', t('rh.onboardings', 'Onboardings em andamento'), onb, c => {
          const itens = (c.checklist || []);
          const fase = itens.find(i => !i.ok);
          return `<div class="rhv-linha rhv-clique" data-colab="${attr(c.id)}">
            <span class="rhv-linha-nome">${esc(c.nome)}</span>
            <span class="rhv-linha-sub">${esc(c.cargo || '—')}</span>
            <span class="rhv-tag">${esc(fase ? fase.t : '—')}</span>
          </div>`;
        })}

        ${lista('docs', t('rh.pendingDocs', 'Documentos pendentes'), docsPend,
          d => `<div class="rhv-linha">
            <span class="rhv-linha-ico">${iconeDoc(d.nome)}</span>
            <span class="rhv-linha-nome">${esc(d.nome)}</span>
            <span class="rhv-linha-n">${d.n}</span>
          </div>`, { n: totalPend })}

        ${lista('aus', t('rh.absences', 'Férias e ausências'),
          [['sol', t('rh.onVacation', 'Em férias'), ferias.length],
           ['pulso', t('rh.away', 'Afastados'), afastados.length]],
          ([ico, nome, n]) => `<div class="rhv-linha">
            <span class="rhv-linha-ico">${svg(ico, 15)}</span>
            <span class="rhv-linha-nome">${esc(nome)}</span>
            <span class="rhv-linha-n">${n}</span>
          </div>`, { n: ferias.length + afastados.length })}

        ${lista('aval', t('rh.pendingReviews', 'Avaliações pendentes'),
          [['estrela', t('rh.reviewProbation', 'Avaliação de experiência'), av.experiencia.length],
           ['alvo', t('rh.reviewPerformance', 'Avaliação de efetivação'), av.desempenho.length]],
          ([ico, nome, n]) => `<div class="rhv-linha">
            <span class="rhv-linha-ico">${svg(ico, 15)}</span>
            <span class="rhv-linha-nome">${esc(nome)}</span>
            <span class="rhv-linha-n">${n}</span>
          </div>`, { n: av.experiencia.length + av.desempenho.length })}

        ${lista('aniv', t('rh.birthdays', 'Aniversariantes do mês'), aniv,
          c => `<div class="rhv-linha rhv-clique" data-colab="${attr(c.id)}">
            <span class="rhv-av">${esc(inicial(c.nome))}</span>
            <span class="rhv-duas">
              <b>${esc(c.nome)}</b>
              <i>${esc(c.departamento || c.cargo || '—')}</i>
            </span>
            <span class="rhv-linha-n">${esc(c.nascimento.slice(8) + '/' + c.nascimento.slice(5, 7))}</span>
          </div>`, {
          /* NÃO É "não tem aniversariante": quase sempre é que ninguém
             informou a data. A diferença decide se a pessoa vai procurar um
             defeito ou preencher a ficha — e por isso a mensagem diz quantos
             estão sem data e onde ela se preenche. O candidato que vem por
             formulário costuma chegar sem data de nascimento, então isto é o
             caso comum, e não a exceção. */
          vazio: semNascimento.length
            ? t('rh.noBirthdayData',
                '{n} colaborador(es) sem data de nascimento na ficha — abra a ficha de cada um para preencher.',
                { n: semNascimento.length })
            : t('rh.noBirthdayThisMonth', 'Ninguém do time faz aniversário em {mes}.',
                { mes: rotuloMesAtual() }),
        })}
      </div>

      <div class="rhv-baixo">
        ${lista('prox', t('rh.nextAdmissions', 'Próximas admissões'), prox,
          p => `<div class="rhv-linha rhv-linha-cols">
            <span class="rhv-linha-ico">${svg('inicio', 15)}</span>
            <span class="rhv-linha-data">${esc(data(p.quando))}</span>
            <span class="rhv-linha-nome">${esc(p.nome || '—')}</span>
            <span class="rhv-linha-cargo">${esc(p.cargo || '—')}</span>
            <span class="rhv-linha-area">${esc(p.area || '—')}</span>
          </div>`, { limite: 8 })}

        ${lista('pend', t('rh.importantPending', 'Pendências importantes'), pend,
          p => `<div class="rhv-linha">
            <span class="rhv-linha-alerta ${p.grave ? 'grave' : ''}">${svg('alerta', 15)}</span>
            <span class="rhv-linha-nome">${esc(p.texto)}</span>
            <span class="rhv-linha-n ${p.grave ? 'grave' : ''}">${esc(p.detalhe)}</span>
          </div>`, { limite: 8 })}
      </div>

      <div class="rhv-quadro">
        <header class="rhv-bloco-cab">
          <span>${esc(t('rh.teamRoster', 'Quadro de colaboradores'))}</span>
          <span class="rhv-bloco-n">${todos.length}</span>
        </header>
        ${todos.length ? `
        <table class="rhv-tabela">
          <thead><tr>
            <th>${esc(t('rh.name', 'Nome'))}</th>
            <th>${esc(t('rh.role', 'Cargo'))}</th>
            <th>${esc(t('rh.department', 'Departamento'))}</th>
            <th>${esc(t('app.fieldEmail', 'E-mail'))}</th>
            <th>${esc(t('app.phone', 'Telefone'))}</th>
            <th>${esc(t('app.city', 'Município'))}</th>
            <th>${esc(t('rh.contract', 'Modalidade'))}</th>
            <th>${esc(t('rh.admittedOn', 'Admissão'))}</th>
            <th>${esc(t('rh.salary', 'Salário'))}</th>
            <th>${esc(t('rh.situation', 'Situação'))}</th>
            <th></th>
          </tr></thead>
          <tbody>${todos.map(c => `
            <tr data-colab="${attr(c.id)}">
              <td>${esc(c.nome)}</td>
              <td>${esc(c.cargo || '—')}</td>
              <td>${esc(c.departamento || '—')}</td>
              <td>${esc(c.email || '—')}</td>
              <td>${esc(c.telefone || '—')}</td>
              <td>${esc([c.cidade, c.uf].filter(Boolean).join(', ') || '—')}</td>
              <td>${esc(rotuloContrato(c.contrato) || '—')}</td>
              <td>${esc(data(c.admitidoEm))}</td>
              <td>${esc(c.salario ? dinheiro(c.salario) : '—')}</td>
              <td><span class="rhv-sit rhv-sit-${esc(c.situacao)}">${
                esc(t('rh.sit_' + c.situacao, c.situacao))}</span></td>
              <td><button type="button" class="rhv-kebab" data-menu="${attr(c.id)}"
                    aria-label="${attr(t('rh.rowActions', 'Ações'))}">⋮</button></td>
            </tr>`).join('')}</tbody>
        </table>` : `<div class="rhv-vazio">${esc(t('rh.rosterEmpty',
          'Ninguém no quadro ainda. Um candidato vira colaborador na tela de Proposta e Admissão.'))}</div>`}
      </div>`;

    host.querySelectorAll('[data-meses]').forEach(b => {
      b.addEventListener('click', () => { _vgMeses = Number(b.dataset.meses) || 12; pintarVisaoRH(); });
    });
    host.querySelectorAll('[data-abrir]').forEach(b => {
      b.addEventListener('click', () => {
        const chave = b.dataset.abrir;
        if (_vgAberto.has(chave)) _vgAberto.delete(chave); else _vgAberto.add(chave);
        pintarVisaoRH();
      });
    });
    host.querySelectorAll('[data-colab]').forEach(el => {
      el.addEventListener('click', ev => {
        if (ev.target.closest('[data-menu]')) return;
        formularioColaborador(el.dataset.colab);
      });
    });
    host.querySelectorAll('[data-menu]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        menuColaborador(btn.dataset.menu, btn);
      });
    });
  }

  function menuColaborador(id, ancora) {
    const c = (typeof global._colaboradorPorId === 'function')
      ? global._colaboradorPorId(id) : null;
    if (!c || typeof global._cdashMenu !== 'function') return;
    const trocar = situacao => async () => {
      await global.atualizarColaborador(id, { situacao,
        desligadoEm: situacao === 'desligado' ? hoje() : '' });
      pintarVisaoRH();
    };
    global._cdashMenu(ancora, [
      { label: t('rh.editCollaborator', 'Editar colaborador'),
        onClick: () => formularioColaborador(id) },
      ...(c.situacao !== 'ativo' ? [{ label: t('rh.markActive', 'Marcar como ativo'), onClick: trocar('ativo') }] : []),
      ...(c.situacao !== 'ferias' ? [{ label: t('rh.markVacation', 'Marcar em férias'), onClick: trocar('ferias') }] : []),
      ...(c.situacao !== 'afastado' ? [{ label: t('rh.markAway', 'Marcar afastado'), onClick: trocar('afastado') }] : []),
      ...(c.situacao !== 'desligado' ? [{ label: t('rh.markOff', 'Registrar desligamento'), onClick: trocar('desligado') }] : []),
      { label: t('rh.deleteCollaborator', 'Excluir do quadro'), danger: true,
        onClick: async () => {
          const ok = typeof global.confirmarAcao === 'function'
            ? await global.confirmarAcao(
                t('rh.deleteCollaborator', 'Excluir do quadro'),
                t('rh.deleteCollaboratorAsk',
                  '{nome} sai do quadro de colaboradores. A ficha do candidato que deu origem a ele não é tocada.',
                  { nome: c.nome }),
                t('app.delete', 'Excluir'))
            : true;
          if (!ok) return;
          await global.excluirColaborador(id);
          pintarVisaoRH();
        } },
    ]);
  }

  /* ── FICHA DO COLABORADOR ─────────────────────────────────────────────
     A MESMA ficha que o candidato preencheu, continuada. O formulário da vaga
     é a peça central: é lá que a pessoa digita CPF, RG, nascimento, endereço,
     escolaridade, nome da mãe. Guardar só nome, cargo e admissão jogava tudo
     isso fora no instante da contratação — e alguém teria de pedir de novo, à
     pessoa que já tinha respondido. */
  function formularioColaborador(id) {
    const c = id && typeof global._colaboradorPorId === 'function'
      ? global._colaboradorPorId(id) : null;
    const d = c || { nome: '', admitidoEm: hoje(), situacao: 'ativo', salario: 0, campos: {} };
    const origem = c && c.origemCandidatoId
      ? registros().find(r => String(r.id) === String(c.origemCandidatoId)) : null;

    document.querySelector('.rhvf-bg')?.remove();
    const bg = document.createElement('div');
    bg.className = 'modal-bg rhvf-bg';

    const opcoes = (lista, sel, prefixo) => lista.map(o =>
      `<option value="${attr(o)}"${o === sel ? ' selected' : ''}>${
        esc(prefixo ? t(prefixo + o, o) : o)}</option>`).join('');
    const listaSimples = (lista, sel) =>
      `<option value="">${esc(t('app.select', 'Selecione'))}</option>` +
      lista.map(o => `<option value="${attr(o)}"${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');

    const campo = (id2, rot, valor, tipo, extra) => `
      <div class="crm-modal-col">
        <label class="crm-modal-lbl" for="rhvf-${attr(id2)}">${esc(rot)}</label>
        <input class="m-inp" id="rhvf-${attr(id2)}" type="${attr(tipo || 'text')}"
          ${tipo === 'date' ? 'style="color-scheme:dark"' : ''} ${extra || ''}
          maxlength="120" value="${attr(valor == null ? '' : valor)}">
      </div>`;
    const selecao = (id2, rot, html) => `
      <div class="crm-modal-col">
        <label class="crm-modal-lbl" for="rhvf-${attr(id2)}">${esc(rot)}</label>
        <select class="m-inp" id="rhvf-${attr(id2)}">${html}</select>
      </div>`;
    const linha = (...cols) => `<div class="crm-modal-row">${cols.join('')}</div>`;
    const secao = txt => `<div class="rhvf-secao">${esc(txt)}</div>`;

    /* O que o modelo de ficha perguntou (experiência, formação, pretensão,
       disponibilidade…) aparece como leitura: é o registro do processo
       seletivo, e editá-lo aqui criaria uma segunda verdade sobre o que a
       pessoa respondeu. A ficha de origem continua sendo o original. */
    const doProcesso = Object.entries(d.campos || {})
      .filter(([k, v]) => v && !/__selo$|^vagaId$/.test(k))
      .slice(0, 14)
      .map(([k, v]) => `<div class="rhvf-campo">
        <span>${esc(_rotuloDoModelo(k))}</span><b>${esc(String(v))}</b></div>`).join('');

    bg.innerHTML = `
      <div class="modal rhvf-modal">
        <div class="m-h1">${esc(c ? t('rh.editCollaborator', 'Editar colaborador')
                                  : t('rh.newCollaborator', 'Novo colaborador'))}</div>

        ${secao(t('app.personalData', 'Dados pessoais'))}
        <label class="crm-modal-lbl" for="rhvf-nome">${esc(t('rh.name', 'Nome'))}</label>
        <input class="m-inp" id="rhvf-nome" maxlength="120" value="${attr(d.nome)}">
        ${linha(campo('email', t('app.fieldEmail', 'E-mail'), d.email, 'email'),
                campo('tel', t('app.phone', 'Telefone'), d.telefone))}
        ${linha(campo('cpf', t('app.fieldCpf', 'CPF'), d.cpf),
                campo('rg', t('app.fieldRgIe', 'RG / IE'), d.rg))}
        ${linha(campo('nasc', t('app.birthDate', 'Data de nascimento'), d.nascimento, 'date'),
                campo('naturalidade', t('app.fieldPlaceOfBirth', 'Naturalidade'), d.naturalidade))}
        ${linha(selecao('escolaridade', t('app.fieldEducation', 'Escolaridade'),
                  listaSimples(global.CRM_EDUCATION_OPTIONS || [], d.escolaridade)),
                selecao('civil', t('app.maritalStatus', 'Estado civil'),
                  listaSimples(global.CRM_MARITAL_STATUS_OPTIONS || [], d.estadoCivil)))}
        ${linha(campo('genero', t('app.fieldGender', 'Gênero'), d.genero),
                campo('nacionalidade', t('app.fieldNationality', 'Nacionalidade'), d.nacionalidade))}
        ${linha(campo('mae', t('app.fieldMotherName', 'Nome da mãe'), d.nomeMae),
                campo('pai', t('app.fieldFatherName', 'Nome do pai'), d.nomePai))}

        ${secao(t('app.addressSection', 'Endereço'))}
        ${linha(campo('cep', 'CEP', d.cep),
                campo('endereco', t('app.fieldAddress', 'Endereço'), d.endereco))}
        ${linha(campo('numero', t('app.fieldAddressNumber', 'Número'), d.numero),
                campo('complemento', t('app.fieldComplement', 'Complemento'), d.complemento))}
        ${linha(campo('bairro', t('app.fieldNeighborhood', 'Bairro'), d.bairro),
                campo('cidade', t('app.city', 'Município'), d.cidade))}
        ${linha(campo('uf', t('app.state', 'Estado'), d.uf, 'text', 'maxlength="2"'),
                campo('profissao', t('app.fieldProfession', 'Profissão'), d.profissao))}

        ${secao(t('rh.employmentSection', 'Vínculo'))}
        ${linha(campo('cargo', t('rh.role', 'Cargo'), d.cargo),
                campo('dep', t('rh.department', 'Departamento'), d.departamento))}
        ${linha(campo('adm', t('rh.admittedOn', 'Admissão'), d.admitidoEm, 'date'),
                campo('sal', t('rh.salary', 'Salário'), d.salario || '', 'number'))}
        ${linha(selecao('contrato', t('rh.contract', 'Modalidade'),
                  `<option value="">${esc(t('app.select', 'Selecione'))}</option>` +
                  (global.VAGA_CONTRATO_OPCOES || []).map(o =>
                    `<option value="${attr(o)}"${o === d.contrato ? ' selected' : ''}>${
                      esc(rotuloContrato(o))}</option>`).join('')),
                campo('jornada', t('rh.workload', 'Jornada'), d.jornada))}
        ${linha(campo('beneficios', t('rh.benefits', 'Benefícios'), d.beneficios),
                selecao('sit', t('rh.situation', 'Situação'),
                  opcoes(global.COLAB_SITUACOES || ['ativo'], d.situacao, 'rh.sit_')))}

        ${doProcesso ? secao(t('rh.fromProcess', 'Do processo seletivo')) +
          `<div class="rhvf-campos">${doProcesso}</div>` : ''}

        ${origem ? `<button type="button" class="pa-link rhvf-puxar" id="rhvf-puxar">${
          esc(t('rh.pullFromRecord', 'Trazer dados da ficha do candidato'))}</button>` : ''}

        <div class="m-btns">
          <button class="m-cancel" id="rhvf-cancel">${esc(t('app.cancel', 'Cancelar'))}</button>
          <button class="m-confirm" id="rhvf-ok">${esc(t('app.save', 'Salvar'))}</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const fechar = () => bg.remove();
    bg.querySelector('#rhvf-cancel').addEventListener('click', fechar);
    bg.addEventListener('click', ev => { if (ev.target === bg) fechar(); });

    bg.querySelector('#rhvf-puxar')?.addEventListener('click', async () => {
      if (typeof global.puxarDadosDoCandidato !== 'function') return;
      const atualizado = await global.puxarDadosDoCandidato(c.id);
      fechar();
      pintarVisaoRH();
      if (atualizado) formularioColaborador(c.id);
    });

    bg.querySelector('#rhvf-ok').addEventListener('click', async () => {
      const v = sel => (bg.querySelector(sel) || {}).value || '';
      const dados = {
        nome: v('#rhvf-nome').trim(),
        email: v('#rhvf-email'), telefone: v('#rhvf-tel'),
        cpf: v('#rhvf-cpf'), rg: v('#rhvf-rg'),
        nascimento: v('#rhvf-nasc'), naturalidade: v('#rhvf-naturalidade'),
        escolaridade: v('#rhvf-escolaridade'), estadoCivil: v('#rhvf-civil'),
        genero: v('#rhvf-genero'), nacionalidade: v('#rhvf-nacionalidade'),
        nomeMae: v('#rhvf-mae'), nomePai: v('#rhvf-pai'),
        cep: v('#rhvf-cep'), endereco: v('#rhvf-endereco'),
        numero: v('#rhvf-numero'), complemento: v('#rhvf-complemento'),
        bairro: v('#rhvf-bairro'), cidade: v('#rhvf-cidade'), uf: v('#rhvf-uf'),
        profissao: v('#rhvf-profissao'),
        cargo: v('#rhvf-cargo'), departamento: v('#rhvf-dep'),
        admitidoEm: v('#rhvf-adm'), salario: Number(v('#rhvf-sal')) || 0,
        contrato: v('#rhvf-contrato'), jornada: v('#rhvf-jornada'),
        beneficios: v('#rhvf-beneficios'), situacao: v('#rhvf-sit'),
      };
      if (!dados.nome) { bg.querySelector('#rhvf-nome').focus(); return; }
      if (c) await global.atualizarColaborador(c.id, dados);
      else   await global.criarColaborador(dados);
      fechar();
      pintarVisaoRH();
    });
    setTimeout(() => bg.querySelector('#rhvf-nome')?.focus(), 80);
  }

  /* O rótulo que o modelo de ficha dá a cada chave. Sem ele a tela mostraria
     "pretensao" e "disponibilidade" como o banco os guarda. */
  function _rotuloDoModelo(chave) {
    const N = global.MD_NICHOS;
    const modelo = N && N.porChave ? N.porChave.rh : null;
    const campo = modelo && (modelo.campos || []).find(x => x.k === chave);
    return campo ? campo.rot : chave;
  }

  /* ═══════════════════════════════════════════════════════════════════
     TELA 2 — PROPOSTA E ADMISSÃO
     ═══════════════════════════════════════════════════════════════════ */

  const PROPOSTA_ROTULOS = {
    rascunho:    ['rh.propDraft', 'Rascunho'],
    enviada:     ['rh.propSent', 'Enviada'],
    visualizada: ['rh.propSeen', 'Visualizada'],
    aceita:      ['rh.propAccepted', 'Aceita'],
    admissao:    ['rh.propAdmitted', 'Admissão'],
  };
  /* ── ÍCONES DE TRAÇO, E NÃO EMOJI ───────────────────────────────────────
     Emoji é desenho de outra pessoa: muda de cara em cada sistema, entra
     colorido no meio de uma tela sóbria e, num documento de trabalho, tem
     cara de recado de celular. Estes são traços simples, na cor do texto —
     e os mesmos do resto do app. */
  const ICO = {
    cargo:    '<path d="M2 7h20v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    salario:  '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    beneficio:'<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    contrato: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    jornada:  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    inicio:   '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    prazo:    '<circle cx="12" cy="12" r="10"/><polyline points="12 7 12 12 15 15"/>',
    pessoa:   '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    tarefas:  '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    empresa:  '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
    email:    '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    telefone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    baixar:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    enviar:   '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    conversa: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    rascunho: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    olho:     '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    certo:    '<polyline points="20 6 9 17 4 12"/>',
    festa:    '<path d="M20 6 9 17l-5-5"/><path d="M14 3h7v7"/>',
    lupa:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    trocar:   '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    mais:     '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    alerta:   '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    seta:     '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    estrela:  '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    alvo:     '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    sol:      '<circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    pulso:    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    upload:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    escudo:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  };
  const svg = (nome, tam) => (ICO[nome]
    ? '<svg viewBox="0 0 24 24" width="' + (tam || 14) + '" height="' + (tam || 14) +
      '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + ICO[nome] + '</svg>'
    : '');
  const ICONE_ETAPA = {
    rascunho: svg('rascunho', 15), enviada: svg('enviar', 15),
    visualizada: svg('olho', 15), aceita: svg('certo', 15), admissao: svg('festa', 15),
  };

  /* Um lugar só decide como cada etapa se chama na tela — o menu "Propostas"
     do app.js lê daqui em vez de manter uma segunda lista que sai de sincronia. */
  function rotuloProposta(etapa) {
    const par = PROPOSTA_ROTULOS[etapa];
    return par ? t(par[0], par[1]) : String(etapa || '');
  }

  /* Modalidade de contratação: o rótulo é o mesmo do painel de vagas. */
  function rotuloContrato(chave) {
    if (!chave) return '';
    return typeof global._vagaRotulo === 'function'
      ? global._vagaRotulo('contrato', chave) : String(chave).toUpperCase();
  }

  /* ═══════════════════════════════════════════════════════════════════
     O PAINEL DE PROPOSTAS
     ═══════════════════════════════════════════════════════════════════
     Era um menu suspenso com nomes soltos, e um menu não é lugar para
     acompanhar negociação: não mostra valor, não mostra prazo, não separa
     quem está esperando resposta de quem já aceitou, e some ao primeiro
     clique fora.

     Quatro grupos, na ordem em que a coisa acontece: quem CHEGOU nas últimas
     etapas do funil e ainda não recebeu proposta, quem está EM NEGOCIAÇÃO,
     quem ACEITOU e falta admitir, e quem já ENTROU no time. Assim a tela
     responde de relance a pergunta que se faz aqui — "de quem eu estou
     esperando resposta?" — e mostra também os que vêm a seguir. */
  /* OS GRUPOS SEGUEM A COLUNA DO FUNIL, e não o histórico da proposta. É como
     ela lê o quadro: quem está na Admissão já aceitou; as duas últimas colunas
     são "chegando ao fim". O histórico serve para dizer em que pé está a
     conversa, não para decidir de que grupo a pessoa é — alguém pode aceitar
     por telefone e o carimbo só entrar depois.

     A ordem importa: cada pessoa cai no grupo mais adiantado que a descreve, e
     em nenhum outro. Aparecer em dois lugares é o que fazia a tela se
     contradizer. */
  function grupoDasPropostas() {
    if (!global.MD_RH) return { chegando: [], negociando: [], aceitas: [], admitidos: [] };
    const totais = global.MD_RH.etapas().length;
    const saida = { chegando: [], negociando: [], aceitas: [], admitidos: [] };

    registros().forEach(rec => {
      if (rec.template !== 'rh' || global.MD_RH.reprovado(rec)) return;
      const s = global.propostaSituacao(rec);
      const colab = colaboradorDe(rec);
      if (colab) { saida.admitidos.push({ rec, s, colab }); return; }

      const e = global.MD_RH.etapaDe(rec);
      const naAdmissao = e.concluido || e.indice >= totais - 1;
      if (naAdmissao) { saida.aceitas.push({ rec, s }); return; }
      if (s.existe) { saida.negociando.push({ rec, s }); return; }
      if (e.indice >= Math.max(0, totais - 2)) saida.chegando.push({ rec, s });
    });
    return saida;
  }

  function abrirPropostas() {
    document.querySelector('.pr-bg')?.remove();
    const bg = document.createElement('div');
    bg.className = 'modal-bg pr-bg';
    bg.innerHTML = `
      <div class="modal pr-tela">
        <div class="pa-hero">
          <div class="pa-h1">${esc(t('rh.offers', 'Propostas'))}</div>
          <button class="vg-fechar" id="pr-fechar"
                  aria-label="${attr(t('common.close', 'Fechar'))}">✕</button>
        </div>
        <div class="pr-corpo" id="pr-corpo"></div>
      </div>`;
    document.body.appendChild(bg);
    bg.querySelector('#pr-fechar').addEventListener('click', () => bg.remove());
    bg.addEventListener('click', ev => {
      const caminho = ev.composedPath ? ev.composedPath() : [ev.target];
      if (!caminho.includes(bg.querySelector('.pr-tela'))) bg.remove();
    });
    pintarPropostas();
  }

  function pintarPropostas() {
    const host = document.getElementById('pr-corpo');
    if (!host) return;
    const g = grupoDasPropostas();

    const cartao = ({ rec, s, colab }) => {
      const p = global.propostaDe(rec);
      const vaga = (global.MD_RH && global.MD_RH.vagaDe) ? global.MD_RH.vagaDe(rec) : '';
      const inicial = ((rec.name || '?').trim()[0] || '?').toUpperCase();
      const prazo = p.prazo ? diasEntre(hoje(), p.prazo) : null;
      return `
        <article class="pr-card" data-abrir="${attr(rec.id)}" tabindex="0">
          <span class="pr-av">${esc(inicial)}</span>
          <div class="pr-id">
            <div class="pr-nome">${esc(rec.name || '—')}</div>
            <div class="pr-sub">${esc(p.cargo || vaga || '—')}</div>
          </div>
          <div class="pr-meta">
            ${p.salario ? `<span class="pr-valor">${esc(dinheiro(p.salario))}</span>` : ''}
            ${colab ? `<span class="pr-pill ok">${esc(t('rh.sit_ativo', 'Ativo'))}</span>`
              : s.existe ? `<span class="pr-pill">${esc(rotuloProposta(s.etapa))}</span>` : ''}
            ${p.inicio ? `<span class="pr-quando">${esc(t('rh.startsOn', 'início {data}',
              { data: data(p.inicio) }))}</span>` : ''}
            ${prazo !== null && !colab && s.indice < 3
              ? `<span class="pr-quando ${prazo < 0 ? 'grave' : ''}">${esc(prazo < 0
                  ? t('rh.overdueDays', 'venceu há {n} dia(s)', { n: -prazo })
                  : prazo === 0 ? t('rh.dueToday', 'vence hoje')
                  : t('rh.dueInDays', 'faltam {n} dia(s)', { n: prazo }))}</span>` : ''}
          </div>
          ${s.existe && !colab ? `<button type="button" class="pr-remover"
            data-remover="${attr(rec.id)}"
            title="${attr(t('rh.removeOffer', 'Remover proposta'))}"
            aria-label="${attr(t('rh.removeOffer', 'Remover proposta'))}">✕</button>` : ''}
        </article>`;
    };

    const bloco = (titulo, explicacao, itens) => `
      <section class="pr-bloco">
        <header class="pr-bloco-cab">
          <span>${esc(titulo)}</span>
          <span class="rhv-bloco-n">${itens.length}</span>
        </header>
        <div class="pr-bloco-sub">${esc(explicacao)}</div>
        <div class="pr-lista">${itens.map(cartao).join('') ||
          `<div class="rhv-vazio">${esc(t('rh.nobodyHere', 'Ninguém nesta situação agora.'))}</div>`}</div>
      </section>`;

    host.innerHTML =
      bloco(t('rh.grpNegotiating', 'Em negociação'),
        t('rh.grpNegotiatingSub', 'Proposta feita, esperando a resposta do candidato.'),
        g.negociando) +
      bloco(t('rh.grpAccepted', 'Aceitas — falta admitir'),
        t('rh.grpAcceptedSub', 'Estão na coluna Admissão. Converta em colaborador para entrar no quadro do RH.'),
        g.aceitas) +
      bloco(t('rh.grpArriving', 'Chegando ao fim do funil'),
        t('rh.grpArrivingSub', 'Nas duas últimas colunas, ainda sem proposta registrada.'),
        g.chegando) +
      bloco(t('rh.grpHired', 'Já no time'),
        t('rh.grpHiredSub', 'Viraram colaboradores. A ficha do candidato continua guardada.'),
        g.admitidos);

    host.querySelectorAll('[data-remover]').forEach(b => {
      b.addEventListener('click', async ev => {
        ev.stopPropagation();
        if (typeof global.removerProposta !== 'function') return;
        await global.removerProposta(b.dataset.remover);
        pintarPropostas();
      });
    });
    host.querySelectorAll('[data-abrir]').forEach(el => {
      const abrir = () => abrirProposta(el.dataset.abrir);
      el.addEventListener('click', abrir);
      el.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        abrir();
      });
    });
  }

  function abrirProposta(recId) {
    const rec = registros().find(r => r.id === recId);
    if (!rec) return;
    document.querySelector('.pa-bg')?.remove();
    const bg = document.createElement('div');
    bg.className = 'modal-bg pa-bg';
    bg.dataset.rec = recId;
    bg.innerHTML = `
      <div class="modal pa-tela">
        <div class="pa-hero">
          <button class="pa-voltar" id="pa-voltar"
                  aria-label="${attr(t('app.back', '← Voltar'))}">←</button>
          <div class="pa-h1">${esc(t('rh.offerAdmission', 'Proposta e Admissão'))}</div>
        </div>
        <div class="pa-corpo" id="pa-corpo"></div>
      </div>`;
    document.body.appendChild(bg);
    bg.querySelector('#pa-voltar').addEventListener('click', () => bg.remove());
    bg.addEventListener('click', ev => {
      const caminho = ev.composedPath ? ev.composedPath() : [ev.target];
      if (!caminho.includes(bg.querySelector('.pa-tela'))) bg.remove();
    });
    document.addEventListener('keydown', function esc2(ev) {
      if (ev.key !== 'Escape') return;
      document.removeEventListener('keydown', esc2);
      bg.remove();
    });
    pintarProposta(recId);
  }

  function pintarProposta(recId) {
    const host = document.querySelector('.pa-bg[data-rec="' + (window.CSS && CSS.escape
      ? CSS.escape(recId) : recId) + '"] .pa-corpo') || document.getElementById('pa-corpo');
    if (!host) return;
    const rec = registros().find(r => r.id === recId);
    if (!rec) return;

    const p = global.propostaDe(rec);
    const s = global.propostaSituacao(rec);
    const vaga = (global.MD_RH && global.MD_RH.vagaDe) ? global.MD_RH.vagaDe(rec) : '';
    const checklist = global.admissaoChecklist(rec);
    const feitos = checklist.filter(i => i.ok).length;
    const jaColab = colaboradorDe(rec);
    const inicial = ((rec.name || '?').trim()[0] || '?').toUpperCase();

    const linha = (ico, rot, valor) => `
      <div class="pa-linha">
        <span class="pa-linha-ico">${svg(ico)}</span>
        <span class="pa-linha-rot">${esc(rot)}</span>
        <span class="pa-linha-val">${esc(valor || '—')}</span>
      </div>`;

    /* TODA ETAPA PODE SER DESFEITA, e toda etapa pode ser registrada — em
       qualquer ordem. Antes o botão só aparecia na etapa seguinte à atual, e
       registrar por engano (ou converter em colaborador, que carimba a
       admissão) trancava o histórico num estado sem volta: as etapas
       anteriores não tinham mais botão e as carimbadas não tinham como ser
       desmarcadas. Um registro de datas que não se corrige é pior do que
       nenhum — obriga a pessoa a conviver com uma data errada para sempre. */
    const passos = global.PROPOSTA_ETAPAS.map(etapa => {
      const carimbo = p.historico.find(h => h.etapa === etapa);
      const feito = !!carimbo;
      const quando = carimbo && carimbo.ts
        ? new Date(carimbo.ts).toLocaleString(
            typeof global._appLocale === 'function' ? global._appLocale() : 'pt-BR',
            { day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit' })
        : '';
      const quem = carimbo && carimbo.por ? '@' + carimbo.por : '';
      return `
        <li class="pa-passo${feito ? ' feito' : ''}">
          <span class="pa-passo-marca">${feito ? svg('certo', 11) : ''}</span>
          <span class="pa-passo-ico" aria-hidden="true">${ICONE_ETAPA[etapa] || ''}</span>
          <div class="pa-passo-txt">
            <div class="pa-passo-nome">${esc(t(PROPOSTA_ROTULOS[etapa][0], PROPOSTA_ROTULOS[etapa][1]))}</div>
            <div class="pa-passo-sub">${feito ? esc([quando, quem].filter(Boolean).join(' · ')) : '—'}</div>
          </div>
          <button type="button" class="pa-passo-btn" data-etapa="${attr(etapa)}"
                  data-desfazer="${feito ? '1' : ''}">${
            esc(feito ? t('rh.undoStep', 'Desfazer') : t('rh.stampStep', 'Registrar'))}</button>
        </li>`;
    }).join('');

    host.innerHTML = `
      <section class="pa-pessoa">
        <span class="pa-av" id="pa-av">${esc(inicial)}</span>
        <div class="pa-pessoa-id">
          <div class="pa-pessoa-linha">
            <span class="pa-nome">${esc(rec.name || '—')}</span>
            ${rec.email ? `<a class="pa-contato" href="mailto:${attr(rec.email)}"
              title="${attr(rec.email)}">${svg('email', 13)}</a>` : ''}
            ${rec.phone ? `<a class="pa-contato" href="tel:${attr(String(rec.phone).replace(/[^\d+]/g, ''))}"
              title="${attr(rec.phone)}">${svg('telefone', 13)}</a>` : ''}
          </div>
          <div class="pa-rot">${esc(t('rh.iaRoleLabel', 'Vaga'))}</div>
          <div class="pa-vaga">${esc(vaga || '—')}</div>
        </div>
        <div class="pa-status">
          <div class="pa-rot">${esc(t('rh.currentStatus', 'Status atual'))}</div>
          <span class="pa-pill${s.existe ? '' : ' vazio'}">${esc(s.existe
            ? rotuloProposta(s.etapa) : t('rh.noOffer', 'Sem proposta'))}</span>
        </div>
      </section>

      <div class="pa-grid">
        <section class="pa-card">
          <header class="pa-card-cab">
            <span>${esc(t('rh.offerSummary', 'Resumo da proposta'))}</span>
            <button type="button" class="pa-link" id="pa-editar">${
              esc(t('rh.editOffer', 'Editar'))}</button>
            ${s.existe ? `<button type="button" class="pa-link pa-link-perigo" id="pa-remover">${
              esc(t('rh.removeOffer', 'Remover'))}</button>` : ''}
          </header>
          <div class="pa-tabela">
            ${linha('cargo', t('rh.role', 'Cargo'), p.cargo)}
            ${linha('tarefas', t('rh.duties', 'O que vai fazer'), p.descricao)}
            ${linha('salario', t('rh.salary', 'Salário'), p.salario ? dinheiro(p.salario) : '')}
            ${linha('beneficio', t('rh.benefits', 'Benefícios'), p.beneficios)}
            ${linha('contrato', t('rh.contract', 'Modalidade'), rotuloContrato(p.contrato))}
            ${linha('jornada', t('rh.workload', 'Jornada'), p.jornada)}
            ${linha('inicio', t('rh.startDate', 'Data de início'), p.inicio ? data(p.inicio) : '')}
            ${linha('prazo', t('rh.answerBy', 'Prazo para resposta'), p.prazo ? data(p.prazo) : '')}
            ${linha('empresa', t('rh.company', 'Empresa'), p.empresa)}
            ${linha('pessoa', t('rh.owner', 'Responsável'), p.responsavel)}
            ${linha('email', t('rh.replyTo', 'Resposta para'), p.emailResposta)}
          </div>
          ${p.observacao ? `<div class="pa-obs">${esc(p.observacao)}</div>` : ''}
        </section>

        <section class="pa-card">
          <header class="pa-card-cab">
            <span>${esc(t('rh.offerHistory', 'Histórico da proposta'))}</span>
          </header>
          <ol class="pa-timeline">${passos}</ol>
        </section>
      </div>

      <div class="pa-acoes">
        <button type="button" class="pa-btn" id="pa-pdf">${svg('baixar')} ${
          esc(t('rh.downloadPdf', 'Baixar PDF'))}</button>
        <button type="button" class="pa-btn" id="pa-enviar">${svg('enviar')} ${
          esc(t('rh.sendByEmail', 'Enviar por e-mail'))}</button>
        <button type="button" class="pa-btn" id="pa-contra">${svg('conversa')} ${
          esc(t('rh.counterOffer', 'Registrar contraproposta'))}</button>
        <button type="button" class="pa-btn-pri" id="pa-converter"${jaColab ? ' disabled' : ''}>
          ${esc(jaColab ? t('rh.alreadyOnTeam', 'Já é colaborador')
                        : t('rh.convert', 'Converter em colaborador'))}</button>
      </div>
      ${jaColab ? `
        <div class="pa-vinculo">
          <span>${esc(t('rh.linkedTo',
            'Esta ficha está ligada ao colaborador {nome}, admitido em {data}.',
            { nome: jaColab.nome, data: data(jaColab.admitidoEm) }))}</span>
          <button type="button" class="pa-link" id="pa-ver-colab">${
            esc(t('rh.openCollaborator', 'Abrir a ficha dele'))}</button>
          <button type="button" class="pa-link pa-link-perigo" id="pa-desvincular">${
            esc(t('rh.unlink', 'Desvincular'))}</button>
        </div>` : ''}

      <section class="pa-card">
        <header class="pa-card-cab">
          <span>${esc(t('rh.admissionChecklist', 'Checklist de admissão'))}</span>
          <span class="pa-chip">${esc(t('rh.doneOf', '{feitos}/{total} concluído(s)',
            { feitos, total: checklist.length }))}</span>
          <button type="button" class="pa-link" id="pa-add-item">＋ ${
            esc(t('rh.addItem', 'Item'))}</button>
        </header>
        <table class="pa-check">
          <thead><tr>
            <th>${esc(t('rh.item', 'Item'))}</th>
            <th>${esc(t('rh.owner', 'Responsável'))}</th>
            <th>${esc(t('rh.status', 'Status'))}</th>
            <th></th>
          </tr></thead>
          <tbody>${checklist.map((i, idx) => `
            <tr>
              <td>
                <div class="pa-item-nome">${esc(i.t)}</div>
                ${i.sub ? `<div class="pa-item-sub">${esc(i.sub)}</div>` : ''}
              </td>
              <td><input class="pa-resp" data-resp="${idx}" value="${attr(i.resp || '')}"
                    placeholder="${attr(t('rh.whoDoes', 'quem faz'))}" maxlength="80"></td>
              <td><button type="button" class="pa-st ${i.ok ? 'ok' : 'pend'}" data-ok="${idx}">${
                i.ok ? '✓ ' + esc(t('rh.done', 'Concluído'))
                     : '◷ ' + esc(t('rh.pending', 'Pendente'))}</button></td>
              <td><button type="button" class="rhv-kebab" data-item="${idx}"
                    aria-label="${attr(t('rh.rowActions', 'Ações'))}">⋮</button></td>
            </tr>`).join('')}</tbody>
        </table>
      </section>`;

    /* A foto vem do IndexedDB, depois do desenho — a tela não espera o disco
       para mostrar um círculo. */
    if (typeof global.fotoDoRegistro === 'function') {
      global.fotoDoRegistro(rec.id).then(url => {
        const seguro = typeof global.safePhotoUrlRaw === 'function'
          ? global.safePhotoUrlRaw(url) : '';
        const alvo = host.querySelector('#pa-av');
        if (!seguro || !alvo || !alvo.isConnected) return;
        alvo.textContent = '';
        alvo.classList.add('com-foto');
        const img = document.createElement('img');
        img.alt = '';
        img.src = seguro;          // propriedade: nada de escapar para atributo
        alvo.appendChild(img);
      }).catch(() => {});
    }

    host.querySelector('#pa-editar').addEventListener('click', () => formularioProposta(recId));
    host.querySelector('#pa-remover')?.addEventListener('click', async () => {
      if (typeof global.removerProposta !== 'function') return;
      await global.removerProposta(recId);
      pintarProposta(recId);
    });
    host.querySelectorAll('[data-etapa]').forEach(b => {
      b.addEventListener('click', async () => {
        if (b.dataset.desfazer) await global.desfazerEtapaProposta(recId, b.dataset.etapa);
        else await global.salvarProposta(recId, {}, b.dataset.etapa);
        pintarProposta(recId);
      });
    });

    /* O VÍNCULO PRECISA SER VISÍVEL E DESFAZÍVEL. "Já é colaborador" sozinho
       não diz a QUEM a ficha está ligada — e num processo com dois homônimos,
       ou depois de um cadastro de teste, é exatamente isso que a pessoa
       precisa saber para entender por que o botão está apagado. */
    host.querySelector('#pa-ver-colab')?.addEventListener('click', () => {
      formularioColaborador(jaColab.id);
    });
    host.querySelector('#pa-desvincular')?.addEventListener('click', async () => {
      const ok = typeof global.confirmarAcao === 'function'
        ? await global.confirmarAcao(
            t('rh.unlink', 'Desvincular'),
            t('rh.unlinkAsk',
              'A ficha de {cand} deixa de estar ligada ao colaborador {colab}. Ninguém é excluído: os dois continuam existindo, separados.',
              { cand: rec.name || '—', colab: jaColab.nome }),
            t('rh.unlink', 'Desvincular'))
        : true;
      if (!ok) return;
      await global.atualizarColaborador(jaColab.id, { origemCandidatoId: '' });
      pintarProposta(recId);
      pintarVisaoRH();
    });

    host.querySelector('#pa-pdf').addEventListener('click', () => baixarProposta(recId));
    host.querySelector('#pa-enviar').addEventListener('click', () => enviarProposta(recId));
    host.querySelector('#pa-contra').addEventListener('click', () => formularioContraproposta(recId));
    host.querySelector('#pa-converter').addEventListener('click', async () => {
      if (jaColab) return;
      const ok = typeof global.confirmarAcao === 'function'
        ? await global.confirmarAcao(
            t('rh.convert', 'Converter em colaborador'),
            t('rh.convertAsk',
              '{nome} entra no quadro de colaboradores. A ficha do candidato continua no funil, marcada como admitida.',
              { nome: rec.name || '—' }),
            t('rh.convert', 'Converter em colaborador'))
        : true;
      if (!ok) return;
      const c = await global.converterEmColaborador(recId);
      if (c) pintarProposta(recId);
    });

    host.querySelector('#pa-add-item').addEventListener('click', async () => {
      const itens = checklist.concat([{ t: t('rh.newItem', 'Novo item'), sub: '', ok: false, resp: '' }]);
      await global.salvarAdmissaoChecklist(recId, itens);
      pintarProposta(recId);
    });
    host.querySelectorAll('[data-ok]').forEach(b => {
      b.addEventListener('click', async () => {
        const i = Number(b.dataset.ok);
        const itens = checklist.map((it, idx) => idx === i ? Object.assign({}, it, { ok: !it.ok }) : it);
        await global.salvarAdmissaoChecklist(recId, itens);
        pintarProposta(recId);
      });
    });
    host.querySelectorAll('[data-resp]').forEach(inp => {
      inp.addEventListener('change', async () => {
        const i = Number(inp.dataset.resp);
        const itens = checklist.map((it, idx) =>
          idx === i ? Object.assign({}, it, { resp: inp.value }) : it);
        await global.salvarAdmissaoChecklist(recId, itens);
      });
    });
    host.querySelectorAll('[data-item]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const i = Number(btn.dataset.item);
        if (typeof global._cdashMenu !== 'function') return;
        global._cdashMenu(btn, [
          { label: t('rh.renameItem', 'Renomear item'),
            onClick: () => renomearItem(recId, checklist, i) },
          { label: t('app.delete', 'Excluir'), danger: true,
            onClick: async () => {
              await global.salvarAdmissaoChecklist(recId, checklist.filter((_, idx) => idx !== i));
              pintarProposta(recId);
            } },
        ]);
      });
    });
  }

  function renomearItem(recId, checklist, i) {
    _janelaSimples(t('rh.renameItem', 'Renomear item'), [
      { id: 'nome', rot: t('rh.item', 'Item'), valor: checklist[i].t, max: 120 },
      { id: 'sub', rot: t('rh.detail', 'Detalhe'), valor: checklist[i].sub || '', max: 160 },
    ], async vals => {
      if (!vals.nome.trim()) return;
      const itens = checklist.map((it, idx) => idx === i
        ? Object.assign({}, it, { t: vals.nome.trim(), sub: vals.sub.trim() }) : it);
      await global.salvarAdmissaoChecklist(recId, itens);
      pintarProposta(recId);
    });
  }

  /* Janelinha de campos, para as edições curtas. Não usa prompt(): diálogo
     nativo trava a página inteira e não tem como ser estilizado nem traduzido. */
  function _janelaSimples(titulo, campos, aoConfirmar) {
    document.querySelector('.pas-bg')?.remove();
    const bg = document.createElement('div');
    bg.className = 'modal-bg pas-bg';
    bg.innerHTML = `
      <div class="modal pas-modal">
        <div class="m-h1">${esc(titulo)}</div>
        ${campos.map(c => `
          <label class="crm-modal-lbl" for="pas-${attr(c.id)}">${esc(c.rot)}</label>
          ${c.tipo === 'longo'
            ? `<textarea class="m-inp" id="pas-${attr(c.id)}" rows="3" maxlength="${c.max || 600}">${esc(c.valor || '')}</textarea>`
            : c.tipo === 'selecao'
            ? `<select class="m-inp" id="pas-${attr(c.id)}">${(c.opcoes || []).map(o =>
                `<option value="${attr(o.valor)}"${o.valor === c.valor ? ' selected' : ''}>${
                  esc(o.rot)}</option>`).join('')}</select>`
            : `<input class="m-inp" id="pas-${attr(c.id)}" type="${attr(c.tipo || 'text')}"
                 ${c.tipo === 'date' ? 'style="color-scheme:dark"' : ''}
                 maxlength="${c.max || 120}" value="${attr(c.valor || '')}">`}`).join('')}
        <div class="m-btns">
          <button class="m-cancel" id="pas-cancel">${esc(t('app.cancel', 'Cancelar'))}</button>
          <button class="m-confirm" id="pas-ok">${esc(t('app.save', 'Salvar'))}</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const fechar = () => bg.remove();
    bg.querySelector('#pas-cancel').addEventListener('click', fechar);
    bg.addEventListener('click', ev => { if (ev.target === bg) fechar(); });
    bg.querySelector('#pas-ok').addEventListener('click', async () => {
      const vals = {};
      campos.forEach(c => { vals[c.id] = (bg.querySelector('#pas-' + c.id) || {}).value || ''; });
      fechar();
      await aoConfirmar(vals);
    });
    setTimeout(() => bg.querySelector('.m-inp')?.focus(), 80);
  }

  function formularioProposta(recId) {
    const rec = registros().find(r => r.id === recId);
    if (!rec) return;
    const p = global.propostaDe(rec);
    const vaga = (global.MD_RH && global.MD_RH.vagaDe) ? global.MD_RH.vagaDe(rec) : '';
    const daVaga = (typeof global._vagaPorId === 'function' && rec.campos)
      ? global._vagaPorId(rec.campos.vagaId) : null;
    const contratos = (global.VAGA_CONTRATO_OPCOES || []).map(c => ({
      valor: c, rot: rotuloContrato(c),
    }));
    _janelaSimples(t('rh.editOfferTitle', 'Proposta'), [
      { id: 'cargo', rot: t('rh.role', 'Cargo'), valor: p.cargo || vaga, max: 120 },
      /* O QUE A PESSOA VAI FAZER. É a primeira pergunta de quem recebe uma
         proposta, e não existia nem no resumo nem no PDF. */
      { id: 'descricao', rot: t('rh.duties', 'O que vai fazer'),
        valor: p.descricao || (daVaga && daVaga.descricao) || '', tipo: 'longo', max: 900 },
      { id: 'salario', rot: t('rh.salary', 'Salário'), valor: p.salario || '', tipo: 'number' },
      { id: 'beneficios', rot: t('rh.benefits', 'Benefícios'), valor: p.beneficios,
        tipo: 'longo', max: 400 },
      /* Faltava o campo, e a tela mostrava a linha "Modalidade" para sempre
         vazia: ela cobrava um dado que não havia como informar. */
      { id: 'contrato', rot: t('rh.contract', 'Modalidade'),
        valor: p.contrato || (daVaga && daVaga.contrato) || '', tipo: 'selecao',
        opcoes: [{ valor: '', rot: t('app.select', 'Selecione') }].concat(contratos) },
      { id: 'jornada', rot: t('rh.workload', 'Jornada'), valor: p.jornada, max: 80 },
      { id: 'inicio', rot: t('rh.startDate', 'Data de início'), valor: p.inicio, tipo: 'date' },
      { id: 'prazo', rot: t('rh.answerBy', 'Prazo para resposta'), valor: p.prazo, tipo: 'date' },
      { id: 'departamento', rot: t('rh.department', 'Departamento'),
        valor: p.departamento || (daVaga && daVaga.departamento) || '', max: 80 },
      { id: 'empresa', rot: t('rh.company', 'Empresa (aparece no topo do PDF)'),
        valor: p.empresa, max: 80 },
      { id: 'responsavel', rot: t('rh.owner', 'Responsável (assina a carta)'),
        valor: p.responsavel, max: 80 },
      /* PARA ONDE O CANDIDATO RESPONDE. Sem isto ele assina a proposta e não
         tem para quem devolver: o remetente do MyDesk é endereço de sistema e
         não lê resposta de ninguém. */
      { id: 'emailResposta', rot: t('rh.replyToField', 'E-mail para a resposta do candidato'),
        valor: p.emailResposta, tipo: 'email', max: 160 },
      { id: 'telefone', rot: t('rh.phoneOnLetter', 'Telefone no papel timbrado (opcional)'),
        valor: p.telefone, max: 40 },
    ], async vals => {
      await global.salvarProposta(recId, {
        cargo: vals.cargo, descricao: vals.descricao,
        salario: Number(vals.salario) || 0,
        beneficios: vals.beneficios, contrato: vals.contrato, jornada: vals.jornada,
        inicio: vals.inicio, prazo: vals.prazo,
        responsavel: vals.responsavel, departamento: vals.departamento,
        empresa: vals.empresa, emailResposta: vals.emailResposta, telefone: vals.telefone,
      });
      pintarProposta(recId);
    });
  }

  /* Contraproposta NÃO sobrescreve o que foi oferecido. Ela é registro do que
     a pessoa pediu — as duas informações interessam, e trocar uma pela outra
     apagaria a negociação. */
  function formularioContraproposta(recId) {
    const rec = registros().find(r => r.id === recId);
    if (!rec) return;
    const p = global.propostaDe(rec);
    _janelaSimples(t('rh.counterOffer', 'Registrar contraproposta'), [
      { id: 'valor', rot: t('rh.counterAsked', 'Valor pedido'), valor: '', tipo: 'number' },
      { id: 'nota', rot: t('rh.counterNote', 'O que foi conversado'), valor: '',
        tipo: 'longo', max: 400 },
    ], async vals => {
      const quando = new Date().toLocaleDateString(
        typeof global._appLocale === 'function' ? global._appLocale() : 'pt-BR');
      const linha = t('rh.counterLine', 'Contraproposta em {data}: {valor}{nota}', {
        data: quando,
        valor: vals.valor ? dinheiro(Number(vals.valor)) : t('rh.noValue', 'sem valor informado'),
        nota: vals.nota.trim() ? ' — ' + vals.nota.trim() : '',
      });
      await global.salvarProposta(recId, {
        observacao: [p.observacao, linha].filter(Boolean).join('\n').slice(0, 1200),
      });
      pintarProposta(recId);
      aviso('✓', t('rh.counterSaved', 'Contraproposta registrada.'));
    });
  }

  /* ── A CARTA ───────────────────────────────────────────────────────────
     Os textos moram aqui porque são traduzidos; o desenho do papel mora em
     proposta-pdf.js, que roda igual no navegador e no servidor — o arquivo
     que ela baixa e o que o candidato recebe têm de ser o mesmo documento. */
  /* ── O TEXTO DA CARTA ───────────────────────────────────────────────────
     É o modelo que ela escreveu no Word, palavra por palavra. O que este
     código faz é só preencher o que depende de dado — nome da vaga, nome da
     pessoa, data de início, as condições e o endereço de resposta — e é
     exatamente o que ela deixou marcado no arquivo.

     Nada de "Atenciosamente" com o nome de quem assina no fim: no modelo o
     documento termina na assinatura DO CANDIDATO, que é quem tem de assinar.
     Quem enviou já está dito no parágrafo de aceite, com o e-mail. */
  function dadosDaCarta(rec) {
    const p = global.propostaDe(rec);
    const vaga = (global.MD_RH && global.MD_RH.vagaDe) ? global.MD_RH.vagaDe(rec) : '';
    const cargo = p.cargo || vaga;
    const comoCargo = cargo ? t('rh.letterAsRole', ' como {cargo}', { cargo }) : '';
    return {
      titulo: t('rh.letterTitle', 'Proposta de Contratação'),
      linhaVaga: cargo ? t('rh.letterVacancy', 'Vaga de {vaga}', { vaga: cargo }) : '',
      saudacao: t('rh.letterHi', 'Prezada(o) {nome},', { nome: rec.name || '' }),
      paragrafos: [
        t('rh.letterP1',
          'Obrigado por todo o cuidado e o tempo que você dedicou ao nosso processo seletivo. Conversamos com muita gente boa, e a sua trajetória foi a que mais se aproximou do que procurávamos.',
          {}),
        t('rh.letterP2',
          'É com muita satisfação que convidamos você a fazer parte da nossa equipe{cargo}.',
          { cargo: comoCargo }),
        t('rh.letterP4',
          'Ficaríamos felizes em ter você conosco a partir de {inicio}. Abaixo estão as condições que combinamos. Se algo aqui não corresponder ao que conversamos, por favor, informe antes de assinar; preferimos acertar agora do que começar com dúvida.',
          { inicio: p.inicio ? data(p.inicio) : t('rh.letterSoon', 'data a combinar') }),
      ],
      tituloCondicoes: t('rh.letterTerms', 'CONDIÇÕES DA PROPOSTA'),
      condicoes: [
        [t('rh.role', 'Cargo'), cargo],
        [t('rh.salary', 'Salário'), p.salario ? dinheiro(p.salario) : ''],
        [t('rh.benefits', 'Benefícios'), p.beneficios],
        [t('rh.contract', 'Modalidade'), rotuloContrato(p.contrato)],
        [t('rh.workload', 'Jornada'), p.jornada],
        [t('rh.startDate', 'Data de início'), p.inicio ? data(p.inicio) : ''],
        /* O QUE A PESSOA VAI FAZER É DADO, E NÃO FRASE.
           Era um parágrafo: "No dia a dia, você vai {descrição}". Quem
           preenche o campo escreve o que tem na cabeça — "Software", por
           exemplo — e a carta saía dizendo "No dia a dia, você vai Software.".
           Nenhum molde de frase sobrevive a todo texto que cabe num campo
           livre. Como linha do quadro, com rótulo próprio, qualquer conteúdo
           lê certo: substantivo, verbo ou lista. */
        [t('rh.letterDuties', 'O que você vai fazer'), p.descricao],
      ],
      paragrafosFinais: [
        p.emailResposta
          ? t('rh.letterReply',
              'Para aceitar, assine no campo abaixo e devolva este documento para {email}{prazo}. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.',
              { email: p.emailResposta,
                prazo: p.prazo ? t('rh.letterUntil', ' até {data}', { data: data(p.prazo) }) : '' })
          : t('rh.letterReplyNoMail',
              'Para aceitar, assine no campo abaixo e devolva este documento a quem enviou esta proposta. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.'),
      ],
      rotuloAssinatura: t('rh.signHere', 'Assinatura do(a) candidato(a)'),
      rotuloData: t('rh.signDate', 'Data:  ___/___/______'),
    };
  }

  /* A marca do papel timbrado. Buscada só quando alguém gera uma proposta —
     pôr 19 kB de PNG dentro do JS faria todo mundo baixar o logo do documento
     para abrir o quadro. Falhar aqui não impede nada: sai o documento sem a
     marca, que é melhor do que não sair documento. */
  let _logoCache = null;
  async function bytesDaMarca() {
    if (_logoCache) return _logoCache;
    try {
      const r = await fetch('img/logo-proposta.png?v=1');
      if (!r.ok) return null;
      _logoCache = new Uint8Array(await r.arrayBuffer());
      return _logoCache;
    } catch (_) { return null; }
  }

  function nomeDoArquivo(rec) {
    const limpo = String(rec.name || 'proposta').normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '').slice(0, 60);
    return t('rh.offerFile', 'Proposta') + '-' + (limpo || 'candidato') + '.pdf';
  }

  /* Baixa o ARQUIVO. Antes isto abria a caixa de impressão do navegador e
     dependia de a pessoa escolher "Salvar como PDF" — o que não é baixar um
     PDF, e não servia de jeito nenhum para anexar num e-mail. */
  async function baixarProposta(recId) {
    const rec = registros().find(r => r.id === recId);
    if (!rec || !global.MD_PROPOSTA_PDF) return;
    const carta = dadosDaCarta(rec);
    carta.logo = await bytesDaMarca();
    const bytes = global.MD_PROPOSTA_PDF.paraUint8(carta);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeDoArquivo(rec);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ── DE QUAL MODELO É A PROPOSTA QUE VAI NO E-MAIL ─────────────────────
     O MyDesk monta uma carta com o que está na proposta gravada — e ela serve
     para a maioria. Mas escritório que já tem o próprio papel timbrado, com o
     texto que o jurídico aprovou, não vai trocá-lo pelo nosso: ou manda o
     dele, ou manda por fora do MyDesk e o processo perde o registro.

     Então a pergunta é feita ali, no clique, com as duas saídas à vista.
     Nenhuma delas é "a certa": a primeira é a que já vinha pronta, a segunda
     é a de quem tem documento próprio. */
  function escolherModelo() {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg pm-bg';
      bg.innerHTML = `
        <div class="modal pm-modal">
          <div class="pm-h1">${esc(t('rh.whichTemplate', 'Qual proposta enviar?'))}</div>
          <div class="pm-sub">${esc(t('rh.whichTemplateSub',
            'O e-mail e o destinatário são os mesmos nos dois casos. Muda só o documento que vai anexado.'))}</div>
          <button type="button" class="pm-opt" data-op="padrao">
            <span class="pm-opt-ico">${svg('rascunho', 20)}</span>
            <span class="pm-opt-txt">
              <b>${esc(t('rh.templateMyDesk', 'Modelo do MyDesk'))}</b>
              <i>${esc(t('rh.templateMyDeskSub',
                'A carta montada com o cargo, o salário e as condições que você preencheu.'))}</i>
            </span>
          </button>
          <button type="button" class="pm-opt" data-op="proprio">
            <span class="pm-opt-ico">${svg('contrato', 20)}</span>
            <span class="pm-opt-txt">
              <b>${esc(t('rh.templateOwn', 'Meu próprio modelo'))}</b>
              <i>${esc(t('rh.templateOwnSub',
                'Envie o seu documento em PDF ou Word — ele vai anexado no lugar da nossa carta.'))}</i>
            </span>
          </button>
          <button type="button" class="pm-cancelar">${esc(t('common.cancel', 'Cancelar'))}</button>
        </div>`;
      document.body.appendChild(bg);
      const sair = valor => { bg.remove(); resolve(valor); };
      bg.querySelectorAll('[data-op]').forEach(b =>
        b.addEventListener('click', () => sair(b.dataset.op)));
      bg.querySelector('.pm-cancelar').addEventListener('click', () => sair(null));
      bg.addEventListener('click', ev => { if (ev.target === bg) sair(null); });
    });
  }

  /* O arquivo NÃO passa pelo banco: vai do disco para o corpo do POST e de lá
     para o anexo do e-mail. Guardá-lo seria acumular megabytes por proposta
     enviada, num plano que conta cada byte de download. */
  const TIPOS_PROPOSTA = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  };
  const MAX_PROPOSTA = 7_000_000;      // ~5 MB de arquivo, em base64

  function pedirArquivoDaProposta() {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.pdf,.doc,.docx,application/pdf,application/msword,' +
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f) return resolve(null);
        /* O `type` do navegador vem vazio com frequência, e a extensão é o que
           a pessoa de fato escolheu — as duas valem, e basta uma bater. */
        const ext = '.' + String(f.name || '').split('.').pop().toLowerCase();
        const aceito = TIPOS_PROPOSTA[f.type] ||
          Object.values(TIPOS_PROPOSTA).includes(ext);
        if (!aceito) {
          aviso('⚠', t('rh.fileKind', 'Envie um PDF ou um documento do Word (.doc ou .docx).'));
          return resolve(null);
        }
        const leitor = new FileReader();
        leitor.onload = () => {
          const dataUrl = String(leitor.result || '');
          if (dataUrl.length > MAX_PROPOSTA) {
            aviso('⚠', t('rh.fileTooBig', 'O arquivo passa de 5 MB. Envie um menor.'));
            return resolve(null);
          }
          resolve({ nome: String(f.name || 'proposta').slice(0, 120), dataUrl });
        };
        leitor.onerror = () => {
          aviso('⚠', t('rh.fileUnreadable', 'Não consegui ler este arquivo.'));
          resolve(null);
        };
        leitor.readAsDataURL(f);
      });
      /* Cancelar a caixa do sistema não dispara evento nenhum em parte dos
         navegadores. Sem isto, a promessa nunca resolveria e o botão de enviar
         ficaria travado até recarregar a página.

         O ouvinte entra depois de um respiro, e não junto com o clique: em
         alguns navegadores a janela recebe `focus` no mesmo instante em que a
         caixa abre, e aí a espera terminaria antes de a pessoa escolher.
         A janela de 900 ms depois do foco cobre a diferença entre "voltei
         porque cancelei" e "voltei porque escolhi" — quando escolhe, o
         `change` já removeu o input e este ramo não faz nada. */
      inp.click();
      setTimeout(() => {
        window.addEventListener('focus', function solto() {
          window.removeEventListener('focus', solto);
          setTimeout(() => {
            if (!inp.isConnected) return;
            inp.remove();
            resolve(null);
          }, 900);
        });
      }, 400);
    });
  }

  /* ── Enviar a proposta por e-mail ──────────────────────────────────────
     O ENDEREÇO É DA FICHA, lido no servidor — nunca um campo desta tela. Daqui
     vai o id do candidato e, quando ela escolhe o próprio modelo, o arquivo.

     O arquivo do cliente foi barrado por um tempo, e a razão era boa: um
     endpoint que aceita anexo e destinatário do corpo do POST é um serviço de
     envio de e-mail arbitrário com o nosso domínio no remetente — é assim que
     um domínio vai para lista de bloqueio. O que mudou não foi a avaliação do
     risco, foi o cerco: o DESTINATÁRIO continua saindo da ficha, o quadro é
     conferido no banco contra o uid de quem pede, o tipo e o tamanho do
     arquivo são checados dos dois lados e a cota diária continua valendo. Dá
     para mandar o próprio documento para os PRÓPRIOS candidatos, e nada além
     disso. */
  async function enviarProposta(recId) {
    const rec = registros().find(r => r.id === recId);
    if (!rec) return;
    const p = global.propostaDe(rec);
    if (!String(rec.email || '').trim()) {
      aviso('✉️', t('rh.sendNoEmail',
        '{nome} não tem e-mail na ficha. Abra a ficha e informe um antes de enviar.',
        { nome: rec.name || '—' }));
      return;
    }
    if (!p.emailResposta) {
      aviso('⚠', t('rh.sendNoReply',
        'Informe o e-mail para a resposta do candidato em "Editar" antes de enviar — sem ele, quem assinar não sabe para onde devolver.'));
      formularioProposta(recId);
      return;
    }
    const modelo = await escolherModelo();
    if (!modelo) return;

    let arquivo = null;
    if (modelo === 'proprio') {
      arquivo = await pedirArquivoDaProposta();
      if (!arquivo) return;
    }

    const ok = typeof global.confirmarAcao === 'function'
      ? await global.confirmarAcao(
          t('rh.sendByEmail', 'Enviar por e-mail'),
          arquivo
            ? t('rh.sendAskFile',
                '"{arquivo}" vai anexado para {email}. A resposta dele volta para {resposta}.',
                { arquivo: arquivo.nome, email: rec.email, resposta: p.emailResposta })
            : t('rh.sendAsk',
                'A proposta em PDF vai para {email}. A resposta dele volta para {resposta}.',
                { email: rec.email, resposta: p.emailResposta }),
          t('rh.send', 'Enviar'))
      : true;
    if (!ok) return;

    try {
      const enviado = await global.crmEnviarPropostaPorEmail(recId, arquivo);
      if (!enviado) return;
      await global.salvarProposta(recId, {}, 'enviada');
      pintarProposta(recId);
      aviso('✉️', t('rh.sentTo', 'Proposta enviada para {email}.', { email: rec.email }));
    } catch (e) {
      aviso('⚠', e && e.message ? e.message : t('rh.sendFailed', 'Não consegui enviar agora.'));
    }
  }

  global.MD_PESSOAS = {
    abrirVisaoRH, pintarVisaoRH, abrirProposta, pintarProposta, rotuloProposta,
    formularioColaborador, abrirPropostas, pintarPropostas,
    dadosDaCarta, baixarProposta, enviarProposta,
    // Expostos para teste: são as contas que a tela mostra.
    quadroEm, admitidosNoMes, emExperiencia, avaliacoesPendentes, onboardings,
    documentosPendentes, aniversariantes, proximasAdmissoes, pendencias,
    porDepartamento, diasEntre, somaDias, sparkline, donut,
  };
})(window);
