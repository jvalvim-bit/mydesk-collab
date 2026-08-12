'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MODELO CLIENTES — a terceira leitura do mesmo painel
   ═══════════════════════════════════════════════════════════════════════
   O painel do MyDesk já sabia ler a mesma carteira de duas maneiras. O
   Financeiro pergunta quanto cada um deve, quando vence e o que entrou. O
   Recrutamento pergunta outra coisa de outra gente — candidato, etapa,
   entrevista — e por isso troca a tabela por um funil.

   Este é o terceiro: pergunta como anda a RELAÇÃO. Quando foi o último
   contato, o que ficou combinado para o próximo, o que já se conversou, quem
   é o responsável. São perguntas que não cabem na moldura dos outros dois:
   elas pedem uma carteira, um resumo do período, uma fila de próximas ações
   e uma página inteira por cliente. Por isso `#cli-view` substitui a tela, e
   não peças dela.

   O QUE ESTE ARQUIVO NÃO FAZ:

   — Não cria registro novo. Cliente aqui é o MESMO registro que o financeiro
     lê, com o mesmo id. Trocar de modelo não converte, não copia e não
     duplica nada; o que muda é a pergunta.

   — Não escreve direto no Firebase. Toda gravação passa por `createRecord` e
     `updateRecord`, os mesmos caminhos do CRM.

   — Não abre ouvinte nenhum. Os dados chegam por `_records`, que o ouvinte do
     CRM já mantém. A linha do tempo mora dentro do próprio registro
     justamente para não precisar de um segundo nó nem de um segundo download.

   Sobre ler `_records`, `_agenda` e `CU` pelo nome: são `let`/`const` do
   app.js. Scripts clássicos compartilham o escopo léxico global, mas essas
   declarações NÃO viram propriedade de window — por isso são lidas pelo nome,
   nunca por `global.`, que devolveria undefined em silêncio.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  const t = (chave, padrao, vars) => {
    if (typeof _appText === 'function') return _appText(chave, padrao, vars);
    return String(padrao).replace(/\{(\w+)\}/g,
      (achado, k) => (vars && vars[k] !== undefined ? String(vars[k]) : achado));
  };

  /* ═════════════════════════════════════════════════════════════════════
     ESTADO PRÓPRIO
     ═════════════════════════════════════════════════════════════════════
     Objeto separado dos outros dois modelos, de propósito: busca, filtros,
     ordem e página de uma carteira de clientes não querem dizer o mesmo que
     numa tabela de cobrança. Compartilhar o estado faria a busca por "outubro"
     no financeiro reaparecer como filtro de cliente. */
  const S = {
    busca: '',
    filtros: {
      status: '', segmento: '', tipo: '', tag: '', responsavel: '',
      prioridade: '', origem: '', contato: '', arquivados: false,
      /* Quem saiu da carteira e ficou no financeiro. Ver `carteira()`. */
      fora: false,
    },
    ordem: 'recentes',
    pagina: 1,
    porPagina: 10,
    scroll: 0,
    selecionado: null,      // id do cliente aberto por último, para devolver o foco
    periodo: 'mes',
    aba: 'visao',
    filtroInteracao: '',
    filtroAtividade: 'todas',
    /* Visualizacao da tabela: quais colunas, quao apertadas as linhas e se o
       contato aparece sob o nome. Fica no estado do modelo, e nao no DOM,
       porque a tabela se redesenha inteira a cada mudanca de dado. */
    colunas: ['segmento', 'status', 'ultimo', 'proximo', 'tags', 'responsavel'],
    densidade: 'normal',
    verSecundario: true,
    /* Ids marcados na tabela. No estado, e nao no DOM: a tabela se redesenha
       inteira a cada mudanca de dado, e a marcacao teria de sobreviver a
       isso. */
    selecionados: [],
  };

  /* QUAL TELA ESTA NO AR mora em clientes-tela.js, e nao aqui. Sao dois IIFE:
     uma variavel declarada neste nao existe naquele, e a referencia so
     estoura quando a linha roda. `telaAtual` e `clienteAberto` sao ligados la,
     junto com `entrar` e `sair`. */

  const ORDENS = [
    { key: 'recentes',  i18n: 'cli.ordNewest',   pt: 'Mais recentes' },
    { key: 'antigos',   i18n: 'cli.ordOldest',   pt: 'Mais antigos' },
    { key: 'az',        i18n: 'cli.ordAZ',       pt: 'Nome de A a Z' },
    { key: 'za',        i18n: 'cli.ordZA',       pt: 'Nome de Z a A' },
    { key: 'ultimo',    i18n: 'cli.ordLast',     pt: 'Último contato mais recente' },
    { key: 'proximo',   i18n: 'cli.ordNext',     pt: 'Próximo contato mais próximo' },
    { key: 'prioridade',i18n: 'cli.ordPriority', pt: 'Maior prioridade' },
    { key: 'status',    i18n: 'cli.ordStatus',   pt: 'Status' },
  ];

  const PERIODOS = [
    { key: 'mes',   i18n: 'cli.perMonth',   pt: 'Este mês' },
    { key: 'd30',   i18n: 'cli.per30',      pt: 'Últimos 30 dias' },
    { key: 'm3',    i18n: 'cli.per3m',      pt: 'Últimos 3 meses' },
    { key: 'ano',   i18n: 'cli.perYear',    pt: 'Este ano' },
  ];

  /* ═════════════════════════════════════════════════════════════════════
     DATAS — sempre em texto
     ═════════════════════════════════════════════════════════════════════
     `new Date('2026-08-05')` nasce em UTC: às 21h no Brasil ele já é o dia
     seguinte, e "vence hoje" viraria "venceu ontem". Todo o projeto compara
     `aaaa-mm-dd` como texto, e a conta que precisa de calendário passa por
     Date.UTC, que não tem fuso. */
  const hojeIso = () => (typeof _crmTodayLocalIso === 'function')
    ? _crmTodayLocalIso()
    : (() => { const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
          + '-' + String(d.getDate()).padStart(2, '0'); })();

  const ehIso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

  function diasEntre(a, b) {
    if (!ehIso(a) || !ehIso(b)) return null;
    const [a1, a2, a3] = a.split('-').map(Number);
    const [b1, b2, b3] = b.split('-').map(Number);
    return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86400000);
  }

  function somarDias(iso, n) {
    if (!ehIso(iso)) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0')
      + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }

  function isoDeMs(ms) {
    const n = Number(ms);
    if (!n) return '';
    const d = new Date(n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtData(iso) {
    if (!ehIso(iso)) return '';
    if (typeof _crmFmtDate === 'function') return _crmFmtDate(iso);
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  /* "há 3 dias", "em 5 dias", "hoje". Um rótulo relativo responde a pergunta
     que a data crua não responde: está perto ou está longe? */
  function fmtRelativo(iso) {
    const d = diasEntre(hojeIso(), iso);
    if (d === null) return '';
    if (d === 0) return t('cli.today', 'hoje');
    if (d === 1) return t('cli.tomorrow', 'amanhã');
    if (d === -1) return t('cli.yesterday', 'ontem');
    return d > 0 ? t('cli.inDays', 'em {n} dias', { n: d })
                 : t('cli.agoDays', 'há {n} dias', { n: -d });
  }

  /* ═════════════════════════════════════════════════════════════════════
     LEITURA DO CLIENTE
     ═════════════════════════════════════════════════════════════════════
     Registro antigo não tem nenhum dos campos novos. Nada aqui pode devolver
     undefined nem quebrar por isso — o modelo tem de funcionar sobre a
     carteira que já existe, sem migração nenhuma. */

  /* Tirado da carteira e mantido no financeiro. É o meio-termo que faltava
     entre "fica" e "some do banco": cliente e cobrança são o MESMO registro,
     então apagar um apagava o outro — ver `_registrosClientes` no app.js. */
  const foraDaCarteira = r => !!(r && r.foraDaCarteira);

  function carteira() {
    const todos = (typeof _registrosClientes === 'function') ? _registrosClientes() : [];
    /* Os três estados são excludentes e cada filtro mostra um: a lista padrão,
       os arquivados, e os que saíram da carteira mas continuam no financeiro.
       Sem o terceiro, "tirar só da carteira" seria um caminho sem volta — e um
       caminho sem volta oferecido como o lado seguro é pior do que não
       oferecer nada. */
    const vivos = S.filtros.fora
      ? todos.filter(foraDaCarteira)
      : S.filtros.arquivados
        ? todos.filter(r => arquivado(r) && !foraDaCarteira(r))
        : todos.filter(r => !arquivado(r) && !foraDaCarteira(r));
    return umPorSerie(vivos);
  }

  /* UMA SÉRIE É UM CLIENTE.
     No financeiro, um contrato de doze parcelas são doze registros — e ali
     está certo: cada parcela tem vencimento, valor e status próprios, e é
     disso que a cobrança precisa. Aqui não. A pessoa que contratou é uma só,
     e a carteira mostrava a mesma empresa doze vezes, com o contador dizendo
     "27 clientes" para quem tem um.

     Fica a parcela de MENOR número: é a primeira, a que nasceu do cadastro e
     por isso carrega os dados de quem contratou — as outras nascem dela, com
     o mesmo nome e mais nada. O id preservado também é o dela, então abrir o
     cliente e editar continua mexendo no registro de origem.

     Registro sem série não é tocado: ele já é um cliente por conta própria. */
  function umPorSerie(lista) {
    const primeiraDaSerie = new Map();
    const saida = [];
    (lista || []).forEach(r => {
      const serie = (r && r.serieId) ? String(r.serieId) : '';
      if (!serie) { saida.push(r); return; }
      const guardada = primeiraDaSerie.get(serie);
      if (!guardada) {
        primeiraDaSerie.set(serie, r);
        saida.push(r);
        return;
      }
      if ((Number(r.serieN) || 0) < (Number(guardada.serieN) || 0)) {
        saida[saida.indexOf(guardada)] = r;
        primeiraDaSerie.set(serie, r);
      }
    });
    return saida;
  }

  const arquivado = r => !!(r && r.archived);

  function nomeDe(r) {
    const n = String((r && (r.companyName || r.name)) || '').trim();
    return n || t('app.noName', 'Sem nome');
  }

  const contatoDe = r => String((r && (r.contactName || '')) || '').trim();
  const emailDe   = r => String((r && r.email) || '').trim();
  const telDe     = r => String((r && r.phone) || '').trim();

  function statusDe(r) {
    const k = String((r && r.relationshipStatus) || '').trim();
    return (global.CLI_STATUS || []).some(s => s.key === k) ? k : 'ativo';
  }

  function statusInfo(k) {
    const lista = global.CLI_STATUS || [];
    return lista.find(s => s.key === k) || lista[0] || { key: k, pt: k, cor: '#94a3b8' };
  }

  const rotuloDe = (lista, k, padrao) => {
    const o = (lista || []).find(x => x.key === k);
    return o ? t(o.i18n, o.pt) : (padrao || t('cli.notInformed', 'Não informado'));
  };

  const segmentoDe  = r => String((r && r.segment) || '');
  const tipoDe      = r => String((r && r.clientType) || '');
  const origemDe    = r => String((r && r.origin) || '');
  const prioridadeDe= r => String((r && r.priority) || 'media');
  const tagsDe      = r => Array.isArray(r && r.tags) ? r.tags : [];
  const favorito    = r => !!(r && r.favorite);
  const interacoesDe= r => Array.isArray(r && r.interactions) ? r.interactions : [];

  function responsavelDe(r) {
    const id = String((r && r.responsibleUserId) || '').trim();
    if (!id) return '';
    const eu = (typeof CU !== 'undefined' && CU) ? (CU.username || CU.uid) : '';
    if (id === eu || id === 'eu') return t('cli.you', 'Você');
    return id;
  }

  /* ÚLTIMO CONTATO. Três origens possíveis, e a mais recente ganha: o campo
     preenchido à mão, a última interação registrada e a data de cadastro.
     Sem a última interação, registrar uma ligação hoje deixaria a coluna
     dizendo que o último contato foi em março. */
  function ultimoContato(r) {
    const candidatos = [];
    if (ehIso(r && r.lastContactAt)) candidatos.push(r.lastContactAt);
    interacoesDe(r).forEach(i => { if (ehIso(i.data)) candidatos.push(i.data); });
    if (!candidatos.length) return '';
    return candidatos.sort()[candidatos.length - 1];
  }

  /* PRÓXIMO CONTATO. Também de duas origens — o campo do cadastro e os
     compromissos do calendário marcados para este cliente — e a MAIS PRÓXIMA
     ganha. Uma conta só, num lugar só: se cada tela somasse as duas origens
     do seu jeito, "acompanhamentos hoje" e a coluna da tabela discordariam. */
  function proximoContato(r) {
    const hoje = hojeIso();
    const datas = [];
    if (ehIso(r && r.nextContactAt)) datas.push(r.nextContactAt);
    acompanhamentos(r).forEach(a => { if (ehIso(a.data)) datas.push(a.data); });
    if (!datas.length) return '';
    /* A mais próxima do presente, incluindo as que já passaram: um retorno
       marcado para semana passada e não cumprido continua sendo o próximo
       assunto — sumir com ele seria esconder justamente o que está atrasado. */
    const futuras = datas.filter(d => d >= hoje).sort();
    if (futuras.length) return futuras[0];
    return datas.sort()[datas.length - 1];
  }

  const atrasado = r => {
    const p = proximoContato(r);
    return !!p && p < hojeIso();
  };

  /* Compromissos do calendário deste cliente. `_agenda` é a agenda pessoal que
     já existe e já manda aviso por e-mail; o vínculo é um campo a mais no
     item, e não uma segunda agenda. */
  function acompanhamentos(r) {
    if (!r || typeof _agenda === 'undefined' || !Array.isArray(_agenda)) return [];
    return _agenda.filter(a => a && String(a.clienteId || '') === String(r.id));
  }

  function cadastroEm(r) {
    return isoDeMs(r && r.createdAt) || '';
  }

  /* ═════════════════════════════════════════════════════════════════════
     BUSCA, FILTROS E ORDEM
     ═════════════════════════════════════════════════════════════════════ */

  function casaBusca(r, q) {
    if (!q) return true;
    const alvo = [
      nomeDe(r), r.name, r.companyName, contatoDe(r), emailDe(r), telDe(r),
      r.cpf, (r.company && r.company.cnpj) || '', r.cnpj,
      rotuloDe(global.CLI_SEGMENTOS, segmentoDe(r), ''),
      responsavelDe(r), tagsDe(r).join(' '),
    ].join(' ').toLowerCase();
    return alvo.includes(q);
  }

  function casaFiltros(r) {
    const f = S.filtros;
    if (f.status && statusDe(r) !== f.status) return false;
    if (f.segmento && segmentoDe(r) !== f.segmento) return false;
    if (f.tipo && tipoDe(r) !== f.tipo) return false;
    if (f.prioridade && prioridadeDe(r) !== f.prioridade) return false;
    if (f.origem && origemDe(r) !== f.origem) return false;
    if (f.responsavel && String(r.responsibleUserId || '') !== f.responsavel) return false;
    if (f.tag && !tagsDe(r).some(x => x.toLowerCase() === f.tag.toLowerCase())) return false;
    if (f.contato === 'atrasados' && !atrasado(r)) return false;
    if (f.contato === 'semproximo' && proximoContato(r)) return false;
    if (f.contato === 'semana') {
      const p = proximoContato(r);
      if (!p || p < hojeIso() || p > somarDias(hojeIso(), 7)) return false;
    }
    return true;
  }

  function temFiltro() {
    const f = S.filtros;
    return !!(f.status || f.segmento || f.tipo || f.prioridade || f.origem
      || f.responsavel || f.tag || f.contato || f.arquivados || f.fora);
  }

  const PESO_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

  function ordenar(lista) {
    const l = lista.slice();
    const nome = r => nomeDe(r).toLocaleLowerCase();
    switch (S.ordem) {
      case 'antigos':    return l.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      case 'az':         return l.sort((a, b) => nome(a).localeCompare(nome(b)));
      case 'za':         return l.sort((a, b) => nome(b).localeCompare(nome(a)));
      /* Sem data vai para o FIM nas duas ordens de contato. Ordenar string
         vazia junto com datas a poria em primeiro no crescente — e "nunca
         contatado" apareceria como "contato mais recente". */
      case 'ultimo':     return l.sort((a, b) => {
        const x = ultimoContato(a), y = ultimoContato(b);
        if (!x && !y) return 0;
        if (!x) return 1;
        if (!y) return -1;
        return y.localeCompare(x);
      });
      case 'proximo':    return l.sort((a, b) => {
        const x = proximoContato(a), y = proximoContato(b);
        if (!x && !y) return 0;
        if (!x) return 1;
        if (!y) return -1;
        return x.localeCompare(y);
      });
      case 'prioridade': return l.sort((a, b) =>
        (PESO_PRIORIDADE[prioridadeDe(a)] ?? 1) - (PESO_PRIORIDADE[prioridadeDe(b)] ?? 1));
      case 'status':     return l.sort((a, b) => {
        const ordem = (global.CLI_STATUS || []).map(s => s.key);
        return ordem.indexOf(statusDe(a)) - ordem.indexOf(statusDe(b));
      });
      default:           return l.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  }

  function visiveis() {
    const q = S.busca.trim().toLowerCase();
    return ordenar(carteira().filter(r => casaBusca(r, q) && casaFiltros(r)));
  }

  /* ═════════════════════════════════════════════════════════════════════
     INDICADORES
     ═════════════════════════════════════════════════════════════════════
     Todos saem dos dados reais. Sem dado, o número é zero — e zero é uma
     resposta, ao contrário de um número inventado para a tela não ficar
     vazia. */

  function inicioDoPeriodo(chave) {
    const hoje = hojeIso();
    const [y, m] = hoje.split('-').map(Number);
    switch (chave) {
      case 'd30': return somarDias(hoje, -30);
      case 'm3':  return somarDias(hoje, -90);
      case 'ano': return y + '-01-01';
      default:    return y + '-' + String(m).padStart(2, '0') + '-01';
    }
  }

  function indicadores() {
    const hoje = hojeIso();
    const lista = carteira();
    const inicioMes = hoje.slice(0, 8) + '01';
    const seteDias = somarDias(hoje, -7);
    const trintaFrente = somarDias(hoje, 30);
    const semanaFrente = somarDias(hoje, 7);

    const ativos = lista.filter(r => statusDe(r) === 'ativo').length;
    const novosMes = lista.filter(r => {
      const c = cadastroEm(r);
      return c && c >= inicioMes;
    }).length;
    const novos7 = lista.filter(r => {
      const c = cadastroEm(r);
      return c && c >= seteDias;
    }).length;

    const hojeContatos = lista.filter(r => proximoContato(r) === hoje).length;
    const atrasados = lista.filter(atrasado).length;
    const proximos30 = lista.filter(r => {
      const p = proximoContato(r);
      return p && p >= hoje && p <= trintaFrente;
    }).length;
    const proximos7 = lista.filter(r => {
      const p = proximoContato(r);
      return p && p >= hoje && p <= semanaFrente;
    }).length;

    /* "+X% vs mês anterior" só é dito quando há mês anterior com o que
       comparar. Sobre base zero, qualquer cliente novo vira "+100%", que
       parece medida e não é. */
    const mesPassadoFim = somarDias(inicioMes, -1);
    const mesPassadoIni = mesPassadoFim.slice(0, 8) + '01';
    const novosMesPassado = lista.filter(r => {
      const c = cadastroEm(r);
      return c && c >= mesPassadoIni && c <= mesPassadoFim;
    }).length;
    const variacao = novosMesPassado > 0
      ? Math.round(((novosMes - novosMesPassado) / novosMesPassado) * 100)
      : null;

    return { total: lista.length, ativos, novosMes, novos7, hojeContatos,
             atrasados, proximos30, proximos7, variacao };
  }

  function resumo(periodo) {
    const desde = inicioDoPeriodo(periodo || S.periodo);
    const lista = carteira();
    const noPeriodo = lista.filter(r => { const c = cadastroEm(r); return c && c >= desde; });
    const porStatus = {};
    (global.CLI_STATUS || []).forEach(s => { porStatus[s.key] = 0; });
    lista.forEach(r => { porStatus[statusDe(r)] = (porStatus[statusDe(r)] || 0) + 1; });

    /* Taxa de retorno: de quem tinha um retorno marcado para uma data que já
       passou, quantos foram efetivamente contatados depois dela. É a única
       leitura honesta de "cumpri o que combinei" com os dados que existem. */
    const comCompromissoVencido = lista.filter(r => {
      const p = r.nextContactAt;
      return ehIso(p) && p < hojeIso();
    });
    const cumpridos = comCompromissoVencido.filter(r => {
      const u = ultimoContato(r);
      return u && u >= r.nextContactAt;
    }).length;
    const taxa = comCompromissoVencido.length
      ? Math.round((cumpridos / comCompromissoVencido.length) * 100) : null;

    /* A variacao dos NOVOS, comparando com a janela anterior de mesmo
       tamanho. So esta linha tem comparacao possivel: o registro guarda o
       status atual, e nao a historia dele, entao "quantos estavam ativos no
       mes passado" nao existe em lugar nenhum. */
    /* A janela anterior do "este mes" e o MES ANTERIOR INTEIRO, e nao os
       mesmos poucos dias: no dia 5, comparar com "os quatro dias antes do dia
       1" nao e o que ninguem entende por "vs mes anterior". Para as janelas
       moveis (30 dias, 3 meses) a comparacao e com a janela de mesmo tamanho
       imediatamente antes, que ali e a leitura natural. */
    const per = periodo || S.periodo;
    let desdeAntes, ateAntes;
    if (per === 'mes' || per === 'ano') {
      ateAntes = somarDias(desde, -1);
      desdeAntes = per === 'mes'
        ? ateAntes.slice(0, 8) + '01'
        : (Number(desde.slice(0, 4)) - 1) + '-01-01';
    } else {
      const dias = diasEntre(desde, hojeIso()) || 30;
      desdeAntes = somarDias(desde, -dias);
      ateAntes = somarDias(desde, -1);
    }
    const antes = lista.filter(r => {
      const c = cadastroEm(r);
      return c && c >= desdeAntes && c <= ateAntes;
    }).length;
    const variacaoNovos = antes > 0
      ? Math.round(((noPeriodo.length - antes) / antes) * 100)
      : null;

    return {
      novos: noPeriodo.length,
      variacaoNovos,
      ativos: porStatus.ativo || 0,
      inativos: (porStatus.inativo || 0) + (porStatus.encerrado || 0),
      aguardando: porStatus.aguardando || 0,
      pendentes: lista.filter(r => { const p = proximoContato(r); return p && p <= hojeIso(); }).length,
      taxa, porStatus, total: lista.length,
    };
  }

  /* PRÓXIMAS AÇÕES. Uma fila só, com as duas origens de compromisso, ordenada
     por data. O atraso aparece no lugar em vez de sumir da lista. */
  function proximasAcoes(limite) {
    const hoje = hojeIso();
    const itens = [];
    carteira().forEach(r => {
      acompanhamentos(r).forEach(a => {
        if (!ehIso(a.data)) return;
        itens.push({ id: a.id, clienteId: r.id, cliente: nomeDe(r), titulo: a.titulo || '',
          data: a.data, hora: a.hora || '', tipo: 'evento',
          atrasado: a.data < hoje, prioridade: prioridadeDe(r) });
      });
      if (ehIso(r.nextContactAt) && !acompanhamentos(r).some(a => a.data === r.nextContactAt)) {
        itens.push({ id: 'next_' + r.id, clienteId: r.id, cliente: nomeDe(r),
          titulo: t('cli.nextContactAction', 'Próximo contato'),
          data: r.nextContactAt, hora: '', tipo: 'contato',
          atrasado: r.nextContactAt < hoje, prioridade: prioridadeDe(r) });
      }
    });
    itens.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    return limite ? itens.slice(0, limite) : itens;
  }

  global.MD_CLI = {
    S, ORDENS, PERIODOS,
    ativo: () => !!(global.MD_RH && MD_RH.modelo() === 'clientes'),
    carteira, umPorSerie, visiveis, temFiltro, indicadores, resumo, proximasAcoes,
    nomeDe, contatoDe, emailDe, telDe, statusDe, statusInfo, rotuloDe,
    segmentoDe, tipoDe, origemDe, prioridadeDe, tagsDe, favorito, arquivado,
    responsavelDe, ultimoContato, proximoContato, atrasado, acompanhamentos,
    foraDaCarteira,
    interacoesDe, cadastroEm, fmtData, fmtRelativo, diasEntre, somarDias,
    hojeIso, ehIso, isoDeMs, inicioDoPeriodo, ordenar, casaBusca, casaFiltros,
    /* telaAtual e clienteAberto sao preenchidos por clientes-tela.js, dona do
       estado da tela. Ate la respondem o unico estado possivel sem tela. */
    telaAtual: () => 'lista',
    clienteAberto: () => null,
  };

})(typeof window !== 'undefined' ? window : globalThis);
