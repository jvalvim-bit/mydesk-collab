// lib/cors.js — cabeçalhos de origem cruzada para as funções de api/.
//
// O site é servido pelo GitHub Pages e a API roda na Vercel: todo pedido do
// painel é cross-origin, então o navegador manda antes um preflight OPTIONS.
// Resposta sem estes cabeçalhos não chega ao JavaScript como erro HTTP — ela
// vira "Failed to fetch", que não diz nada sobre o que aconteceu.
const ORIGENS_PERMITIDAS = [
  'https://mydesk.social',            // domínio oficial do site
  'https://jvalvim-bit.github.io',    // publicação antiga do Pages, ainda em links soltos
  'https://mydesk-eta.vercel.app',
];

function aplicarCors(req, res) {
  const origem = req.headers.origin || '';
  if (ORIGENS_PERMITIDAS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { ORIGENS_PERMITIDAS, aplicarCors };
