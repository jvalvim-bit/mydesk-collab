'use strict';
/* A cota gratuita do Gemini é do PROJETO e do MODELO, não do usuário: nos
   modelos em preview ela cabe em algumas dezenas de chamadas por dia para a
   conta inteira. Quando ela acabava, o recurso caía para todo mundo até a
   virada do dia e a tela dizia "tente daqui a pouco" — o que era falso.

   A fila de modelos existe para isso. Estes testes seguram o comportamento que
   importa: cair para o próximo quando o não veio do MODELO, parar quando o não
   veio da CONTA, e distinguir "acabou a cota" de "o serviço caiu" — porque as
   duas coisas pedem frases diferentes para quem está esperando. */
const test = require('node:test');
const assert = require('node:assert/strict');

const CHAVES = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MODELOS',
                'GROQ_API_KEY', 'GROQ_MODELOS',
                'OPENROUTER_API_KEY', 'OPENROUTER_MODELOS',
                'IA_EXTRA_NOME', 'IA_EXTRA_URL', 'IA_EXTRA_KEY', 'IA_EXTRA_MODELOS'];

/* `await` no corpo é obrigatório: sem ele o `finally` devolveria a chave de
   ambiente e o fetch de verdade ANTES de o teste assíncrono terminar — e a
   suíte passaria a bater na API do Google para valer. */
async function comAmbiente(env, corpo) {
  const antes = Object.fromEntries(CHAVES.map(k => [k, process.env[k]]));
  const fetchAntes = global.fetch;
  CHAVES.forEach(k => { delete process.env[k]; });
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../api/ia')];
  try {
    return await corpo(require('../api/ia')._test);
  } finally {
    global.fetch = fetchAntes;
    CHAVES.forEach(k => {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    });
    delete require.cache[require.resolve('../api/ia')];
  }
}

/* Uma resposta de Gemini com o texto pedido, ou um erro com o status pedido. */
function servidorFalso(roteiro) {
  const chamadas = [];
  global.fetch = async (url, opcoes) => {
    const geminiModelo = /models\/([^:]+):generateContent/.exec(String(url));
    const modelo = geminiModelo ? geminiModelo[1] : JSON.parse(opcoes.body).model;
    chamadas.push(modelo);
    const resposta = roteiro[modelo];
    if (typeof resposta === 'number') {
      return { ok: false, status: resposta, async text() { return 'quota'; } };
    }
    return {
      ok: true, status: 200,
      async json() {
        if (geminiModelo) {
          return { candidates: [{ content: { parts: [{ text: resposta }] },
                                  finishReason: 'STOP' }] };
        }
        return { choices: [{ message: { content: resposta }, finish_reason: 'stop' }] };
      },
    };
  };
  return chamadas;
}

test('sem chave nenhuma não existe provedor, e o endpoint sabe recusar', async () => {
  await comAmbiente({}, ({ provedores }) => {
    assert.deepEqual(provedores(), []);
  });
});

test('só com a chave do Google a fila é de modelos Gemini, do preview ao estável', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k' }, ({ provedores }) => {
    const fila = provedores();
    assert.equal(fila.length, 1);
    assert.equal(fila[0].nome, 'gemini');
    assert.equal(fila[0].modelos[0], 'gemini-3-flash-preview');
    assert.ok(fila[0].modelos.length > 1,
      'sem segundo modelo não há para onde cair quando a cota do primeiro acaba');
  });
});

test('cota estourada no primeiro modelo cai para o próximo e a pessoa recebe o resumo', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k' }, async ({ chamarCadeia }) => {
    const chamadas = servidorFalso({
      'gemini-3-flash-preview': 429,
      'gemini-2.5-flash': 'o resumo',
    });
    const r = await chamarCadeia({ sistema: 's' }, 'texto');
    assert.equal(r.ok, true);
    assert.equal(r.texto, 'o resumo');
    assert.equal(r.modelo, 'gemini-2.5-flash');
    assert.deepEqual(chamadas, ['gemini-3-flash-preview', 'gemini-2.5-flash']);
  });
});

test('chave inválida para a fila daquele provedor: insistir dá o mesmo não', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'ruim' }, async ({ chamarCadeia }) => {
    const chamadas = servidorFalso({
      'gemini-3-flash-preview': 401,
      'gemini-2.5-flash': 'nunca chega aqui',
    });
    const r = await chamarCadeia({ sistema: 's' }, 'texto');
    assert.equal(r.ok, false);
    assert.deepEqual(chamadas, ['gemini-3-flash-preview'],
      'chave recusada não melhora no modelo seguinte');
    assert.equal(r.soCota, false);
  });
});

test('cota esgotada em TODA a fila é dito como cota, e não como serviço fora do ar', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', GEMINI_MODELOS: 'a,b' },
    async ({ chamarCadeia }) => {
      servidorFalso({ a: 429, b: 429 });
      const r = await chamarCadeia({ sistema: 's' }, 'texto');
      assert.equal(r.ok, false);
      assert.equal(r.soCota, true, 'a tela precisa dizer que a cota volta amanhã');
      assert.equal(r.tentativas.length, 2);
    });
});

test('com chave de outro provedor, a fila continua além do Google', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', GEMINI_MODELOS: 'g1', GROQ_API_KEY: 'g' },
    async ({ provedores, chamarCadeia }) => {
      const fila = provedores();
      assert.deepEqual(fila.map(p => p.nome), ['gemini', 'groq']);

      const chamadas = servidorFalso({
        g1: 429,
        'openai/gpt-oss-120b': 'resumo do reserva',
      });
      const r = await chamarCadeia({ sistema: 's' }, 'texto');
      assert.equal(r.ok, true);
      assert.equal(r.provedor, 'groq');
      assert.equal(r.texto, 'resumo do reserva');
      assert.deepEqual(chamadas, ['g1', 'openai/gpt-oss-120b']);
    });
});

test('provedor avulso entra pela variável de ambiente, sem tocar no código', async () => {
  /* A lista de quem dá camada gratuita muda toda temporada. Se cada provedor
     novo exigisse um `if` em api/ia.js, trocar de reserva viraria deploy —
     e ela ficaria sem IA no dia em que o de sempre fechasse a torneira. */
  await comAmbiente({
    GEMINI_API_KEY: 'k', GEMINI_MODELOS: 'g1',
    IA_EXTRA_NOME: 'mistral',
    IA_EXTRA_URL: 'https://api.mistral.ai/v1/chat/completions',
    IA_EXTRA_KEY: 'm',
    IA_EXTRA_MODELOS: 'mistral-large-latest',
  }, async ({ provedores, chamarCadeia }) => {
    assert.deepEqual(provedores().map(p => p.nome), ['gemini', 'mistral']);

    const chamadas = servidorFalso({ g1: 429, 'mistral-large-latest': 'resumo do avulso' });
    const r = await chamarCadeia({ sistema: 's' }, 'texto');
    assert.equal(r.ok, true);
    assert.equal(r.provedor, 'mistral');
    assert.deepEqual(chamadas, ['g1', 'mistral-large-latest']);
  });
});

test('provedor avulso sem modelo declarado não entra na fila', async () => {
  // Entrar sem saber o que pedir só gastaria uma volta para receber 400.
  await comAmbiente({
    GEMINI_API_KEY: 'k',
    IA_EXTRA_URL: 'https://api.exemplo/v1/chat/completions', IA_EXTRA_KEY: 'x',
  }, ({ provedores }) => {
    assert.deepEqual(provedores().map(p => p.nome), ['gemini']);
  });
});

test('o teto de saída do provedor limita o max_tokens do pedido', async () => {
  /* Medido na conta real em 02/08/2026: a Groq gratuita dá 8.000 tokens POR
     MINUTO, e o teto de SAÍDA conta dentro deles. Pedir `max_tokens: 8000`
     para uma frase de dez palavras devolvia 413 antes de o modelo ver a
     pergunta — a reserva estava configurada e mesmo assim não responderia. */
  await comAmbiente({ GROQ_API_KEY: 'g' }, async ({ provedores, chamarCadeia }) => {
    assert.equal(provedores()[0].maxTokens, 3000);

    let corpo = null;
    global.fetch = async (url, opcoes) => {
      corpo = JSON.parse(opcoes.body);
      return { ok: true, status: 200,
               async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
    };
    await chamarCadeia({ sistema: 's', maxTokens: 8000 }, 'texto');
    assert.equal(corpo.max_tokens, 3000, 'o pedido passou do que a conta aguenta');
  });
});

test('entrada grande demais pula o provedor sem gastar a ida', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', GEMINI_MODELOS: 'g1', GROQ_API_KEY: 'g' },
    async ({ chamarCadeia }) => {
      const chamadas = servidorFalso({ g1: 429, 'openai/gpt-oss-120b': 'nunca chamado' });
      const r = await chamarCadeia({ sistema: 's' }, 'x'.repeat(60000));

      assert.equal(r.ok, false);
      assert.deepEqual(chamadas, ['g1'], 'a Groq foi chamada com entrada que não cabe nela');
      assert.match(r.tentativas.join(' '), /groq pulado/);
      /* O Gemini caiu por COTA e a reserva foi pulada por tamanho: a causa que
         interessa a quem espera continua sendo a cota, não "serviço fora do
         ar". A frase na tela muda por causa disto. */
      assert.equal(r.soCota, true);
    });
});

test('tudo pulado por tamanho não vira "acabou a cota"', async () => {
  // Nenhuma chamada saiu: dizer que a cota acabou seria inventar uma causa.
  await comAmbiente({ GROQ_API_KEY: 'g' }, async ({ chamarCadeia }) => {
    servidorFalso({});
    const r = await chamarCadeia({ sistema: 's' }, 'x'.repeat(60000));
    assert.equal(r.ok, false);
    assert.equal(r.soCota, false);
  });
});

test('413 manda para o próximo da fila, e não encerra a busca', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', GEMINI_MODELOS: 'g1,g2' },
    async ({ chamarCadeia }) => {
      const chamadas = servidorFalso({ g1: 413, g2: 'coube aqui' });
      const r = await chamarCadeia({ sistema: 's' }, 'texto');
      assert.equal(r.ok, true);
      assert.deepEqual(chamadas, ['g1', 'g2']);
    });
});

test('o texto da pessoa entra como conteúdo, nunca como instrução — nos dois dialetos', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', GEMINI_MODELOS: 'g1', GROQ_API_KEY: 'g' },
    async ({ chamarCadeia }) => {
      const corpos = [];
      global.fetch = async (url, opcoes) => {
        corpos.push(JSON.parse(opcoes.body));
        if (corpos.length === 1) return { ok: false, status: 429, async text() { return ''; } };
        return {
          ok: true, status: 200,
          async json() { return { choices: [{ message: { content: 'ok' } }] }; },
        };
      };
      await chamarCadeia({ sistema: 'INSTRUÇÃO' }, 'texto de quem usa');

      // Gemini: instrução em systemInstruction, texto em contents.
      assert.equal(corpos[0].systemInstruction.parts[0].text, 'INSTRUÇÃO');
      assert.equal(corpos[0].contents[0].parts[0].text, 'texto de quem usa');
      // Dialeto /chat/completions: instrução em system, texto em user.
      assert.deepEqual(corpos[1].messages, [
        { role: 'system', content: 'INSTRUÇÃO' },
        { role: 'user', content: 'texto de quem usa' },
      ]);
    });
});
