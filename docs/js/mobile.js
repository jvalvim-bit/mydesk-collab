'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MYDESK — COMPORTAMENTOS DE CELULAR
   ═══════════════════════════════════════════════════════════════════════
   Princípio deste arquivo: NÃO reimplementar nada. Cada item da navegação
   inferior e da folha "Mais" dispara o clique do botão original da barra de
   ferramentas, que continua no DOM com o mesmo id e os mesmos ouvintes —
   só escondido por CSS. Assim o celular não vira uma segunda versão do app
   que precisa ser mantida em paralelo, e nenhuma regra de negócio existe
   em dois lugares.

   Também não há markup inline aqui por acaso: a Content-Security-Policy do
   site não tem 'unsafe-inline' em script-src, então nada de on*= no HTML.
   ═══════════════════════════════════════════════════════════════════════ */

const MB_BREAKPOINT = 860;
const mdMobileT = (key, fallback) => (
  window.MyDeskI18n ? window.MyDeskI18n.t(key, null, fallback) : fallback
);
/* A MESMA frase que o CSS usa para este layout, lida do motor de CSS. Antes
   era uma reimplementação em JS com outro limite de largura (> 860 aqui,
   >= 600 no app.js), e os dois arquivos marcavam a mesma classe nos mesmos
   eventos — quem rodasse por último vencia. Ver MQ_RETRATO_DESKTOP no app.js. */
const MB_MQ_RETRATO =
  '(orientation: portrait) and (min-width: 861px) and ' +
  '(max-aspect-ratio: 25/28) and (any-pointer: fine)';
const mbIsPortraitDesktop = () => (
  typeof window.matchMedia === 'function'
    ? window.matchMedia(MB_MQ_RETRATO).matches
    : false
);
const mbIsMobile = () => window.innerWidth <= MB_BREAKPOINT || mbIsPortraitDesktop();

function mbSincronizarViewport() {
  document.body?.classList.toggle('layout-portrait', mbIsPortraitDesktop());
  document.documentElement.classList.toggle('layout-portrait', mbIsPortraitDesktop());
}

/* ── Largura da coluna no monitor vertical ──────────────────────────────
   A coluna nasceu com 760px e uma nota aberta enchia a tela sozinha. O
   padrão diminuiu no CSS; aqui mora o ajuste manual.

   A escolha fica no navegador, e não na conta, de propósito: é preferência
   de TELA. A mesma conta aberta num monitor deitado, ou no celular, não
   deve herdar a coluna que alguém acertou para o monitor em pé.

   Quem aplica é uma variável no style do body — inline vence a media query,
   e fora do retrato a variável simplesmente não é usada por ninguém. */
const MB_LARG_MIN = 320;
const MB_LARG_MAX = 900;
const MB_LARG_PADRAO = 520;
const MB_LARG_CHAVE = 'md_largura_coluna';

const mbLimitarLargura = px => Math.max(
  MB_LARG_MIN, Math.min(MB_LARG_MAX, Math.round(Number(px) || MB_LARG_PADRAO))
);

function mbLarguraSalva() {
  // Navegação privada e cookies bloqueados fazem o localStorage lançar.
  try {
    const guardado = localStorage.getItem(MB_LARG_CHAVE);
    return guardado === null ? MB_LARG_PADRAO : mbLimitarLargura(parseInt(guardado, 10));
  } catch (_) { return MB_LARG_PADRAO; }
}

function mbAplicarLargura(px, guardar) {
  const valor = mbLimitarLargura(px);
  document.body?.style.setProperty('--portrait-largura', valor + 'px');
  if (guardar) {
    try { localStorage.setItem(MB_LARG_CHAVE, String(valor)); } catch (_) {}
  }
  document.querySelectorAll('.mb-sheet-larg').forEach(caixa => {
    const campo = caixa.querySelector('input[type="range"]');
    const eco   = caixa.querySelector('.mb-sheet-larg-val');
    if (campo && campo.valueAsNumber !== valor) campo.value = String(valor);
    if (eco) eco.textContent = valor + ' px';
  });
  return valor;
}

/* Alça na borda direita da coluna. Arrastar 1px afasta as DUAS bordas (a
   coluna é centralizada), então o deslocamento entra dobrado. */
function mbMontarAlcaLargura() {
  if (document.getElementById('mb-larg')) return;

  const alca = document.createElement('button');
  alca.type = 'button';
  alca.id = 'mb-larg';
  alca.dataset.i18nAriaLabel = 'mobile.noteWidth';
  alca.dataset.i18nTitle = 'mobile.noteWidthHint';
  alca.setAttribute('aria-label', mdMobileT('mobile.noteWidth', 'Largura das notas'));
  alca.title = mdMobileT('mobile.noteWidthHint',
    'Arraste para ajustar a largura das notas · duplo clique volta ao padrão');
  document.body.appendChild(alca);

  let inicio = null;

  alca.addEventListener('pointerdown', e => {
    inicio = { x: e.clientX, larg: mbLarguraSalva() };
    alca.classList.add('mb-arrastando');
    alca.dataset.val = inicio.larg + ' px';
    try { alca.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  alca.addEventListener('pointermove', e => {
    if (!inicio) return;
    alca.dataset.val = mbAplicarLargura(inicio.larg + (e.clientX - inicio.x) * 2, false) + ' px';
  });

  const soltar = e => {
    if (!inicio) return;
    inicio = null;
    alca.classList.remove('mb-arrastando');
    // Só agora vai para o disco: gravar a cada quadro do arraste seria
    // dezenas de escritas para uma decisão só.
    mbAplicarLargura(parseInt(alca.dataset.val, 10), true);
    delete alca.dataset.val;
    try { alca.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  alca.addEventListener('pointerup', soltar);
  alca.addEventListener('pointercancel', soltar);

  alca.addEventListener('dblclick', () => mbAplicarLargura(MB_LARG_PADRAO, true));

  // Sem teclado, a alça não existe para quem não usa mouse.
  alca.addEventListener('keydown', e => {
    const passo = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0;
    if (!passo) return;
    e.preventDefault();
    mbAplicarLargura(mbLarguraSalva() + passo, true);
  });
}

/* O mesmo ajuste com nome, dentro da folha "Mais": ninguém descobre uma
   alça sozinho. */
function mbLinhaLargura() {
  const caixa = document.createElement('div');
  caixa.className = 'mb-sheet-larg';

  const topo = document.createElement('div');
  topo.className = 'mb-sheet-larg-top';
  const rotulo = document.createElement('span');
  rotulo.dataset.i18n = 'mobile.noteWidth';
  rotulo.textContent = mdMobileT('mobile.noteWidth', 'Largura das notas');
  const eco = document.createElement('span');
  eco.className = 'mb-sheet-larg-val';
  topo.append(rotulo, eco);

  const campo = document.createElement('input');
  campo.type = 'range';
  campo.min = String(MB_LARG_MIN);
  campo.max = String(MB_LARG_MAX);
  campo.step = '10';
  campo.value = String(mbLarguraSalva());
  campo.dataset.i18nAriaLabel = 'mobile.noteWidth';
  campo.setAttribute('aria-label', mdMobileT('mobile.noteWidth', 'Largura das notas'));
  // `input` desenha ao vivo, `change` é quem grava — mesma divisão da alça.
  campo.addEventListener('input',  () => mbAplicarLargura(campo.valueAsNumber, false));
  campo.addEventListener('change', () => mbAplicarLargura(campo.valueAsNumber, true));

  const voltar = document.createElement('button');
  voltar.type = 'button';
  voltar.className = 'mb-sheet-larg-reset';
  voltar.dataset.i18n = 'mobile.resetWidth';
  voltar.textContent = mdMobileT('mobile.resetWidth', 'Voltar ao padrão');
  voltar.addEventListener('click', e => {
    e.stopPropagation();
    mbAplicarLargura(MB_LARG_PADRAO, true);
  });

  caixa.append(topo, campo, voltar);
  eco.textContent = campo.value + ' px';
  return caixa;
}

/* Ícones em SVG. Emoji não serve: cada sistema desenha o seu, os tamanhos
   não batem entre si e a fileira fica torta. */
const MB_ICONES = {
  mais:     '<path d="M12 5v14M5 12h14"/>',
  notas:    '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/>',
  clientes: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  amigos:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
  eventos:  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  menu:     '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  fundo:    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  reorg:    '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  limpar:   '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  restaurar:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  convidar: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  lofi:     '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  status:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  admin:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  sair:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  ws:       '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  resumo:   '<path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z"/>',
};

function mbSvg(nome) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round">' + (MB_ICONES[nome] || '') + '</svg>';
}

/* Clica no botão original da barra. Se ele não existe (Admin só aparece
   para administrador, Restaurar só depois de limpar), o item nem é criado.

   O `evento.stopPropagation()` é o que faz isto funcionar, e custou um bug:
   vários painéis do app fecham sozinhos com um ouvinte no document —
   "clicou fora do painel e fora do botão dele? feche". O clique sintético
   em btn.click() tem como alvo o próprio botão, então passa por esse teste.
   Mas o TOQUE ORIGINAL, no item da navegação, continuava subindo até o
   document logo depois; nesse instante o painel já estava aberto e o alvo
   era o item da navegação, que não é o botão isentado. Resultado: abria e
   fechava no mesmo toque, e a impressão era de botão morto. */
function mbAcionar(id, evento) {
  if (evento) evento.stopPropagation();
  const alvo = document.getElementById(id);
  if (!alvo) return;
  mbFecharFolha();
  alvo.click();
}

/* ── Navegação inferior ────────────────────────────────────────────── */
const MB_NAV = [
  { id: 'btn-new',      icone: 'mais',     chave: 'mobile.new',       rotulo: 'Nova',     primaria: true },
  { id: 'btn-crm-view', icone: 'clientes', chave: 'mobile.clients',   rotulo: 'Clientes' },
  { id: 'btn-social',   icone: 'amigos',   chave: 'mobile.friends',   rotulo: 'Amigos',   badge: 'social-badge' },
  { id: 'btn-events',   icone: 'eventos',  chave: 'mobile.events',    rotulo: 'Eventos',  badge: 'events-badge' },
  { id: '__mais',       icone: 'menu',     chave: 'mobile.more',      rotulo: 'Mais' },
];

function mbMontarNav() {
  if (document.getElementById('mb-nav')) return;

  const nav = document.createElement('nav');
  nav.id = 'mb-nav';
  nav.dataset.i18nAriaLabel = 'mobile.navLabel';
  nav.setAttribute('aria-label', mdMobileT('mobile.navLabel', 'Navegação principal'));

  MB_NAV.forEach(item => {
    // Não oferece caminho para algo que não existe nesta conta.
    if (item.id !== '__mais' && !document.getElementById(item.id)) return;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mb-nav-btn' + (item.primaria ? ' mb-primary' : '');
    b.dataset.alvo = item.id;
    b.dataset.i18nAriaLabel = item.chave;
    b.setAttribute('aria-label', mdMobileT(item.chave, item.rotulo));
    b.innerHTML =
      '<span class="mb-ico">' + mbSvg(item.icone) + '</span>' +
      '<span class="mb-lbl" data-i18n="' + item.chave + '">' +
        mdMobileT(item.chave, item.rotulo) +
      '</span>' +
      (item.badge ? '<span class="mb-badge" data-espelha="' + item.badge + '"></span>' : '');

    b.addEventListener('click', e => {
      e.stopPropagation();
      if (item.id === '__mais') mbAbrirFolha();
      else mbAcionar(item.id, e);
    });
    nav.appendChild(b);
  });

  document.body.appendChild(nav);
  mbEspelharBadges();
}

/* Os contadores de não-lidas vivem nos botões originais, que estão
   escondidos. Em vez de recontar (o que duplicaria a regra), observamos os
   originais e copiamos o que eles mostram. */
function mbEspelharBadges() {
  document.querySelectorAll('.mb-badge[data-espelha]').forEach(copia => {
    const orig = document.getElementById(copia.dataset.espelha);
    if (!orig) return;
    const sincronizar = () => {
      const visivel = getComputedStyle(orig).display !== 'none' && (orig.textContent || '').trim() !== '';
      copia.textContent = (orig.textContent || '').trim();
      copia.classList.toggle('on', visivel);
    };
    sincronizar();
    new MutationObserver(sincronizar).observe(orig, {
      childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'],
    });
  });
}

/* ── Folha "Mais" ──────────────────────────────────────────────────── */
const MB_SHEET = [
  { id: 't-pill-ws',    icone: 'ws',        chave: 'mobile.workspaces', rotulo: 'Workspaces' },
  { id: 'btn-wallpaper',icone: 'fundo',     chave: 'mobile.background', rotulo: 'Fundo' },
  { id: 'btn-shuffle',  icone: 'reorg',     chave: 'mobile.reorganize', rotulo: 'Reorganizar' },
  { id: 'btn-invite',   icone: 'convidar',  chave: 'mobile.invite',     rotulo: 'Convidar' },
  { id: 'btn-restore',  icone: 'restaurar', chave: 'mobile.restore',    rotulo: 'Restaurar' },
  { id: 'btn-admin',    icone: 'admin',     chave: 'mobile.admin',      rotulo: 'Admin' },
  { id: 'btn-clear',    icone: 'limpar',    chave: 'mobile.clear',      rotulo: 'Limpar tudo', perigo: true },
  { id: 'btn-exit',     icone: 'sair',      chave: 'mobile.exit',       rotulo: 'Sair',        perigo: true },
];

function mbAbrirFolha() {
  let bg = document.getElementById('mb-sheet-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'mb-sheet-bg';
    bg.innerHTML = '<div id="mb-sheet" role="dialog" data-i18n-aria-label="mobile.moreOptions" aria-label="' +
                     mdMobileT('mobile.moreOptions', 'Mais opções') + '">' +
                     '<div class="mb-grip"></div><div class="mb-sheet-grid"></div>' +
                   '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', e => { if (e.target === bg) mbFecharFolha(); });
  }

  // Remontada a cada abertura: Admin, Restaurar e o distintivo de Premium
  // aparecem e somem conforme o estado da conta.
  const grid = bg.querySelector('.mb-sheet-grid');
  grid.innerHTML = '';
  MB_SHEET.forEach(item => {
    const orig = document.getElementById(item.id);
    if (!orig) return;
    // Botão escondido pelo próprio app (Admin para quem não é admin,
    // Restaurar antes de existir o que restaurar) não entra na folha.
    if (orig.style.display === 'none') return;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mb-sheet-item' + (item.perigo ? ' danger' : '');
    const rotulo = item.id === 'btn-admin' && orig.dataset.mobileLabel
      ? orig.dataset.mobileLabel
      : mdMobileT(item.chave, item.rotulo);
    b.setAttribute('aria-label', rotulo);
    b.innerHTML = mbSvg(item.icone) + '<span>' + rotulo + '</span>';
    b.addEventListener('click', e => mbAcionar(item.id, e));
    grid.appendChild(b);
  });

  // Largura da coluna: só faz sentido no monitor vertical. No celular a
  // coluna é a tela inteira e não há o que ajustar.
  grid.parentElement.querySelector('.mb-sheet-larg')?.remove();
  if (mbIsPortraitDesktop()) grid.after(mbLinhaLargura());

  bg.classList.add('open');
}

function mbFecharFolha() {
  document.getElementById('mb-sheet-bg')?.classList.remove('open');
}

/* ── Botão de fechar nos painéis de tela cheia ─────────────────────────
   No desktop esses painéis fecham clicando fora. Em tela cheia não existe
   "fora", então sem um botão explícito a pessoa fica presa. */
const MB_PAINEIS = [
  { id: 'social-panel', fechar: () => document.getElementById('btn-social')?.click() },
  { id: 'events-panel', fechar: () => document.getElementById('btn-events')?.click() },
  { id: 'wp-panel',     fechar: () => document.getElementById('btn-wallpaper')?.click() },
  { id: 'pw-panel',     fechar: () => document.getElementById('t-pill-ws')?.click() },
];

function mbBotoesDeFechar() {
  MB_PAINEIS.forEach(p => {
    const el = document.getElementById(p.id);
    if (!el || el.querySelector('.mb-close')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mb-close';
    b.dataset.i18nAriaLabel = 'common.close';
    b.setAttribute('aria-label', mdMobileT('common.close', 'Fechar'));
    b.innerHTML = '&times;';
    b.addEventListener('click', e => { e.stopPropagation(); p.fechar(); });
    el.insertBefore(b, el.firstChild);
  });
}

/* ── Videochamada: minimizar e arrastar com o dedo ──────────────────────
   O arraste original escutava só 'mousedown', evento que o toque nunca
   dispara — daí não haver como tirar a janela do lugar no celular. Aqui
   usamos Pointer Events, que cobrem dedo, caneta e mouse num caminho só. */
function mbPrepararChamada() {
  const overlay = document.getElementById('call-overlay');
  if (!overlay || document.getElementById('call-btn-min')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'call-btn-min';
  btn.dataset.i18nTitle = 'mobile.minimize';
  btn.dataset.i18nAriaLabel = 'mobile.minimizeCall';
  btn.title = mdMobileT('mobile.minimize', 'Minimizar');
  btn.setAttribute('aria-label', mdMobileT('mobile.minimizeCall', 'Minimizar chamada'));
  btn.innerHTML = '&#8600;';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const min = overlay.classList.toggle('mb-min');
    btn.innerHTML = min ? '&#8599;' : '&#8600;';
    btn.dataset.i18nTitle = min ? 'mobile.maximize' : 'mobile.minimize';
    btn.title = min
      ? mdMobileT('mobile.maximize', 'Ampliar')
      : mdMobileT('mobile.minimize', 'Minimizar');
    if (min) {
      // Nasce no canto inferior direito, acima da navegação.
      overlay.style.left = Math.max(8, window.innerWidth - 158) + 'px';
      overlay.style.top  = Math.max(8, window.innerHeight - 290) + 'px';
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
    } else {
      overlay.style.left = overlay.style.top = overlay.style.right = overlay.style.bottom = '';
    }
  });
  overlay.appendChild(btn);

  // Arraste da janelinha — só vale quando minimizada e em tela pequena.
  let arraste = null;
  overlay.addEventListener('pointerdown', e => {
    if (!overlay.classList.contains('mb-min')) return;
    if (e.target.closest('button')) return;
    const r = overlay.getBoundingClientRect();
    arraste = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    overlay.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  overlay.addEventListener('pointermove', e => {
    if (!arraste) return;
    const x = Math.max(4, Math.min(window.innerWidth  - overlay.offsetWidth  - 4, e.clientX - arraste.dx));
    const y = Math.max(4, Math.min(window.innerHeight - overlay.offsetHeight - 4, e.clientY - arraste.dy));
    overlay.style.left = x + 'px';
    overlay.style.top  = y + 'px';
  });
  const soltar = e => {
    if (!arraste) return;
    arraste = null;
    try { overlay.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  overlay.addEventListener('pointerup', soltar);
  overlay.addEventListener('pointercancel', soltar);
}

/* ── Estado da aba ativa na navegação ──────────────────────────────── */
function mbMarcarAtivo() {
  const crmAberto = document.getElementById('crm-view')?.classList.contains('visible');
  document.querySelectorAll('.mb-nav-btn').forEach(b => {
    if (b.dataset.alvo === 'btn-crm-view') b.classList.toggle('active', !!crmAberto);
  });
}

/* ── Início ────────────────────────────────────────────────────────── */
function mbIniciar() {
  mbSincronizarViewport();
  if (!mbIsMobile()) return;
  if (!document.getElementById('toolbar')) return;
  mbMontarNav();
  mbBotoesDeFechar();
  mbPrepararChamada();
  mbMontarAlcaLargura();
}

window.addEventListener('DOMContentLoaded', () => {
  mbSincronizarViewport();
  // Antes de qualquer coisa aparecer: assim a coluna já nasce na largura
  // escolhida, em vez de nascer no padrão e pular.
  mbAplicarLargura(mbLarguraSalva(), false);
  mbIniciar();

  // A barra só existe depois do login: o app a mantém escondida até lá.
  // Observar o atributo style dela é o sinal mais direto de "entrou".
  const barra = document.getElementById('toolbar');
  if (barra) {
    new MutationObserver(() => {
      if (barra.style.display !== 'none') mbIniciar();
      mbMarcarAtivo();
    }).observe(barra, { attributes: true, attributeFilter: ['style'] });
  }

  const crm = document.getElementById('crm-view');
  if (crm) new MutationObserver(mbMarcarAtivo).observe(crm, { attributes: true, attributeFilter: ['class'] });
});

window.addEventListener('mydesk:languagechange', () => {
  window.MyDeskI18n?.translate?.(document.getElementById('mb-nav'));
  window.MyDeskI18n?.translate?.(document.getElementById('mb-sheet'));
  window.MyDeskI18n?.translate?.(document.querySelectorAll('.mb-close')[0]?.parentElement);
  window.MyDeskI18n?.translate?.(document.getElementById('mb-larg'));
  const min = document.getElementById('call-btn-min');
  if (min) window.MyDeskI18n?.translate?.(min);
  if (document.getElementById('mb-sheet-bg')?.classList.contains('open')) mbAbrirFolha();
});

// Girar o aparelho ou abrir o teclado muda a largura; se cruzou o ponto de
// corte para o celular, monta o que ainda não existe.
window.addEventListener('resize', () => {
  mbSincronizarViewport();
  if (mbIsMobile()) mbIniciar();
});
