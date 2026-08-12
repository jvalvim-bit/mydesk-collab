'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   O PAINEL DE CLIENTES NO MODELO DE RECRUTAMENTO
   ═══════════════════════════════════════════════════════════════════════
   A aba Clientes nasceu financeira, e continua sendo isso por padrão: os
   cartões somam dinheiro, os gráficos desenham faturamento, a tabela ordena
   por vencimento e o filtro só conhece pago, pendente e atrasado.

   O modelo "Processo seletivo" (docs/js/nichos.js) já dava à ficha os campos
   certos — vaga, pretensão, disponibilidade, entrevista, parecer — e o
   formulário público já transformava candidatura em registro. Mas a moldura
   em volta continuava falando de cobrança: somar pretensão salarial como
   "carteira" não significa nada, e ordenar gente por vencimento significa
   menos ainda. Faltava a moldura, não o dado.

   Este arquivo é a outra moldura. O botão "Alterar modelo", na faixa do
   painel, troca o que os cartões contam, o que os gráficos desenham e o que
   o quadro mostra: no lugar da tabela de cobrança entra o funil das etapas
   do processo seletivo, com o candidato andando de coluna em coluna.

   O DADO NÃO MUDA. Candidato é registro comum da aba Clientes com
   `template: 'rh'`; a etapa em que ele está é o `checklist` que a ficha já
   guardava. Trocar de modelo é trocar de leitura, não de banco — por isso dá
   para ir e voltar quantas vezes quiser, sem migração e sem tocar em
   database.rules.json.

   O QUE ESTE ARQUIVO NÃO FAZ: nada de escrever direto no Firebase. Mover um
   candidato de etapa chama `updateRecord`, que é o único caminho de escrita
   do CRM — o mesmo que a tabela financeira usa.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  const CHAVE_MODELO = 'rh';          // key do nicho em docs/js/nichos.js
  const LS = 'md_crm_modelo';         // preferência por usuário

  let _modelo  = 'financeiro';        // 'financeiro' | 'rh'
  let _vaga    = '';                  // filtro de vaga ('' = todas)
  let _etapa   = -1;                  // filtro de etapa (-1 = todas)
  let _verReprovados = false;         // mostrar SÓ os reprovados
  let _verAdmitidos  = false;         // trazer de volta quem já foi admitido
  let _periodo = 'mes';               // período do gráfico de candidaturas

  /* ── Traduções: sempre pelo catálogo, com o português como último recurso ──
     O recurso final também troca os {valores}: sem isso, um catálogo que não
     tivesse carregado poria "{count} candidatos", com as chaves à mostra, no
     lugar do número. */
  const t = (chave, padrao, vars) => {
    if (typeof _appText === 'function') return _appText(chave, padrao, vars);
    return String(padrao).replace(/\{(\w+)\}/g,
      (achado, k) => (vars && vars[k] !== undefined ? String(vars[k]) : achado));
  };

  const esc = s => (typeof xe === 'function' ? xe(s) : String(s == null ? '' : s));
  const attr = s => (typeof sanitizeAttr === 'function' ? sanitizeAttr(s) : esc(s));

  /* ═════════════════════════════════════════════════════════════════════
     ESTADO DO MODELO
     ═════════════════════════════════════════════════════════════════════ */

  /* CU e PAL são declarados com `let`/`const` no app.js: existem no escopo
     global lexical, que os scripts clássicos compartilham, mas NÃO viram
     propriedade de window. Por isso são lidos pelo nome, e nunca por
     `global.`, que devolveria undefined em silêncio — a preferência de modelo
     cairia num balde único para todas as contas, e todo cartão nasceria da
     mesma cor. */
  const _cu = () => (typeof CU !== 'undefined' && CU) ? CU : null;

  function _chaveLS() {
    const u = (_cu() && (_cu().username || _cu().uid)) || '';
    return u ? LS + '_' + u : LS;
  }

  function modelo() { return _modelo; }

  /* Vale a pena existir? Sem o catálogo de nichos não há etapas para
     desenhar — e um funil sem colunas não é funil, é tela em branco. */
  function disponivel() {
    const N = global.MD_NICHOS;
    return !!(N && N.porChave && N.porChave[CHAVE_MODELO]);
  }

  function ativo() { return _modelo === 'rh' && disponivel(); }

  /* TRÊS MODELOS, UMA PREFERÊNCIA. O terceiro — 'clientes' — mora aqui pela
     mesma razão que o segundo: a chave do localStorage é por usuário e já é
     lida no arranque, antes de qualquer painel existir. Dois lugares gravando
     a mesma preferência dariam duas respostas para "que painel abrir".
     `ativo()` continua sendo só sobre recrutamento; quem pergunta pelo modelo
     de clientes usa `modelo() === 'clientes'`. */
  const MODELOS = ['financeiro', 'rh', 'clientes'];

  function carregarPreferencia() {
    try {
      const v = localStorage.getItem(_chaveLS());
      _modelo = MODELOS.includes(v) ? v : 'financeiro';
    } catch (_) { _modelo = 'financeiro'; }
    return _modelo;
  }

  function definirModelo(k) {
    _modelo = MODELOS.includes(k) ? k : 'financeiro';
    try { localStorage.setItem(_chaveLS(), _modelo); } catch (_) {}
    _vaga = ''; _etapa = -1;
    return _modelo;
  }

  /* ═════════════════════════════════════════════════════════════════════
     ETAPAS E LEITURA DO CANDIDATO
     ═════════════════════════════════════════════════════════════════════ */

  /* As colunas do funil são o checklist do modelo — já traduzido, porque
     MD_NICHOS reescreve os rótulos no lugar quando o idioma muda. */
  function etapas() {
    const m = disponivel() ? global.MD_NICHOS.porChave[CHAVE_MODELO] : null;
    return m && Array.isArray(m.checklist) ? m.checklist.slice() : [];
  }

  function candidatos(lista) {
    return (lista || []).filter(r => r && r.template === CHAVE_MODELO);
  }

  /* Onde o candidato ESTÁ = uma casa depois da última etapa concluída, e não
     a primeira em branco: quem marcou "Entrevista técnica" sem ter marcado a
     triagem avançou de verdade, e voltá-lo para o começo apagaria isso da
     tela. Todas concluídas → ele terminou o processo. */
  function etapaDe(rec) {
    const lista = Array.isArray(rec && rec.checklist) ? rec.checklist : [];
    const cols  = Math.max(1, etapas().length);
    let ultima = -1;
    lista.forEach((it, i) => { if (it && it.ok) ultima = i; });
    const concluido = lista.length > 0 && ultima === lista.length - 1;
    const indice = concluido ? cols - 1
                             : Math.max(0, Math.min(cols - 1, ultima + 1));
    return { indice, concluido, feitas: ultima + 1, total: lista.length };
  }

  /* O selo do campo "Vaga" guarda o rótulo como ele aparecia na tela quando
     foi escolhido — logo, pode estar em qualquer um dos três idiomas. Compara
     pela posição no array de selos do modelo e, como rede, pelo radical da
     palavra nas três línguas. */
  function _seloVaga(rec, posicao, regex) {
    const valor = rec && rec.campos && rec.campos.vaga__selo;
    if (!valor) return false;
    const m = disponivel() ? global.MD_NICHOS.porChave[CHAVE_MODELO] : null;
    const campo = m && (m.campos || []).find(c => c.k === 'vaga');
    const selos = (campo && campo.selo) || [];
    if (selos[posicao] && valor === selos[posicao]) return true;
    return regex.test(valor);
  }

  const reprovado = rec => _seloVaga(rec, 3, /reprov|reject|rechaz/i);
  const aprovado  = rec => _seloVaga(rec, 2, /aprov|approv/i);

  /* O rótulo escrito no banco é o que estava na tela quando se escolheu — o
     catálogo traduz os selos no lugar. Gravar pela POSIÇÃO no array mantém o
     acordo com `reprovado()`, que compara pela mesma posição e ainda tem o
     radical das três línguas como rede. */
  function _rotuloSelo(posicao) {
    const m = disponivel() ? global.MD_NICHOS.porChave[CHAVE_MODELO] : null;
    const campo = m && (m.campos || []).find(c => c.k === 'vaga');
    const selos = (campo && campo.selo) || [];
    return selos[posicao] || '';
  }

  /* Reprovar NÃO mexe na etapa. O candidato fica onde chegou, marcado — e o
     funil continua contando a história do processo: quantos caíram na
     entrevista técnica é informação, e zerar a etapa apagaria isso.

     O motivo, quando escrito, vai para o `parecer`, que é o campo interno da
     ficha. Ele nunca aparece em formulário e nunca sobe para a IA (ver
     _fichaEmTexto): é anotação de quem avalia, e o candidato não a vê. */
  async function reprovar(id, motivo, lista) {
    const rec = (lista || []).find(r => r.id === id);
    if (!rec || typeof updateRecord !== 'function') return;
    const campos = Object.assign({}, rec.campos || {});
    campos.vaga__selo = _rotuloSelo(3) || 'Reprovado';

    const texto = String(motivo || '').trim();
    if (texto) {
      const quando = new Date().toLocaleDateString(
        typeof _appLocale === 'function' ? _appLocale() : 'pt-BR');
      const anterior = typeof campos.parecer === 'string' ? campos.parecer.trim() : '';
      campos.parecer = [anterior,
        t('rh.rejectedOn', 'Reprovado em {date}: {reason}', { date: quando, reason: texto }),
      ].filter(Boolean).join('\n');
    }
    await updateRecord(id, { campos });
    if (typeof registrarAtividade === 'function') {
      registrarAtividade('reprovou', soTexto(rec.name));
    }
  }

  async function desfazerReprovacao(id, lista) {
    const rec = (lista || []).find(r => r.id === id);
    if (!rec || typeof updateRecord !== 'function') return;
    const campos = Object.assign({}, rec.campos || {});
    // Volta ao estado neutro, e não a "Aprovado": desfazer é tirar a marca,
    // não pôr outra no lugar.
    delete campos.vaga__selo;
    await updateRecord(id, { campos });
  }

  /* O ROTULO da vaga, para mostrar na tela e para a busca.

     A vaga deixou de ser so texto: quando o candidato tem `campos.vagaId` e
     essa vaga existe, o nome sai de la — assim renomear a vaga corrige todos
     os candidatos de uma vez. Candidato antigo continua com o texto solto em
     `campos.vaga`, e continua funcionando sem migracao. */
  function vagaDe(rec) {
    if (typeof global.rotuloVagaDe === 'function') {
      const rot = global.rotuloVagaDe(rec);
      if (rot) return rot;
    }
    return String((rec && rec.campos && rec.campos.vaga) || '').trim();
  }

  /* A CHAVE da vaga, para filtrar e agrupar.

     Rotulo nao serve como chave: duas vagas podem ter o mesmo nome, e
     renomear uma delas trocaria a chave de todos os candidatos. Quando ha id,
     a chave e o id; quando nao ha, e o texto antigo. */
  function chaveVagaDe(rec) {
    if (typeof global.chaveVagaDe === 'function') return global.chaveVagaDe(rec);
    return String((rec && rec.campos && rec.campos.vaga) || '').trim();
  }

  /* O e-mail que o candidato escreveu no formulário — o único endereço para
     onde o aviso de etapa pode ir. Quem se inscreveu sem deixar e-mail não
     recebe aviso nenhum, e nesse caso o convite para avisar nem aparece: um
     botão que só sabe dizer "não dá" é pior do que botão nenhum. */
  function emailDe(rec) {
    const v = String((rec && rec.email) || '').trim();
    return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v) ? v : '';
  }

  /* Vagas que o filtro oferece: as CADASTRADAS mais os rotulos antigos que so
     existem escritos nos candidatos. Sem a segunda metade, quem tem candidato
     de antes perderia o filtro que ja usava. Devolve {chave, rotulo}. */
  function vagas(lista) {
    if (typeof global.vagasDoFunil === 'function') {
      const doApp = global.vagasDoFunil();
      const jaTem = new Set(doApp.map(v => v.chave));
      candidatos(lista).forEach(r => {
        const chave = chaveVagaDe(r);
        if (!chave || jaTem.has(chave)) return;
        jaTem.add(chave);
        doApp.push({ chave, rotulo: vagaDe(r) || chave, vaga: null, legado: true });
      });
      return doApp.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    }
    const set = new Set();
    candidatos(lista).forEach(r => { const v = chaveVagaDe(r); if (v) set.add(v); });
    return Array.from(set).sort((a, b) => a.localeCompare(b))
      .map(v => ({ chave: v, rotulo: v, vaga: null, legado: true }));
  }

  /* Data da entrevista como texto aaaa-mm-dd, que é o formato do campo de
     data da ficha e o mesmo que o calendário compara. */
  function entrevistaDe(rec) {
    const v = rec && rec.campos && rec.campos.entrevista;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '';
  }

  /* O que o funil mostra depois de busca, vaga e etapa. A busca é a mesma
     caixa do painel financeiro, então quem digita continua achando pelo nome,
     e-mail ou telefone — e aqui também pela vaga. */
  /* Candidato que já virou colaborador. O funil é o processo que ainda corre;
     quem foi admitido terminou o dele. */
  function jaAdmitido(rec) {
    return typeof global._colaboradorDoCandidato === 'function'
      && !!global._colaboradorDoCandidato(rec && rec.id);
  }

  function visiveis(lista, busca) {
    let out = candidatos(lista);
    const q = String(busca || '').trim().toLowerCase();
    /* Reprovado sai das colunas por padrão: o funil é o que ainda está em pé,
       e quem foi reprovado ocuparia espaço numa etapa que já não corre. Não
       some de vez — o filtro tem uma entrada para eles e o quadro diz quantos
       estão ocultos, porque esconder sem avisar é indistinguível de perder. */
    out = _verReprovados ? out.filter(reprovado) : out.filter(r => !reprovado(r));
    /* E QUEM JÁ FOI ADMITIDO SAI PELO MESMO MOTIVO. Ele agora está no quadro
       de colaboradores; deixá-lo ocupando a coluna Admissão faz o funil contar
       de novo uma contratação que já terminou — e, com dois homônimos, torna
       impossível saber qual dos dois ainda está em processo. A ficha continua
       existindo, com currículo, parecer e nota da triagem: some da coluna,
       não do banco. */
    if (!_verReprovados) {
      out = _verAdmitidos ? out.filter(jaAdmitido) : out.filter(r => !jaAdmitido(r));
    }
    if (_vaga) out = out.filter(r => chaveVagaDe(r) === _vaga);
    if (_etapa >= 0) out = out.filter(r => etapaDe(r).indice === _etapa);
    if (q) {
      out = out.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        vagaDe(r).toLowerCase().includes(q));
    }
    return out;
  }

  function filtroVaga(v) { _vaga = v || ''; }
  function filtroEtapa(i) { _etapa = Number.isInteger(i) ? i : -1; }
  function filtroReprovados(v) { _verReprovados = !!v; }
  function filtroAdmitidos(v) { _verAdmitidos = !!v; }
  function temFiltro() { return !!_vaga || _etapa >= 0 || _verReprovados || _verAdmitidos; }

  /* ═════════════════════════════════════════════════════════════════════
     INDICADORES
     ═════════════════════════════════════════════════════════════════════ */

  const _hojeISO = () => new Date().toISOString().slice(0, 10);

  function _mesDe(ms) {
    const d = new Date(Number(ms) || 0);
    return isNaN(d) || !ms ? '' :
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* As etapas de entrevista, achadas pelo NOME e não pela posição: o checklist
     é traduzido nos três idiomas, e quem acrescentar uma etapa antes delas
     moveria os índices sem que ninguém percebesse. */
  function etapasDeEntrevista() {
    return etapas().map((nome, i) => ({ nome, i }))
      .filter(x => /entrevist|interview/i.test(x.nome))
      .map(x => x.i);
  }

  function indicadores(lista) {
    const cand = candidatos(lista);
    const hoje = _hojeISO();
    const deEntrevista = etapasDeEntrevista();

    let admitidos = 0, agendadas = 0, emProcesso = 0, dias = 0, comTempo = 0;
    cand.forEach(r => {
      const e = etapaDe(r);
      /* ADMITIDO É QUEM VIROU COLABORADOR. O painel media isso pelo checklist
         inteiro marcado, que era o único sinal que existia antes de o
         colaborador existir — e o resultado era a taxa de contratação dizendo
         "sem admissão ainda" com gente já contratada no quadro de
         colaboradores, duas telas discordando sobre o mesmo fato.

         O checklist concluído continua valendo ao lado, e não no lugar: ficha
         antiga, de antes desta tela, só tem esse sinal, e trocá-lo por outro
         apagaria as contratações que já estavam registradas. */
      const contratado = jaAdmitido(r) || e.concluido;
      if (contratado) {
        admitidos++;
        // Quanto tempo o processo levou: da criação da ficha ao último toque
        // nela. É aproximação — mas é a única marca de tempo que o registro
        // guarda, e erra para menos, nunca para mais.
        const ini = Number(r.createdAt) || 0, fim = Number(r.updatedAt) || 0;
        if (ini && fim > ini) { dias += (fim - ini) / 86400000; comTempo++; }
      } else if (!reprovado(r)) {
        emProcesso++;
      }
      /* ESTAR NA COLUNA DE ENTREVISTA JÁ É UMA ENTREVISTA MARCADA. O cartão
         só contava quando alguém preenchia a DATA da entrevista na ficha —
         então arrastar a pessoa para "Entrevista RH" não mexia no número, e o
         painel dizia zero entrevistas com metade do funil ali dentro. A data
         continua valendo para quem já está adiante e tem retorno agendado. */
      const ent = entrevistaDe(r);
      const emEntrevista = deEntrevista.includes(e.indice);
      if (!contratado && !reprovado(r) &&
          (emEntrevista || (ent && ent >= hoje))) agendadas++;
    });

    // Série de 8 meses para os minigráficos dos cartões.
    const chaves = [];
    const agora = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      chaves.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const zero = () => ({ inscritos: 0, entrevistas: 0, admitidos: 0 });
    const mapa = Object.fromEntries(chaves.map(k => [k, zero()]));
    cand.forEach(r => {
      const kc = _mesDe(r.createdAt);
      if (kc in mapa) mapa[kc].inscritos++;
      const ent = entrevistaDe(r);
      if (ent && ent.slice(0, 7) in mapa) mapa[ent.slice(0, 7)].entrevistas++;
      if (jaAdmitido(r) || etapaDe(r).concluido) {
        const ka = _mesDe(r.updatedAt) || kc;
        if (ka in mapa) mapa[ka].admitidos++;
      }
    });
    const serie = chaves.map(k => mapa[k]);

    // Contagem por etapa — alimenta o funil desenhado e o relatório.
    const nomes = etapas();
    const porEtapa = nomes.map((nome, i) => ({
      nome, i,
      n: cand.filter(r => !reprovado(r) && etapaDe(r).indice === i).length,
    }));

    return {
      cand, total: cand.length, admitidos, agendadas, emProcesso,
      reprovados: cand.filter(reprovado).length,
      tempoMedio: comTempo ? dias / comTempo : 0,
      aproveitamento: cand.length ? admitidos / cand.length : 0,
      serie, porEtapa, vagas: vagas(lista),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     CARTÕES DO TOPO
     ═════════════════════════════════════════════════════════════════════ */

  /* Mesma contagem animada dos cartões financeiros, mas com sufixo em vez de
     moeda: dias e porcentagem não são dinheiro e não levam R$. */
  function _anima(id, alvo, sufixo, casas) {
    const el = document.getElementById(id);
    if (!el) return;
    const de = el._crmVal || 0;
    el._crmVal = alvo;
    const escreve = v => {
      el.textContent = (casas ? v.toFixed(casas).replace('.', ',')
                              : String(Math.round(v))) + (sufixo || '');
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || de === alvo) {
      escreve(alvo); return;
    }
    const t0 = performance.now();
    const passo = agora => {
      const p = Math.min(1, (agora - t0) / 900);
      escreve(de + (alvo - de) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function _rotulo(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
  }

  function renderKPIs(lista) {
    const d = indicadores(lista);

    _rotulo('crm-kpi-lbl-1', t('rh.kpiCandidates', 'Candidatos'));
    _rotulo('crm-kpi-lbl-2', t('rh.kpiInterviews', 'Entrevistas marcadas'));
    _rotulo('crm-kpi-lbl-3', t('rh.kpiInProcess', 'Em processo'));
    _rotulo('crm-kpi-lbl-4', t('rh.kpiHireRate', 'Taxa de contratação'));

    _anima('crm-total-paid',    d.total, '');
    _anima('crm-total-pending', d.agendadas, '');
    _anima('crm-total-count',   d.emProcesso, '');
    _anima('crm-total-ticket',  d.aproveitamento * 100, '%', 0);

    const ultimo = d.serie[d.serie.length - 1] || { inscritos: 0 };
    const antes  = d.serie[d.serie.length - 2] || { inscritos: 0 };
    if (typeof _cdashDelta === 'function') _cdashDelta('crm-delta-paid', ultimo.inscritos, antes.inscritos);
    if (typeof _cdashSemDelta === 'function') {
      _cdashSemDelta('crm-delta-pending', t('rh.inInterviewStages',
        'nas etapas de entrevista ou com data marcada'));
      _cdashSemDelta('crm-delta-count', d.reprovados
        ? t('rh.rejectedCount', '{count} reprovados', { count: d.reprovados })
        : t('rh.noneRejected', 'ninguém reprovado'));
      _cdashSemDelta('crm-delta-ticket', d.tempoMedio
        ? t('rh.avgDaysToHire', '{days} dias até admitir',
            { days: Math.round(d.tempoMedio) })
        : t('rh.noHireYet', 'sem admissão ainda'));
    }

    if (typeof _cdashSpark === 'function') {
      _cdashSpark('crm-spark-paid',    d.serie.map(m => m.inscritos));
      _cdashSpark('crm-spark-pending', d.serie.map(m => m.entrevistas));
      _cdashSpark('crm-spark-count',   d.serie.map(m => m.inscritos - m.admitidos));
      _cdashSpark('crm-spark-ticket',  d.serie.map(m => m.admitidos));
    }

    // O cartão de "a receber" ganha um alerta vermelho quando há atraso; aqui
    // não existe atraso, então o rótulo escrito acima é o que fica.
    document.getElementById('crm-vs-pending')?.classList.remove('alerta');
    return d;
  }

  /* ═════════════════════════════════════════════════════════════════════
     GRÁFICOS
     ═════════════════════════════════════════════════════════════════════ */

  function trocarPeriodo(p) { _periodo = p || 'mes'; }

  /* Intervalos de tempo com a mesma régua do painel financeiro — reaproveita
     _crmIntervalos do app.js contando candidaturas em vez de somar dinheiro. */
  function _candidaturasPorPeriodo(lista) {
    if (typeof _crmIntervalos !== 'function') return { labels: [], valores: [] };
    return _crmIntervalos(_periodo, {
      lista: candidatos(lista),
      filtro: () => true,
      valor: () => 1,
      quando: r => (Number(r.createdAt) ? new Date(Number(r.createdAt)) : null),
    });
  }

  /* Linha de candidaturas. É a mesma ideia do gráfico de faturamento, mas com
     eixo inteiro: contar gente em 0,4 em 0,4 não diz nada a ninguém. */
  function renderLinha(lista) {
    const host = document.getElementById('crm-line-chart');
    if (!host) return;
    const { labels, valores } = _candidaturasPorPeriodo(lista);
    const maxV = valores.length ? Math.max(...valores) : 0;
    if (!maxV) {
      host.innerHTML = '<div class="cdash-chart-empty">' +
        esc(t('rh.noApplicationsPeriod', 'Nenhuma candidatura neste período')) + '</div>';
      return;
    }

    const W = Math.max(360, host.clientWidth || 640), H = 238;
    const padL = 52, padR = 12, padT = 14, padB = 26;
    // Teto inteiro e divisível pelo número de linhas de grade, para os rótulos
    // do eixo saírem sem casa decimal.
    const linhas = Math.min(5, maxV);
    const topo = Math.ceil(maxV / linhas) * linhas;
    const xAt = i => padL + (valores.length === 1 ? 0.5 : i / (valores.length - 1)) * (W - padL - padR);
    const yAt = v => padT + (1 - v / topo) * (H - padT - padB);

    let grade = '', eixoY = '';
    for (let k = 1; k <= linhas; k++) {
      const v = (topo / linhas) * k, y = yAt(v).toFixed(1);
      grade += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y +
               '" stroke="rgba(255,255,255,.07)" stroke-dasharray="3 5"/>';
      eixoY += '<text class="cdash-axis" x="' + (padL - 10) + '" y="' + (Number(y) + 3.5) +
               '" text-anchor="end">' + Math.round(v) + '</text>';
    }
    const passo = Math.ceil(labels.length / 12);
    const eixoX = labels.map((l, i) => i % passo ? '' :
      '<text class="cdash-axis" x="' + xAt(i).toFixed(1) + '" y="' + (H - 7) +
      '" text-anchor="middle">' + esc(l) + '</text>').join('');

    const pts = valores.map((v, i) => [xAt(i), yAt(v)]);
    const d = typeof _cdashSuave === 'function' ? _cdashSuave(pts)
            : 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');

    host.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
        '<defs><linearGradient id="rhlg" gradientUnits="userSpaceOnUse" x1="' + padL +
          '" y1="0" x2="' + (W - padR) + '" y2="0">' +
          '<stop offset="0" stop-color="#a78bfa"/><stop offset=".55" stop-color="#22d3ee"/>' +
          '<stop offset="1" stop-color="#4ade80"/>' +
        '</linearGradient></defs>' +
        grade + eixoY + eixoX +
        '<path class="crm-line-draw" pathLength="1" d="' + d + '" fill="none" stroke="url(#rhlg)" ' +
          'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ' +
          'style="filter:drop-shadow(0 0 7px rgba(167,139,250,.5))"/>' +
      '</svg>';
  }

  /* O funil propriamente dito, em barras horizontais: cada etapa com quantos
     candidatos ainda estão nela e quanto isso representa do topo. Barra
     horizontal e não vertical porque o rótulo da etapa é uma frase
     ("Entrevista técnica"), e frase em pé não se lê. */
  function renderFunilBarras(lista) {
    const host  = document.getElementById('crm-chart-bars');
    const range = document.getElementById('crm-bars-range');
    if (!host) return;
    const d = indicadores(lista);
    if (range) {
      range.textContent = d.total
        ? t('rh.candidateCount', '{count} candidatos', { count: d.total })
        : '';
    }
    if (!d.total) {
      host.innerHTML = '<div class="cdash-chart-empty">' +
        esc(t('rh.noCandidatesYet', 'Nenhum candidato ainda')) + '</div>';
      return;
    }
    const maior = Math.max(1, ...d.porEtapa.map(e => e.n));
    host.innerHTML = '<div class="rh-funil-barras">' + d.porEtapa.map(e => `
      <div class="rh-fb-linha">
        <span class="rh-fb-rot" title="${attr(e.nome)}">${esc(e.nome)}</span>
        <span class="rh-fb-trilho">
          <span class="rh-fb-barra" style="width:${(e.n / maior * 100).toFixed(1)}%"></span>
        </span>
        <span class="rh-fb-num">${e.n}</span>
      </div>`).join('') + '</div>';
  }

  function renderGraficos(lista) {
    renderLinha(lista);
    renderFunilBarras(lista);
  }

  /* ═════════════════════════════════════════════════════════════════════
     O QUADRO — FUNIL DE ETAPAS
     ═════════════════════════════════════════════════════════════════════ */

  /* Uma coluna é uma etapa. Mover o cartão para a coluna i quer dizer "ele
     está NA etapa i", ou seja: tudo antes dela concluído, ela e o que vem
     depois em aberto. É reversível — arrastar de volta desmarca. */
  function _checklistEm(rec, indice) {
    const nomes = etapas();
    const atual = Array.isArray(rec.checklist) && rec.checklist.length
      ? rec.checklist.map(i => ({ t: i.t, ok: !!i.ok }))
      : nomes.map(n => ({ t: n, ok: false }));
    return atual.map((item, i) => ({ t: item.t, ok: i < indice }));
  }

  /* Concluir o processo é marcar a última etapa — o único estado que não é
     "estar numa etapa", e por isso tem caminho próprio. */
  function _checklistCompleto(rec) {
    const nomes = etapas();
    const atual = Array.isArray(rec.checklist) && rec.checklist.length
      ? rec.checklist.map(i => ({ t: i.t, ok: !!i.ok }))
      : nomes.map(n => ({ t: n, ok: false }));
    return atual.map(item => ({ t: item.t, ok: true }));
  }

  async function mover(id, destino, lista) {
    const rec = (lista || []).find(r => r.id === id);
    if (!rec || typeof updateRecord !== 'function') return;
    const nomes = etapas();
    const ultimo = nomes.length - 1;
    const atual = etapaDe(rec);

    /* Passar da última coluna é concluir o processo — é para lá que o › aponta
       quando o candidato já está na última etapa. Soltar o cartão DENTRO de
       uma coluna nunca conclui nada: arrastar posiciona, e concluir é um
       gesto à parte, senão largar o cartão de volta no lugar admitiria
       alguém sem querer. */
    const checklist = destino > ultimo
      ? _checklistCompleto(rec)
      : _checklistEm(rec, Math.max(0, Math.min(ultimo, destino)));
    if (atual.concluido && destino > ultimo) return;   // já estava concluído

    await updateRecord(id, { checklist });

    /* Voltou para a primeira etapa: a proposta e o checklist de admissão
       daquela negociação deixam de valer. Ver limparPropostaEAdmissao. */
    if (destino === 0 && (atual.concluido || atual.indice > 0) &&
        typeof global.limparPropostaEAdmissao === 'function') {
      await global.limparPropostaEAdmissao(id);
    }

    if (typeof registrarAtividade === 'function') {
      const alvo = checklist.every(i => i.ok) ? nomes[ultimo] : nomes[Math.max(0, Math.min(ultimo, destino))];
      registrarAtividade('etapa', (rec.name || '') + ' · ' + (alvo || ''));
    }

    /* ── E O CANDIDATO FICA SABENDO ──
       Mudar de etapa é a única coisa que acontece neste quadro que interessa a
       alguém de fora — e essa pessoa é justamente a que nunca é avisada. O
       convite para mandar o e-mail nasce AQUI, e não dentro de cada botão,
       porque os três caminhos (‹, › e arrastar o cartão) passam todos por esta
       função. Fosse em cada botão, arrastar ficaria de fora — e quem foi
       arrastado continuaria no escuro sem que ninguém notasse a falha.

       Ele é um convite, e não um envio: cartão arrastado por engano é comum, e
       e-mail para candidato não se desfaz. A janela mostra o que vai ser dito
       e a quem, e tem uma caixinha para parar de perguntar. */
    const depois = etapaDe(Object.assign({}, rec, { checklist }));
    const mudouDeLugar = depois.indice !== atual.indice || depois.concluido !== atual.concluido;
    if (!mudouDeLugar) return;

    if (emailDe(rec)) {
      if (typeof global.crmAvisarCandidato === 'function') {
        global.crmAvisarCandidato(id, {
          auto: true,
          etapa: nomes[depois.indice] || '',
          situacao: depois.concluido ? 'fim'
                  : depois.indice > atual.indice ? 'avanco' : 'volta',
        });
      }
      return;
    }

    /* Sem e-mail na ficha o convite não abre — e o silêncio é exatamente o que
       parece defeito de quem move o cartão e espera alguma coisa acontecer.
       Um aviso curto dizendo por onde se resolve custa menos do que a dúvida. */
    if (typeof toast === 'function') {
      toast('✉️', t('rh.noticeNoEmailHint',
        '{name} não tem e-mail na ficha. Use ⋮ › Avisar por e-mail para informar um.',
        { name: rec.name || '—' }));
    }
  }

  /* ── ONDE A PESSOA ESTÁ ──────────────────────────────────────────────────
     Cidade e UF saem da ficha, que já os pergunta. Só a UF quando não há
     cidade, só a cidade quando não há UF: escrever "São Paulo, " com a vírgula
     pendurada anuncia um dado que não existe. Quem trabalha remoto e informou
     isso na ficha aparece como Remoto — é a informação que interessa a quem lê
     o funil, e é mais precisa do que a cidade nesse caso. */
  function localDe(rec) {
    const modalidade = String((rec && rec.campos && rec.campos.modelo) || '').toLowerCase();
    if (/remot/.test(modalidade)) return t('rh.remote', 'Remoto');
    const cidade = String((rec && rec.city) || '').trim();
    const uf = String((rec && rec.uf) || '').trim().toUpperCase();
    return [cidade, uf].filter(Boolean).join(', ');
  }

  /* ── QUANDO A CANDIDATURA CHEGOU ─────────────────────────────────────────
     "há 2h", "há 3d". Numa coluna de triagem com dezenas de pessoas, o que
     separa quem acabou de se inscrever de quem está esperando há uma semana é
     exatamente isso — e é a informação que some primeiro quando a lista
     cresce. Sai de `createdAt`, que é o instante em que a ficha nasceu: para
     quem veio pelo formulário, é a hora em que a resposta chegou. */
  function chegouHa(rec) {
    const ts = Number(rec && rec.createdAt) || 0;
    if (!ts) return '';
    const dif = Date.now() - ts;
    if (dif < 0) return '';
    const min = Math.floor(dif / 60000);
    if (min < 1)  return t('rh.justNow', 'agora');
    if (min < 60) return t('rh.agoMin', 'há {n}min', { n: min });
    const horas = Math.floor(min / 60);
    if (horas < 24) return t('rh.agoHour', 'há {n}h', { n: horas });
    const dias = Math.floor(horas / 24);
    if (dias < 30) return t('rh.agoDay', 'há {n}d', { n: dias });
    const meses = Math.floor(dias / 30);
    return t('rh.agoMonth', 'há {n}m', { n: meses });
  }

  function _cartao(rec) {
    const inicial = ((rec.name || '?').trim()[0] || '?').toUpperCase();
    const cores = typeof PAL !== 'undefined' ? PAL : null;
    const pal = (cores && (cores[rec.color] || cores.indigo)) || { bar: '#6366f1', dot: '#818cf8' };
    const e = etapaDe(rec);
    const rep = reprovado(rec);
    const ent = entrevistaDe(rec);
    const entFmt = ent && typeof _crmFmtDate === 'function' ? _crmFmtDate(ent) : ent;
    const pret = Number(rec.campos && rec.campos.pretensao) || 0;
    const vaga = vagaDe(rec);
    const docs = (rec.documents || []).length;
    const onde = localDe(rec);
    const quando = chegouHa(rec);
    /* A estrela marca quem a triagem por IA pontuou em 80 ou mais. Não é
       enfeite nem favorito escolhido a dedo: é o único número defensável
       sobre a pessoa, e serve para achar de relance quem já foi lido e
       passou. Sem triagem, ninguém tem estrela. */
    const nota = typeof global.notaIaDe === 'function' ? global.notaIaDe(rec) : null;
    const destaque = nota !== null && nota >= 80;
    /* A ESTRELA DIZ DE QUAL VAGA É A NOTA. Uma nota alta sem contexto é a
       porta para o erro que ela levantou: rodar a triagem de outra vaga
       sobrescreve o número, e o cartão passa a exibir 88 para um processo que
       nunca leu aquele currículo. Com a vaga escrita no rótulo, quem passa o
       mouse vê na hora se o número é do processo em que a pessoa está — e a
       data completa o quadro, porque nota velha de vaga certa também engana. */
    const notaVaga = String(rec.iaNotaVaga || '').trim();
    const notaEm = String(rec.iaNotaEm || '').trim();
    const notaQuando = notaEm && typeof _crmFmtDate === 'function'
      ? _crmFmtDate(notaEm) : notaEm;
    const dicaEstrela = notaVaga
      ? (notaQuando
        ? t('rh.starHintVagaData', 'Nota {n} na triagem para "{vaga}", em {data}',
            { n: nota, vaga: notaVaga, data: notaQuando })
        : t('rh.starHintVaga', 'Nota {n} na triagem para "{vaga}"',
            { n: nota, vaga: notaVaga }))
      : t('rh.starHint', 'Nota {n} na triagem por IA', { n: nota });

    return `
      <article class="rh-card${rep ? ' rh-card-rep' : ''}${e.concluido ? ' rh-card-ok' : ''}"
               draggable="true" data-id="${attr(rec.id)}" tabindex="0"
               title="${attr(t('rh.openCard', 'Abrir a ficha do candidato'))}">
        <div class="rh-card-top">
          <span class="rh-card-av" style="background:linear-gradient(135deg,${pal.bar},${pal.dot})">${esc(inicial)}</span>
          <div class="rh-card-id">
            <span class="rh-card-nome">${esc(rec.name || '—')}</span>
            ${vaga ? `<span class="rh-card-cargo">${esc(vaga)}</span>` : ''}
          </div>
          ${destaque ? `<span class="rh-card-estrela" title="${attr(dicaEstrela)}">★</span>` : ''}
          <button type="button" class="rh-mv rh-kebab" data-id="${attr(rec.id)}"
                  title="${attr(t('rh.cardActions', 'Ações do candidato'))}"
                  aria-label="${attr(t('rh.cardActions', 'Ações do candidato'))}">⋮</button>
        </div>
        <div class="rh-card-meta">
          ${onde ? `<span class="rh-card-local">📍 ${esc(onde)}</span>` : ''}
          ${entFmt ? `<span>🗓️ ${esc(entFmt)}</span>` : ''}
          ${pret ? `<span>💰 ${esc(typeof fmtBRL === 'function' ? fmtBRL(pret) : pret)}</span>` : ''}
          ${docs ? `<span>📎 ${docs}</span>` : ''}
          ${quando ? `<span class="rh-card-quando">${esc(quando)}</span>` : ''}
        </div>
        ${rep ? `<span class="rh-card-selo rep">${esc(t('rh.rejected', 'Reprovado'))}</span>`
              : e.concluido ? `<span class="rh-card-selo ok">${esc(t('rh.hired', 'Admitido'))}</span>` : ''}
      </article>`;
  }

  function renderFunil(lista, busca) {
    const host = document.getElementById('crm-funil');
    if (!host) return;
    const nomes = etapas();
    const cand  = candidatos(lista);
    const vis   = visiveis(lista, busca);

    const badge = document.getElementById('crm-count-badge');
    if (badge) {
      badge.textContent = cand.length
        ? t(cand.length === 1 ? 'rh.candidateOne' : 'rh.candidateMany',
            cand.length === 1 ? '{count} candidato' : '{count} candidatos',
            { count: cand.length })
        : '';
    }

    /* Registro da aba que não usa o modelo de recrutamento simplesmente não
       entra no funil, e isso não vira faixa de aviso: a barra amarela ficava
       fixa no topo do quadro repetindo, a cada carregamento, uma informação
       que só interessa uma vez — e num workspace que mistura clientes e
       candidatos ela nunca ia embora. Quem procura um registro que não está
       aqui volta ao modelo Financeiro e o encontra. */
    if (!cand.length) {
      host.innerHTML = `
        <div class="crm-empty rh-vazio">
          <div class="crm-empty-icon">🧑‍💼</div>
          <div class="crm-empty-title">${esc(t('rh.emptyTitle', 'Nenhum candidato ainda'))}</div>
          <div class="crm-empty-desc">${esc(t('rh.emptyDesc',
            'Cada candidato é uma ficha com o modelo "Processo seletivo". Crie a primeira, ou receba candidaturas por um formulário público.'))}</div>
          <button class="crm-empty-btn" id="rh-novo">＋ ${esc(t('rh.newCandidate', 'Novo candidato'))}</button>
        </div>`;
      host.querySelector('#rh-novo')?.addEventListener('click', () => {
        if (typeof openNewRecordModal === 'function') openNewRecordModal({ template: CHAVE_MODELO });
      });
      return;
    }

    const porColuna = nomes.map((nome, i) => ({
      nome, i, itens: vis.filter(r => etapaDe(r).indice === i),
    }));

    /* Esconder sem avisar é indistinguível de perder. As linhas só aparecem
       quando há alguém escondido, e levam a eles em um clique. */
    const nReprovados = cand.filter(reprovado).length;
    const nAdmitidos = cand.filter(r => !reprovado(r) && jaAdmitido(r)).length;
    const rodapeOcultos = (!_verReprovados && nReprovados)
      ? `<div class="rh-ocultos">${esc(t(nReprovados === 1 ? 'rh.hiddenOne' : 'rh.hiddenMany',
          nReprovados === 1 ? '{count} candidato reprovado está fora do funil'
                            : '{count} candidatos reprovados estão fora do funil',
          { count: nReprovados }))}<button type="button" id="rh-ver-reprovados">${
          esc(t('rh.seeRejected', 'ver'))}</button></div>`
      : _verReprovados
        ? `<div class="rh-ocultos">${esc(t('rh.showingRejected',
            'Mostrando apenas os candidatos reprovados.'))}<button type="button" id="rh-ver-reprovados">${
            esc(t('rh.backToFunnel', 'voltar ao funil'))}</button></div>`
        : '';
    const rodapeAdmitidos = _verReprovados ? ''
      : (_verAdmitidos
          ? `<div class="rh-ocultos">${esc(t('rh.showingHired',
              'Mostrando também quem já foi admitido.'))}<button type="button" id="rh-ver-admitidos">${
              esc(t('rh.backToFunnel', 'voltar ao funil'))}</button></div>`
          : (nAdmitidos
              ? `<div class="rh-ocultos">${esc(t(nAdmitidos === 1 ? 'rh.hiredOutOne' : 'rh.hiredOutMany',
                  nAdmitidos === 1 ? '{count} candidato já admitido saiu do funil e está no quadro de colaboradores'
                                   : '{count} candidatos já admitidos saíram do funil e estão no quadro de colaboradores',
                  { count: nAdmitidos }))}<button type="button" id="rh-ver-admitidos">${
                  esc(t('rh.seeHired', 'ver'))}</button></div>`
              : ''));

    host.innerHTML = '<div class="rh-funil">' + porColuna.map(col => `
      <section class="rh-col" data-col="${col.i}">
        <header class="rh-col-head">
          <span class="rh-col-nome" title="${attr(col.nome)}">${esc(col.nome)}</span>
          <span class="rh-col-num">${col.itens.length}</span>
        </header>
        <div class="rh-col-body" data-col="${col.i}">
          ${col.itens.map(_cartao).join('') ||
            `<div class="rh-col-vazia">${esc(t('rh.dropHere', 'Arraste um candidato para cá'))}</div>`}
        </div>
        <button type="button" class="rh-col-add" data-add="${col.i}">
          ＋ ${esc(t('rh.addCandidate', 'Adicionar candidato'))}
        </button>
      </section>`).join('') + '</div>' + rodapeOcultos + rodapeAdmitidos;

    host.querySelector('#rh-ver-reprovados')?.addEventListener('click', () => {
      filtroReprovados(!_verReprovados);
      if (typeof renderRecordsTable === 'function') renderRecordsTable();
    });
    host.querySelector('#rh-ver-admitidos')?.addEventListener('click', () => {
      filtroAdmitidos(!_verAdmitidos);
      if (typeof renderRecordsTable === 'function') renderRecordsTable();
    });
    _ligarEventos(host, lista);
    /* As fotos vem do IndexedDB, depois do desenho: buscar antes seguraria o
       funil inteiro esperando o disco para mostrar um circulo de 34px. */
    if (typeof global.pintarFotosDosCartoes === 'function') {
      global.pintarFotosDosCartoes();
    }
  }

  /* ── Arrastar, clicar e teclar ──
     O arrasto nativo do HTML não existe no toque, e o funil precisa funcionar
     no celular. Por isso cada cartão também tem ‹ e ›: são o mesmo movimento,
     por outro caminho, e servem igualmente a quem navega por teclado. */
  function _ligarEventos(host, lista) {
    let arrastando = null;

    host.querySelectorAll('.rh-card').forEach(card => {
      card.addEventListener('dragstart', ev => {
        arrastando = card.dataset.id;
        card.classList.add('arrastando');
        try { ev.dataTransfer.setData('text/plain', card.dataset.id); } catch (_) {}
        ev.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        arrastando = null;
        host.querySelectorAll('.arrastando').forEach(c => c.classList.remove('arrastando'));
        host.querySelectorAll('.rh-col-body.sobre').forEach(c => c.classList.remove('sobre'));
      });
      card.addEventListener('click', ev => {
        if (ev.target.closest('.rh-mv')) return;      // o botão tem trabalho próprio
        if (typeof openEditRecordModal === 'function') openEditRecordModal(card.dataset.id);
      });
      card.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        if (typeof openEditRecordModal === 'function') openEditRecordModal(card.dataset.id);
      });
    });

    host.querySelectorAll('.rh-kebab').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        if (typeof crmAcoesDoCandidato === 'function') {
          crmAcoesDoCandidato(btn.dataset.id, btn);
        }
      });
    });

    /* As setas ‹ › saíram do cartão junto com o layout do conceito e viraram
       "Avançar / Voltar uma etapa" no menu ⋮ (ver crmAcoesDoCandidato): o
       mesmo movimento, alcançável por toque e por teclado. */

    /* Cada coluna cria candidato JÁ NELA. O botão existe em todas porque nem
       todo mundo entra pela triagem: quem chega por indicação já vai para a
       entrevista, e obrigar a criar no começo e arrastar seria trabalho que a
       tela pode poupar. */
    host.querySelectorAll('.rh-col-add').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof openNewRecordModal !== 'function') return;
        const coluna = Number(btn.dataset.add) || 0;
        openNewRecordModal({
          template: CHAVE_MODELO,
          checklist: etapas().map((nome, i) => ({ t: nome, ok: i < coluna })),
          campos: _vaga && typeof global._vagaPorId === 'function' && global._vagaPorId(_vaga)
            ? { vagaId: String(_vaga), vaga: global._vagaPorId(_vaga).titulo }
            : {},
        });
      });
    });

    host.querySelectorAll('.rh-col-body').forEach(col => {
      col.addEventListener('dragover', ev => {
        if (!arrastando) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        col.classList.add('sobre');
      });
      col.addEventListener('dragleave', () => col.classList.remove('sobre'));
      col.addEventListener('drop', ev => {
        ev.preventDefault();
        col.classList.remove('sobre');
        const id = arrastando || (() => { try { return ev.dataTransfer.getData('text/plain'); } catch (_) { return ''; } })();
        arrastando = null;
        if (!id) return;
        mover(id, Number(col.dataset.col), lista);
      });
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     TRIAGEM DE CURRÍCULOS POR IA
     ═════════════════════════════════════════════════════════════════════
     Uma chamada só, com todos os candidatos da vaga juntos: a pergunta é
     comparativa ("quais destes se aproximam mais do cargo"), e uma análise por
     candidato não responderia isso — cada uma seria uma leitura isolada, sem
     ordem entre elas, e gastaria uma chamada da cota mensal por pessoa.

     O currículo vira texto AQUI, no navegador, pelos mesmos leitores que o
     visualizador de anexos usa. O que sobe para o servidor é texto — nunca o
     arquivo, nunca a foto da página. Currículo que não tem camada de texto
     (digitalizado, print) não é lido, e o candidato entra na lista assim
     mesmo, com o que há na ficha e o aviso de que o anexo não foi lido.

     A vaga é digitada pela pessoa e não deduzida do campo: "Analista" na ficha
     não diz o que a vaga exige, e é o requisito que faz a leitura valer. */

  const IA_MAX_CANDIDATOS = 12;

  /* NADA que não seja texto entra no que sobe para a IA.
     Um valor que chegue como objeto — ficha antiga, campo gravado por outro
     caminho, dado malformado no banco — viraria a string "[object Object]" e
     seria mandado ao modelo como se fosse o conteúdo do campo. O modelo então
     descreve o CANDIDATO como um erro de sistema, e a pessoa aparece na tela
     como se não tivesse enviado nada. Perder um campo estranho é melhor do que
     transformá-lo em lixo com aparência de resposta. */
  const soTexto = v => {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  };

  function _fichaEmTexto(rec) {
    const m = disponivel() ? global.MD_NICHOS.porChave[CHAVE_MODELO] : null;
    const linhas = [];
    (m ? m.campos : []).forEach(c => {
      if (c.k === 'parecer') return;            // opinião de quem avalia, não do candidato
      const v = soTexto(rec.campos && rec.campos[c.k]);
      if (!v) return;
      linhas.push(c.rot + ': ' + v);
    });
    const selo = soTexto(rec.campos && rec.campos.vaga__selo);
    if (selo) linhas.push(t('rh.stageCol', 'Etapa') + ': ' + selo);
    return linhas.join('\n');
  }

  /* Por que o currículo não pôde ser lido, em uma frase que serve para as duas
     pontas: vai no texto enviado ao modelo (para ele não confundir "não tem
     experiência" com "não conseguimos abrir o arquivo") e volta para a tela,
     onde a pessoa precisa saber que existe conserto — reenviar em .docx resolve
     um PDF digitalizado; um .png anexado por engano precisa de outro arquivo. */
  const MOTIVO_ANEXO = {
    semarquivo: () => t('rh.cvNone', 'Nenhum currículo anexado.'),
    imagem: () => t('rh.cvScanned',
      'O currículo é imagem (digitalizado ou foto) e não tem texto que se possa ler. Peça o arquivo em .docx ou um PDF exportado do editor.'),
    formato: () => t('rh.cvFormat',
      'O formato do anexo não pode ser lido aqui. Formatos aceitos: PDF com texto, .docx e texto puro.'),
    vazio: () => t('rh.cvEmpty', 'O arquivo abriu, mas não tem texto dentro.'),
    /* O caso que enganava: o arquivo abre, devolve alguma coisa, e essa coisa
       não é currículo — resto de OCR, marca d'água do gerador, codificação
       errada. Antes isso passava como leitura boa. */
    ilegivel: () => t('rh.cvGarbled',
      'O arquivo abriu, mas o que saiu dele não é texto legível — costuma ser PDF digitalizado ou exportado como imagem. Peça o currículo em .docx.'),
    erro: () => t('rh.cvError', 'O arquivo não pôde ser aberto.'),
  };
  const motivoDoAnexo = sit => (MOTIVO_ANEXO[sit] || MOTIVO_ANEXO.erro)();

  /* Monta o texto enviado ao modelo e devolve, junto, o que aconteceu com cada
     currículo. A tela precisa disso tanto quanto o modelo: sem currículo lido a
     análise vira leitura de formulário, e dizer isso ANTES é mais honesto do
     que entregar um ranking que parece basear-se em algo que ninguém leu. */
  async function textoDaTriagem(cands, vaga, requisitos) {
    /* ORÇAMENTO DE TEXTO. O servidor corta a entrada em 60 mil caracteres, e
       o corte é do FIM: com doze currículos de doze mil, os últimos candidatos
       sumiriam da análise sem aviso — e a lista sairia ordenada como se eles
       nunca tivessem existido. Pior tipo de erro, porque parece uma resposta
       completa. Por isso o teto por currículo é dividido pelo número de
       candidatos, com um piso: abaixo de ~2.500 caracteres o currículo vira
       recorte inútil, e nesse caso é melhor analisar menos gente por vez. */
    const ORCAMENTO = 50000;
    const porCandidato = Math.max(2500,
      Math.min(12000, Math.floor(ORCAMENTO / Math.max(1, cands.length))));

    const partes = [];
    partes.push(t('rh.iaRoleLine', 'VAGA: {role}', { role: vaga }));
    if (String(requisitos || '').trim()) {
      partes.push(t('rh.iaRequirementsLine', 'REQUISITOS E DESCRIÇÃO DA VAGA:') + '\n' +
                  String(requisitos).trim());
    }
    const leituras = [];

    /* Cada bloco vai NUMERADO e com o total. Dois candidatos com o mesmo nome —
       ou com o mesmo currículo, que acontece quando a mesma pessoa se inscreve
       duas vezes — eram lidos pelo modelo como um só, e a análise voltava com
       uma entrada a menos do que os candidatos enviados. O número é o que os
       torna distinguíveis mesmo sendo idênticos em todo o resto. */
    let ordem = 0;
    for (const rec of cands) {
      ordem++;
      const bloco = ['', '─────',
        t('rh.iaCandidateHeader', 'CANDIDATO {n} DE {total}: {name}',
          { n: ordem, total: cands.length,
            name: soTexto(rec.name) || t('rh.noName', 'Sem nome') })];
      const ficha = _fichaEmTexto(rec);
      if (ficha) bloco.push(t('rh.iaFormBlock', 'Ficha de inscrição:') + '\n' + ficha);

      const anexos = Array.isArray(rec.documents) ? rec.documents : [];
      let leitura = { situacao: 'semarquivo', texto: '' };
      for (const doc of anexos) {
        if (typeof _textoDeDocumento !== 'function') break;
        const r = await _textoDeDocumento(doc, porCandidato);
        leitura = r || leitura;
        if (r && r.texto) break;                // o primeiro legível basta
      }
      leituras.push({ nome: soTexto(rec.name) || t('rh.noName', 'Sem nome'),
                      situacao: leitura.situacao,
                      arquivo: soTexto(leitura.nome),
                      tipo: soTexto(leitura.tipo),
                      detalhe: soTexto(leitura.detalhe) });

      const textoDoCv = soTexto(leitura.texto);
      if (textoDoCv) {
        bloco.push(t('rh.iaCvBlock', 'Currículo anexado:') + '\n' + textoDoCv);
      } else {
        bloco.push(t('rh.iaCvBlock', 'Currículo anexado:') + ' ' +
                   t('rh.iaCvUnreadPrefix', 'NÃO LIDO — ') + motivoDoAnexo(leitura.situacao));
      }
      partes.push(bloco.join('\n'));
    }
    const lidos = leituras.filter(l => l.situacao === 'ok').length;
    return { texto: partes.join('\n'), lidos, leituras };
  }

  /* Janelinha que pergunta a vaga e a descrição. O campo da vaga já vem com o
     filtro ativo ou com a vaga mais comum entre os candidatos — quase sempre é
     ela, e digitar de novo o que está na tela é atrito à toa. */
  function abrirTriagem(lista) {
    const cands = candidatos(lista).filter(r => !reprovado(r));
    if (!cands.length) {
      if (typeof toast === 'function') {
        toast('ℹ️', t('rh.iaNoCandidates',
          'Cadastre candidatos com currículo antes de pedir a triagem.'));
      }
      return;
    }

    const listaVagas = vagas(lista);
    /* A contagem e por CHAVE (para nao fundir vagas homonimas), mas o campo da
       triagem e texto livre — entao a sugestao tem de sair como ROTULO. */
    const contagem = {};
    cands.forEach(r => { const v = chaveVagaDe(r); if (v) contagem[v] = (contagem[v] || 0) + 1; });
    const maisComum = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0] || '';
    const chaveSugerida = _vaga || maisComum;
    const vagaSugerida = listaVagas.find(v => v.chave === chaveSugerida) || null;
    const sugerida = vagaSugerida ? vagaSugerida.rotulo : (chaveSugerida || '');

    /* GANHO NOVO: a vaga cadastrada ja diz o que exige. Preencher os
       requisitos aqui faz a IA comparar o curriculo com a vaga de verdade,
       em vez de ler no vacuo. Continua editavel — e sugestao, nao trava. */
    const reqSugeridos = vagaSugerida && vagaSugerida.vaga
      ? [vagaSugerida.vaga.requisitos, vagaSugerida.vaga.desejaveis]
          .filter(Boolean).join('\n').trim()
      : '';

    /* Rotulo sugerido que NAO esta na lista (dado antigo, chave sem vaga) cai
       em "Outra vaga" com o texto preenchido. Sem esta checagem o navegador
       selecionaria a primeira opcao da lista — uma vaga que ninguem escolheu,
       e sem nada na tela dizendo isso. */
    const rotulos = [...new Set(listaVagas.map(v => v.rotulo))].filter(Boolean);
    const sugeridaNaLista = !!sugerida && rotulos.includes(sugerida);

    document.querySelector('.rh-ia-bg')?.remove();
    const bg = document.createElement('div');
    bg.className = 'modal-bg rh-ia-bg';
    bg.innerHTML = `
      <div class="modal rh-ia-modal">
        <div class="m-h1">${esc(t('rh.iaTitle', 'Analisar currículos'))}</div>
        <div class="m-sub">${esc(t('rh.iaSubtitle',
          'A IA lê os currículos anexados e ordena os candidatos por aderência à vaga.'))}</div>

        <!-- LISTA DE VERDADE, E NAO CAMPO DE TEXTO COM SUGESTOES.
             Era um <input list="…">, e o Chrome FILTRA as sugestoes pelo que ja
             esta escrito no campo: com uma vaga preenchida — que e o caso
             normal, porque a janela ja chega sugerindo uma — a setinha abria
             mostrando UMA opcao, a que ja estava la. Com duas vagas
             cadastradas, aparecia uma; e trocar de vaga exigia apagar o texto
             primeiro, coisa que ninguem adivinha. Escolher a vaga e o primeiro
             gesto desta janela e nao pode depender de um truque.
             Digitar um nome livre continua possivel, pela ultima opcao. -->
        <label class="crm-modal-lbl" for="rh-ia-vaga-sel">${esc(t('rh.iaRoleLabel', 'Vaga'))}</label>
        <select class="m-inp" id="rh-ia-vaga-sel">
          ${rotulos.map(r =>
            `<option value="${attr(r)}"${r === sugerida ? ' selected' : ''}>${esc(r)}</option>`).join('')}
          <option value="__outra"${sugeridaNaLista ? '' : ' selected'}>${
            esc(t('rh.iaRoleOther', 'Outra vaga (digitar)'))}</option>
        </select>
        <input class="m-inp rh-ia-vaga-outra" id="rh-ia-vaga" maxlength="120"
               value="${attr(sugeridaNaLista ? '' : sugerida)}"
               placeholder="${attr(t('rh.iaRolePh', 'Ex.: Analista de dados júnior'))}"
               ${sugeridaNaLista ? 'hidden' : ''}>
        <div class="rh-ia-dica">${esc(t('rh.iaRoleFree',
          'A lista traz as vagas cadastradas e as que ja aparecem nos candidatos. Voce pode digitar qualquer outro nome.'))}</div>

        <label class="crm-modal-lbl" for="rh-ia-req">${esc(t('rh.iaReqLabel', 'O que a vaga exige (opcional)'))}</label>
        <textarea class="m-inp" id="rh-ia-req" rows="3" maxlength="1200"
                  placeholder="${attr(t('rh.iaReqPh',
                    'Requisitos, ferramentas, senioridade, o que é desejável. Quanto mais claro, melhor a leitura.'))}">${esc(reqSugeridos)}</textarea>

        <div class="rh-ia-formatos">${esc(t('rh.iaFormats',
          'Lê PDF com texto, .docx e texto puro. PDF digitalizado (foto de página) não tem texto para ler.'))}</div>

        <div class="rh-ia-aviso">${esc(t('rh.iaNotice',
          'A nota de 0 a 100 mede aderência aos requisitos da vaga — não a pessoa — e só aparece quando o currículo pôde ser lido. A IA foi instruída a ignorar idade, gênero, raça, estado civil e origem, e a apontar o que não consta em vez de deduzir. É apoio de triagem, não decisão: confira sempre no currículo original.'))}</div>

        <div class="rh-ia-conta" id="rh-ia-conta"></div>
        <div class="m-div"></div>
        <div class="m-btns">
          <button class="m-cancel" id="rh-ia-cancel">${esc(t('rh.iaCancel', 'Cancelar'))}</button>
          <button class="m-confirm" id="rh-ia-ok">${esc(t('rh.iaRun', 'Analisar'))}</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const selVaga = bg.querySelector('#rh-ia-vaga-sel');
    const inpVaga = bg.querySelector('#rh-ia-vaga');
    const reqEl   = bg.querySelector('#rh-ia-req');
    const conta   = bg.querySelector('#rh-ia-conta');
    const btn     = bg.querySelector('#rh-ia-ok');

    const vagaEscolhida = () => (
      selVaga.value === '__outra' ? inpVaga.value : selVaga.value
    ).trim();

    /* Quantos entram na conta, atualizado a cada troca: a pessoa precisa ver
       ANTES de gastar a chamada que "Analista" pega 4 e "analista" pega 4
       também, mas que um nome fora da lista pega todo mundo. */
    const selecionados = () => {
      const v = vagaEscolhida().toLowerCase();
      const daVaga = v ? cands.filter(r => vagaDe(r).toLowerCase() === v) : [];
      return (daVaga.length ? daVaga : cands).slice(0, IA_MAX_CANDIDATOS);
    };
    const atualizarConta = () => {
      const n = selecionados().length;
      const total = cands.length;
      conta.textContent = t('rh.iaCount',
        '{n} candidatos entram na análise (de {total} em processo).', { n, total }) +
        (total > IA_MAX_CANDIDATOS
          ? ' ' + t('rh.iaCap', 'O limite por análise é {cap}.', { cap: IA_MAX_CANDIDATOS })
          : '');
    };

    /* TROCAR DE VAGA TROCA TAMBEM O QUE ELA EXIGE. Os requisitos vinham da
       vaga sugerida na abertura e ficavam congelados: quem trocasse de vaga
       mandaria a IA comparar o curriculo com os requisitos da OUTRA — e o
       relatorio sairia com a cara de certo. O que a pessoa escreveu a mao
       nunca e sobrescrito; so a sugestao anterior. */
    const requisitosDe = rotulo => {
      const achada = listaVagas.find(v => v.rotulo === rotulo && v.vaga);
      return achada
        ? [achada.vaga.requisitos, achada.vaga.desejaveis].filter(Boolean).join('\n').trim()
        : '';
    };
    let ultimaSugestao = reqSugeridos;
    const trocouDeVaga = () => {
      const outra = selVaga.value === '__outra';
      inpVaga.hidden = !outra;
      if (outra) inpVaga.focus();
      const sugestao = outra ? '' : requisitosDe(selVaga.value);
      if (reqEl && reqEl.value.trim() === ultimaSugestao.trim()) {
        reqEl.value = sugestao;
        ultimaSugestao = sugestao;
      }
      atualizarConta();
    };
    selVaga.addEventListener('change', trocouDeVaga);
    inpVaga.addEventListener('input', atualizarConta);
    atualizarConta();

    const fechar = () => bg.remove();
    bg.querySelector('#rh-ia-cancel').addEventListener('click', fechar);
    bg.addEventListener('click', e => { if (e.target === bg) fechar(); });

    btn.addEventListener('click', async () => {
      const vaga = vagaEscolhida();
      if (!vaga) {
        (selVaga.value === '__outra' ? inpVaga : selVaga).focus();
        return;
      }
      const escolhidos = selecionados();
      btn.disabled = true;
      btn.textContent = t('rh.iaReading', 'Lendo currículos…');
      try {
        const { texto, lidos, leituras } = await textoDaTriagem(
          escolhidos, vaga, bg.querySelector('#rh-ia-req').value);
        btn.textContent = t('rh.iaAnalyzing', 'Analisando…');
        const r = await pedirResumo('curriculos', texto);
        fechar();
        mostrarTriagem(vaga, r, leituras);
        await _gravarNotasDaTriagem(r, escolhidos, vaga);
        await _avancoAutomatico(vaga, r, escolhidos);
        if (global.mdTrack) mdTrack('rh_triagem_ia', { candidatos: escolhidos.length, lidos });
      } catch (e) {
        if (typeof toast === 'function') toast('⚠', e.message);
        /* 403 = tarefa exclusiva do Premium; 429 = cota do mês esgotada. Os
           dois levam à mesma tela, e é o `premium: false` do servidor que
           distingue quem pode assinar de quem já assinou. */
        if ((e.status === 403 || e.status === 429) && e.premium === false &&
            typeof showPremiumModal === 'function') {
          setTimeout(showPremiumModal, 900);
        }
        btn.disabled = false;
        btn.textContent = t('rh.iaRun', 'Analisar');
      }
    });

    setTimeout(() => (selVaga.value === '__outra' ? inpVaga : selVaga).focus(), 80);
  }

  /* ── A resposta do modelo vira estrutura ─────────────────────────────────
     Ela chega como texto, num formato que o prompt fixa: cabeçalho, depois um
     candidato por vez com "N. Nome", "Nota: NN/100", "Por quê:", linhas com
     "+ " e "- ", e "Falta saber:". Ler isso e montar cartões custa trinta
     linhas e muda o que a pessoa consegue fazer com o resultado: parágrafo
     corrido obriga a ler tudo para achar quem pontuou mais; cartão com nota
     deixa comparar de relance, que é a razão de existir de uma triagem.

     Formato que fuja do combinado NÃO é perdido: o que não casar com nenhum
     padrão vai para o rodapé do cartão como texto. Um leitor que engole o que
     não entende seria pior do que não ter leitor. */
  function _lerTriagem(bruto) {
    const linhas = String(bruto || '').split('\n');
    const cab = [];
    const itens = [];
    let atual = null;
    let rodape = '';

    const fecha = () => { if (atual) itens.push(atual); atual = null; };

    linhas.forEach(cru => {
      const linha = cru.trim();
      if (!linha) return;

      const inicio = linha.match(/^(\d{1,2})[.)]\s+(.+)$/);
      if (inicio) {
        fecha();
        // "1. Ana — aderência alta": o travessão é resquício do formato antigo
        // e continua sendo aparado, para o nome não vir grudado num adjetivo.
        atual = { pos: Number(inicio[1]), nome: inicio[2].split(/\s+[—–-]\s+/)[0].trim(),
                  nota: null, semNota: false, porque: '', mais: [], menos: [], falta: '', solto: [] };
        return;
      }

      if (/^como usar\s*:/i.test(linha)) { fecha(); rodape = linha.replace(/^[^:]*:\s*/, ''); return; }

      if (!atual) { cab.push(linha); return; }

      const nota = linha.match(/^nota\s*:\s*(.*)$/i);
      if (nota) {
        const n = nota[1].match(/(\d{1,3})/);
        if (n && Number(n[1]) <= 100) atual.nota = Number(n[1]);
        else atual.semNota = true;
        return;
      }
      const porque = linha.match(/^(?:por qu[êe]|porqu[êe])\s*:\s*(.*)$/i);
      if (porque) { atual.porque = porque[1]; return; }
      const falta = linha.match(/^falta saber\s*:\s*(.*)$/i);
      if (falta) { atual.falta = falta[1]; return; }
      if (/^[+•]\s+/.test(linha)) { atual.mais.push(linha.replace(/^[+•]\s+/, '')); return; }
      if (/^[-–—]\s+/.test(linha)) { atual.menos.push(linha.replace(/^[-–—]\s+/, '')); return; }
      atual.solto.push(linha);
    });
    fecha();
    return { cab, itens, rodape };
  }

  /* Faixa da nota. A cor NUNCA carrega o significado sozinha: o número está
     escrito ao lado, e a faixa tem nome. Cor sozinha não diz nada a quem não
     distingue verde de âmbar, e aqui o que está em jogo é a leitura de uma
     candidatura. */
  function _faixaDaNota(n) {
    if (n >= 85) return { k: 'alta',  rot: t('rh.bandHigh', 'Atende com folga') };
    if (n >= 70) return { k: 'boa',   rot: t('rh.bandGood', 'Atende ao essencial') };
    if (n >= 50) return { k: 'media', rot: t('rh.bandMid', 'Atende em parte') };
    if (n >= 25) return { k: 'baixa', rot: t('rh.bandLow', 'Pouca aderência') };
    return { k: 'fora', rot: t('rh.bandOut', 'Outra área') };
  }

  /* ── O NOME VEM COM A ANÁLISE, E NUNCA É REMONTADO AQUI ──────────────────
     TENTATIVA QUE DEU ERRADO, registrada para não se repetir. Para garantir o
     nome da ficha, o app passou a IGNORAR o nome escrito pelo modelo e a
     recolocá-lo pela POSIÇÃO: "o item que veio como 1 é o candidato 1". A
     validação parecia suficiente — mesma quantidade, todos na faixa, sem
     repetição.

     Não era. Quando o modelo responde ordenado por nota e renumera de 1 a N
     por ranking, a lista passa em todas essas checagens e ainda assim cada
     nome cai na análise de outra pessoa. Foi o que aconteceu em 02/08/2026: o
     currículo do Victor apareceu com o nome do Artur. Num relatório de
     recrutamento isso não é um detalhe de tela — é atribuir a formação, a
     experiência e a nota de alguém a outra pessoa.

     O erro de fundo foi tratar um número escrito pelo modelo como chave
     confiável de identidade. Ele não é: "1" tanto pode ser o bloco 1 quanto o
     primeiro colocado, e as duas leituras produzem sequências idênticas —
     não há validação capaz de distingui-las depois do fato.

     O nome agora fica onde sempre esteve certo: colado na análise que o
     próprio modelo escreveu. Quem garante que ele seja o da ficha é a
     INSTRUÇÃO no servidor (api/ia.js), que manda copiar o nome do cabeçalho do
     bloco letra por letra, inclusive "Sem nome" — e essa garantia não depende
     de numeração nenhuma. */

  /* Guarda a nota da IA NO CARD, no momento da triagem.

     Ela precisa existir antes de a pessoa ser aprovada, reprovada ou
     excluida: e nesse instante que a leitura foi feita, contra os requisitos
     daquela vaga. Recalcular depois seria outro numero, de outro contexto —
     e a pessoa ja pode nem estar mais no funil.

     Mesmo casamento por NOME do avanco automatico, e pela mesma razao: a
     posicao do bloco nao e identidade. Nome ambiguo nao recebe nota, porque
     dar a nota de uma pessoa a outra e pior do que ficar sem nota. */
  async function _gravarNotasDaTriagem(dados, escolhidos, vaga) {
    if (typeof updateRecord !== 'function') return;
    const { itens } = _lerTriagem(dados && dados.resumo);
    const quando = new Date().toISOString().slice(0, 10);
    /* A NOTA GUARDA DE QUAL VAGA ELA É. Sem isso, rodar a triagem de uma
       segunda vaga sobrescreve a nota da primeira e o cartão passa a exibir
       um número que não diz mais respeito ao processo em que a pessoa está —
       88 para Analista de Marketing vira 88 para Suporte Técnico, e ninguém
       tem como perceber olhando a tela. Com a vaga junto, a estrela diz a que
       leitura o número pertence. */
    const daVaga = String(vaga || '').trim().slice(0, 120);

    for (const it of itens) {
      if (it.nota === null) continue;
      const alvo = String(it.nome || '').trim().toLowerCase();
      if (!alvo) continue;
      const casam = (escolhidos || []).filter(
        r => String(r.name || '').trim().toLowerCase() === alvo);
      if (casam.length !== 1) continue;
      await updateRecord(casam[0].id,
        { iaNota: it.nota, iaNotaEm: quando, iaNotaVaga: daVaga });
    }
  }

  /* Corte usado quando a vaga nao diz outro. E o mesmo numero que a tela da
     vaga ja mostra como padrao — aqui ele serve tambem para decidir se vale a
     pena explicar por que ninguem se moveu. */
  const CORTE_PADRAO = 80;

  /* A vaga CADASTRADA de um candidato — de quem e a regra de corte.

     O nome digitado na janela da triagem e a ULTIMA tentativa, e nao a
     primeira. Ele e texto livre, e duas vagas com o mesmo titulo nao podem ser
     desempatadas por ele: `_vagaPorTitulo` devolve null nesse caso, e a regra
     sumia inteira justamente para quem tinha a vaga duplicada — o mesmo motivo
     que fazia a lista da triagem mostrar um item onde havia dois. O candidato,
     esse, sabe de qual vaga ele e. */
  function _vagaDoCandidato(rec, digitada) {
    const campos = (rec && rec.campos) || {};
    if (typeof global._vagaPorId === 'function') {
      const porId = global._vagaPorId(campos.vagaId);
      if (porId) return porId;
    }
    if (typeof global._vagaPorTitulo !== 'function') return null;
    return global._vagaPorTitulo(campos.vaga) || global._vagaPorTitulo(digitada);
  }

  /* ── Avanco automatico pela nota ────────────────────────────────────────
     A vaga pode declarar "nota X ou mais vai para a 2a etapa". A regra vive
     na vaga porque cada processo tem seu corte.

     O CASAMENTO E POR NOME, nunca por posicao. Ja aconteceu aqui: quando o
     modelo respondeu ordenado por nota e renumerou de 1 a N, casar por
     indice colocou o curriculo de uma pessoa na analise de outra, e nenhuma
     validacao de quantidade ou faixa pega isso — as duas leituras produzem
     sequencias identicas. O servidor manda copiar o nome do cabecalho do
     bloco justamente para existir uma chave colada ao conteudo.

     Nome que nao casa com EXATAMENTE um candidato e ignorado. Diante da
     duvida, nao mover e sempre melhor do que mover a pessoa errada.

     So avanca. Nunca volta ninguem, nunca reprova, e nunca mexe em quem ja
     passou dessa etapa. */
  async function _avancoAutomatico(vaga, dados, escolhidos) {
    const nomes = etapas();
    const DESTINO = 1;                    // 2a coluna: Entrevista RH
    if (nomes.length <= DESTINO) return;

    const { itens } = _lerTriagem(dados && dados.resumo);
    const movidos = [];
    const desligadas = new Set();         // vagas achadas, com a regra off
    let semCadastro = 0;                  // nota alta e nenhuma vaga cadastrada
    let corteUsado = CORTE_PADRAO;

    for (const it of itens) {
      if (it.nota === null) continue;

      const alvo = String(it.nome || '').trim().toLowerCase();
      if (!alvo) continue;
      const casam = (escolhidos || []).filter(
        r => String(r.name || '').trim().toLowerCase() === alvo);
      if (casam.length !== 1) continue;   // ambiguo ou inexistente: nao mexe

      const rec = casam[0];
      if (reprovado(rec)) continue;

      const cadastro = _vagaDoCandidato(rec, vaga);
      if (!cadastro) {
        if (it.nota >= CORTE_PADRAO) semCadastro++;
        continue;
      }
      const corte = Number(cadastro.notaMinima) || CORTE_PADRAO;
      if (it.nota < corte) continue;
      if (!cadastro.avancoAuto) {
        desligadas.add(String(cadastro.titulo || vaga || '').trim());
        continue;
      }
      corteUsado = corte;

      const onde = etapaDe(rec);
      if (onde.concluido || onde.indice >= DESTINO) continue;  // so para frente

      await mover(rec.id, DESTINO, escolhidos);
      movidos.push(rec.name);
    }

    if (typeof toast !== 'function') return;
    if (movidos.length) {
      toast('⏩', t('rh.autoAdvanced',
        '{n} candidato(s) com nota {corte}+ foram para "{etapa}": {nomes}.',
        { n: movidos.length, corte: corteUsado, etapa: nomes[DESTINO],
          nomes: movidos.join(', ') }));
      return;
    }

    /* NAO MOVER EM SILENCIO E INDISTINGUIVEL DE DEFEITO. A triagem mostra as
       notas na tela; quem ve um 92 ao lado de um corte de 80 e ninguem sair do
       lugar conclui que o recurso esta quebrado — e nao tem como descobrir que
       falta um interruptor numa outra tela. */
    if (desligadas.size) {
      const quais = [...desligadas].filter(Boolean).join(', ');
      toast('ℹ️', t('rh.autoAdvanceOff',
        'Ninguem foi movido: o avanco automatico esta desligado em "{vaga}". Ligue em Vagas, na caixa "Avancar sozinho pela nota da IA".',
        { vaga: quais }));
    } else if (semCadastro) {
      toast('ℹ️', t('rh.autoAdvanceNoVacancy',
        'Ninguem foi movido: nao ha vaga cadastrada para estes candidatos, e a regra de nota vive na vaga. Cadastre-a em Vagas para o avanco funcionar.'));
    }
  }

  function mostrarTriagem(vaga, dados, leituras) {
    const { cab, itens, rodape } = _lerTriagem(dados && dados.resumo);
    const naoLidos = (leituras || []).filter(l => l.situacao !== 'ok');

    document.querySelector('.rh-tri-bg')?.remove();
    const bg = document.createElement('div');
    bg.className = 'rh-tri-bg';

    const cartao = it => {
      const f = it.nota !== null ? _faixaDaNota(it.nota) : null;
      return `
      <article class="rh-tri-card">
        <header class="rh-tri-card-cab">
          <span class="rh-tri-pos">${it.pos}</span>
          <span class="rh-tri-nome">${esc(it.nome)}</span>
          ${f ? `<span class="rh-tri-nota n-${f.k}">
                   <b>${it.nota}</b><i>/100</i>
                   <span class="rh-tri-faixa">${esc(f.rot)}</span>
                 </span>`
              : `<span class="rh-tri-nota n-sem">${esc(t('rh.noScore', 'sem nota'))}</span>`}
        </header>
        ${it.porque ? `<p class="rh-tri-porque">${esc(it.porque)}</p>` : ''}
        ${it.mais.length ? `<ul class="rh-tri-lista mais">${
          it.mais.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${it.menos.length ? `<ul class="rh-tri-lista menos">${
          it.menos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${it.falta ? `<p class="rh-tri-falta"><b>${esc(t('rh.gapLabel', 'Falta saber'))}:</b> ${esc(it.falta)}</p>` : ''}
        ${it.solto.length ? `<p class="rh-tri-solto">${esc(it.solto.join(' '))}</p>` : ''}
      </article>`;
    };

    bg.innerHTML = `
      <div class="rh-tri-folha" role="dialog" aria-label="${attr(t('rh.iaTitle', 'Analisar currículos'))}">
        <header class="rh-tri-cab">
          <div>
            <div class="rh-tri-eyebrow">${esc(t('rh.reportTitle', 'Relatório de recrutamento'))}</div>
            <h1>${esc(t('rh.iaResultTitle', 'Triagem · {role}', { role: vaga }))}</h1>
          </div>
          <button class="rh-tri-x" id="rh-tri-x" aria-label="${attr(t('rh.closeEsc', 'Fechar (Esc)'))}">✕</button>
        </header>

        <div class="rh-tri-corpo">
          ${cab.length ? `<section class="rh-tri-intro">${
            cab.map(l => {
              const m = l.match(/^([^:]{3,32}):\s*(.*)$/);
              return m ? `<p><b>${esc(m[1])}:</b> ${esc(m[2])}</p>` : `<p>${esc(l)}</p>`;
            }).join('')}</section>` : ''}

          ${itens.length ? itens.map(cartao).join('')
            : `<p class="rh-tri-solto">${esc(String((dados && dados.resumo) || ''))}</p>`}

          ${naoLidos.length ? `<section class="rh-tri-avisos">
            <div class="rh-tri-avisos-tit">${esc(t('rh.unreadTitle',
              'Currículos que não puderam ser lidos'))}</div>
            ${naoLidos.map(l => `<div class="rh-tri-aviso-item">
              <b>${esc(l.nome)}</b>${l.arquivo ? ` · ${esc(l.arquivo)}` : ''}${
              l.tipo ? ` · ${esc(l.tipo)}` : ''}${l.detalhe ? ` · ${esc(l.detalhe)}` : ''}
              <span>${esc(motivoDoAnexo(l.situacao))}</span>
            </div>`).join('')}
          </section>` : ''}

          ${dados && dados.cortado ? `<p class="rh-tri-comousar">${esc(t('rh.iaTruncated',
            'O material passou do que cabe numa leitura só: parte do texto ficou de fora. Analise menos candidatos por vez para a ordem ficar confiável.'))}</p>` : ''}
          ${rodape ? `<p class="rh-tri-comousar">${esc(rodape)}</p>` : ''}
        </div>

        <footer class="rh-tri-pe">
          <span class="rh-tri-nota-pe">${esc(t('rh.iaFooter',
            'Apoio de triagem gerado por IA — a decisão, a entrevista e a verificação são suas.'))}${
            dados && dados.limite ? ` · ${dados.usados}/${dados.limite}` : ''}</span>
          <button class="rh-tri-copiar" id="rh-tri-copiar">${esc(t('rh.copy', 'Copiar'))}</button>
        </footer>
      </div>`;

    document.body.appendChild(bg);
    const sair = () => bg.remove();
    bg.querySelector('#rh-tri-x').addEventListener('click', sair);
    bg.addEventListener('click', e => { if (e.target === bg) sair(); });
    document.addEventListener('keydown', function esq(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esq); sair(); }
    });
    bg.querySelector('#rh-tri-copiar').addEventListener('click', async ev => {
      try {
        await navigator.clipboard.writeText(String((dados && dados.resumo) || ''));
        ev.target.textContent = t('rh.copied', 'Copiado');
      } catch (_) { ev.target.textContent = t('rh.copyFail', 'Não deu'); }
      setTimeout(() => { ev.target.textContent = t('rh.copy', 'Copiar'); }, 1600);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     RELATÓRIO DE RECRUTAMENTO
     ═════════════════════════════════════════════════════════════════════
     Mesma folha do relatório financeiro (classes .rel-*), outro conteúdo.
     Sai por impressão — "Salvar como PDF" da própria impressão resolve; o
     gerador de PDF do MyDesk é escrito à mão para o layout financeiro e não
     serve a este sem ser reescrito inteiro. */
  function relatorio(lista) {
    const host = document.getElementById('crm-relatorio');
    if (!host) return;
    const d = indicadores(lista);
    const hoje = new Date();
    const locale = typeof _appLocale === 'function' ? _appLocale() : 'pt-BR';
    const maior = Math.max(1, ...d.porEtapa.map(e => e.n));
    const ref = 'MD-RH-' + hoje.toISOString().slice(0, 10).replace(/-/g, '') + '-' +
                String(d.total).padStart(3, '0');

    // Uma linha por vaga: quantos se inscreveram, quantos seguem, quantos
    // entraram. É a pergunta que um processo seletivo responde.
    const porVaga = d.vagas.map(v => {
      // Agrupa pela CHAVE e exibe o ROTULO: duas vagas de mesmo nome nao se
      // fundem numa linha so, e renomear uma nao reescreve o historico.
      const itens = d.cand.filter(r => chaveVagaDe(r) === v.chave);
      return {
        vaga: v.rotulo, total: itens.length,
        admitidos: itens.filter(r => etapaDe(r).concluido).length,
        reprovados: itens.filter(reprovado).length,
      };
    }).sort((a, b) => b.total - a.total);
    const semVaga = d.cand.filter(r => !chaveVagaDe(r)).length;

    host.innerHTML = `
      <div class="rel-folha">
        <header class="rel-masthead">
          <div>
            <div class="rel-eyebrow">${esc(t('rh.reportTitle', 'Relatório de recrutamento'))}</div>
            <h1>${esc((_cu() && (_cu().name || _cu().username)) || '')}</h1>
            <div class="rel-meta">
              <span>${hoje.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <span>${esc(t(d.total === 1 ? 'rh.candidateOne' : 'rh.candidateMany',
                d.total === 1 ? '{count} candidato' : '{count} candidatos', { count: d.total }))}</span>
              <span class="rel-ref">${ref}</span>
            </div>
          </div>
          <div class="rel-logo">MyDesk</div>
        </header>

        <section class="rel-hero">
          <div class="rel-hero-rot">${esc(t('rh.inProcessNow', 'Em processo agora'))}</div>
          <div class="rel-hero-num">${d.emProcesso}</div>
        </section>

        <section class="rel-kpis">
          <div class="rel-kpi"><span>${esc(t('rh.kpiHireRate', 'Taxa de contratação'))}</span>
            <b>${(d.aproveitamento * 100).toFixed(0)}%</b></div>
          <div class="rel-kpi"><span>${esc(t('rh.hiredLabel', 'Admitidos'))}</span><b>${d.admitidos}</b></div>
          <div class="rel-kpi"><span>${esc(t('rh.avgTimeLabel', 'Tempo médio'))}</span>
            <b>${d.tempoMedio ? Math.round(d.tempoMedio) : '—'}</b>
            <em>${d.tempoMedio ? esc(t('rh.daysUnit', 'dias')) : ''}</em></div>
          <div class="rel-kpi"><span>${esc(t('rh.rejectedLabel', 'Reprovados'))}</span><b>${d.reprovados}</b></div>
        </section>

        <section>
          <h2>${esc(t('rh.funnelTitle', 'Funil por etapa'))}</h2>
          <table class="rel-tab">
            <thead><tr><th>${esc(t('rh.stageCol', 'Etapa'))}</th><th class="rel-w">${esc(t('rh.volumeCol', 'Volume'))}</th><th class="num">${esc(t('rh.peopleCol', 'Pessoas'))}</th></tr></thead>
            <tbody>
              ${d.porEtapa.map(e => `<tr>
                <td class="rel-mes">${esc(e.nome)}</td>
                <td class="rel-w">${e.n ? `<span class="rel-minibar" style="width:${(e.n / maior * 100).toFixed(1)}%"></span>` : ''}</td>
                <td class="num">${e.n}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </section>

        ${porVaga.length ? `<section>
          <h2>${esc(t('rh.byRoleTitle', 'Por vaga'))}</h2>
          <table class="rel-tab rel-zebra">
            <thead><tr><th>${esc(t('rh.roleCol', 'Vaga'))}</th><th class="num">${esc(t('rh.applicantsCol', 'Candidatos'))}</th><th class="num">${esc(t('rh.hiredLabel', 'Admitidos'))}</th><th class="num">${esc(t('rh.rejectedLabel', 'Reprovados'))}</th></tr></thead>
            <tbody>
              ${porVaga.map(v => `<tr>
                <td>${esc(v.vaga)}</td><td class="num">${v.total}</td>
                <td class="num">${v.admitidos}</td><td class="num">${v.reprovados}</td>
              </tr>`).join('')}
              ${semVaga ? `<tr><td><em>${esc(t('rh.noRole', 'sem vaga informada'))}</em></td>
                <td class="num">${semVaga}</td><td class="num">—</td><td class="num">—</td></tr>` : ''}
            </tbody>
          </table>
        </section>` : ''}

        <section>
          <h2>${esc(t('rh.candidatesTitle', 'Candidatos'))} <span class="rel-cont">${d.total}</span></h2>
          <table class="rel-tab rel-zebra">
            <thead><tr>
              <th>${esc(t('rh.nameCol', 'Nome'))}</th><th>${esc(t('rh.roleCol', 'Vaga'))}</th>
              <th>${esc(t('rh.stageCol', 'Etapa'))}</th><th>${esc(t('rh.interviewCol', 'Entrevista'))}</th>
            </tr></thead>
            <tbody>
              ${d.cand.map(r => {
                const e = etapaDe(r);
                const nome = e.concluido ? t('rh.hired', 'Admitido')
                           : reprovado(r) ? t('rh.rejected', 'Reprovado')
                           : (etapas()[e.indice] || '—');
                const k = e.concluido ? 'pago' : reprovado(r) ? 'atraso' : 'pendente';
                const ent = entrevistaDe(r);
                return `<tr>
                  <td>${esc(r.name || '—')}</td>
                  <td>${esc(vagaDe(r) || '—')}</td>
                  <td><span class="rel-pill s-${k}">${esc(nome)}</span></td>
                  <td class="rel-venc">${ent ? esc(typeof _crmFmtDate === 'function' ? _crmFmtDate(ent) : ent) : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </section>

        <footer class="rel-rodape">
          <span>${esc(t('rh.reportFooter', 'Documento gerado automaticamente pelo MyDesk'))}</span>
          <span>${hoje.toLocaleString(locale)} · ${ref}</span>
        </footer>

        <div class="rel-acoes">
          <button id="rel-imprimir" class="primario">${esc(t('rh.print', 'Imprimir'))}</button>
        </div>
      </div>
      <button class="rel-x" id="rel-fechar" title="${attr(t('rh.closeEsc', 'Fechar (Esc)'))}"
              aria-label="${attr(t('rh.closeReport', 'Fechar relatório'))}">✕</button>`;

    host.classList.add('aberto');
    const fechar = () => host.classList.remove('aberto');
    host.querySelector('#rel-fechar').addEventListener('click', fechar);
    document.addEventListener('keydown', function esq(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esq); fechar(); }
    });
    host.querySelector('#rel-imprimir').addEventListener('click', () => window.print());
    if (global.mdTrack) mdTrack('rh_relatorio_aberto', { candidatos: d.total });
  }

  /* ═════════════════════════════════════════════════════════════════════ */

  global.MD_RH = {
    CHAVE_MODELO,
    modelo, definirModelo, ativo, disponivel, carregarPreferencia,
    etapas, etapaDe, candidatos, vagas, vagaDe, chaveVagaDe, entrevistaDe, emailDe,
    localDe, chegouHa, jaAdmitido, filtroAdmitidos, etapasDeEntrevista,
    reprovado, aprovado, visiveis, filtroVaga, filtroEtapa, temFiltro,
    filtroReprovados, reprovar, desfazerReprovacao,
    vagaAtual: () => _vaga, etapaAtual: () => _etapa,
    verReprovados: () => _verReprovados,
    indicadores, renderKPIs, renderGraficos, renderFunil, trocarPeriodo,
    mover, relatorio, abrirTriagem, textoDaTriagem, mostrarTriagem,
    lerTriagem: _lerTriagem, faixaDaNota: _faixaDaNota,
  };

})(typeof window !== 'undefined' ? window : globalThis);
