# Política de Segurança

## Como relatar uma falha

Escreva para **vitoria.mdds@gmail.com** com o assunto começando em `[SEGURANÇA]`.

Inclua, se possível: o que acontece, como reproduzir, o impacto que você
enxerga e qualquer registro (print, resposta de API, trecho de código). Não é
necessário exploit funcional — uma descrição clara já ajuda.

**Prazos com que nos comprometemos:**

| Etapa | Prazo |
|---|---|
| Confirmação de recebimento | 3 dias úteis |
| Avaliação inicial e gravidade | 7 dias corridos |
| Correção de falha crítica ou alta | 30 dias corridos |
| Correção de média ou baixa | próxima janela de manutenção |

Pedimos que a falha não seja divulgada publicamente antes da correção. Não
temos programa de recompensa, mas damos crédito a quem relatar, se quiser.

## O que está no escopo

- A aplicação em `https://jvalvim-bit.github.io/MyDesk/`
- As funções em `https://mydesk-eta.vercel.app/api/*`
- As regras do Realtime Database (`database.rules.json`)
- Este repositório

**Fora do escopo:** ataques de negação de serviço por volume, engenharia
social, falhas em serviços de terceiros (Firebase, Vercel, Stripe,
Microsoft), e relatórios gerados por scanner sem análise de impacto.

## Versões com suporte

Só a versão publicada em `main` recebe correção. Não há versões antigas em
manutenção.

## Como testamos

- `MYDESK_WEB_API_KEY=... node scripts/pentest-rules.js` — cria contas descartáveis, executa 51
  verificações contra as regras **em produção** (ataques que devem falhar e
  operações legítimas que devem continuar passando) e apaga tudo no fim.
  **Rode depois de qualquer alteração em `database.rules.json`.**
- `node scripts/testa-pdf.js` — valida a estrutura do PDF gerado.
- Análise estática do CodeQL e atualização de dependências pelo Dependabot,
  configurados em `.github/`.

## Decisões de segurança que valem contexto

- **A `apiKey` do Firebase no código do cliente é pública por natureza.** Ela
  identifica o projeto; quem protege os dados são as regras do Realtime
  Database e a autenticação, não o segredo dessa chave.
- **Plano e cobrança são gravados só pelo servidor.** O cliente não consegue
  se tornar premium nem zerar o contador do plano gratuito — as regras exigem
  carimbo de tempo do servidor.
- **O e-mail do usuário fica em `users/{uid}/private`**, fora do perfil, que é
  legível por qualquer usuário autenticado (é o que faz a busca por @
  funcionar).
- **Entrar num grupo exige convite registrado**, e o convite é consumido no
  ato — quem sai ou é removido não volta sozinho.
- **Anexos são limitados por arquivo e por conta**, porque são gravados em
  base64 dentro do banco e o custo é real.

## Alertas abertos no GitHub e o que fizemos com eles

Alerta em aberto não é sinônimo de falha em aberto. Estes dois têm avaliação
registrada aqui para que ninguém precise refazer a análise.

### Varredura de segredos — "Google API Key"

A chave apontada é a `apiKey` do **Firebase Web**. Ela não é credencial: vai no
código do cliente por definição, e quem protege os dados são as regras do
Realtime Database e a autenticação. Rotacionar não aumenta a segurança e
derruba o app.

Reduzimos o que dependia de nós — a chave existia em três arquivos e agora
existe em **um**, `docs/js/firebase-init.js`, que é quem inicializa o SDK:

- a cópia inteira da configuração em `docs/js/app.js` saiu (só era usada para
  conferir se o projeto ainda era o de exemplo, e agora lê `window._fbConfig`);
- `scripts/pentest-rules.js` passou a ler `MYDESK_WEB_API_KEY` do ambiente.

**O que falta, e é fora do repositório:** restringir a chave no console do
Google Cloud (*APIs e serviços → Credenciais*), por referenciador HTTP, a
`mydesk.social/*` e `jvalvim-bit.github.io/*`, e por API às que o app usa.
Enquanto isso não é feito, o risco é consumo de cota alheia — não acesso a
dados. Feito isso, o alerta pode ser dispensado como *usado em produção,
público por natureza*.

A credencial que **é** secreta, a conta de serviço, nunca esteve no
repositório: está no `.gitignore` e vive nas variáveis de ambiente da Vercel.

### Dependabot — `uuid` (bounds check em v3/v5/v6)

Resolvido por `overrides` no `package.json`, fixando `uuid@^14.0.1`.
`npm audit` reporta zero vulnerabilidades.

O Dependabot não conseguia sozinho porque `uuid` entra por três dependências
transitivas do `firebase-admin` (`gaxios`, `google-gax`, `teeny-request`) e
nenhuma aceita a 14 no range declarado. Subir o `firebase-admin` também não
resolve: a 14.2.0 continua resolvendo `uuid@9.0.1`.

Duas verificações antes de forçar:

- **Exposição real era nula.** As três dependências usam apenas `uuid.v4()`, e
  a falha está em `v3`/`v5`/`v6` quando um `buf` é passado.
- **A 14 é ESM puro** e as três chamam `require('uuid')`. Funciona porque o
  Node carrega ESM síncrono por `require` desde a 20.19, e o runtime aqui é 24.
  Confirmado carregando `firebase-admin`, `gaxios` e `teeny-request` com a
  versão nova instalada.

## Pendências conhecidas

Coisas que sabemos e ainda não resolvemos — listadas de propósito:

- `friends/{@}` e os metadados de grupo são legíveis por qualquer usuário
  autenticado (o grafo social não é privado).
- Anexos vivem como base64 no Realtime Database, e não em storage com URL
  assinada.
- Não há Firebase App Check nem verificação obrigatória de e-mail.
- Webhooks de pagamento exigem o cabeçalho `Stripe-Signature` e são verificados
  sobre o corpo bruto com a biblioteca oficial antes de qualquer alteração no plano.

### O limite de notas do plano gratuito é conferido no cliente

`users/{uid}/notes` tem `.write` livre para o dono e não consulta o plano. Quem
escrever direto no banco — pelo console do navegador ou pela API REST com o
próprio token — cria quantas notas quiser sem passar por `canCreateNote()`.

**Por que não se resolve nas regras.** As regras do Realtime Database não
contam filhos: não existe `numChildren()`. Elas conseguem proteger o *número*
do contador (e protegem: `notesCreatedThisMonth` só aceita ficar igual, subir
de um em um, ou zerar com carimbo do servidor e 27 dias desde o reset
anterior), mas não conseguem olhar o nó e recusar a décima sexta nota.

**O que resolveria.** A criação passar por uma função da Vercel com a service
account, que confere e incrementa antes de gravar, e as regras deixarem de
aceitar id de nota novo vindo do cliente — mantendo edição e remoção diretas.
É o mesmo desenho que plano e cobrança já usam. Custo: latência na criação,
tratamento de offline, e mexer no caminho de save, que é a parte mais delicada
do app.

**Por que ainda não foi feito.** O alcance é a própria conta: não dá para tocar
em dado de outro usuário nem para virar premium por esse caminho (o plano é
gravado só pelo servidor). O prejuízo é assinatura não vendida a quem já estava
disposto a burlar — receita, não vazamento. Exige intenção e um tutorial;
ninguém cai nisso sem querer.

Quatro caminhos que **não** exigiam intenção nenhuma foram fechados (ver
`test/limite-notas.test.js`, que trava os quatro):

| O que era | Por que acontecia |
|---|---|
| Grupo sem limite nenhum, para todos | O código lia `groupNotesThisMonth`, contador que nenhuma linha jamais escreveu: sempre zero, nunca alcança o limite |
| Restaurar gravava no quadro errado | O último ramo do save era um `else` solto; backup de grupo restaurado fora dele caía no quadro pessoal, sem contagem |
| Ex-premium travado sem criar nota | A cota somava clientes do CRM (total que diminui) a notas criadas no mês (que só cresce) |
| Adiantar a data do computador zerava a cota | O contador em memória era zerado antes da gravação, e a recusa do banco caía num `catch` vazio |
