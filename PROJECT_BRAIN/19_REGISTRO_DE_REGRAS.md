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

#### O dinheiro em trânsito e o prazo (José, 31/07)

| Id           | Regra                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-036** 🆕 | O valor **sai da origem no momento em que a transferência é criada**, e fica como **SALDO PENDENTE** até alguém confirmar. Espelha o físico: o malote saiu do cofre antes de chegar ao caixa                                              |
| **R-037** 🆕 | Estourado o tempo de confirmação (R-035), o sistema **trava** quem enviou **e** quem deveria ter confirmado. **Ambos recebem notificação**                                                                                                |
| **R-038** 🆕 | O bloco Retorno/Sangria da FOTO 1 são **sangrias independentes** do dia — cada linha é uma transferência própria, agrupadas na mesma tela por comodidade                                                                                  |
| **R-039** 🆕 | **Maquininha de cartão tem cadastro próprio** (nº de série, apelido, empresa), escolhida na abertura de caixa. **Preencher é OPCIONAL** e continua assim. Vem da FOTO 5 — são os 3 `data-pendente` de `CaixaResumoPage.vue` (José, 31/07) |

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

| Id    | Regra                                                                                                          | Origem                                                                | Status                                                                          | Teste                      |
| ----- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| R-001 | O dinheiro que vem do cofre para o caixa é **fundo de troco**, não empréstimo. O caixa não nasce devendo       | José, 24/07 — _"agora é fundo mesmo"_                                 | ✅                                                                              | `conta-fundo-saldo`        |
| R-002 | 🚫 ~~A transferência do malote deixa o caixa em déficit com o cofre~~                                          | José, 22/07                                                           | 🚫 revogada por R-001                                                           | —                          |
| R-003 | 🚫 ~~O valor que sai do cofre entra no caixa como despesa~~                                                    | José, 22/07                                                           | 🚫 revogada por R-001                                                           | —                          |
| R-004 | Saldo da conta = **fundo + entradas − saídas**, derivado. A coluna do fundo nunca é sobrescrita                | José, 29/07 (D8)                                                      | ✅                                                                              | `conta-saldo`              |
| R-005 | O filtro de dinheiro é sempre `computar = true AND status <> 'cancelado'` (ADR-001), igual no caixa e na conta | `17` §6                                                               | ✅                                                                              | integração                 |
| R-006 | Dinheiro só sai do cofre dentro de malote lacrado                                                              | José, 22/07                                                           | ⚠️ exige lacre em `transferencias.service.ts:36`, sem teste de cofre            | —                          |
| R-007 | Só o dinheiro **físico** transita pelo caixa; cartão e crediário não                                           | `02` (simulação Mobills)                                              | ❌ `caixa.repository.ts:748` soma toda venda, sem filtrar forma                 | —                          |
| R-008 | O caixa fecha **zerado**; a sobra volta ao cofre por transferência de retorno                                  | **José, 30/07 (C-02)**                                                | ✅ `caixa.service.ts:548`; `caixa-fluxo-completo.test.ts:166`                   | integração                 |
| R-009 | Fechamento com diferença **exige confirmação na tela** antes de salvar                                         | José, 24/07                                                           | ⚠️ usa `window.confirm` nativo                                                  | —                          |
| R-010 | Fechamento com diferença **registra quem** fechou                                                              | José, 24/07 e 31/07                                                   | ✅ `fechado_por` guarda o autenticado que fechou; a quebra continua no operador | `etapa2-quebra-maquininha` |
| R-011 | Fechamento com diferença **notifica** tesoureiro, gerente, financeiro e admin                                  | José, 24/07                                                           | ❌                                                                              | —                          |
| R-015 | Diferença no fechamento é **atribuída ao usuário do caixa**                                                    | **José, 30/07 (C-02)** — _"diferença atribuída a usuário caso tenha"_ | ⚠️ tela faz, mas dá "Erro interno" (D3)                                         | —                          |
| R-012 | Venda nunca é gravada com data futura; o dia é o `diaNegocio()` em `America/Sao_Paulo`                         | José, 23/07 (bug de fuso)                                             | ✅                                                                              | unit                       |
| R-013 | Venda atrasada entra no caixa fechado do período e marca **quando e qual venda** alterou o fechamento          | José, 31/07                                                           | ✅ trilha `alteracoes_pos_fechamento_caixa`, marca no histórico e detalhe       | `caixa-venda-integrada`    |
| R-014 | O caixa registra as vendas de **todo o período** do turno                                                      | José                                                                  | ✅ `caixa.repository.ts:686`; `alteracao-horario-revinculacao.test.ts:105`      | integração                 |

### LACRE E TRANSFERÊNCIA

| Id    | Regra                                                                                   | Origem                             | Status                                                                         | Teste      |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| R-020 | Contas nascem com o saldo da planilha como fundo, somente sem movimento anterior        | José, 31/07                        | ✅ aplicado no dev com guarda                                                  | seed       |
| R-021 | O lacre é um número único, de fonte física externa, **digitado à mão**                  | José                               | ✅                                                                             | —          |
| R-022 | **Não existe tela para criar malote.** O lacre nasce inline na transferência            | José, 27/07 (repetido 3×)          | ⚠️ tela oculta, não removida                                                   | —          |
| R-023 | O campo "malote (saco)" **não deve existir** na tela                                    | José — _"ja falei duzentas vezes"_ | ✅ removido                                                                    | —          |
| R-024 | A transferência com lacre do cofre para o caixa **gera** o malote                       | José                               | ❌ `transferencias.repository.ts:81` gera `lacre`, não `malote`                | —          |
| R-025 | Lacre obrigatório na ida                                                                | José                               | ⚠️ validado em `transferencias.service.ts:36`, sem teste                       | —          |
| R-026 | Lacre do retorno: **ver C-01** — obrigatório vs. opcional                               | José (as duas)                     | ⚠️ **contradição**                                                             | —          |
| R-027 | Cada movimento consome um lacre novo                                                    | `02`                               | ⚠️ `app.schema.ts:1601` impede reuso; sem teste da transferência manual        | —          |
| R-028 | Transferência tem duas pontas: quem envia e quem **confirma o recebimento**             | FOTO 1                             | ✅ `transferencias-confirmacao.test.ts:66` prova disputa e operador do destino | integração |
| R-029 | Transferência pode ser **agendada**                                                     | FOTO 1                             | ❌                                                                             | —          |
| R-030 | Transferência aceita **múltiplo destino** (rateio)                                      | FOTO 1                             | ❌                                                                             | —          |
| R-031 | Retorno/sangria vive **no mesmo formulário** da transferência (checkbox que expande)    | FOTO 1                             | ⚠️ `OperacaoTransferenciaModal.vue:189`, sem teste de componente               | —          |
| R-032 | **Transferência entre contas NÃO exige caixa aberto** — ela é o que habilita a abertura | derivado de R-024 + FOTO 5         | ❌ **bloqueia o fluxo novo**                                                   | —          |

### LANÇAMENTO

| Id    | Regra                                                                                                      | Origem                                         | Status                                                                                    | Teste                     |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| R-040 | Campo Valor = valor total da despesa                                                                       | José                                           | ✅                                                                                        | —                         |
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
| R-054 | Desconto nos 3 níveis, **cumulativos**, em R$ ou %                                                         | José                                           | ⚠️ **§2** — só backend                                                                    | integração                |
| R-055 | Desconto no total geral **rateia** e altera o unitário (afeta custo)                                       | José                                           | ✅ backend                                                                                | `discriminacao-descontos` |
| R-056 | Desconto aplicado direto no unitário não recalcula nada                                                    | José                                           | ✅                                                                                        | —                         |
| R-057 | Divergência nota × discriminação **bloqueia o salvar** e **mostra onde**                                   | José                                           | ⚠️ bloqueia ✅, "onde" ❌                                                                 | —                         |
| R-058 | Recorrência registra **e cria** os lançamentos futuros                                                     | José (D3)                                      | ✅                                                                                        | 10 integração             |
| R-059 | Recorrência: dia, semana, quinzena, mês, **ano**                                                           | José                                           | ✅                                                                                        | `recorrencia` unit        |
| R-060 | Teto por frequência: anual/trimestral por repetições; diária/semanal até 12 meses                          | José, 30/07 e 31/07                            | ✅                                                                                        | `recorrencia` unit        |
| R-063 | Cancelar série apaga somente lançamentos futuros não pagos                                                 | José, 31/07                                    | ✅                                                                                        | `recorrencia` integração  |
| R-061 | Domingo (ISO 7) entra na recorrência semanal                                                               | **José, 30/07 — decisão dele, não do desenho** | ✅                                                                                        | front                     |
| R-062 | Entradas vêm prontas da integração — não se lança venda à mão                                              | José                                           | ✅                                                                                        | —                         |

### PERMISSÃO

| Id    | Regra                                                                                   | Origem      | Status                                                                      |
| ----- | --------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| R-070 | **Só o admin tem todas** as permissões                                                  | José        | ✅                                                                          |
| R-071 | Usuário **sem vínculo não vê nenhuma conta**; admin vê todas                            | José, 27/07 | ✅                                                                          |
| R-072 | Ao cadastrar conta, o admin escolhe o **fundo** e **quem opera** — no mesmo salvar      | José (D8)   | ✅                                                                          |
| R-073 | Lançamentos aparece sempre para gerência, tesouraria, financeiro, diretor geral e admin | José        | ✅                                                                          |
| R-074 | Para o cargo **Caixa**, Lançamentos só com caixa aberto                                 | José        | ✅                                                                          |
| R-075 | Recorrência: só admin, gerência e financeiro (403 para os demais)                       | José (D3)   | ✅                                                                          |
| R-076 | **Gerência efetua, financeiro paga**                                                    | José        | ✅ matriz de referência + teste                                             |
| R-077 | Conferência é do financeiro, gerência e tesouraria                                      | José        | ✅ matriz de referência + teste                                             |
| R-078 | Permissões organizadas por módulo                                                       | José (D12)  | ⚠️ `utils/domain.ts:437` + `WorkspaceDialogs.vue:848`; sem teste            |
| R-079 | Existe um usuário de teste para **cada** cargo                                          | José        | ❌ `db/seed.ts:401` cobre 10 cargos e deixa `Operador de caixa` sem usuário |

### UI E MENU

| Id    | Regra                                                                                   | Origem                       | Status                                                                       |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| R-090 | **Um único botão Sair**, no menu do perfil                                              | José (repetido 3×)           | ✅ ação e implementação únicas em `AppShell.vue`                             |
| R-091 | Fechamento existe somente dentro de `/caixa`; rota de notificações é `/pendencias`      | José (repetido)              | ✅ páginas e componente antigos removidos                                    |
| R-092 | Modal único com **3 botões no topo** (despesa/mercadoria/retirada)                      | José                         | ✅                                                                           |
| R-093 | "+ Novo" tem **só** Entradas · Transferências · Saídas                                  | José                         | ✅                                                                           |
| R-094 | Subtítulos: "Vendas e faturamento" · "Entre contas" · "Despesa, mercadoria ou retirada" | José, 30/07                  | ✅ `utils/domain.ts`                                                         |
| R-095 | "Lançamentos" é categoria do menu; as listagens seguem separadas por categoria          | José (D6)                    | ✅ `utils/menu.test.ts:124-139`                                              |
| R-096 | Entradas lista **todas** as do dia, paginada                                            | José (D7)                    | ✅ `87ea945` — 16 testes de front + 6 de integração                          |
| R-097 | **Menu lateral simplificado pelo Xmind** do Rodrigo                                     | José, 30/07                  | ❌                                                                           |
| R-098 | Identidade visual **Cicluz Gestão Profissional** substitui Pralis                       | José, 30/07                  | ✅ sidebar, login, metadados e assets antigos removidos                      |
| R-099 | Primária permanece `#6515dd`; categorias mantêm as cores da planilha                    | José, 30/07                  | ✅ decidido                                                                  |
| R-100 | **Texto de tela é português com acento.** Identificador e commit, sem                   | eu, 30/07 — aprovado por ele | ⚠️ camada principal revisada; catálogo secundário/API ainda não              |
| R-101 | Nada de diálogo nativo do navegador (`window.confirm`)                                  | eu, 30/07                    | ✅ componente Vuetify reutilizável; zero ocorrências                         |
| R-102 | Responsivo em 1440 / 1024 / 768 / 390, sem scroll horizontal                            | José + `16`                  | ⚠️ breakpoints em `assets/main.css:1120-1303`; sem teste visual automatizado |

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

## §4 · Como isto deixa de ser mais um documento

Um registro que ninguém consulta é igual a não ter registro. O que o torna real:

1. **Prompt cita id.** "Implemente R-041 e R-044", não "coloque juros e data fiscal".
2. **Gate que falha.** Um script de CI que quebra o build se sobrar `data-pendente` no modal —
   porque `data-pendente` é a marca física de "campo que aparece e não salva", que é exatamente
   como R-041…R-046 morreram.
3. **Toda entrega atualiza a coluna Status aqui.** Sem isso, em três dias este arquivo mente.
4. **❓ é dívida, não conforto.** A auditoria de 31/07 eliminou os 15 `❓` restantes:
   3 regras comprovadas, 8 parciais/sem teste e 4 ausentes ou contrariadas pelo código.
