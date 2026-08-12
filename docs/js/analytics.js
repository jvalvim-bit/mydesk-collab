/* ═══════════════════════════════════════════════════════════════════
   MyDesk — camada única de métricas
   ═══════════════════════════════════════════════════════════════════
   Toda a página chama sempre a mesma função: mdTrack('evento', {...}).
   Trocar de provedor (ou desligar tudo) é mexer só no bloco CONFIG.

   GOOGLE ADS E CONSENTIMENTO
   ──────────────────────────
   A tag global do Google Ads é configurada pelo campo googleAdsId, e
   ela grava cookie de publicidade — por isso NÃO carrega sozinha. O
   aviso de consentimento aparece na primeira visita e a tag só entra
   na página depois do "Aceitar" (localStorage md_consent). Recusar não
   deixa resíduo a limpar: nada chegou a ser baixado.

   Quem revoga usa o botão "Gerenciar consentimento" da política de
   privacidade, ou window.MyDeskConsent.revoke() pelo console.

   COMO LIGAR ANALYTICS
   ────────────────────
   Umami (grátis no plano hobby, sem cookie → dispensa consentimento):
     1. crie o site em https://cloud.umami.is
     2. provider: 'umami' e cole o Website ID em umamiSiteId

   Plausible (pago, sem cookie → dispensa consentimento):
     provider: 'plausible' + plausibleDomain: 'jvalvim-bit.github.io'

   Google Analytics 4 (grava cookie → passa pela mesma trava do Ads):
     provider: 'ga4' + ga4Id: 'G-XXXXXXXXXX'

   Enquanto provider for 'none', nenhum serviço adicional de Analytics
   é carregado.

   Em localhost — e para quem pediu "Do Not Track" — nada é carregado,
   o aviso não aparece e os eventos só saem no console.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────
  const CONFIG = {
    googleAdsId:     '',

    provider:        'none', // 'none' | 'umami' | 'plausible' | 'ga4'
    umamiSiteId:     '',
    umamiSrc:        'https://cloud.umami.is/script.js',
    plausibleDomain: '',
    ga4Id:           '',

    respectDNT:      true // não rastreia quem pediu "Do Not Track"
  };
  // ──────────────────────────────────────────────────────────────────

  const isLocal =
    /^(localhost|127\.|\[::1\])/.test(location.hostname) ||
    location.protocol === 'file:';

  const dnt =
    CONFIG.respectDNT &&
    (
      navigator.doNotTrack === '1' ||
      window.doNotTrack === '1' ||
      navigator.msDoNotTrack === '1'
    );

  let ready = false;

  function loadScript(src, attrs) {
    const existingScript = document.querySelector(
      `script[src="${src}"]`
    );

    if (existingScript) {
      return existingScript;
    }

    const script = document.createElement('script');

    script.async = true;
    script.src = src;

    Object.entries(attrs || {}).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });

    script.onerror = () => {
      console.warn('[analytics] falhou ao carregar', src);
    };

    document.head.appendChild(script);

    return script;
  }

  /*
   * Inicializa a estrutura global do Google Tag.
   * Ela pode ser utilizada tanto pelo Google Ads quanto pelo GA4.
   */
  function initializeGoogleTag() {
    window.dataLayer = window.dataLayer || [];

    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };

    if (!window.__myDeskGoogleTagInitialized) {
      window.gtag('js', new Date());
      window.__myDeskGoogleTagInitialized = true;
    }
  }

  /*
   * Adiciona uma configuração ao Google Tag.
   * Aceita IDs do Google Ads, como AW-123456789,
   * e IDs do Google Analytics, como G-XXXXXXXXXX.
   */
  function configureGoogleTag(id) {
    if (!id) {
      return;
    }

    initializeGoogleTag();

    const googleTagScript = document.querySelector(
      'script[src*="googletagmanager.com/gtag/js"]'
    );

    if (!googleTagScript) {
      loadScript(
        'https://www.googletagmanager.com/gtag/js?id=' +
          encodeURIComponent(id)
      );
    }

    window.gtag('config', id);
  }

  /* ── Consentimento (LGPD) ─────────────────────────────────────────
     A tag do Google Ads grava cookie de publicidade, e cookie de
     publicidade depende de consentimento — não de aviso. Por isso ela
     não é carregada para depois ser "desligada": ela só entra na
     página depois do Aceitar. Recusar não deixa resíduo a limpar,
     porque nada chegou a ser baixado.

     Umami e Plausible ficam FORA da trava de propósito: medem sem
     cookie e sem identificador entre sites. Se um dia entrar aqui um
     provedor que grave cookie, ele passa a precisar da mesma trava.
     ───────────────────────────────────────────────────────────────── */
  const CONSENT_KEY = 'md_consent';

  /* Só se pede consentimento quando há algo a consentir. Com a tag
     vazia, o banner seria uma pergunta sem objeto. */
  function needsConsent() {
    return !!(
      CONFIG.googleAdsId ||
      (CONFIG.provider === 'ga4' && CONFIG.ga4Id)
    );
  }

  function readConsent() {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);

      return stored === 'granted' || stored === 'denied'
        ? stored
        : null;
    } catch {
      /*
       * Navegador com armazenamento bloqueado não guarda a decisão.
       * Sem onde registrar o "sim", ele não pode ser presumido.
       */
      return null;
    }
  }

  function writeConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /*
       * Silêncio: a decisão continua valendo para esta visita,
       * só não sobrevive a ela.
       */
    }
  }

  /* Tags do Google (Ads e GA4): gravam cookie, exigem consentimento. */
  function bootGoogleTag() {
    try {
      if (CONFIG.googleAdsId) {
        configureGoogleTag(CONFIG.googleAdsId);
      }

      if (CONFIG.provider === 'ga4' && CONFIG.ga4Id) {
        configureGoogleTag(CONFIG.ga4Id);
        ready = true;
      }
    } catch (error) {
      console.warn('[analytics] tag do Google falhou', error);
    }
  }

  /* Medição sem cookie: roda independente da decisão. */
  function bootCookieless() {
    try {
      if (CONFIG.provider === 'umami' && CONFIG.umamiSiteId) {
        loadScript(CONFIG.umamiSrc, {
          'data-website-id': CONFIG.umamiSiteId
        });

        ready = true;
      } else if (
        CONFIG.provider === 'plausible' &&
        CONFIG.plausibleDomain
      ) {
        loadScript(
          'https://plausible.io/js/script.js',
          {
            'data-domain': CONFIG.plausibleDomain
          }
        );

        window.plausible =
          window.plausible ||
          function () {
            window.plausible.q =
              window.plausible.q || [];

            window.plausible.q.push(arguments);
          };

        ready = true;
      }
    } catch (error) {
      console.warn('[analytics] boot falhou', error);
    }
  }

  function boot() {
    if (dnt || isLocal) {
      return;
    }

    bootCookieless();

    if (needsConsent() && readConsent() === 'granted') {
      bootGoogleTag();
    }
  }

  /*
   * Dispara um evento.
   * Nunca lança erro, porque métricas não podem quebrar a página.
   */
  function mdTrack(event, props) {
    props = props || {};

    if (isLocal || !ready) {
      if (isLocal) {
        console.info('[analytics]', event, props);
      }

      return;
    }

    try {
      if (
        CONFIG.provider === 'umami' &&
        window.umami
      ) {
        window.umami.track(event, props);
      } else if (
        CONFIG.provider === 'plausible' &&
        window.plausible
      ) {
        window.plausible(event, {
          props
        });
      } else if (
        CONFIG.provider === 'ga4' &&
        window.gtag
      ) {
        window.gtag('event', event, props);
      }
    } catch (error) {
      /*
       * Silêncio intencional:
       * métricas são secundárias e não podem interromper o site.
       */
    }
  }

  /*
   * Qualquer elemento com data-track="nome"
   * é acompanhado automaticamente.
   */
  function wireClicks() {
    document.addEventListener(
      'click',
      event => {
        const element = event.target.closest('[data-track]');

        if (!element) {
          return;
        }

        const properties = element.dataset.trackProps
          ? safeParse(element.dataset.trackProps)
          : {};

        mdTrack(
          element.dataset.track,
          properties
        );
      },
      {
        capture: true
      }
    );
  }

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  /*
   * Origem da visita por utm_source ou ref.
   * A origem fica guardada durante a sessão.
   */
  function captureSource() {
    try {
      const query = new URLSearchParams(location.search);

      const sourceValue =
        query.get('utm_source') ||
        query.get('ref');

      if (
        sourceValue &&
        !sessionStorage.getItem('md_src')
      ) {
        sessionStorage.setItem(
          'md_src',
          sourceValue.slice(0, 40)
        );
      }

      /*
       * Indicação por ?ref=@fulano.
       * O código fica salvo por até 30 dias.
       */
      const referralValue = query.get('ref');

      if (referralValue) {
        localStorage.setItem(
          'md_ref',
          JSON.stringify({
            code: referralValue.slice(0, 40),
            at: Date.now()
          })
        );
      }
    } catch (error) {
      /*
       * O navegador pode bloquear localStorage ou sessionStorage.
       */
    }
  }

  function source() {
    try {
      return (
        sessionStorage.getItem('md_src') ||
        'direto'
      );
    } catch {
      return 'direto';
    }
  }

  function referral() {
    try {
      const storedReferral = JSON.parse(
        localStorage.getItem('md_ref') ||
          'null'
      );

      if (
        !storedReferral ||
        !storedReferral.code
      ) {
        return '';
      }

      const thirtyDays =
        30 * 24 * 60 * 60 * 1000;

      if (
        Date.now() - storedReferral.at >
        thirtyDays
      ) {
        localStorage.removeItem('md_ref');
        return '';
      }

      return storedReferral.code;
    } catch {
      return '';
    }
  }

  /* ── O aviso na tela ──────────────────────────────────────────────
     Estilo embutido de propósito: este arquivo é carregado por quatro
     páginas com folhas diferentes (main.css, o CSS embutido da landing,
     legal.css), e o aviso precisa ser o mesmo nas quatro. Depender da
     folha da página deixaria o texto ilegível em alguma delas.

     Nada de on*= no markup: a CSP não tem 'unsafe-inline' em
     script-src e o clique seria recusado em silêncio.
     ───────────────────────────────────────────────────────────────── */
  const BANNER_ID = 'md-consent';
  const STYLE_ID = 'md-consent-style';

  const BANNER_CSS = `
#${BANNER_ID}{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;
  max-width:560px;margin:0 auto;padding:18px 20px;
  background:#0d0d12;color:#f0f0f0;
  border:1px solid rgba(255,255,255,.12);border-radius:16px;
  box-shadow:0 18px 50px rgba(0,0,0,.6);
  font-family:'Inter',system-ui,-apple-system,sans-serif;
  font-size:14px;line-height:1.55;
  animation:mdConsentIn .25s ease}
@keyframes mdConsentIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){#${BANNER_ID}{animation:none}}
#${BANNER_ID} h2{margin:0 0 6px;font-size:15px;font-weight:600;letter-spacing:-.01em}
#${BANNER_ID} p{margin:0 0 14px;color:rgba(240,240,240,.72)}
#${BANNER_ID} .md-consent-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#${BANNER_ID} button{font:inherit;font-weight:600;cursor:pointer;
  padding:9px 18px;border-radius:10px;border:1px solid transparent;
  transition:filter .15s ease,background .15s ease}
#${BANNER_ID} .md-consent-accept{background:#6366f1;color:#fff}
#${BANNER_ID} .md-consent-accept:hover{filter:brightness(1.12)}
#${BANNER_ID} .md-consent-reject{background:transparent;color:#f0f0f0;
  border-color:rgba(255,255,255,.18)}
#${BANNER_ID} .md-consent-reject:hover{background:rgba(255,255,255,.06)}
#${BANNER_ID} a{margin-left:auto;color:#a5b4fc;text-decoration:none;font-size:13px}
#${BANNER_ID} a:hover{text-decoration:underline}
#${BANNER_ID} :focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
@media(max-width:520px){
  #${BANNER_ID}{left:10px;right:10px;bottom:10px;padding:16px}
  #${BANNER_ID} .md-consent-actions{flex-direction:column;align-items:stretch}
  #${BANNER_ID} button{width:100%}
  #${BANNER_ID} a{margin:4px auto 0}
}`;

  /* Caminho da política a partir de qualquer página do site. */
  function privacyHref() {
    return location.pathname.includes('/admin/')
      ? '../privacidade.html'
      : 'privacidade.html';
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');

    style.id = STYLE_ID;
    style.textContent = BANNER_CSS;

    document.head.appendChild(style);
  }

  /*
   * O texto em português fica no próprio elemento e o data-i18n ao lado:
   * se o i18n estiver na página ele traduz, se não estiver o aviso
   * continua legível. Um banner que depende de outro arquivo para ter
   * texto é um banner que pode aparecer vazio.
   */
  function makeNode(tag, i18nKey, text, className) {
    const node = document.createElement(tag);

    node.setAttribute('data-i18n', i18nKey);
    node.textContent = text;

    if (className) {
      node.className = className;
    }

    return node;
  }

  function buildBanner() {
    const banner = document.createElement('section');

    banner.id = BANNER_ID;
    banner.setAttribute('role', 'region');
    banner.setAttribute('data-i18n-aria-label', 'consent.region');
    banner.setAttribute('aria-label', 'Aviso de consentimento');

    banner.appendChild(
      makeNode('h2', 'consent.title', 'Medição de anúncios')
    );

    banner.appendChild(
      makeNode(
        'p',
        'consent.text',
        'Usamos uma tag do Google Ads para saber quais anúncios trazem ' +
          'gente ao MyDesk. Ela grava cookies de publicidade no seu ' +
          'navegador. Nada disso é necessário para usar o app, e recusar ' +
          'não muda nada no que você vê.'
      )
    );

    const actions = document.createElement('div');

    actions.className = 'md-consent-actions';

    const accept = makeNode(
      'button', 'consent.accept', 'Aceitar', 'md-consent-accept'
    );

    const reject = makeNode(
      'button', 'consent.reject', 'Recusar', 'md-consent-reject'
    );

    accept.type = 'button';
    reject.type = 'button';

    accept.addEventListener('click', grantConsent);
    reject.addEventListener('click', denyConsent);

    const link = makeNode(
      'a', 'common.privacy', 'Política de Privacidade'
    );

    link.href = privacyHref();

    actions.appendChild(accept);
    actions.appendChild(reject);
    actions.appendChild(link);
    banner.appendChild(actions);

    return banner;
  }

  function showBanner() {
    if (!document.body || document.getElementById(BANNER_ID)) {
      return;
    }

    injectStyle();
    document.body.appendChild(buildBanner());
  }

  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);

    if (banner) {
      banner.remove();
    }
  }

  function grantConsent() {
    writeConsent('granted');
    hideBanner();

    if (!dnt && !isLocal) {
      bootGoogleTag();
    }
  }

  function denyConsent() {
    writeConsent('denied');
    hideBanner();
  }

  /*
   * Revogar tem de ser tão fácil quanto consentir (art. 8º, §5º da
   * LGPD). A tag já carregada não se descarrega da página: recarregar
   * é o único jeito de a revogação valer agora, e não só na próxima
   * visita.
   */
  function revokeConsent() {
    writeConsent('denied');
    location.reload();
  }

  /* Botão "Gerenciar consentimento" da política de privacidade. */
  function wireManageButton() {
    const button = document.getElementById('md-consent-manage');

    if (!button) {
      return;
    }

    button.addEventListener('click', () => {
      if (readConsent() === 'granted') {
        revokeConsent();
        return;
      }

      hideBanner();
      showBanner();
    });
  }

  function initConsent() {
    wireManageButton();

    if (isLocal || dnt || !needsConsent()) {
      return;
    }

    if (readConsent() === null) {
      showBanner();
    }
  }

  window.mdTrack = mdTrack;
  window.mdSource = source;
  window.mdRef = referral;

  window.MyDeskConsent = Object.freeze({
    get: readConsent,
    grant: grantConsent,
    deny: denyConsent,
    revoke: revokeConsent,
    open: showBanner,
    required: needsConsent
  });

  captureSource();
  boot();

  function onReady() {
    wireClicks();
    initConsent();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      onReady
    );
  } else {
    onReady();
  }
})();
