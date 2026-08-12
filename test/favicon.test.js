const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const publicPages = [
  'index.html',
  'landing.html',
  'login.html',
  'formulario.html',
  'privacidade.html',
  'termos.html',
];

test('todas as páginas públicas anunciam o favicon oficial em uma URL estável', () => {
  for (const page of publicPages) {
    const html = fs.readFileSync(path.join(root, 'docs', page), 'utf8');
    const iconLinks = html.match(/<link\b[^>]*\brel="icon"[^>]*>/gi) || [];

    /* A regra original era "exatamente um", escrita para matar o favicon em
       data: URI que o Google ignora. A intenção continua valendo, mas o número
       não: declarar vários tamanhos é prática comum e ajuda o rastreador de
       ícone, que exige múltiplo de 48px e usa /favicon.ico como reserva. O que
       se guarda agora é o que de fato importa — existe ícone, o oficial de
       96px está entre eles, nenhum é embutido na página e todos têm caminho
       absoluto. */
    assert.ok(iconLinks.length >= 1, `${page} não anuncia favicon nenhum`);
    assert.ok(
      iconLinks.some(l => /sizes="96x96" href="\/favicon-96x96\.png"/i.test(l)),
      `${page} deve apontar para o favicon oficial de 96 px`,
    );
    iconLinks.forEach(l => assert.doesNotMatch(l, /href="data:/i,
      `${page} tem favicon embutido em data: — o Google não usa esse formato`));
    iconLinks.forEach(l => assert.match(l, /href="\/[\w.-]+"/,
      `${page}: todo ícone precisa de caminho absoluto e estável`));
  }
});

test('o favicon do Google é quadrado, maior que 48 px e tem PNG válido', () => {
  const favicon = fs.readFileSync(path.join(root, 'docs', 'favicon-96x96.png'));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert.deepEqual(favicon.subarray(0, 8), pngSignature);
  assert.equal(favicon.readUInt32BE(16), 96);
  assert.equal(favicon.readUInt32BE(20), 96);
});

test('o manifesto referencia os ícones instaláveis existentes', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'docs', 'site.webmanifest'), 'utf8'),
  );

  for (const icon of manifest.icons) {
    assert.ok(
      fs.existsSync(path.join(root, 'docs', icon.src.replace(/^\//, ''))),
      `arquivo ${icon.src} deve existir`,
    );
  }
});
