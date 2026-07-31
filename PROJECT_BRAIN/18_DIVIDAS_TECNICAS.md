# 18 — Dívidas técnicas (registradas para não esquecer)

> Aberto em 30/07/2026. Cada dívida aqui foi **descoberta durante uma entrega**, decidida como
> "não agora" pelo José, e registrada para não se perder no prompt que morre.
> Regra do `PROJECT_BRAIN/16`: decisão que só existe num prompt é decisão perdida.

---

## D-01 · O caminho de migration NUNCA é exercitado em desenvolvimento

**Status:** passo 1 FEITO (30/07) · **Prioridade:** alta · **Descoberto em:** 30/07, ao aplicar a 0017.

> **Passo 1 (baseline) concluído em 30/07.** `db/baseline-migrations.ts` registrou as 20 migrations
> que o dev já refletia, sem reexecutar nenhuma. `__drizzle_migrations` saiu de 0 para 20 e
> `npm run db:migrate` no dev agora termina exit 0 — o critério de "como saber que foi resolvido"
> abaixo está satisfeito. **Os passos 2, 3 e 4 continuam abertos**: o dev ainda é sincronizado por
> `push` no dia a dia (`setup:dev`), e o passo 4 — aplicar migrations sobre um dump ANONIMIZADO de
> produção no CI — é o que fecha o buraco de verdade e não foi feito.

### O que é

O banco de desenvolvimento é sincronizado por **`drizzle-kit push`** (`db:setup` / `setup:dev`),
que compara o schema TypeScript com o banco e aplica a diferença direto. A tabela de controle
`drizzle.__drizzle_migrations` está **vazia** — nenhuma migration foi jamais registrada lá.

Consequência imediata: `npm run db:migrate` no dev tenta aplicar **da 0000 em diante**, bate em
objeto que já existe e falha. Não é bug da migration; é o dev nunca ter sido um banco "migrado".

### Por que é risco, e não só inconveniente

Os arquivos em `db/migrations/` só são executados de verdade em dois lugares:

1. **Testcontainers**, no teste de paridade (`tests/integration/migracoes`), sempre a partir de um
   banco VAZIO;
2. **produção**.

Ou seja: **nenhum ambiente com dado real executa uma migration antes da produção.** Migration que
funciona em banco vazio e quebra em banco com dado — backfill que não cobre um caso, `SET NOT NULL`
sobre linha nula, `ADD CONSTRAINT` que aborta numa linha legada — só se revela **em produção, num
sistema que a padaria usa todo dia**.

O caso da 0017 mostra o padrão: o CHECK proposto originalmente (`num_nonnulls(...) = 1`) passaria
liso em banco vazio e abortaria em produção na primeira linha antiga sem grupo. Ali foi pego por
leitura; a próxima pode não ser.

### Sintoma colateral já observado

O dev fica **silenciosamente atrasado**. Em 30/07 ele estava no estado pré-0016: `grupos_patrimonio`
não existia, `despesas_itens` ainda tinha 6 colunas. Os testes passavam (Testcontainers monta do
schema), então nada acusou. Quem fosse clicar na tela de patrimônio no dev encontraria erro sem
entender por quê. Foi corrigido aplicando 0016, 0017 e 0018 por `psql`, cada uma em transação.

### O que fazer (quando chegar a hora)

1. **Baseline**: registrar em `drizzle.__drizzle_migrations` as migrations já refletidas no dev,
   sem reexecutá-las — o mesmo hash que o `migrate` calcularia, para ele continuar da próxima.
2. **Trocar o fluxo de dev** para `db:migrate`; aposentar `push` como forma de sincronizar
   (`push` continua útil só para os Testcontainers, que sempre partem do zero).
3. **Documentar em `AGENTS.md`** que dev roda migration como produção roda.
4. **Fechar o buraco de verdade:** um passo de CI que aplique as migrations sobre um dump
   ANONIMIZADO de produção, não sobre banco vazio. É esse passo que teria pego o `= 1`.

### Como saber que foi resolvido

```
-- deve listar TODAS as migrations, não zero linhas
select count(*) from drizzle.__drizzle_migrations;
```

e `npm run db:migrate` no dev termina sem erro, aplicando só o que falta.

---

## D-02 · Duplicidades do Item 5 ainda não resolvidas

**Status:** aberto · **Prioridade:** média · **Descoberto em:** 29/07 (varredura do Item 5).

Três caminhos duplicados achados e **não corrigidos**, aguardando decisão de qual morre:

1. **Fechar caixa em 2 lugares** — `CaixaResumoPage` (`/caixa`) e `FechamentoCaixaPage`
   (`/fechamento`) têm o mesmo fluxo acertar+fechar (mesmos emits `fecharCaixa`/`acertarSaldo`).
2. **Modal genérico morto** — `WorkspaceDialogs` mantém o form "Nova/Editar {entidade}" com markup
   de despesa/mercadoria/retirada/transferência **inalcançável** (o `v-if` externo exclui esses).
   Só serve para EDITAR venda. Superado por `OperacaoLancamentoModal`/`OperacaoTransferenciaModal`.
3. **Logout 3×** — `AppWorkspace.logout()`, `pages/integracoes.vue sair()` e `pages/pedidos.vue
sair()` reimplementam sign-out + redirect (essas duas páginas usam `AppShell` direto).

Cada um viola o item 2 do `16_DEFINITION_OF_DONE` ("zero duplicidade"). Não foram tocados porque
escolher qual caminho morre é decisão de produto, não de código.

---

## D-04 · Cancelar / editar a série de recorrência em bloco

**Status:** aberto · **Prioridade:** média · **Decidido em:** 30/07, junto com a entrega do S5.

A recorrência (D3) já **grava o vínculo**: `lancamentos_recorrencias` guarda a definição e cada
lançamento gerado aponta para ela (`recorrencia_id` + `recorrencia_ordem`). Essa era a parte
impossível de recuperar depois — sem o vínculo, os 12 lançamentos seriam indistinguíveis de
digitação avulsa.

**Falta** a operação em bloco:

- **cancelar a série inteira** (só as futuras e não pagas — as pagas já viraram dinheiro);
- **editar em bloco** (mudou o valor do aluguel: alterar as futuras de uma vez);
- exibir **"3/12"** na listagem, para a pessoa ver que aquele lançamento faz parte de uma série.

Não entrou agora porque mexe no ciclo de vida dos lançamentos, que tem permissões próprias por
domínio (`*_excluir`, `*_excluir_dpago`) e regra de caixa aberto — é entrega própria, não apêndice.

Enquanto isso: errou a série, apaga lançamento a lançamento. O `recorrencia_id` permite achar todos
de uma vez (`select * from despesas where recorrencia_id = ...`).

Editar um lançamento de uma série hoje mexe **só naquele** — a recorrência não é reprocessada. É o
comportamento correto e está travado no código (o payload só manda `recorrencia` na criação).

---

## D-03 · `format:check` vermelho no repositório inteiro (CRLF)

**Status:** aberto · **Prioridade:** baixa (ruído, não defeito).

`npm run format:check` acusa o repositório inteiro por causa de CRLF do Windows, não por causa do
código. Validar arquivo a arquivo com `npx prettier --check --end-of-line auto <arquivos>`.
Resolver de verdade = decidir a política de fim de linha (`.gitattributes` com `* text=auto`) e
normalizar num commit próprio, separado de qualquer entrega.

---

## D-05 · Agendador de transferências em processo

**Status:** aberto · **Prioridade:** média · **Criado em:** 31/07/2026, Etapa 3 do Corujão v2.

O agendamento e a fiscalização de prazo rodam a cada 60 segundos no processo da API
(`api/src/server.ts`). Em 31/07/2026 foi confirmado que `infra/docker-compose.coolify.yml` não
define `replicas` nem `deploy:`: há uma única réplica, portanto o desenho atual está seguro nesse
ambiente.

**Bloqueio para escalar:** antes de subir uma segunda réplica, é obrigatório coordenar a execução
com trava no banco (por exemplo, advisory lock) ou mover o trabalho para um único worker/cron com
eleição. Sem isso, as duas APIs podem selecionar a mesma transferência agendada e executá-la duas
vezes. A idempotência parcial das atualizações atuais não substitui essa exclusão mútua.

---

## D-06 · R-007 mistura cartão/PIX com dinheiro físico no fechamento

**Status:** aberto por decisão do José · **Prioridade:** crítica pelo efeito diário · **Decidido em:** 31/07/2026, Corujão v3 P4.

O "Resultado no caixa" continua somando todas as vendas, inclusive cartão e PIX, embora esses
valores não passem pela gaveta. A correção foi deliberadamente adiada; não alterar a fórmula nesta
rodada.

**Consequência operacional explícita:** enquanto isso valer, o fechamento acusará diferença sempre
que houver venda em cartão ou PIX. A quebra da R-015 poderá então ser atribuída ao operador mesmo
sem ele dever esse dinheiro. É dívida com efeito diário financeiro e de responsabilização, não
cosmética.

Para resolver, a fórmula única de saldo/fechamento deve separar formas que representam dinheiro
físico das demais, com decisão de negócio sobre a classificação e testes de fechamento misto antes
de migrar qualquer histórico.

---

## D-07 · R-024: transferência cria lacre, mas não cria malote

**Status:** aberto · **Prioridade:** alta · **Registrado em:** 31/07/2026, Corujão v3 P4.

O modelo descrito pelo José diz que a transferência com lacre do cofre para o caixa gera o malote.
Hoje `criarTransferenciaRepository` cria uma linha em `lacres`, que representa o selo de um evento
de transporte, mas não cria uma linha em `malotes`, usada pela abertura como entidade física com
valor e estado. Portanto R-024 permanece ❌.

Para reconciliar os modelos, é preciso definir e implementar atomicamente o ciclo completo:

1. em qual momento a transferência cofre → caixa gera o malote (criação ou confirmação);
2. como `transferencia`, `lacre` e `malote` ficam vinculados sem duplicar a identidade do número;
3. qual valor e status inicial o malote recebe e como passa a `em_uso`/`disponivel` na abertura e
   no retorno;
4. como tratar cancelamento, agendamento e múltiplos destinos sem produzir malote órfão.

Essa reconciliação exige decisão de domínio e migration; por ordem expressa do P4, nenhuma mudança
de código ou banco foi feita nesta rodada.

---

## D-07 · RESOLVIDA em 31/07/2026 pela R-040

A reconciliação foi feita escolhendo **um lado**, não juntando os dois: o malote-entidade deixou de
existir. A medição que decidiu isso está no relatório da R-040 — nada do que `malotes` guardava
ficou sem casa (`numero_lacre` → `lacres.numero`, `valor` → `transferencias.valor_original`,
`status` → `lacres.rompido` + `transferencias.status`). O único atributo exclusivo era **existir
solto**, sem transferência nenhuma, que é exatamente o conceito revogado pela R-022.

Migration `0026_malote_morre_lacre_unico.sql`: backfill primeiro (o histórico de qual lacre selou
qual transferência não podia morrer com a tabela), drops depois. Aplicada só no dev.

---

## D-08 · `divida_cofre` e `saldoProprio` são legado da R8 revogada

**Status:** aberto · **Prioridade:** baixa · **Registrado em:** 31/07/2026, junto com a R-040.

A R8 ("o caixa nasce devendo o malote") foi revogada pela **R-001** ("agora é fundo mesmo"). Desde a
R-040 a coluna `fechamentos_caixa.divida_cofre` é gravada **sempre com 0** e nenhum fluxo escreve
outro valor. Consequência: `resumo.saldoProprio` passou a ser sempre o resultado OPERACIONAL do
caixa (entradas − saídas, sem transferências), e `resumo.dividaCofre` é sempre 0 na tela.

A função pura `saldoProprioCentavos(totais, dividaCofre)` continua aceitando o parâmetro e tem
teste, mas o ramo com dívida > 0 é **inalcançável em produção**. Remover a coluna e o campo do
contrato muda o que a tela mostra — é decisão do José, não faxina automática.

---

## D-09 · 🔴 Juros e desconto do lançamento NÃO entram no total do caixa

**Status:** aberto · **Prioridade:** ALTA · **Descoberto em:** 31/07/2026, percorrendo o fluxo do dia.

### O que foi medido

Uma despesa de **R$ 50,00 com 10% de juros** (`jurosTipo: "percentual"`,
`jurosValorInformado: 10`) grava corretamente `valor_acrescimo = 5,00` — a R-041/R-042 funcionam no
lançamento. Mas o caixa desconta **apenas R$ 50,00**: a proposta de retorno veio **230,00**
(300 de fundo − 50 da despesa − 20 da retirada), e não 225,00.

A causa está em `api/src/caixa/caixa.repository.ts`, em
`calcularTotaisCaixaOperacionalRepository`: vendas são somadas com `liquidoCentavos` (original −
desconto + acréscimo), mas **despesas, retiradas e mercadorias são somadas só por
`valor_original`**. O mesmo acontece no saldo por conta (`contas.repository.ts`).

### Por que importa

A padaria pagou R$ 55,00 e o sistema tirou R$ 50,00 do caixa. Os R$ 5,00 de diferença viram
**quebra de caixa falsa** no fechamento — e a R-015 atribui a quebra **ao operador**, que vai
prestar contas de um dinheiro que ele não perdeu. É o tipo de erro que faz o operador deixar de
confiar na tela.

### Por que não foi corrigido nesta rodada

Mudar a fórmula altera o saldo de **todo caixa já fechado** e de todas as contas. Isso é decisão
contábil do José (R-115), não faxina de código. A correção provável é usar o mesmo
`liquidoCentavos` já aplicado às vendas também nas três saídas — em um só lugar, nos dois
repositórios.

---

## D-10 · Contas importadas da planilha nascem sem operador (`contas_usuarios` vazia)

**Status:** contornado no dev · **Prioridade:** média · **Descoberto em:** 31/07/2026, no fluxo do dia.

O `seed-planilha` cria as 33 contas mas **não vincula ninguém** a elas. Como a R-071 diz que usuário
sem vínculo não vê conta nenhuma, a Tesouraria abria a tela de Transferência com Origem e Destino
**vazios** — o passo 1 do dia do José travava antes de começar, sem mensagem que explicasse por quê.

Contornado no dev com `insert into contas_usuarios` para tesouraria (cofres) e caixa (conta do PDV).
Falta decidir o caminho definitivo: ou o cadastro de conta passa a exigir operador (R-072 já diz
que "quem opera" é escolhido no mesmo salvar), ou a tela avisa "esta conta não tem operador" em vez
de mostrar uma lista vazia.
