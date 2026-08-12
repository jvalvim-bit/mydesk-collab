'use strict';
/* ANEXOS QUE SOMEM DO QUADRO DE GRUPO.
   Ali os arquivos não moram dentro da nota: moram em
   `group_boards/{id}/files/{noteId}`, num nó próprio, para dois anexos
   simultâneos não sobrescreverem um ao outro. São dois ouvintes — um de notas,
   outro de arquivos — e nenhuma garantia de quem responde primeiro.

   O de arquivos costuma chegar antes. Quando chegava, a sincronização
   procurava a nota no array, não encontrava e desistia — e `child_added` não
   se repete. Os anexos daquela nota ficavam invisíveis pela sessão inteira,
   intactos no banco e ausentes da tela.

   O dado nunca se perdeu (salvar a nota não toca no nó de arquivos), mas para
   quem usa isso é indistinguível de anexo apagado. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

function recortar(assinatura, tamanho = 2500) {
  const i = app.indexOf(assinatura);
  assert.ok(i > -1, 'não encontrei: ' + assinatura);
  return app.slice(i, i + tamanho);
}

test('o evento de arquivo é guardado mesmo sem a nota estar montada', () => {
  const sync = recortar('const syncFilesForNote =', 700);
  const ondeGuarda = sync.indexOf('_filesWs[String(noteKey)]');
  const ondeDesiste = sync.indexOf('if (!n) return');
  assert.ok(ondeGuarda > -1, 'o espelho de arquivos sumiu da sincronização');
  assert.ok(ondeDesiste > -1, 'a guarda de nota ausente sumiu');
  assert.ok(ondeGuarda < ondeDesiste,
    'guardar precisa vir ANTES de desistir — senão o evento se perde para sempre');
});

test('nota que chega pelo ouvinte busca os anexos no espelho', () => {
  /* Era `files:[]`. Como o ouvinte de arquivos normalmente responde primeiro,
     a nota nascia sem anexo e ficava assim até alguém recarregar a página. */
  const child = recortar('child_added also fires for existing notes', 1700);
  assert.match(child, /files:_arquivosDaNota\(data\.id\)/,
    'a nota do ouvinte de grupo voltou a nascer com a lista de anexos vazia');
  /* Sem os comentários: o próprio comentário que explica o conserto cita
     `files: []` como o jeito antigo, e a varredura acusaria a si mesma. */
  const soCodigo = child.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/files:\s*\[\]/.test(soCodigo), 'sobrou um files:[] no caminho do grupo');
});

test('a carga em massa alimenta o mesmo espelho', () => {
  // Senão as duas fontes divergem e o resultado depende de quem chegou antes.
  const carga = recortar('async function loadGroupBoardNotes(', 2600);
  assert.match(carga, /_filesWs\[String\(noteId\)\]/,
    'a carga em massa deixou de alimentar o espelho de arquivos');
  assert.match(carga, /_arquivosDaNota\(r\.id\)/);
});

test('o espelho é limpo em todo lugar onde o de pastas é limpo', () => {
  /* Anexo de um quadro aparecendo em outro seria pior do que anexo sumido.
     As pastas já tinham essa disciplina; os arquivos passam a ter a mesma. */
  const pastas = (app.match(/_stackMetaWs = \{\}/g) || []).length;
  const arquivos = (app.match(/_filesWs = \{\}/g) || []).length;
  assert.ok(pastas > 3, 'a varredura perdeu a referência: poucos pontos de limpeza');
  assert.equal(arquivos, pastas,
    `${pastas} pontos limpam pastas e ${arquivos} limpam arquivos — um quadro vai vazar no outro`);
});

test('a declaração do espelho vem antes de qualquer USO em tempo de carga', () => {
  /* `let` tem zona morta: uma atribuição no topo do arquivo, fora de função,
     antes da declaração, derruba o app inteiro no carregamento — e nenhum
     `node --check` acusa, porque a sintaxe está correta. */
  const decl = app.indexOf('let _filesWs = {};');
  assert.ok(decl > -1, 'a declaração sumiu');
  const antes = app.slice(0, decl);
  // Uso dentro de função é legítimo: só roda depois. No topo, não.
  const linhasSoltas = antes.split('\n').filter(l =>
    /_filesWs/.test(l) && /^\S/.test(l));
  assert.deepEqual(linhasSoltas, [],
    'há atribuição a _filesWs fora de função antes da declaração');
});

test('a lista de workspaces pergunta em paralelo, não em fila indiana', () => {
  /* Ela abria e ficava em "Carregando…" por segundos: um await dentro do for
     dos grupos, outro dentro do for dos amigos, cada volta esperando a
     anterior. As perguntas são independentes — nenhuma resposta muda a
     pergunta seguinte. */
  const fn = recortar('async function montarListaWorkspaces(', 4200);
  assert.ok(!/for \(const g of grupos\)/.test(fn),
    'os grupos voltaram a ser consultados um de cada vez');
  assert.ok(!/for \(const amigo of Object\.keys/.test(fn),
    'os 1:1 voltaram a ser consultados um de cada vez');
  assert.match(fn, /Promise\.all\(\(grupos \|\| \[\]\)\.map/);
  assert.match(fn, /Promise\.all\(Object\.keys\(amigos\)\.map/);
  // E a janela pode ter sido fechada antes das respostas chegarem.
  assert.match(fn, /corpo\.isConnected/);
});

test('o painel mostra esqueleto, e conta o carregamento a quem não o vê', () => {
  const abre = recortar('function toggleListaWorkspaces(', 1800);
  assert.match(abre, /ws-skel/, 'o esqueleto sumiu');
  assert.match(abre, /aria-busy="true"/,
    'leitor de tela não enxerga barra cinza: o estado precisa ser anunciado');
  const monta = recortar('async function montarListaWorkspaces(', 4200);
  const ondeLimpa = monta.indexOf("removeAttribute('aria-busy')");
  assert.ok(ondeLimpa > -1, 'o aria-busy ficou ligado para sempre depois de carregar');
  /* Antes da saída por lista vazia: ela também termina o carregamento, e
     ficar de fora manteria "carregando" anunciado numa tela já pronta. */
  assert.ok(ondeLimpa < monta.indexOf('if (!itens.length)'),
    'a saída por "nenhum workspace" não desliga o aviso de carregando');
});

test('a animação respeita quem pediu menos movimento', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'docs', 'css', 'main.css'), 'utf8');
  assert.match(css, /@keyframes wsPopEntra/);
  assert.match(css, /@keyframes wsSkel/);
  const reduzido = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce){',
    css.indexOf('@keyframes wsItemEntra')));
  assert.match(reduzido.slice(0, 300), /\.ws-lista-pop,\.ws-lista-item\{animation:none/);
  assert.match(reduzido.slice(0, 300), /\.ws-skel\{animation:none/);
});

/* ── O TETO DE ANEXO É O DO BANCO, NÃO UMA ESCOLHA COMERCIAL ─────────────
   Medido contra o banco de produção em 02/08/2026: 10 MB de string passa,
   11 MB volta "value argument contains a string greater than 10485760 utf8
   bytes". O anexo é gravado em base64 dentro da nota, e base64 é ~4/3 do
   arquivo — logo o arquivo cru cabe até ~7,8 MB.

   O Premium prometia 25 MB. Um arquivo de 25 MB vira 34 MB de texto: a
   gravação era RECUSADA e ninguém olhava o erro. Um HTML de 13,2 MB aparecia
   anexado na tela e sumia no primeiro recarregamento. */

/* O teto deixou de ser um número redondo escrito à mão e passou a ser
   derivado da regra — 5 MB redondos recusavam um vídeo de 5,06 MB que cabia
   com folga. A varredura avalia a mesma conta que o app faz. */
function tetoPorArquivo() {
  const m = /const ANEXO_MAX_BYTES = ([^;]+);/.exec(app);
  assert.ok(m, 'ANEXO_MAX_BYTES sumiu');
  const valor = Function('"use strict";return (' + m[1] + ')')();
  assert.ok(Number.isInteger(valor) && valor > 0, 'ANEXO_MAX_BYTES não é número');
  return valor;
}

test('o teto por arquivo cabe no que o banco aceita, já em base64', () => {
  const LIMITE_REAL = 10485760;                 // medido, não deduzido
  const emBase64 = Math.ceil(tetoPorArquivo() / 3) * 4;
  assert.ok(emBase64 < LIMITE_REAL,
    `o teto vira ${(emBase64 / 1048576).toFixed(2)} MB em base64 e o banco recusa`);
  // E os dois planos usam o mesmo: o limite é do banco, que não sabe quem assina.
  assert.match(app, /const ANEXO_MAX_FREE\s*=\s*ANEXO_MAX_BYTES/);
  assert.match(app, /const ANEXO_MAX_PREM\s*=\s*ANEXO_MAX_BYTES/);
});

test('o dataURL é conferido antes de entrar, nos dois caminhos', () => {
  /* O teto por arquivo é calculado no tamanho cru e a codificação varia. A
     conferência sobre o texto que REALMENTE vai ser gravado mora dentro de
     `prepararAnexo`, que é o porteiro único: ele mede, tenta compactar quando
     não coube, e só devolve arquivo que o banco aceita. */
  assert.match(app, /function anexoCabeNoBanco\(/);
  assert.match(app, /async function prepararAnexo\(/);
  const porteiro = app.slice(app.indexOf('async function prepararAnexo('),
                             app.indexOf('async function urlParaBaixarAnexo('));
  assert.ok((porteiro.match(/anexoCabeNoBanco\(/g) || []).length >= 2,
    'o porteiro precisa medir o texto gravado antes E depois de compactar');

  const nota = app.slice(app.indexOf('function addFiles('), app.indexOf('function fIco('));
  assert.match(nota, /await prepararAnexo\(/,
    'o anexo de nota voltou a entrar sem passar pelo porteiro');
  const ficha = app.slice(app.indexOf("bg.querySelector('#crm-m-doc-file')"));
  assert.match(ficha.slice(0, 1800), /await prepararAnexo\(/,
    'o documento da ficha entra sem passar pelo porteiro');
});

test('compactar é a última tentativa, e só para o que comprime', () => {
  /* Medido em 02/08/2026: HTML 4,0x, CSS 5,1x, JS 3,5x — e PNG 1,0x, HTML com
     imagem embutida 1,3x. Gastar processamento com quem já nasce comprimido
     devolve o mesmo tamanho e atrasa o upload. */
  const porteiro = app.slice(app.indexOf('async function prepararAnexo('),
                             app.indexOf('async function urlParaBaixarAnexo('));
  const ondeCabe = porteiro.indexOf('tamanho <= limite');
  const ondeComprime = porteiro.indexOf('_gzip(');
  assert.ok(ondeCabe > -1 && ondeCabe < ondeComprime,
    'o que já cabia passou a ser compactado à toa — e perde prévia e leitura por IA');
  assert.match(porteiro, /_anexoJaComprimido\(/,
    'voltou a tentar gzip em PDF, imagem e vídeo');
  // Navegador sem CompressionStream não pode quebrar o upload.
  assert.match(porteiro, /typeof CompressionStream === 'undefined'/);
});

test('anexo compactado é desfeito antes de virar arquivo, e não finge ter prévia', () => {
  /* Baixar um .gz com nome de .html não abre em nada; e a prévia de um blob
     gzip é uma janela vazia. */
  assert.match(app, /async function urlParaBaixarAnexo\(/);
  const render = app.slice(app.indexOf('function renderFiles('), app.indexOf('function openViewer('));
  assert.match(render, /urlParaBaixarAnexo\(f\)/,
    'o download deixou de passar pelo caminho que desfaz a compactação');
  assert.match(render, /revokeObjectURL/, 'o endereço temporário fica vazando memória');
  /* E o conteúdo NÃO pode voltar para dentro do documento: o href recebia o
     dataURL inteiro, megabytes num atributo recriado a cada redesenho da
     lista, e era isso que deixava o cartão pesado para arrastar e rolar. */
  assert.ok(!/dlLink\.href = safeUrl/.test(render),
    'o arquivo voltou a ser escrito dentro do HTML da página');
  assert.match(render, /dlLink\.href = '#'/);
  const desfaz = app.slice(app.indexOf('async function urlParaBaixarAnexo('),
                           app.indexOf('async function urlParaBaixarAnexo(') + 900);
  assert.match(desfaz, /createObjectURL/,
    'o anexo comum voltou a devolver dataURL, que precisa ir para o atributo');

  const viewer = app.slice(app.indexOf('function openViewer('), app.indexOf('function openViewer(') + 900);
  assert.match(viewer, /f\.gz/, 'o visualizador voltou a tentar desenhar um blob compactado');

  // E a leitura por IA também sabe que não tem o que ler ali.
  const leitor = app.slice(app.indexOf('async function _textoDeDocumento('),
                           app.indexOf('async function _textoDeDocumento(') + 2200);
  assert.match(leitor, /doc\.gz/);
});

test('o que é anunciado é o que se consegue gravar', () => {
  /* Prometer 25 MB e recusar a gravação é pior do que prometer 7 e cumprir.
     A varredura pega o texto do plano em qualquer um dos três idiomas. */
  const i18n = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'i18n.js'), 'utf8');
  const landing = fs.readFileSync(path.join(RAIZ, 'docs', 'landing.html'), 'utf8');
  /* Arredondado para baixo: prometer menos do que se entrega é aceitável;
     o contrário é o que fez o Premium anunciar 25 MB e gravar zero. */
  const cabe = Math.floor(tetoPorArquivo() / 1048576);
  [['i18n.js', i18n], ['landing.html', landing], ['app.js', app]].forEach(([onde, txt]) => {
    const anunciados = [...txt.matchAll(/(\d+) MB[^"']{0,4}(?:·|&middot;)[^"']{0,30}1 GB/g)]
      .map(m => Number(m[1]));
    anunciados.forEach(v => assert.ok(v <= cabe,
      `${onde} anuncia anexo de ${v} MB e o código só grava ${cabe} MB`));
  });
});

/* ── A IDA E VOLTA NÃO PODE CORROMPER O ARQUIVO ──────────────────────────
   Compactar na subida e desfazer no download só vale se o que sai for byte a
   byte o que entrou. Um erro aqui não dá erro nenhum na tela: entrega um
   arquivo quebrado, que a pessoa só descobre ao tentar abrir. As quatro
   funções rodam de verdade, com os mesmos CompressionStream/atob/btoa que o
   navegador usa. */
const vm = require('node:vm');

/* Recorta preservando o `async` que vem ANTES da palavra `function`. Sem isso
   o recorte começa no meio de "async function" e a função extraída deixa de
   ser assíncrona — ou, se `async` for recolocado às cegas, funções síncronas
   passam a devolver Promise e a comparação de bytes falha por um motivo que
   nada tem a ver com a compactação. */
function recortarFn(nome) {
  let i = app.indexOf('function ' + nome + '(');
  assert.ok(i > -1, 'função não encontrada: ' + nome);
  if (app.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, j = app.indexOf('{', i);
  for (; j < app.length; j++) {
    if (app[j] === '{') prof++;
    else if (app[j] === '}') { prof--; if (!prof) break; }
  }
  return app.slice(i, j + 1);
}

const ctxGz = vm.createContext({
  Blob, Response, CompressionStream, DecompressionStream, Uint8Array, String,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
});
['_gzip', '_gunzip', '_bytesParaBase64', '_base64ParaBytes'].forEach(nome => {
  vm.runInContext(recortarFn(nome), ctxGz);
});

test('gzip e volta devolvem exatamente os mesmos bytes', async () => {
  const original = Buffer.from(
    '<html><body>' + 'Currículo da candidata — ação, coração, ç, ü. '.repeat(4000) + '</body></html>',
    'utf8');
  const bytes = new Uint8Array(original);

  const comprimido = await ctxGz._gzip(bytes);
  assert.ok(comprimido.length < bytes.length / 2,
    'texto repetitivo deveria comprimir bem; veio ' + comprimido.length);

  // O caminho completo: bytes → base64 → bytes → gunzip.
  const b64 = ctxGz._bytesParaBase64(comprimido);
  const devolta = await ctxGz._gunzip(ctxGz._base64ParaBytes(b64));
  assert.deepEqual(Buffer.from(devolta), original,
    'o arquivo voltou diferente do que entrou');
});

test('base64 de arquivo grande não estoura a pilha', async () => {
  /* `String.fromCharCode(...bytes)` com milhões de elementos derruba a aba.
     Por isso a conversão é feita em pedaços — 3 MB passa longe do limite de
     argumentos e é o tamanho típico de um anexo compactado. */
  const grandes = new Uint8Array(3 * 1024 * 1024);
  for (let i = 0; i < grandes.length; i++) grandes[i] = i % 251;
  const b64 = ctxGz._bytesParaBase64(grandes);
  assert.deepEqual(Buffer.from(ctxGz._base64ParaBytes(b64)), Buffer.from(grandes));
});

/* ── OS DOIS BUGS QUE A COMPRESSÃO SOZINHA NÃO RESOLVEU ──────────────────
   Relatados em 02/08/2026, um em seguida do outro:
   · o HTML de 13,2 MB foi RECUSADO pelo porteiro do plano, que media o
     tamanho cru e disparava antes de a compactação existir;
   · um HTML de 6 MB foi aceito, apareceu na tela e sumiu ao recarregar. Esse
     não era o Firebase: `saveNotesRaw` guardava as notas INTEIRAS no
     localStorage na PRIMEIRA linha, e a cota do navegador (~5 MB) fazia o
     setItem lançar antes de qualquer coisa chegar ao banco. */

test('o porteiro do plano deixa passar o que a compactação pode salvar', () => {
  const p = app.slice(app.indexOf('function podeSubirArquivo('),
                      app.indexOf('function podeSubirArquivo(') + 1800);
  assert.match(p, /_anexoJaComprimido\(f\.type, f\.name\)/,
    'o porteiro voltou a barrar pelo tamanho cru, sem perguntar se comprime');
  assert.match(p, /f\.size > ANEXO_MAX_BRUTO/,
    'sumiu o teto de leitura: um vídeo de 300 MB derruba a aba antes do aviso');
  /* A recusa por tamanho só vale junto com "não tem salvação". Sem esse E, o
     HTML de 13 MB volta a ser barrado antes de comprimir. */
  assert.match(p, /f\.size > porArquivo && semSalvacao/);
});

test('o cache local não leva anexo e não derruba a gravação', () => {
  const cache = app.slice(app.indexOf('function _cacheLocalNotas('),
                          app.indexOf('function saveNotesRaw('));
  assert.match(cache, /dataUrl: ''/,
    'o cache voltou a guardar o conteúdo dos arquivos e vai estourar a cota');
  assert.match(cache, /catch/,
    'falha de cache precisa morrer aqui: ela não pode impedir a gravação real');

  const salvar = app.slice(app.indexOf('function saveNotesRaw('),
                           app.indexOf('async function loadNotesRaw('));
  assert.match(salvar, /_cacheLocalNotas\(u, arr\)/);
  assert.ok(!/localStorage\.setItem/.test(salvar),
    'voltou a chamar setItem direto, fora da proteção');
  // E a falha de gravação precisa chegar à tela, não só ao console.
  assert.match(salvar, /app\.saveFailed/,
    'quadro que não salvou volta a falhar em silêncio');
});

test('a carga também usa o cache protegido', () => {
  const carga = app.slice(app.indexOf('async function loadNotesRaw('),
                          app.indexOf('async function loadNotesRaw(') + 900);
  assert.match(carga, /_cacheLocalNotas\(u, arr\)/,
    'a carga voltou a gravar o quadro inteiro no localStorage');
});

/* ── O APP E A REGRA DO BANCO TÊM DE CONCORDAR ───────────────────────────
   O limite que vale não é o do Realtime Database (10.485.760, medido), e sim
   o do database.rules.json deste projeto, que valida
   `newData.val().length <= 7340032` em TODO campo de anexo. Acima disso a
   escrita volta PERMISSION_DENIED.

   Foi o que derrubou o anexo de 6 MB: viram 8,4 MB em base64, passam no
   limite do banco e batem na regra. Aceitar no app o que a regra recusa
   produz sempre o mesmo sintoma — arquivo que aparece e some no
   recarregamento. */

test('o teto do app é o mesmo da regra, em todos os caminhos de anexo', () => {
  const regras = fs.readFileSync(path.join(RAIZ, 'database.rules.json'), 'utf8');
  /* Só os blocos "files", que são os anexos de NOTA — nos quatro quadros.
     O arquivo tem outros tetos, de outras coisas: anexo de chat (com faixa
     própria para Premium) e anexo de formulário público. Misturá-los faria a
     varredura comparar o app com a regra errada. */
  const tetos = [];
  let i = -1;
  while ((i = regras.indexOf('"files"', i + 1)) > -1) {
    const m = /length <= (\d{6,})/.exec(regras.slice(i, i + 400));
    if (m) tetos.push(Number(m[1]));
  }
  assert.ok(tetos.length >= 4,
    `esperava ao menos 4 caminhos de anexo de nota, achei ${tetos.length}`);
  const menor = Math.min(...tetos);

  const daRegra = /const REGRA_ANEXO_MAX = (\d+)/.exec(app);
  assert.ok(daRegra, 'o app perdeu a constante que espelha a regra');
  assert.equal(Number(daRegra[1]), menor,
    `a regra corta em ${menor} e o app acha que é ${daRegra[1]} — anexo vai voltar a sumir`);

  // E o teto por arquivo, já virado base64, tem de caber nesse número.
  const emBase64 = Math.ceil(tetoPorArquivo() / 3) * 4;
  assert.ok(emBase64 < menor,
    `o teto vira ${(emBase64 / 1048576).toFixed(2)} MB e a regra corta em ` +
    (menor / 1048576).toFixed(2) + ' MB');
  /* A conta do app parte do mesmo número da regra. Se alguém trocar a regra e
     esquecer aqui, o teto volta a aceitar o que o banco recusa. */
  assert.ok(app.includes('const ANEXO_MAX_BYTES = Math.floor((' + menor),
    'o teto por arquivo deixou de ser derivado do número da regra');
});

test('anexo que não gravou sai da tela, em vez de virar fantasma', () => {
  /* Mostrar o arquivo na lista enquanto a gravação foi recusada é o que fazia
     parecer que ele existia até o próximo carregamento. */
  const add = app.slice(app.indexOf('function addFiles('), app.indexOf('function fIco('));
  assert.match(add, /const desfazer = \(\)/, 'sumiu a remoção do anexo que não gravou');
  assert.match(add, /saveSharedNote\(n\)\.then/,
    'o 1:1 voltou a ignorar se a gravação deu certo');
  assert.match(add, /saveGroupNoteFile\([^)]*\)\.then/,
    'o grupo voltou a ignorar se a gravação deu certo');
  assert.match(add, /catch\(\(\) => desfazer\(\)\)/);

  // E as duas funções precisam RESPONDER se gravaram.
  const grupo = app.slice(app.indexOf('async function saveGroupNoteFile('),
                          app.indexOf('async function removeGroupNoteFile('));
  assert.match(grupo, /return false;[\s\S]*return true;/,
    'saveGroupNoteFile voltou a sair calada');
});

/* ── ARRASTAR NÃO PODE REESCREVER O QUADRO INTEIRO ───────────────────────
   `saveNotes` do quadro pessoal grava TODAS as notas num objeto só — é o que
   dá a semântica de exclusão, e por isso continua sendo o caminho de tudo que
   muda estrutura. Mas arrastar muda x, y e z de UMA nota: passando por ali,
   cada arrasto reenviava o base64 de todos os anexos de todas as notas. Com
   1,5 MB de anexo no quadro, soltar o cartão virava upload de megabytes e a
   nota "travava". */

test('soltar a nota grava só a posição, e não o quadro todo', () => {
  const fim = app.slice(app.indexOf('function endDrag('), app.indexOf('function _compactarZ('));
  assert.match(fim, /salvarPosicaoNota\(movida\)/,
    'o fim do arrasto voltou a chamar a gravação do quadro inteiro');

  const atalho = app.slice(app.indexOf('function salvarPosicaoNota('),
                           app.indexOf('function salvarPosicaoNota(') + 1400);
  assert.match(atalho, /fbUpdate\(/, 'o atalho precisa ser update, não set do quadro');
  assert.match(atalho, /\{ x: n\.x, y: n\.y, z: n\.z \}/,
    'o atalho passou a mandar mais do que a posição');
  /* `update` CRIA o nó se ele não existir: numa nota nunca gravada isso
     deixaria no banco um registro só com x, y e z — cartão em branco. */
  assert.match(atalho, /!n\._gravada/,
    'o atalho aceita nota que talvez não exista no banco');
  assert.match(atalho, /_activeGroupWs \|\| _activeWs/,
    'grupo e 1:1 já gravam nota a nota; o atalho não é deles');
  assert.match(atalho, /_notaDesteBoard\(n\)/,
    'sem essa guarda o atalho grava nota de outro quadro');

  // E a marca só é posta depois de uma gravação COMPLETA.
  const salva = app.slice(app.indexOf('function saveNotes()'),
                          app.indexOf('function saveNotes()') + 1800);
  assert.match(salva, /n\._gravada = true/);
  assert.ok(salva.indexOf('_noteToRaw(n)') < salva.indexOf('n._gravada = true'),
    'a marca precisa vir junto da gravação de verdade');
});

test('a marca de gravada não vaza para o banco', () => {
  /* `_noteToRaw` é lista branca. Se um dia virar cópia do objeto, `_gravada`
     iria junto — e uma nota restaurada de backup nasceria "já gravada". */
  const raw = app.slice(app.indexOf('function _noteToRaw('),
                        app.indexOf('function _noteToRaw(') + 1200);
  assert.ok(!/_gravada/.test(raw), '_gravada passou a ser gravado no banco');
  assert.ok(!/\.\.\.n\b/.test(raw), '_noteToRaw deixou de ser lista branca');
});

test('a marca de compactado sobrevive à gravação, nos dois serializadores', () => {
  /* Sem `gz` no banco, o arquivo volta parecendo normal: a prévia tenta
     desenhar um blob gzip e o download entrega um .gz com nome de .html. */
  assert.match(app, /function _arquivoParaRaw\(/);
  const serial = app.slice(app.indexOf('function _arquivoParaRaw('),
                           app.indexOf('function _noteToRaw('));
  assert.match(serial, /raw\.gz = true/);
  assert.match(serial, /raw\.sizeGz/);

  const raw = app.slice(app.indexOf('function _noteToRaw('),
                        app.indexOf('function _noteToRaw(') + 1200);
  assert.match(raw, /files:\(n\.files\|\|\[\]\)\.map\(_arquivoParaRaw\)/,
    'o quadro pessoal voltou a serializar anexo à mão e perde o gz');
  const collab = app.slice(app.indexOf('function _collabNotePayload('),
                           app.indexOf('function _collabNotePayload(') + 1400);
  assert.match(collab, /_arquivoParaRaw/,
    'o 1:1 voltou a serializar anexo à mão e perde o gz');
});

test('vídeo é aceito e tem prévia, e a prévia não passa pelo dataURL', () => {
  /* Aceitar vídeo sem prévia seria guardar 5 MB de algo que só se vê baixando
     — com um teto apertado, não valeria o espaço. E pôr o base64 no `src` de
     um <video> trava a aba: o navegador decodifica tudo antes do primeiro
     quadro e a barra de progresso não funciona, porque não há como buscar
     dentro de um dataURL. */
  const tipos = app.slice(app.indexOf('const ALLOWED_MIME_TYPES'),
                          app.indexOf('const BLOCKED_EXTENSIONS'));
  assert.match(tipos, /'video\/mp4'/, 'mp4 saiu da lista de tipos aceitos');

  const render = app.slice(app.indexOf('function renderViewerContent('),
                           app.indexOf('function renderViewerContent(') + 2000);
  assert.match(render, /t\.startsWith\('video\/'\)/, 'sumiu o ramo de vídeo');
  assert.match(render, /urlParaBaixarAnexo\(f\)/,
    'o player voltou a receber o dataURL em vez de um blob');
  assert.ok(!/video\.src = f\.dataUrl/.test(render));

  // E o blob volta quando o visualizador fecha, senão fica preso na memória.
  const fecha = app.slice(app.indexOf('function closeViewer('),
                          app.indexOf('function closeAllViewers('));
  assert.match(fecha, /revokeObjectURL/, 'o vídeo fica na memória depois de fechado');
  assert.match(fecha, /video\.pause\(\)/,
    'sem parar o player ele continua lendo um endereço que deixou de existir');
});
