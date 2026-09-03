# 38 — Admissão: a revisão da ficha pelo DP (ADM-003 V5)

> Aberto em 03/09/2026, branch `feat/admissoes-testes-tnp`, sobre o HEAD `cb77d5d`. Piloto na **TNP**.
> Continua a `37` (ficha pública e dependentes) e fecha a estação **E6** do mapa da `35`.
>
> Como a `37`, e diferente da `35` e da `36`, **este documento descreve código que existe**: rotas
> reaproveitadas, contrato ampliado, tela nova e testes. **Nenhuma migration foi gerada nesta fatia**,
> e nenhuma foi aplicada em banco nenhum.
>
> Ambiente de teste. O aviso em vigor continua sendo o de **teste** (`AVISO-TESTE-ADMISSAO-V1`), e o
> **BLOQUEIO 1 da `35` segue de pé**: nada disto sai de ambiente isolado antes do aviso oficial.

## O que esta vertical decide, em uma linha

Que o DP **lê a ficha inteira e decide** — aprovar ou devolver — numa **tela própria**, alcançada por
**uma única porta** no modal do processo, e que o **CPF de dependente não sai do banco** para chegar
até ele.

---

## 1. A fronteira, que continua a mesma

`admissoes_processos` segue **sem `colaborador_id`**. Aprovar a ficha **não cria colaborador**, não
efetiva ninguém e não muda o `status` do processo (`iniciado`/`pausado`/`cancelado`). O que a
aprovação move é o ciclo **da ficha**, que tem versão própria — a efetivação é a V6, e continua
bloqueada pelo BLOQUEIO 3 da `35`.

O texto da tela diz isso ao DP, na confirmação de aprovar: *"Isto não cria colaborador: a efetivação
é outra etapa."* Sem essa frase, "Aprovar" é lido como "admitir".

---

## Decisões

### D-1 · A revisão é TELA PRÓPRIA, e não mais um bloco no modal

O detalhe do processo é um modal de 720px e já passa de 600 linhas. A ficha tem **31 campos em cinco
blocos**, a declaração de dependentes, a lista de quem foi declarado e **uma decisão**. Dentro do
modal isso seria o componente de mil linhas que a `AGENTS.md` §4.5 proíbe — e, pior, a decisão
ficaria atrás de rolagem, no fim de uma caixa que já rola.

A tela segue o precedente que o repositório já tem para **detalhe que virou página**:
`ProdutoFormulario` (`web-vue/pages/produtos/[id].vue`). Monta `AppShell` **direto**, não
`AppWorkspace` — e essa escolha não é estética: `AppWorkspace` exige a tela em `itemPorTela`, e
`itemPorTela` **cria item de menu**. A ficha não é tela de menu; ela é de um processo.

> **A rota é sub-rota do processo:** `/admissoes_processos/:id/ficha`.
>
> Para ela existir, `pages/admissoes_processos.vue` virou `pages/admissoes_processos/index.vue`.
> Manter o arquivo irmão **e** criar a pasta faria o Nuxt tratar o `.vue` como rota-pai aninhada, que
> passaria a exigir `<NuxtPage />` dentro dele — e a listagem pararia de renderizar. A lista continua
> em `/admissoes_processos`, no mesmo endereço de sempre.

### D-2 · Uma porta só, declarada por quem monta o modal

O modal ganhou **uma seção e um botão**: "Abrir ficha do candidato". Ele **não carrega ficha, não
carrega dependente e não aprova nem devolve** — emite um evento, e quem navega é a página.

`podeRevisarFicha` é **prop obrigatória**, pelo mesmo motivo de `podeVerTeste` (`34` D-8.1): o modal é
montado por **duas** telas, e só a de Processos leva à ficha. Com prop opcional, o botão morto
voltaria em silêncio no dia em que uma terceira tela montasse o modal. A tela de **Testes** passa
`false` — de lá o processo é leitura, e revisar é um ato, que mora na tela dona.

Um teste de varredura fixa os **valores** de cada chamador e exige que só a tela que leva escute o
evento — a mesma guarda que o `pode-ver-teste` já tinha, e pelo mesmo defeito.

### D-3 · Os dependentes viajam DENTRO da ficha, e não numa rota nova do DP

`GET /api/admissoes/processos/:id/ficha` passou a devolver `dependentes[]`. **Não foi criada rota de
dependentes para o DP.**

Revisar é ler a ficha inteira de uma vez, e a permissão que abre a ficha
(`admissoes_processos_ver_ficha`) é a mesma que deve abrir quem foi declarado nela. Uma segunda rota
seria **um segundo lugar para conceder o mesmo acesso** — e, no dia em que alguém revisasse a matriz
de permissões, duas chaves para o mesmo dado.

As quatro rotas de dependente continuam **exclusivamente públicas**, por token do convite. Nenhuma
delas aceita sessão.

### D-4 · O CPF do dependente não sai do banco — e isso não é máscara

A projeção da revisão **não seleciona a coluna `cpf`**. O que sai é
`cpf is not null`, resolvido **pelo banco**, e o contrato entrega `cpfInformado: boolean`.

A diferença entre isso e mascarar é a que importa: **mascarar é um jeito de o número sair do
servidor** e ser escondido depois. Aqui o número não chega à memória da API, não chega à resposta e
não chega ao navegador do DP — não há o que vazar por serialização, por log ou por erro.

O DP precisa conferir **se o candidato informou** o documento do terceiro. Para isso não precisa do
número. Revelar CPF de dependente — muitas vezes de uma criança — exigiria **decisão própria e trilha
por dependente**, que não existem. Enquanto não existirem, o número fica onde está.

A tela diz isso em texto, e não por omissão: *"O número do CPF dos dependentes não é exibido: esta
tela mostra apenas se foi informado."* Sem a frase, alguém procuraria o botão que não existe.

### D-5 · O CPF do candidato continua com UMA entrada auditada

A tela de revisão **não revela CPF**. A única leitura auditada do documento do candidato continua
sendo a do detalhe do processo (`POST .../:id/cpf`, evento `cpf_revelado`, `31` D-4 e `34` D-1).

Criar uma segunda revelação aqui daria **duas portas para o mesmo dado**, cada uma com sua trilha — e
a pergunta "quem viu o CPF desta pessoa?" passaria a ter duas respostas que ninguém junta. O
`FichaRevisaoDto` sequer carrega o campo.

### D-6 · Processo de outra empresa passou a responder 404 — era 200 com `null`

**Correção de comportamento, e a única desta fatia.**

`obterFichaParaRevisao` buscava a ficha por `(processo, empresa)` e devolvia `null` quando não achava.
Para um processo de **outra empresa** isso respondia **200 com `data: null`** — a mesma resposta de
"este candidato ainda não abriu o link". Quem tivesse um uuid alheio não recebia o dado, mas recebia
o **200**, e o 200 confirma que a rota aceitou o alvo.

Agora o serviço confere o **processo** antes da ficha e responde **404** — a mesma resposta de
inexistente, que é o padrão do módulo desde o P0-1 da ADM-002.

O `null` continua existindo, e continua significando uma coisa só: **processo desta empresa cuja ficha
ainda não nasceu**, porque o candidato não abriu o link. A tela diz isso com todas as letras em vez de
mostrar uma caixa vazia.

### D-7 · A decisão só existe quando há decisão a tomar

"Aprovar" e "Devolver" só renderizam com **ficha `enviada`** *e* **`admissoes_processos_revisar_ficha`**.

Fora disso o rodapé não existe. Não é conveniência: o servidor recusa revisão de ficha que não está
`enviada` com **409 `FICHA_NAO_REVISAVEL`**, e oferecer o botão que só pode falhar é o botão morto que
a `34` D-8.1 tirou do modal.

**Ver e decidir são permissões distintas, e a tela respeita as duas.** Quem tem `ver_ficha` e não tem
`revisar_ficha` lê a ficha inteira e não vê botão nenhum — a Gerência não tem nenhuma das duas, e
recebe 403 nas três rotas.

### D-8 · Devolver exige o texto; aprovar exige confirmação

**Devolver** abre um diálogo `persistent` com um campo obrigatório. É `persistent` de propósito: ele
segura texto não enviado, e Escape ou clique fora apagariam o que o DP escreveu para o candidato. O
texto vai **aparado**, e o servidor também recusa pendência vazia (`PENDENCIA_OBRIGATORIA`) — a
barreira da tela existe para o DP não descobrir isso depois de clicar.

**Aprovar** pede confirmação porque é irreversível pela tela: não há transição de saída de `aprovada`,
e a ficha deixa de ser editável pelo candidato.

O que o candidato lê ao reabrir o link é **exatamente** o texto digitado — e a tela diz isso ao DP
antes de ele escrever.

### D-9 · A devolução usa o contrato que já existia — nada foi inventado

Devolver **não emite convite novo**: reabre o mesmo. Isso já era o contrato da V3
(`travarFichaEditavel` recusa `enviada` e `aprovada`, e libera `devolvida`), e a V5 apenas passou a
ter tela para acioná-lo. O prazo do link é o da emissão — **14 dias, gravados na linha**. Se o link
vencer durante a correção, o DP emite outro, o que **revoga o anterior**.

**Reenviar zera o carimbo do revisor** (`revisado_em`/`revisado_por`), porque o ramo `enviada` do CHECK
exige revisão zerada. O texto da última devolução **permanece gravado** em `revisao_pendencias` — é
histórico do que foi pedido, não estado atual.

---

## 2. Contrato — o que mudou, e só isto

| Peça | Antes | Depois |
| --- | --- | --- |
| `fichaRevisaoDtoSchema` | 10 campos, sem dependentes | **+ `dependentes: DependenteRevisaoDto[]`** |
| `dependenteRevisaoDtoSchema` | **não existia** | `{id, nomeCompleto, nascimento, parentesco, cpfInformado, finalidades}` |
| `dependenteDtoSchema` (público) | `cpf` inteiro | **inalterado** — quem lê aquela tela é o próprio declarante |
| `GET .../:id/ficha` — processo alheio | 200 `null` | **404** |
| `GET .../:id/ficha` — sem ficha | 200 `null` | **200 `null`** (inalterado, e agora inequívoco) |

**Nenhuma rota nova. Nenhuma permissão nova. Nenhum status novo. Nenhuma migration.** As três
permissões da fatia (`_ver_ficha`, `_revisar_ficha`, `_convidar`) já existiam no catálogo e já eram do
DP; as três rotas do DP já existiam desde a V3, sem tela que as chamasse.

---

## 3. O que esta vertical NÃO faz

Registrado para não parecer esquecimento:

- **não efetiva ninguém** — `colaborador_id` continua sem existir (V6, BLOQUEIO 3);
- **não sobe documento** — nenhum upload, nenhum storage, nenhum `multipart` (BLOQUEIO 2);
- **não revela CPF** de ninguém: nem do candidato (D-5), nem de dependente (D-4);
- **não edita a ficha** — quem corrige é o candidato, pelo mesmo link, depois da devolução;
- **não edita o bloco interno** nem o exame: isso continua no modal próprio da tela de Processos;
- ~~**não filtra nem lista fichas**~~ — **superado em 03/09/2026 pela `39` §1.** A fila passou a
  existir como recorte da própria listagem, com a situação da ficha derivada por `left join`. Era a
  vertical própria que a §6.1 previa, e ela foi feita;
- **não toca no Caixa**, em Conplus, em importação CSV nem em status trabalhista.

---

## 4. Como isto foi provado

**Integração (Testcontainers, banco descartável):** 12 casos em `ficha.test.ts`, dois novos.

- **`P0-V5` dependentes sem CPF** — dois dependentes, um com documento e outro sem. Confere a **ordem
  de cadastro** (o DP e o candidato precisam falar do "primeiro dependente" olhando para a mesma
  pessoa), o `cpfInformado` `[true, false]`, as **chaves exatas** do DTO, e — a asserção que vale — que
  o **corpo da resposta** não contém o CPF, nem os nove primeiros dígitos dele, nem a string `"cpf"`.
  Conferir só as chaves deixaria passar um serializador que pusesse o número em outro campo.
- **`P0-V5` isolamento** — processo montado direto na **empresa B**, lido pelo DP da **empresa A**:
  404, e o corpo não traz o nome. Id inexistente: 404. E processo da própria empresa **sem ficha**:
  200 com `null` — os três casos no mesmo teste, porque é a distinção entre eles que importa.

**Componente (Vitest + Vuetify real, sem stub de overlay):** 61 casos verdes nos arquivos de
admissões, entre eles a decisão que não renderiza fora de `enviada`, a que não renderiza sem
permissão, devolver sem texto recusado na tela, o texto aparado no evento, o campo que **nasce vazio a
cada abertura**, e a lista de dependentes sem nenhum dígito no DOM.

**Guardas de fonte** — as que não quebram o build quando alguém as reintroduz:

- o modal **não** conhece `FichaRevisao`, `DependenteRevisao`, `ficha/aprovar`, `ficha/devolver`,
  `revisaoPendencias`, `semDependentes` nem `cpfInformado`;
- os quatro componentes da tela nova não contêm a palavra CPF fora do indicador e da frase que explica
  a ausência — nem `mascararCpf`, nem `cpfTotalmenteMascarado`, nem `revelar`;
- cada tela declara o **valor** de `pode-revisar-ficha`, e só a que leva escuta o evento;
- a pasta de rotas do processo tem exatamente `index.vue` e `[id]/ficha.vue` — um terceiro arquivo ali
  é um segundo caminho.

**Navegador (Chromium, ambiente isolado, dados sintéticos):** ver §5.

---

## 5. O ambiente em que isto foi exercitado

Banco **`padaria_adm003_v4_visual`**, isolado e descartável, no Postgres de desenvolvimento. API em
`4110`, web em `5185`. **Dados sintéticos**: nomes com prefixo `E2E`, CPFs gerados com dígito
verificador válido e variando por execução — o CPF do processo é único por empresa, e reaproveitar um
processo semeado faria a segunda rodada levar 409.

**Nada foi aplicado em banco persistente.** Nenhuma migration foi gerada nesta fatia, e a `padaria_adm001`
não foi tocada.

O projeto `admissoes` do Playwright é novo e roda separado do de `produtos`, com `testMatch` próprio —
sem câmera e sem permissão extra: aqui é só navegador.

---

## 6. Pendências e o que ficou decidido não fazer

1. ~~**Não há fila de revisão.**~~ **RESOLVIDO em 03/09/2026** pela `39` §1, exatamente como esta
   linha previa: situação da ficha na projeção da lista, por `left join`, em vertical própria. O que
   continua faltando é **aviso**: a fila não notifica ninguém, e o DP descobre ao abrir a tela.
2. **`ficha/aprovar` não tinha teste de 403 por cargo** antes desta fatia; o teste de permissão cobria
   `ficha` e `ficha/devolver`. O E2E fecha o buraco pelo navegador; um caso de integração para a
   terceira rota continua valendo.
3. **Retenção continua indecidida** (`37` §7.2): ficha e dependentes de quem não for admitido hoje
   somem por `on delete cascade` do processo. Guardar para sempre e apagar junto são decisões
   diferentes, e nenhuma foi tomada.
4. **Duplicidade de dependente sem CPF** continua possível (`37` §2.4) — lacuna conhecida, deliberada,
   e agora visível ao DP, que verá dois nomes iguais na lista.
5. **BLOQUEIO 1 de pé.** O aviso oficial não existe, e o de teste diz, na primeira linha, para não usar
   dados reais.
