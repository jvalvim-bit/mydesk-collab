'use strict';
/* Handlers que antes eram atributos on*= no HTML.
   Foram movidos para cá para o site poder rodar sob uma
   Content-Security-Policy sem 'unsafe-inline' em script-src:
   com o atributo inline, qualquer HTML injetado por um XSS viraria
   código executável. Gerado a partir do próprio HTML — o corpo de
   cada função é exatamente o que estava no atributo. */
const MD_HANDLERS = [
  ['l1', 'click', function (event) { goTo('login.html?mode=signin') }],
  ['l2', 'click', function (event) { goTo('login.html') }],
  ['l3', 'click', function (event) { goTo('login.html') }],
  ['l4', 'click', function (event) { document.getElementById('recursos').scrollIntoView({behavior:'smooth'}) }],
  ['l5', 'click', function (event) { this.classList.toggle('open') }],
  ['l6', 'click', function (event) { this.classList.toggle('open') }],
  ['l7', 'click', function (event) { this.classList.toggle('open') }],
  ['l8', 'click', function (event) { this.classList.toggle('open') }],
  ['l9', 'click', function (event) { this.classList.toggle('open') }],
  ['l10', 'click', function (event) { this.classList.toggle('open') }],
  ['l11', 'click', function (event) { this.classList.toggle('open') }],
  ['l12', 'click', function (event) { this.classList.toggle('open') }],
  ['l13', 'click', function (event) { this.classList.toggle('open') }],
  ['l14', 'click', function (event) { this.classList.toggle('open') }],
  ['l15', 'click', function (event) { goTo('login.html') }],
  ['l16', 'click', function (event) { goTo('login.html') }],
  // Leva a escolha do card anual até o modal de pagamento, do outro lado do login.
  ['l17', 'click', function (event) { try { sessionStorage.setItem('md_plano_pref', 'anual'); } catch (_) {} goTo('login.html') }],
  ['l17', 'click', function (event) { goTo('login.html') }],
  ['l18', 'click', function (event) { document.getElementById('recursos').scrollIntoView({behavior:'smooth'}) }],
  ['l19', 'click', function (event) { document.getElementById('precos').scrollIntoView({behavior:'smooth'}) }],
  ['l20', 'click', function (event) { document.getElementById('faq').scrollIntoView({behavior:'smooth'}) }],
  ['l21', 'click', function (event) { goTo('login.html?mode=signin') }],
  ['l22', 'click', function (event) { goTo('login.html') }],
];

document.addEventListener('DOMContentLoaded', () => {
  MD_HANDLERS.forEach(([id, evt, fn]) => {
    document.querySelectorAll('[data-h="' + id + '"]').forEach(el => el.addEventListener(evt, fn));
  });
});

/* Itens de FAQ novos não precisam entrar no mapa acima: todos abrem e fecham
   igual, então qualquer .faq-item sem data-h recebe o toggle automaticamente.
   (Com a CSP ativa, onclick="" no HTML não funciona mais.) */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.faq-item:not([data-h])').forEach(el => {
    el.addEventListener('click', function () { this.classList.toggle('open'); });
  });
});

/* ── O logo animado entra por cima do estático, e só se a transparência
      REALMENTE funcionar naquele navegador ──────────────────────────────
   O HTML traz o <img> de sempre. Isso não é preguiça: é o que garante que
   nenhum navegador mostre a caixa escura do vídeo, que nada pisque antes da
   hora e que não haja salto de layout enquanto o arquivo carrega.

   A TROCA É DECIDIDA POR MEDIÇÃO, não por nome de navegador. A primeira
   versão perguntava "é WebKit?", porque o Safari toca VP9 mas ignora o
   canal alfa. Palpite por user-agent erra nos dois sentidos: navegador novo
   que passou a suportar fica de fora, e navegador que finge ser outro entra
   e mostra a caixa. Aqui o primeiro quadro é desenhado num canvas e o pixel
   do canto é LIDO: se voltar opaco, o navegador ignorou a transparência e o
   logo estático fica. Não tem como errar — é o resultado real.

   O canto do quadro é área de fundo, sempre: o recorte deixa margem em
   volta do desenho justamente para a aura poder pulsar sem encostar.

   E quem pediu menos movimento no sistema não recebe nada disso: um neon
   piscando no topo da página é o que essa preferência existe para evitar. */
document.addEventListener('DOMContentLoaded', () => {
  const img = document.getElementById('hero-logo');
  if (!img) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const v = document.createElement('video');
  v.className = img.className;
  v.id = 'hero-logo-video';
  v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
  /* `muted` e `playsInline` não são enfeite: sem os dois o navegador recusa
     o autoplay, e o topo da página abriria com um quadro parado. */
  v.setAttribute('aria-label', img.alt || 'MyDesk');
  v.setAttribute('role', 'img');
  v.preload = 'auto';
  v.src = 'img/logo-animado-alfa.webm?v=3';

  const desistir = () => { v.removeAttribute('src'); v.load?.(); };

  v.addEventListener('error', desistir, { once: true });
  v.addEventListener('loadeddata', () => {
    let transparente = false;
    try {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      // Só o canto superior esquerdo do quadro, que é fundo em qualquer frame.
      ctx.drawImage(v, 0, 0, 8, 8, 0, 0, 8, 8);
      transparente = ctx.getImageData(0, 0, 4, 4).data
        .filter((_, i) => i % 4 === 3)      // só o canal alfa
        .every(a => a < 24);
    } catch (_) { transparente = false; }
    if (transparente) img.replaceWith(v);
    else desistir();                        // fica o PNG, sem caixa nenhuma
  }, { once: true });
});
