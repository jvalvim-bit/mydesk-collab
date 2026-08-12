'use strict';
/* O plano Hobby da Vercel aceita no máximo 12 Serverless Functions por deploy,
   e cada arquivo em api/ conta como uma. Passar disso não falha só a API: o
   build inteiro é recusado, então nenhuma alteração sobe — nem as que não têm
   relação nenhuma com o servidor.

   O erro só aparece no deploy, depois do commit e do push. Este teste antecipa
   para antes. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');

/* 12 é o teto do plano; a margem existe porque quem adiciona a décima segunda
   função não recebe aviso nenhum antes de o build quebrar. */
const TETO_HOBBY = 12;

function funcoesDaApi(dir = path.join(RAIZ, 'api'), prefixo = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const nome = prefixo + item.name;
    if (item.isDirectory()) return funcoesDaApi(path.join(dir, item.name), nome + '/');
    return /\.(js|mjs|ts)$/.test(item.name) ? [nome] : [];
  });
}

test('api/ cabe no teto de Serverless Functions do plano Hobby', () => {
  const funcoes = funcoesDaApi();
  assert.ok(funcoes.length <= TETO_HOBBY,
    `api/ tem ${funcoes.length} funções e o teto é ${TETO_HOBBY}. ` +
    `O build inteiro é recusado acima disso. Junte rotas atrás de um roteador ` +
    `(ver api/admin.js) em vez de criar outro arquivo:\n  ` + funcoes.join('\n  '));
});

test('o roteador administrativo alcança todas as rotas que o painel chama', () => {
  const painel = fs.readFileSync(path.join(RAIZ, 'docs/admin/admin.js'), 'utf8');
  const roteador = fs.readFileSync(path.join(RAIZ, 'api/admin.js'), 'utf8');

  // O que o painel pede, o roteador precisa saber responder.
  const pedidas = new Set(Array.from(painel.matchAll(/chamarApi\(\s*'([^']+)'/g), m => m[1]));
  assert.ok(pedidas.size >= 4, 'o painel deixou de chamar as rotas administrativas');

  const proprias = new Set(['reports']);   // continua com endereço próprio em api/
  for (const rota of pedidas) {
    if (proprias.has(rota)) {
      assert.ok(fs.existsSync(path.join(RAIZ, 'api', rota + '.js')),
        `api/${rota}.js sumiu, e o painel ainda chama essa rota`);
      continue;
    }
    assert.ok(roteador.includes(`'${rota}'`),
      `o painel chama "${rota}" e o roteador não conhece essa rota`);
  }
});

test('cada rota do roteador aponta para um módulo que existe', () => {
  const roteador = fs.readFileSync(path.join(RAIZ, 'api/admin.js'), 'utf8');
  const modulos = Array.from(roteador.matchAll(/require\('(\.\.\/lib\/[^']+)'\)/g), m => m[1]);
  assert.ok(modulos.length >= 4, 'o roteador perdeu rotas');
  for (const m of modulos) {
    const alvo = path.join(RAIZ, 'api', m);
    assert.ok(fs.existsSync(alvo) || fs.existsSync(alvo + '.js'),
      `o roteador aponta para ${m}, que não existe — a rota responderia 500 em produção`);
  }
});

test('os endereços antigos continuam respondendo por rewrite', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const destinos = new Map((cfg.rewrites || []).map(r => [r.source, r.destination]));

  /* Sem isto, um painel ainda em cache chamaria /api/set-plan e receberia 404
     — a conta ficaria sem conceder Premium até o navegador buscar o js novo. */
  ['admin-users', 'set-plan', 'set-admin', 'delete-user'].forEach(rota => {
    assert.equal(destinos.get('/api/' + rota), '/api/admin?rota=' + rota,
      `/api/${rota} precisa continuar chegando ao roteador`);
  });
});
