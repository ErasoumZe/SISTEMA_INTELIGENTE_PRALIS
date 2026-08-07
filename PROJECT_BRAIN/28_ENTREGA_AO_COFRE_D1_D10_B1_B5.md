# 28 · Entrega ao cofre — decisões D1–D10 e correções B1–B5

> 06/08/2026. Branch `101-c-01-fechamento-retorno-sangria` (issue **#101 reescrita**), Onda 4 do
> plano do `27`. Este documento existe porque as decisões desta entrega só viviam em comentários de
> código e em prompt — e prompt é descartável. O `27` §4 manda "reescrever a #101 porque ela
> descreve trabalho já implementado"; aqui está o que a #101 virou de fato.
>
> **Não confundir com o `20`.** Aquele responde "onde a entrega parou"; este responde "o que foi
> decidido e por quê".

---

## §1 · O problema que originou tudo

A sobra em espécie no fim do turno tinha três defeitos ao mesmo tempo:

1. **Retorno parcial era impossível** — a tela sempre mandava o saldo inteiro.
2. **Sangria durante o turno não tinha UI nenhuma.**
3. **Retorno e fechamento eram dois POSTs.** Se o operador lançasse o retorno e não fechasse, o
   caixa ficava aberto com saldo zero. Se fechasse antes, levava 400.

E, por baixo dos três, um defeito mais grave: **nada distinguia "entregar outros R$ 100" de "o POST
anterior caiu na rede".** Dois cliques entregavam o dinheiro duas vezes, com um envelope só.

---

## §2 · As decisões (D1–D10)

| Id      | Decisão                                                                                                                                                                                                                                                                                                                                           | Onde vive                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **D1**  | Entrega **parcial** é permitida durante o turno, **nunca acima do saldo em espécie**. O teto é recalculado no servidor, sob trava — o número que a tela viu não é prova.                                                                                                                                                                          | `caixa.service.ts` · `criarTransferenciaCofreCaixa`         |
| **D2**  | A entrega do operador **já abate o saldo físico** do caixa no instante em que é lançada.                                                                                                                                                                                                                                                          | `shared/caixa/regras.ts` · `transferenciaContaComoSaida`    |
| **D3**  | Mas nasce **`pendente`**: só entra no cofre quando quem opera a conta de destino conferir (R-028/R-036).                                                                                                                                                                                                                                          | `caixa.repository.ts` · `criarTransferenciaCofreRepository` |
| **D4**  | A **retaguarda programa** (`agendada`, não movimenta saldo); **o operador executa** (vira `pendente`). Dois atos, duas pessoas, só o segundo mexe em dinheiro.                                                                                                                                                                                    | `programarSolicitacaoCofre` / `executarSolicitacaoCofre`    |
| **D5**  | **Cada movimento tem o seu próprio lacre** (opcional, R-026; número novo, R-027). Movimento executado **nunca** é editado.                                                                                                                                                                                                                        | `registrarEntregaAoCofre`                                   |
| **D6**  | **Retorno final + fechamento são UM ato atômico.** O cliente não manda o valor: o servidor usa a sobra que ele mesmo apurou sob trava. Saldo já zero → só fecha.                                                                                                                                                                                  | `fecharCaixa`                                               |
| **D7**  | **Sobra ≠ déficit.** Sobra volta ao cofre e nunca vira quebra positiva. Déficit vira quebra nominal, com **observação obrigatória** e aviso na tela **antes** do clique.                                                                                                                                                                          | `fecharCaixa` + `CaixaResumoPage.vue`                       |
| **D8**  | `idempotencia_chave` é **nullable e sem default**: todo o histórico fica NULL, o índice parcial o ignora, **nenhum backfill** é necessário.                                                                                                                                                                                                       | migration `0030`                                            |
| **D9**  | A criação de retorno/sangria tem **um único caminho**. O `OperacaoTransferenciaModal` não cria mais — o componente que existia só para isso foi **removido**.                                                                                                                                                                                     | `OperacaoTransferenciaModal.vue`                            |
| **D10** | **O valor programado é IMUTÁVEL.** A Tesouraria pediu R$ 100 → a execução movimenta exatamente R$ 100, e não reescreve nem valor nem observação da programação. Mais que o programado sai por um movimento **avulso** próprio (chave e lacre novos); **menos** que o programado **não executa** a solicitação.                                    | `executarSolicitacaoCofre`                                  |
| **D11** | A **execução não tem chave de idempotência própria.** Ela é idempotente pelo `solicitacaoId` mais a transição atômica `status = 'agendada' → 'pendente'`. O único dado próprio do ato físico é o lacre.                                                                                                                                           | `executarSolicitacaoCofreRepository`                        |
| **D12** | **Solicitação `agendada` bloqueia o fechamento** até ser executada ou cancelada.                                                                                                                                                                                                                                                                  | `fecharCaixa` · `existeSolicitacaoAgendadaRepository`       |
| **D13** | **Sem CONFIRMADOR ELEGÍVEL no Cofre, nada que entregue dinheiro acontece** — avulsa, programação, execução e retorno final. Elegível = vinculado à conta em `contas_usuarios` **+** empresa certa **+** diferente do criador (R-028) **+** com `transferencias_conferir` na permissão efetiva. Fechamento **sem** retorno físico não é bloqueado. | `exigirConfirmadorDoCofre`                                  |
| **D14** | **Lacre é opcional na conferência (R-026).** Se o movimento tem lacre, a confirmação exige o mesmo e o rompe; se não tem, confirma-se sem inventar um.                                                                                                                                                                                            | `confirmarTransferenciaRepository`                          |

---

## §3 · As correções de robustez (B1–B5)

| Id     | O que estava errado                                                                                                                          | Correção                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **B1** | Dois fechamentos concorrentes sobrescreviam `fechado_por`, `fechado_em` e os sete totais do primeiro.                                        | `SELECT … FOR UPDATE` na linha do caixa **+** guarda `status = 'aberto'` no próprio `UPDATE`.                |
| **B2** | **Trava e teto não são idempotência.** Com saldo 300, dois POSTs idênticos de 100 passam os dois — o segundo ainda encontra 200 disponíveis. | Chave de idempotência **obrigatória**, `UNIQUE` parcial por `(empresa_id, chave)`, `ON CONFLICT DO NOTHING`. |
| **B3** | O operador descobria a quebra por snackbar vermelho, **depois** de fechar.                                                                   | Alerta nominal na tela antes do clique + observação obrigatória espelhada do servidor.                       |
| **B4** | Os POSTs do modal de transferência não eram idempotentes.                                                                                    | Caminho removido (D9); o que restou passa pela chave.                                                        |
| **B5** | `dataRecebimento` era estado morto no modal.                                                                                                 | Removido.                                                                                                    |

### Por que `ON CONFLICT DO NOTHING`, e não um `INSERT` cru

Com `INSERT` cru, o perdedor da corrida levanta `23505` e **aborta a transação inteira** — incluindo
o fechamento que estava sendo feito junto. Com `DO NOTHING` ele apenas não insere, devolve zero
linhas, e quem chama lê a linha vencedora e responde 200. A transação segue viva.

O `where idempotencia_chave is not null` no `ON CONFLICT` **não é decorativo**: reproduz o predicado
do índice parcial. Sem ele o Postgres não consegue inferir qual índice usar e recusa o comando.

### A chave é da CRIAÇÃO e nunca é sobrescrita — o bug que isso causou

Uma versão anterior desta entrega gravava uma chave nova na linha durante a **execução**. Isso
apagava a âncora da programação, e a sequência ficava assim:

1. a retaguarda programa com a chave K1;
2. o operador executa, e a execução grava K2 por cima;
3. um retry da programação com K1 não encontra mais a linha;
4. e **cria uma segunda solicitação** — uma ordem de dinheiro duplicada por um retry de rede.

Hoje `idempotencia_chave` pertence à criação e só à criação. A execução não tem chave nenhuma: ela
é idempotente pelo `solicitacaoId` mais a transição atômica `agendada → pendente` (D11).

Consequência direta: **o lacre e o status não fazem parte da intenção da programação.** Os dois
nascem depois. Se entrassem na comparação, o retry legítimo de K1 passaria a responder 409 assim
que alguém executasse.

### A ordem das checagens é regra, não estilo

Duas armadilhas que só a ordem certa resolve, ambas com teste próprio:

1. **Idempotência antes da unicidade do lacre.** O retry carrega o mesmo lacre. Se o lacre fosse
   checado primeiro, o retry morreria com _"Lacre já utilizado em outro movimento"_ — e o operador,
   achando que falhou, lançaria de novo com outro lacre. Duas entregas, um envelope.
2. **Idempotência antes do teto do saldo.** Saldo 100, entrega de 100: o primeiro POST zera o caixa.
   O retry encontraria saldo 0 e morreria com _"Caixa sem saldo"_ — mesmo desfecho errado.

---

## §4 · O que a tela passou a garantir

- A chave da **entrega avulsa** é da intenção, não da requisição: nasce no primeiro envio,
  **sobrevive a erro e a cancelamento**, e só é trocada quando o ato termina bem ou quando o
  operador muda de fato valor, lacre ou observação.
- A **execução de solicitação não tem chave** e não tem campo de valor: a tela mostra o valor
  programado no próprio botão, e o operador só informa o lacre.
- Os campos **só são limpos no sucesso confirmado**. Antes eram limpos logo após o `emit`, mesmo
  quando a API recusava — e o operador redigitava às cegas.
- A observação da **entrega** é separada da observação do **fechamento**. Misturar as duas fazia a
  nota do fechamento virar parte da intenção da entrega: qualquer correção no texto rodaria a chave
  e liberaria uma entrega dupla.
- Duplo clique bloqueado enquanto `salvando`, e teto do saldo espelhado na tela — com o servidor
  seguindo como autoridade.

---

## §5 · Migration 0031 — o que ela existe para resolver

Autorizada pelo José em 07/08, com a contagem de produção confirmada em **0 transferências
`cancelada`** (por isso as CHECKs nascem validadas, sem `NOT VALID` e sem backfill).

| Coluna / objeto                                          | Por que existe                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solicitacao_cofre_em`                                   | **Marcador de origem D4.** Sem ele, uma transferência genérica `agendada` ligada ao caixa aparecia como solicitação, bloqueava o fechamento e podia ser executada pelo endpoint D4. Tipo e destino não bastam: depois de executada, a solicitação é indistinguível de uma entrega avulsa. |
| `executado_por` / `executado_em`                         | **Identidade de quem entregou.** `criado_por` responde quem PROGRAMOU; a execução pode ser do gerente, de quem abriu o caixa ou do operador designado. A recusa notifica o executor — sem estas colunas notificaria a pessoa errada.                                                      |
| `cancelado_por` / `cancelado_em` / `motivo_cancelamento` | Auditoria do cancelamento. Cancelar não apaga a linha.                                                                                                                                                                                                                                    |
| `transferencias_conferencias_recusadas`                  | Trilha de recusas, **uma linha por tentativa**. `notificacoes` não serve: tem `UNIQUE(tipo, destinatário, referência)`, então a segunda tentativa não geraria registro.                                                                                                                   |

Duas armadilhas que as CHECKs fecham:

1. **`motivo_cancelamento IS NOT NULL` explícito.** Sem ele, `length(btrim(NULL)) > 0` avalia para
   `NULL`, o `OR` inteiro vira `NULL`, e o Postgres **aceita** a linha — a constraint existiria sem
   proteger o caso mais óbvio, que é cancelar sem dizer por quê.
2. **`transferencias_solicitacao_cofre_check`** amarra o ciclo de vida no banco: sem marcador não há
   executor; com marcador é obrigatoriamente Caixa→Cofre; `agendada`/`cancelada` não têm executor;
   `pendente`/`recebido` têm. Cancelar **depois** de executar fica impossível pelo banco, não só
   pelo serviço.

A tabela de recusas **não tem `empresa_id`** de propósito: a empresa vem da transferência, e sem a
coluna o par inconsistente (empresa A + transferência da empresa B) não é representável. A FK é
`ON DELETE RESTRICT` — auditoria financeira não some junto com o movimento.

---

## §6 · Conferência: estrita no Caixa→Cofre, intacta no resto

`/confirmar` passou a significar **"conferi e bateu"** — mas **só** para Caixa→Cofre (ligada ao
caixa, tipo `sangria`/`retorno`, destino igual à conta de cofre da empresa):

- `valorRecebido` é **obrigatório**;
- valor ou lacre divergente → **409**, sem confirmar e sem cancelar; o movimento fica `pendente`.

A divergência tem rota própria, `POST /api/transferencias/:id/recusar-conferencia`. Ela é separada
por uma razão estrutural: a recusa precisa ser **commitada**, e sinalizá-la por exceção dentro do
confirmar faria o rollback apagar o próprio registro auditável. O desfecho é `200 { registrada:
true, tentativas }` — nunca sucesso de confirmação.

**Transferência genérica não mudou**: `valorRecebido` continua opcional, divergência de valor
confirma e notifica, e `/recusar-conferencia` responde 404 para ela. Há teste de não-regressão.

### O DTO carrega `ehCaixaParaCofre`

O backend separou os dois fluxos, mas a **tela não tinha como saber em qual estava** — ela não
conhece a conta de cofre nem o tipo do movimento. O resultado era uma regressão só no front:
exigia valor em toda transferência, sempre mandava `valorRecebido`, e oferecia "Não bateu" numa
genérica, onde a rota de recusa responde 404.

A listagem passa a devolver `ehCaixaParaCofre`, calculado no servidor por `ehEntregaCaixaParaCofre`
— **a mesma função** que a conferência usa. Duas cópias do predicado divergiriam, e a tela voltaria
a oferecer o que a API recusa.

Na genérica, valor vazio **omite o campo** do payload em vez de mandar `0`: mandar zero faria o
servidor entender divergência de valor, confirmar assim mesmo e notificar uma divergência que não
existe.

### Autorização: uma regra, dois lados

`podeLancarSemCaixa` mudou de `api/src/auth/papeis.ts` para `@padaria/shared/autenticacao`. O painel
de programar entrega só existe quando há `transferencias_criar` **e** o papel de retaguarda — e a
tela importa a mesma função do serviço, nunca uma cópia da lista de cargos. `/api/caixa/abertos`
também valida o papel no serviço, não só no `preHandler`: o operador de Caixa tem
`transferencias_criar` e passaria pelo gate, recebendo a lista de todos os caixas abertos da
empresa. O botão "Conferir" só aparece com `transferencias_conferir`.

---

## §7 · Pendências e o que precisa de decisão do José

1. **D-6 do `26`:** _"fechar com déficit continua permitido?"_ A decisão 6 confirma **sim**, com
   observação obrigatória e aviso nominal (D7/B3).
2. **`valorRecebido` obrigatório muda a rotina da Tesouraria** em entregas do Caixa: conferir sem
   digitar o valor deixou de ser possível. Foi decidido em 07/08; fica registrado porque afeta quem
   opera todo dia.

---

## §8 · O que está provado por teste, e o que não está

**Provado** (88 testes de integração em Caixa + Transferências): retry da programação com K1 após a
execução; K1 persistida; K1 com intenção diferente → 409; execução repetida com o mesmo lacre → 200
e com lacre diferente → 409; duas execuções concorrentes → uma transição e um lacre; **retry e
corrida não trocam `executado_por`/`executado_em`**; programador e executor auditados
separadamente; valor e observação programados imutáveis; excedente por movimento avulso; saldo
insuficiente não executa; `agendada` bloqueia o fechamento; **transferência genérica agendada no
mesmo caixa não vaza para o D4** (não lista, não bloqueia, não executa, não cancela); ausência de
responsável do Cofre bloqueia avulsa/programação/fechamento com sobra e **não** bloqueia fechamento
sem sobra; **único responsável sendo o próprio criador também bloqueia**; cancelamento com
auditoria, retry sem duplicar, executada não cancelável, cancelada não executável, cancelada não
movimenta saldo nem aparece como movimento ativo e libera o fechamento; confirmação sem lacre
quando o movimento não tem; lacre inventado recusado; divergência mantém `pendente`; recusa grava
tentativa, reabre notificação, notifica o **executor**, e permite confirmar depois; genérica
preservada; sete totais congelados; fechamento concorrente; rollback.

**Não provado:** responsividade em 1440/1024/768/390 — o markup é mobile-first e foi revisado, mas
**a tela não foi aberta em nenhuma das quatro larguras**.
