// api/admin.js — porta única das operações administrativas.
//
// O plano Hobby da Vercel aceita no máximo 12 Serverless Functions por deploy,
// e cada arquivo em api/ conta como uma. Com set-plan, set-admin, delete-user e
// admin-users separados o projeto chegou a 13 e o build passou a falhar inteiro
// — nenhuma alteração subia, mesmo as que não tinham relação com a API.
//
// Os quatro handlers continuam sendo os mesmos arquivos, apenas movidos para
// lib/ (que a Vercel não conta) e chamados a partir daqui. Nada da lógica de
// permissão mudou: cada um segue conferindo o próprio token e o próprio corpo,
// exatamente como quando respondia no seu endereço antigo.
const { aplicarCors } = require('../lib/cors');

const rotas = {
  'admin-users': require('../lib/admin-users'),
  'set-plan':    require('../lib/set-plan'),
  'set-admin':   require('../lib/set-admin'),
  'delete-user': require('../lib/delete-user'),
};

module.exports = async (req, res) => {
  /* O preflight vem sem corpo, então a rota ainda é desconhecida aqui. Ele
     precisa ser respondido ANTES de procurar a rota: caindo no 404 abaixo, a
     resposta sai sem cabeçalho de origem e o navegador nem chega a mandar o
     POST — o painel só mostra "Failed to fetch", sem status nem motivo. */
  aplicarCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // A rota vem no corpo (chamada nova) ou na query (rewrite dos endereços
  // antigos, que continuam valendo para quem tem o admin.js em cache).
  const bruta = (req.body && req.body.rota) || (req.query && req.query.rota) || '';
  const rota = String(bruta).trim();

  const handler = Object.prototype.hasOwnProperty.call(rotas, rota) ? rotas[rota] : null;
  if (!handler) {
    return res.status(404).json({ error: 'Rota administrativa desconhecida: ' + (rota || '(vazia)') });
  }
  return handler(req, res);
};
