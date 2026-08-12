'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   A FOTO DO CANDIDATO, DO CELULAR DELE ATÉ O CARTÃO DO FUNIL
   ═══════════════════════════════════════════════════════════════════════
   No MyDesk a foto de uma pessoa mora no IndexedDB de quem recruta, e nunca
   no banco: o registro viaja inteiro a cada leitura do quadro, e foi esse
   custo de download que tirou as fotos de lá.

   Só que quem se candidata não tem esse navegador. A resposta do formulário é
   o ÚNICO caminho da imagem até ela — então a foto passa pela resposta, fica
   lá, e é movida para o IndexedDB na primeira vez que a ficha é desenhada. O
   registro leva apenas um marcador dizendo que existe foto a buscar.

   O que este arquivo cobra é justamente o que se perde com facilidade: que a
   imagem NÃO entre no registro, que ela não barre uma candidatura, e que
   tirá-la fique tirado.
   ═══════════════════════════════════════════════════════════════════════ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'docs/js/app.js'), 'utf8');
const PUBLICO = fs.readFileSync(path.join(RAIZ, 'docs/js/formulario.js'), 'utf8');
const ENDPOINT = fs.readFileSync(path.join(RAIZ, 'api/form.js'), 'utf8');
const { clientFromResponse } = require('../lib/form-clients');

function recortar(fonte, nome, ate = '\n}') {
  const i = fonte.indexOf(nome);
  assert.ok(i > 0, 'sumiu: ' + nome);
  return fonte.slice(i, fonte.indexOf(ate, i) + ate.length);
}

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const form = { id: 'form_abc123', titulo: 'Vaga', campos: [
  { id: 'c1', tipo: 'texto', rotulo: 'Nome completo' },
] };

test('a ficha criada sozinha leva o MARCADOR da foto, nunca a imagem', () => {
  const comFoto = clientFromResponse(form, { valores: { c1: 'Ana' }, foto: FOTO }, 'r1');
  assert.equal(comFoto.fotoResposta, true);
  /* Base64 dentro do registro é exatamente o peso que a foto saiu do banco
     para evitar: o registro é lido inteiro a cada carga do quadro. */
  assert.equal(JSON.stringify(comFoto).includes('base64'), false,
    'a imagem entrou no registro e vai viajar a cada leitura do quadro');

  const semFoto = clientFromResponse(form, { valores: { c1: 'Ana' } }, 'r2');
  assert.equal(semFoto.fotoResposta, false,
    'sem marcador o app nem pergunta pela foto — falso aqui é o que evita a viagem');
});

test('o endpoint só aceita imagem, e só se o formulário pedir foto', () => {
  const corpo = ENDPOINT.slice(ENDPOINT.indexOf('const temCampoFoto'));
  const bloco = corpo.slice(0, corpo.indexOf('const resposta ='));
  assert.match(bloco, /c\.tipo === 'foto'/,
    'sem conferir a definição, qualquer POST gravaria uma foto');
  assert.match(bloco, /data:image\\\/\(jpeg\|png\|webp\)/,
    'um data: de outro tipo iria parar num img.src do outro lado');
  assert.match(bloco, /MAX_FOTO/, 'foto sem teto vira anexo disfarçado');
  assert.match(bloco, /codigo: 'fotogrande'/);
  assert.match(bloco, /codigo: 'foto'/);
  assert.match(ENDPOINT, /if \(foto\)\s+resposta\.foto = foto;/);

  // E ela não passa pela validação de campo: viaja fora de `valores`.
  const validador = recortar(ENDPOINT, 'function validarValores(');
  assert.match(validador, /c\.tipo === 'arquivo' \|\| c\.tipo === 'foto'/);
});

test('na página pública a foto é reduzida antes de sair do celular', () => {
  const corpo = recortar(PUBLICO, 'function reduzirFoto(');
  assert.match(corpo, /FOTO_LADO/);
  assert.match(corpo, /toDataURL\('image\/jpeg'/,
    'mandar o arquivo do celular como veio são megabytes para um círculo');
  assert.match(PUBLICO, /const FOTO_LADO = 128/);
  // Recorte quadrado a partir do centro: esticar deformaria o rosto.
  assert.match(corpo, /\(img\.width - lado\) \/ 2/);

  const envio = recortar(PUBLICO, 'async function submeter(');
  assert.match(envio, /valores, arquivo, foto/, 'a foto não está sendo enviada');
  assert.match(envio, /dataset\.tipo === 'foto'[\s\S]{0,220}continue/,
    'a foto não pode passar pela checagem de campo obrigatório');

  const monta = recortar(PUBLICO, 'function montarCampo(');
  assert.match(monta, /c\.obrigatorio && c\.tipo !== 'foto'/,
    'um required invisível travaria o envio sem nada na tela para consertar');
});

test('o app move a foto da resposta para o IndexedDB, uma vez só', () => {
  const corpo = recortar(APP, 'async function _fotoAdotarDaResposta(');
  assert.match(corpo, /rec\.fotoResposta/, 'sem marcador não se pergunta nada ao banco');
  assert.match(corpo, /forms\/' \+ fid \+ '\/respostas\/' \+ rid \+ '\/foto/,
    'ler a resposta inteira traria o currículo junto');
  assert.match(corpo, /_fotoSalvar\(rec\.id, url\)/, 'a foto tem de ficar no navegador');
  assert.match(corpo, /_fotosSemResposta/,
    'sem lembrar do que não achou, cada desenho do funil repetiria a leitura');

  // Os dois lugares que mostram foto passam a olhar também a resposta.
  assert.match(recortar(APP, 'async function pintarFotosDosCartoes('),
    /fotoDoRegistro\(id\)/);
  assert.match(APP, /fotoDoRegistro\(rec\.id\)\.then/,
    'a ficha aberta também precisa adotar a foto que chegou pelo formulário');
});

test('tirar a foto tem de ficar tirado', () => {
  /* Sem apagar o marcador, a foto que veio na resposta seria buscada de novo
     no próximo desenho do cartão e voltaria sozinha, sem explicação na tela. */
  assert.match(APP, /fotoResposta: _fotoAtual \? !!\(rec && rec\.fotoResposta\) : false/);

  // E o círculo do cartão volta a ser a inicial, em vez de manter o rosto.
  const pintar = recortar(APP, 'async function pintarFotosDosCartoes(');
  assert.match(pintar, /av\.dataset\.avInicial/,
    'sem guardar a inicial não há como desfazer a foto no cartão');
  assert.match(pintar, /classList\.remove\('rh-card-av-foto'\)/);
});

test('a importação manual leva a foto para a ficha', () => {
  const corpo = recortar(APP, 'function _crmDadosDaResposta(');
  assert.match(corpo, /resp\.foto/);
  assert.match(corpo, /dados\.photo = resp\.foto/,
    'o modal adota pelo mesmo campo que já usava para foto antiga');
});
