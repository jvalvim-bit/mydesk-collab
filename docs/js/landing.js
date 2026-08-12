'use strict';

/* Landing page — sem autenticação: reveal com stagger, parallax no
   hero e nav que reage ao scroll. O login/registro real vive em
   login.html. */

const mdLandingT = (key, fallback, vars) => (
  window.MyDeskI18n ? window.MyDeskI18n.t(key, vars, fallback) : fallback
);

function atualizarMetadadosIdioma() {
  const schemaNode = document.getElementById('landing-schema');
  if (!schemaNode) return;
  try {
    const schema = JSON.parse(schemaNode.textContent);
    schema.inLanguage = window.MyDeskI18n?.getLocale?.() || 'pt-BR';
    schema.description = mdLandingT(
      'landing.schemaDescription',
      'Workspace de notas com CRM financeiro, workspaces em grupo, chat e videochamada em tempo real.'
    );
    if (schema.offers?.[0]) schema.offers[0].name = mdLandingT('landing.freePlan', 'Gratuito');
    schemaNode.textContent = JSON.stringify(schema);
  } catch (_) {
    /* O JSON-LD original continua válido se uma extensão tiver alterado o nó. */
  }
}
atualizarMetadadosIdioma();
window.addEventListener('mydesk:languagechange', atualizarMetadadosIdioma);

/* Navegação com fade: some a página antes de trocar de URL — usado
   por todos os botões/links que levam ao login. */
function goTo(url) {
  document.body.classList.remove('page-ready');
  setTimeout(() => { window.location.href = url; }, 380);
}

/* Voltar pelo botão do navegador restaura a página do bfcache com o DOM
   exatamente como ficou — ou seja, SEM .page-ready, que o goTo() tira pra
   fazer o fade de saída. Como o DOMContentLoaded não dispara de novo nesse
   caso, a página voltava invisível (tela toda escura). pageshow dispara nos
   dois cenários: carregamento normal e restauração do bfcache. */
window.addEventListener('pageshow', () => {
  document.body.classList.add('page-ready');
});

window.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => document.body.classList.add('page-ready'));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Título do hero: cada palavra entra com leve movimento e depois fica
  // flutuando em onda continuamente (cada uma com uma fase diferente)
  const heroTitle = document.querySelector('.hero h1');
  if (heroTitle) {
    heroTitle.querySelectorAll('.word-in').forEach((w, i) => {
      w.style.transitionDelay = (i * 55) + 'ms';
    });
    heroTitle.querySelectorAll('.word-bob').forEach((w, i) => {
      w.style.animationDelay = (i * 55 + 850) + 'ms';
    });
    requestAnimationFrame(() => requestAnimationFrame(() => heroTitle.classList.add('words-in')));
  }

  // Escalona a entrada dos filhos diretos de .stagger (cards, steps, faq...)
  document.querySelectorAll('.stagger').forEach(group => {
    Array.from(group.children).forEach((child, i) => {
      child.style.transitionDelay = (i * 70) + 'ms';
    });
  });

  // Scroll reveal — .lp-reveal e .stagger entram com fade + slide sutil.
  // O gatilho é "encostou na tela" (threshold 0), não uma fração da área: as
  // seções são muito mais altas que a janela, e numa tela baixa ou com zoom
  // do Windows em 125/150% a fração exigida nunca era atingida — a seção
  // ficava presa em opacity:0, ou seja, invisível de vez.
  const revealEls = document.querySelectorAll('.lp-reveal, .stagger');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  // Daqui pra baixo é enfeite. Se algo falhar, o conteúdo já está revelado —
  // mas sem o try o erro subiria e mataria as partículas e o parallax juntos.
  try {

  // Nav: link ativo conforme a seção visível
  const navLinks = document.querySelectorAll('.nav-links a');
  if (navLinks.length) {
    const sections = Array.from(navLinks).map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const navIo = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const link = document.querySelector('.nav-links a[href="#' + entry.target.id + '"]');
        if (link) link.classList.toggle('active', entry.isIntersecting);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => navIo.observe(s));
  }

  // Nav ganha fundo mais forte assim que sai do topo
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    }, { passive: true });
  }

  // As partículas rodam em qualquer máquina — em movimento reduzido elas só
  // ficam mais lentas (initHeroParticles cuida disso). Antes eram cortadas
  // junto com o resto, e como o Windows liga esse modo por economia de
  // bateria, o herói aparecia sem nenhum sinal de vida em notebook.
  initHeroParticles(reduceMotion);

  // O parallax, esse sim, fica fora: é movimento colado no scroll, o tipo que
  // de fato causa enjoo em quem pediu menos movimento.
  if (reduceMotion) return;

  // O texto do hero some/encolhe suavemente conforme ele sai de vista
  const heroWrap = document.querySelector('.hero-wrap');
  const heroText = document.querySelector('.hero');
  if (heroWrap && heroText) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const heroH = heroWrap.offsetHeight || 1;
        const progress = Math.min(1, y / (heroH * 0.85));
        heroText.style.opacity   = String(1 - progress * 0.85);
        heroText.style.transform = 'translateY(' + (progress * 34) + 'px) scale(' + (1 - progress * 0.04) + ')';
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  } catch (_) { /* enfeite quebrou; a landing continua inteira e legível */ }
});

/* ── Partículas do hero — campo denso de pontos à deriva, com brilho
   sutil, na paleta da marca (branco/indigo/teal). Pausa quando o hero
   sai da tela pra não gastar CPU à toa. ── */
function initHeroParticles(calmo) {
  const canvas = document.getElementById('hero-particles');
  const wrap   = document.querySelector('.hero-wrap');
  if (!canvas || !wrap) return;
  // Em modo calmo os pontos ficam à deriva bem devagar: continua sendo um
  // fundo vivo, sem nada cruzando a tela.
  const VEL = calmo ? 0.3 : 1;
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ffffff', '#a5b4fc', '#818cf8', '#5eead4'];
  const DENSITY = 0.00014; // partículas por px² — dá umas 130-180 num hero típico
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  let running = false, rafId = null;

  function resize() {
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(60, Math.min(220, Math.round(W * H * DENSITY)));
    particles = Array.from({ length: count }, () => spawn());
  }
  function spawn() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.18 * VEL,
      vy: (Math.random() - 0.5) * 0.14 * VEL,
      r: Math.random() * 1.4 + 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
      speed: (0.4 + Math.random() * 0.8) * VEL,
      base: 0.25 + Math.random() * 0.55,
    };
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
      if (p.y < -4) p.y = H + 4; else if (p.y > H + 4) p.y = -4;
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.001 * p.speed + p.phase);
      ctx.globalAlpha = p.base * twinkle;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (running) rafId = requestAnimationFrame(draw);
  }
  function start() { if (running) return; running = true; rafId = requestAnimationFrame(draw); }
  function stop()  { running = false; if (rafId) cancelAnimationFrame(rafId); }

  resize();
  start();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? start() : stop());
    }, { threshold: 0 }).observe(wrap);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   TOUR EM VÍDEO
   Card flutuante que toca sozinho na primeira visita. Não é modal e não
   cobre a página de propósito: quem chegou para ler continua lendo.
   Depois de visto (ou fechado), só volta pelo botão no hero — repetir a
   cada visita seria irritante para quem já conhece.
   ═══════════════════════════════════════════════════════════════════ */
const TOUR_CHAVE = 'md_tour_visto';

window.addEventListener('DOMContentLoaded', () => {
  const card  = document.getElementById('tour');
  const video = document.getElementById('tour-video');
  if (!card || !video) return;

  const barra   = document.getElementById('tour-barra');
  const btnSom  = document.getElementById('tour-som');
  const btnAmp  = document.getElementById('tour-ampliar');
  const btnFim  = document.getElementById('tour-fechar');
  const btnVer  = document.getElementById('ver-tour');
  const traduzirControles = () => {
    const som = video.muted
      ? mdLandingT('landing.soundOn', 'Ativar som')
      : mdLandingT('landing.soundOff', 'Desativar som');
    const tamanho = card.classList.contains('grande')
      ? mdLandingT('landing.reduce', 'Reduzir')
      : mdLandingT('landing.expand', 'Ampliar');
    btnSom.title = som;
    btnSom.setAttribute('aria-label', som);
    btnAmp.title = tamanho;
    btnAmp.setAttribute('aria-label', tamanho);
    btnFim.title = mdLandingT('common.close', 'Fechar');
    btnFim.setAttribute('aria-label', mdLandingT('common.close', 'Fechar'));
  };
  traduzirControles();
  window.addEventListener('mydesk:languagechange', traduzirControles);

  const marcarVisto = () => { try { localStorage.setItem(TOUR_CHAVE, '1'); } catch (_) {} };
  const jaViu = () => { try { return localStorage.getItem(TOUR_CHAVE) === '1'; } catch (_) { return false; } };

  const fundo = document.getElementById('tour-fundo');

  const abrir = (origem) => {
    card.hidden = false;
    if (fundo) fundo.hidden = false;
    // Autoplay só é permitido sem som; o botão de som fica ali para quem quiser.
    video.muted = true;
    video.play().catch(() => { /* bloqueado: fica no pôster, com os controles */ });
    if (window.mdTrack) mdTrack('tour_abriu', { origem });
  };

  const fechar = () => {
    if (card.hidden) return;
    video.pause();
    card.hidden = true;
    if (fundo) fundo.hidden = true;
    card.classList.remove('grande');
    marcarVisto();
    if (window.mdTrack) mdTrack('tour_fechou', { segundos: Math.round(video.currentTime) });
  };

  btnFim.addEventListener('click', fechar);
  // Fechar clicando fora ou com Esc — ninguém deve ficar preso num vídeo.
  if (fundo) fundo.addEventListener('click', fechar);
  addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

  btnSom.addEventListener('click', () => {
    video.muted = !video.muted;
    btnSom.innerHTML = video.muted ? '&#128263;' : '&#128266;';
    btnSom.title = video.muted
      ? mdLandingT('landing.soundOn', 'Ativar som')
      : mdLandingT('landing.soundOff', 'Desativar som');
    btnSom.setAttribute('aria-label', btnSom.title);
    if (!video.paused) video.play().catch(() => {});
  });

  btnAmp.addEventListener('click', () => {
    const grande = card.classList.toggle('grande');
    btnAmp.title = grande
      ? mdLandingT('landing.reduce', 'Reduzir')
      : mdLandingT('landing.expand', 'Ampliar');
    btnAmp.setAttribute('aria-label', btnAmp.title);
  });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    barra.style.width = (video.currentTime / video.duration * 100) + '%';
  });

  video.addEventListener('ended', () => {
    marcarVisto();
    if (window.mdTrack) mdTrack('tour_fim');
  });

  if (btnVer) btnVer.addEventListener('click', () => {
    video.currentTime = 0;
    abrir('botao_hero');
  });

  // Primeira visita toca sozinho — exceto para quem pediu menos movimento.
  const menosMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!jaViu() && !menosMovimento) setTimeout(() => abrir('automatico'), 600);
});

/* ═══════════════════════════════════════════════════════════════════
   CANAL DE SUPORTE — botão flutuante
   Preencha `whatsapp` com o número (só dígitos, com DDI: 5511999999999)
   pra o botão virar WhatsApp. Deixando vazio, ele abre o e-mail.

   ESTÁ NO E-MAIL DE PROPÓSITO. O WhatsApp levava o contato para um número
   pessoal, e suporte por número pessoal não tem histórico, não se divide
   entre duas pessoas e não some quando o telefone troca de mão. O e-mail
   também é o endereço que o resto do produto já usa para falar com quem
   escreve. Para voltar ao WhatsApp, basta repor o número aqui.
   ═══════════════════════════════════════════════════════════════════ */
const SUPORTE = { whatsapp: '', email: 'mydesksocial@hotmail.com' };

/* Marca do WhatsApp em SVG — emoji não serve aqui: cada sistema desenha o
   seu, e nenhum é o símbolo da marca que a pessoa procura no rodapé. */
const ICONE_WHATSAPP =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.885 3.4"/></svg>';

/* Envelope em SVG, e não o emoji ✉️: cada sistema desenha o seu — no Windows
   ele sai chapado e azulado, no Android sai outro, e em fonte sem o glifo sai
   um retângulo vazio. Um traço desenhado aqui fica igual em todo lugar e
   acompanha a cor do botão, como o do WhatsApp já fazia. */
const ICONE_EMAIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="2" y="4" width="20" height="16" rx="2.5"/>' +
  '<path d="m2.6 6.4 8.2 5.9a2 2 0 0 0 2.4 0l8.2-5.9"/></svg>';

window.addEventListener('DOMContentLoaded', () => {
  const isWa = !!SUPORTE.whatsapp;
  const a = document.createElement('a');
  a.className = 'support-fab' + (isWa ? ' is-wa' : '');
  if (isWa) { a.target = '_blank'; a.rel = 'noopener'; }
  a.dataset.track = 'suporte_click';
  a.innerHTML = (isWa ? ICONE_WHATSAPP : ICONE_EMAIL) +
    '<b data-i18n="landing.talk">' + mdLandingT('landing.talk', 'Falar com a gente') + '</b>';
  const traduzirSuporte = () => {
    a.href = isWa
      ? 'https://wa.me/' + SUPORTE.whatsapp + '?text=' +
        encodeURIComponent(mdLandingT('landing.supportQuestion', 'Olá! Tenho uma dúvida sobre o MyDesk.'))
      : 'mailto:' + SUPORTE.email + '?subject=' +
        encodeURIComponent(mdLandingT('landing.supportSubject', 'Dúvida sobre o MyDesk'));
    a.setAttribute('aria-label', isWa
      ? mdLandingT('landing.whatsapp', 'Falar no WhatsApp')
      : mdLandingT('landing.email', 'Falar por e-mail'));
  };
  traduzirSuporte();
  window.addEventListener('mydesk:languagechange', traduzirSuporte);
  document.body.appendChild(a);
});

/* Métrica de visita da landing (no-op enquanto o provedor não é configurado) */
window.addEventListener('DOMContentLoaded', () => {
  if (window.mdTrack) mdTrack('landing_view', { origem: mdSource() });
});

/* ═══════════════════════════════════════════════════════════════════
   NOVIDADES POR E-MAIL — quem não vai criar conta hoje deixa o contato
   O e-mail vai para a função serverless /api/subscribe (Vercel), que
   grava no Realtime DB. Nada é enviado do navegador direto pro banco.
   ═══════════════════════════════════════════════════════════════════ */
const NEWS_API = window.MYDESK_API_BASE_URL || window.location.origin;

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('news-form');
  if (!form) return;
  const msg = document.getElementById('news-msg');
  const inp = document.getElementById('news-email');
  const btn = form.querySelector('button');

  const say = (text, cls) => { msg.textContent = text; msg.className = 'news-msg ' + (cls || ''); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = (inp.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      return say(mdLandingT('landing.badEmail', 'Confira o e-mail digitado.'), 'err');
    }

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = mdLandingT('common.sending', 'Enviando…');
    say('');

    try {
      const r = await fetch(NEWS_API + '/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          hp: document.getElementById('news-hp').value,
          origem: window.mdSource ? mdSource() : 'direto'
        })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      form.reset();
      say(mdLandingT('landing.newsOk', 'Pronto! Você entrou na lista. 💜'), 'ok');
      if (window.mdTrack) mdTrack('newsletter_ok', { origem: mdSource() });
    } catch (err) {
      say(mdLandingT(
        'landing.newsError',
        'Não deu certo agora. Tente de novo em instantes.'
      ), 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
});
