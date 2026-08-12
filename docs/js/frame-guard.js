'use strict';
/* ═══════════════════════════════════════════════════════════════════
   PROTEÇÃO CONTRA CLICKJACKING NO GITHUB PAGES
   ═══════════════════════════════════════════════════════════════════
   `frame-ancestors` só vale em CABEÇALHO HTTP: a especificação da CSP manda
   ignorá-lo quando vem numa tag <meta>. O GitHub Pages não deixa definir
   cabeçalho, então a publicação de lá ficaria embutível num <iframe> — e um
   site hostil poderia sobrepor a interface e capturar cliques (o usuário
   pensa que clica numa coisa e clica em outra, dentro da sessão dele).

   Na Vercel o cabeçalho existe e resolve; isto aqui cobre o Pages: se a
   página perceber que não é a de cima, esconde o conteúdo e tenta assumir a
   janela. Carregar cedo importa — antes de qualquer coisa clicável aparecer.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.top === window.self) return;   // caso normal: nada a fazer

  // Esconde antes de tudo: mesmo que a navegação abaixo falhe (sandbox do
  // atacante pode bloquear), não há interface para ser clicada por engano.
  const esconder = () => {
    if (document.documentElement) document.documentElement.style.display = 'none';
  };
  esconder();
  document.addEventListener('DOMContentLoaded', esconder);

  try {
    window.top.location = window.self.location.href;   // sai do quadro
  } catch (_) {
    // Cross-origin impede ler/escrever o topo — o conteúdo segue escondido.
  }
  try { window.stop(); } catch (_) {}
})();
