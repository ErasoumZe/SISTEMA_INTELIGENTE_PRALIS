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

## §1-A · Estado vigente após R-185/R-187 (11/09/2026)

A Fatia 3 continua correta ao remover o painel paralelo **“Programar entrega ao cofre”** e suas
rotas antigas. O que mudou depois foi a forma de preparar o turno: o modal genérico de nova
transferência pode declarar, atomicamente com a ida, várias **Transferências de retorno**.

- cada linha tem valor, lacre obrigatório e destino próprio;
- a soma planejada pode ser menor ou igual à ida, nunca maior;
- a linha nasce `agendada`, sem efeito no saldo;
- ao abrir o Caixa pelo lacre da ida, os planos são vinculados ao turno;
- o dinheiro só sai quando o operador executa a linha dentro do Caixa;
- planejado ou executado aguardando conferência bloqueia o fechamento;
- destino não precisa ser o Cofre; a conta escolhida é quem confere e recebe. Outra conta de PDV
  não é aceita neste contrato porque uma transferência não pode pertencer simultaneamente a dois
  Caixas; entre PDVs exige fluxo próprio de suprimento/recebimento;
- todo escritor novo usa `tipo = 'retorno'`; `sangria` existe apenas em leitura histórica;
- cancelamento é exclusivo da retaguarda, pode ocorrer antes ou depois do vínculo com o Caixa e
  preserva linha, motivo, autor e horário.

Portanto, os trechos históricos abaixo que dizem “sem produtor de `agendada`”, “sem escritor” ou
“o modal não planeja” estão **superados por esta seção**. Eles permanecem para documentar por que o
painel antigo foi removido, não para orientar implementação nova.

---

## §2 · As decisões (D1–D10)

> ⚠️ A implementação antiga de D4/D10/D11/D12 foi revogada na Fatia 3. A intenção operacional
> voltou com a R-185 por outro desenho, descrito na §1-A: declaração no modal, execução no Caixa e
> nenhum painel paralelo.

| Id      | Decisão                                                                                                                                                                                                                          | Onde vive                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **D1**  | Entrega **parcial** é permitida durante o turno, **nunca acima do saldo em espécie**. O teto é recalculado no servidor, sob trava — o número que a tela viu não é prova.                                                         | `caixa.service.ts` · `criarTransferenciaCofreCaixa`                 |
| **D2**  | A entrega do operador **já abate o saldo físico** do caixa no instante em que é lançada.                                                                                                                                         | `shared/caixa/regras.ts` · `transferenciaContaComoSaida`            |
| **D3**  | Mas nasce **`pendente`**: só entra no cofre quando quem opera a conta de destino conferir (R-028/R-036).                                                                                                                         | `caixa.repository.ts` · `criarTransferenciaCofreRepository`         |
| **D4**  | A **retaguarda declara** o retorno junto da transferência inicial (`agendada`, sem saldo); **o operador executa** no Caixa (vira `pendente`). Só o segundo ato mexe em dinheiro.                                                 | `criarRetornosPlanejadosRepository` / `executarPlanejamentoRetorno` |
| **D5**  | **Cada movimento tem o seu próprio lacre.** No retorno planejado ele é obrigatório; no avulso/final permanece opcional (R-026). Movimento executado nunca é editado.                                                             | `criarRetornosPlanejadosRepository` / `registrarEntregaAoCofre`     |
| **D6**  | **Retorno final + fechamento são UM ato atômico.** O cliente não manda o valor: o servidor usa a sobra que ele mesmo apurou sob trava. Saldo já zero → só fecha.                                                                 | `fecharCaixa`                                                       |
| **D7**  | **Sobra ≠ déficit.** Sobra volta ao cofre e nunca vira quebra positiva. Déficit vira quebra nominal, com **observação obrigatória** e aviso na tela **antes** do clique.                                                         | `fecharCaixa` + `CaixaResumoPage.vue`                               |
| **D8**  | `idempotencia_chave` é **nullable e sem default**: todo o histórico fica NULL, o índice parcial o ignora, **nenhum backfill** é necessário.                                                                                      | migration `0030`                                                    |
| **D9**  | Há um único ato financeiro de retorno: execução dentro do Caixa. O modal apenas declara o planejamento; o painel paralelo antigo não volta.                                                                                      | `OperacaoTransferenciaModal.vue` / `CaixaResumoPage.vue`            |
| **D10** | **O valor planejado é imutável.** A execução movimenta exatamente o valor da linha; excedente sai por movimento avulso/final próprio.                                                                                            | `executarPlanejamentoRetorno`                                       |
| **D11** | A execução é idempotente pela identidade do planejamento e pela transição atômica `agendada → pendente`; valor, lacre e destino já foram definidos na declaração.                                                                | `executarPlanejamentoRetornoRepository`                             |
| **D12** | **Planejamento `agendada` bloqueia o fechamento** até ser executado ou cancelado pela retaguarda; o cancelamento auditado também existe antes da abertura. Executado bloqueia até a conta destino conferir/encerrar divergência. | `fecharCaixa` / `cancelarPlanejamentoRetorno`                       |
| **D13** | Sem confirmador elegível na conta destino, o retorno não é executado. Elegível = vínculo em `contas_usuarios`, empresa certa, permissão `transferencias_conferir` e pessoa diferente de quem planejou e executou.                | `exigirConfirmadorDaConta`                                          |
| **D14** | Se o movimento tem lacre, a confirmação exige o mesmo e o rompe; retorno planejado sempre tem lacre, enquanto avulso/final pode não ter (R-026).                                                                                 | `confirmarTransferenciaRepository`                                  |

---

## §2-A · Histórico: a D9 foi confirmada em 27/08 e superada parcialmente pela R-185

> ⚠️ Esta seção registra a decisão de 27/08. A proibição de planejar no modal foi superada pela
> R-185; continuam vigentes a execução financeira dentro do Caixa e a proibição do painel paralelo.

Ao preparar a **#101**, o texto da issue pedia o contrário da **D9**: recolocar a marcação
**Transferência de Retorno / Sangria** dentro do modal **“+ Nova transferência”**. As duas leituras
queriam **um** caminho único e discordavam sobre **qual**.

**Marco decidiu em 27/08: vale a D9.** Virou a **R-179**.

> `Caixa aberto → registrar sangria/retorno no próprio Caixa → entrega ao cofre → fechamento`

O motivo é operacional: **quem faz sangria é o operador de caixa, de dentro do Caixa** — não a
Tesouraria pelo cockpit. Recolocar o bloco no modal criaria de novo o segundo caminho que a D9
removeu de propósito.

**O legado a remover continua sendo a tela/caminho “Programar entrega ao cofre”**
(`SolicitacoesCofrePainel` e as rotas `/api/caixa/:id/solicitacoes-cofre*`), na entrega apropriada da
#101 — e **nunca** o fluxo do Caixa. `TransferenciaRetornoCampos` **não** será recriado.

> ✅ **Executado na Fatia 3, em 09/09/2026.** O parágrafo acima está no passado: painel, rotas,
> serviço, repositório e contratos foram removidos. Ver **§11**.

O texto da issue #101 foi atualizado para não contradizer esta decisão.

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

---

## §9 · G1 da #101 — dinheiro que JÁ SAIU também trava o fechamento (27/08/2026)

A **D12** acima resolveu metade da R-171: enquanto houver solicitação **`agendada`** — dinheiro que
**ainda não saiu** — o caixa não fecha. A outra metade ficou aberta por engano de escopo: uma
entrega **feita de verdade** e ainda não conferida no cofre **não impedia nada**.

O caixa fechava por cima dela. O operador ia embora. Se o cofre encontrasse falta depois, **a
divergência não tinha mais turno aberto onde cair**.

### A guarda

Em `fecharCaixa`, logo depois da guarda da D12:

- lida **depois da trava** da linha do caixa e **antes** do retorno final (D6/D7). Por isso o próprio
  ato de fechar **não se auto-bloqueia**: a guarda enxerga o estado anterior ao ato;
- **corrida resolvida por construção**: o fechamento já segura a linha do caixa em `FOR UPDATE` e
  `confirmarTransferencia` pede `FOR SHARE` na **mesma** linha antes de mudar o status. As duas
  serializam, então este `SELECT` nunca decide sobre um retrato velho;
- a mensagem **nomeia** as entregas (tipo, valor, lacre), até três e depois "e mais N". "Não pode
  fechar" sozinho manda o operador adivinhar entre as entregas do turno.

### Escopo — e a porta lateral que continua aberta

O escopo é o **predicado canônico** de entrega Caixa → Cofre: caixa vinculado, tipo
`sangria`/`retorno`, destino = conta cofre da empresa.

> ⚠️ **Sabidamente incompleto.** O operador ainda pode mandar dinheiro da conta do PDV para o cofre
> pela rota **genérica** `POST /api/transferencias`: lá o `tipo` não está no payload e nasce
> `suprimento`, então a linha não é entrega canônica e **não trava** — embora fisicamente seja o
> mesmo ato. Fechar essa porta significaria alargar a guarda para além do predicado canônico, e é
> **exatamente** o caminho duplicado que a fatia de remoção do legado existe para eliminar.
> Nenhum teste fixa esse comportamento: pinar um furo é transformá-lo em contrato.

### `entrega-cofre.repository.ts` — a regra ganhou casa

A consulta nasceu colada a `ehEntregaCaixaParaCofre`, mas o `lint:deps` cobrou o ciclo
`caixa.service → transferencias.repository → lancamentos.dominio → caixa.service`.

A saída **não** foi duplicar o predicado. Os dois dialetos da mesma regra — TS e SQL — passaram a
morar num módulo que só conhece Drizzle, o schema e a conexão. Qualquer camada pode depender dele.

### `entregasPendentes` viaja dentro do status

`caixaStatusSchema` ganhou o campo, **obrigatório e nunca opcional**: ausente teria de significar
"não há", e um dia significaria "a rota esqueceu de mandar". Para garantir isso, o literal que
montava o status — repetido em **oito** lugares — virou uma porta só, `statusDoCaixaAberto`.

### A tela

Bloco próprio (`EntregasAguardandoConferencia.vue`), lido como manifesto de transporte: um trilho
vertical liga as entregas em trânsito, cada uma com **valor, tipo, lacre e hora**. Não é vermelho —
dinheiro a caminho do cofre não deu errado, só ainda não chegou; foi criado o token
**`--cx-attention`**, que faltava na camada.

**O botão de fechar continua focável.** Travado, recebe `aria-disabled` e **não** `disabled`: botão
morto sai da navegação por teclado e o leitor de tela nunca chega ao motivo. Clicar leva ao bloco da
trava.

**Um caminho duplicado foi fechado de passagem:** a D12 vivia **só no servidor** — a tela mostrava a
solicitação e **não** desabilitava o botão, então o operador clicava e levava um 400 previsível.
Agora as duas travas têm **uma** computada e **um** motivo, em `utils/fechamento-travas.ts`.

### O que está provado

`tests/integration/caixa/fechamento-transferencia-pendente.test.ts`, **8 casos**: recusa citando a
operação; conferência libera e o retorno final nasce `pendente` sem se auto-bloquear; recusa de
conferência **não** libera; pendência de outro caixa não trava; escopo pelo tipo e escopo pelo
destino; nada gravado pela metade; corrida com a conferência em voo, por `pg_blocking_pids`.

**Mutação:** apagar a guarda mata 4 casos. Apagar o critério do destino **sobreviveu** na primeira
tentativa — e o achado foi um **falso verde**: a transferência genérica era criada pela retaguarda e
nascia com `caixa_id` nulo, então os casos de escopo passavam sem exercitar escopo nenhum. Corrigido
(lançada pelo operador, com asserção de `caixa_id`), a mutação morre.

**Quatro testes existentes** fixavam o comportamento antigo e foram atualizados incluindo a
conferência antes do fechamento. O de idempotência ficou mais forte: prova que executar a ordem da
Tesouraria **troca uma trava pela outra**.

### O que ainda não está resolvido

**Não existe válvula de escape.** A R-171 manda bloquear o fechamento comum **e** concluir o turno
por um fluxo especial auditado. Esta entrega traz só o bloqueio. Até o fluxo especial existir, um
caixa com entrega não conferida **não fecha** — se o responsável pelo cofre já foi embora, o turno
fica aberto. **Implantar esta fatia sozinha não é recomendado.**

**Assimetria conhecida:** o retorno final criado pelo **próprio fechamento** também nasce `pendente`
e não trava. A diferença é de auditoria — ele nasce dentro do ato de fechar, com autor, horário e
valor amarrados ao fechamento; uma sangria de quatro horas atrás não tem esse vínculo. É o fluxo
especial auditado que resolve isso de vez.

---

## §10 · A saída da R-171 e o legado — decisões de Rodrigo (01/09/2026)

O §9 fechou dizendo que **não existe válvula de escape** e que implantar aquela fatia sozinha não
era recomendado. Rodrigo respondeu as duas perguntas que faltavam. Elas estão no `19` como
**R-181** e **R-182**; aqui fica o que o código já sustenta e o que ainda não.

### §10.1 · Recusa no cofre termina em quebra auditada (R-181)

Quando o cofre confere e **não bate**, o dinheiro não volta: ele saiu do caixa de verdade. O
caminho oficial passa a ser registrar a **diferença como quebra auditada** — valor, responsável e
justificativa — e fechar o turno. Três não-caminhos ficam explícitos:

- **não cancelar** a transferência: `cancelada` não conta como saída
  (`shared/src/caixa/regras.ts:101`), então cancelar faria o dinheiro **reaparecer** no caixa;
- **não confirmar** um valor que ninguém contou — era o único destravamento existente, e ele
  premiava a mentira;
- **não deixar o turno aberto**, que é o que acontece hoje e pode travar o PDV no dia seguinte
  (`fechamentos_caixa_pdv_aberto_unico_idx`).

### §10.2 · O legado da rota antiga é reclassificado (R-182)

As linhas que nasceram `tipo = 'suprimento'` indo da conta do PDV para a conta cofre — a porta que
a #101 fechou em `e0a5b2c`, `8c491f0` e `5ce948d` — são **reclassificadas para `retorno`/`sangria`**,
preservando integralmente a auditoria. Reclassificar é corrigir o **rótulo** de um fato ocorrido, e
não reescrever o fato: valor, contas, datas, lacre, autoria e `criado_em` ficam intactos.

### §10.3 · O que o modelo atual já sustenta (leitura, sem inventar campo)

| Precisa de…                                          | Já existe                                                                                                                                                                                                             | Onde                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| trilha do "conferi e não bateu"                      | `transferencias_conferencias_recusadas` — `motivo` NOT NULL, `valor_informado`, `lacre_informado`, `recusado_por`, `criado_em`, **uma linha por tentativa**, FK `RESTRICT`                                            | `db/src/schema/app.schema.ts:1721`                      |
| diferença com valor, dono e justificativa            | `quebras_caixa` — `valor <> 0`, `observacao` não vazia, FK composta com o fechamento                                                                                                                                  | `db/src/schema/app.schema.ts:1905`                      |
| distinguir os dois fluxos de entrega                 | `tipo` + `caixa_id` + destino = conta cofre (predicado canônico)                                                                                                                                                      | `api/src/transferencias/entrega-cofre.repository.ts:22` |
| cancelamento auditável (para o que **é** cancelável) | `transferencias_cancelamento_check` exige autor, data e motivo juntos                                                                                                                                                 | `app.schema.ts:1651`                                    |
| reclassificar `tipo` sem violar constraint           | legado tem `solicitacao_cofre_em is null`, então cai no **primeiro ramo** do `transferencias_solicitacao_cofre_check`, que não olha `tipo`; e `transferencias_recebimento_check` já é satisfeito por linha `pendente` | `app.schema.ts:1668` e `:1692`                          |

### §10.4 · As três lacunas — o modelo **não** cobre isto hoje

1. **`quebras_caixa` não sabe de onde veio a diferença.** Não há coluna apontando a transferência
   divergente nem distinguindo "faltou na contagem do caixa" de "faltou no malote conferido no
   cofre". Pior: `quebras_caixa_fechamento_unico` (`app.schema.ts:1924`) permite **uma quebra por
   fechamento** — um turno com diferença de contagem **e** divergência no cofre não é representável.
2. **Falta o estado terminal da entrega recusada.** Os quatro status são `pendente`, `recebido`,
   `agendada`, `cancelada` (`app.schema.ts:1648`). `pendente` eterniza, `recebido` afirma que bateu,
   `cancelada` devolve o dinheiro ao caixa. Nenhum diz "saiu, não chegou inteiro, a diferença virou
   quebra".
3. **A quebra só nasce dentro do fechamento.** `criarQuebraCaixaRepository`
   (`api/src/caixa/caixa.repository.ts:306`) tem um único chamador, `fecharCaixa`, e o valor vem do
   saldo apurado sob trava — não de uma divergência informada. Uma recusa que chegue **depois** do
   fechamento não tem onde cair.

Nenhuma das três se resolve com leitura: são decisão de modelagem da Fatia 2, e ficam registradas
aqui para não serem redescobertas.

### §10.5 · Critério técnico da linha legada

Uma linha entra na população da R-182 quando **todos** valem:

- `t.caixa_id is not null` — está amarrada a um turno;
- `t.conta_origem_id = p.conta_id`, com `p` = PDV do caixa (`fechamentos_caixa.pdv_id → pdvs.conta_id`)
  — é o mesmo critério que os totais usam para dizer "saiu do caixa"
  (`api/src/caixa/caixa.repository.ts:1189`);
- `t.conta_destino_id = e.conta_cofre_id` — chegou ao cofre configurado da empresa;
- `t.tipo = 'suprimento'` — não é entrega canônica (que já nasce `sangria`/`retorno`);
- `t.solicitacao_cofre_em is null` — não é solicitação D4;
- `t.status = 'pendente'` — o escopo é o dinheiro **em trânsito**. Linha já `recebido` é histórico
  fechado e **não** é tocada.

### §10.6 · O que esta rodada NÃO fez

Descoberta e registro apenas. Sem Fatia 2, sem migration, sem `.sql`, sem tocar dado real e sem
acesso a produção. A consulta somente leitura, a proposta de migration e o rollback estão no
relatório externo `RELATORIO-101-FATIA2-DESCOBERTA-2026-09-01.md`, e dependem de aprovação
explícita depois que Marco vir SQL, impacto e amostra.

### §10.7 · A decisão final fecha o modelo (R-183, 01/09/2026)

O §10.4 listou três lacunas e a proposta que saiu delas foi **derrubada** por dois revisores
read-only: creditar o cofre pelo valor declarado fabricava crédito que nenhuma contagem futura
corrige (`api/src/contas/contas.repository.ts:292`), e `quebras_caixa` tem **um escritor e zero
leitores** — a diferença sumiria de todo número consultável. A decisão de Rodrigo/Marco corrige a
rota e fecha as três lacunas de uma vez:

- **o cofre credita o CONTADO**, sempre. Falta vira quebra auditada (negativa); sobra é sobra e
  **nunca** quebra positiva, mantendo a D7; recusa sem contagem registra **R$ 0,00** contado e o
  declarado inteiro vira quebra;
- **divergência não termina em `recebido`.** A transferência ganha estado terminal próprio,
  auditável, que **continua contando como saída do Caixa** — devolver dinheiro ao Caixa está
  proibido em todos os casos.

Uma fórmula cobre os quatro desfechos, com `D` = declarado e `C` = contado:
**quebra = −(D − C) quando D > C; nenhuma quebra quando C ≥ D.** O caso "sem contagem" é o extremo
`C = 0`, não um ramo à parte.

Consequência aceita e registrada: com sobra, o Caixa lança saída `D` e o Cofre entrada `C > D`. Os
dois lados deixam de somar zero **de propósito** — foi dinheiro físico encontrado a mais, e a D7
proíbe transformá-lo em quebra positiva.

O desenho completo — schema, CHECKs, SQL forward e rollback, contratos, endpoints, tela e plano
RED/GREEN — está no relatório externo `RELATORIO-101-FATIA2-DESCOBERTA-2026-09-01.md`, **PARTE 4**.
Migration continua dependendo de autorização explícita de Marco.

---

## §11 · Fatia 3 — o legado "Programar entrega ao cofre" foi removido (09/09/2026)

O §2-A e a **R-179** diziam onde o legado estava e mandavam removê-lo "na entrega apropriada".
Esta é a entrega. O que saiu é o fluxo **D4** inteiro — a retaguarda programava uma ordem
`agendada` no painel de Transferências e o operador a executava na tela do Caixa. Esse painel
continua removido; o planejamento atual é o da §1-A e não reabre essa tela.

**Por que ele era o segundo caminho.** A ordem executada virava exatamente a mesma linha que
`POST /api/caixa/:id/transferencia-cofre` cria: mesma tabela, mesmo tipo `sangria`/`retorno`,
mesma conta de origem, mesma conta de cofre, mesmo lacre, mesma conferência. Dois botões, um ato.

### §11.1 · O que deixou de existir

| Camada            | Removido                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tela (retaguarda) | `SolicitacoesCofrePainel.vue`, `utils/solicitacoes-cofre.ts` e o bloco em `pages/transferencias.vue`                                                                                                            |
| Tela (Caixa)      | bloco "Entregas solicitadas pela Tesouraria" e `executarSolicitacaoCofre` de `utils/caixa-acoes.ts`                                                                                                             |
| Estado            | `caixasAbertos`, `caixaSolicitacoes`, `solicitacoesCofreRetaguarda`, `caixaSolicitacaoId`, `podeProgramarEntregaCofre` no `AppWorkspace`                                                                        |
| Rotas             | `GET /api/caixa/abertos`, `POST`/`GET /api/caixa/:caixaId/solicitacoes-cofre`, `.../:id/cancelar`, `.../:id/executar`                                                                                           |
| Serviço           | `programarSolicitacaoCofre`, `executarSolicitacaoCofre`, `cancelarSolicitacaoCofre`, `listarSolicitacoesCofre`, `listarCaixasAbertos`                                                                           |
| Repositório       | `listarCaixasAbertosRepository` e as cinco consultas ancoradas em `solicitacao_cofre_em`                                                                                                                        |
| Contratos         | `programarSolicitacaoCofrePayloadSchema`, `executarSolicitacaoCofrePayloadSchema`, `cancelarSolicitacaoCofrePayloadSchema`, `solicitacaoCofreParamsSchema`, `solicitacaoCofreSchema`, `caixaAbertoResumoSchema` |

`/api/caixa/abertos` saiu junto porque **só existia** para a retaguarda escolher o caixa da ordem.

### §11.2 · Histórico da remoção — superado pela R-185 no planejamento atual

Naquele checkpoint, D4, D10, D11 e D12 ficaram sem objeto porque o produtor antigo saiu. A R-185
restabeleceu essas intenções no fluxo novo da §1-A: há novamente produtor de `agendada`, execução,
cancelamento auditado e trava. Esta descrição permanece válida somente para linhas legadas do
painel removido, identificadas sem `planejamento_origem_transferencia_id`.

**D9, D13 e as demais continuam inteiras.** A trava do fechamento por entrega `pendente`
(G1/R-171) e os quatro desfechos da R-183 não foram tocados.

### §11.3 · Histórico do schema após a Fatia 3 — escritores reabertos pela R-185

No checkpoint de 09/09, os objetos abaixo ficaram sem escritor. A R-185 passou a reutilizá-los no
planejamento atual; portanto, eles não são mais candidatos automáticos a remoção por migration.

| Objeto                                                                  | Situação                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `transferencias.solicitacao_cofre_em`                                   | escritor e leitor ativos no planejamento R-185; marca a intenção de retorno                  |
| `transferencias.executado_por` / `executado_em`                         | escritos na execução do plano e lidos na conferência; separam quem planejou de quem entregou |
| `transferencias.cancelado_por` / `cancelado_em` / `motivo_cancelamento` | escritos no cancelamento auditado da retaguarda                                              |
| status `'cancelada'` de `transferencias`                                | produzido pelo cancelamento do planejamento; não movimenta saldo                             |
| `transferencias_cancelamento_check`                                     | protege o estado auditado novo e o histórico                                                 |
| `transferencias_solicitacao_cofre_idx`                                  | atende a busca dos planejamentos ativos do Caixa                                             |

Esses objetos voltaram a ser regra viva e não devem ser derrubados. Não houve backfill nem
reescrita do histórico; a R-182 continua pendente e independente desta entrega.

> ⚠️ **Ordem `agendada` legada — o que ela faz e o que NÃO faz.** Se o banco tiver linhas D4
> `agendada` sem `planejamento_origem_transferencia_id`, elas continuam lá e **não afetam dinheiro**: não contam como saída nem como entrada
> (`transferenciaContaComoSaida`), não entram no saldo pendente e não fazem parte do planejamento R-185. O
> cron de agendamento não as alcança — `agendada_para` e `tempo_confirmacao` nascem NULL nessas
> linhas, o que é exclusão dupla.
>
> **Mas elas distorcem dois relatórios**, e isso precisa estar escrito.
> `listarTransferenciasCaixaRepository` (`caixa.repository.ts:697-707`) e a consulta de detalhe
> (`:832-838`) filtram apenas `computar = true` e `status <> 'cancelada'` — **não** filtram por
> status de saída. A linha legada aparece como ENTRADA na aba TRANSFERÊNCIAS e desloca o
> `liquidoTransferencias` do detalhe, enquanto os totais que o fechamento grava
> (`caixa.repository.ts:1030-1037`, que passam pelas funções de regra) a ignoram. Detalhe e total
> deixam de bater.
>
> Isso descreve apenas a ordem do painel removido. O planejamento R-185 tem vínculo com a
> transferência inicial, trava o fechamento e possui execução e cancelamento próprios.
>
> A limpeza pertence ao **mesmo ato de migration da R-182** — e o escopo dela precisa incluir as
> linhas `agendada`, não só as `suprimento` que a R-182 descreve hoje.

> ⚠️ **Linha histórica sem conferente possível.** Uma linha legada `pendente` tem `criado_por` (quem
> programou) **e** `executado_por` (quem entregou), e a R-028 exclui as duas da conferência. Se o
> Cofre da empresa tiver exatamente essas duas pessoas vinculadas, ninguém pode conferir nem recusar,
> e a guarda da R-171 trava aquele turno. O portão pré-voo que existia era **preventivo**, nunca
> curativo — ele nunca soltou linha já criada, então removê-lo não causa isto. A saída não exige
> migration: **vincular um terceiro usuário ao Cofre** em `contas_usuarios` resolve.

### §11.4 · O que prova que a porta fechou

- `entrega-cofre-caminho-unico.test.ts` **RED-5**: as cinco chamadas do fluxo antigo respondem
  **404**, feitas pelo **admin** (que passaria em qualquer gate) — 403 provaria que a rota continua
  registrada e só mudou de dono; e nenhuma delas grava linha.
- `entrega-cofre-caminho-unico.test.ts` **RED-6**: turno com ordem `agendada` legada, montada em
  SQL porque nenhuma API a produz mais, **fecha** — e a linha continua intacta.
- `caixa-idempotencia-cofre.test.ts` cai de 31 para **16** casos: B2 e a decisão 7 ficam; o caso do
  "único responsável sendo o próprio criador" passa a usar a entrega avulsa.
- `divergencia-entrega-ao-cofre.test.ts`: o **RED-7b** prova a R-028 pelo caminho único (o gerente
  entrega, não encerra a própria entrega, e a Tesouraria encerra); o **RED-8** sai, porque a
  checagem de elegibilidade tem uma cópia só.
- `conferencia-recusa-cofre.test.ts`: a notificação passa a ser provada por **quem entregou** — e um
  caso novo monta em SQL a **linha legada** (com `executado_por` preenchido) para provar os três
  leitores que sobraram dela: quem entregou não confere (R-028), a quebra nasce contra ele, e a
  divergência o notifica. São três DECISÕES em DUAS expressões: `executadoPor ?? criadoPor` em
  `transferencias.service.ts:407` e `:449`, mais `permitida.executadoPor === usuarioId` em
  `transferencias.repository.ts:379`. Sem esse caso, apagar qualquer uma delas deixaria a suíte
  inteira verde e cobraria a falta da pessoa errada.
- `caixa-idempotencia-cofre.test.ts`: um caso novo prova que o `status` **não** entra na intenção da
  chave — retry depois de o cofre confirmar responde 200 e não duplica. Era o que o caso D4 removido
  cobria de lado, e sem ele "endurecer" a comparação passaria despercebido.

Os dois casos acima e a âncora positiva do E2E entraram **depois** da revisão read-only do HEAD
`19a80ea`, que apontou exatamente esses buracos de cobertura.
