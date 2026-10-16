# 19 — REGISTRO DE REGRAS (fonte única, numerada, verificável)

> **30/07/2026.** Este arquivo existe porque regras estavam se perdendo. Foram ditas no chat,
> implementadas pela metade, revogadas sem aviso, ou simplesmente esquecidas — e **nada quebrava**
> quando isso acontecia.
>
> Construído varrendo: o transcript **inteiro** desta conversa (incluindo o trecho compactado, com
> citação literal do José), os 18 arquivos do `PROJECT_BRAIN/`, a planilha, o Xmind e os 5 desenhos
> do Rodrigo.

> **Governança vigente do Caixa desde 24/08/2026:** Marco é o único executor atual e responde pelo
> fechamento técnico, publicação de branch/PR e decisão de merge após revisão do HEAD exato, gates
> verdes e zero P0/P1. José deixou de ser executor, revisor e gate obrigatório. As decisões
> históricas atribuídas a José continuam preservadas e válidas até revogação explícita. Regras
> operacionais ou financeiras ainda ausentes continuam dependendo de confirmação do Rodrigo. Ver
> [34_GOVERNANCA_CAIXA_MARCO_2026_08_24.md](34_GOVERNANCA_CAIXA_MARCO_2026_08_24.md).

## Como usar (o contrato)

1. **Toda regra tem um id `R-nnn`.** Prompt não descreve regra — prompt **cita o id**.
2. **Regra sem teste é regra que vai cair em desuso de novo.** A coluna `Teste` é o antídoto.
3. **Revogar é um ato explícito.** Muda o status para 🚫 aqui, com quem revogou e quando. Regra não
   some em silêncio.
4. **Contradição não se resolve implementando.** Vai para a §1 e espera decisão de Marco; quando
   envolver operação ou regra financeira ainda não documentada, exige confirmação do Rodrigo.

### Legenda de status

|     | Significado                                                                   |
| --- | ----------------------------------------------------------------------------- |
| ✅  | Implementada e com teste que prova                                            |
| ⚠️  | Parcial — existe de um lado só (front sem back, back sem front, ou sem teste) |
| ❌  | Dita e **nunca implementada**                                                 |
| 🚫  | Revogada — se houver código dela vivo, é código morto a remover               |
| ❓  | A verificar — não afirmo sem olhar                                            |

---

## §1 · CONTRADIÇÕES ABERTAS — precisam da sua decisão

Estas **não** devem ser implementadas até você decidir. Cada uma tem as duas pontas, com data.

### ✅ C-01 · RESOLVIDA (José, 30/07) — lacre do retorno é OPCIONAL

Havia contradição dentro da mesma mensagem de 24/07: _"lacre obrigatorio na ida e volta"_ (D1) e
_"vamos deixar opcional por enquanto, mas o campo deve existir"_ (D5).

> **Decisão: vale o D5.** No retorno avulso/final, o campo de lacre **existe e pode ficar vazio**.
> No retorno planejado da R-185, o lacre é obrigatório desde a declaração. Apertar a regra do
> avulso/final continua sendo mudança de validação, não de migration.

➜ `R-026` fica ✅ com esse comportamento. **`R-025` (lacre na ida) segue obrigatório.**

### ✅ C-02 · RESOLVIDA (José, 30/07) — o caixa fecha ZERADO

Eu havia escrito a R8-v2 no `PROJECT_BRAIN/02` como se fosse fala do José. **Não era** — era
derivação minha da simulação no Mobills. Levada a ele em 30/07, foi **confirmada e completada**:

> **Decisão (palavras dele): "caixa fecha zerado, diferença atribuída a usuário caso tenha".**

Duas regras saem daqui, agora com dono:

- **R-008** — no fechamento, todo o dinheiro volta ao cofre por transferência de retorno e o caixa
  fecha em R$ 0,00. O turno seguinte recebe fundo novo. ✅ **confirmada pelo José**, não mais derivada.
- **R-015 (nova)** — havendo diferença no fechamento, ela é **atribuída ao usuário do caixa**, com
  registro de quem fechou. Conecta com R-009 (confirmação na tela), R-010 (registrar quem) e
  R-011 (notificar tesoureiro/gerente/financeiro/admin).

### ✅ C-03 · RESOLVIDA (José, 30/07) — REGRA primeiro, visual depois

Havia conflito entre _"primeiro vamos mexer no visual"_ (msg 40) e _"precisamos fazer o backend
agora de cada coisa"_ (msg 42). Estávamos fazendo os dois ao mesmo tempo — que é, na prática, o
Frankenstein.

> **Decisão: fechar as REGRAS antes da identidade visual.**

Razão registrada: campo que aparece e não salva é o que faz o operador perder a confiança; logo
trocado, não. E repaginar agora reescreveria telas que mudam de novo quando os 9 campos entrarem.

➜ **A identidade Cicluz (`docs/prompts/IDENTIDADE-VISUAL-CICLUZ-2026-07-30.md`) fica na fila,
pronta, e só roda depois do S2.**

### 🔴 C-07 · A Gerência opera caixa, ou só supervisiona? — **decisão do José, nada foi alterado**

Três testes de integração esperavam **403** para o cargo Gerência em rotas de caixa. A matriz
concede **200**. O commit `428665e` (31/07, antes desta rodada) **já tinha virado a expectativa dos
testes para 200**, ou seja: decidiu em favor da matriz, em silêncio. Isto aqui desfaz o silêncio —
o código **não** foi tocado nesta rodada.

| Rota                       | Gate               | Teste esperava | Matriz concede | Quem me parece certo |
| -------------------------- | ------------------ | -------------- | -------------- | -------------------- |
| `GET /api/caixa/status`    | `caixa_operar`     | 403            | 200            | **o teste**          |
| `GET /api/caixa/historico` | `caixas_gerenciar` | 403            | 200            | **a matriz**         |
| `POST /api/caixa/abrir`    | `caixa_operar`     | 403            | passa o gate   | **o teste**          |

**Não são a mesma pergunta.** `caixas_gerenciar` é supervisão (ver o histórico de todos os caixas) —
é exatamente o trabalho da Gerência, e a própria matriz registra a decisão de negócio na linha 184.
`caixa_operar` é **operar** um caixa: abrir, fechar, lançar. Aí vale a fala do José de 31/07:
_"tesouraria com caixa pra abrir, ou ter que abrir caixa pra fazer algo, não existe isso"_ — e a
R-032, que trata Gerência como retaguarda, junto com Tesouraria e Financeiro.

**R-076/R-077 não decidem isto.** Elas falam de _lançamento_ ("gerência efetua, financeiro paga";
"conferência é do financeiro, gerência e tesouraria"), não de operar caixa. Quem responde é a R-032
mais a fala acima.

**Minha recomendação:** tirar `"caixa"` das `ativas` da Gerência (isso remove `caixa_operar` e
`menu_caixa_mostrar`) e **manter** `caixas_gerenciar`. Os três testes voltam ao esperado original
sem mexer em teste nenhum.

**O custo, que precisa entrar na conta antes de decidir.** Três rotas aceitam `caixa_operar` como
alternativa e a Gerência **não tem a outra permissão da lista**:

- `GET /api/colaboradores` — pede `cadastro_colaboradores_visualizar` **ou** `caixa_operar`;
- `GET /api/pdvs` — pede `cadastro_pdv_visualizar` **ou** `caixa_operar`;
- `GET /api/maquininhas` — pede `cadastro_pdv_*` **ou** `caixa_operar`.

Sem compensar, a Gerência perde a lista de colaboradores (usada como credor da retirada) e a de
PDVs. Então a mudança completa é: **remover `"caixa"` das ativas E acrescentar
`cadastro_colaboradores_visualizar` + `cadastro_pdv_visualizar` aos extras.** `/api/contas`,
`/api/contas-usuarios` e `/api/turnos` continuam funcionando por outras permissões que ela já tem.

### ⚠️ C-06 · COLISÃO DE ID resolvida por mim (31/07) — José pode vetar

O prompt de 31/07 batizou a regra nova de **R-040** ("abrir o caixa informando o lacre É confirmar").
Só que **R-040 já estava ocupado** desde o `§3`: _"Campo Valor = valor total da despesa"_. Duas
regras com o mesmo id quebram o contrato deste arquivo ("prompt cita o id"), então isso não podia
ficar.

**O que eu decidi, e por quê:** o id **R-040 fica com a regra nova** — é o que está no prompt, nos
commits e nos comentários do código, e é a que vai ser citada em conversa. A antiga virou **R-064**,
por ser uma linha sem teste e sem nada no código citando o número.

**Se preferir o contrário, é uma renomeação de duas linhas aqui + os comentários do
`caixa.service.ts`.**

### C-04 · Docs no git

- **R-110:** _"nao quero docs no git por enquanto"_
- Mas o `PROJECT_BRAIN` inteiro está commitado (`770bf9a`, `4c215a0`) — inclusive este arquivo.

Assumi que você mudou de ideia quando pediu o brain. **Se não mudou, me diga.**

### C-05 · Cores: planilha ou marca Cicluz?

- **R-082:** _"as cores das telas devem ser modificadas pras cores da planilha, que cada cor
  representa algo"_
- **R-080:** _"preciso substituir pela identidade visual da cicluz gestão profissional"_

**Resolução proposta (30/07):** não é contradição de verdade. A primária vira a da marca; as
**cores de categoria** continuam vindo da planilha, porque ali a cor carrega significado. O logo
Cicluz, sendo um espectro, justifica isso. ➜ **Você já aprovou** ao escolher manter o roxo.

---

## §1-B · DECISÕES DE 30/07 (rodada de regras com o José)

Colhidas perguntando uma a uma. **Fala dele entre aspas.**

### Fluxo do caixa

| Id            | Decisão                                                                                        | Detalhe                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-032**     | Transferência sem caixa aberto: **só tesouraria, gerência, financeiro, diretor geral e admin** | O cargo **Caixa** continua precisando de caixa aberto. Mesma lógica de R-073/R-074. Some a regra atual que exige caixa para _todo mundo_                 |
| **R-008**     | 🚫 **Superada na referência Caixa B1 (08/10/2026):** o retorno final é atômico no fechamento   | O operador pode registrar sangrias/retornos durante o turno; saldo físico remanescente gera o retorno final na mesma transação do fechamento.            |
| **R-033** 🆕  | 🚫 **Superada na referência Caixa B1 (08/10/2026):** abertura exige malote/lacre identificado  | Não há abertura zerada: o lacre reivindica a transferência pendente e o fundo entra no mesmo ato de abertura.                                            |
| **R-008b** 🆕 | O retorno do fechamento vai para o **COFRE PRINCIPAL**                                         | José, 31/07. A planilha tem **dois** cofres (`CNT CONTA - COFRE PRINCIPAL` e `CNT CONTA - COFRE TROCO`); o brain falava de "o cofre" no singular         |
| **R-020** 🆕  | As contas nascem no sistema **com o saldo da planilha** como fundo                             | José, 31/07. É a foto do dia da virada: dali em diante cada movimento soma ou subtrai. Vale para **todas** as contas, não só os cofres                   |
| **R-021** 🆕  | A quebra de caixa vive em **tabela própria**, nunca em `contas`                                | Decisão técnica minha, 31/07 (o José já tinha definido a REGRA em 30/07). Saldo por PESSOA não pode encostar no saldo das contas, que alimenta o ADR-001 |

### R-015 — Quebra de caixa: o fluxo completo (novo, nada disso existia)

> _"vira divida ou credito, mas o usuario tem que prestar contas disso. ao fechar, digita uma
> observação antes de fechar, e só assim pode fechar o caixa… ele deve informar com a obs, e
> resolver com o tesoureiro imediatamente. inclusive todo caixa que fechar com quebra poderia
> disparar uma notificação com o nome do usuario e o valor pro tesoureiro, com um botão,
> verificado e não verificado, pq ai ele tem que verificar com o usuario o porque da quebra."_

Desdobra em cinco regras:

| Id           | Regra                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **R-015**    | Diferença no fechamento vira **dívida (falta) ou crédito (sobra) do usuário do caixa**                                           |
| **R-016** 🆕 | Havendo quebra, a **observação é OBRIGATÓRIA** — sem ela o caixa **não fecha**. Sem quebra, segue opcional                       |
| **R-017** 🆕 | A quebra **notifica o tesoureiro** com **nome do usuário + valor**                                                               |
| **R-018** 🆕 | A notificação tem estado **verificado / não verificado**, com botão. O tesoureiro precisa apurar o motivo com o usuário e marcar |
| **R-019** 🆕 | O mesmo vale para **divergência de valor em transferência**, não só no fechamento do caixa                                       |

**Por que isto importa:** a R-015 é a regra que hoje devolve **"Erro interno"** na tela (o print de
30/07). A regra está certa e a implementação falha calada. R-016 a R-019 nunca foram construídas.

### Transferência — a FOTO 1 completa (José, 31/07)

Nada disto existe no código: não há `data_recebimento`, `confirmado_por`, `agendamento`,
`tempo_confirmacao` nem múltiplo destino no schema. **21 das 33 marcas `data-pendente` são isto** —
10 no `OperacaoTransferenciaModal` e 11 no `TesourariaCockpit`, que mostra Saída/Entrada/Saldo
vazios exatamente porque depende deste backend.

| Id           | Regra                                                                                                                                                              | Fala do José                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **R-029**    | **Agendamento executa sozinho na data** — o dinheiro sai e entra automaticamente                                                                                   | escolha de 31/07                                                                         |
| **R-028**    | **Só quem opera a conta de destino confirma** o recebimento (usa o vínculo `contas_usuarios`, FOTO 4). Quem envia não confirma o próprio envio                     | escolha de 31/07                                                                         |
| **R-030**    | **Múltiplo destino é DISPUTA, não rateio**; a modalidade exige duas ou mais contas candidatas                                                                      | ver abaixo                                                                               |
| **R-035** 🆕 | **Tempo de confirmação** — opcional e exclusivo da transferência direta; quando marcado, quem envia escolhe: 5min · 10min · 30min · 1h · 1 dia · 10 dias · 30 dias | _"esse campo foi invenção da IA, ele na verdade é o campo tempo de confirmação"_ + R-188 |

#### R-030 — múltiplo destino, na palavra dele

> _"multiplos destinos é pra vc escolher varios destinos pra mesma transferencia… eu tenho check
> pra escolher varias contas destino, quem das contas destino confirmar primeiro o recebimento da
> transferencia colocando o lacre dela, isso faz com que a transferencia vá pra essa unica conta
> que confirmou o recebimento, a data de recebimento se completa e salva como recebido, a
> transferencia vai pra essa conta especifica e as outras não recebem nada, e não se pode mais
> usar esse lacre, aquela regra de lacre rompido já comentada"_

Mecânica: N contas candidatas → a primeira que confirmar **informando o lacre** fica com o valor
**inteiro** → `data_recebimento` preenchida, status `recebido` → as demais candidatas são
descartadas → **o lacre é rompido** e não pode ser reusado.

É o "reivindica/confirma" que o `PROJECT_BRAIN/14` mencionava. Faz sentido operacional: o
tesoureiro manda o malote sem saber qual caixa vai abrir; quem abrir, reivindica.

> ⚠️ **Correção no `PROJECT_BRAIN/14`:** o item "Sempre confirmar" da FOTO 1 foi **erro de
> transcrição meu** — eu li como flag de comportamento. O campo é **tempo de confirmação** (R-035).

> **SUPERADO pela R-188 em 12/09/2026.** O complemento abaixo era uma hipótese técnica, não uma
> decisão operacional confirmada. Desmarcado agora significa **sem prazo** (`NULL`); múltiplo
> destino e retorno não admitem prazo.

#### O dinheiro em trânsito e o prazo (José, 31/07)

| Id           | Regra                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-036** 🆕 | O valor **sai da origem no momento em que a transferência é criada**, e fica como **SALDO PENDENTE** até alguém confirmar. Espelha o físico: o malote saiu do cofre antes de chegar ao caixa                                                 |
| **R-037** 🆕 | Estourado o prazo opcional da transferência direta (R-035), o sistema trava/notifica quem enviou e os usuários de destino realmente aptos a confirmar: vínculo conta+empresa, acesso à empresa e permissão efetiva `transferencias_conferir` |
| **R-038** 🆕 | O bloco **Transferência de retorno** da FOTO 1 contém retornos independentes do dia — cada linha é uma transferência própria, agrupada na mesma tela por comodidade                                                                          |
| **R-039** 🆕 | 🚫 **Superada na referência Caixa B1 (08/10/2026):** maquininha cadastrada e vinculada é obrigatória na abertura. Os relatórios de manhã/tarde usam exclusivamente a maquininha escolhida.                                                   |

### §1-C · R-040 — abrir o caixa É confirmar (José, 31/07)

> _"criar transferência com lacre, pra vários caixas, deixar em aberto; o caixa abre usando o lacre
> da transferência, completa data de recebimento e a transferência é concluída e vai pro caixa"_

**O problema medido em 31/07:** existiam **dois modelos paralelos que não se falavam**. A abertura
consumia um **malote** (`buscarMaloteDisponivelPorLacreRepository`) e o
`POST /api/transferencias/:id/confirmar` confirmava a **transferência com lacre**. Na prática o
tesoureiro criava a transferência com lacre e o caixa **não conseguia abrir com ele** — o front já
mandava `lacreAbertura`, e o backend simplesmente ignorava o campo.

**A regra.** Informar o lacre na abertura não é "mais um campo": é o **ato de confirmar**. Numa só
transação: o lacre identifica a transferência pendente · o caixa que abre **vence a disputa**
(R-030) · `data_recebimento` e `confirmado_por` são preenchidos (R-028) · o valor entra **naquele**
caixa e sai do pendente da origem (R-036) · o **lacre é rompido** (R-027). Meia confirmação é
impossível: qualquer falha derruba a abertura inteira, inclusive o caixa.

**O caminho antigo morreu** (R-114): tabela `malotes`, módulo, rota, tela, permissões e schema.
`POST /api/transferencias/:id/confirmar` **continua existindo** para o caso sem caixa (cofre ↔
banco), mas não existem mais dois jeitos de confirmar a mesma transferência de abertura — quem
abre caixa usa a abertura, e só ela.

**Duas decisões minhas dentro da regra, para o José vetar se quiser:**

1. **Não exijo `contas_usuarios` na abertura.** A R-028 usa esse vínculo para dizer quem confirma.
   Na abertura, quem abre o caixa naquele PDV **já é** o operador daquela conta — exigir um segundo
   vínculo travaria o operador na manhã. O que continua valendo é a lista de **candidatos** (R-030).
2. **Mantive "quem envia não confirma o próprio envio"** (R-028). Consequência prática: o José
   precisa de **dois logins** para testar o fluxo (tesouraria cria, caixa abre). Com um login só, a
   abertura recusa — de propósito.

### Execução do Corujão v2 — Etapa 2 (31/07)

Estado confirmado no código e nos testes:

| Regra          | Estado | Prova                                                                                                                                     |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R-008/R-008b   | ✅     | fechamento recusa saldo positivo; o operador lança o retorno explícito para a conta de cofre configurada da empresa                       |
| R-015/R-016    | ✅     | `quebras_caixa` guarda o fato contábil por empresa e usuário; observação não vazia é exigida no serviço e por CHECK no banco              |
| R-017/R-018    | ✅     | quebra gera `notificacoes` para Tesouraria; destinatário verifica pelo sininho/tela de pendências; o banco impede estado meio-verificado  |
| R-019          | ✅     | confirmação com valor divergente emite `transferencia_divergencia` para destinatário e Tesouraria                                         |
| R-021 (quebra) | ✅     | quebra não altera `contas` e vive em tabela própria, com `empresa_id` e FK composta que impede cruzamento de tenant                       |
| R-032          | ✅     | Tesouraria, Gerência/Gerente, Financeiro, Diretor Geral e admin transferem sem caixa; Caixa continua exigindo caixa aberto e conta do PDV |
| R-033          | 🚫     | superada no Caixa B1: abertura exige malote/lacre identificado e não existe abertura zerada                                               |
| R-039          | 🚫     | superada no Caixa B1: maquininha cadastrada e vinculada é obrigatória na abertura e na conferência por turno                              |
| R-025/R-027    | ✅     | transferência manual exige lacre novo; confirmação rompe o lacre atomicamente e impede reuso                                              |
| R-028/R-030    | ✅     | só operador de conta destino confirma; disputa entre múltiplos destinos tem uma única atualização vencedora                               |
| R-029/R-035    | ✅     | agendamento persiste; prazo opcional só é calculado na transferência direta quando explicitamente escolhido                               |
| R-036          | ✅     | origem é debitada já no estado pendente; destino só recebe após confirmação; pendente é exibido fora do disponível                        |
| R-037          | ✅     | prazo vencido notifica/trava o remetente e somente confirmadores elegíveis; permite liberação auditada por Tesouraria/Gerência/Admin      |
| R-038          | ✅     | linhas de Transferência de retorno do modal são gravadas como transferências independentes, cada uma com seu lacre                        |

A tabela genérica `notificacoes` atende quebra, divergência e prazo sem mecanismos concorrentes.

### Fechamento do P0 do Corujão v3 (31/07)

O loop de opções foi medido antes da correção. O chamador repetido era a abertura de uma
operação nova (`abrirOperacao("transferencia")`); edição e troca de categoria não disparavam o
ciclo, e o `watch` de totais de venda não chama o carregador. A abertura agora é idempotente:
reentradas durante o carregamento e chamadas para o mesmo modal já aberto são descartadas. O teste
`web-vue/utils/abertura-operacao.test.ts` prova uma única busca de malotes mesmo sob realimentação.
Implementação: `3999e82`.

### ⚠️ Correção de status (31/07) — o registro estava mentindo

**R-041** (juros em R$ ou %) e **R-042** (Valor Total) apareciam como ❌ e foram **entregues** nos
commits `655a91e` e `ef6bcc9`, com 11 testes na regra pura e o servidor recalculando. Passam a ✅.

**R-044 a R-047 e R-049** foram fechadas na Etapa 1 do Corujão v2: os campos fiscais, o tipo de
credor, o cadastro próprio de sócios/gestores e as duas fotos persistem e reabrem nos três
domínios. Provas: `s2-campos-lancamento.test.ts` e `web-vue/utils/operacoes.test.ts`.

É o defeito que o §4 deste arquivo previu: status não atualizado junto com a entrega faz o registro
mentir em dois dias. **Atualizar o status é parte da entrega, no mesmo commit.**

> **Acréscimo meu à R-037, para o José vetar se quiser:** travar um operador no meio do turno pode
> parar a padaria. Proponho que **tesouraria ou admin possa liberar a trava**, com registro de quem
> liberou — o mesmo mecanismo do "verificado" da quebra (R-018). Sem essa válvula, um esquecimento
> às 6h da manhã trava o caixa até alguém acordar.

> **Consequência de modelagem da R-036:** o saldo da conta passa a ter **três parcelas** —
> `fundo + confirmado − saído`, mais o **pendente** exibido à parte. O pendente **não** pode entrar
> na mesma soma do disponível, senão o cofre parece ter dinheiro que já saiu fisicamente.

### Recorrência

| Id           | Decisão                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-059**    | O **anual volta** para a lista de frequências                                                                                                                                                                             |
| **R-060**    | O teto **passa a depender da frequência**: anual/trimestral limitados por **número de repetições**; diária/semanal seguem com teto de 12 meses. Sem isso, anual com teto de 12 meses geraria 1 lançamento — ou seja, nada |
| **R-063** 🆕 | Existe **botão para cancelar a série inteira**. Apaga só as **futuras não pagas**; passadas e pagas nunca são tocadas                                                                                                     |

### Duplicidade

| Id        | Decisão                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-091** | Fechar caixa: **fica o que está dentro de `/caixa`** (acessado pelo "Gerenciar caixa"). **Morrem** `pages/fechamento.vue` e `components/caixa/FechamentoCaixaPage.vue` |

### Escopo

O José quer **tudo**: regras + seeding + identidade Cicluz + menu novo. Ordem definida por ele:

> _"tela já temos, alguns detalhes ainda a organizar mas é menos coisa, preciso de regra e fluxo
> funcionando sem bug e nem erro, nem conflito com backend e regras antigas."_

➜ **Regra e fluxo primeiro; visual e menu depois** (coerente com C-03).

---

## §2 · REGRAS QUE CAÍRAM EM DESUSO

Você disse, está no transcript, e **não existe no código**. Esta é a lista que você suspeitava.

> Os ids abaixo são os do §3 — **este arquivo tem uma numeração só**. Prompt cita o id.

| Id        | Regra                                        | Sua fala                                                                                              | Onde deveria estar                                                                            | Entrega |
| --------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| **R-041** | Juros em **real OU porcentagem**             | _"em real ou porcentagem"_                                                                            | Não existe coluna `juros_tipo`. A tela nem oferece o toggle                                   | S2      |
| **R-042** | **Valor Total** = Valor + Juros              | _"juros entra no valor total"_                                                                        | Calculado inline no Vue. Não é função pura, não tem teste, não persiste                       | S2      |
| **R-044** | **Data do documento fiscal** (emissão)       | _"data do documento fiscal é a data de emissão"_                                                      | `OperacaoLancamentoDatas.vue:28` — `data-pendente`, nunca salva                               | S2      |
| **R-045** | **Número do documento fiscal**               | _"número do documento fiscal é o número da nota"_                                                     | `OperacaoLancamentoDatas.vue:32` — idem                                                       | S2      |
| **R-046** | **Tipo de credor** escolhido antes do credor | _"devemos selecionar antes se o campo será uma lista de (fornecedor, colaborador ou sócio/gestores)"_ | Não existe coluna `credor_tipo`. Só estado de UI                                              | S2      |
| **R-047** | **Sócio/Gestor** como credor                 | _"Se for fornecedor... e assim por diante"_                                                           | A tabela `socios_gestores` **não existe**. O chip cai nos _setores_; o id fica numa ref local | S2      |
| **R-049** | **Segunda foto** (nota com os itens)         | _"foto do recibo/boleto/nota e foto da nota com os itens"_                                            | Só `foto_documento_url` existe. A 2ª guarda o nome do arquivo numa ref e some                 | S2      |
| **R-054** | Desconto nos **3 níveis**, cumulativos       | _"um desconto n exclui o outro"_                                                                      | ✅ Tela envia descontos unitário, total do item e geral; backend recalcula e reabre           | própria |
| **R-057** | Divergência **mostra ONDE** diverge          | _"avisa onde está divergindo pra pessoa conferir"_                                                    | ✅ O 422 destaca a linha provável e leva o foco ao campo apontado                             | própria |
| **R-059** | Recorrência inclui **ano**                   | _"por dia, semana, mês, ano"_                                                                         | ✅ `ano` na função compartilhada e na tela; unit prova quatro anuais                          | própria |
| **R-063** | Cancelar série de recorrência                | pedido na spec do S5                                                                                  | ✅ Remove só futuras não pagas; integração preserva uma paga no meio                          | própria |

**Nove dos dezessete campos que o Rodrigo desenhou na FOTO 2 não chegam ao banco.** Todos são do
S2 — a entrega que a spec chama de "o coração" e que **não tem um único commit**.

---

## §3 · O REGISTRO

### DINHEIRO E CAIXA

| Id    | Regra                                                                                                          | Origem                                                                | Status                                                                          | Teste                        |
| ----- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| R-001 | O dinheiro que vem do cofre para o caixa é **fundo de troco**, não empréstimo. O caixa não nasce devendo       | José, 24/07 — _"agora é fundo mesmo"_                                 | ✅                                                                              | `conta-fundo-saldo`          |
| R-002 | 🚫 ~~A transferência do malote deixa o caixa em déficit com o cofre~~                                          | José, 22/07                                                           | 🚫 revogada por R-001                                                           | —                            |
| R-003 | 🚫 ~~O valor que sai do cofre entra no caixa como despesa~~                                                    | José, 22/07                                                           | 🚫 revogada por R-001                                                           | —                            |
| R-004 | Saldo da conta = **fundo + entradas − saídas**, derivado. A coluna do fundo nunca é sobrescrita                | José, 29/07 (D8)                                                      | ✅                                                                              | `conta-saldo`                |
| R-005 | O filtro de dinheiro é sempre `computar = true AND status <> 'cancelado'` (ADR-001), igual no caixa e na conta | `17` §6                                                               | ✅                                                                              | integração                   |
| R-006 | Dinheiro só sai do cofre dentro de malote lacrado                                                              | José, 22/07                                                           | ✅ transferência saindo do cofre sem lacre é rejeitada                          | `transferencias-confirmacao` |
| R-007 | Só o dinheiro **físico** transita pelo caixa; cartão e crediário não                                           | `02` (simulação Mobills)                                              | ❌ adiada pelo José; efeito diário e atribuição indevida documentados em D-06   | —                            |
| R-008 | O caixa fecha **zerado**; a sobra volta ao cofre por transferência de retorno                                  | **José, 30/07 (C-02)**                                                | ✅ `caixa.service.ts:548`; `caixa-fluxo-completo.test.ts:166`                   | integração                   |
| R-009 | Fechamento com diferença **exige confirmação na tela** antes de salvar                                         | José, 24/07                                                           | ⚠️ usa `window.confirm` nativo                                                  | —                            |
| R-010 | Fechamento com diferença **registra quem** fechou                                                              | José, 24/07 e 31/07                                                   | ✅ `fechado_por` guarda o autenticado que fechou; a quebra continua no operador | `etapa2-quebra-maquininha`   |
| R-011 | Fechamento com diferença **notifica** tesoureiro, gerente, financeiro e admin                                  | José, 24/07                                                           | ❌                                                                              | —                            |
| R-015 | Diferença no fechamento é **atribuída ao usuário do caixa**                                                    | **José, 30/07 (C-02)** — _"diferença atribuída a usuário caso tenha"_ | ✅ quebra persiste no operador mesmo quando outro usuário fecha                 | `etapa2-quebra-maquininha`   |
| R-012 | Venda nunca é gravada com data futura; o dia é o `diaNegocio()` em `America/Sao_Paulo`                         | José, 23/07 (bug de fuso)                                             | ✅                                                                              | unit                         |
| R-013 | Venda atrasada entra no caixa fechado do período e marca **quando e qual venda** alterou o fechamento          | José, 31/07                                                           | ✅ trilha `alteracoes_pos_fechamento_caixa`, marca no histórico e detalhe       | `caixa-venda-integrada`      |
| R-014 | O caixa registra as vendas de **todo o período** do turno                                                      | José                                                                  | ✅ `caixa.repository.ts:686`; `alteracao-horario-revinculacao.test.ts:105`      | integração                   |

### LACRE E TRANSFERÊNCIA

| Id    | Regra                                                                                                                                                       | Origem                             | Status                                                                                           | Teste                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| R-020 | Contas nascem com o saldo da planilha como fundo, somente sem movimento anterior                                                                            | José, 31/07                        | ✅ aplicado no dev com guarda                                                                    | seed                                                        |
| R-021 | O lacre é um número único, de fonte física externa, **digitado à mão**                                                                                      | José                               | ✅                                                                                               | —                                                           |
| R-022 | **Não existe tela para criar malote.** O lacre nasce inline na transferência                                                                                | José, 27/07 (repetido 3×)          | ⚠️ tela oculta, não removida                                                                     | —                                                           |
| R-023 | O campo "malote (saco)" **não deve existir** na tela                                                                                                        | José — _"ja falei duzentas vezes"_ | ✅ removido                                                                                      | —                                                           |
| R-024 | 🚫 ~~A transferência com lacre do cofre para o caixa **gera** o malote~~                                                                                    | José                               | 🚫 revogada pela **R-040** (31/07): o malote-entidade deixou de existir                          | —                                                           |
| R-040 | **Abrir o caixa informando o lacre É confirmar o recebimento da transferência**                                                                             | José, 31/07                        | ✅ `caixa.service.ts:287`; 8 testes de integração                                                | `caixa-abertura-lacre`                                      |
| R-025 | Lacre obrigatório na ida                                                                                                                                    | José                               | ✅ validado pelo serviço e por integração                                                        | `transferencias-confirmacao`                                |
| R-026 | Lacre do retorno avulso/final é **opcional**; no retorno planejado da R-185 é obrigatório                                                                   | José, 30/07 + Marco/Rodrigo, 10/09 | ✅ contratos distintos para retorno avulso/final e retorno planejado                             | `caixa-retorno-sangria` / `caixa-abertura-lacre`            |
| R-027 | Cada movimento consome um lacre novo                                                                                                                        | `02`                               | ✅ UNIQUE no banco e tentativa de reuso rejeitada pela API                                       | `transferencias-confirmacao`                                |
| R-028 | Transferência tem duas pontas: quem envia e quem **confirma o recebimento**                                                                                 | FOTO 1                             | ✅ `transferencias-confirmacao.test.ts:66` prova disputa e operador do destino                   | integração                                                  |
| R-029 | Transferência pode ser **agendada**                                                                                                                         | FOTO 1                             | ✅ persistência e efetivação temporal                                                            | `transferencias-confirmacao`                                |
| R-030 | Transferência aceita **múltiplo destino** (duas ou mais candidatas em disputa; uma confirma)                                                                | FOTO 1                             | ✅ interface exige duas contas; candidatos persistidos e confirmação concorrente com um vencedor | `OperacaoTransferenciaModal` / `transferencias-confirmacao` |
| R-031 | **Transferência de retorno** vive no mesmo formulário (checkbox que expande várias linhas de valor+lacre); o destino é automático: a conta de origem da ida | FOTO 1 + R-185/R-188               | ✅ modal grava as linhas atomicamente com a transferência inicial                                | `OperacaoTransferenciaModal`                                |
| R-032 | **Transferência entre contas NÃO exige caixa aberto** para perfis autorizados                                                                               | derivado de R-024 + FOTO 5         | ✅ gestão transfere livre; Caixa continua exigindo caixa aberto e conta do PDV                   | `lancar-sem-caixa`                                          |

### O operador de caixa e as SAÍDAS (José, 01/08/2026)

> _"Operador de caixa deve ter permissão de lançar todas as saídas, desde que saia da conta do
> caixa aberto."_

O que a R-121 fecha não é permissão — o cargo Caixa **já tinha** os quatro `_criar`. O que faltava
era a **amarração da conta**: o total do caixa soma despesa/mercadoria/retirada por `caixa_id` e
ignora a conta; o saldo da conta soma por `conta_origem_id` e ignora o caixa. Com `conta_origem_id`
nullable e o select livre, uma despesa lançada dentro do caixa apontando o Banco debitava **os
dois** ao mesmo tempo — divergência silenciosa que voltava como **quebra de caixa falsa** no colo do
operador (R-015).

| Id           | Regra                                                                                                                                                                                     | Status                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **R-121** 🆕 | Operador de caixa lança **todas as saídas** (despesa, mercadoria, retirada, transferência) — a origem é **sempre** a conta do PDV do caixa aberto, travada na tela e validada no servidor | ✅ `exigirContaDoCaixaNoLancamento`; 12 de integração + 15 unitários          |
| **R-122** 🆕 | Operador de caixa **edita** os próprios lançamentos enquanto **aquele** caixa estiver aberto. Nunca exclui; fechado o caixa, só a Tesouraria corrige                                      | ✅ `validarEdicaoDeSaidaNoCaixa` (403 dizendo qual condição falhou)           |
| **R-123** 🆕 | Operador de caixa **não cria lançamento recorrente** — as ocorrências futuras nascem fora de caixa e não teriam conta válida                                                              | ✅ 400 com o motivo, antes do 403 genérico de permissão; bloco oculto na tela |

Três notas de desenho, para não se perderem:

- **Sem `_excluir`.** A R-015 depende do rastro: apagar lançamento apaga a explicação da diferença.
- **Diferente da transferência de propósito.** Lá a conta do PDV vale como origem **ou** destino
  (dinheiro entra e sai); nas três saídas é **só origem** — é saída, o dinheiro só pode sair de onde
  o operador tem a gaveta.
- **`podeTransferirSemCaixa` virou `podeLancarSemCaixa`** e mudou de endereço para
  `lancamentos.dominio.ts`. A regra é a mesma (R-032, mesma lista de cargos); o que muda é ser
  **fonte única** das quatro saídas, para "quem é de retaguarda" não ter duas definições que
  divergem com o tempo.

### O operador vê a própria dívida (José, 01/08/2026)

> _"Tela de pendências deve estar liberada pro caixa também, afinal ele que gera a pendência, ele
> deve saber quanto deve."_

E, sobre o momento e o encerramento:

> _"Na hora do fechamento, já que a quebra é dívida, e vai ser salvo e notificado ao tesoureiro. O
> caixa fecha quebrado, e deve ser resolvido com o tesoureiro logo após o fechamento. Se resolvido
> (ex.: quebra por conta de valor divergente do malote ou outro motivo justificável), só aí o
> tesoureiro marca como resolvido."_

**Liberar a tela sozinho não cumpre a regra.** Medido em 01/08: a notificação de quebra só tem a
Tesouraria como destinatária (`caixa.service.ts:575-588`) e `quebras_caixa` é uma tabela
**write-only** — existe o INSERT do fechamento e **nenhuma rota de leitura** em todo o projeto. O
operador abriria `/pendencias` e leria "Nenhuma pendência aberta.", que é o oposto do pedido.

| Id           | Regra                                                                                                                                                               | Status |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **R-124** 🆕 | O operador de caixa acessa a tela de Pendências **com caixa aberto ou fechado**, e vê **o próprio saldo** de quebras (dívida ou crédito) mais as pendências abertas | ⏳     |
| **R-125** 🆕 | A quebra de caixa notifica **o operador que a gerou**, além da Tesouraria, **no ato do fechamento**                                                                 | ⏳     |
| **R-126** 🆕 | Só a **Tesouraria resolve** a quebra. O operador lê e procura o tesoureiro; não encerra a própria pendência                                                         | ⏳     |

Notas de desenho:

- **A flag `somente_caixa_aberto` era perversa nesta tela.** A quebra nasce **no fechamento** — e
  nesse instante o operador deixa de ter caixa aberto e perderia o acesso justamente quando precisa.
  Por isso a R-124 vale com o caixa aberto **ou** fechado.
- **Armadilha da R-125 sobre a R-126.** Tornar o operador destinatário da notificação lhe daria, de
  graça, o poder de encerrar a própria quebra: `verificarNotificacaoRepository` autoriza qualquer
  destinatário. O bloqueio é **no servidor**, não só escondendo o botão.
- **O filtro de `quebras_caixa` é pelo `usuarioId` do perfil autenticado, nunca da query.** O índice
  `quebras_caixa_empresa_usuario_idx` convida a consultar por empresa; fazer isso expõe a dívida de
  um funcionário para os colegas. Ver todas exige permissão própria (Tesouraria/Gerência).
- **O modelo não distingue os dois finais que o José descreveu**: quebra _justificada_ (não era
  dívida dele — malote divergente) e quebra _quitada_ (era dívida e foi paga). Hoje há um booleano
  `verificado` só. Enquanto for assim, o histórico não responde "quem quebra caixa por descuido".
  Registrado no `18`; a separação é decisão do José.

### Identidade visual do login (01/08/2026)

A tela de login ficou com resíduo da marca antiga: botão `#c0521d` (laranja Pralis) cravado no CSS,
foco dos campos laranja, brilho de fundo laranja e o slogan da padaria _"é provar e ser feliz"_.
Passou a usar os tokens `--marca-*` que o resto do sistema já usa (`--marca-acento: #6515dd`), com o
slogan da Cicluz. Contraste do botão com branco subiu de ~4,8:1 para ~7,8:1 (AAA).

**Pendência de texto, não resolvida aqui:** o subtítulo diz _"Acesso de donos e gerentes"_, mas a
partir da R-121 o **operador de caixa** é usuário de primeira classe deste login. O texto precisa
mudar — decisão do José sobre a palavra.

### LANÇAMENTO

| Id    | Regra                                                                                                      | Origem                                         | Status                                                                                    | Teste                     |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| R-064 | Campo Valor = valor total da despesa (**era R-040 até 31/07** — ver C-06)                                  | José                                           | ✅                                                                                        | —                         |
| R-041 | Juros em **R$ ou %** sobre o valor                                                                         | José                                           | ✅                                                                                        | `lancamento-juros`        |
| R-042 | Valor Total = Valor + Juros                                                                                | José                                           | ✅                                                                                        | `lancamento-juros`        |
| R-043 | Data de lançamento = dia atual                                                                             | José                                           | ✅                                                                                        | —                         |
| R-044 | Data do documento fiscal = emissão                                                                         | José                                           | ✅                                                                                        | `s2-campos-lancamento`    |
| R-045 | Número do documento fiscal                                                                                 | José                                           | ✅                                                                                        | `s2-campos-lancamento`    |
| R-046 | Tipo de credor escolhido **antes** do credor                                                               | José                                           | ✅                                                                                        | `s2-campos-lancamento`    |
| R-047 | Sócio/Gestor é um tipo de credor, com cadastro próprio                                                     | José (D1)                                      | ✅                                                                                        | `s2-campos-lancamento`    |
| R-048 | Pagamento S/N; se pago, abre Data de pagamento                                                             | José                                           | ✅                                                                                        | —                         |
| R-049 | Pago ou não, sempre: Vencimento + **duas** fotos                                                           | José                                           | ✅                                                                                        | `s2-campos-lancamento`    |
| R-050 | Retirada **não tem** discriminação                                                                         | José (D12)                                     | ✅                                                                                        | —                         |
| R-051 | Discriminação: quant · descrição · grupo · v.unit · v.unit c/desc · v.total · v.total c/desc · total geral | José                                           | ⚠️ colunas c/desc não persistem                                                           | —                         |
| R-052 | Descrição do item vem do **código de barras** cruzado com o cadastro de produtos, não do texto da nota     | José (repetido 2×)                             | ✅                                                                                        | integração                |
| R-053 | Grupo vem do cadastro de produtos; se maquinário/manutenção, do **patrimônio**                             | José                                           | ✅ regra; 26 itens sem vínculo não foram inventados (`CORUJAO-V3-PATRIMONIO-PENDENTE.md`) | 5 testes                  |
| R-054 | Desconto nos 3 níveis, **cumulativos**, em R$ ou %                                                         | José                                           | ✅ tela envia e servidor recalcula os três níveis                                         | `discriminacao-descontos` |
| R-055 | Desconto no total geral **rateia** e altera o unitário (afeta custo)                                       | José                                           | ✅ backend                                                                                | `discriminacao-descontos` |
| R-056 | Desconto aplicado direto no unitário não recalcula nada                                                    | José                                           | ✅                                                                                        | —                         |
| R-057 | Divergência nota × discriminação **bloqueia o salvar** e **mostra onde**                                   | José                                           | ✅ 422 aponta a linha provável e a tela leva o foco ao campo                              | `discriminacao-descontos` |
| R-058 | Recorrência registra **e cria** os lançamentos futuros                                                     | José (D3)                                      | ✅                                                                                        | 10 integração             |
| R-059 | Recorrência: dia, semana, quinzena, mês, **ano**                                                           | José                                           | ✅                                                                                        | `recorrencia` unit        |
| R-060 | Teto por frequência: anual/trimestral por repetições; diária/semanal até 12 meses                          | José, 30/07 e 31/07                            | ✅                                                                                        | `recorrencia` unit        |
| R-063 | Cancelar série apaga somente lançamentos futuros não pagos                                                 | José, 31/07                                    | ✅                                                                                        | `recorrencia` integração  |
| R-061 | Domingo (ISO 7) entra na recorrência semanal                                                               | **José, 30/07 — decisão dele, não do desenho** | ✅                                                                                        | front                     |
| R-062 | Entradas vêm prontas da integração — não se lança venda à mão                                              | José                                           | ✅                                                                                        | —                         |

### PERMISSÃO

| Id    | Regra                                                                                   | Origem      | Status                                                                                   |
| ----- | --------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| R-070 | **Só o admin tem todas** as permissões                                                  | José        | ✅                                                                                       |
| R-071 | Usuário **sem vínculo não vê nenhuma conta**; admin vê todas                            | José, 27/07 | ✅                                                                                       |
| R-072 | Ao cadastrar conta, o admin escolhe o **fundo** e **quem opera** — no mesmo salvar      | José (D8)   | ✅                                                                                       |
| R-073 | Lançamentos aparece sempre para gerência, tesouraria, financeiro, diretor geral e admin | José        | ✅                                                                                       |
| R-074 | Para o cargo **Caixa**, Lançamentos só com caixa aberto                                 | José        | ✅                                                                                       |
| R-075 | Recorrência: só admin, gerência e financeiro (403 para os demais)                       | José (D3)   | ✅                                                                                       |
| R-076 | **Gerência efetua, financeiro paga**                                                    | José        | ✅ matriz de referência + teste                                                          |
| R-077 | Conferência é do financeiro, gerência e tesouraria                                      | José        | ✅ matriz de referência + teste                                                          |
| R-078 | Permissões organizadas por módulo                                                       | José (D12)  | ✅ cada permissão visível pertence a exatamente um módulo; prefixo mais específico vence |
| R-079 | Existe um usuário de teste para **cada** cargo                                          | José        | ✅ seed cobre dinamicamente os 41 cargos; 41/41 verificados no dev, sem permissão direta |

### UI E MENU

| Id    | Regra                                                                                   | Origem                       | Status                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| R-090 | **Um único botão Sair**, no menu do perfil                                              | José (repetido 3×)           | ✅ ação e implementação únicas em `AppShell.vue`                                                                            |
| R-091 | Fechamento existe somente dentro de `/caixa`; rota de notificações é `/pendencias`      | José (repetido)              | ✅ páginas e componente antigos removidos                                                                                   |
| R-092 | Modal único com **3 botões no topo** (despesa/mercadoria/retirada)                      | José                         | ✅                                                                                                                          |
| R-093 | "+ Novo" tem **só** Entradas · Transferências · Saídas                                  | José                         | ✅                                                                                                                          |
| R-094 | Subtítulos: "Vendas e faturamento" · "Entre contas" · "Despesa, mercadoria ou retirada" | José, 30/07                  | ✅ `utils/domain.ts`                                                                                                        |
| R-095 | "Lançamentos" é categoria do menu; as listagens seguem separadas por categoria          | José (D6)                    | ✅ `utils/menu.test.ts:124-139`                                                                                             |
| R-096 | Entradas lista **todas** as do dia, paginada                                            | José (D7)                    | ✅ `87ea945` — 16 testes de front + 6 de integração                                                                         |
| R-097 | **Menu lateral simplificado pelo Xmind** do Rodrigo                                     | José, 30/07                  | ❌                                                                                                                          |
| R-098 | Identidade visual **Cicluz Gestão Profissional** substitui Pralis                       | José, 30/07                  | ✅ sidebar, login, metadados e assets antigos removidos                                                                     |
| R-099 | Primária permanece `#6515dd`; categorias mantêm as cores da planilha                    | José, 30/07                  | ✅ decidido                                                                                                                 |
| R-100 | **Texto de tela é português com acento.** Identificador e commit, sem                   | eu, 30/07 — aprovado por ele | ⚠️ principal + cadastros secundários + integrações revisados; API normaliza mensagens legadas; falta inspeção visual humana |
| R-101 | Nada de diálogo nativo do navegador (`window.confirm`)                                  | eu, 30/07                    | ✅ componente Vuetify reutilizável; zero ocorrências                                                                        |
| R-102 | Responsivo em 1440 / 1024 / 768 / 390, sem scroll horizontal                            | José + `16`                  | ⚠️ exige inspeção humana; checklist de 16 telas em `CORUJAO-V3-RESPONSIVIDADE-PENDENTE.md`                                  |

### Texto, credor e data de pagamento (03/08/2026)

Três ajustes de regra e de **dado**, cada um com a sua migration, feitos antes da produção porque
depois teriam de conviver com histórico.

| Id           | Regra                                                                                                                                             | Status | Teste                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| **R-127** 🆕 | O texto do movimento é a **Observação**. `descricao` deixa de ser o campo do usuário no lançamento (despesa, mercadoria, retirada, transferência) | ✅     | `texto-do-movimento` (unit) · `texto-credor-data-pagamento` |
| **R-128** 🆕 | O credor da **Retirada** é **Fornecedor** ou **Sócio/Gestor**. Colaborador sai da tela — mas não do histórico                                     | ✅     | `texto-credor-data-pagamento` (inclui retirada antiga)      |
| **R-129** 🆕 | **Data de pagamento não pode ser anterior a hoje** no fuso do negócio. Vale para todos os perfis                                                  | ✅     | `texto-do-movimento` (unit) · `texto-credor-data-pagamento` |

Notas de desenho:

- **`descricao` não foi derrubada** (migration `0027`): o backfill copiou o texto para `observacao`
  e a coluna virou nullable. Derrubar antes de a produção rodar estável não deixaria volta se algo
  ainda lesse o campo. A leitura passa por `textoDoMovimento()` —
  `coalesce(nullif(observacao,''), descricao, '')` — então registro antigo continua legível pelos
  dois nomes. A **venda ficou de fora** da R-127 e a coluna dela segue `NOT NULL`.
- **`colaborador_id` da retirada fica** (migration `0028`, que só **adiciona** `fornecedor_id`).
  Converter o histórico faria o registro mentir sobre o que foi lançado na época. Na tela, o tipo
  legado entra no leque **só quando o registro em edição usa ele** — sem isso a retirada antiga
  abriria em "Fornecedor" com o campo Credor vazio, apagando na cara do usuário quem recebeu.
- **R-129 compara com `diaNegocio()`, nunca com `toISOString()`.** Com UTC o dia viraria às 21:00
  BRT e o servidor passaria a recusar como "passado" um pagamento marcado para **hoje** — o BUG B
  de novo, agora barrando lançamento em vez de contabilizar no dia errado.
- **Editar sem mexer na data continua valendo.** A regra só morde quando a data de pagamento
  **muda**; senão nenhum lançamento do passado poderia ter o valor corrigido.
- **❓ Decisão pendente do José:** a R-129 vale hoje para **todos**, inclusive Tesouraria e
  Financeiro. Retaguarda deve ter exceção para registrar pagamento retroativo?

### Cor de categoria e discriminação (04/08/2026)

| Id           | Regra                                                                                                                                                            | Status | Teste                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| **R-130** 🆕 | **Uma fonte só para a cor de categoria**: `web-vue/utils/cores-categoria.ts`. O `main.css` repete os valores (CSS não importa TS) e um teste falha se divergirem | ✅     | `cores-categoria` (29)           |
| **R-131** 🆕 | O **item ativo** do menu fica na **cor da categoria** (preenchimento sólido, texto branco). Tela sem categoria segue no roxo da marca                            | ✅     | verificado na tela               |
| **R-132** 🆕 | **Grupo não aparece** no modal de despesa e mercadoria — vive só na discriminação. Continua no cabeçalho da **retirada**, que não discrimina                     | ✅     | verificado na tela               |
| **R-133** 🆕 | **Grupo e itens são OPCIONAIS** em despesa e mercadoria. Lançamento simples salva sem classificação                                                              | ✅     | `texto-credor-data-pagamento`    |
| **R-134** 🆕 | A **discriminação é a mesma tabela** (8 colunas) em despesa e mercadoria. Sem descrição livre: o item vem sempre de um cadastro                                  | ✅     | verificado na tela               |
| **R-135** 🆕 | O item da discriminação vem de **Produtos** (mercadoria) e de **Patrimônio / Colaboradores** (despesa), e preenche descrição e grupo                             | ✅     | `discriminacao-item-do-cadastro` |
| **R-136** 🆕 | **Dinheiro formata a cada tecla**, com o cursor ancorado pelo número de dígitos à esquerda                                                                       | ✅     | `campo-dinheiro` (18)            |

Notas de desenho:

- **A "fonte única" já foi só um comentário.** O `tema.ts` dizia _"fonte única dos hex — não
  duplicar em outro lugar"_ enquanto os tokens do `main.css` tinham valores **diferentes** para as
  mesmas categorias, e `despesas` nem existia lá — era o motivo de aquele item do menu ficar cinza.
  O que torna a R-130 real é o teste que lê o CSS, não a frase.
- **Registro antigo continua legível, sempre.** Item de discriminação sem vínculo reabre com o
  select vazio e a **descrição gravada visível** abaixo dele. Mesmo cuidado da R-128 com a retirada
  de colaborador: a tela não pode apagar o histórico na cara do usuário.
- **A R-135 vale no SERVIDOR, e não só na tela** (fechado em 04/08/2026, após a auditoria da PR #26).
  A regra tinha sido implementada só tirando o campo de descrição livre do formulário — o contrato
  `zod` continuava aceitando `{descricao, valor}` sem vínculo nenhum, então qualquer cliente que não
  fosse aquela tela (chamada direta, script, front antigo em cache) repunha texto solto no banco. O
  que ficou decidido:
  - **Vínculo exigido na despesa:** `patrimonioItemId` **ou** `colaboradorId`, **exatamente um**. Os
    dois juntos são recusados — a linha ficaria com duas identidades e a tela mostraria só a
    primeira, escondendo a outra. Grupo **não** conta como vínculo: grupo classifica, não identifica.
  - **Como o servidor sabe se a linha é nova:** não há id de item no payload (a gravação apaga e
    reinsere a lista inteira), então a identidade vem do que já está **persistido**. Uma linha sem
    vínculo só passa se o registro já tiver, gravada, uma linha sem vínculo com a **mesma descrição**
    — e cada linha gravada é consumida uma única vez. Consequências, todas testadas: histórico reabre
    e salva; descrição livre nova não entra; duplicar a linha legada não entra; **reescrever o texto**
    de uma linha legada não entra (preservar histórico ≠ poder editá-lo à mão).
  - **Mercadoria fica de fora, de propósito.** A importação de NF-e cria item **sem `produtoId`**
    quando o EAN não casa com o cadastro — é o sinal de "não cadastrado". Exigir o vínculo lá
    quebraria a importação inteira. A simetria com Produtos vive na tela, não no servidor.
- **`patrimonioItemId` também é checado por empresa.** A FK garante que o id existe, não que ele é da
  empresa do lançamento — os vizinhos (`grupoDespesaId`, `grupoPatrimonioId`, `colaboradorId`) sempre
  tiveram essa checagem e este não tinha. Vale nos dois caminhos de escrita: criação/edição e a tela
  de Discriminação.
- **Tirar o Grupo do modal tornou "grupo ou itens" impossível de cumprir.** A validação antiga
  apontava um campo que a tela não tem mais; por isso a R-133. O preço, aceito e registrado:
  lançamento sem grupo e sem itens fica **sem classificação** no cockpit por categoria e no DRE —
  conta no total e no caixa normalmente.
- **Sem descrição livre, a lista de itens virou pré-requisito para discriminar.** Por isso a rota
  enxuta `/api/patrimonio/opcoes-itens` aceita `despesas_criar`/`despesas_editar`: exigir
  `cadastro_patrimonio_visualizar` daria ao operador de caixa o cadastro inteiro de patrimônio (com
  a tela no menu) só para ele escolher um item.
- **❓ Ponto de atenção para o José:** se a empresa **não tiver itens de patrimônio cadastrados**, a
  despesa só poderá ser discriminada por Colaborador. Antes, a descrição livre cobria qualquer caso.

### PROCESSO (o contrato de trabalho)

| Id    | Regra                                                                                                          | Origem            |
| ----- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| R-110 | **NÃO MERGEAR.** José testa local e decide o deploy                                                            | repetido 3×       |
| R-111 | **PARE e mostre o SQL** antes de qualquer migration                                                            | José              |
| R-112 | **PARE e mostre contagem + amostra** antes de UPDATE/seed em dado real                                         | José              |
| R-113 | **Commite sempre**, mesmo incompleto. Nada untracked                                                           | José              |
| R-114 | **Nada é pronto enquanto o caminho antigo existir** (regra-mãe)                                                | José, repetido 4× |
| R-115 | **Pergunte antes de implementar** quando houver dúvida                                                         | José, repetido 2× |
| R-116 | **Leia o código antes de afirmar.** Não chutar                                                                 | José, repetido    |
| R-117 | Antes de escrever prompt, olhar o que já foi feito                                                             | José, repetido 3× |
| R-118 | Atuar como equipe dev sênior completa                                                                          | José, repetido 5× |
| R-119 | A planilha é a fonte da regra; o Mobills, só da aparência; o Xmind, do escopo; os desenhos do Rodrigo, da tela | `01` §3           |
| R-120 | Só a empresa **TNP** por enquanto                                                                              | José              |

---

### REUNIÃO DE 04/08/2026 — Marco × José (contexto completo em `21_DECISOES_04_08.md`)

Primeira reunião com o Marco. O Rodrigo não participou — nada aqui é decisão dele que já não
existisse antes. Cada regra traz a página da transcrição.

**Transferência e lacre**

| Id    | Regra                                                                                                                                                             | Origem                             | Status      | Teste                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------- | ---------------------------- |
| R-137 | **Transferência entre contas bancárias não exige lacre.** É a única exceção à R-025                                                                               | José p.12-13                       | ❓          | —                            |
| R-138 | 🚫 ~~Tempo de confirmação é obrigatório com múltiplos destinos~~ — **superada pela R-188**: múltiplo destino não admite prazo; prazo é opcional só na direta      | José p.14-15 + Marco/Rodrigo 12/09 | 🚫 superada | `transferencias-confirmacao` |
| R-139 | **Divergência de valor no recebimento resolve-se fisicamente, fora do sistema.** O sistema registra observação e notifica os dois lados; não há acerto automático | José p.15                          | ❓          | —                            |
| R-140 | **Só a transferência de retorno é feita pelo operador de caixa.** Saída do cofre e demais movimentações entre contas são da tesouraria, algumas da gerência       | José p.64                          | ✅          | R-032                        |

**Caixa**

| Id    | Regra                                                                                                                                                                                                        | Origem       | Status | Teste                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ | ------------------------------------------ |
| R-141 | **A abertura registra data, hora, usuário, PDV, turno e lacre — e nada além.** O aprovador é gravado só em banco, invisível ao operador; aparece ao tesoureiro na aprovação, com data de recebimento e valor | José p.65-66 | ✅     | `caixa-abertura-lacre.test.ts`             |
| R-142 | **A abertura não exige aprovação de terceiro.** Exigem: diferença, edição e alteração de horário — por admin, gerência ou diretor geral                                                                      | José p.68-71 | ✅     | `alteracao-horario-revinculacao.test.ts`   |
| R-143 | **Todo dinheiro dentro do sistema precisa estar vinculado a alguma venda**, e não existe transferência sem fundo na conta de origem                                                                          | José p.34-35 | ⚠️     | regra estrutural, sem teste que a expresse |

**Produto, estoque e compras** — ⚠️ **correção de 05/08:** este bloco nasceu dizendo "módulo não
iniciado" e marcando as quatro como ❌. Estava errado. A conferência contra o código mostrou que o
Cadastro de Produtos **existe, está implementado e tem 20 testes**. Detalhe completo em
`24_CADASTRO_DE_PRODUTOS.md`.

| Id    | Regra                                                                                                                                                                                              | Origem           | Status                                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-145 | **A fonte do cadastro de produtos é a planilha do Rodrigo**, não o cadastro do CREARE. **Os dados fiscais da planilha NÃO serão importados** — estão errados e causam pagamento de imposto a maior | José p.42, 49-50 | ✅ cumprida no seed (`seed-planilha.ts` não grava campo fiscal). O conflito de fontes do `24` §4 foi **fechado pela R-165** (12/08): o importador do Pralis foi removido |
| R-146 | Produto tem dois tipos: **revenda** e **transformação**. Preço de venda = custo × margem, com opção de digitar manual                                                                              | José p.43-44     | ✅ implementada e testada (`shared/src/produtos/regras.ts`, 20 testes)                                                                                                   |
| R-147 | A **promoção** só se aplica com produto cadastrado, mesmo código e dentro da janela de vigência. Fora dela, volta o preço normal                                                                   | José p.47        | ⚠️ janela de vigência pronta; falta o "mesmo código", que depende do PDV                                                                                                 |
| R-148 | **Pedido automático** dispara no estoque mínimo, na quantidade que falta para o máximo. **O comprador sempre aprova ou reprova**; pode deixar rascunho que se auto-aprova no mínimo                | José p.36, 56    | ❌ só existem as colunas de estoque mín./máx.; nenhuma lógica de disparo                                                                                                 |

**Relatórios e IA**

| Id    | Regra                                                                                                 | Origem       | Status                 |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| R-149 | Relatório de vendas por **Curva ABC** nos cortes **setor, grupo, produto e hora** — pedido do Rodrigo | José p.57-58 | ❌                     |
| R-150 | **Dados pessoais, documentos e informações financeiras não vão para APIs externas de IA**             | ambos p.71   | ✅ (nada implementado) |

**Processo**

| Id    | Regra                                                                                                                                                                                          | Origem                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| R-144 | Prioridade: **1º Caixa · 2º Compras** (engloba cadastro de produtos, estoque, pedidos e tela de venda) **· 3º Relatórios**. Máxima após o Caixa: cadastro de produto com estoque               | Rodrigo, via José p.40-41, 48 |
| R-151 | **Marco trabalha em branch separada**, não commita na `main` sem rodar local e sem o OK do José, e não cria padrão novo sem autorização                                                        | ambos p.58, 78                |
| R-152 | A fila atual de execução é somente de **Marco e José**; Kaylane não participa desta rodada                                                                                                     | José, issue #104, 06/08       |
| R-153 | Cada pessoa trabalha em **uma issue e uma branch por vez**, a partir da base confirmada e nunca diretamente na `main`                                                                          | José, issue #104, 06/08       |
| R-154 | Marco e José não alteram os mesmos arquivos na mesma janela sem coordenação prévia                                                                                                             | José, issue #104, 06/08       |
| R-155 | O Claude principal é o único escritor; agentes de revisão trabalham somente em leitura                                                                                                         | José, issue #104, 06/08       |
| R-156 | Migration, fórmula de dinheiro, dado histórico ou regra ausente interrompem a execução para decisão de José/Rodrigo                                                                            | José, issue #104, 06/08       |
| R-157 | Cada entrega termina com lint, check, testes proporcionais, relatório autônomo e revisão antes de publicação                                                                                   | José, issue #104, 06/08       |
| R-158 | **Push, PR, merge e deploy são autorizações separadas.** José decide merge e deploy                                                                                                            | José, issue #104, 06/08       |
| R-159 | A issue-mestra **#136** define a ordem de execução; milestones antigos permanecem apenas como áreas                                                                                            | José, issue #104, 06/08       |
| R-162 | **Deploy não altera credencial, verificação, papel ou vínculos de identidade existente.** `ADMIN_SENHA` provisiona somente a primeira instalação; rotação posterior é ato explícito e separado | Issue #133, 10/08             |

> **R-144 corrige um erro que circulou:** não são 5 etapas. Compras é guarda-chuva — cadastro de
> produtos e estoque são a _primeira parte_ dela, não etapas independentes.

> **Histórico:** esse processo não foi acordado na reunião de 04/08; o bloco 6 havia sido adiado.
> Em 06/08, José confirmou a versão final na issue #104, registrada nas regras R-152–R-159. A ordem
> corrente e o primeiro trabalho de cada pessoa passam a ser definidos pela issue-mestra #136.

### Caixa — `caixa_id` na edição e caixa fechado (11/08/2026, CX-M06)

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Origem      | Status | Teste                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------ |
| **R-163** 🆕 | **A edição de saída RECALCULA o `caixa_id` conforme a conta escolhida** (mesma `caixaIdDaSaida` do POST): conta do PDV do caixa aberto do próprio ator ⇒ `caixa_id` daquele caixa; qualquer outra conta ⇒ nulo. **Caixa fechado e os sete totais congelados nunca são alterados** — edição de lançamento preso a caixa fechado ou alheio é 403 sem escrita. Sem `UPDATE`/backfill histórico automático: o par incoerente do histórico só se corrige quando alguém salva o registro. Correção pós-fechamento **não existe**; quando existir, será OS própria, com trilha auditável | José, 11/08 | ✅     | `retaguarda-sem-caixa` (aberto e sem caixa) · `retaguarda-pos-fechamento` (fechado, com mutação) |

Notas de desenho:

- O recálculo (e não a recusa) na troca de conta foi a correção dos P1 da revisão da CX-M06: a
  recusa valia só numa direção, contradizia a tela (o campo Conta é livre para a retaguarda) e
  tornava ineditável o histórico que a regra antiga criou. Detalhe em
  `validarEdicaoDeSaidaDaRetaguarda` (`api/src/lancamentos/lancamentos.dominio.ts`).
- A ressalva do José pede cobertura nos **três estados**: caixa **aberto** e **sem caixa** vivem em
  `retaguarda-sem-caixa.test.ts`; caixa **fechado** vive em `retaguarda-pos-fechamento.test.ts`,
  com fechamento pela rota real (nunca `UPDATE` de status) e prova por mutação de que remover o
  bloqueio derruba o teste.

### Caixa — concorrência lançamento × fechamento (11/08/2026, P0)

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Origem      | Status | Teste                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R-164** 🆕 | **Toda escrita que possa alterar os sete totais toma `FOR SHARE` na linha de `fechamentos_caixa` como PRIMEIRO lock e revalida o status PÓS-lock** — inclusive o cron de agendadas (S1: caixa aberto efetiva `agendada→pendente`; fechado não altera status nem totais) e o cancelamento de série da R-063 (S2: parcela presa a caixa fechado não é apagada; caixas distintos travados em ordem determinística). Fechamento/cofre/horário/abertura seguem com `FOR UPDATE`. Ordem única: caixa → linha do lançamento → filhas. Se o lançamento segura o lock primeiro, o fechamento **espera e o inclui** nos totais congelados; se o fechamento vence, o lançamento comum **espera, revalida e é recusado sem escrita** — nunca cai para `caixa_id = null` em silêncio, inclusive a retaguarda usando a conta do PDV (Q2). Venda CREARE é a única exceção: o mesmo lock, **sem** guarda de status — vincula a caixa fechado com a trilha da R-013 decidida sob o lock. Confirmação de transferência que alteraria entrada de caixa já fechado é **bloqueada imediatamente** (Q4, aceite expresso do José); fluxo auditado é outra OS. A mesma decisão cobre TODA mudança de status/conta/valor/computar que altere os sete totais: troca de conta do PDV com caixa aberto é **recusada sob a porta** (S3 — PDV `FOR UPDATE` + caixa `FOR SHARE`; renomear segue livre); abertura por lacre **só reivindica transferência com `caixa_id` nulo** — nunca migra em silêncio a de outro caixa (S4 — recusa no serviço + predicado atômico no UPDATE); **aprovar/recusar NF-e entram na porta em transação** — caixa fechado recusa, retrato decidido sob a trava (S5); re-envio CREARE que MOVE a venda **trava ORIGEM e DESTINO em ordem determinística** e deixa a trilha imutável também no caixa que **perdeu** a venda (S8 — venda integrada continua nunca sendo recusada); reescrever contas no PUT/confirmar **nunca altera um segundo caixa** — provado por teste, nenhum lock novo era necessário (S6). S7 (`liberar-trava` sem preHandler) **não altera os sete totais** — issue de segurança separada, sem código nesta branch. Zero migration | José, 11/08 | ✅     | `caixa-lancamento-vs-fechamento` (15) · `caixa-fechamento-bordas` (11+1 estresse) · `caixa-cron-recorrencia-vs-fechamento` (7) · `caixa-portas-s3-s8` (14) + 25 mutações |

Notas de desenho:

- Contrato central: `travarCaixaCompartilhadoRepository` (por PK, sem join, `TransacaoBanco`
  obrigatório) + `travarCaixaAbertoDoAtor`/`obterCaixaDaSaida` como porta única das cinco classes
  (despesa, mercadoria, retirada, venda, transferência — POST e PUT). Venda e transferência
  ganharam trava de linha (`FOR NO KEY UPDATE`) que faltava. Erros oficiais reutilizados: 400
  "Abra um caixa..." na criação, 403 da Tesouraria na edição, 400 "Caixa ja fechado" em Q2/Q4.
- Espera com teto **por transação da API** (`set_config` LOCAL de `lock_timeout` 10s e
  `idle_in_transaction_session_timeout` 60s, em `@padaria/db/sessao`): migrations, better-auth e
  pooler ficam de fora. Estouro vira **503 `LOCK_OCUPADO`** (transitório — o agente CREARE
  re-tenta 5xx; um 4xx descartaria venda, o que a R-013 proíbe).
- Grafo para o futuro P0 de saldo insuficiente, registrado e NÃO implementado: o lock de conta
  entra **depois** do caixa (caixa → conta em ordem determinística de id → lançamento →
  lacres/filhas). Antecipar a conta é impossível no ramo do operador, que deriva a conta do caixa.
- Consequência operacional da Q4, **com aceite expresso do José (11/08)**: transferência genérica
  cofre→caixa com destino na conta do PDV, criada e **não confirmada antes do fechamento**, fica
  presa em `pendente` sem caminho de resolução até existir o fluxo auditado próprio. O
  retorno/sangria ao cofre confirmado após o fechamento **continua passando** (não altera os
  totais; teste T4). Espelho da S1: agendada vencida presa a caixa fechado permanece `agendada`
  (reavaliada por ciclo) até o mesmo fluxo futuro.

### Produtos — fonte única de criação (12/08/2026, P-04)

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Origem      | Status | Teste                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | -------------------------------------------- |
| **R-165** 🆕 | **Somente a planilha do Rodrigo pode CRIAR produto.** O app Pralis antigo **deixa de ser fonte executável** — `api/src/scripts/importar-pralis.ts` e o script `importar:pralis` foram **removidos**, não desativados. Dado do Pralis não cria produto e **nunca** importa dado fiscal (mantém a R-145). Enriquecimento futuro dos campos comerciais só poderá atuar sobre produto **previamente conciliado**, nunca criar produto, e **depende de nova autorização** do José — não existe hoje e não foi implementado. A regra é revisável, mas **esta é a vigente**: enquanto não houver decisão nova, a única porta de criação em massa é `scripts/seed-planilha.ts`, e a manual é o cadastro da tela | José, 12/08 | ✅     | `produtos-fonte-unica` (ausência do caminho) |

Notas de desenho:

- **Isto resolve o `C-09`** (conflito de fontes) e a `§4` do `24`/`§5` do `30`, que estavam abertos
  desde 05/08 esperando exatamente esta decisão. O conflito era potencial, não atual — o
  `base-products.json` não tinha bloco fiscal preenchido —, mas o caminho existia e podia ser
  rodado por engano.
- **A pasta `CADASTRO DE PRODUTOS/` continua no disco e continua ignorada pelo Git.** Ela é
  referência **visual e histórica** (telas, ícones, textos de ajuda) — nunca aplicação a ser
  copiada, mergeada ou executada. Os `.env` dela não são lidos nem citados.
- A decisão de 03/07 (_"Pralis é a fonte de verdade"_) fica **REVOGADA** por esta regra. Ela
  permanece citada nos documentos apenas para explicar por que o importador existiu.
- **Não restou caminho financeiro fora da porta.** S3/S4/S5/S8 entraram por decisão expressa do
  José (11/08); S6 está **provado por teste** (reescrever contas no PUT/confirmar não altera um
  segundo caixa — nenhum lock novo era necessário); S7 (`liberar-trava` sem preHandler) **não
  altera os sete totais** e vive como issue de segurança separada
  (`ISSUE-SEGURANCA-LIBERAR-TRAVA-SEM-PREHANDLER.md`, D:\Conteudo Sistema Pralis -ago), sem
  código nesta branch. Bônus do RED de S8: bug pré-existente de dedup — o hash canônico
  serializava `Date` como `{}` (datas fora do hash; re-envio que só mudava data/hora virava
  `sem_novidade` e a venda nunca migrava) — corrigido no próprio hash. Detalhe no relatório
  `RELATORIO-P0-CONCORRENCIA-LANCAMENTO-FECHAMENTO-2026-08-11.md` (D:\Conteudo Sistema Pralis -ago).
- **A porta vale também para o que ALIMENTA a decisão, não só para a escrita** (revisão
  independente, 12/08). Duas janelas fechadas depois: (1) a **abertura de caixa** decidia o destino
  do fundo do lacre pelo retrato do PDV lido sem trava — hoje `travarPdvDaAberturaRepository`
  (**`FOR SHARE`**, primeiro lock da abertura) estabiliza o PDV e a conta é relida ATUAL;
  (2) o **re-envio CREARE** lia a origem da venda sem trava e nunca revalidava — hoje trava a linha
  da venda (`FOR NO KEY UPDATE`, ordem caixa → linha) e, se a origem real mudou, aborta com
  **503 `LOCK_OCUPADO`** sem escrever (a R-013 proíbe 4xx: o agente re-tenta e o ciclo seguinte
  registra a trilha do caixa que perdeu a venda).
- **Por que `FOR SHARE` e não `FOR KEY SHARE` no PDV**: `KEY SHARE` só conflita com `FOR UPDATE`,
  então a garantia dependeria da convenção de `salvarPdv` travar antes de escrever — e como o
  Postgres decide key-vs-no-key pelos valores modificados, uma troca só de conta produz
  `NO KEY UPDATE`. Qualquer UPDATE cru em `pdvs` (script, job, rota futura) reabriria a janela em
  silêncio. Provado por mutação: rebaixar para `key share` derruba o teste `S3-c`. **Consequência
  operacional**: alteração em LOTE de `pdvs` passa a serializar com aberturas em voo (teto de 10s
  → 503) — fazer em blocos pequenos ou fora do horário de caixa.

### Conta — saldo insuficiente (12/08/2026, P0)

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Origem                            | Status | Teste                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------ | ------------------------------------------ |
| **R-165** 🆕 | **Nenhuma movimentação pode comprometer mais dinheiro do que existe na conta de origem.** É a R-143 ("não existe transferência sem fundo na conta de origem") cumprida e generalizada para as quatro saídas (despesa, mercadoria, retirada, transferência). Porta única `exigirSaldoSuficienteNaConta`, irmã de `obterCaixaDaSaida`: **trava a linha de `contas` com `FOR UPDATE` e só então relê o saldo**, dentro da mesma transação que grava. Ordem única passa a ser `pdvs → fechamentos_caixa → contas → linha do lançamento → filhas` — o degrau que a R-164 já havia registrado e deixado por implementar. Recusa é **409 `SALDO_INSUFICIENTE`** com `disponivel/solicitado/faltam`, **sem escrita nenhuma**. A **aritmética não muda**: `saldoContaCentavos` continua podendo devolver negativo para histórico já gravado — o que nasce é uma porta de ESCRITA, não uma fórmula nova. **Zero migration.** | Marco, 12/08, sobre R-143 do José | ✅     | `conta-saldo-insuficiente` (12) + mutações |

Notas de desenho:

- **Uma conta por transação, e é isso que torna a prova de ausência de ciclo trivial.** Todo
  lançamento tem exatamente uma `conta_origem_id`; a transferência trava só a **origem**, porque o
  destino apenas recebe e creditar jamais torna um saldo insuficiente. Sem duas contas na mesma
  transação, não existe ordem entre contas para divergir entre chamadores.
- **`FOR UPDATE`, e não o `FOR SHARE` do caixa** — aqui o objetivo é o oposto. No caixa, o SHARE
  existe para lançamentos **não** serializarem entre si; na conta, duas saídas da mesma conta
  **precisam** serializar, senão as duas leem R$ 10, as duas se acham cabíveis e a conta termina
  negativa. Provado por mutação: rebaixar para `for share` derruba o caso de corrida.
- **O PUT cobra o DELTA, não o valor.** O saldo derivado já desconta o valor gravado do próprio
  lançamento; sem devolvê-lo (`saldoJaReservadoNaMesmaConta`), o reenvio idêntico seria cobrado
  duas vezes e uma **redução legítima** poderia ser recusada. O crédito só é devolvido quando a
  conta **não** muda — na troca de conta o dinheiro volta sozinho para a antiga assim que o UPDATE
  grava, porque o saldo é derivado e não há reserva materializada para estornar.
- **Recorrência reserva a série INTEIRA de uma vez.** Um POST cria até 12 lançamentos na mesma
  transação, todos da mesma conta; validar só a 1ª ocorrência deixaria 11 passarem sem lastro. Ou
  cabe a série toda, ou não entra nenhuma.
- **Aprovar NF-e ligando `computar` é débito novo**, ainda que nenhum valor mude — sem a porta ali,
  uma mercadoria criada com `computar = false` seria a porta dos fundos do P0.
- **Agendada é o instante do débito, não a criação.** `transferenciaContaComoSaida` conta
  `pendente`, nunca `agendada`; logo quem debita é o cron ao efetivar `agendada → pendente`. Sem
  fundo, a linha **permanece `agendada` e é reavaliada no ciclo seguinte** — espelho exato do que a
  S1 já faz com caixa fechado. É `continue`, não `throw`: derrubar a transação travaria as outras
  agendadas do mesmo lote.
- **Juros/acréscimo continuam FORA da conta**, porque continuam fora de `saldosDasContasRepository`.
  A porta compara `valor_original` puro — exatamente o que o saldo subtrai. Corrigir isso é a
  **D-09**, que muda saldo histórico e depende de decisão do José (R-115/R-156); fazê-lo aqui seria
  mudar fórmula de dinheiro em silêncio.
- **Transferência de retorno e o fechamento não ganharam porta nova**: já tinham teto próprio sobre o saldo
  do **caixa** (`caixa.service.ts`), que é outra entidade e outra pergunta. A R-165 é sobre a CONTA.
- **O universo lido pela porta é filtrado por conta.** `saldosDasContasRepository` ganhou um filtro
  opcional de contas — mesma fórmula, universo menor. Sem isso, cada escrita varreria as cinco
  tabelas da empresa inteira, e **não existe índice em `conta_origem_id`/`conta_destino_id`**
  (dívida registrada, não corrigida aqui).
- **As contas do seed passaram a nascer com fundo** (R-020: "vale para todas as contas"). Antes as
  cinco nasciam em zero e a suíte só passava porque nada validava saldo — um cofre zerado
  despachando malote de R$ 490 é um estado fisicamente impossível que os testes codificavam como
  normal. 17 testes quebraram quando a porta entrou, **todos** apontando para o Cofre. A prova da
  regra **não** depende desse fundo: ela vive em arquivo próprio, com contas de fundo baixo e
  declarado.
- **Saldo negativo de conta nunca foi proibido pelo brain** — a única proibição de negativo era a do
  caixa **físico**. O teste unitário `conta-saldo.test.ts` continua afirmando que o **derivado** pode
  ser negativo, e continua verde: ele testa a aritmética pura, que esta OS não tocou.

### Caixa — destino financeiro, disponibilidade e fechamento (24/08/2026)

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                         | Origem                                               | Status |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| **R-166** 🆕 | **Saldos históricos negativos são preservados exatamente como estão.** A correção atua somente nas escritas futuras. É proibido `UPDATE`, backfill ou regularização automática nesta entrega; eventual regularização será OS separada, medida, auditável e autorizada.                                                                                                                                                                        | Marco, decisão final FIN-05, 24/08                   | ✅     |
| **R-167** 🆕 | **Toda venda futura precisa de roteamento financeiro por empresa, forma de pagamento e adquirente/provedor**, apontando conta de recebível e conta bancária final. Os nomes reais são cadastro administrativo, não código hardcoded. Uma venda continua sendo uma venda; seus destinos financeiros ficam separados e rastreáveis.                                                                                                             | Marco/Rodrigo/José, questionário final FIN-01, 24/08 | ✅     |
| **R-168** 🆕 | **Venda integrada sem mapeamento nunca é descartada nem recebe destino inventado.** Ela é preservada, fica com roteamento financeiro pendente e não aumenta saldo disponível. O Financeiro/Tesouraria recebe pendência; são proibidos fallbacks silenciosos para Dinheiro, Outro ou conta do PDV.                                                                                                                                             | Marco, FIN-02, 24/08                                 | ✅     |
| **R-169** 🆕 | **Recebível e saldo disponível são estados diferentes.** Dinheiro físico fica disponível no caixa aberto; Pix direto só após confirmação bancária; Pix de maquininha e débito após liquidação da adquirente; crédito por parcela liquidada; voucher após pagamento do emissor; venda a cliente após boleto/Pix quitado. Inicialmente a confirmação é da Tesouraria/Financeiro por conciliação; API futura pode automatizar sem mudar a regra. | Marco, FIN-03, 24/08                                 | ✅     |
| **R-170** 🆕 | **Divergência entre venda, pagamentos e liquidação tem tolerância de R$ 0,00.** Preserva-se a venda, abre-se pendência de conciliação, nenhum número é escolhido em silêncio e a parcela divergente não vira saldo disponível. A resolução exige causa, evidência e ajuste auditável.                                                                                                                                                         | Marco, FIN-04, 24/08                                 | ✅     |
| **R-171** 🆕 | **Transferência pendente não desaparece no fechamento.** Se o dinheiro ainda não saiu fisicamente, o fechamento espera confirmar, cancelar ou reprogramar. Se já saiu, o fechamento comum é bloqueado e um fluxo especial registra origem, destino, lacre/documento, valor em trânsito, responsável e motivo.                                                                                                                                 | Marco, CF-01, 24/08                                  | ✅     |
| **R-172** 🆕 | **Papéis financeiros ficam separados:** Admin configura contas/adquirentes/taxas; Caixa registra o turno; Gerência aprova exceções da loja; Financeiro/Tesouraria confirma liquidações e divergências; Contabilidade valida classificação/DRE; Auditoria é somente leitura. Ações sensíveis mantêm trilha e segunda aprovação quando aplicável.                                                                                               | Marco, GOV-01, 24/08                                 | ✅     |

### Caixa — decisões do gate da #152 (José, 24/08/2026)

Aprovadas em bloco depois da consolidação registrada em `32` §18. As cinco fecham pontos que
estavam abertos; nenhuma delas autoriza migration, fórmula ou produção.

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Origem                        | Status |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| **R-173** 🆕 | **Divergência entre a soma dos pagamentos e o líquido da venda deixa a VENDA INTEIRA pendente.** A venda é preservada integralmente, nenhum valor fica disponível em conta nenhuma e abre-se pendência de conciliação com tolerância **zero**. Fecha a leitura que faltava da R-170: quando a soma não fecha, não existe "parcela divergente" identificável — o pendente é a venda. O `TOLERANCIA_CONCILIACAO_CENTAVOS = 1` é de outra pergunta (conferência de totais do dia por PDV) e **não** pode ser reusado aqui. | José, gate #152, 24/08        | ✅     |
| **R-174** 🆕 | **A #41 vem antes da #152**, em branch separada criada de `origin/main` atualizada. A primeira ingestão concorrente da mesma venda não serializa e cria duas linhas em `vendas`; enquanto o saldo não depender disso é invisível, com roteamento passa a creditar em dobro. As duas issues não se misturam.                                                                                                                                                                                                             | José, gate #152, 24/08        | ✅     |
| **R-175** 🆕 | **A chave única da venda integrada é `(empresa_id, identificador_externo)`**, com o índice parcial restrito a `integracao_chave_id is not null and identificador_externo is not null`. **`integracao_chave_id` fica no PREDICADO, nunca na chave**: incluí-lo permitiria duplicar a mesma venda depois de uma troca de chave/credencial da integração.                                                                                                                                                                  | José, correção do gate, 24/08 | ✅     |
| **R-176** 🆕 | **Somente o Admin configura roteamento, contas, adquirentes e taxas.** Alterar roteamento financeiro exige **permissão dedicada** — é proibido reusar as permissões genéricas de criar ou renomear forma de pagamento. Aplica a R-172 ao caso concreto.                                                                                                                                                                                                                                                                 | José, gate #152, 24/08        | ✅     |
| **R-177** 🆕 | **Venda integrada não tem `tiposPagamento` nem `conta_origem_id` alterados pelo PUT da retaguarda.** Os demais campos permitidos continuam editáveis, e a venda manual não integrada mantém o fluxo próprio. Motivo medido: o reenvio do CREARE já sobrescreve a venda e reinsere os pagamentos, então essa edição nunca sobreviveu — e com roteamento ela apagaria o crédito em silêncio.                                                                                                                              | José, gate #152, 24/08        | ✅     |

**D-06/R-007 continua adiada, agora com ordem explícita:** entra como entrega vertical separada
**depois** de existirem roteamento (#152) e liquidação. Não se mistura à #41 nem à #152. É a D-06
que zera a conta do PDV; a #152 apenas reduz o desvio e produz a classificação de forma que a D-06
exige.

Notas de implementação:

- TECH-01 autoriza apenas o desenho e a geração **local** de migration depois de conferir schema,
  journal, snapshots e branches. O SQL completo, rollback, testes e impacto precisam ser mostrados;
  a execução para antes de aplicar.
- As regras acima não autorizam produção, backfill, mudança histórica, deploy ou fórmula financeira.
- Plano executável e ordem das branches: `30_RETOMADA_CAIXA_TESTAVEL_2026_08_24.md`.

---

## §1-D · Contradições abertas em 05/08/2026

**C-08 · Reabertura de caixa: existe ou não?**
A reunião fala em _"reabrir e trocar o horário"_ e no dado original que se perde (p. 69), e daí saiu
a ideia de log de auditoria. Mas o código **não tem reabertura**: o status admite
`aberto`/`fechado`/`ajustado` e nada escreve `ajustado`; `editarAberturaCaixa` e `alterarHorarioCaixa`
recusam caixa fechado; não há rota de reabrir. O que existe é (a) alteração de horário **enquanto
aberto**, já auditada em `edicoes_caixa` com `valores_antigos`/`valores_novos`, e (b) venda tardia
entrando em caixa fechado, marcada em `alteracoes_pos_fechamento_caixa`.
**Decisão necessária do José:** reabertura vai passar a existir (e então precisa de regra, permissão
e trilha), ou o entendimento da reunião estava impreciso e o assunto se encerra?

**C-09 · ~~A transferência de retorno no fechamento não foi implementada.~~ — CORRIGIDO em 05/08.**
A investigação de código refutou: ela **está** implementada (`caixa.service.ts:610-666`, rota, tela e
3 testes), e a regra existe — saldo positivo **bloqueia** o fechamento até o retorno integral, saldo
negativo fecha e vira quebra. Não existe "sobra maior que a prevista" porque não existe sobra
prevista. O que falta de verdade são três coisas menores, registradas em `26` §0: retorno parcial
impossível na tela, sangria sem UI, e retorno/fechamento em dois POSTs. O registro original abaixo
fica como histórico da dúvida.

~~**C-09 (original) · A transferência de retorno no fechamento não foi implementada.**~~
José: _"por isso que eu não implementei... vamos supor que ele feche com déficit ou com um valor
maior do que você definiu para transferência de retorno. Você vai precisar de mais uma
transferência. Então a gente precisa rever"_ (p. 29). Enquanto essa regra não existir, **o módulo
Caixa não pode ser declarado terminado**, embora tudo o mais funcione.

### Idempotência da venda integrada — decisões transportadas para a #41 (José, 24/08/2026)

> **Transporte parcial, de propósito.** As decisões do gate do Caixa foram registradas como
> **R-166 a R-177**. Esta branch é só da **#41** e traz **apenas as duas que ela executa**. O
> conjunto completo, com R-166–R-173, R-176 e R-177, chega junto com a branch da #152.

| Id           | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Origem                                                   | Status     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ---------- |
| **R-174** 🆕 | **A #41 vem antes da #152**, em branch separada criada de `origin/main` atualizada. A primeira ingestão concorrente da mesma venda não serializa e cria duas linhas em `vendas`; enquanto o saldo não depender disso é invisível, com roteamento passa a creditar em dobro. As duas issues não se misturam.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | José, gate #152, 24/08                                   | ✅         |
| **R-175** 🆕 | **A chave única da venda integrada é `(empresa_id, identificador_externo)`**, com o índice parcial restrito a `integracao_chave_id is not null and identificador_externo is not null`. **`integracao_chave_id` fica no PREDICADO, nunca na chave**: incluí-lo permitiria duplicar a mesma venda depois de uma troca de chave/credencial da integração.                                                                                                                                                                                                                                                                                                                                                                                                                                           | José, correção do gate, 24/08                            | ✅         |
| **R-178** 🆕 | **Uma loja = um servidor CREARE = um `empresa_id`.** Cada loja tem a sua própria instalação do CREARE e corresponde a um `empresa_id` exclusivo no Pralis; duas lojas **nunca** compartilham `empresa_id`. Dentro de cada servidor existem **vários caixas/PDVs**, cada um com o seu código de PDV, e o `idVendaBalcao` é único **dentro daquele servidor**. **PDV e IP são rastreabilidade, não chave**: o PDV é uma granularidade abaixo do escopo real do identificador, e o IP muda. É esta regra que torna a chave da R-175 **exata** — o escopo da instalação e o escopo da empresa são o mesmo.                                                                                                                                                                                           | Marco, confirmação operacional, 25/08                    | ✅         |
| **R-179** 🆕 | **SUPERADA PARCIALMENTE pela R-185/R-187.** Continua vigente a proibição do painel paralelo “Programar entrega ao cofre” e continua único o ato financeiro dentro do Caixa. Foi superada somente a proibição de declarar o planejamento no modal genérico: o modal prepara linhas, mas não movimenta dinheiro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Marco, decisão da #101, 27/08; revisão 10–11/09          | ⚠️ parcial |
| **R-180** 🆕 | **Nesta maquina, duas suites de integracao completas nunca rodam juntas — tres, jamais.** Os clones `Sistema Pralis`, `Cicluz-CadastroColaborador` e `Cicluz-Design-Pralis` dividem a MESMA `org.testcontainers.session-id`, entao o Ryuk de um pode ceifar container do outro. Alem disso, com CPU disputada o `hookTimeout` de 180 s estoura e o arquivo inteiro vira **skip** — suite que pula arquivo por falta de maquina **nao vale como gate**, e skip nunca deve ser apresentado como verde. A integracao do Caixa leva **~55 min sozinha**: exige janela exclusiva. E rode sempre pelo `vitest` direto, **nunca** por `scripts/test.mjs` — o wrapper impoe teto de tempo e, ao estourar, mata so o filho direto, deixando a arvore do vitest orfa e comendo CPU sem produzir resultado. | Marco, incidente de 27/08                                | ✅         |
| **R-181** 🆕 | **Cofre que RECUSA uma entrega física fecha o turno por quebra/diferença auditada.** A recusa de conferência continua sendo o registro do "conferi e não bateu" (motivo, valor contado, lacre informado, quem e quando, uma linha por tentativa) e **não** devolve o dinheiro ao caixa: ele saiu de verdade. O caminho oficial de saída é registrar a **diferença como quebra auditada**, com valor, responsável e justificativa — nunca cancelar a transferência (cancelada não conta como saída e faria o dinheiro reaparecer no caixa), nunca confirmar um valor que não foi contado, e nunca deixar o turno aberto esperando. É esta regra que dá à R-171 a válvula de escape que faltava.                                                                                                   | Rodrigo, confirmação operacional, 01/09/2026             | ✅         |
| **R-182** 🆕 | **Transferência legada `pendente` do PDV para o Cofre criada pela rota genérica é RECLASSIFICADA para `retorno`/`sangria`, preservando integralmente a auditoria.** São as linhas que nasceram `tipo = 'suprimento'` antes do fechamento das portas da #101: o dinheiro saiu do caixa, mas o predicado da R-171 não as enxerga e a recusa auditável não as alcança. Reclassificar é **corrigir o rótulo de um fato que já aconteceu**, não reescrever o fato: valor, contas, datas, lacre, autoria e `criado_em` ficam intactos; nada é apagado, cancelado, confirmado ou reprocessado. A reclassificação exige SQL, impacto e amostra apresentados e aprovados antes — e migration é ato separado, com autorização própria.                                                                     | Rodrigo, confirmação operacional, 01/09/2026             | ✅         |
| **R-183** 🆕 | **O Cofre credita SOMENTE o valor fisicamente contado, e divergencia tem estado terminal proprio.** Falta: o cofre credita o contado e a diferenca vira **quebra auditada** (sinal negativo, como o escritor existente). Sobra: o cofre credita o contado e a diferenca e **sobra — nunca quebra positiva** (mantem a D7). Recusa **sem contagem**: registra-se valor recebido **R$ 0,00**, o cofre nao recebe credito nenhum e o valor declarado inteiro vira quebra auditada. E a transferencia **nunca** termina em `recebido` quando houve divergencia: ela precisa de estado terminal explicito e auditavel, que continue contando como saida do Caixa — devolver dinheiro ao Caixa esta proibido em todos os casos.                                                                        | Rodrigo/Marco, decisao operacional final, 01/09/2026     | ✅         |
| **R-184** 🆕 | **A abertura operacional do Caixa usa exclusivamente a data e a hora atuais do servidor no instante do clique.** O operador nao escolhe, retroage nem antecipa esse horario e o navegador nao o envia. `data_hora_abertura` e `aberto_em` nascem do mesmo instante auditavel e sao imutaveis: a rota, os botoes e o fluxo de autorizacao de alteracao de horario foram removidos. O horario operacional do CREARE, quando integrado, sera uma sessao externa distinta; nunca reescreve este log.                                                                                                                                                                                                                                                                                                 | Rodrigo/Marco, regra operacional, confirmacao 11/09/2026 | ✅         |
| **R-185** 🆕 | **Fica reaberto o planejamento de Transferência de retorno vinculado ao Caixa.** No modal genérico de nova transferência, a retaguarda prepara várias linhas de valor e lacre obrigatório. O destino não é escolhido: é sempre a conta de origem da transferência inicial. A soma pode ser menor ou igual à ida, nunca maior. As linhas são gravadas atomicamente, não afetam saldo antes da execução, vinculam-se ao Caixa aberto por aquela entrada e bloqueiam o fechamento enquanto planejadas ou em conferência. A movimentação real continua tendo caminho único dentro do Caixa; entrega adicional cobre somente o excedente não planejado. Cancelamento exclusivo da retaguarda preserva motivo, autor e horário.                                                                        | Rodrigo/Marco, 10–12/09/2026                             | ✅         |

| **R-186** | **Um operador pode ter no maximo um Caixa aberto por empresa.** A abertura recusa um segundo Caixa para o mesmo `usuario_caixa_id`, mesmo que seja em outro PDV. A regra existe no servico para devolver mensagem clara e em indice unico parcial no banco para impedir duas aberturas concorrentes. Ao fechar, nao pode parecer que o sistema abriu outro Caixa silenciosamente. | Marco, confirmacao operacional, 11/09/2026 | ✅ |
| **R-187** | **Sangria e retorno são o mesmo processo e passam a ter um único nome operacional: Transferência de retorno.** Todo movimento novo volta do Caixa à conta de origem da ida e usa `tipo = 'retorno'`; o modal oferece apenas **Transferência de retorno**, com linhas de valor+lacre. `sangria` permanece somente para leitura histórica, sem migration, backfill ou alteração da auditoria antiga. | Marco/Rodrigo, 11–12/09/2026 | ✅ |
| **R-188** | **Transferência direta com prazo, Múltiplo Destino e Transferência de retorno são modalidades mutuamente exclusivas.** Prazo é opcional apenas na direta; desmarcado grava `tempo_confirmacao` e `prazo_confirmacao_em` como `NULL`. Múltiplo destino e retorno nunca têm prazo. No retorno, cada linha informa somente valor+lacre e volta automaticamente à origem da ida. Prazo vencido notifica/trava o remetente e somente destinatários realmente elegíveis à conferência. Como não existe regra para reiniciar relógio depois da criação, prazo e agendamento ficam somente leitura na edição; o backend rejeita alteração silenciosa. | Marco/Rodrigo, confirmação operacional, 12/09/2026 | ✅ |
| **R-189** | **Tesouraria é a única exceção à segregação de quem criou ou executou uma transferência.** Quando estiver vinculada à conta de destino, na empresa correta e tiver `transferencias_conferir` efetiva, a Tesouraria pode confirmar ou encerrar divergência inclusive de movimento que planejou ou executou. Isso não concede acesso global a contas sem vínculo, nem libera os demais cargos da R-028; lacre, valor contado, estado pendente e confirmação única permanecem obrigatórios. | Rodrigo/Marco, confirmação operacional, 14/09/2026 | ✅ |
| **R-190** | **Suprimento direto para conta de PDV aberto pertence ao caixa daquele PDV, independentemente de quem o criou na retaguarda.** Ao criar uma transferência direta sem planejamento e sem múltiplo destino, o sistema vincula Cofre/conta de origem → conta de PDV ao único caixa aberto que usa essa conta; após a confirmação, o valor integra o saldo físico desse caixa. Sem caixa aberto, o lançamento continua apenas entre contas. Se duas caixas abertas usarem a mesma conta, a transferência é recusada até o cadastro ser corrigido; nunca se escolhe uma gaveta em silêncio. Movimentos já gravados não são alterados automaticamente. | Rodrigo, confirmação operacional, 14/09/2026 | ✅ |
| **R-191** | **Tesouraria acessa Pendências operacionais e pode discriminar posteriormente despesas e mercadorias.** A permissão de tela preserva o código legado `fechamento_com_diferenca_visualizar`, mas a interface a apresenta pelo nome operacional. `despesas_discriminar` e `mercadorias_discriminar` autorizam somente classificar itens pendentes; não concedem operação de Caixa, pagamento, efetivação ou exclusão. A mesma permissão continua concedível individualmente a qualquer usuário. | Rodrigo, confirmação operacional, 14/09/2026 | ✅ |

| **R-200** | **Lacre de fechamento é obrigatório e distinto do lacre de retorno.** Todo novo fechamento registra o selo físico que fechou a gaveta, inclusive com saldo zero ou quebra. O lacre de retorno continua identificando somente a transferência de dinheiro ao Cofre e permanece opcional conforme R-026. Caixas encerrados antes desta regra preservam `lacre_fechamento` nulo, sem reescrita histórica. | Tesouraria, confirmado por Marco, 17/09/2026 | ✅ migration 0041 + API + tela + histórico + testes |

Na interface, selecionar uma modalidade válida não é apresentado como erro. As incompatíveis ficam
visualmente desabilitadas; quando prazo ou múltiplo destino bloqueiam o retorno, a ajuda do retorno
informa somente a causa ativa. Ao marcar **Múltiplo Destino**, é obrigatório selecionar pelo menos
duas contas; com uma única conta o envio continua sendo direto.

A elegibilidade do retorno precisa ser calculada com a lista completa de PDVs, inclusive acima da
primeira página da API. Essa carga ocorre tanto ao entrar em Transferências quanto ao abrir o mesmo
modal pelo `+ NOVO` global; não pode depender de cache nem de visita prévia a outra tela.

**Superacao expressa da R-179 (10/09/2026).** A R-185 substitui apenas a proibicao de criar o
planejamento no modal generico. O motivo da reversao e operacional: o responsavel pela
transferencia inicial precisa deixar as transferencias de retorno do turno preparadas antes de o Caixa existir. A
execucao do dinheiro permanece exclusivamente no Caixa; nao retorna o antigo painel paralelo
“Programar entrega ao cofre”. As decisoes D4/D10/D11/D12 voltam a valer no que forem compativeis
com a R-185/R-188, agora com lacre e destino automático na conta de origem da ida, em gravação atômica.

Desenho completo da #41 — SQL, consulta read-only de duplicidade, rollback, `ON CONFLICT` e os três
RED — em [`33_IDEMPOTENCIA_VENDA_INTEGRADA_41.md`](33_IDEMPOTENCIA_VENDA_INTEGRADA_41.md).
A confirmação operacional que encerrou o P1-A está na §10.6 daquele documento.

---

### Mensagens administrativas para PDV e campanhas de bonificação (Marco, 15/09/2026)

Duas frentes novas, decididas por Marco na rodada de 15/09. Antes delas o sistema tinha **um** canal
de notificação com três tipos — quebra, divergência e prazo — e **nenhuma** noção de mensagem
administrativa, campanha, meta ou bonificação em nenhuma camada do monorepo (busca por
`campanha|meta de venda|comiss|premia|bonific|ranking|progresso` em `api/src`, `web-vue`,
`shared/src`, `db/src` e `db/migrations`: zero ocorrências).

| Id           | Regra                                                                                                                                                                                                                                                                                                                                          | Status |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **R-193** 🆕 | A mensagem administrativa é **um tipo do sino existente**, nunca um segundo sistema. `notificacoes.referencia_id` aponta para a **ENTREGA** (`mensagens_admin_entregas.id`), não para a mensagem — é isso que permite uma linha de sino por (destinatário, PDV) sem alterar o `notificacoes_tipo_destinatario_referencia_unica` que já existia | ✅     |
| **R-194** 🆕 | O pop-up do operador tem **"Entendi"** e **"Fechar"**, e eles não são sinônimos: "Entendi" grava `confirmada_em` e **encerra** (sai do sino); "Fechar" grava `fechada_em`, dispensa o pop-up **na sessão** e a mensagem **continua pendente no sino** até ser confirmada                                                                       | ✅     |
| **R-195** 🆕 | Operador alcançado **sem caixa aberto** gera entrega com `pdv_id` nulo. Se ele abrir um PDV enquanto a mensagem é válida e **ainda não confirmou**, a entrega existente é **promovida** (`pdv_id` e `fechamento_caixa_id` preenchidos na mesma linha). Se já confirmou, o histórico fica como está e **nada novo é criado**                    | ⏳     |
| **R-196** 🆕 | Alvos do envio: `caixas_abertos` é **foto do instante do envio** e não alcança quem chega depois; `empresa` resolve por **permissão efetiva `caixa_operar`**, nunca por nome de cargo; `pdv` e `empresa` alcançam quem abrir caixa enquanto `valido_ate` permitir. Destinatários são **deduplicados**                                          | ⏳     |
| **R-197** 🆕 | Apuração da campanha: data = **`vendas.data_referencia`** (dia de negócio, nunca `data_venda`); valor = **líquido** (`valor_original − valor_desconto + valor_acrescimo`); só vendas do **CREARE** (`integracao_chave_id is not null`); venda manual de retaguarda **fica fora** desta versão; **todas** as formas de pagamento contam         | ⏳     |
| **R-198** 🆕 | A campanha é **por PDV**, nunca por vendedor. Atribuição por `vendas.pdv_id`, **sem rateio individual**. Venda sem PDV vira linha **"não atribuída"**, visível para auditoria e **fora** da meta e da bonificação                                                                                                                              | ⏳     |
| **R-199** 🆕 | Progresso é **sempre calculado ao vivo** sobre `vendas`; **não existe** tabela, coluna ou cache de progresso. Cancelamento, reenvio do CREARE e troca de caixa refletem sozinhos. No fechamento o resultado é **somente informativo e auditável**: não altera caixa, financeiro, folha, contas nem gera bonificação automática                 | ⏳     |

**Elegibilidade da venda (R-197) — divergência deliberada da convenção do dinheiro.** Todo cálculo
financeiro deste sistema usa `computar = true AND status <> 'cancelado'` (`caixa.repository.ts`,
`17` §6), o que **inclui** `aguardando_aprovacao`. Marco decidiu o contrário para campanha:
**`status = 'aprovado'` estrito, além de `computar = true`**. Motivo registrado: campanha é
acompanhamento de meta e bonificação, e não pode avançar com venda ainda pendente de aprovação.
É a única fórmula do projeto que se afasta daquela convenção, e por isso está escrita aqui.

**Por que três tabelas e não colunas novas no sino.** `mensagens_admin` guarda o conteúdo,
`mensagens_admin_alvos` guarda **o que foi pedido** (é daí que sai a entrega de quem abre caixa
depois) e `mensagens_admin_entregas` guarda **a quem chegou, por PDV**. Uma primeira versão pendurava
os quatro carimbos em `notificacoes` e apontava `referencia_id` para a mensagem; Marco recusou
porque o unique existente colapsaria o mesmo operador em dois PDVs numa linha só, e porque os alvos
não ficariam persistidos. Com a correção, `notificacoes` recebeu **um único statement**: o `CHECK` do
tipo aberto para `mensagem_admin` e `campanha`. Zero coluna nova, zero backfill, zero linha histórica
tocada.

**Dois uniques parciais na entrega, não um.** Em PostgreSQL `NULL` nunca é igual a `NULL`, então
`unique(mensagem, destinatario, pdv_id)` sozinho deixaria entrar N linhas com `pdv_id` nulo para a
mesma pessoa. O par `..._por_pdv_idx` (`where pdv_id is not null`) + `..._sem_pdv_idx`
(`where pdv_id is null`) dá exatamente o que a R-193 pede: mesmo operador em dois PDVs = duas
linhas; sem PDV = exatamente uma. É também o que torna entrega e leitura **idempotentes**.

**Entrega offline sem push.** Não existe PWA, service worker nem SSE/WebSocket neste projeto
(`nuxt.config.ts` carrega um módulo só; zero `EventSource`/`WebSocket` em `api/src`, `web-vue` e
`shared/src`). Por isso "entregar quando voltar" **é** a linha esperando no banco: `entregue_em` é
carimbado na **primeira leitura bem-sucedida do cliente**, e `valido_ate` é o que faz uma mensagem
velha parar de alcançar gente sem apagar o histórico.

**Permissões (4, e só estas).** `mensagens_admin_enviar`, `mensagens_admin_visualizar`,
`campanhas_gerenciar`, `campanhas_visualizar` — todas de **emissor** e de **painel**. Quem recebe a
própria mensagem **não precisa de permissão nenhuma** para lê-la, confirmar ou fechar: a autorização
dele é ser o destinatário daquela entrega, na própria empresa. Não exigem migration (o catálogo é
_upsert_ a partir do TS em `db/bootstrap-prod.ts`), mas exigem rodar o bootstrap para a tela de
Permissões listar as chaves.

**Estado da entrega (15/09/2026).** Migrations `0037` (mensagens) e `0038` (campanhas) geradas pelo
fluxo normal e aplicadas **somente no banco local**, com backup antes. Schema Drizzle, contratos Zod
e testes unitários entregues e verdes. **Backend, telas, pop-up e painel de situação ainda não
existem** — por isso R-195 a R-199 estão ⏳. Produção, deploy e Coolify intocados.

**Defeito do gerador, registrado para a próxima vez.** O `drizzle-kit generate` emitiu o
`ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_id_empresa_unica" UNIQUE("id","empresa_id")` **depois** das
FKs compostas que dependem dele. Aplicada como veio, a migration falharia com
_"there is no unique constraint matching given keys for referenced table pdvs"_. Os statements foram
reordenados à mão no `.sql` antes de aplicar. **Toda migration que cria FK composta para uma tabela
que ainda não tem o par único precisa dessa conferência.**

### R-200 — Onde cada frente mora, e quem protege (Marco, 15/09/2026)

Decisão tomada depois de eu perguntar se criava as flags `menu_mensagens_*` e `menu_campanhas_*`.
A resposta foi **não**, e a razão vale mais que a regra: **permissão de navegação e regra de acesso
são coisas diferentes**, e misturar as duas foi o que já produziu caminho duplicado neste projeto.

| Frente        | Onde mora                                                                                                     | Ver                          | Agir                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| **Mensagens** | Dentro do **Monitor de caixas abertos**, na tela **Histórico de caixas**, como botão/painel "Enviar mensagem" | `mensagens_admin_visualizar` | `mensagens_admin_enviar`                               |
| **Campanhas** | **Uma única tela própria**, com item de menu                                                                  | `campanhas_visualizar`       | `campanhas_gerenciar` (criar/editar/encerrar/cancelar) |

**Mensagens não ganha rota nem item de menu.** Ela nasce onde o administrador já está olhando para os
caixas abertos — que é exatamente o alvo mais comum do envio. Uma tela separada duplicaria a lista de
caixas abertos que o monitor já mantém, e o monitor é a consulta autorizada única do histórico
(`web-vue/components/caixa/HistoricoCaixasPage.vue:110-128`).

**Nenhuma permissão `menu_*` nova.** Não é só preferência: o menu já funciona sem elas.
`telaVisivelNoMenu` (`web-vue/utils/domain.ts:350`) decide pelo **primeiro** ramo,
`temAcessoTela(item.permissao)`, e os ramos `menu_*` são alternativas. `permissaoMenuMostrar`
(`:334`) monta a string com `as Permissao` — é cast, não busca no catálogo — e `temPermissao` é um
`includes` que devolve `false` para chave inexistente. Campanhas aparece no menu para quem tem
`campanhas_visualizar` e some para quem não tem.

> **Consequência que fica registrada:** sem `menu_campanhas_desabilitado`, a tela **não tem estado
> "cinza/indisponível"** — ou aparece, ou some. É diferente das outras telas do menu. Foi aceito.

**O menu nunca é a única proteção.** As mesmas quatro permissões são exigidas no servidor, por
`preHandler`, em toda rota das duas frentes. Esconder o botão não é controle de acesso: o próprio
projeto já registrou em `db/src/referencia-permissoes.ts:23-27` o caso de
`fechamento_com_diferenca_visualizar`, que é **só gate de menu** e não é validada por rota nenhuma.
As chaves da R-200 não repetem esse erro.

**Quem recebe continua sem precisar de permissão.** Ler, confirmar ou fechar a própria mensagem não
exige chave nenhuma: a autorização é ser o destinatário daquela entrega, na própria empresa — o mesmo
desenho que o sino já usa hoje para quebra e transferência.

### R-201 — Campanha ativa também alcança abertura posterior (Marco, 15/09/2026)

Uma campanha ativa notifica quem já estava com caixa aberto no momento da ativação **e** quem abre
depois um caixa em PDV participante, desde que o dia de negócio da abertura esteja dentro do período
da campanha. A elegibilidade vem exclusivamente de `campanhas_pdvs`, `empresa_id`, status `ativa` e
intervalo `inicio`/`fim`; não existe lista de alvos, nova tabela ou segundo caminho de notificação.

O sino mantém no máximo uma notificação por `(campanha, usuário)`: o unique existente em
`notificacoes` torna repetições e corridas inofensivas. Falha ao criar esse aviso é registrada e não
impede a abertura do caixa, pois campanha continua sendo informativa e não altera nenhum valor
financeiro. Teste de integração cobre abertura posterior, idempotência, PDV não participante,
empresa diferente e data fora da vigência.

### R-202 — Regras de recebimento começam somente como referência testável (Marco, 15/09/2026)

Taxa, prazo, parcelas, vigência e fonte de uma forma de pagamento pertencem à forma e à empresa,
mas nesta etapa são **cadastro de referência/simulação**. Nenhuma regra pode alterar venda, saldo,
Caixa, conta, liquidação, DRE, folha ou lançamento enquanto a integração não trouxer os fatos
necessários (adquirente/terminal, parcela, NSU e liquidação). Cartão, Pix, voucher e crediário
continuam recebíveis, nunca dinheiro físico por inferência. Referência de mercado ou contrato
incompleto fica em `rascunho` e exige confirmação antes de qualquer efeito financeiro futuro.

### R-203 — Pagamento de Despesa e Mercadoria, vencimento e leitura operacional (Rodrigo/Marco, 15/09/2026)

**Somente o Administrador Geral** (`role = usuario_admin`) pode registrar ou corrigir pagamento com
data anterior ao dia contábil. Para Caixa, ao marcar pagamento em uma nova Despesa ou Mercadoria,
a data é obrigatoriamente o dia corrente; o servidor aplica a mesma trava, portanto não há como
retroagir ou antecipar por chamada direta. Os demais perfis de retaguarda preservam o agendamento
futuro que já existia, mas não podem retroagir. Editar um registro histórico sem modificar sua data
de pagamento continua permitido, para não bloquear correções legítimas.

Despesa e Mercadoria não pagas entram no sino para **Tesouraria, Financeiro, `admin` legado e
Administrador Geral** a três dias do vencimento, no vencimento e diariamente depois dele, até
pagamento, cancelamento ou alteração do vencimento para fora da janela. O aviso é operacional: não
bloqueia quitação depois de vencida, não movimenta dinheiro e não altera histórico; ciência já
registrada é preservada. A sincronização acontece junto da consulta do sino, sem cron paralelo ou
segundo canal de notificação.

Nas listagens de Despesas e Mercadorias, a observação não é exibida em linha: existe somente o botão
**Ver observação**, que abre o conteúdo sob demanda. As mesmas linhas mostram data/hora, PDV,
autor, vencimento, pagamento, status, valor e acesso aos anexos. Pago é verde; pendente/vencido é
visualmente destacado sem mudar o estado financeiro do lançamento.

---

### R-202 — Catálogo histórico do Pralis só pode preencher ambiente local de teste (Marco, 16/09/2026)

A R-165 continua vigente para produção: a planilha oficial é a única fonte que cria ou altera
produtos reais. Exceção estrita: o arquivo histórico `base-products.json` do app Pralis pode ser
importado **somente no banco local**, com comando explícito, para testar o cadastro de Produtos em
volume. O importador recusa `NODE_ENV=production` e qualquer banco fora de `localhost`, inicia em
dry-run e exige `--confirmar-local` para gravar.

Ele nunca atualiza ou apaga produto existente, nunca escreve fiscal e não inventa foto. EAN repetido
no próprio arquivo é ignorado e reportado, pois o ERP mantém a regra de uma leitura de código por
produto. Esta exceção não autoriza deploy, seed de produção, integração CREARE ou mudança da fonte
oficial.

### R-204 — Transferência de retorno / sangria só nasce e é executada dentro do Caixa (Rodrigo, 22/09/2026)

Retorno e sangria são o mesmo ato operacional e aparecem exclusivamente como **Transferência de retorno / sangria** dentro de um Caixa aberto. O modal genérico de transferências não cria novos retornos nem planejamentos. Linhas históricas já planejadas permanecem fatos auditáveis e podem somente ser executadas ou canceladas pelo fluxo existente até se encerrarem; não há apagamento, cancelamento silencioso ou reescrita histórica.

**Localização visual supersedida por solicitação explícita do usuário em 02/10/2026:** o retorno manual passa a ser acessado exclusivamente em **+Novo → Transferências → Retorno / sangria**, no mesmo host da aba **Nova transferência**. Sai o CTA de retorno da tela Caixa. Apenas a localização muda: retorno exige Caixa aberto e `caixa_operar`, mantém a API `POST /api/caixa/:id/transferencia-cofre`, saldo livre, composição física, lacre, responsável e idempotência atuais. A aba comum mantém sua permissão própria. Não se reabre planejamento, não se altera fechamento nem regra financeira. **+Novo** oferece somente **Saídas** e **Transferências**; Entradas permanece como consulta no menu.

### R-205 — Composição e conferência física do malote na abertura (Rodrigo, 22/09/2026)

Toda nova remessa Cofre → Caixa declara total, espécie e moedas, cuja soma precisa ser igual ao total. Ao abrir com lacre, o operador confere espécie e moedas. Se convergir, fica registrada a confirmação; se divergir, registra-se declarado, contado, diferença, relato obrigatório, operador e horário do servidor, notifica-se a Tesouraria e o Caixa abre com o total efetivamente contado. O valor declarado nunca é reescrito. A implementação deve definir e testar o efeito contábil antes da migration.

### R-206 — Fechamento com composição física, quebra e provas (Rodrigo, 22/09/2026)

No fechamento, o operador informa espécie e moedas físicas. Se o total contado divergir do saldo físico esperado, a diferença gera quebra auditada, com relato obrigatório, operador, horário do servidor e notificação à Tesouraria. Ao menos uma foto da folha física de fechamento é obrigatória; comprovantes/relatórios de cartão podem ser múltiplos. Anexos pertencem ao fechamento e aparecem no seu detalhe histórico. A futura IA apenas sugere discriminação a partir do anexo, nunca altera valores, e falha de leitura não invalida a foto.

### R-207 — Lacres do retorno manual e do fechamento (Rodrigo, 22/09/2026)

O lacre é obrigatório para a Transferência de retorno / sangria manual. O campo separado **Lacre do retorno no fechamento** é removido: no fechamento automático, o único lacre solicitado é o lacre obrigatório de fechamento. O histórico anterior não é alterado.

### R-208 — Consulta de vendas do turno nas Entradas do Caixa (Marco, 02/10/2026)

Clicar em **Entradas** abre uma consulta **somente leitura** das vendas vinculadas ao **Caixa aberto atual**. O Saldo do caixa não abre esta consulta porque também compõe transferências e demais movimentos físicos. Ela não é o Relatório de Vendas: o servidor deriva empresa, PDV, Caixa e intervalo operacional da própria abertura; o navegador só pode refinar por produto, forma de pagamento e horário. Não existe seletor de outro PDV, outra empresa ou outro Caixa, nem ações de editar, cancelar, anexar ou criar.

`caixa_operar` basta para o titular consultar o próprio Caixa aberto, mesmo sem `relatorio_vendas_visualizar`. `caixas_gerenciar` conserva a leitura administrativa permitida nas demais rotas de Caixa, sempre dentro da empresa autorizada. Vendas canceladas continuam na consulta de auditoria separada e não entram nesta lista nem no saldo. Venda manual vinculada ao Caixa aparece sem filtro de horário; quando o filtro de horário está ativo, ela fica fora porque não há instante real registrado para compará-la, e a tela deve avisar isso explicitamente.

### R-209 — Relatório de fechamento usa o período operacional congelado (Rodrigo, 02/10/2026)

O relatório do fechamento não consulta vendas por minuto nem deixa o operador escolher data, PDV ou intervalo. Ao confirmar a saída do Caixa, o servidor grava o corte; a etapa **Vendas do PDV** busca uma única vez as vendas e movimentações ocorridas entre a abertura já conferida e esse corte. Portanto, a primeira venda pertence ao Caixa somente depois de ele ter sido aberto no PDV, e a última pertence somente até o instante em que o operador inicia o fechamento.

Totais, formas de pagamento, canceladas e movimentos são de leitura para conferência; o navegador não recalcula saldo nem altera os fatos financeiros. A consulta usa `caixaId`, `dataHoraAbertura` e `dataHoraFechamento` derivados pelo servidor. Não há atualização automática, segundo botão de busca que mude o período, nem entrada posterior ao corte.

### R-210 — Relatório da maquininha é prova do turno, sem taxa financeira (Rodrigo, 02/10/2026)

A etapa de maquininha reproduz o fluxo operacional da referência: foto do relatório, leitura assistida opcional, revisão humana, número de série, valores de crédito, débito, Pix e voucher, além dos valores de início/fim quando o turno usar contador acumulado. “Líquido” significa **valor apurado no turno**, não desconto de taxa nem recebível líquido: na Manhã, é o valor lido no próprio relatório; na Tarde, é o valor acumulado da Tarde menos o acumulado da Manhã, sempre por forma de pagamento.

O relatório é evidência para conferência de cartões. Ele não compõe dinheiro físico, não credita o Cofre, não muda a fórmula canônica do Caixa e não autoriza inferir taxa, adquirente, liquidação ou disponibilidade bancária.

### R-211 — Encerramento operacional envia malote pendente à Tesouraria (Rodrigo, 02/10/2026)

Depois de informar físico, lacre, folha e eventuais divergências, o operador encerra as vendas e entrega o malote à Tesouraria. O retorno físico fica pendente de conferência: a Tesouraria recebe o dossiê e só confirma o valor contado no Cofre no seu próprio fluxo. O operador não volta ao Caixa aberto nem inclui vendas depois do corte.

Falta ou sobra preserva a regra R-206: a divergência exige relato, autoria e horário do servidor; falta gera quebra auditada e notificação, e sobra não cria quebra positiva. O encerramento do operador não transforma cartão, Pix, voucher ou crediário em dinheiro físico.

### R-212 — Cancelada é relato do CREARE, não uma segunda declaração no fechamento (Rodrigo, 02/10/2026)

Toda venda cancelada já exige no CREARE login/autorização do gerente e motivo do cancelamento. O fechamento apenas consulta e apresenta esse fato no período operacional congelado: venda, horário, valor, gerente/autorizador e motivo/justificativa registrados no CREARE. O operador do Caixa não grava áudio, texto nem nova justificativa para a mesma venda no Pralis.

O motivo aparece em modo somente leitura no relatório final e no dossiê da Tesouraria. Ausência de motivo no dado integrado é uma pendência de integração/auditoria visível, não uma oportunidade para reescrever o fato em outro sistema.

### R-213 — Recebimento físico é a única entrada de estoque (José, 08/10/2026)

Somente o ato de marcar um pedido como **Recebido**, depois da conferência física, aumenta o estoque. O saldo sobe pela **quantidade efetivamente conferida**, nunca pela quantidade inicialmente pedida, enviada, negociada ou confirmada. Criar pedido, enviá-lo ao fornecedor, negociar preço, confirmar o pedido, aprovar Mercadoria ou importar NF-e não altera estoque por si só. Toda entrada precisa deixar ator, data/hora do servidor, pedido, itens e quantidade recebida auditáveis; não existe campo livre para aumentar o saldo do produto.

Esta regra não define ainda recebimento parcial, saída por venda/produção/perda, ajuste de inventário ou o gatilho automático de reposição. Esses atos exigem decisão própria antes de qualquer implementação.

### R-214 — Pedido de Compra: fornecedor único e recebimento parcial auditável (José, 08/10/2026)

Todo **novo** pedido pertence a um único fornecedor. Itens destinados a fornecedores diferentes formam pedidos distintos; assim, envio por WhatsApp/formulário, negociação e estado do pedido continuam tendo uma única verdade. O `fornecedor_id` por item fica apenas como fato histórico dos pedidos antigos e deixa de ser caminho de escrita.

O recebimento pode ser parcial. Cada conferência física gera uma entrada auditável com quantidade por item, ator, hora do servidor e saldo anterior/posterior; essa quantidade entra no estoque imediatamente conforme R-208. Enquanto restar item pendente, o pedido fica em **Recebido parcialmente**. Ao alcançar as quantidades solicitadas, fica **Recebido**. Se o restante for cancelado, nenhum saldo já recebido é estornado: o cancelamento encerra apenas o que não chegou.

O ciclo novo é **A fazer → Enviado → Retornado → Confirmado → Recebido parcialmente → Recebido**, com **Cancelado** como estado terminal auditável. Estados legados `rascunho` e `aprovado` não ganham nova porta de escrita; permanecem apenas para leitura histórica até uma migração de dados aprovada por contagem e amostra.

O gerador `máximo − atual` é, por enquanto, uma **sugestão de reposição** acionada pelo Compras. Ele só poderá disparar sozinho quando venda, produção, perda e inventário também gerarem movimentos de estoque rastreáveis.

### R-215 — Módulo Compras: filtros e agenda de conferência (José, 08/10/2026)

O módulo **Compras** concentra Estoque, Conferências, Pedidos e Fornecedores no menu; Mercadorias e NF-e continuam sendo lançamentos/financeiro e não ganham uma segunda tela de compra. A listagem de estoque filtra por grupo, área, local de venda, local de estoque e Curva ABC.

**Área** e **Local de estoque** são dimensões distintas do produto. A Curva ABC entra inicialmente como classificação manual (`A`, `B` ou `C`), visível e filtrável; não haverá cálculo automático fingindo usar giro, faturamento ou margem sem a fórmula e o período definidos pelo negócio.

A **Conferência de estoque** agenda a contagem física com os mesmos filtros. Agendar ou concluir a agenda não altera saldo. A regra de ajuste de divergência (sobra/perda) fica bloqueada até ser decidida em regra própria.

O **agendador** de compras é uma data/recorrência para o comprador revisar ou gerar uma sugestão; não cria envio ao fornecedor e não é um robô autônomo. Enquanto venda, produção, perda e inventário não emitirem movimentos rastreáveis, o botão de reposição continua uma sugestão assistida, calculada por `estoque máximo − estoque atual` quando o saldo atingir o mínimo.

### R-216 — Cotação respondida pelo fornecedor por link (José, 16/10/2026)

O pedido não vai mais ao fornecedor como texto com a lista de itens. O Comprador clica em **Enviar cotação**; o sistema gera um link e abre o WhatsApp do fornecedor com uma mensagem curta e esse link. O link abre uma tela de cotação **sem login**, onde o fornecedor informa, por produto: valor atual, desconto em R$ **por unidade** ou em %, e pode marcar **Não tenho este produto**. A tela mostra nome do fornecedor, produto, quantidade, **último valor pago**, valor com desconto, total do item, total do pedido, total com desconto e um **desconto sobre o pedido todo**, rateado proporcionalmente entre os itens pelo maior resto, sem perder centavo. Previsão de entrega, condição de pagamento e observação são opcionais.

O link vale até o **fim do 2º dia útil** seguinte ao envio, no fuso do negócio. Feriado não é considerado porque o sistema não tem calendário de feriados. Dentro do prazo o fornecedor salva rascunho quantas vezes quiser pelo mesmo link; o rascunho salva sozinho. **Enviar** é ato único: recalcula tudo no servidor, grava os totais, muda o pedido para **Retornado** com o fornecedor como autor e fecha o link. Depois disso o link só informa que a cotação foi enviada.

**Último valor pago** é o preço efetivo por unidade, já com descontos, da cotação respondida mais recente daquele produto cujo pedido o Comprador **confirmou**. O fornecedor vê apenas o que foi pago **a ele mesmo**; o Comprador vê a referência de qualquer fornecedor. Mostrar ao fornecedor B o preço negociado com o concorrente A seria vazamento comercial (achado da revisão de segurança de 16/10/2026). Proposta respondida e não confirmada não vira referência. Mercadoria/NF-e ainda não alimenta esse número porque o vínculo com o pedido segue pendente.

**Enviado** só nasce da geração do link e **Retornado** só da resposta do fornecedor; a troca manual de situação ficou restrita a confirmar ou cancelar. Gerar novo link revoga o anterior; confirmar ou cancelar o pedido também encerra o link. A resposta não confirma o pedido nem mexe em estoque (R-208): quem confirma é o Comprador.

O token tem 256 bits, viaja no fragmento da URL e no cabeçalho `x-cotacao-token`, nunca em caminho ou query, e só o hash SHA-256 fica no banco — o mesmo desenho da ficha pública de admissão. O transporte por `wa.me` continua até a integração oficial da Meta (documento 51), que troca só o envio, não o formulário.

**Em aberto para decisão:** fornecedor que só responde por telefone hoje não tem como o Comprador registrar a resposta, porque `Enviado → Confirmado` foi retirado antes desta regra; mostrar o último valor pago ao fornecedor pode ancorar o preço dele para cima ou para baixo.

## §4 · Como isto deixa de ser mais um documento

Um registro que ninguém consulta é igual a não ter registro. O que o torna real:

1. **Prompt cita id.** "Implemente R-041 e R-044", não "coloque juros e data fiscal".
2. **Gate que falha.** Um script de CI que quebra o build se sobrar `data-pendente` no modal —
   porque `data-pendente` é a marca física de "campo que aparece e não salva", que é exatamente
   como R-041…R-046 morreram.
3. **Toda entrega atualiza a coluna Status aqui.** Sem isso, em três dias este arquivo mente.
4. **❓ é dívida, não conforto.** A auditoria de 31/07 eliminou os 15 `❓` restantes:
   3 regras comprovadas, 8 parciais/sem teste e 4 ausentes ou contrariadas pelo código.
