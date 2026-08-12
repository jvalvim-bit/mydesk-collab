'use strict';
/* O filtro que decide se o que saiu de um anexo é texto de verdade.
   Sem ele, um PDF digitalizado devolvia meia dúzia de caracteres de OCR, a
   extração dizia "li" e esse resto ia para o modelo como se fosse o currículo
   — que então descrevia a pessoa como "erro de carregamento de sistema" e
   ainda podia receber uma NOTA calculada sobre lixo. E a tela não mostrava
   aviso nenhum, porque para o extrator a leitura tinha dado certo.

   A função é pura e vive no meio do app.js, que não carrega em Node. Ela é
   recortada do arquivo real e executada aqui: copiá-la para o teste faria a
   varredura passar enquanto o app usa outra régua. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'js', 'app.js'), 'utf8');

function recortar(nome, ate) {
  const i = APP.indexOf(nome);
  assert.ok(i > 0, 'sumiu do app.js: ' + nome);
  const j = APP.indexOf(ate, i);
  assert.ok(j > i, 'nao achei o fim de ' + nome);
  return APP.slice(i, j + ate.length);
}

/* `const` no topo de um script cria ligação léxica e NÃO vira propriedade do
   contexto — daí a linha que a exporta à mão. `function` vira sozinha. */
const contexto = vm.createContext({});
vm.runInContext(
  recortar('const ANEXO_MIN_CHARS =', ';') +
  '\nglobalThis.PISO = ANEXO_MIN_CHARS;\n' +
  recortar('function _pareceTexto(', '\n}'), contexto);
const pareceTexto = contexto._pareceTexto;

/* Um currículo curto, mas currículo. */
const CURRICULO = [
  'Ana Souza Ferreira',
  'Analista de dados pleno',
  'Experiencia profissional',
  'Empresa Alfa, analista de dados, de dois mil e vinte e dois ate hoje.',
  'Construcao de paineis, modelagem de dados e automacao de relatorios.',
  'Empresa Beta, estagiaria de inteligencia de mercado, dois anos.',
  'Formacao academica',
  'Bacharelado em Estatistica pela universidade federal, concluido.',
  'Ferramentas e idiomas',
  'Dominio de consultas, planilhas avancadas e visualizacao de dados.',
  'Ingles avancado, espanhol intermediario.',
].join('\n');

test('currículo de verdade passa', () => {
  assert.ok(CURRICULO.length > 200, 'o exemplo precisa ser realista');
  assert.equal(pareceTexto(CURRICULO), true);
});

test('resto de OCR não passa por currículo', () => {
  /* O caso real: PDF digitalizado que carrega numeração de página e a marca
     d'água de quem gerou o arquivo, e nada mais. */
  assert.equal(pareceTexto('1 / 2\n\nScanned by CamScanner'), false);
  assert.equal(pareceTexto('Pagina 1'), false);
  assert.equal(pareceTexto(''), false);
  assert.equal(pareceTexto(null), false);
});

test('base64 e binário não passam, por mais longos que sejam', () => {
  /* O caso que chega de verdade: arquivo cujo tipo foi lido errado e passou
     pelo ramo de texto puro. Sai comprido, cheio de letras — e sem um espaço. */
  const base64 = 'JVBERi0xLjcKJcfsj6IKNSAwIG9iago8PC9MZW5ndGgg'.repeat(20);
  assert.ok(base64.length > 400, 'o exemplo precisa ser longo, senao o teste e do tamanho');
  assert.equal(pareceTexto(base64), false);

  // O mesmo despejo com espaço entre os blocos: cai pelo tamanho das "palavras".
  assert.equal(pareceTexto('JVBERi0xLjcKJcfsj6IKNSAwIG9iago8PC9MZW5ndGgg '.repeat(20)), false);
});

test('texto longo sem palavras de verdade não passa', () => {
  /* Números e pontuação somam tamanho, mas não formam nada que se possa ler. */
  const numeros = '12/03 45,67 89-01 2 3 4 5 6 7 8 9 0 ; . , : ( ) '.repeat(20);
  assert.equal(pareceTexto(numeros), false);
});

test('o piso é declarado e é o de um currículo, não o de uma frase', () => {
  assert.ok(contexto.PISO >= 150, 'piso baixo demais deixa passar resto de OCR');
  assert.ok(contexto.PISO <= 400, 'piso alto demais recusa currículo curto de verdade');
});

test('acento não derruba a checagem', () => {
  /* A contagem de letras usa classe Unicode; com [a-z] o currículo em
     português seria julgado como se metade dele não fosse letra. */
  const comAcento = CURRICULO
    .replace(/Experiencia/g, 'Experiência')
    .replace(/Formacao/g, 'Formação')
    .replace(/academica/g, 'acadêmica')
    .replace(/Estatistica/g, 'Estatística')
    .replace(/Ingles/g, 'Inglês')
    .replace(/Dominio/g, 'Domínio');
  assert.equal(pareceTexto(comAcento), true);
});

test('a checagem não depende de o texto estar em português', () => {
  /* Currículo em inglês é caso comum em vaga de tecnologia, e reprovar por
     falta de acento seria recusar leitura de quem escreveu certo. */
  const ingles = [
    'Ana Souza Ferreira',
    'Mid level data analyst',
    'Professional experience',
    'Alfa Company, data analyst, from two thousand twenty two until today.',
    'Built dashboards, modelled data and automated reporting for the team.',
    'Beta Company, market intelligence intern for two years.',
    'Education',
    'Bachelor of Statistics at the federal university, completed.',
    'Tools and languages',
    'Advanced spreadsheets, query languages and data visualisation.',
  ].join('\n');
  assert.equal(pareceTexto(ingles), true);
});
