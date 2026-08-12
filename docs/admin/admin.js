'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   MYDESK — PAINEL ADMINISTRATIVO
   ═══════════════════════════════════════════════════════════════════════════
   COMO A AUTORIZAÇÃO FUNCIONA (e por que ela não é decorativa)

   Quem é administrador no MyDesk é decidido por uma CUSTOM CLAIM do Firebase
   Authentication (`auth.token.admin === true`). Ela só pode ser escrita pelo
   Admin SDK, que vive nas funções da Vercel — o navegador não alcança.

   Esta página verifica a claim para decidir o que MOSTRAR. Isso é conforto,
   não segurança: qualquer pessoa pode abrir o console e mudar uma variável.
   A segurança de verdade está uma camada abaixo, e é ela que sustenta tudo:

     • as regras do Realtime Database exigem `auth.token.admin === true` na
       raiz para ler `uids`, `presence` ou o perfil de outra pessoa. Sem a
       claim, o banco devolve permissão negada mesmo com a tela aberta;
     • toda ação que altera algo (plano, claim de admin, bloqueio) passa por
       um endpoint que verifica a claim NO SERVIDOR, com o token conferido
       pelo Admin SDK. Nada aqui confia no que o navegador afirma ser.

   Ou seja: forçar a entrada nesta página rende uma tela vazia com erros de
   permissão. É esse o comportamento desejado.
   ═══════════════════════════════════════════════════════════════════════════ */

const API = window.MYDESK_API_BASE_URL || window.location.origin;
const LIMITE_GRATIS = window.MD_PLAN_FREE_LIMIT || 30;
const DIA = 24 * 60 * 60 * 1000;
const VENCE_EM_BREVE = 7 * DIA;

/* presence/{uid} sai no onDisconnect — mas o onDisconnect e uma promessa do
   SERVIDOR, e ela falha quando a conexao morre de um jeito que ele nao
   percebe (aba suspensa por dias, rede que cai sem FIN, processo morto). O
   registro fica para tras e a conta aparece "Online" para sempre.

   O app ja resolve isso ha tempo: isOnline() so aceita presenca com menos de
   60s. O painel olhava so a EXISTENCIA do registro — por isso mostrava uma
   conta online enquanto a coluna ao lado dizia "ultimo acesso ha 7 dias",
   duas afirmacoes que nao podem ser verdadeiras juntas.

   O batimento e de 30s, entao a janela de 60s da duas chances antes de
   declarar alguem offline. */
const PRESENCA_VALIDA_MS = 60000;
function presencaFresca(p) {
  const ts = Number(p && p.ts) || 0;
  return ts > 0 && (Date.now() - ts) < PRESENCA_VALIDA_MS;
}

/* O último `presence` que chegou do banco, e se ele chegou.
   O flag existe porque o recálculo por tempo (ver `aplicarPresenca`) precisa
   distinguir "ninguém online" de "ainda não li nada": tratar os dois como o
   mesmo derrubaria todo mundo para offline se a leitura falhasse. */
let _presencaBruta = {};
let _presencaLida  = false;

/* Estado da página. Tudo o que a tela mostra sai daqui. */
const S = {
  usuarios: [],        // lista unificada (Auth + Realtime Database)
  atividade: [],       // adminLog
  reportes: [],
  reportesCarregando: true,
  reportesErro: null,
  meuUid: null,
  secao: 'visao',
  busca: '', filtro: 'todos', ordem: 'recentes',
  pagina: 1, porPagina: 25,
  filtroAssin: 'todas',
  buscaReportes: '', filtroReportesStatus: 'todos', filtroReportesCategoria: 'todas',
  carregando: false,
  contagemNotas: new Map(),   // uid -> total de notas (preenchido sob demanda)
};

/* Referências vivas do Firebase, para desligar ao sair. Sem esta lista, trocar
   de seção ou recarregar deixaria ouvintes pendurados no banco. */
const _refsVivas = [];
function ouvir(caminho, evento, fn) {
  const r = window._fbDB.ref(caminho);
  return ouvirConsulta(r, evento, fn, caminho);
}
function ouvirConsulta(r, evento, fn, rotulo, aoErro) {
  r.on(evento, fn, err => {
    console.warn('[admin] ouvinte cancelado em', rotulo || 'consulta', err && err.message);
    if (aoErro) aoErro(err);
  });
  _refsVivas.push({ r, evento, fn });
  return r;
}
function desligarTudo() {
  while (_refsVivas.length) {
    const { r, evento, fn } = _refsVivas.pop();
    try { r.off(evento, fn); } catch (_) {}
  }
}
window.addEventListener('pagehide', desligarTudo);

/* ── Utilidades ───────────────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const tr = (key, fallback, vars) =>
  window.MyDeskI18n?.t?.(key, vars, fallback) || fallback || key;
const adminLocale = () => window.MyDeskI18n?.getLocale?.() || 'pt-BR';

function data(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(adminLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function dataHora(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString(adminLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function haQuantoTempo(ts) {
  if (!ts) return null;
  const lang = window.MyDeskI18n?.getLanguage?.() || 'pt';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return lang === 'en' ? 'just now' : lang === 'es' ? 'hace un momento' : 'agora há pouco';
  const m = Math.floor(s / 60); if (m < 60) {
    return lang === 'en' ? `${m} min ago` : lang === 'es' ? `hace ${m} min` : `há ${m} min`;
  }
  const h = Math.floor(m / 60); if (h < 24) {
    return lang === 'en' ? `${h} h ago` : lang === 'es' ? `hace ${h} h` : `há ${h} h`;
  }
  const d = Math.floor(h / 24); if (d < 30) {
    if (lang === 'en') return `${d} day${d === 1 ? '' : 's'} ago`;
    if (lang === 'es') return `hace ${d} día${d === 1 ? '' : 's'}`;
    return `há ${d} dia${d > 1 ? 's' : ''}`;
  }
  const me = Math.floor(d / 30); if (me < 12) {
    if (lang === 'en') return `${me} month${me === 1 ? '' : 's'} ago`;
    if (lang === 'es') return `hace ${me} mes${me === 1 ? '' : 'es'}`;
    return `há ${me} ${me > 1 ? 'meses' : 'mês'}`;
  }
  const anos = Math.floor(me / 12);
  if (lang === 'en') return `${anos} year${anos === 1 ? '' : 's'} ago`;
  if (lang === 'es') return `hace ${anos} año${anos === 1 ? '' : 's'}`;
  return `há ${anos} ano${anos === 1 ? '' : 's'}`;
}
/* Campo que o projeto não registra. Dizer isso é melhor que mostrar um zero
   que a pessoa leria como informação verdadeira. */
const SEM_DADO = '<span class="det-val is-vazio">não registrado</span>';

function aviso(texto, tipo) {
  const c = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (tipo ? ' is-' + tipo : '');
  el.textContent = texto;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

/* ── Portão de entrada ────────────────────────────────────────────────── */
function portaoErro(titulo, sub, mostrarAcoes) {
  const g = $('#gate');
  g.classList.add('is-erro');
  $('#gate-title').textContent = titulo;
  $('#gate-sub').textContent = sub;
  $('#gate-actions').hidden = !mostrarAcoes;
}

function animarEntradaAdmin() {
  document.body.classList.add('admin-enter');
  document.getElementById('admin-enter-veil')?.remove();
  const veil = document.createElement('div');
  veil.id = 'admin-enter-veil';
  veil.innerHTML = `
    <div class="admin-veil-brand">
      <img class="admin-veil-logo" src="assets/mydesk-logo-898619d1.png"
           width="215" height="62" alt="MyDesk">
      <small>Administração</small>
    </div>`;
  document.body.appendChild(veil);
  setTimeout(() => veil.remove(), 1050);
  setTimeout(() => document.body.classList.remove('admin-enter'), 1700);
}

function aguardarSessao() {
  // O onAuthStateChanged do auth-service dispara uma vez com o estado final.
  // Enquanto ele não vier, `loading` continua true e nada é decidido — decidir
  // antes mandaria um administrador legítimo para a tela de login.
  return new Promise(resolve => {
    if (!window.authState?.loading) return resolve(window.authState);
    const aoMudar = e => { window.removeEventListener('authStateChanged', aoMudar); resolve(e.detail); };
    window.addEventListener('authStateChanged', aoMudar);
    setTimeout(() => {
      window.removeEventListener('authStateChanged', aoMudar);
      resolve(window.authState);
    }, 12000);
  });
}

async function abrirPortao() {
  const estado = await aguardarSessao();

  if (!estado || !estado.isAuthenticated) {
    portaoErro('Você precisa entrar', 'Esta área é restrita. Entre com uma conta administradora para continuar.', true);
    setTimeout(() => { location.href = '../login.html?mode=signin'; }, 2600);
    return false;
  }

  // Relê a claim direto do token, em vez de confiar no que já estava em
  // memória: quem acabou de receber (ou perder) a permissão precisa ver o
  // estado atual, não o do login anterior.
  let ehAdmin = false;
  try {
    const token = await estado.user.getIdTokenResult(true);
    ehAdmin = token.claims.admin === true;
  } catch (e) {
    portaoErro('Não foi possível verificar a permissão', 'Sua sessão pode ter expirado. Entre novamente e tente de novo.', true);
    return false;
  }

  if (!ehAdmin) {
    portaoErro('Acesso restrito', 'Esta conta não tem permissão administrativa. Você será levado de volta ao MyDesk.', true);
    setTimeout(() => { location.href = '../index.html'; }, 2600);
    return false;
  }

  S.meuUid = estado.user.uid;
  $('#whoami').textContent = estado.user.email || estado.user.uid.slice(0, 12) + '…';
  $('#admin-account-avatar').textContent = (estado.user.email || 'A').charAt(0).toUpperCase();
  $('#gate').hidden = true;
  $('#shell').hidden = false;
  animarEntradaAdmin();
  return true;
}

/* ── Acesso ao servidor ───────────────────────────────────────────────── */
async function meuToken() {
  const u = window._fbAuth?.currentUser;
  if (!u) throw new Error('Sessão expirada. Entre novamente.');
  return u.getIdToken();
}

/* As rotas administrativas moram todas atrás de /api/admin: o plano Hobby da
   Vercel conta um arquivo em api/ como uma Serverless Function e só aceita 12,
   e o projeto tinha passado disso — o build inteiro falhava. A rota vai no
   corpo; 'reports' continua tendo endereço próprio. */
const ROTAS_ADMIN = new Set(['admin-users', 'set-plan', 'set-admin', 'delete-user']);

async function chamarApi(rota, corpo) {
  const admin = ROTAS_ADMIN.has(rota);
  const url = API + '/api/' + (admin ? 'admin' : rota);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + await meuToken() },
    body: JSON.stringify(admin ? { ...(corpo || {}), rota } : (corpo || {})),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Sessão expirada. Entre novamente.');
    if (resp.status === 403) throw new Error('Permissão negada.');
    if (resp.status === 404) throw new Error(dados.error || 'Registro não encontrado.');
    throw new Error(dados.error || 'Falha na operação (HTTP ' + resp.status + ')');
  }
  return dados;
}

const bd = caminho => window._fbDB.ref(caminho).once('value').then(s => s.val());

/* ── Carga de dados ───────────────────────────────────────────────────── */
async function carregarTudo() {
  if (S.carregando) return;
  S.carregando = true;
  renderizarSecao();

  try {
    // O diretório do Auth traz o que o banco não guarda: data de cadastro,
    // último acesso e conta bloqueada. Ver o comentário em lib/admin-users.js.
    const [dirResp, mapaUids, presenca] = await Promise.all([
      chamarApi('admin-users', { action: 'list' }),
      bd('uids').catch(() => null),
      bd('presence').catch(() => null),
    ]);

    const contas = dirResp.contas || [];
    const uids   = mapaUids || {};
    const pres   = presenca || {};
    /* A carga também alimenta o estado que o relógio relê. Sem isto, o
       primeiro recálculo por tempo aconteceria só depois do ouvinte falar —
       e ele fala quando o nó muda, que é justamente o que não acontece no
       caso do registro órfão. */
    if (presenca !== null) { _presencaBruta = pres; _presencaLida = true; }

  
  // União pelos dois lados: uma conta do Auth pode não ter registro no banco
    // (cadastro interrompido) e um registro no banco pode ter perdido a conta.
    const todosUids = new Set([...contas.map(c => c.uid), ...Object.keys(uids)]);
    const porUid = new Map(contas.map(c => [c.uid, c]));

    const lista = [...todosUids];
    const [perfis, planos, privados] = await Promise.all([
      Promise.all(lista.map(u => bd('users/' + u + '/profile').catch(() => null))),
      Promise.all(lista.map(u => bd('users/' + u + '/plan').catch(() => null))),
      Promise.all(lista.map(u => bd('users/' + u + '/private').catch(() => null))),
    ]);

    S.usuarios = lista.map((uid, i) => {
      const c = porUid.get(uid) || {};
      const perfil = perfis[i] || {};
      const plano  = planos[i] || {};
      const p      = pres[uid] || null;
      const venc   = Number(plano.planExpiresAt) || null;
      const ehPrem = plano.plan === 'premium';
      return {
        uid,
        username: uids[uid] || perfil.username || null,
        nome:     perfil.name || null,
        role:     perfil.role || null,
        email:    c.email || privados[i]?.email || null,
        emailVerificado: !!c.emailVerified,
        plano:    ehPrem ? 'premium' : 'free',
        vencido:  ehPrem && venc ? Date.now() > venc : false,
        planExpiresAt:   venc,
        planActivatedAt: Number(plano.planActivatedAt) || null,
        planTipo:        plano.planTipo || null,
        notasMes: Number(plano.notesCreatedThisMonth) || 0,
        online:   presencaFresca(p),
        statusPresenca: p?.status || null,
        admin:    c.admin === true,
        bloqueado: c.disabled === true,
        criadoEm:     c.criadoEm || null,
        ultimoAcesso: c.ultimoAcesso || null,
        provedores:   c.provedores || [],
        semConta:  !porUid.has(uid),   // existe no banco, não no Auth
      };
    });

    S.atividade = await carregarAtividade();

  } catch (e) {
    console.error('[admin] falha ao carregar:', e);
    S.usuarios = [];
    S.erro = e.message || 'Não foi possível carregar os dados.';
  } finally {
    S.carregando = false;
    renderizarSecao();
  }
}

async function carregarAtividade() {
  try {
    const bruto = await bd('adminLog');
    if (!bruto) return [];
    return Object.entries(bruto)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 200);
  } catch (e) {
    console.warn('[admin] adminLog indisponível:', e && e.message);
    return null;   // null = não foi possível ler; [] = leu e está vazio
  }
}

/* Conta as notas SEM baixar o conteúdo: ?shallow=true devolve só as chaves.
   Baixar as notas para contá-las traria os anexos em base64 junto — megabytes
   por usuário para exibir um número. Só roda para as linhas visíveis. */
async function contarNotas(uid) {
  if (S.contagemNotas.has(uid)) return S.contagemNotas.get(uid);
  const base = String(window._fbConfig?.databaseURL || '').replace(/\/+$/, '');
  if (!base) return null;
  try {
    const token = await meuToken();
    const raso = async caminho => {
      const r = await fetch(`${base}/${caminho}.json?shallow=true&auth=${encodeURIComponent(token)}`);
      if (!r.ok) return null;
      return r.json();
    };
    const conta = o => (o && typeof o === 'object') ? Object.keys(o).length : 0;
    let total = conta(await raso(`users/${uid}/notes`));
    const boards = await raso(`users/${uid}/personalBoards`);
    if (boards && typeof boards === 'object') {
      const porBoard = await Promise.all(Object.keys(boards).map(async id =>
        conta(await raso(`users/${uid}/personalBoards/${id}/notes`))));
      total += porBoard.reduce((a, b) => a + b, 0);
    }
    S.contagemNotas.set(uid, total);
    return total;
  } catch (_) {
    S.contagemNotas.set(uid, null);
    return null;
  }
}

/* ── Filtro, ordenação e página ───────────────────────────────────────── */
function usuariosFiltrados() {
  const q = S.busca.trim().toLowerCase();
  let r = S.usuarios;

  if (q) {
    r = r.filter(u =>
      (u.nome     || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email    || '').toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q));
  }

  const f = S.filtro;
  if (f === 'gratis')     r = r.filter(u => u.plano === 'free');
  else if (f === 'premium')  r = r.filter(u => u.plano === 'premium' && !u.vencido);
  else if (f === 'admins')   r = r.filter(u => u.admin);
  else if (f === 'online')   r = r.filter(u => u.online);
  else if (f === 'offline')  r = r.filter(u => !u.online);
  else if (f === 'bloqueados') r = r.filter(u => u.bloqueado);

  const txt = v => (v || '').toLowerCase();
  const cmp = {
    recentes: (a, b) => (b.criadoEm || 0) - (a.criadoEm || 0),
    antigos:  (a, b) => (a.criadoEm || Infinity) - (b.criadoEm || Infinity),
    nome:     (a, b) => txt(a.nome || a.username).localeCompare(txt(b.nome || b.username), 'pt-BR'),
    acesso:   (a, b) => (b.ultimoAcesso || 0) - (a.ultimoAcesso || 0),
    'uso-desc': (a, b) => b.notasMes - a.notasMes,
    'uso-asc':  (a, b) => a.notasMes - b.notasMes,
    plano:    (a, b) => (b.plano === 'premium') - (a.plano === 'premium'),
  }[S.ordem];

  return [...r].sort(cmp);
}

/* ── Pedaços de HTML reaproveitados ───────────────────────────────────── */
function seloPlano(u) {
  if (u.plano !== 'premium') return '<span class="selo selo-free">Grátis</span>';
  if (u.vencido) return '<span class="selo selo-vencido">Premium vencido</span>';
  return '<span class="selo selo-premium">Premium</span>';
}
function seloStatus(u) {
  if (u.bloqueado) return '<span class="selo selo-bloqueado"><span class="selo-ponto"></span>Bloqueado</span>';
  if (u.online)    return '<span class="selo selo-online"><span class="selo-ponto"></span>Online</span>';
  return '<span class="selo selo-offline"><span class="selo-ponto"></span>Offline</span>';
}
function blocoUso(u) {
  if (u.plano === 'premium' && !u.vencido) {
    return `<div class="uso"><div class="uso-txt">${u.notasMes} nota${u.notasMes === 1 ? '' : 's'}</div>
            <div class="uso-ilimitado">Uso ilimitado</div></div>`;
  }
  const pct = Math.min(100, Math.round(u.notasMes / LIMITE_GRATIS * 100));
  const cls = pct >= 100 ? ' is-cheio' : pct >= 75 ? ' is-alto' : '';
  return `<div class="uso">
      <div class="uso-txt">${u.notasMes} de ${LIMITE_GRATIS} notas</div>
      <div class="uso-trilho"><div class="uso-preenche${cls}" style="width:${pct}%"></div></div>
    </div>`;
}
function estadoVazio(titulo, sub, ico) {
  return `<div class="estado"><div class="estado-ico">${ico || '◌'}</div>
    <div class="estado-titulo">${esc(titulo)}</div>
    <div class="estado-sub">${esc(sub || '')}</div></div>`;
}
function esqueleto(n) {
  return '<div class="tabela-wrap">' + Array.from({ length: n || 6 }, () => '<div class="esqueleto"></div>').join('') + '</div>';
}

/* ── Seções ───────────────────────────────────────────────────────────── */
function renderizarSecao() {
  document.querySelectorAll('.secao').forEach(s => s.classList.toggle('is-active', s.dataset.secao === S.secao));
  document.querySelectorAll('.side-link[data-secao]').forEach(b => b.classList.toggle('is-active', b.dataset.secao === S.secao));
  const titulos = {
    visao:tr('admin.overview', 'Visão geral'),
    usuarios:tr('admin.users', 'Usuários'),
    assinaturas:tr('admin.subscriptions', 'Assinaturas'),
    reportes:tr('admin.reports', 'Reportes'),
    admins:tr('admin.administrators', 'Administradores'),
    atividade:tr('admin.activity', 'Atividade'),
    config:tr('admin.settings', 'Configurações'),
  };
  $('#titulo-secao').textContent = titulos[S.secao] || 'Painel';

  if (S.secao === 'visao')       renderVisao();
  if (S.secao === 'usuarios')    renderUsuarios();
  if (S.secao === 'assinaturas') renderAssinaturas();
  if (S.secao === 'reportes')    renderReportes();
  if (S.secao === 'admins')      renderAdmins();
  if (S.secao === 'atividade')   renderAtividade();
  if (S.secao === 'config')      renderConfig();
}

function renderVisao() {
  const alvo = $('#cards-visao');
  if (S.carregando) { alvo.innerHTML = '<div class="esqueleto"></div>'.repeat(4); return; }

  const u = S.usuarios;
  const agora = Date.now();
  const premAtivos = u.filter(x => x.plano === 'premium' && !x.vencido).length;
  const gratis     = u.filter(x => x.plano !== 'premium' || x.vencido).length;
  const online     = u.filter(x => x.online).length;
  const admins     = u.filter(x => x.admin).length;
  const bloqueados = u.filter(x => x.bloqueado).length;
  const comData    = u.filter(x => x.criadoEm);
  const hoje       = comData.filter(x => agora - x.criadoEm < DIA).length;
  const semana     = comData.filter(x => agora - x.criadoEm < 7 * DIA).length;
  const vencendo   = u.filter(x => x.plano === 'premium' && x.planExpiresAt &&
                                   x.planExpiresAt > agora && x.planExpiresAt - agora < VENCE_EM_BREVE).length;

  /* O ícone é procurado por um id, não pelo rótulo. Enquanto a chave do mapa
     era o próprio texto em português, traduzir o card custava o ícone — e foi
     por isso que estes rótulos ficaram de fora da tradução. */
  const CARTOES = {
    total:      { ico:'◎', chave:'admin.cardTotalUsers',    pt:'Total de usuários' },
    premium:    { ico:'★', chave:'admin.cardPremiumActive', pt:'Premium ativos' },
    gratuitos:  { ico:'◇', chave:'admin.cardFree',          pt:'Gratuitos' },
    online:     { ico:'●', chave:'admin.cardOnlineNow',     pt:'Online agora' },
    hoje:       { ico:'↗', chave:'admin.cardNewToday',      pt:'Novos hoje' },
    semana:     { ico:'⌁', chave:'admin.cardNewSevenDays',  pt:'Novos em 7 dias' },
    admins:     { ico:'◆', chave:'admin.cardAdmins',        pt:'Administradores' },
    vencendo:   { ico:'◷', chave:'admin.cardDueSevenDays',  pt:'Vencem em 7 dias' },
    bloqueadas: { ico:'!', chave:'admin.cardBlocked',       pt:'Contas bloqueadas' },
  };
  const card = (id, num, sub, cls) => {
    const c = CARTOES[id];
    return `<div class="card ${cls || ''}">
      <div class="card-top"><div class="card-lbl">${esc(tr(c.chave, c.pt))}</div>
        <span class="card-ico" aria-hidden="true">${c.ico}</span></div>
      <div class="card-num">${num}</div>
      <div class="card-sub">${esc(sub || tr('admin.platformSnapshot', 'Visão atual da plataforma'))}</div>
    </div>`;
  };

  alvo.innerHTML = [
    card('total', u.length),
    card('premium', premAtivos, premAtivos
      ? tr('admin.percentOfBase', '{pct}% da base',
           { pct: Math.round(premAtivos / (u.length || 1) * 100) })
      : '', 'is-ok'),
    card('gratuitos', gratis),
    card('online', online, '', 'is-accent'),
    card('hoje', hoje, comData.length < u.length
      ? tr('admin.withoutSignupDate', '{n} sem data de cadastro', { n: u.length - comData.length })
      : ''),
    card('semana', semana),
    card('admins', admins, '', 'is-accent'),
    card('vencendo', vencendo, '', vencendo ? 'is-warn' : ''),
    bloqueados ? card('bloqueadas', bloqueados, '', 'is-warn') : '',
  ].join('');

  // ── Acessos do mês ──
  pintarAcessos(u);

  // ── Receita ──
  // Fica abaixo dos cartões de contagem porque responde outra pergunta: não é
  // "quantos são", é "quanto entra". Carrega sob demanda — cada abertura
  // consulta a Stripe, e ninguém precisa disso a cada pintura da tela.
  pintarReceita();

  // Proporção entre planos
  const total = u.length || 1;
  $('#graf-planos').innerHTML = `<div class="barras">
    ${[[tr('admin.planPremium', 'Premium'), premAtivos, ''], [tr('admin.planFree', 'Grátis'), gratis, ' is-free']].map(([rot, v, cls]) => `
      <div class="barra-linha">
        <span class="barra-rot">${rot}</span>
        <div class="barra-trilho"><div class="barra-preenche${cls}" style="width:${Math.round(v / total * 100)}%"></div></div>
        <span class="barra-val">${v}</span>
      </div>`).join('')}
  </div>`;

  // Cadastros por mês — só com quem tem data de cadastro
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const ini = d.getTime();
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    meses.push({
      rot: d.toLocaleDateString(adminLocale(), { month: 'short' }).replace('.', ''),
      n: comData.filter(x => x.criadoEm >= ini && x.criadoEm < fim).length,
    });
  }
  const maxM = Math.max(1, ...meses.map(m => m.n));
  $('#graf-cadastros').innerHTML = comData.length === 0
    ? estadoVazio('Sem datas de cadastro', 'Nenhuma conta trouxe data de criação do Firebase Authentication.')
    : `<div class="colunas">${meses.map(m => `
        <div class="coluna">
          <span class="coluna-val">${m.n}</span>
          <div class="coluna-barra" style="height:${Math.round(m.n / maxM * 88)}%"></div>
          <span class="coluna-rot">${esc(m.rot)}</span>
        </div>`).join('')}</div>`;

  // Assinaturas com vencimento — TODAS, não só as dos próximos 7 dias.
  // Limitar a uma janela deixava o quadro vazio quase sempre, e quem tinha
  // acabado de conceder Premium vinha procurar aqui e não encontrava.
  const lista = u.filter(x => x.plano === 'premium' && x.planExpiresAt)
                 .sort((a, b) => a.planExpiresAt - b.planExpiresAt);
  const semPrazo = u.filter(x => x.plano === 'premium' && !x.planExpiresAt).length;

  const hint = $('#hint-vencimentos');
  if (hint) hint.textContent = lista.length
    ? `${lista.length} com prazo${semPrazo ? ` · ${semPrazo} sem prazo` : ''}`
    : (semPrazo ? `${semPrazo} Premium sem prazo de validade` : 'nenhuma');

  const quandoVence = ts => {
    const d = Math.ceil((ts - agora) / DIA);
    if (d < 0)  return `<span class="selo selo-vencido">vencida há ${-d} dia(s)</span>`;
    if (d === 0) return '<span class="selo selo-vencido">vence hoje</span>';
    if (d <= 7)  return `<span class="selo selo-premium">em ${d} dia(s)</span>`;
    return `<span class="cel-sub">em ${d} dias</span>`;
  };

  $('#vencendo-breve').innerHTML = lista.length
    ? tabela(['Usuário', 'Plano', 'Vence em', 'Quando', ''], lista.map(x => `
        <tr>
          <td data-rot="Usuário"><div class="cel-nome">${esc(x.nome || x.username || '—')}</div>
              <div class="cel-sub">@${esc(x.username || '—')}</div></td>
          <td data-rot="Plano">${seloPlano(x)}</td>
          <td data-rot="Vence em">${esc(data(x.planExpiresAt))}</td>
          <td data-rot="Quando">${quandoVence(x.planExpiresAt)}</td>
          <td class="acoes-cel">${btnMenu(x.uid)}</td>
        </tr>`).join(''))
    : estadoVazio(
        semPrazo ? 'Nenhuma assinatura com prazo' : 'Nenhuma assinatura Premium',
        semPrazo
          ? `Há ${semPrazo} conta(s) com Premium sem prazo de validade — elas não vencem e por isso não aparecem aqui.`
          : 'Quando alguém receber Premium com prazo, a data aparece aqui.',
        '★');
}

function tabela(colunas, corpoHtml) {
  return `<div class="tabela-wrap"><div class="rolagem-x"><table class="tbl">
    <thead><tr>${colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${corpoHtml}</tbody></table></div></div>`;
}
function btnMenu(uid) {
  return `<button class="icon-btn js-menu" data-uid="${esc(uid)}" type="button"
           aria-label="${esc(tr('admin.userActions', 'Ações para este usuário'))}" aria-haspopup="menu">⋮</button>`;
}

function renderUsuarios() {
  const alvo = $('#lista-usuarios');
  if (S.carregando) { alvo.innerHTML = esqueleto(6); $('#paginacao').innerHTML = ''; return; }
  if (S.erro) {
    alvo.innerHTML = `<div class="estado is-erro"><div class="estado-ico">⚠</div>
      <div class="estado-titulo">Não foi possível carregar</div>
      <div class="estado-sub">${esc(S.erro)}</div></div>`;
    $('#paginacao').innerHTML = ''; return;
  }

  const todos = usuariosFiltrados();
  const paginas = Math.max(1, Math.ceil(todos.length / S.porPagina));
  if (S.pagina > paginas) S.pagina = paginas;
  const ini = (S.pagina - 1) * S.porPagina;
  const pagina = todos.slice(ini, ini + S.porPagina);

  if (!todos.length) {
    alvo.innerHTML = estadoVazio(tr('admin.noUsersFound', 'Nenhum usuário encontrado'),
      S.busca ? tr('admin.tryAnotherTerm', 'Tente outro termo ou limpe o filtro.')
              : tr('admin.noUsersForFilter', 'Não há usuários que atendam a este filtro.'), '⌕');
    $('#paginacao').innerHTML = '';
    return;
  }

  alvo.innerHTML = tabela(
    /* ÚLTIMO LOGIN, e não "último acesso". A coluna sempre mostrou
       `lastSignInTime` do Firebase Auth, que muda no SIGN-IN — e o Firebase
       mantém a sessão aberta por meses. Quem entrou uma vez e nunca mais
       deslogou usa o app todo dia sem gerar um sign-in novo.

       Era daí que vinha a leitura de "isso está errado": "Online" ao lado de
       "há 2 dias" parece contradição, mas as duas coisas eram verdade — a
       pessoa estava com o app aberto naquele instante e tinha feito login
       dois dias antes. O rótulo é que prometia uma informação que a coluna
       não tem. */
    ['Usuário', 'Nome', 'E-mail', 'Plano', 'Uso mensal', 'Status', 'Último login', ''],
    pagina.map(u => `
      <tr>
        <td data-rot="Usuário">
          <div class="usuario-cel">
            <span class="usuario-avatar">${esc((u.nome || u.username || '?').charAt(0).toUpperCase())}</span>
            <div><div class="cel-nome">@${esc(u.username || '—')}${u.admin ? ' <span class="selo selo-admin">admin</span>' : ''}</div>
              ${u.semConta ? '<div class="cel-sub">sem conta no Auth</div>' : '<div class="cel-sub">Conta MyDesk</div>'}</div>
          </div>
        </td>
        <td data-rot="Nome">${esc(u.nome || '—')}</td>
        <td data-rot="E-mail"><div class="cel-email">${esc(u.email || '—')}</div></td>
        <td data-rot="Plano">${seloPlano(u)}</td>
        <td data-rot="Uso mensal">${blocoUso(u)}</td>
        <td data-rot="Status">${seloStatus(u)}</td>
        <td data-rot="Último login">${u.ultimoAcesso
            ? `<span title="${esc(dataHora(u.ultimoAcesso))}${u.online
                 ? ' — está com o app aberto agora; o login é de antes porque a sessão do Firebase não expira a cada uso'
                 : ''}">${esc(haQuantoTempo(u.ultimoAcesso))}</span>`
            : '<span class="cel-sub">não registrado</span>'}</td>
        <td class="acoes-cel">${btnMenu(u.uid)}</td>
      </tr>`).join(''));

  $('#paginacao').innerHTML = `
    <span class="pag-info">${ini + 1}–${Math.min(ini + S.porPagina, todos.length)} de ${todos.length}</span>
    <button class="btn btn-sm js-pag" data-p="${S.pagina - 1}" type="button" ${S.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="pag-info">Página ${S.pagina} de ${paginas}</span>
    <button class="btn btn-sm js-pag" data-p="${S.pagina + 1}" type="button" ${S.pagina >= paginas ? 'disabled' : ''}>Próxima</button>`;
}

function renderAssinaturas() {
  const alvo = $('#lista-assinaturas');
  if (S.carregando) { alvo.innerHTML = esqueleto(4); return; }

  const agora = Date.now();
  let r = S.usuarios.filter(u => u.plano === 'premium');
  const f = S.filtroAssin;
  if (f === 'ativas')        r = r.filter(u => !u.planExpiresAt || u.planExpiresAt > agora);
  else if (f === 'vencendo') r = r.filter(u => u.planExpiresAt && u.planExpiresAt > agora && u.planExpiresAt - agora < VENCE_EM_BREVE);
  else if (f === 'vencidas') r = r.filter(u => u.planExpiresAt && u.planExpiresAt <= agora);
  else if (f === 'semprazo') r = r.filter(u => !u.planExpiresAt);
  r.sort((a, b) => (a.planExpiresAt || Infinity) - (b.planExpiresAt || Infinity));

  if (!r.length) { alvo.innerHTML = estadoVazio('Nenhuma assinatura', 'Nada corresponde a este filtro.', '★'); return; }

  const situacao = u => {
    if (!u.planExpiresAt) return '<span class="selo selo-premium">Sem prazo</span>';
    if (u.planExpiresAt <= agora) return '<span class="selo selo-vencido">Vencida</span>';
    if (u.planExpiresAt - agora < VENCE_EM_BREVE) return '<span class="selo selo-premium">Vence em breve</span>';
    return '<span class="selo selo-online"><span class="selo-ponto"></span>Ativa</span>';
  };

  alvo.innerHTML = tabela([tr('admin.user', 'Usuário'), tr('admin.colStart', 'Início'),
                           tr('admin.colDue', 'Vencimento'), tr('admin.colSituation', 'Situação'),
                           tr('admin.colSource', 'Origem'), ''], r.map(u => `
    <tr>
      <td data-rot="Usuário"><div class="cel-nome">@${esc(u.username || '—')}</div>
          <div class="cel-sub">${esc(u.email || '—')}</div></td>
      <td data-rot="Início">${esc(data(u.planActivatedAt) || '—')}</td>
      <td data-rot="Vencimento">${esc(data(u.planExpiresAt) || 'sem prazo')}</td>
      <td data-rot="Situação">${situacao(u)}</td>
      <td data-rot="Origem">${esc(u.planTipo || '—')}</td>
      <td class="acoes-cel">${btnMenu(u.uid)}</td>
    </tr>`).join(''));
}

const REPORTE_STATUS = {
  open: { get rotulo() { return tr('admin.reportOpen', 'Aberto'); }, classe: 'selo-reporte-open' },
  in_progress: { get rotulo() { return tr('admin.reportInProgress', 'Em análise'); }, classe: 'selo-reporte-progress' },
  resolved: { get rotulo() { return tr('admin.reportResolved', 'Resolvido'); }, classe: 'selo-reporte-resolved' },
};
const REPORTE_CATEGORIA = {
  bug: { rotulo: 'Bug', classe: 'selo-reporte-bug' },
  problem: {
    get rotulo() {
      const lang = window.MyDeskI18n?.getLanguage?.() || 'pt';
      return lang === 'en' ? 'Problem' : 'Problema';
    },
    classe: 'selo-reporte-problem',
  },
};

function normalizarReportes(bruto) {
  if (!bruto || typeof bruto !== 'object') return [];
  return Object.entries(bruto)
    .filter(([, item]) => item && typeof item === 'object')
    .map(([id, item]) => ({
      id,
      reporterUid: item.reporterUid || null,
      reporterUsername: item.reporterUsername || null,
      reporterName: item.reporterName || null,
      reporterEmail: item.reporterEmail || null,
      category: REPORTE_CATEGORIA[item.category] ? item.category : 'problem',
      title: item.title || 'Reporte sem título',
      description: item.description || '',
      page: item.page || '/',
      locale: item.locale || null,
      status: REPORTE_STATUS[item.status] ? item.status : 'open',
      createdAt: Number(item.createdAt) || null,
      updatedAt: Number(item.updatedAt) || null,
      updatedBy: item.updatedBy || null,
      resolvedAt: Number(item.resolvedAt) || null,
      resolvedBy: item.resolvedBy || null,
      resolutionNote: item.resolutionNote || '',
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function atualizarBadgeReportes() {
  const pendentes = S.reportes.filter(r => r.status !== 'resolved').length;
  const badge = $('#reportes-badge');
  if (!badge) return;
  badge.textContent = pendentes > 99 ? '99+' : String(pendentes);
  badge.hidden = pendentes === 0;
}

function seloReporteStatus(status) {
  const meta = REPORTE_STATUS[status] || REPORTE_STATUS.open;
  return `<span class="selo ${meta.classe}">${esc(meta.rotulo)}</span>`;
}

function seloReporteCategoria(category) {
  const meta = REPORTE_CATEGORIA[category] || REPORTE_CATEGORIA.problem;
  return `<span class="selo ${meta.classe}">${esc(meta.rotulo)}</span>`;
}

function reportesFiltrados() {
  const q = S.buscaReportes.trim().toLocaleLowerCase(adminLocale());
  return S.reportes.filter(r => {
    if (S.filtroReportesStatus !== 'todos' && r.status !== S.filtroReportesStatus) return false;
    if (S.filtroReportesCategoria !== 'todas' && r.category !== S.filtroReportesCategoria) return false;
    if (!q) return true;
    return [r.title, r.description, r.reporterUsername, r.reporterName, r.reporterEmail, r.page, r.reporterUid]
      .some(value => String(value || '').toLocaleLowerCase(adminLocale()).includes(q));
  });
}

function renderReportes() {
  const alvo = $('#lista-reportes');
  const contador = $('#reportes-contador');
  atualizarBadgeReportes();
  if (!alvo) return;

  if (S.reportesCarregando) {
    alvo.innerHTML = esqueleto(5);
    if (contador) contador.textContent = 'Carregando reportes…';
    return;
  }
  if (S.reportesErro) {
    alvo.innerHTML = estadoVazio(tr('admin.reportsUnavailable', 'Reportes indisponíveis'), S.reportesErro, '⚠');
    if (contador) contador.textContent = '';
    return;
  }

  const lista = reportesFiltrados();
  const pendentes = S.reportes.filter(r => r.status !== 'resolved').length;
  if (contador) {
    contador.textContent = `${lista.length} exibido${lista.length === 1 ? '' : 's'} · ${pendentes} pendente${pendentes === 1 ? '' : 's'}`;
  }
  if (!lista.length) {
    alvo.innerHTML = estadoVazio(
      'Nenhum reporte encontrado',
      S.reportes.length ? 'Altere a busca ou os filtros para ver outros resultados.' : 'Os reportes enviados pelos usuários aparecerão aqui.',
      '!',
    );
    return;
  }

  alvo.innerHTML = tabela(
    ['Reporte', 'Enviado por', 'Categoria', 'Status', 'Página', 'Recebido', ''],
    lista.map(r => `
      <tr>
        <td data-rot="Reporte">
          <div class="reporte-resumo">
            <div class="reporte-titulo">${esc(r.title)}</div>
            <div class="reporte-trecho">${esc(r.description || 'Sem descrição')}</div>
          </div>
        </td>
        <td data-rot="Enviado por">
          <div class="cel-nome">${r.reporterUsername ? '@' + esc(r.reporterUsername) : esc(r.reporterName || '—')}</div>
          <div class="cel-sub">${esc(r.reporterEmail || r.reporterUid || '—')}</div>
        </td>
        <td data-rot="Categoria">${seloReporteCategoria(r.category)}</td>
        <td data-rot="Status">${seloReporteStatus(r.status)}</td>
        <td data-rot="Página"><span class="reporte-pagina" title="${esc(r.page)}">${esc(r.page)}</span></td>
        <td data-rot="Recebido"><span title="${esc(dataHora(r.createdAt) || '')}">${esc(haQuantoTempo(r.createdAt) || '—')}</span></td>
        <td class="acoes-cel"><button class="btn btn-sm js-report-open" data-report-id="${esc(r.id)}" type="button">Analisar</button></td>
      </tr>`).join(''),
  );
}

function abrirReporte(reportId) {
  const r = S.reportes.find(item => item.id === reportId);
  if (!r) return;

  $('#drawer').setAttribute('aria-label', 'Detalhes do reporte');
  $('#drawer-titulo').textContent = r.title;
  $('#drawer').hidden = false;
  $('#drawer-scrim').hidden = false;
  const statusOptions = Object.entries(REPORTE_STATUS).map(([value, meta]) =>
    `<option value="${value}"${r.status === value ? ' selected' : ''}>${esc(meta.rotulo)}</option>`).join('');
  const identificacao = r.reporterUsername
    ? '@' + r.reporterUsername
    : (r.reporterName || r.reporterEmail || r.reporterUid || '—');

  $('#drawer-bd').innerHTML = `
    <div class="det-grupo"><div class="det-grupo-tit">Solicitação</div>
      <div class="det-linha"><span class="det-rot">Categoria</span><span class="det-val">${seloReporteCategoria(r.category)}</span></div>
      <div class="det-linha"><span class="det-rot">Status</span><span class="det-val">${seloReporteStatus(r.status)}</span></div>
      <div class="det-linha"><span class="det-rot">Recebido</span><span class="det-val">${esc(dataHora(r.createdAt) || '—')}</span></div>
      <div class="det-linha"><span class="det-rot">Página</span><span class="det-val is-mono">${esc(r.page)}</span></div>
      <div class="det-linha"><span class="det-rot">Idioma</span><span class="det-val">${esc(r.locale || 'não informado')}</span></div>
    </div>
    <div class="det-grupo"><div class="det-grupo-tit">Relato</div>
      <div class="reporte-descricao">${esc(r.description || 'Sem descrição.')}</div>
    </div>
    <div class="det-grupo"><div class="det-grupo-tit">Usuário</div>
      <div class="det-linha"><span class="det-rot">Conta</span><span class="det-val">${esc(identificacao)}</span></div>
      <div class="det-linha"><span class="det-rot">Nome</span><span class="det-val">${esc(r.reporterName || 'não informado')}</span></div>
      <div class="det-linha"><span class="det-rot">E-mail</span><span class="det-val">${esc(r.reporterEmail || 'não informado')}</span></div>
      <div class="det-linha"><span class="det-rot">UID</span><span class="det-val is-mono">${esc(r.reporterUid || 'não informado')}</span></div>
    </div>
    <div class="det-grupo"><div class="det-grupo-tit">Tratamento</div>
      <div class="reporte-form-status">
        <div class="campo"><label for="reporte-status">Status</label>
          <select id="reporte-status">${statusOptions}</select></div>
        <button class="btn btn-primary reporte-salvar js-report-save" data-report-id="${esc(r.id)}" type="button">Salvar atualização</button>
      </div>
      <div class="campo"><label for="reporte-resolucao">Observação da resolução</label>
        <textarea id="reporte-resolucao" maxlength="1000" rows="5" placeholder="Registre o diagnóstico ou o que foi corrigido…">${esc(r.resolutionNote)}</textarea>
      </div>
      <div class="reporte-save-state" id="reporte-save-state" role="status"></div>
      ${r.resolvedAt ? `<div class="cel-sub">Resolvido em ${esc(dataHora(r.resolvedAt) || '—')}.</div>` : ''}
    </div>`;
}

async function salvarReporte(reportId) {
  const r = S.reportes.find(item => item.id === reportId);
  const btn = document.querySelector(`.js-report-save[data-report-id="${reportId}"]`);
  const state = $('#reporte-save-state');
  if (!r || !btn) return;
  const status = $('#reporte-status')?.value || r.status;
  const resolutionNote = $('#reporte-resolucao')?.value.trim() || '';

  btn.disabled = true;
  btn.textContent = 'Salvando…';
  if (state) state.textContent = '';
  try {
    const result = await chamarApi('reports', {
      action: 'updateStatus',
      reportId,
      status,
      resolutionNote,
    });
    Object.assign(r, {
      status,
      resolutionNote,
      updatedAt: result.updatedAt || Date.now(),
      resolvedAt: status === 'resolved' ? (result.updatedAt || Date.now()) : null,
      resolvedBy: status === 'resolved' ? S.meuUid : null,
    });
    renderReportes();
    abrirReporte(reportId);
    aviso('Reporte atualizado com sucesso.', 'ok');
  } catch (error) {
    btn.disabled = false;
    btn.textContent = tr('admin.saveUpdate', 'Salvar atualização');
    if (state) state.textContent = error.message || tr('admin.reportUpdateFailed', 'Não foi possível atualizar o reporte.');
  }
}

function renderAdmins() {
  const alvo = $('#lista-admins');
  if (S.carregando) { alvo.innerHTML = esqueleto(3); return; }

  const admins = S.usuarios.filter(u => u.admin);
  if (!admins.length) { alvo.innerHTML = estadoVazio(tr('admin.noAdmins', 'Nenhum administrador'), tr('admin.noAdminAccounts', 'Nenhuma conta tem a permissão administrativa.'), '⚿'); return; }

  // Quando a permissão foi dada, e por quem — sai do registro de atividade.
  const concessao = new Map();
  (S.atividade || []).filter(a => a.acao === 'conceder_admin')
    .forEach(a => { if (!concessao.has(a.alvo)) concessao.set(a.alvo, a); });

  alvo.innerHTML = tabela([tr('admin.user', 'Usuário'), tr('admin.email', 'E-mail'),
                           tr('admin.colReceivedOn', 'Recebeu em'), tr('admin.colGrantedBy', 'Concedido por'),
                           tr('admin.status', 'Status'), ''], admins.map(u => {
    const c = concessao.get(u.uid);
    return `<tr>
      <td data-rot="Usuário"><div class="cel-nome">@${esc(u.username || '—')}${u.uid === S.meuUid ? ' <span class="selo selo-admin">você</span>' : ''}</div>
          <div class="cel-sub">${esc(u.nome || '—')}</div></td>
      <td data-rot="E-mail"><div class="cel-email">${esc(u.email || '—')}</div></td>
      <td data-rot="Recebeu em">${c ? esc(data(c.at)) : '<span class="cel-sub">antes do registro</span>'}</td>
      <td data-rot="Concedido por">${c?.porEmail ? esc(c.porEmail) : '<span class="cel-sub">—</span>'}</td>
      <td data-rot="Status">${seloStatus(u)}</td>
      <td class="acoes-cel">${btnMenu(u.uid)}</td>
    </tr>`;
  }).join(''));
}

function renderAtividade() {
  const alvo = $('#lista-atividade');
  if (S.carregando) { alvo.innerHTML = esqueleto(5); return; }

  if (S.atividade === null) {
    alvo.innerHTML = estadoVazio(tr('admin.logUnavailable', 'Registro indisponível'),
      tr('admin.logReadFailed', 'Não foi possível ler o histórico administrativo. Verifique as regras do banco.'), '⚠');
    return;
  }
  if (!S.atividade.length) {
    alvo.innerHTML = estadoVazio('Sem registros ainda',
      'As ações administrativas feitas a partir de agora aparecem aqui.', '≡');
    return;
  }

  const rotulos = {
    conceder_admin: 'Tornou administrador', remover_admin: 'Removeu administrador',
    conceder_premium: 'Concedeu Premium',  remover_premium: 'Removeu Premium',
    alterar_vencimento: 'Alterou vencimento',
    bloquear_conta: 'Bloqueou conta',      reativar_conta: 'Reativou conta',
    atualizar_reporte: 'Atualizou reporte',
  };
  const nomeDe = uid => {
    const u = S.usuarios.find(x => x.uid === uid);
    return u ? '@' + (u.username || u.uid.slice(0, 10)) : (uid || '').slice(0, 12) + '…';
  };

  alvo.innerHTML = tabela([tr('admin.colWhen', 'Quando'), tr('admin.colAction', 'Ação'),
                           tr('admin.colAffectedUser', 'Usuário afetado'),
                           tr('admin.colResponsible', 'Responsável'), tr('admin.colDetail', 'Detalhe')],
    S.atividade.map(a => `
      <tr>
        <td data-rot="Quando"><span title="${esc(dataHora(a.at))}">${esc(haQuantoTempo(a.at) || '—')}</span></td>
        <td data-rot="Ação">${esc(rotulos[a.acao] || a.acao || '—')}</td>
        <td data-rot="Afetado">${esc(nomeDe(a.alvo))}<div class="cel-sub">${esc(a.alvoEmail || '')}</div></td>
        <td data-rot="Responsável">${esc(a.porEmail || nomeDe(a.por))}</td>
        <td data-rot="Detalhe">${a.dias ? esc(a.dias + ' dia(s)') : a.expiraEm ? esc('até ' + data(a.expiraEm)) : '—'}
            ${a.obs ? `<div class="cel-sub">${esc(a.obs)}</div>` : ''}</td>
      </tr>`).join(''));
}

function renderConfig() {
  const semCadastro = S.usuarios.filter(u => !u.criadoEm).length;
  $('#conteudo-config').innerHTML = `
    <div class="panel"><div class="panel-hd"><h2>Sistema</h2></div><div class="panel-bd">
      <div class="det-linha"><span class="det-rot">Projeto Firebase</span><span class="det-val is-mono">mydesk-ad0da</span></div>
      <div class="det-linha"><span class="det-rot">Funções</span><span class="det-val is-mono">${esc(API)}</span></div>
      <div class="det-linha"><span class="det-rot">Limite do plano grátis</span><span class="det-val">${LIMITE_GRATIS} notas/mês</span></div>
      <div class="det-linha"><span class="det-rot">Fonte da permissão</span><span class="det-val">Custom claim do Firebase Auth</span></div>
      <div class="det-linha"><span class="det-rot">Usuários carregados</span><span class="det-val">${S.usuarios.length}</span></div>
    </div></div>

    <div class="panel"><div class="panel-hd"><h2>Dados que o projeto ainda não registra</h2></div><div class="panel-bd">
      <p style="font-size:.84rem;color:var(--clr-dim);line-height:1.7;margin-bottom:14px;">
        O painel mostra apenas o que existe de verdade. Onde falta dado, ele diz que falta
        em vez de exibir zero. Estes são os campos que precisariam ser implementados no app
        para o painel ir além do que mostra hoje:</p>
      <div class="det-linha"><span class="det-rot">Total de notas</span>
        <span class="det-val">calculado sob demanda por usuário, na tela de detalhes — contar para todos de uma vez faria uma consulta por board</span></div>
      <div class="det-linha"><span class="det-rot">Último uso do app</span>
        <span class="det-val"><code>presence/{uid}</code> é apagado no onDisconnect: diz "está online agora", nunca "esteve online quando". A coluna da tabela é o último <b>login</b> (Auth <code>lastSignInTime</code>), que só muda quando alguém entra de novo — a sessão do Firebase dura meses, então quem usa todo dia sem deslogar continua com um login antigo. Por isso "Online" e "há 2 dias" podem ser verdade juntos. Um "último uso" de verdade exigiria gravar um carimbo a cada sessão</span></div>
      <div class="det-linha"><span class="det-rot">Data de cadastro no banco</span>
        <span class="det-val">o perfil não tem <code>createdAt</code>; a data vem do Auth${semCadastro ? ` — ${semCadastro} conta(s) sem essa informação` : ''}</span></div>
      <div class="det-linha"><span class="det-rot">Suspensão temporária</span>
        <span class="det-val">só existe bloqueio (Auth <code>disabled</code>), que é permanente até ser revertido — não há estado "suspenso até tal data"</span></div>
      <div class="det-linha"><span class="det-rot">Exclusão de conta</span>
        <span class="det-val">não implementada de propósito — ver a explicação no menu de ações</span></div>
    </div></div>`;
}

/* ── Gaveta de detalhes ───────────────────────────────────────────────── */
async function abrirDetalhes(uid) {
  const u = S.usuarios.find(x => x.uid === uid);
  if (!u) return;

  $('#drawer').setAttribute('aria-label', tr('admin.userDetails', 'Detalhes do usuário'));
  $('#drawer-titulo').textContent = u.nome || ('@' + (u.username || 'usuário'));
  $('#drawer').hidden = false;
  $('#drawer-scrim').hidden = false;

  const linha = (rot, val, mono) =>
    `<div class="det-linha"><span class="det-rot">${esc(rot)}</span>` +
    (val === null || val === undefined || val === ''
      ? SEM_DADO
      : `<span class="det-val${mono ? ' is-mono' : ''}">${esc(val)}</span>`) + '</div>';

  $('#drawer-bd').innerHTML = `
    <div class="det-grupo"><div class="det-grupo-tit">Identificação</div>
      ${linha('Nome', u.nome)}
      ${linha('Usuário', u.username ? '@' + u.username : null)}
      ${linha('E-mail', u.email)}
      ${linha('E-mail verificado', u.email ? (u.emailVerificado ? 'sim' : 'não') : null)}
      ${linha('Função', u.role)}
      ${linha('UID', u.uid, true)}
      ${linha('Entrou por', u.provedores.length ? u.provedores.join(', ') : null)}
    </div>
    <div class="det-grupo"><div class="det-grupo-tit">Plano</div>
      <div class="det-linha"><span class="det-rot">Plano atual</span><span class="det-val">${seloPlano(u)}</span></div>
      ${linha('Início do Premium', data(u.planActivatedAt))}
      ${linha('Vencimento', u.plano === 'premium' ? (data(u.planExpiresAt) || 'sem prazo') : null)}
      ${linha('Origem', u.planTipo)}
      ${linha('Notas no mês', u.notasMes + (u.plano === 'premium' && !u.vencido ? '' : ' de ' + LIMITE_GRATIS))}
      <div class="det-linha"><span class="det-rot">Total de notas</span>
        <span class="det-val" id="det-total-notas">contando…</span></div>
    </div>
    <div class="det-grupo"><div class="det-grupo-tit">Conta</div>
      <div class="det-linha"><span class="det-rot">Status</span><span class="det-val">${seloStatus(u)}</span></div>
      ${linha('Permissão', u.admin ? 'Administrador' : 'Usuário comum')}
      ${linha('Cadastro', dataHora(u.criadoEm))}
      ${linha('Último login', dataHora(u.ultimoAcesso))}
      ${linha('Presença agora', u.online ? (u.statusPresenca || 'online') : 'offline')}
      <div class="det-linha"><span class="det-rot">Grupos criados</span>
        <span class="det-val" id="det-grupos">contando…</span></div>
    </div>
    <div class="det-grupo"><div class="det-grupo-tit">Ações</div>
      <div class="det-acoes">
        <button class="btn btn-sm js-acao" data-a="copiar"  data-uid="${esc(uid)}" type="button">Copiar UID</button>
        ${u.plano === 'premium'
          ? `<button class="btn btn-sm js-acao" data-a="remover-prem" data-uid="${esc(uid)}" type="button">Remover Premium</button>
             <button class="btn btn-sm js-acao" data-a="vencimento"   data-uid="${esc(uid)}" type="button">Alterar vencimento</button>`
          : `<button class="btn btn-sm js-acao" data-a="dar-prem" data-uid="${esc(uid)}" type="button">Conceder Premium</button>`}
        ${u.admin
          ? `<button class="btn btn-sm js-acao" data-a="tirar-admin" data-uid="${esc(uid)}" type="button">Remover administrador</button>`
          : `<button class="btn btn-sm js-acao" data-a="dar-admin"  data-uid="${esc(uid)}" type="button">Tornar administrador</button>`}
        ${u.bloqueado
          ? `<button class="btn btn-sm js-acao" data-a="desbloquear" data-uid="${esc(uid)}" type="button">Reativar conta</button>`
          : `<button class="btn btn-sm btn-danger js-acao" data-a="bloquear" data-uid="${esc(uid)}" type="button">Bloquear conta</button>`}
      </div>
    </div>`;

  // Contagens sob demanda — só para o usuário que está sendo olhado.
  contarNotas(uid).then(n => {
    const el = $('#det-total-notas');
    if (el) el.innerHTML = n === null ? SEM_DADO : String(n);
  });
  bd('groups').then(g => {
    const el = $('#det-grupos');
    if (!el) return;
    if (!g) { el.textContent = '0'; return; }
    el.textContent = Object.values(g).filter(x => x && x.owner === u.username).length;
  }).catch(() => { const el = $('#det-grupos'); if (el) el.innerHTML = SEM_DADO; });
}

function fecharDetalhes() {
  $('#drawer').hidden = true;
  $('#drawer-scrim').hidden = true;
}

/* ── Modal ────────────────────────────────────────────────────────────── */
let _modalOk = null;
function abrirModal({ titulo, corpo, okTexto, okPerigo, aoConfirmar }) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-bd').innerHTML = corpo;
  const ok = $('#modal-ok');
  ok.textContent = okTexto || 'Confirmar';
  ok.className = 'btn ' + (okPerigo ? 'btn-danger' : 'btn-primary');
  ok.disabled = false;
  _modalOk = aoConfirmar;
  $('#modal-scrim').hidden = false;
  setTimeout(() => { const f = $('#modal-bd').querySelector('input,select,textarea'); if (f) f.focus(); }, 40);
}
function fecharModal() { $('#modal-scrim').hidden = true; _modalOk = null; }

/* ── Ações administrativas ────────────────────────────────────────────── */
function nomeDe(u) { return '@' + (u.username || u.uid.slice(0, 10)); }

async function executar(fn, msgOk) {
  const ok = $('#modal-ok');
  // Desabilitar aqui é o que impede o clique duplo de mandar a mesma operação
  // duas vezes enquanto a primeira ainda está em voo.
  if (ok) { ok.disabled = true; ok.textContent = 'Processando…'; }
  try {
    await fn();
    fecharModal();
    aviso(msgOk, 'ok');
    await carregarTudo();
  } catch (e) {
    if (ok) { ok.disabled = false; ok.textContent = 'Confirmar'; }
    aviso(e.message || 'Não foi possível concluir.', 'erro');
    if (/sessão expirada/i.test(e.message || '')) setTimeout(() => location.href = '../login.html?mode=signin', 2200);
  }
}

function acaoDarPremium(u) {
  abrirModal({
    titulo: 'Conceder Premium',
    corpo: `<p>Conceder Premium para <b>${esc(nomeDe(u))}</b>.</p>
      <div class="campo"><label for="m-dias">Duração em dias</label>
        <input id="m-dias" type="number" min="0" max="3650" value="30" inputmode="numeric">
        <span class="campo-erro" id="m-erro"></span>
        <span class="cel-sub">Deixe 0 para Premium sem prazo de validade.</span></div>
      <div class="campo"><label for="m-obs">Observação (opcional)</label>
        <input id="m-obs" type="text" maxlength="200" placeholder="ex.: cortesia por indicação"></div>`,
    okTexto: 'Conceder',
    aoConfirmar: () => {
      const dias = Math.floor(Number($('#m-dias').value));
      if (!isFinite(dias) || dias < 0) { $('#m-erro').textContent = tr('admin.invalidDays', 'Informe um número de dias válido.'); return; }
      return executar(
        () => chamarApi('set-plan', { uid: u.uid, plan: 'premium', dias, obs: $('#m-obs').value || '' }),
        dias > 0 ? `${nomeDe(u)} agora é Premium por ${dias} dia(s).` : `${nomeDe(u)} agora é Premium, sem prazo.`);
    },
  });
}

/* Conceder escolhendo a pessoa dentro do próprio modal.
   O caminho pelo menu ⋮ exige achar a pessoa numa tabela antes de ver a ação —
   ordem inversa à de quem chega querendo conceder. Aqui a ação vem primeiro. */
function acaoConcederEscolhendo() {
  const candidatos = [...S.usuarios]
    .filter(u => u.username || u.email)
    .sort((a, b) => (a.username || '').localeCompare(b.username || '', 'pt-BR'));

  if (!candidatos.length) {
    aviso('Nenhum usuário carregado. Recarregue os dados e tente de novo.', 'erro');
    return;
  }

  const rotulo = u => {
    const quem = '@' + (u.username || u.uid.slice(0, 8));
    const nome = u.nome ? ` — ${u.nome}` : '';
    const jaTem = u.plano === 'premium' ? (u.vencido ? ' (Premium vencido)' : ' (já é Premium)') : '';
    return quem + nome + jaTem;
  };

  abrirModal({
    titulo: 'Conceder Premium',
    corpo: `
      <div class="campo"><label for="m-quem">Usuário</label>
        <select id="m-quem">${candidatos.map(u =>
          `<option value="${esc(u.uid)}">${esc(rotulo(u))}</option>`).join('')}</select>
        <span class="cel-sub">Quem já é Premium recebe os dias somados ao prazo atual, sem perder o que falta.</span>
      </div>
      <div class="campo"><label for="m-dias">Duração em dias</label>
        <input id="m-dias" type="number" min="0" max="3650" value="30" inputmode="numeric">
        <span class="campo-erro" id="m-erro"></span>
        <span class="cel-sub">Deixe 0 para Premium sem prazo de validade.</span></div>
      <div class="campo"><label for="m-obs">Observação (opcional)</label>
        <input id="m-obs" type="text" maxlength="200" placeholder="ex.: cortesia por indicação"></div>`,
    okTexto: 'Conceder',
    aoConfirmar: () => {
      const uid  = $('#m-quem').value;
      const dias = Math.floor(Number($('#m-dias').value));
      const alvo = S.usuarios.find(x => x.uid === uid);
      if (!alvo) { $('#m-erro').textContent = tr('admin.chooseUser', 'Escolha um usuário.'); return; }
      if (!isFinite(dias) || dias < 0) { $('#m-erro').textContent = tr('admin.invalidDays', 'Informe um número de dias válido.'); return; }
      return executar(
        () => chamarApi('set-plan', { uid, plan: 'premium', dias, obs: $('#m-obs').value || '' }),
        dias > 0 ? `${nomeDe(alvo)} agora é Premium por ${dias} dia(s).` : `${nomeDe(alvo)} agora é Premium, sem prazo.`);
    },
  });
}

function acaoRemoverPremium(u) {
  abrirModal({
    titulo: 'Remover Premium',
    corpo: `<p>Tem certeza de que deseja remover o Premium de <b>${esc(nomeDe(u))}</b>?</p>
      <div class="aviso">A conta volta ao plano gratuito e passa a valer o limite de ${LIMITE_GRATIS} notas por mês.</div>`,
    okTexto: 'Remover Premium', okPerigo: true,
    aoConfirmar: () => executar(
      () => chamarApi('set-plan', { uid: u.uid, plan: 'free' }),
      `${nomeDe(u)} voltou para o plano gratuito.`),
  });
}

function acaoVencimento(u) {
  const atual = u.planExpiresAt ? new Date(u.planExpiresAt).toISOString().slice(0, 10) : '';
  abrirModal({
    titulo: 'Alterar vencimento',
    corpo: `<p>Assinatura de <b>${esc(nomeDe(u))}</b>.</p>
      <div class="campo"><label for="m-data">Nova data de vencimento</label>
        <input id="m-data" type="date" value="${esc(atual)}">
        <span class="campo-erro" id="m-erro"></span>
        <span class="cel-sub">Vencimento atual: ${esc(data(u.planExpiresAt) || 'sem prazo')}</span></div>
      <div class="campo"><label for="m-obs">Observação (opcional)</label>
        <input id="m-obs" type="text" maxlength="200"></div>`,
    okTexto: 'Salvar',
    aoConfirmar: () => {
      const v = $('#m-data').value;
      if (!v) { $('#m-erro').textContent = 'Escolha uma data.'; return; }
      // 23:59:59 local — vencer "no dia" deve valer o dia inteiro.
      const ts = new Date(v + 'T23:59:59').getTime();
      if (!isFinite(ts)) { $('#m-erro').textContent = tr('admin.invalidDate', 'Data inválida.'); return; }
      if (ts < Date.now()) { $('#m-erro').textContent = tr('admin.datePassed', 'A data já passou. Isso encerraria a assinatura imediatamente.'); return; }
      return executar(
        () => chamarApi('set-plan', { uid: u.uid, plan: 'premium', expiraEm: ts, obs: $('#m-obs').value || '' }),
        `Vencimento de ${nomeDe(u)} alterado para ${data(ts)}.`);
    },
  });
}

function acaoDarAdmin(u) {
  abrirModal({
    titulo: 'Tornar administrador',
    corpo: `<p>Este usuário terá acesso aos dados administrativos do sistema. Deseja continuar?</p>
      <div class="aviso">Administradores enxergam e alteram os dados de todos os usuários,
      inclusive planos e permissões. A permissão passa a valer no próximo login de ${esc(nomeDe(u))}.</div>`,
    okTexto: 'Tornar administrador',
    aoConfirmar: () => executar(
      () => chamarApi('set-admin', { uid: u.uid, admin: true }),
      `${nomeDe(u)} agora é administrador.`),
  });
}

function acaoTirarAdmin(u) {
  const outros = S.usuarios.filter(x => x.admin && x.uid !== u.uid).length;
  // Sem nenhum administrador, ninguém consegue conceder a permissão de volta:
  // ela só é escrita pelo endpoint, que exige um administrador para chamar.
  if (outros === 0) {
    abrirModal({
      titulo: 'Não é possível remover',
      corpo: `<p><b>${esc(nomeDe(u))}</b> é o único administrador do sistema.</p>
        <div class="aviso">Remover a permissão deixaria o sistema sem nenhum administrador — e não haveria
        como conceder de volta pelo painel, porque a operação exige um administrador. Promova outra pessoa antes.</div>`,
      okTexto: 'Entendi',
      aoConfirmar: () => { fecharModal(); },
    });
    return;
  }
  if (u.uid === S.meuUid) {
    abrirModal({
      titulo: 'Remover a sua própria permissão?',
      corpo: `<p>Você está prestes a remover a <b>sua própria</b> permissão administrativa.</p>
        <div class="aviso">Você perderá o acesso a este painel imediatamente e precisará de outro
        administrador para recuperá-lo. Digite <b>${esc(u.username || u.uid)}</b> para confirmar.</div>
        <div class="campo"><label for="m-conf">Confirmação</label>
          <input id="m-conf" type="text" autocomplete="off"><span class="campo-erro" id="m-erro"></span></div>`,
      okTexto: 'Remover minha permissão', okPerigo: true,
      aoConfirmar: () => {
        if ($('#m-conf').value.trim() !== (u.username || u.uid)) {
          $('#m-erro').textContent = tr('admin.textMismatch', 'O texto não confere.'); return;
        }
        return executar(
          () => chamarApi('set-admin', { uid: u.uid, admin: false }),
          'Sua permissão administrativa foi removida.');
      },
    });
    return;
  }
  abrirModal({
    titulo: 'Remover administrador',
    corpo: `<p>Remover a permissão administrativa de <b>${esc(nomeDe(u))}</b>?</p>`,
    okTexto: 'Remover', okPerigo: true,
    aoConfirmar: () => executar(
      () => chamarApi('set-admin', { uid: u.uid, admin: false }),
      `Permissão removida de ${nomeDe(u)}.`),
  });
}

function acaoBloquear(u) {
  abrirModal({
    titulo: 'Bloquear conta',
    corpo: `<p>Bloquear a conta de <b>${esc(nomeDe(u))}</b>?</p>
      <div class="aviso">A conta é desativada no Firebase Authentication: a pessoa perde o acesso ao app
      e ao banco de dados imediatamente, e as sessões abertas são encerradas. Os dados dela são preservados
      e a ação pode ser revertida a qualquer momento.</div>
      <div class="campo"><label for="m-conf">Digite <b>${esc(u.username || u.email || u.uid)}</b> para confirmar</label>
        <input id="m-conf" type="text" autocomplete="off"><span class="campo-erro" id="m-erro"></span></div>`,
    okTexto: 'Bloquear', okPerigo: true,
    aoConfirmar: () => {
      if ($('#m-conf').value.trim() !== (u.username || u.email || u.uid)) {
        $('#m-erro').textContent = tr('admin.textMismatch', 'O texto não confere.'); return;
      }
      return executar(
        () => chamarApi('admin-users', { action: 'setDisabled', uid: u.uid, disabled: true }),
        `Conta de ${nomeDe(u)} bloqueada.`);
    },
  });
}

function acaoDesbloquear(u) {
  abrirModal({
    titulo: 'Reativar conta',
    corpo: `<p>Reativar a conta de <b>${esc(nomeDe(u))}</b>? Ela volta a poder entrar normalmente.</p>`,
    okTexto: 'Reativar',
    aoConfirmar: () => executar(
      () => chamarApi('admin-users', { action: 'setDisabled', uid: u.uid, disabled: false }),
      `Conta de ${nomeDe(u)} reativada.`),
  });
}

/* Exclusão definitiva. A rotina completa vive em lib/delete-user.js — ela
   percorre os doze caminhos onde os dados de uma pessoa ficam, transfere a
   posse dos grupos em que ela era dona (em vez de destruir o quadro de quem
   fica) e só então apaga o registro do Authentication. */
function acaoExcluir(u) {
  const chave = u.username || u.email || u.uid;
  abrirModal({
    titulo: 'Excluir conta definitivamente',
    corpo: `<p>Você está prestes a apagar a conta de <b>${esc(nomeDe(u))}</b>${u.email ? ` (${esc(u.email)})` : ''}.</p>
      <div class="aviso"><b>Isto não tem volta.</b> Serão apagados:
        <br>• perfil, e-mail, plano e todas as notas e workspaces pessoais
        <br>• conversas de dois com qualquer pessoa
        <br>• quadros compartilhados 1:1
        <br>• listas de amigos, convites e indicações
        <br>• o login no Firebase Authentication
        <br><br>Nos grupos em que participava, ela sai da lista de membros. Se era dona
        e sobra alguém, a <b>posse passa para outro membro</b> — o grupo e o quadro de
        quem fica são preservados. Só some o grupo que ficaria vazio.
        <br><br>O <b>@${esc(u.username || '—')}</b> volta a ficar livre para outra pessoa.</div>
      <div class="campo"><label for="m-conf">Digite <b>${esc(chave)}</b> para confirmar</label>
        <input id="m-conf" type="text" autocomplete="off" spellcheck="false">
        <span class="campo-erro" id="m-erro"></span></div>`,
    okTexto: 'Excluir para sempre', okPerigo: true,
    aoConfirmar: () => {
      const v = $('#m-conf').value.trim();
      if (v !== chave) { $('#m-erro').textContent = tr('admin.textMismatchHandle', 'O texto não confere com o @ nem com o e-mail.'); return; }
      return executar(
        // A confirmação vai junto: o servidor confere de novo, para o clique
        // não ser a única barreira contra apagar a pessoa errada.
        () => chamarApi('delete-user', { uid: u.uid, confirmacao: v }),
        `Conta de ${nomeDe(u)} excluída.`);
    },
  });
}

/* ── Menu de ações da linha ───────────────────────────────────────────── */
function fecharMenu() { document.querySelector('.menu-pop')?.remove(); }

function abrirMenu(botao, uid) {
  fecharMenu();
  const u = S.usuarios.find(x => x.uid === uid);
  if (!u) return;

  const itens = [
    { a: 'detalhes', t: 'Ver detalhes' },
    { a: 'copiar',   t: 'Copiar UID' },
    { sep: true },
    u.plano === 'premium'
      ? { a: 'remover-prem', t: 'Remover Premium' }
      : { a: 'dar-prem',     t: 'Conceder Premium' },
    ...(u.plano === 'premium' ? [{ a: 'vencimento', t: 'Alterar vencimento' }] : []),
    { sep: true },
    u.admin ? { a: 'tirar-admin', t: 'Remover administrador' }
            : { a: 'dar-admin',   t: 'Tornar administrador' },
    { sep: true },
    u.bloqueado ? { a: 'desbloquear', t: 'Reativar conta' }
                : { a: 'bloquear',    t: 'Bloquear conta', perigo: true },
    { a: 'excluir', t: 'Excluir conta', perigo: true,
      desativado: uid === S.meuUid,
      dica: uid === S.meuUid ? 'Você não pode excluir a própria conta' : 'Apaga tudo, sem volta' },
  ];

  const pop = document.createElement('div');
  pop.className = 'menu-pop';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = itens.map(i => i.sep ? '<div class="menu-sep"></div>' :
    `<button class="menu-item${i.perigo ? ' is-danger' : ''}" role="menuitem" type="button"
      data-a="${i.a}" data-uid="${esc(uid)}"${i.desativado ? ' disabled' : ''}${i.dica ? ` title="${esc(i.dica)}"` : ''}>${esc(i.t)}</button>`).join('');
  document.body.appendChild(pop);

  const r = botao.getBoundingClientRect();
  const alt = pop.offsetHeight, larg = pop.offsetWidth;
  pop.style.top  = (r.bottom + alt + 8 > window.innerHeight ? Math.max(8, r.top - alt - 6) : r.bottom + 6) + 'px';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - larg - 8, r.right - larg)) + 'px';
}

function despacharAcao(acao, uid) {
  const u = S.usuarios.find(x => x.uid === uid);
  if (!u) return;
  fecharMenu();
  if (acao === 'detalhes')      return abrirDetalhes(uid);
  if (acao === 'copiar')        return copiarUid(uid);
  if (acao === 'dar-prem')      return acaoDarPremium(u);
  if (acao === 'remover-prem')  return acaoRemoverPremium(u);
  if (acao === 'vencimento')    return acaoVencimento(u);
  if (acao === 'dar-admin')     return acaoDarAdmin(u);
  if (acao === 'tirar-admin')   return acaoTirarAdmin(u);
  if (acao === 'bloquear')      return acaoBloquear(u);
  if (acao === 'desbloquear')   return acaoDesbloquear(u);
  if (acao === 'excluir')       return acaoExcluir(u);
}

async function copiarUid(uid) {
  try { await navigator.clipboard.writeText(uid); aviso('UID copiado.', 'ok'); }
  catch (_) {
    // clipboard exige contexto seguro e permissão; o campo temporário sempre funciona
    const i = document.createElement('input');
    i.value = uid; document.body.appendChild(i); i.select();
    try { document.execCommand('copy'); aviso('UID copiado.', 'ok'); }
    catch (e2) { aviso('Não foi possível copiar.', 'erro'); }
    i.remove();
  }
}

/* ── Ligações de eventos ──────────────────────────────────────────────── */
let _buscaTmr = null;
let _buscaReportesTmr = null;

function ligarEventos() {
  document.querySelectorAll('.side-link[data-secao]').forEach(b => {
    b.addEventListener('click', () => {
      S.secao = b.dataset.secao;
      S.pagina = 1;
      fecharMenu();
      $('#sidebar').classList.remove('is-open');
      $('#side-scrim').hidden = true;
      renderizarSecao();
    });
  });

  $('#btn-menu').addEventListener('click', () => {
    const aberto = $('#sidebar').classList.toggle('is-open');
    $('#side-scrim').hidden = !aberto;
  });
  $('#side-scrim').addEventListener('click', () => {
    $('#sidebar').classList.remove('is-open');
    $('#side-scrim').hidden = true;
  });

  $('#btn-recarregar').addEventListener('click', () => { S.contagemNotas.clear(); carregarTudo(); });
  $('#btn-sair').addEventListener('click', async () => {
    desligarTudo();
    try { await window._fbAuth.signOut(); } catch (_) {}
    location.href = '../login.html?mode=signin';
  });

  // Debounce: sem ele, cada tecla redesenharia a tabela inteira.
  $('#busca').addEventListener('input', e => {
    clearTimeout(_buscaTmr);
    const v = e.target.value;
    _buscaTmr = setTimeout(() => { S.busca = v; S.pagina = 1; renderUsuarios(); }, 220);
  });
  $('#filtro').addEventListener('change', e => {
    S.filtro = e.target.value; S.pagina = 1; renderUsuarios();
    // Excluir em massa só aparece no filtro de bloqueadas: é irreversível, e
    // não deve estar ao alcance de um clique distraído em qualquer tela.
    const b = $('#btn-excluir-bloqueadas');
    if (b) b.hidden = S.filtro !== 'bloqueados';
  });
  $('#btn-excluir-bloqueadas')?.addEventListener('click', excluirBloqueadas);
  $('#ordem').addEventListener('change', e => { S.ordem = e.target.value; renderUsuarios(); });
  $('#porpagina').addEventListener('change', e => { S.porPagina = Number(e.target.value); S.pagina = 1; renderUsuarios(); });
  $('#filtro-assin').addEventListener('change', e => { S.filtroAssin = e.target.value; renderAssinaturas(); });
  $('#busca-reportes').addEventListener('input', e => {
    clearTimeout(_buscaReportesTmr);
    const value = e.target.value;
    _buscaReportesTmr = setTimeout(() => {
      S.buscaReportes = value;
      renderReportes();
    }, 220);
  });
  $('#filtro-reportes-status').addEventListener('change', e => {
    S.filtroReportesStatus = e.target.value;
    renderReportes();
  });
  $('#filtro-reportes-categoria').addEventListener('change', e => {
    S.filtroReportesCategoria = e.target.value;
    renderReportes();
  });
  $('#btn-conceder').addEventListener('click', acaoConcederEscolhendo);

  // Um ouvinte só no documento, em vez de um por linha: a tabela é redesenhada
  // a cada filtro, e ouvintes por linha vazariam a cada redesenho.
  document.addEventListener('click', e => {
    const menuBtn = e.target.closest('.js-menu');
    if (menuBtn) { e.stopPropagation(); return abrirMenu(menuBtn, menuBtn.dataset.uid); }

    const reportOpen = e.target.closest('.js-report-open');
    if (reportOpen) return abrirReporte(reportOpen.dataset.reportId);

    const reportSave = e.target.closest('.js-report-save');
    if (reportSave && !reportSave.disabled) return salvarReporte(reportSave.dataset.reportId);

    const item = e.target.closest('.menu-item, .js-acao');
    if (item && !item.disabled) return despacharAcao(item.dataset.a, item.dataset.uid);

    const pag = e.target.closest('.js-pag');
    if (pag && !pag.disabled) { S.pagina = Number(pag.dataset.p); renderUsuarios(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

    if (!e.target.closest('.menu-pop')) fecharMenu();
  });

  $('#drawer-fechar').addEventListener('click', fecharDetalhes);
  $('#drawer-scrim').addEventListener('click', fecharDetalhes);
  $('#modal-cancelar').addEventListener('click', fecharModal);
  $('#modal-scrim').addEventListener('click', e => { if (e.target === $('#modal-scrim')) fecharModal(); });
  $('#modal-ok').addEventListener('click', () => { if (_modalOk) _modalOk(); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#modal-scrim').hidden) return fecharModal();
    if (!$('#drawer').hidden) return fecharDetalhes();
    fecharMenu();
  });

  window.addEventListener('resize', fecharMenu);
  window.addEventListener('offline', () => aviso('Sem conexão. As alterações não serão salvas até a conexão voltar.', 'erro'));
  window.addEventListener('online',  () => aviso('Conexão restabelecida.', 'ok'));
}

function iniciarReportesTempoReal() {
  // Os 500 mais recentes dão uma abertura rápida da tela. Consultas separadas
  // mantêm TODOS os pendentes acessíveis mesmo quando o histórico ultrapassar
  // esse limite, evitando esconder um bug antigo ainda sem solução.
  const fatias = { recentes:null, abertos:null, emAnalise:null };
  const atualizar = () => {
    const disponiveis = Object.values(fatias).filter(Boolean);
    if (!disponiveis.length) return;
    const unidos = {};
    disponiveis.forEach(fatia => Object.assign(unidos, fatia));
    S.reportes = normalizarReportes(unidos);
    S.reportesCarregando = false;
    S.reportesErro = null;
    atualizarBadgeReportes();
    if (S.secao === 'reportes') renderReportes();
  };
  const falhou = error => {
    if (Object.values(fatias).some(Boolean)) return;
    S.reportesCarregando = false;
    S.reportesErro = error?.message || 'Não foi possível ler os reportes.';
    atualizarBadgeReportes();
    if (S.secao === 'reportes') renderReportes();
  };
  const base = window._fbDB.ref('reports');
  [
    ['recentes', base.orderByChild('createdAt').limitToLast(500)],
    ['abertos', base.orderByChild('status').equalTo('open')],
    ['emAnalise', base.orderByChild('status').equalTo('in_progress')],
  ].forEach(([chave, consulta]) => {
    ouvirConsulta(consulta, 'value', snap => {
      fatias[chave] = snap.val() || {};
      atualizar();
    }, 'reports/' + chave, falhou);
  });
}

const _premiumIdsConhecidos = new Set();
const _premiumFila = [];
let _premiumAlertasIniciados = false;
let _premiumRetryTimer = null;

function marcarPremiumLido(notificationId) {
  if (!notificationId || !S.meuUid) return;
  window._fbDB.ref(`adminNotificationReads/${S.meuUid}/${notificationId}`)
    .set(Date.now())
    .catch(error => console.warn('[admin] não foi possível marcar aviso como lido:', error?.message));
}

function fecharPremiumAlert(el) {
  if (!el || el.dataset.closing === '1') return;
  el.dataset.closing = '1';
  clearTimeout(el._autoCloseTimer);
  if (!el._readRecorded) {
    el._readRecorded = true;
    marcarPremiumLido(el.dataset.notificationId);
  }
  el.classList.add('is-leaving');
  setTimeout(() => {
    el.remove();
    bombearFilaPremium();
  }, 330);
}

function descricaoPremium(item) {
  const lang = window.MyDeskI18n?.getLanguage?.() || 'pt';
  const origem = item.source === 'stripe'
    ? (lang === 'en' ? 'Stripe payment' : lang === 'es' ? 'Pago con Stripe' : 'Pagamento Stripe')
    : (lang === 'en' ? 'Administrative grant' : lang === 'es' ? 'Concesión administrativa' : 'Concessão administrativa');
  const ciclo = item.billingCycle === 'anual'
    ? (lang === 'en' ? ' · annual plan' : lang === 'es' ? ' · plan anual' : ' · plano anual')
    : item.billingCycle === 'mensal'
      ? (lang === 'en' ? ' · monthly plan' : lang === 'es' ? ' · plan mensual' : ' · plano mensal')
      : '';
  const vence = item.planExpiresAt
    ? ` · ${lang === 'en' ? 'expires' : lang === 'es' ? 'vence' : 'vence em'} ${data(item.planExpiresAt)}`
    : '';
  return origem + ciclo + vence;
}

function mostrarPremiumAlert(item) {
  const stack = $('#premium-alerts');
  if (!stack) return;
  const usuario = S.usuarios.find(u => u.uid === item.uid);
  const username = item.username || usuario?.username || '';
  const nome = usuario?.nome || (username ? '@' + username : String(item.uid || '').slice(0, 12));
  const subtitulo = descricaoPremium(item) + (usuario?.nome && username ? ` · @${username}` : '');
  const el = document.createElement('article');
  el.className = 'premium-alert';
  el.dataset.notificationId = item.id;
  el.innerHTML = `
    <div class="premium-alert-icon" aria-hidden="true">★</div>
    <div class="premium-alert-copy">
      <div class="premium-alert-kicker">${esc(
        (window.MyDeskI18n?.getLanguage?.() || 'pt') === 'en' ? 'New Premium subscription' :
        (window.MyDeskI18n?.getLanguage?.() || 'pt') === 'es' ? 'Nueva suscripción Premium' :
        'Nova assinatura Premium'
      )}</div>
      <div class="premium-alert-title">${esc(tr(
        'admin.premiumNotice', '{name} acabou de virar Premium.', { name:nome }
      ))}</div>
      <div class="premium-alert-sub">${esc(subtitulo)}</div>
    </div>
    <button class="premium-alert-close" type="button" aria-label="Fechar aviso">×</button>`;
  el.querySelector('.premium-alert-close').addEventListener('click', () => fecharPremiumAlert(el));
  stack.appendChild(el);
  // Aba em segundo plano não conta como visualização. O timer só corre quando
  // o documento está visível e a leitura só é gravada ao fechar o cartão.
  if (!document.hidden) {
    el._autoCloseTimer = setTimeout(() => fecharPremiumAlert(el), 9000);
  }

  // Atualiza somente a pessoa afetada, sem repetir a listagem inteira do Auth.
  bd(`users/${item.uid}/plan`).then(plano => {
    if (!plano) return;
    const u = S.usuarios.find(user => user.uid === item.uid);
    if (!u) return;
    u.plano = plano.plan === 'premium' ? 'premium' : 'free';
    u.planExpiresAt = Number(plano.planExpiresAt) || null;
    u.planActivatedAt = Number(plano.planActivatedAt) || null;
    u.planTipo = plano.planTipo || null;
    u.vencido = u.plano === 'premium' && u.planExpiresAt
      ? Date.now() > u.planExpiresAt
      : false;
    if (['visao', 'usuarios', 'assinaturas'].includes(S.secao)) renderizarSecao();
  }).catch(() => {});
}

function bombearFilaPremium() {
  const stack = $('#premium-alerts');
  if (!stack || document.hidden) return;
  while (stack.children.length < 3 && _premiumFila.length) {
    mostrarPremiumAlert(_premiumFila.shift());
  }
}

function enfileirarPremium(item) {
  if (!item || item.type !== 'premium_activated' || !item.id) return;
  _premiumFila.push(item);
  bombearFilaPremium();
}

async function iniciarAlertasPremium() {
  if (_premiumAlertasIniciados || !S.meuUid) return;
  _premiumAlertasIniciados = true;
  clearTimeout(_premiumRetryTimer);
  const notificationsRef = window._fbDB.ref('adminNotifications')
    .orderByChild('createdAt')
    .limitToLast(200);
  const readsRef = window._fbDB.ref(`adminNotificationReads/${S.meuUid}`);

  let notificationsSnap;
  try {
    notificationsSnap = await notificationsRef.once('value');
  } catch (error) {
    console.warn('[admin] alertas Premium indisponíveis:', error?.message);
    _premiumAlertasIniciados = false;
    _premiumRetryTimer = setTimeout(iniciarAlertasPremium, 5000);
    return;
  }

  const bruto = notificationsSnap.val() || {};
  const existentes = Object.entries(bruto)
    .map(([id, value]) => ({ id, ...(value || {}) }))
    .filter(item => item.type === 'premium_activated')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  existentes.forEach(item => _premiumIdsConhecidos.add(item.id));

  try {
    const readsSnap = await readsRef.once('value');
    const lidos = readsSnap.val() || {};
    existentes.filter(item => !lidos[item.id]).slice(-8).forEach(enfileirarPremium);
  } catch (error) {
    // Sem o ledger não é seguro tratar todo o histórico como novo. O listener
    // abaixo continua mostrando ativações que chegarem a partir de agora.
    console.warn('[admin] histórico de leituras Premium indisponível:', error?.message);
  }

  // child_added entrega também o histórico; o Set acima separa histórico de
  // eventos realmente novos sem abrir uma janela de perda durante a conexão.
  ouvirConsulta(notificationsRef, 'child_added', snap => {
    if (_premiumIdsConhecidos.has(snap.key)) return;
    _premiumIdsConhecidos.add(snap.key);
    enfileirarPremium({ id: snap.key, ...(snap.val() || {}) });
  }, 'adminNotifications');
}

window.addEventListener('mydesk:languagechange', () => {
  if (!$('#shell')?.hidden) renderizarSecao();
  if (!$('#drawer')?.hidden) fecharDetalhes();
});

document.addEventListener('visibilitychange', () => {
  const alerts = Array.from(document.querySelectorAll('.premium-alert:not(.is-leaving)'));
  if (document.hidden) {
    alerts.forEach(el => {
      clearTimeout(el._autoCloseTimer);
      el._autoCloseTimer = null;
    });
    return;
  }
  alerts.forEach(el => {
    clearTimeout(el._autoCloseTimer);
    el._autoCloseTimer = setTimeout(() => fecharPremiumAlert(el), 9000);
  });
  bombearFilaPremium();
});

/* ── Início ───────────────────────────────────────────────────────────── */
(async function iniciar() {
  const liberado = await abrirPortao();
  if (!liberado) return;   // nenhuma leitura do banco acontece sem isto

  ligarEventos();
  await carregarTudo();
  iniciarReportesTempoReal();
  iniciarAlertasPremium();

  // Presença em tempo real — um único ouvinte, desligado no pagehide. Mantém
  // o "online agora" correto sem recarregar a página inteira.
  ouvir('presence', 'value', snap => {
    _presencaBruta = snap.val() || {};
    _presencaLida  = true;
    aplicarPresenca();
  });

  /* ── E UM RELÓGIO, porque frescura é função do TEMPO ──────────────────
     O ouvinte acima só acorda quando o nó `presence` MUDA. Só que o caso em
     que alguém aparece "Online" sem estar é justamente o caso em que o nó
     PARA de mudar: o `onDisconnect` falhou (aba suspensa por dias, rede que
     caiu sem FIN, processo morto), o registro ficou para trás e ninguém mais
     escreve nele.

     Resultado: quem estivesse marcado online no instante da última mudança
     continuava online para sempre na tela, enquanto o carimbo envelhecia.
     `presencaFresca` já sabia a resposta certa — ninguém estava perguntando
     de novo.

     Isto se corrigia sozinho enquanto houvesse OUTRA pessoa realmente online,
     porque a batida dela a cada 30s mexia no nó e forçava o recálculo de
     todos. Ou seja: o erro aparecia exatamente quando não havia mais ninguém
     para desmenti-lo. */
  setInterval(aplicarPresenca, 15000);
})();

function aplicarPresenca() {
  if (!_presencaLida) return;   // sem leitura, ninguém muda de estado
  let mudou = false;
  S.usuarios.forEach(u => {
    const p = _presencaBruta[u.uid];
    const online = presencaFresca(p);
    const status = p?.status || null;
    if (u.online !== online || u.statusPresenca !== status) mudou = true;
    u.online = online;
    u.statusPresenca = status;
  });
  // Repintar sem mudança nenhuma roubaria o foco de quem está digitando na
  // busca a cada 15 segundos.
  if (!mudou) return;
  if (S.secao === 'visao' || S.secao === 'usuarios' || S.secao === 'admins') renderizarSecao();
}

/* ═══════════════════════════════════════════════════════════════════════
   RECEITA — vinda da Stripe, não do nosso banco
   ═══════════════════════════════════════════════════════════════════════
   O Firebase sabe quem tem Premium; só a Stripe sabe quanto entra. Assinatura
   cancelada, cartão recusado e troca de mensal para anual acontecem lá, e um
   espelho no nosso banco envelheceria em silêncio — mostrando receita de quem
   já saiu. Por isso os números são buscados na hora, e a tela diz quando foram
   buscados.
   ═══════════════════════════════════════════════════════════════════════ */
const brl = c => (Number(c || 0) / 100).toLocaleString('pt-BR',
  { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

async function pintarReceita(forcar) {
  const alvo = $('#cards-receita');
  if (!alvo) return;
  if (S.receita && !forcar) return desenharReceita(S.receita);

  alvo.innerHTML = `<div class="receita-vazio">
    <div class="receita-vazio-txt">
      <b>${esc(tr('admin.revenue', 'Receita'))}</b>
      <span>${esc(tr('admin.revenueLead', 'Assinaturas ativas, renovações previstas e faturas em aberto — direto da Stripe.'))}</span>
    </div>
    <button class="btn btn-primary" id="btn-carregar-receita" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      ${esc(tr('admin.loadRevenue', 'Carregar receita'))}
    </button>
  </div>`;
  $('#btn-carregar-receita')?.addEventListener('click', async ev => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = 'Consultando a Stripe…';
    try {
      const r = await chamarApi('admin-users', { action: 'revenue' });
      S.receita = r.receita;
      desenharReceita(S.receita);
    } catch (e) {
      alvo.innerHTML = `<div class="receita-vazio">
        <div class="receita-vazio-txt">
          <b>${esc(tr('admin.stripeQueryFailed', 'Não deu para consultar a Stripe'))}</b>
          <span class="receita-erro">${esc(e.message || tr('admin.tryAgainMoment', 'Tente de novo em instantes.'))}</span>
        </div>
        <button class="btn" id="btn-carregar-receita" type="button">${esc(tr('admin.tryAgain', 'Tentar de novo'))}</button>
      </div>`;
      $('#btn-carregar-receita')?.addEventListener('click', () => pintarReceita(true));
    }
  });
}

function desenharReceita(d) {
  const alvo = $('#cards-receita');
  if (!alvo || !d) return;
  const quando = d.atualizadoEm
    ? new Date(d.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  const cartao = (rot, val, sub, cls) => `
    <div class="card${cls ? ' ' + cls : ''}">
      <div class="card-rot">${esc(rot)}</div>
      <div class="card-num">${esc(String(val))}</div>
      <div class="card-sub">${esc(sub || '')}</div>
    </div>`;

  const porPreco = Object.entries(d.porPreco || {})
    .sort((a, b) => b[1].assinantes - a[1].assinantes);

  alvo.innerHTML = [
    cartao('Receita mensal (MRR)', brl(d.mrrCentavos),
           d.ativos + (d.ativos === 1 ? ' assinante ativo' : ' assinantes ativos'), 'is-ok'),
    cartao('Projeção anual (ARR)', brl(d.arrCentavos), 'MRR × 12, se nada mudar'),
    cartao('Por assinante', brl(d.porAssinanteCentavos), 'média mensal'),
    cartao('Renovam em 30 dias', brl(d.proximos30Centavos), 'cobranças já agendadas'),
    d.emAbertoQtd ? cartao('Faturas em aberto', brl(d.emAbertoCentavos),
           d.emAbertoQtd + (d.emAbertoQtd === 1 ? ' emitida, não paga' : ' emitidas, não pagas'), 'is-warn') : '',
    d.inadimplentes ? cartao('Inadimplentes', d.inadimplentes, 'cobrança falhou', 'is-warn') : '',
    d.cancelando ? cartao('Cancelando', d.cancelando, 'ativos até o fim do período', 'is-warn') : '',
    d.fundadores ? cartao('Plano Fundador', d.fundadores,
           d.padrao + ' no preço atual', 'is-accent') : '',
  ].filter(Boolean).join('') + `
    <div class="receita-rodape">
      ${porPreco.length ? '<div class="receita-precos">' + porPreco.map(([rot, v]) =>
        `<span class="receita-preco"><b>${esc(String(v.assinantes))}</b> ${esc(rot)}</span>`).join('') + '</div>' : ''}
      <div class="receita-fonte">
        <span class="receita-selo"><span class="receita-pulso"></span>Stripe ao vivo</span>
        <span class="receita-hora">${esc(quando)}</span>
      </div>
      <button class="btn btn-sm btn-atualizar" id="btn-atualizar-receita" type="button" title="Consultar a Stripe de novo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
        </svg>
        <span>Atualizar</span>
      </button>
    </div>`;

  $('#btn-atualizar-receita')?.addEventListener('click', () => { S.receita = null; pintarReceita(true); });
}

/* ═══════════════════════════════════════════════════════════════════════
   EXCLUIR TODAS AS CONTAS BLOQUEADAS
   ═══════════════════════════════════════════════════════════════════════
   Bloquear é reversível; excluir não é. Por isso aqui não basta um "tem
   certeza": é preciso digitar a palavra, a lista do que será apagado fica à
   vista, e a própria conta e outros administradores são recusados mesmo que
   estejam bloqueados — um engano nesse par é irreparável.

   A exclusão vai uma a uma, pelo mesmo endpoint da exclusão individual, que já
   sabe transferir posse de grupo, liberar o @ e limpar as listas de amigos de
   quem fica. Uma rota de exclusão em massa própria seria outro caminho para o
   mesmo lugar, com metade do cuidado. */
async function excluirBloqueadas() {
  const alvos = (S.usuarios || []).filter(u =>
    u.bloqueado && u.uid !== S.meuUid && !u.admin);
  const protegidas = (S.usuarios || []).filter(u =>
    u.bloqueado && (u.uid === S.meuUid || u.admin));

  if (!alvos.length) {
    return aviso( protegidas.length
      ? 'As únicas contas bloqueadas são de administradores — não são excluídas por aqui.'
      : 'Nenhuma conta bloqueada para excluir.');
  }

  const lista = alvos.slice(0, 12).map(u => '· ' + (u.email || u.uid)).join('\n') +
                (alvos.length > 12 ? `\n… e mais ${alvos.length - 12}` : '');
  const resposta = prompt(
    `Excluir ${alvos.length} conta${alvos.length === 1 ? '' : 's'} bloqueada${alvos.length === 1 ? '' : 's'}?\n\n` +
    lista + '\n\n' +
    'Apaga notas, clientes, formulários, grupos e arquivos de cada uma. Não tem volta.' +
    (protegidas.length ? `\n\n${protegidas.length} conta(s) de administrador ficam de fora.` : '') +
    '\n\nDigite EXCLUIR para confirmar:');
  if (resposta !== 'EXCLUIR') return aviso( 'Cancelado.');

  let feitas = 0, falhas = 0;
  for (const u of alvos) {
    aviso( `Excluindo ${feitas + 1} de ${alvos.length}…`);
    try {
      await chamarApi('delete-user', { uid: u.uid });
      feitas++;
    } catch (e) {
      falhas++;
      console.warn('[admin] falha ao excluir', u.uid, e && e.message);
    }
  }
  aviso(
    `${feitas} conta(s) excluída(s)` + (falhas ? `, ${falhas} falharam` : '') + '.');
  await carregarTudo();
}

/* ═══════════════════════════════════════════════════════════════════════
   ACESSOS DO MÊS
   ═══════════════════════════════════════════════════════════════════════
   Sai do último acesso registrado pelo Firebase Authentication, que o painel já
   carrega — nenhuma gravação nova, nenhum custo, nenhuma regra a mexer.

   É preciso dizer o que isto é e o que não é: são CONTAS que entraram, não
   visitas ao site. Quem abre a landing e vai embora sem se cadastrar não
   aparece aqui, porque ninguém sem conta escreve no banco — e abrir escrita
   para visitante anônimo, só para contar, seria trocar um número por um risco.

   Para visitas de verdade, incluindo quem nunca criou conta, o caminho é ligar
   o Umami em docs/js/analytics.js: é gratuito, não usa cookie (dispensa banner)
   e o arquivo já está preparado — falta só trocar `provider` e colar o id.

   Contas de administrador saem da conta, como pedido: seu próprio acesso não
   deve inflar o número que você usa para decidir. */
function pintarAcessos(usuarios) {
  const alvo = $('#cards-acessos');
  if (!alvo) return;

  const agora = new Date();
  const mesAtual = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const mesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const inicioAnterior = mesPassado.getTime();
  const fimAnterior = inicioMes;
  const dia = 86400000;

  // Sem administradores: o acesso de quem opera não é uso do produto.
  const gente = (usuarios || []).filter(x => !x.admin);

  const noMes = gente.filter(x => x.ultimoAcesso >= inicioMes).length;
  const noAnterior = gente.filter(x => x.ultimoAcesso >= inicioAnterior && x.ultimoAcesso < fimAnterior).length;
  const em7 = gente.filter(x => x.ultimoAcesso >= agora.getTime() - 7 * dia).length;
  const hoje = gente.filter(x => x.ultimoAcesso >= agora.getTime() - dia).length;
  const novosMes = gente.filter(x => x.criadoEm >= inicioMes).length;
  const admins = (usuarios || []).length - gente.length;

  /* Comparar com o mês anterior só faz sentido depois que ele terminou — no
     dia 2, "queda de 90%" seria comparar dois dias com trinta. */
  const diaDoMes = agora.getDate();
  const variacao = (noAnterior && diaDoMes > 7)
    ? Math.round((noMes - noAnterior) / noAnterior * 100) : null;

  const cartao = (rot, val, sub, cls) => `
    <div class="card${cls ? ' ' + cls : ''}">
      <div class="card-rot">${esc(rot)}</div>
      <div class="card-num">${esc(String(val))}</div>
      <div class="card-sub">${esc(sub || '')}</div>
    </div>`;

  alvo.innerHTML = [
    cartao(tr('admin.activeAccountsMonth', 'Contas ativas no mês'), noMes,
           variacao === null ? mesAtual
             : tr('admin.vsPreviousMonth', '{sinal}{pct}% vs. mês anterior',
                  { sinal: variacao >= 0 ? '+' : '', pct: variacao }),
           variacao !== null && variacao < 0 ? 'is-warn' : 'is-ok'),
    cartao(tr('admin.lastSevenDays', 'Nos últimos 7 dias'), em7,
           tr('admin.signedInAtLeastOnce', 'entraram pelo menos uma vez')),
    cartao(tr('admin.lastTwentyFourHours', 'Nas últimas 24h'), hoje, ''),
    cartao(tr('admin.newAccountsMonth', 'Novas contas no mês'), novosMes, mesAtual),
  ].join('') + `
    <div class="receita-rodape">
      <div class="receita-fonte">
        <span class="receita-hora">${esc(tr('admin.signInsNotVisits', 'Contas que entraram, não visitas ao site'))}${
          admins ? ' · ' + esc(tr(admins === 1 ? 'admin.adminOutOne' : 'admin.adminOutMany',
                   admins === 1 ? '{n} administrador fora da conta' : '{n} administradores fora da conta',
                   { n: admins })) : ''}</span>
      </div>
    </div>`;
}
