# Regras de workspace

> Este é o documento de referência do MyDesk sobre separação de quadros.
> Em caso de conflito entre o que está escrito aqui e o que o código faz,
> **o código está errado**. As regras vêm primeiro.

O MyDesk tem quatro contextos de quadro, e a proposta do produto depende de
eles não se misturarem. Este documento fixa as regras, aponta onde cada uma é
cumprida no código e qual varredura a segura.

---

## Os quatro contextos

| Contexto | Onde as notas moram | Quem enxerga |
|---|---|---|
| **Pessoal padrão** | `users/{uid}/notes` | só você |
| **Pessoal nomeado** | `users/{uid}/personalBoards/{id}/notes` | só você |
| **1:1 (com uma pessoa)** | `shared_boards/{chave}/notes` | você e a outra pessoa |
| **Grupo** | `group_boards/{groupId}/notes` | os membros do grupo |

A identidade do contexto ativo é dada por `_boardAtual()`, em
`docs/js/app.js`. Cada contexto tem identidade própria — dois workspaces
pessoais nomeados são quadros diferentes entre si, tanto quanto um grupo é
diferente do pessoal.

---

## Regra 1 — Cada workspace é individual

**As notas de um quadro pertencem àquele quadro, e a nenhum outro.**

Uma nota nasce num quadro e vive nele. Não existe no MyDesk mover, copiar ou
espelhar nota entre quadros — nem por ação do usuário, nem por efeito de
sincronização, nem como consequência de troca de contexto.

**O que isto proíbe, na prática:**

- gravar num quadro uma nota que veio de outro;
- um carregamento que começou no quadro A terminar montando no quadro B;
- um save disparado durante a troca de quadro escrever no destino errado.

**Onde é cumprido:**

- toda nota carrega `_board`, o quadro de onde veio, posto por `_marcarBoard()`
  em todos os pontos que enchem o array `notes` — carregamento e criação;
- `_triarNotas()` separa o que é do quadro ativo do que não é;
- `saveGroupNote()` e `saveSharedNote()` recusam sozinhos nota de outro quadro,
  sem depender de quem os chamou — delegação, checklist e cor gravam por ali
  direto, e uma trava só no topo deixaria esses caminhos abertos;
- `_board` é memória local e **nunca** é gravado no banco: se fosse, viajaria
  junto numa cópia e a nota chegaria ao outro quadro já se dizendo de lá.

**Nota sem `_board` é aceita.** É a que já estava carregada quando a trava
entrou no ar. Uma trava que recusa o que não conhece não protege dado: impede
de salvar.

**Varredura:** `test/isolamento-workspace.test.js`

---

## Regra 2 — Quadro compartilhado sincroniza entre os seus participantes

**1:1 e grupo sincronizam — é para isso que existem.** O que se sincroniza é
o que foi criado **dentro daquele espaço**, e só entre quem tem acesso a ele:

- **1:1**: as notas de `shared_boards/{chave}` aparecem para as duas pessoas,
  em tempo real. Sair temporariamente não apaga nada — o quadro continua ativo
  para o outro lado. Apagar de vez tem lugar próprio: "Encerrar para ambos".
- **Grupo**: as notas de `group_boards/{groupId}` aparecem para os membros. A
  raiz do quadro é do dono; membro apaga nota a nota, para que ninguém possa
  zerar o quadro dos outros num comando só.

Sincronizar é o oposto de copiar. A nota **está** num quadro e é vista por quem
tem acesso a ele; ela não é duplicada em lugar nenhum.

---

## Regra 3 — Nenhum workspace puxa, copia ou cola do pessoal

**O quadro pessoal nunca é origem de nada.** Nem por engano, nem por
conveniência, nem como efeito colateral de outra operação.

Não existe, e não deve passar a existir:

- "trazer minhas notas para este workspace";
- migração automática do pessoal ao entrar num quadro compartilhado;
- fallback que use o pessoal quando o quadro compartilhado está vazio.

Quadro compartilhado vazio é um quadro vazio. É um estado legítimo.

**Onde é cumprido:**

- `_restorePersonalBoard()` desiste se houver grupo ou 1:1 ativo, **antes** do
  primeiro `notes.push` — conferir depois não evitaria nada, as notas já
  estariam no array e já carimbadas com o quadro errado;
- trocar de quadro **espera** a saída do anterior: `switchToGroupWorkspace()` e
  `switchToWorkspace()` são `async` e aguardam `switchToPersonal()` /
  `leaveGroupWorkspace()`. Sem isso, saída e entrada correm juntas e o quadro
  que sai despeja as notas dentro do que entra.

---

## Regra 4 — Apagar um quadro é ordem, nunca consequência

Array de notas vazio **não** significa "apague o quadro". O array fica vazio em
vários instantes que nada têm a ver com querer apagar: logo depois de
`notes = []`, enquanto o quadro novo carrega do banco; ou quando um save em
debounce, agendado antes da troca, dispara já zerado.

A exclusão do quadro inteiro exige `{ podeApagar: true }`, e o **único** lugar
do app autorizado a pedir isso é o diálogo do "Limpar tudo", depois do "Sim,
apagar tudo". Save comum com array vazio não escreve nada.

---

## Por que estas regras estão escritas

Em **01/08/2026** as quatro foram violadas em sequência, e o custo foi real: 18
notas do quadro pessoal e 6 de um workspace 1:1 foram parar dentro de um quadro
de grupo, a acentuação de 28 notas foi corrompida, e o quadro pessoal foi
apagado por inteiro **três vezes** — inclusive depois de restaurado.

As causas, em ordem de descoberta:

1. `saveNotes` gravava tudo o que estivesse no array dentro do quadro ativo,
   sem perguntar de onde as notas vieram.
2. A trava de isolamento, sozinha, criou dano pior: filtrar até sobrar nada caía
   no caminho de "array vazio = apague o quadro".
3. `switchToGroupWorkspace` chamava `switchToPersonal()` — que é `async` — sem
   esperar. O carregamento do pessoal terminava **depois** de o grupo já estar
   ativo, e as notas eram carimbadas como se fossem do grupo.

A terceira é a mais instrutiva: houve uma tentativa de resolver com um selo de
geração, e ela falhou porque `switchToPersonal` avançava o selo **por último** —
o carregamento atrasado chegava segurando o crachá mais recente e passava na
própria trava. A pergunta certa não era *"o selo ainda é o meu?"*, era *"eu
ainda estou neste quadro?"*.

**A lição que vale para além deste caso:** uma trava que recusa dado precisa ser
desenhada junto com o que acontece quando ela recusa **tudo**. Recusar tudo é um
estado, não um caso de borda — e neste código esse estado significava "apague".

---

## Antes de mexer no núcleo de sincronização

1. **Rode as varreduras.** `npm test` — `test/isolamento-workspace.test.js`
   quebra se o `await` da saída sumir, se a guarda voltar a ficar depois do
   `notes.push`, se um `notes.push` novo aparecer sem carimbo, ou se um save
   vazio voltar a poder apagar um quadro.
2. **Nunca conserte dado com o app aberto.** `saveNotes` grava o quadro inteiro
   com o array que o navegador tem em memória: qualquer aba com estado velho
   reescreve o que você acabou de corrigir. Foi assim que dois reparos se
   perderam em 01/08.
3. **Ferramentas em `scripts/`:**
   - `monitora-boards.js --seg 60` — confirma que o banco está parado, e flagra
     escrita no ato;
   - `backup-boards.js` — exporta os quadros antes de qualquer reparo;
   - `diagnostica-mistura.js` — cruza os quadros pelo id da nota; id é
     `Date.now()` da criação, então a mesma nota em dois quadros é cópia, não
     coincidência;
   - `origem-das-notas.js` — de qual quadro cada nota veio, pelo feed de
     atividade. Decide de onde a cópia deve sair; apagar do lado errado apaga o
     original;
   - `restaura-backup.js` — volta um quadro exatamente como estava.
4. **`backups/` não vai para o git.** A exportação carrega nome, e-mail, CPF e
   o dataURL de currículos de gente real.
