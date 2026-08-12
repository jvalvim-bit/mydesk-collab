const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'docs', 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'docs', 'css', 'main.css'), 'utf8');

function regras() {
  const raw = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
}

test('chat individual usa 5 MiB no Free e 10 MiB no Premium', () => {
  assert.match(app, /const CHAT_FILE_MAX_FREE\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(app, /const CHAT_FILE_MAX_PREMIUM\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(app,
    /function limiteArquivoChat\(\)[\s\S]*?return isPremium\(\)\s*\?\s*CHAT_FILE_MAX_PREMIUM\s*:\s*CHAT_FILE_MAX_FREE/);
});

test('clipe e arrastar passam pelo mesmo porteiro seguro', () => {
  assert.match(app,
    /function enviarArquivosChat\(friend, arquivos\)[\s\S]*?safeFileType\(f\)[\s\S]*?safeDataUrl\(e\.target\?\.result\)[\s\S]*?sendChatMessage\(friend/);
  assert.match(app,
    /#ch-file-' \+ friend[\s\S]*?enviarArquivosChat\(friend, this\.files\)/);
  assert.match(app,
    /function habilitarDropArquivosChat\(win, friend\)[\s\S]*?#ch-msgs-' \+ friend[\s\S]*?includes\('Files'\)[\s\S]*?addEventListener\('drop'[\s\S]*?enviarArquivosChat\(friend, e\.dataTransfer\.files\)/);
  assert.match(css, /\.chat-msgs\.drag-on\s*\{[\s\S]*?box-shadow:inset/);
});

test('regras do Firebase repetem o teto do chat sem ampliar grupos', () => {
  const r = regras().rules;
  const arquivo = r.chats.$chatKey.messages.$msgId.file;
  const dm = arquivo.data['.validate'];
  const grupo = r.groupChats.$groupId.messages.$msgId.file.$campo['.validate'];

  assert.equal(arquivo.$campo['.validate'], false);
  assert.match(arquivo['.validate'], /hasChildren\(\['name','sz','type','data'\]\)/);
  assert.match(dm, /beginsWith\('data:' \+ newData\.parent\(\)\.child\('type'\)\.val\(\) \+ ';base64,'\)/);
  assert.match(dm, /6990521/);
  assert.match(dm, /13981029/);
  assert.match(dm, /child\('plan'\)\.val\(\) === 'premium'/);
  assert.match(dm, /child\('planExpiresAt'\)\.val\(\) >= now/);
  assert.match(dm, /auth\.token\.admin === true/);
  assert.doesNotMatch(grupo, /14680064/);
});

test('imagem do chat abre visualizador com zoom, pan e atalhos', () => {
  for (const id of [
    'chat-lightbox', 'chat-lb-stage', 'chat-lb-img', 'chat-lb-zoom-out',
    'chat-lb-zoom-value', 'chat-lb-zoom-in', 'chat-lb-reset', 'chat-lb-close',
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(app, /const CHAT_IMAGE_ZOOM_MAX\s*=\s*5/);
  assert.match(app, /function abrirImagemChat\(src, nome = ''\)/);
  assert.match(app, /addEventListener\('wheel'[\s\S]*?deltaY/);
  assert.match(app, /addEventListener\('dblclick'/);
  assert.match(app, /addEventListener\('pointermove'/);
  assert.match(app, /e\.key === 'Escape'/);
  assert.match(app, /abrirImagemChat\(src, msg\.file\.name \|\| ''\)/);
  assert.match(css, /\.chat-lb-toolbar\s*\{/);
  assert.match(css, /\.chat-lb-stage\.can-pan/);
});

test('conversa aberta e expandida nao repete a mensagem em notificacao', () => {
  assert.match(app,
    /function conversaChatVisivel\(friend\)[\s\S]*?!!chat\?\.el\s*&&\s*!chat\.el\.classList\.contains\('minimized'\)/);
  assert.match(app, /if \(!conversaVisivel\) showChatNotif\(from, msg\)/);
  assert.match(app,
    /function showChatNotif\(from, msg\)[\s\S]*?fbGet\([\s\S]*?if \(conversaChatVisivel\(from\)\) return/);
});
