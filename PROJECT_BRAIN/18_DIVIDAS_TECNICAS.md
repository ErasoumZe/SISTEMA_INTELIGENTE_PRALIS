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

---

## D-11 · Divergência conta × caixa — FECHADA para o cargo Caixa, ABERTA para os demais

**Status:** parcial · **Prioridade:** média · **Registrado em:** 01/08/2026, com a R-121.

### O problema

As três saídas (despesa, mercadoria, retirada) são contadas em **dois lugares que não se falam**:

- **total do caixa** (`caixa.repository.ts`, `calcularTotaisCaixaOperacionalRepository`) soma por
  `caixa_id` e **ignora a conta**;
- **saldo da conta** (`contas.repository.ts`) soma por `conta_origem_id` e **ignora o caixa**.

Como `conta_origem_id` é nullable e o select oferecia todas as contas do usuário, um lançamento
feito dentro do caixa apontando outra conta debitava **as duas coisas ao mesmo tempo**.

### O que a R-121 fechou

Para o **cargo Caixa**: a origem é obrigatoriamente a conta do PDV do caixa aberto — travada na tela
e validada no servidor (`exigirContaDoCaixaNoLancamento`). Para esse perfil, os dois números passam
a falar da mesma conta e a divergência não tem como nascer.

### O que continua aberto

Para **Gerência, Financeiro, Tesouraria e admin** nada mudou: eles escolhem a conta livremente e
podem lançar dentro de um caixa aberto apontando outra conta — a mesma divergência, no mesmo lugar.

Não foi tocado de propósito: mudar isso altera o dia a dia de três cargos e **é decisão do José**.
Ver a pergunta em aberto logo abaixo.

### Pergunta em aberto (junto)

Hoje Gerência/Financeiro/Tesouraria **precisam de caixa aberto** para lançar despesa, mercadoria e
retirada (`obterCaixaAbertoParaLancamento`), o que **contradiz a R-032**, que os liberou justamente
para transferência. Ou eles são retaguarda nas quatro saídas, ou em nenhuma. Do jeito que está, são
retaguarda em uma só.

---

# Dívidas abertas em 05/08/2026 (auditoria de stack)

> Origem: `22_AUDITORIA_STACK_2026_08_05.md`. Cada uma tem evidência com `arquivo:linha` lá.
> **Nota de higiene:** este arquivo tem **dois cabeçalhos D-07** (um aberto, outro resolvido pela
> R-040) e a ordem salta D-04 antes de D-03. Desambiguar numa próxima passagem.

## D-12 · 🔴 `vendas` sem UNIQUE em `identificador_externo` — a venda pode duplicar

**Prioridade: crítica.** A idempotência da ingestão depende de leitura-antes-de-escrita em READ
COMMITTED, sem `FOR UPDATE` nem advisory lock, e `vendas` só tem UNIQUE `(id, empresa_id)`. Dois
POSTs simultâneos do mesmo `CREARE:<id>` criam duas vendas com itens e pagamentos duplicados; o
ledger aponta para uma só e a outra vira órfã permanente, contando em dobro no caixa e na
conciliação. O `README.md` do agente **recomenda rodar o reprocesso junto com o robô**, o que é
exatamente o caminho para isso acontecer.

É a explicação mais provável do histórico de "venda duplicada ou triplicada" — mais provável do que
o pagamento dividido, cujo desenho atual está correto.

**Antes de criar o índice:** contar as duplicatas já existentes em produção e decidir com o José o
que fazer com elas (R-112).

## D-13 · 🔴 O hash de idempotência ignora todas as datas

**Prioridade: crítica.** `jsonCanonico` trata `Date` pelo ramo de objeto e produz `{}`. Logo
`dataHoraVenda` e `dataHoraItem` **não entram no hash**. Se o CREARE corrigir a hora de uma venda, o
servidor responde `sem_novidade` e a venda **nunca migra para o caixa correto**. Nenhum reprocesso
resolve — é o mecanismo que mantém viva a queixa de "venda na sessão errada" mesmo depois das
correções de fuso.

Depois do conserto, será preciso reprocessar o período afetado.

## D-14 · 🔴 `ILIKE` sem escape com entrada do usuário

**Prioridade: alta.** `caixa.repository.ts:364` faz `ilike(lacres.numero, numeroLacre)` com o número
digitado pelo operador. `%` e `_` são curingas: abrir caixa com lacre `%` casa um lacre arbitrário
(`LIMIT 1`, sem `ORDER BY`) e pode **levar o dinheiro para o caixa errado**. Mesmo padrão em 4
resoluções de vínculo da integração.

Junto: a unicidade de lacre é case-sensitive (`eq`) enquanto a busca é case-insensitive (`ilike`) —
`AB123` e `ab123` coexistem e o desempate é indefinido.

## D-15 · Venda tardia não recalcula os totais congelados do fechamento

**Prioridade: alta.** A venda entra no caixa fechado e é marcada (R-013), mas
`atualizarFechamentoCaixaRepository` só roda no fechamento. O **histórico** lê colunas congeladas e o
**detalhe** recalcula ao vivo: duas telas, dois números para o mesmo caixa. O teste da R-013 prova a
marca e não verifica os totais.

## D-16 · Venda integrada é editável sem trilha

**Prioridade: alta.** `PUT /api/vendas/:vendaId` não verifica `integracaoChaveId`. Contraria a regra
de negócio dita na reunião (*"o usuário do caixa não consegue editar uma venda"*) — o front esconde,
o servidor permite. E como o hash não muda, a alteração **nunca é revertida** pelo ciclo seguinte.

## D-17 · Tabelas de log da integração crescem sem expurgo, e a listagem não tem `LIMIT`

**Prioridade: média, virando alta com o tempo.** `integracoes_historico` e
`integracoes_sem_novidade` gravam o payload jsonb completo a cada reenvio — ~72 × (vendas do dia)
linhas por dia. Nenhuma das duas tem índice e não há expurgo. `listarHistoricoIntegracaoRepository`
faz SELECT sem filtro de data e sem `LIMIT`, agregando em JS.

## D-18 · Backup existe e não é agendado

**Prioridade: média.** `scripts/backup-db.mjs` é bom e **nada o chama** — nenhum cron, workflow ou
serviço. Os 3 dumps existentes têm nome fora do padrão do script e estão fora da retenção
automática. O dado de uma padaria em produção depende de alguém lembrar.

## D-19 · Cinco checagens já escritas não rodam em gate nenhum

**Prioridade: média, custo baixíssimo.** `lint:deps` (dependency-cruiser, 9 regras),
`format:check`, `audit:deps`, `knip` e `depcheck` existem no `package.json` e não estão no CI nem no
pre-commit. Junto: `npm test` da raiz **não roda os testes do `web-vue`** — quem roda
`npm run quality` antes de commitar acredita ter validado tudo e não executou um teste de front.

## D-20 · O front não tem como ser refatorado com segurança

**Prioridade: média-alta, custo alto.** `AppWorkspace.vue` tem **1.991 linhas** (o pico citado no
`AGENTS.md` era 1.886 — já foi ultrapassado); 11 arquivos passam de 400 linhas; existe **1 único
teste de componente montado** em toda a base; **zero E2E**; cobertura não é medida. Não há guardião
automatizado nem para tamanho de arquivo nem para duplicidade — as duas regras mais importantes do
projeto são verificadas só por leitura humana.

Junto: `/integracoes` e `/pedidos` são uma **segunda casca de aplicação** (1.041 linhas) que
reimplementa sessão, empresas e permissões, e por isso ficam sem cor de menu, sem sino de
notificações e sem "+ Novo".

## D-21 · `/health` não toca o banco

**Prioridade: média, custo trivial.** Retorna objeto estático. É o endpoint usado pelo healthcheck do
Compose, do Coolify **e pelo agente CREARE antes de cada ciclo**. Com o Postgres fora do ar, o
container continua "saudável" e o robô continua tentando enviar.

## D-22 · Documentação de fuso do agente contradiz o código

**Prioridade: média.** `.env.producao.example` manda deixar `SYNC_FUSO_OFFSET=""` afirmando uma
convenção; o `README.md` afirma outra; e o código faz string vazia virar `-03:00`, tornando
inalcançável o ramo alternativo. Se alguém "corrigir" seguindo a documentação, **todas as vendas
deslocam 3 horas**. O offset também é fixo, não IANA — a volta do horário de verão quebra a
conciliação.

## D-23 · Três "fontes de verdade" documentais no disco

**Prioridade: baixa, confusão alta.** `PROJECT_BRAIN/` (00-20, 67, 68), `PROJECT_BRAIN - Copia/` (63
docs em inglês, 00-62) e `design-system/PROJECT_BRAIN/` (61-66), com numeração colidente. Mais
`design-system/web-vue/` com 8 cópias divergentes de arquivos vivos e uma segunda marca (Pralis vs
Cicluz). Está fora do git, mas está no disco que os agentes leem — é literalmente "o caminho antigo
que ainda existe".

Junto: o `README.md` da raiz descreve migrations 0000-0002, permissões com nomes velhos, uma rota já
removida e "Tesouraria: cadastro de malotes". É o documento mais desalinhado do repositório.
