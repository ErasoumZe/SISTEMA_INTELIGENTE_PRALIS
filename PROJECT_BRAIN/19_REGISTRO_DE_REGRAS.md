# 19 — REGISTRO DE REGRAS (fonte única, numerada, verificável)

> **30/07/2026.** Este arquivo existe porque regras estavam se perdendo. Foram ditas no chat,
> implementadas pela metade, revogadas sem aviso, ou simplesmente esquecidas — e **nada quebrava**
> quando isso acontecia.
>
> Construído varrendo: o transcript **inteiro** desta conversa (incluindo o trecho compactado, com
> citação literal do José), os 18 arquivos do `PROJECT_BRAIN/`, a planilha, o Xmind e os 5 desenhos
> do Rodrigo.

## Como usar (o contrato)

1. **Toda regra tem um id `R-nnn`.** Prompt não descreve regra — prompt **cita o id**.
2. **Regra sem teste é regra que vai cair em desuso de novo.** A coluna `Teste` é o antídoto.
3. **Revogar é um ato explícito.** Muda o status para 🚫 aqui, com quem revogou e quando. Regra não
   some em silêncio.
4. **Contradição não se resolve implementando.** Vai para a §1 e espera decisão do José.

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

> **Decisão: vale o D5.** O campo de lacre no retorno **existe e pode ficar vazio**. O fechamento
> conclui sem ele. Apertar depois é mudança de validação, não de migration.

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
| **R-008**     | O retorno ao cofre é **lançado pela pessoa antes de fechar** — o sistema não cria sozinho      | E o sistema **recusa fechar se sobrar saldo**. Fiel ao que ela já faz na mão hoje                                                                        |
| **R-033** 🆕  | Abrir caixa **sem lacre é permitido** — abre zerado e o fundo chega depois                     | Não trava o operador na correria da manhã                                                                                                                |
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

| Id           | Regra                                                                                                                                          | Fala do José                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **R-029**    | **Agendamento executa sozinho na data** — o dinheiro sai e entra automaticamente                                                               | escolha de 31/07                                                                 |
| **R-028**    | **Só quem opera a conta de destino confirma** o recebimento (usa o vínculo `contas_usuarios`, FOTO 4). Quem envia não confirma o próprio envio | escolha de 31/07                                                                 |
| **R-030**    | **Múltiplo destino é DISPUTA, não rateio**                                                                                                     | ver abaixo                                                                       |
| **R-035** 🆕 | **Tempo de confirmação** — quem envia escolhe em quanto tempo o destino deve confirmar: 5min · 10min · 30min · 1h · 1 dia · 10 dias · 30 dias  | _"esse campo foi invenção da IA, ele na verdade é o campo tempo de confirmação"_ |

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

> **Complemento da R-035, decisão minha para o José vetar (31/07):** deixar a checkbox "Tempo de
> confirmação" **desmarcada não significa "sem prazo"** — significa aceitar o padrão de **1 dia**,
> que o servidor já aplica. Se "desmarcado" fosse "sem prazo", a **R-037** ficaria sem gatilho e
> transferência pendente viveria para sempre. A checkbox escolhe **outro** prazo, não a ausência
> dele.

#### O dinheiro em trânsito e o prazo (José, 31/07)

| Id           | Regra                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-036** 🆕 | O valor **sai da origem no momento em que a transferência é criada**, e fica como **SALDO PENDENTE** até alguém confirmar. Espelha o físico: o malote saiu do cofre antes de chegar ao caixa                                              |
| **R-037** 🆕 | Estourado o tempo de confirmação (R-035), o sistema **trava** quem enviou **e** quem deveria ter confirmado. **Ambos recebem notificação**                                                                                                |
| **R-038** 🆕 | O bloco Retorno/Sangria da FOTO 1 são **sangrias independentes** do dia — cada linha é uma transferência própria, agrupadas na mesma tela por comodidade                                                                                  |
| **R-039** 🆕 | **Maquininha de cartão tem cadastro próprio** (nº de série, apelido, empresa), escolhida na abertura de caixa. **Preencher é OPCIONAL** e continua assim. Vem da FOTO 5 — são os 3 `data-pendente` de `CaixaResumoPage.vue` (José, 31/07) |

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
| R-033          | ✅     | abertura sem lacre continua permitida e pode começar zerada                                                                               |
| R-039          | ✅     | cadastro de maquininha por empresa, série, apelido e estado; seleção opcional na abertura                                                 |
| R-025/R-027    | ✅     | transferência manual exige lacre novo; confirmação rompe o lacre atomicamente e impede reuso                                              |
| R-028/R-030    | ✅     | só operador de conta destino confirma; disputa entre múltiplos destinos tem uma única atualização vencedora                               |
| R-029/R-035    | ✅     | agendamento e prazo persistem; processo periódico ativa o agendamento e calcula o vencimento                                              |
| R-036          | ✅     | origem é debitada já no estado pendente; destino só recebe após confirmação; pendente é exibido fora do disponível                        |
| R-037          | ✅     | prazo vencido notifica origem e destinos, bloqueia mutações e permite liberação auditada por Tesouraria/Gerência/Admin                    |
| R-038          | ✅     | linhas de retorno/sangria do modal são gravadas como transferências independentes, cada uma com seu lacre                                 |

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

| Id    | Regra                                                                                | Origem                             | Status                                                                         | Teste                        |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| R-020 | Contas nascem com o saldo da planilha como fundo, somente sem movimento anterior     | José, 31/07                        | ✅ aplicado no dev com guarda                                                  | seed                         |
| R-021 | O lacre é um número único, de fonte física externa, **digitado à mão**               | José                               | ✅                                                                             | —                            |
| R-022 | **Não existe tela para criar malote.** O lacre nasce inline na transferência         | José, 27/07 (repetido 3×)          | ⚠️ tela oculta, não removida                                                   | —                            |
| R-023 | O campo "malote (saco)" **não deve existir** na tela                                 | José — _"ja falei duzentas vezes"_ | ✅ removido                                                                    | —                            |
| R-024 | 🚫 ~~A transferência com lacre do cofre para o caixa **gera** o malote~~             | José                               | 🚫 revogada pela **R-040** (31/07): o malote-entidade deixou de existir        | —                            |
| R-040 | **Abrir o caixa informando o lacre É confirmar o recebimento da transferência**      | José, 31/07                        | ✅ `caixa.service.ts:287`; 8 testes de integração                              | `caixa-abertura-lacre`       |
| R-025 | Lacre obrigatório na ida                                                             | José                               | ✅ validado pelo serviço e por integração                                      | `transferencias-confirmacao` |
| R-026 | Lacre do retorno é **opcional**; se ausente, o servidor gera identificação técnica   | José, 30/07 (C-01)                 | ✅ decisão reconciliada e retorno sem digitação de lacre                       | `caixa-retorno-sangria`      |
| R-027 | Cada movimento consome um lacre novo                                                 | `02`                               | ✅ UNIQUE no banco e tentativa de reuso rejeitada pela API                     | `transferencias-confirmacao` |
| R-028 | Transferência tem duas pontas: quem envia e quem **confirma o recebimento**          | FOTO 1                             | ✅ `transferencias-confirmacao.test.ts:66` prova disputa e operador do destino | integração                   |
| R-029 | Transferência pode ser **agendada**                                                  | FOTO 1                             | ✅ persistência e efetivação temporal                                          | `transferencias-confirmacao` |
| R-030 | Transferência aceita **múltiplo destino** (disputa; um destino confirma)             | FOTO 1                             | ✅ candidatos persistidos e confirmação concorrente com um vencedor            | `transferencias-confirmacao` |
| R-031 | Retorno/sangria vive **no mesmo formulário** da transferência (checkbox que expande) | FOTO 1                             | ✅ componente abre os campos no próprio formulário ao marcar a checkbox        | `TransferenciaRetornoCampos` |
| R-032 | **Transferência entre contas NÃO exige caixa aberto** para perfis autorizados        | derivado de R-024 + FOTO 5         | ✅ gestão transfere livre; Caixa continua exigindo caixa aberto e conta do PDV | `lancar-sem-caixa`           |

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

| Id    | Regra                                                                                                                                                             | Origem       | Status | Teste                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ | ------------------------------------------------------ |
| R-137 | **Transferência entre contas bancárias não exige lacre.** É a única exceção à R-025                                                                               | José p.12-13 | ❓     | —                                                      |
| R-138 | **Tempo de confirmação é obrigatório com múltiplos destinos** e opcional na transferência direta conta→conta. Motivo: pendência longa trava o caixa               | José p.14-15 | ⚠️     | R-035 cobre o campo, não a obrigatoriedade condicional |
| R-139 | **Divergência de valor no recebimento resolve-se fisicamente, fora do sistema.** O sistema registra observação e notifica os dois lados; não há acerto automático | José p.15    | ❓     | —                                                      |
| R-140 | **Só a transferência de retorno é feita pelo operador de caixa.** Saída do cofre e demais movimentações entre contas são da tesouraria, algumas da gerência       | José p.64    | ✅     | R-032                                                  |

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

| Id    | Regra                                                                                                                                                                                              | Origem           | Status                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| R-145 | **A fonte do cadastro de produtos é a planilha do Rodrigo**, não o cadastro do CREARE. **Os dados fiscais da planilha NÃO serão importados** — estão errados e causam pagamento de imposto a maior | José p.42, 49-50 | ✅ cumprida no seed (`seed-planilha.ts` não grava campo fiscal). ⚠️ ver conflito de fontes em `24` §4 |
| R-146 | Produto tem dois tipos: **revenda** e **transformação**. Preço de venda = custo × margem, com opção de digitar manual                                                                              | José p.43-44     | ✅ implementada e testada (`shared/src/produtos/regras.ts`, 20 testes)                                |
| R-147 | A **promoção** só se aplica com produto cadastrado, mesmo código e dentro da janela de vigência. Fora dela, volta o preço normal                                                                   | José p.47        | ⚠️ janela de vigência pronta; falta o "mesmo código", que depende do PDV                              |
| R-148 | **Pedido automático** dispara no estoque mínimo, na quantidade que falta para o máximo. **O comprador sempre aprova ou reprova**; pode deixar rascunho que se auto-aprova no mínimo                | José p.36, 56    | ❌ só existem as colunas de estoque mín./máx.; nenhuma lógica de disparo                              |

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
- **Sangria/retorno e o fechamento não ganharam porta nova**: já tinham teto próprio sobre o saldo
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

---

## §4 · Como isto deixa de ser mais um documento

Um registro que ninguém consulta é igual a não ter registro. O que o torna real:

1. **Prompt cita id.** "Implemente R-041 e R-044", não "coloque juros e data fiscal".
2. **Gate que falha.** Um script de CI que quebra o build se sobrar `data-pendente` no modal —
   porque `data-pendente` é a marca física de "campo que aparece e não salva", que é exatamente
   como R-041…R-046 morreram.
3. **Toda entrega atualiza a coluna Status aqui.** Sem isso, em três dias este arquivo mente.
4. **❓ é dívida, não conforto.** A auditoria de 31/07 eliminou os 15 `❓` restantes:
   3 regras comprovadas, 8 parciais/sem teste e 4 ausentes ou contrariadas pelo código.
