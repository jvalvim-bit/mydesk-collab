// api/ia.js — resumos gerados por IA (Gemini).
//
// POR QUE ISTO É UM ENDPOINT E NÃO UMA CHAMADA DO NAVEGADOR
// A chave da API do Gemini é uma credencial de verdade: quem a tem gasta a
// cota da conta e a fatura é sua. O docs/js/app.js é público — qualquer pessoa
// abre e copia o que estiver nele. Por isso a chave vive só na variável de
// ambiente da Vercel, e o navegador fala com esta função, que confere o token
// do Firebase antes de qualquer coisa.
//
// TETO POR USUÁRIO, desde o primeiro dia
// A camada gratuita do Gemini tem limite diário para o PROJETO inteiro, não
// por usuário. Sem teto, uma pessoa num laço queima a cota do dia e o recurso
// cai para todo mundo. O contador vive em users/{uid}/plan/iaUsedThisMonth,
// escrito apenas aqui — as regras do banco impedem o cliente de criar campo
// novo em /plan, então ele não tem como zerar o próprio contador.
const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { assertAiEnabled, assertSafeFirebaseEnvironment } = require('../lib/collab-safety');

/* O modelo é configurável por variável de ambiente de propósito: o Google
   aposenta modelo com frequência, e quando isso acontece a chamada volta 429
   sem dizer que o motivo é o modelo. Trocar por GEMINI_MODEL na Vercel resolve
   sem precisar de deploy de código.
   O padrão foi gemini-2.0-flash até 27/07/2026, quando descobrimos que ele foi
   descontinuado em 1º de junho e a cota gratuita dele já estava zerada. */
const MODELO = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const LIMITE_FREE = 8;      // resumos por mês no plano gratuito
const LIMITE_PREM = 150;    // no Premium
const MAX_ENTRADA = 60000;  // caracteres enviados ao modelo
const TRIAL_DIAS  = 7;      // igual ao TRIAL_DIAS do docs/js/app.js
/* Uma chamada travada não pode comer o orçamento inteiro da função e levar
   junto a chance de tentar o próximo modelo. 45s deixa margem dentro dos 60s
   configurados em vercel.json. */
const TIMEOUT_MS  = 45000;

/* "Acesso pleno" aqui significa o mesmo que no app: assinante OU conta dentro
   dos 7 primeiros dias. A data de criação vem do próprio Firebase Auth, que o
   usuário não reescreve — se viesse de um campo do banco, esticar o teste para
   sempre seria uma linha no console. */
async function dentroDoTeste(uid) {
  try {
    const criadoEm = (await getAuth().getUser(uid))?.metadata?.creationTime;
    const t = criadoEm ? Date.parse(criadoEm) : NaN;
    return !Number.isNaN(t) && Date.now() < t + TRIAL_DIAS * 86400000;
  } catch (e) {
    // Falha ao ler o Auth não pode virar acesso liberado por engano.
    console.warn('ia: teste não verificado', e.message);
    return false;
  }
}

async function dbGet(path) {
  const t = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${t}`);
  if (!r.ok) throw new Error(`DB GET ${path} ${r.status}`);
  return r.json();
}
async function dbPatch(path, valor) {
  const t = (await getApp().options.credential.getAccessToken()).access_token;
  const r = await fetch(`${process.env.FIREBASE_DATABASE_URL}/${path}.json?access_token=${t}`,
    { method: 'PATCH', body: JSON.stringify(valor) });
  if (!r.ok) throw new Error(`DB PATCH ${path} ${r.status}`);
}

const ALLOWED_ORIGINS = [
  'https://mydesk.social',
  'https://jvalvim-bit.github.io',
  'https://mydesk-eta.vercel.app',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function ensureFirebase() {
  assertSafeFirebaseEnvironment();
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   A CADEIA: QUANDO A COTA DE UM MODELO ACABA, TENTA O PRÓXIMO
   ═══════════════════════════════════════════════════════════════════════
   A camada gratuita do Gemini conta por PROJETO e por MODELO, e nos modelos
   em preview esse teto é minúsculo — na ordem de algumas dezenas de chamadas
   por dia para a conta inteira, não por usuário. Uma pessoa fazendo triagem
   de currículos à tarde derrubava o recurso para todo mundo até o dia
   seguinte, e a tela dizia apenas "tente daqui a pouco" — o que era falso: só
   voltaria na virada do dia no fuso do Pacífico.

   Em vez de uma chamada só, uma FILA de tentativas. O preview responde melhor
   e vai primeiro; quando ele recusa por cota (429) ou some do catálogo (404),
   a vez é do modelo estável, cuja cota diária gratuita é muito maior. A pessoa
   recebe o resumo em vez do erro, e a diferença de qualidade entre um flash e
   outro é pequena perto de não ter resposta nenhuma.

   POR QUE ISTO NÃO É "TENTAR DE NOVO": repetir a mesma chamada no mesmo modelo
   que acabou de dizer "acabou a cota" só gasta tempo. O que muda o resultado é
   trocar de modelo — e, se houver chave, trocar de PROVEDOR.

   Provedor além do Google é opcional e entra sozinho quando a chave existe na
   Vercel: sem GROQ_API_KEY ou OPENROUTER_API_KEY, a fila é só de Gemini e nada
   muda. Os dois falam o mesmo dialeto (o de /chat/completions), então um único
   tradutor serve para ambos. */

function _lista(valor) {
  return String(valor || '').split(',').map(s => s.trim()).filter(Boolean);
}

/* Modelo aposentado é o acidente mais comum aqui, e ele não avisa: a chamada
   volta 404 ou 429 sem dizer que o motivo é o modelo. Por isso a fila inteira
   é configurável por variável de ambiente — dá para consertar na Vercel, sem
   deploy de código. */
function _modelosGemini() {
  const daEnv = _lista(process.env.GEMINI_MODELOS);
  if (daEnv.length) return daEnv;
  return [...new Set([MODELO, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])];
}

function provedores() {
  const fila = [];
  if (process.env.GEMINI_API_KEY) {
    fila.push({ nome: 'gemini', chave: process.env.GEMINI_API_KEY, modelos: _modelosGemini() });
  }
  if (process.env.GROQ_API_KEY) {
    fila.push({
      nome: 'groq',
      chave: process.env.GROQ_API_KEY,
      url: 'https://api.groq.com/openai/v1/chat/completions',
      /* gpt-oss-120b e não llama-3.3-70b-versatile: a Groq aposentou o Llama
         em 17/06/2026 e aponta este como substituto. Nome de modelo grátis
         muda toda temporada — é para isso que GROQ_MODELOS existe. */
      modelos: _lista(process.env.GROQ_MODELOS).length
        ? _lista(process.env.GROQ_MODELOS)
        : ['openai/gpt-oss-120b'],
      /* 8.000 TOKENS POR MINUTO no plano gratuito — medido na própria conta,
         pelo cabeçalho x-ratelimit-limit-tokens. E o teto de SAÍDA conta
         dentro desses 8.000: pedir `max_tokens: 8000` para um "oi" já devolve
         413 antes de o modelo ver a pergunta. Foi o primeiro erro do teste.
         3.000 deixa espaço para uma entrada de porte razoável e ainda cabe
         resposta longa. */
      maxTokens: Number(process.env.GROQ_MAX_TOKENS) || 3000,
      /* ~20 mil caracteres ≈ 5 mil tokens. Acima disso a soma com a saída
         estoura o minuto e a chamada volta 413 — melhor pular e ir para o
         próximo da fila do que gastar a ida e voltar de mãos vazias. */
      maxEntrada: Number(process.env.GROQ_MAX_ENTRADA) || 20000,
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    fila.push({
      nome: 'openrouter',
      chave: process.env.OPENROUTER_API_KEY,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      modelos: _lista(process.env.OPENROUTER_MODELOS).length
        ? _lista(process.env.OPENROUTER_MODELOS)
        : ['meta-llama/llama-3.3-70b-instruct:free'],
    });
  }
  /* UM PROVEDOR QUALQUER, sem passar por aqui de novo.
     Groq e OpenRouter estão escritos acima porque foram os dois primeiros
     candidatos — mas a lista de quem oferece camada gratuita muda toda
     temporada, e cada um deles significaria outro `if` idêntico neste arquivo
     e outro deploy. Mistral, Cerebras, NVIDIA NIM, GitHub Models e o Workers
     AI da Cloudflare falam o MESMO dialeto (/chat/completions): o que muda
     entre eles é o endereço, a chave e o nome do modelo — três variáveis de
     ambiente. Sem modelo declarado o provedor não entra: uma fila que não sabe
     o que pedir só gastaria uma volta para receber 400. */
  const extraModelos = _lista(process.env.IA_EXTRA_MODELOS);
  if (process.env.IA_EXTRA_KEY && process.env.IA_EXTRA_URL && extraModelos.length) {
    fila.push({
      nome: String(process.env.IA_EXTRA_NOME || 'extra').slice(0, 40),
      chave: process.env.IA_EXTRA_KEY,
      url: process.env.IA_EXTRA_URL,
      modelos: extraModelos,
      maxTokens: Number(process.env.IA_EXTRA_MAX_TOKENS) || 0,
      maxEntrada: Number(process.env.IA_EXTRA_MAX_ENTRADA) || 0,
    });
  }
  return fila;
}

/* Vale tentar o PRÓXIMO modelo? Só quando o "não" foi do modelo, e não da
   conta: cota estourada (429), modelo que sumiu (404), pedido grande demais
   para o teto daquele provedor (413), serviço fora do ar (5xx). Chave errada
   (401/403) não melhora no modelo seguinte — insistir aí é gastar segundos
   para receber o mesmo não três vezes. */
function _vaiAdiante(status) {
  return status === 429 || status === 404 || status === 400 ||
         status === 413 || status >= 500;
}

async function _chamarGemini(prov, modelo, tarefa, entrada) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': prov.chave },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: tarefa.sistema }] },
        contents: [{ role: 'user', parts: [{ text: entrada }] }],
        generationConfig: {
          temperature: 0.2,
          /* 900 cortava a resposta no meio de uma frase. O Gemini 3 raciocina
             antes de responder, e esses tokens de raciocínio saem do MESMO
             teto — sobrava pouco para o texto final. O teto agora é folgado e
             o raciocínio, reduzido ao mínimo: resumir não exige deliberação,
             e menos raciocínio também deixa a resposta mais rápida. */
          maxOutputTokens: tarefa.maxTokens || 8000,   // analise detalhada precisa de espaco
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });

  if (!resp.ok) {
    return { ok: false, status: resp.status, detalhe: await resp.text().catch(() => '') };
  }
  const dados = await resp.json();
  const cand = dados.candidates?.[0];
  // O raciocínio do modelo vem em partes com thought:true — não é resposta e
  // não pode aparecer para a pessoa.
  const texto = (cand?.content?.parts || [])
    .filter(p => !p.thought)
    .map(p => p.text || '').join('').trim();
  return {
    ok: true,
    texto,
    // MAX_TOKENS aqui significa resposta cortada no meio.
    truncado: cand?.finishReason === 'MAX_TOKENS',
    // Conteúdo barrado pelo filtro do próprio modelo entra aqui.
    motivo: cand?.finishReason || dados.promptFeedback?.blockReason || '',
  };
}

/* Groq e OpenRouter falam o dialeto do /chat/completions, que separa a
   instrução de sistema da mensagem do usuário do mesmo jeito que o Gemini —
   só com outros nomes. A garantia que importa continua valendo: o texto da
   pessoa entra como conteúdo, nunca como instrução. */
async function _chamarCompativel(prov, modelo, tarefa, entrada) {
  const resp = await fetch(prov.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + prov.chave },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: modelo,
      temperature: 0.2,
      /* O menor entre o que a tarefa quer e o que o provedor aguenta. Provedor
         gratuito costuma contar o teto de saída dentro do limite por minuto —
         pedir folga que não existe faz a chamada ser recusada inteira. */
      max_tokens: Math.min(tarefa.maxTokens || 8000, prov.maxTokens || 8000),
      messages: [
        { role: 'system', content: tarefa.sistema },
        { role: 'user', content: entrada },
      ],
    }),
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, detalhe: await resp.text().catch(() => '') };
  }
  const dados = await resp.json();
  const escolha = dados.choices?.[0];
  return {
    ok: true,
    texto: String(escolha?.message?.content || '').trim(),
    truncado: escolha?.finish_reason === 'length',
    motivo: escolha?.finish_reason || '',
  };
}

/* Percorre a fila e devolve a primeira resposta que veio. `tentativas` guarda
   o que cada uma respondeu — é o que o administrador precisa ver quando tudo
   falha, e é a única pista de que um modelo foi aposentado. */
async function chamarCadeia(tarefa, entrada) {
  const tentativas = [];
  let soCota = true;
  let tentou = false;      // alguma chamada de verdade chegou a sair

  for (const prov of provedores()) {
    /* Entrada que não cabe no provedor nem chega a virar chamada. O 413 já é
       tratado como "vá para o próximo", mas descobrir isso pela recusa custa
       uma ida e volta e aparece no log como erro — quando na verdade é uma
       incompatibilidade conhecida de antemão. Pular é honesto e mais rápido.
       Note que isto NÃO derruba `soCota`: se o Gemini caiu por cota e a
       reserva foi pulada por tamanho, a causa que interessa a quem espera
       continua sendo a cota. */
    if (prov.maxEntrada && entrada.length > prov.maxEntrada) {
      tentativas.push(`${prov.nome} pulado: ${entrada.length} caracteres passam do teto de ${prov.maxEntrada}`);
      continue;
    }
    for (const modelo of prov.modelos) {
      let r;
      try {
        r = prov.url ? await _chamarCompativel(prov, modelo, tarefa, entrada)
                     : await _chamarGemini(prov, modelo, tarefa, entrada);
      } catch (e) {
        // Timeout e queda de rede caem aqui; contam como serviço fora do ar.
        r = { ok: false, status: 504, detalhe: e.name === 'TimeoutError' ? 'timeout' : e.message };
      }
      tentou = true;
      if (r.ok) return { ...r, provedor: prov.nome, modelo, tentativas };

      if (r.status !== 429) soCota = false;
      tentativas.push(`${prov.nome}/${modelo} ${r.status} ${String(r.detalhe || '').slice(0, 120)}`);
      console.error('ia:', prov.nome, modelo, r.status, String(r.detalhe || '').slice(0, 300));
      if (!_vaiAdiante(r.status)) break;      // problema da conta, não do modelo
    }
  }
  return { ok: false, tentativas, soCota: soCota && tentou };
}

/* As instruções ficam AQUI, no servidor, e não no navegador: se viessem do
   cliente, qualquer pessoa poderia mandar o modelo fazer outra coisa com a
   sua cota. O texto do usuário entra como conteúdo, nunca como instrução. */
const TAREFAS = {
  documento: {
    sistema:
      'Você analisa documentos para um profissional que precisa entender o conteúdo a fundo e decidir o que fazer. ' +
      'Responda em português do Brasil, sem markdown e sem símbolos de formatação. ' +
      'Use uma linha por rótulo, exatamente nesta ordem, omitindo os que não se aplicarem:\n' +
      '"Do que trata:" — em uma frase, a natureza e a finalidade do documento.\n' +
      '"Partes envolvidas:" — quem são e o papel de cada uma.\n' +
      '"Contexto:" — o que levou a este documento, quando isso estiver no texto.\n' +
      '"Pontos principais:" — desenvolva com detalhe: obrigações, condições, valores, ' +
      'cláusulas relevantes e os argumentos de cada lado. Seja completo, não superficial.\n' +
      '"Prazos e datas:" — todas as datas, com o que vence em cada uma.\n' +
      '"Valores e cálculos:" — quando houver números, REFAÇA as contas e mostre o resultado. ' +
      'Confira somas, parcelas, percentuais, multas e juros. Se um número do documento não fechar ' +
      'com a conta, aponte a divergência explicitamente com os dois valores.\n' +
      '"O que exige atenção:" — riscos, ambiguidades, cláusulas desfavoráveis, contradições ' +
      'internas, lacunas e qualquer coisa que possa gerar disputa depois.\n' +
      '"Possíveis encaminhamentos:" — o que costuma ser feito diante de um documento assim; ' +
      'apresente como caminhos possíveis, não como determinação.\n' +
      '"Perguntas em aberto:" — o que precisaria ser esclarecido ou verificado fora do documento.\n\n' +
      'Regras: baseie-se SOMENTE no documento. Onde faltar informação, escreva "não consta" — ' +
      'nunca preencha lacuna com suposição. Distinga sempre o que o documento afirma do que é ' +
      'leitura sua, usando "o documento afirma" ou "vale verificar". ' +
      'Em matéria jurídica, você organiza e sinaliza pontos de atenção; não afirme resultado de ' +
      'processo nem substitua a análise de um profissional habilitado — a decisão é de quem lê.',
    rotulo: 'análise de documento',
  },
  /* O PDF tem tratamento PRÓPRIO, e curto, de propósito. O .docx que ela abre
     aqui costuma ser peça que precisa ser lida a fundo; PDF é quase sempre
     material que chega de fora (edital, contrato de terceiro, laudo, boleto,
     apostila) e o que se quer dele é saber rápido do que trata e se exige
     alguma providência. Um relatório de dez seções sobre um PDF de 90 páginas
     não seria lido — e ainda gastaria uma das poucas chamadas do mês. */
  pdf: {
    sistema:
      'Você resume um PDF para alguém que precisa saber rápido do que ele trata, sem ler o arquivo inteiro. ' +
      'Responda em português do Brasil, sem markdown e sem símbolos de formatação. ' +
      'Seja BREVE: no máximo 12 linhas no total. Use os rótulos abaixo, nesta ordem, ' +
      'omitindo por completo os que não se aplicarem:\n' +
      '"Do que trata:" — uma frase, a natureza e a finalidade do documento.\n' +
      '"Pontos importantes:" — de 3 a 6 itens, um por linha, cada um começando com "- " ' +
      'e cabendo em uma frase curta. Só o que muda alguma decisão.\n' +
      '"Prazos e valores:" — apenas as datas e os números que importam, em uma linha cada. ' +
      'Não refaça contas.\n' +
      '"Atenção:" — no máximo dois pontos, só o que traz risco ou exige providência.\n\n' +
      'Regras: não desenvolva, não explique contexto, não repita o que já disse e não ' +
      'transcreva trechos. Baseie-se SOMENTE no PDF; onde faltar informação, escreva ' +
      '"não consta" — nunca preencha lacuna com suposição. ' +
      'Quem precisar da análise completa abre o documento; aqui o valor está em ser curto.',
    rotulo: 'pontos do PDF',
    // Resposta curta não precisa de teto largo, e teto menor também sai mais rápido.
    maxTokens: 2500,
  },
  /* TRIAGEM DE CURRÍCULOS
     A tarefa mais delicada deste arquivo, e a única cujo resultado toca a vida
     de alguém que não é usuário do MyDesk. Três coisas estão escritas aqui de
     propósito e não devem ser afrouxadas:

     1. O modelo compara candidato com VAGA, nunca candidato com candidato em
        termos pessoais. O que ele mede é evidência de requisito atendido.
     2. Característica protegida — idade, gênero, raça, estado civil, filhos,
        origem, aparência, foto — não entra na conta nem é mencionada. Currículo
        brasileiro costuma trazer essas informações sem que ninguém peça, e um
        ranqueador que as lê acaba reproduzindo o viés de quem escreveu a base
        em que foi treinado.
     3. Falta de informação é apontada como falta, e nunca preenchida por
        dedução. "Não consta experiência com X" é resposta; inventar que a
        pessoa provavelmente tem, não é.

     O texto sai como apoio de TRIAGEM. Quem decide contratação é quem lê — e a
     resposta diz isso à pessoa, em vez de deixar implícito. */
  /* TRIAGEM DE CURRÍCULOS
     A tarefa mais delicada deste arquivo, e a única cujo resultado toca a vida
     de alguém que não é usuário do MyDesk. Quatro coisas estão escritas aqui
     de propósito e não devem ser afrouxadas:

     1. O modelo compara candidato com VAGA, nunca candidato com candidato em
        termos pessoais. O que ele mede é evidência de requisito atendido.
     2. Característica protegida — idade, gênero, raça, estado civil, filhos,
        origem, aparência, foto — não entra na conta nem é mencionada. Currículo
        brasileiro costuma trazer essas informações sem que ninguém peça, e um
        ranqueador que as lê acaba reproduzindo o viés de quem escreveu a base
        em que foi treinado.
     3. Falta de informação é apontada como falta, e nunca preenchida por
        dedução. "Não consta experiência com X" é resposta; inventar que a
        pessoa provavelmente tem, não é.
     4. A NOTA DE 0 A 100 só existe quando houve currículo lido. Número tem
        autoridade que texto não tem — quem vê "72" acredita nele —, então ele
        não pode sair de ficha em branco nem de arquivo que não abriu. Sem
        currículo, o campo é "sem nota", com o motivo. E a nota mede aderência
        aos requisitos DECLARADOS da vaga, não a pessoa: se os requisitos não
        foram informados, ela vale pouco e o texto tem de dizer isso.

     O texto sai como apoio de TRIAGEM. Quem decide contratação é quem lê — e a
     resposta diz isso à pessoa, em vez de deixar implícito. */
  curriculos: {
    sistema:
      'Você apoia a triagem de candidatos para uma vaga, lendo currículos e fichas de inscrição. ' +
      'Responda em português do Brasil, sem markdown e sem símbolos de formatação.\n\n' +
      'ESTRUTURA DA RESPOSTA\n' +
      'Linha 1: "Vaga:" e o cargo.\n' +
      'Linha 2: "Requisitos considerados:" e, em uma linha, o que a vaga exige segundo o que foi ' +
      'informado. Se a descrição for vaga ou ausente, diga isso e avise que sem requisitos claros ' +
      'as notas valem pouco e servem só como leitura geral.\n' +
      'Depois, os candidatos, do mais aderente ao menos aderente.\n' +
      'A lista tem de conter TODOS os candidatos enviados: um bloco recebido, uma entrada na ' +
      'resposta. Cada bloco chega numerado como "CANDIDATO N DE TOTAL" — responda com exatamente ' +
      'TOTAL entradas. Dois candidatos com o mesmo nome, ou com currículos idênticos, são DUAS ' +
      'pessoas: recebem duas entradas, com a mesma nota se for o caso. Nunca funda, resuma nem ' +
      'omita um deles, e nunca diga que são a mesma pessoa — quem se inscreveu duas vezes tem ' +
      'duas inscrições, e é quem contrata que decide o que fazer com isso.\n' +
      'Para cada candidato, nesta ordem:\n' +
      /* O NOME É DADO, NÃO LIDO. O currículo traz o nome completo da pessoa e
         o modelo o usava no lugar do que está cadastrado — uma ficha gravada
         como "Sem nome", porque o formulário da vaga não perguntou nome,
         voltava do relatório com um nome que ninguém digitou e que não batia
         com o funil ao lado. E o N é o número do BLOCO: renumerar por ranking
         desfaz a única amarração que existe entre a resposta e a ficha. */
      '  "N. Nome" — N é o número do BLOCO recebido ("CANDIDATO N DE TOTAL"), e não a ' +
      'posição no ranking: mantenha o número que veio, mesmo respondendo fora de ordem. ' +
      'O nome é EXATAMENTE o que veio escrito no cabeçalho daquele bloco, copiado letra por ' +
      'letra — inclusive quando for "Sem nome". Nunca use um nome lido dentro do currículo, ' +
      'nem complete, corrija ou acrescente sobrenome. Não escreva nada além do nome nessa ' +
      'linha.\n' +
      '  "Nota: NN/100" — inteiro de 0 a 100, APENAS quando houve currículo lido. Quando o ' +
      'currículo não foi lido, escreva exatamente "Nota: sem nota" e nada mais nessa linha.\n' +
      '  "Por quê:" — em uma frase, o que a nota está medindo neste caso.\n' +
      '  linhas começando com "+ " para o que aproxima da vaga, citando o que está escrito no ' +
      'currículo ou na ficha (anos de experiência, ferramenta, formação, entrega concreta).\n' +
      '  linhas começando com "- " para o que afasta ou não foi comprovado.\n' +
      '  "Falta saber:" com o que não consta e precisaria ser perguntado.\n' +
      'Termine com "Como usar:" em uma linha, lembrando que isto é triagem e que a decisão, a ' +
      'entrevista e a verificação são de quem contrata.\n\n' +
      'COMO CALCULAR A NOTA\n' +
      'A nota mede aderência aos requisitos declarados da vaga, e nada além disso. Distribua o ' +
      'peso entre: experiência comprovada na função, domínio das ferramentas e tecnologias ' +
      'pedidas, formação exigida, e evidência de entrega concreta. Faixas: 85 a 100 atende a ' +
      'todos os requisitos com folga; 70 a 84 atende ao essencial; 50 a 69 atende em parte, com ' +
      'lacunas relevantes; 25 a 49 pouca aderência; 0 a 24 outra área. ' +
      'Requisito que o currículo não menciona conta como NÃO atendido, e isso aparece na linha ' +
      '"Falta saber" — nunca suponha que a pessoa tem e esqueceu de escrever. ' +
      'Duas notas iguais são aceitáveis: não invente diferença para desempatar.\n\n' +
      'REGRAS INEGOCIÁVEIS\n' +
      'Baseie-se SOMENTE no que está no currículo e na ficha. Onde faltar informação, escreva ' +
      '"não consta" — nunca deduza, nunca complete, nunca estime.\n' +
      'IGNORE por completo, e não mencione em nenhuma hipótese: idade, data de nascimento, ' +
      'gênero, raça, cor, estado civil, filhos, religião, orientação sexual, nacionalidade, ' +
      'cidade de origem, bairro, aparência, foto e nome de instituição usado como sinal de ' +
      'prestígio social. Nada disso mede capacidade de fazer o trabalho, e usar qualquer um ' +
      'deles é discriminação. Se um currículo trouxer essas informações, passe por cima delas.\n' +
      'Não recomende contratar, eliminar ou descartar ninguém. Você ordena por aderência ' +
      'declarada e aponta o que verificar; a decisão não é sua.\n' +
      'Candidato cujo currículo não pôde ser lido entra na lista com "Nota: sem nota", com o que ' +
      'houver na ficha e com o motivo exato que veio escrito no bloco dele (arquivo digitalizado, ' +
      'formato não suportado, nenhum anexo) — não o deixe de fora em silêncio, e não o penalize ' +
      'como se fosse falta de qualificação: é falta de leitura, não de competência.',
    rotulo: 'triagem de currículos',
    /* Exclusiva do Premium, e a trava tem de estar AQUI. A aba Clientes já
       exige acesso pleno para abrir, mas isso é o navegador dizendo não para
       si mesmo: docs/js/app.js é público, qualquer pessoa lê o nome da tarefa
       e chama /api/ia direto com o próprio token. Sem esta linha, uma conta
       gratuita analisaria currículos gastando a cota de 8 do mês. */
    premium: true,
  },
  semana: {
    sistema:
      'Você organiza o panorama da semana de quem usa um aplicativo de notas. ' +
      'Responda em português do Brasil, direto, sem markdown e sem saudação. ' +
      'Em até 6 linhas, cada uma começando por um rótulo: ' +
      '"Em andamento:", "Parado há mais tempo:", "Vencendo:", "Sugestão:". ' +
      'Baseie-se apenas nas notas fornecidas. Se não houver dado para um rótulo, omita a linha inteira.',
    rotulo: 'resumo da semana',
  },
};

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  try {
    assertAiEnabled();
  } catch (error) {
    return res.status(error.statusCode || 503).json({ error: error.message });
  }

  if (!provedores().length) {
    return res.status(503).json({ error: 'O recurso de IA ainda não foi configurado.' });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Não autenticado' });

  let quem;
  try {
    ensureFirebase();
    quem = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const tarefa = TAREFAS[body.tarefa];
  if (!tarefa) return res.status(400).json({ error: 'Tarefa desconhecida' });

  const texto = String(body.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Nada para resumir.' });
  if (texto.length < 120) return res.status(400).json({ error: 'O conteúdo é curto demais para valer um resumo.' });

  try {
    // ── Teto do plano ──
    const plano = await dbGet(`users/${quem.uid}/plan`).catch(() => null) || {};
    const ehPremium = plano.plan === 'premium' &&
      (!plano.planExpiresAt || Date.now() < Number(plano.planExpiresAt));
    const limite = quem.admin === true ? Infinity : (ehPremium ? LIMITE_PREM : LIMITE_FREE);

    /* ── Tarefa exclusiva do Premium ──
       Antes do teto de uso, e antes de qualquer chamada ao Gemini: quem não
       tem direito não gasta cota nem recebe resposta. O `premium: false` na
       resposta é o que faz o app abrir a tela de assinatura em vez de só
       mostrar um erro. */
    if (tarefa.premium && quem.admin !== true && !ehPremium) {
      if (!(await dentroDoTeste(quem.uid))) {
        return res.status(403).json({
          error: 'A análise de currículos é exclusiva do plano Premium.',
          premium: false,
        });
      }
    }

    const mesAtual = new Date().toISOString().slice(0, 7);
    const usados = plano.iaLastReset === mesAtual ? (Number(plano.iaUsedThisMonth) || 0) : 0;

    if (usados >= limite) {
      return res.status(429).json({
        error: ehPremium
          ? `Você atingiu o limite de ${limite} resumos neste mês.`
          : `O plano gratuito inclui ${LIMITE_FREE} resumos por mês. Assine o Premium para ter ${LIMITE_PREM}.`,
        limite, usados, premium: ehPremium,
      });
    }

    // Corta o que passa do teto em vez de recusar: um documento longo ainda
    // rende um resumo útil das primeiras páginas, e o aviso é devolvido junto.
    const cortado = texto.length > MAX_ENTRADA;
    const entrada = cortado ? texto.slice(0, MAX_ENTRADA) : texto;

    const r = await chamarCadeia(tarefa, entrada);

    if (!r.ok) {
      // O motivo real do provedor só vai para administrador: para o usuário
      // comum ele não ajuda em nada e pode expor detalhe da configuração da
      // conta. A lista de tentativas é o que diz QUAL modelo recusou, e por quê.
      const extra = quem.admin === true ? { tentativas: r.tentativas } : {};
      /* Cota estourada em TODA a fila é o único caso em que "tente daqui a
         pouco" seria mentira: o teto gratuito do Gemini vira no fim do dia no
         fuso do Pacífico, não em minutos. Dizer isso evita a pessoa ficar
         batendo no botão à toa. */
      if (r.soCota) {
        return res.status(429).json({
          error: 'A cota de IA do dia acabou. Ela volta na virada do dia; ' +
                 'se precisar antes, avise o administrador.', ...extra });
      }
      return res.status(502).json({ error: 'O serviço de IA não respondeu. Tente novamente.', ...extra });
    }

    const saida = r.texto;
    if (!saida) {
      // Conteúdo barrado pelo filtro do próprio modelo entra aqui.
      return res.status(422).json({
        error: 'O modelo não retornou um resumo' + (r.motivo ? ' (' + r.motivo + ')' : '') + '.' });
    }
    // Resposta cortada no meio — melhor avisar do que entregar um resumo que
    // termina no meio de uma frase.
    const truncado = r.truncado;

    // Conta só o que deu certo — falha do serviço não gasta a cota da pessoa.
    await dbPatch(`users/${quem.uid}/plan`, {
      iaUsedThisMonth: usados + 1,
      iaLastReset: mesAtual,
    }).catch(e => console.warn('ia: contador não gravado', e.message));

    return res.status(200).json({
      ok: true,
      resumo: saida,
      cortado,
      truncado,
      usados: usados + 1,
      limite: limite === Infinity ? null : limite,
      // Qual modelo acabou respondendo só interessa a quem administra — e é o
      // que revela, sem abrir o log, que a fila caiu para o segundo da lista.
      ...(quem.admin === true ? { provedor: r.provedor, modelo: r.modelo } : {}),
    });

  } catch (err) {
    console.error('ia:', err.message);
    return res.status(500).json({ error: 'Erro interno ao gerar o resumo.' });
  }
};

// Funções puras expostas apenas para testes; o export principal continua sendo
// o handler serverless esperado pela Vercel.
module.exports._test = { provedores, chamarCadeia };
