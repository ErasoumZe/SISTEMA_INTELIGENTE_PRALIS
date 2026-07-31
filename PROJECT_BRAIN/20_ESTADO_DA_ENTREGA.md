# 20 — Estado da entrega (onde o trabalho parou)

> Aberto em 30/07/2026, na branch `feat/backend-telas-rodrigo`.
> Existe porque o `16_DEFINITION_OF_DONE` já tem a regra certa (**R4 · commit sempre, mesmo WIP**) e
> ela foi violada: o S6 foi encontrado pela metade numa árvore de trabalho suja, sem nada dizendo o
> que estava pronto e o que faltava. Reconstruir isso lendo diff é onde nasce o retrabalho.
>
> **Não confundir com o `19_REGISTRO_DE_REGRAS`.** O `19` responde _"o que foi combinado e existe no
> código?"_ (regras `R-nnn`). Este responde _"onde a entrega parou e o que trava o próximo passo?"_
> (verticais `S`, migrations, comandos). Um não substitui o outro; entrega que muda regra atualiza
> os dois.

## Como usar (a regra que faz este arquivo valer alguma coisa)

1. **Atualizar no MESMO commit da entrega.** Documento de estado que se atualiza depois já nasce mentindo.
2. **Nada de "quase pronto".** Ou está entregue com prova (commit + teste), ou está pendente com o motivo.
3. **Parou no meio? Commit WIP** com o que falta escrito no corpo, e a linha aqui vira `PARCIAL`.
4. Isto é **status**. Decisão de negócio continua indo para os documentos numerados (16, 17, 18).

---

## 1. Mapa das verticais (S) — o que só existia no prompt

O briefing fechou as decisões **D1–D12** no `17`. A execução foi fatiada em verticais chamadas
**S1…S7** — numeração que **nunca foi escrita em lugar nenhum**, só nos prompts. É por isso que
"rodar o S7" não significa nada para quem abre o repositório. Fica registrada aqui:

| S      | O que é                                     | Spec              | Commit                  |
| ------ | ------------------------------------------- | ----------------- | ----------------------- |
| **S1** | Menu "Lançamentos", "+ Novo" com 3 eixos    | `17` D6 + §4      | `f21b874`               |
| **S2** | Campos do lançamento (FOTO 2)               | `17` §4, `19` §2  | `7cd11c0` + este commit |
| **S3** | Discriminação: 3 níveis de desconto, rateio | `17` §5, D4/D5/D9 | `9338d10` + `5540e5a`   |
| **S4** | Conta com FUNDO + quem opera                | `17` §2, D8       | `04aaa37`               |
| **S5** | Recorrência cria a série no salvar          | `17` D3, §6       | `2e42b41` + `96f6063`   |
| **S6** | Entradas: lista completa do dia, paginada   | `17` D7           | `87ea945`               |
| **S7** | Seeding do cadastro a partir da planilha    | `17` D11 + §3     | `a4e77d5` + seed        |

> **S2 fechado em 31/07.** Juros, documento fiscal, credor tipado, sócio/gestor e as duas fotos
> persistem e reabrem nos três domínios. Os 9 `data-pendente` do lançamento foram removidos; a
> catraca versionada ficou em 24, com alvo final zero.

---

## 2. Estado por vertical

> **Retomada em 31/07/2026 — Etapa 1 concluída.** O WIP foi completado com tela de sócios/gestores,
> upload parametrizado das duas fotos nos três domínios, reabertura integral, catraca e testes.

| S   | Status         | Migration | Prova                                                                        |
| --- | -------------- | --------- | ---------------------------------------------------------------------------- |
| S1  | ENTREGUE       | —         | `menu.test.ts`                                                               |
| S2  | ENTREGUE       | 0020      | `s2-campos-lancamento.test.ts` (3) + `operacoes.test.ts` (25) + seed do zero |
| S3  | ENTREGUE       | 0016/0017 | testes de integração de discriminação                                        |
| S4  | ENTREGUE       | 0018      | `GET /api/contas/saldos`, tela de Contas                                     |
| S5  | ENTREGUE       | 0019      | série criada na mesma transação; migration registrada no dev (§3.1)          |
| S6  | ENTREGUE       | —         | 16 testes de front (`utils/entradas.test.ts`) + 6 de integração              |
| S7  | ENTREGUE (dev) | —         | `--apply` rodou no dev; 2ª passada gravou 0 (idempotente). Prod: nada (§3.2) |

**Nada disso foi mergeado.** A branch inteira está à frente da `main`
(`git rev-list --count main..HEAD`) e o item 5 do DoD ("diff revisado pelo José") não foi feito.

### S6 — o que foi entregue, para não reabrir

Escopo da tela virou o **DIA**, não o caixa (`resolverEscopoEntradasDoDia`). Motivo concreto: a venda
integrada do CREARE só recebe `caixa_id` se houver caixa aberto naquele PDV no instante da venda — a
da madrugada e a de PDV sem caixa ficavam invisíveis justamente para o operador que confere o dia.
Paginação no servidor (50/página), totalizador somando o **filtro inteiro** (`meta.totalLiquido`), e
filtro de data desabilitado para quem tem `menu_entradas_somente_caixa_aberto` (o servidor força o
dia do caixa — campo visível só para a pessoa saber QUAL dia está vendo).

### Corujão v2 — Etapa 2

**ENTREGUE no dev em 31/07/2026.** A migration `0021_minor_hobgoblin.sql` foi ensaiada numa cópia
descartável e depois aplicada somente no banco dev. O histórico passou a 22 migrations. Produção
não foi tocada.

A vertical inclui cadastro e seleção opcional de maquininha, transferência gerencial sem caixa,
retorno explícito antes do fechamento, quebra por empresa/usuário com observação obrigatória,
notificação genérica para Tesouraria e verificação pelo destinatário. O endpoint antigo de acerto
automático e a segunda tela de fechamento foram removidos.

Provas automatizadas: `etapa2-quebra-maquininha.test.ts` (4),
`transferencia-sem-caixa.test.ts` (6) e suíte `tests/integration/caixa` (46). Os CHECKs de
observação não vazia e verificação consistente, além da FK composta de tenant da quebra, também
foram exercitados diretamente no ensaio da migration.

R-019 e R-037 possuem casa comum em `notificacoes`, mas a criação dos alertas pelos eventos de
transferência continua corretamente na Etapa 3; não estão sendo declaradas como comportamento
entregue nesta etapa.

### Corujão v2 — Etapa 3

**ENTREGUE no dev em 31/07/2026.** A migration
`0022_transferencias_confirmacao_agendamento.sql` foi gerada pelo Drizzle, renomeada, ensaiada em
uma cópia descartável e aplicada somente no dev. Transferências manuais agora têm lacre, prazo,
agendamento, confirmação exclusiva por operador do destino, disputa atômica e notificações. O
saldo usa uma única convenção compartilhada: pendente já reduz a origem, ainda não aumenta o
destino e é mostrado separadamente. A rota reaproveitada `/fechamento` virou `/pendencias`.
A catraca `data-pendente` desceu de 23 para 0.

### Corujão v2 — Etapa 4

**ENTREGUE em 31/07/2026.** A discriminação envia e reabre desconto unitário, desconto no total do
item e desconto geral. O cliente preserva os detalhes do erro 422, destaca `linhaProvavel` e leva
o foco a `campoProvavel` para a pessoa corrigir sem procurar a divergência às cegas.

### Corujão v2 — Etapa 5

**ENTREGUE em 31/07/2026.** A frequência anual voltou e anual/trimestral obedecem ao número de
repetições, enquanto as frequências curtas continuam limitadas a 12 meses. A edição de um
lançamento recorrente oferece cancelamento da série; o servidor remove somente vencimentos futuros
sem pagamento e preserva o atual, os passados e os pagos. Provas: 16 testes unitários de recorrência
e 11 testes de integração, incluindo uma série com o segundo lançamento pago.

### Reposição do cadastro dev e bloqueio de edição de Conta (31/07)

Após a recriação do banco dev, `npm run seed:planilha` foi executado primeiro em dry-run. O filtro
`TOTAL ` descartou 9 totalizadores; o apply inseriu 98 grupos de despesa, 76 de mercadoria, 12 de
retirada, 33 contas, 4 áreas, 24 setores, 31 cargos e 146 produtos. A segunda passagem retornou
zero novos em todos os alvos e a consulta final encontrou zero grupos com nome `TOTAL %`.

Na edição de Conta, o servidor já persistia `saldoInicial` e `usuariosIds`. A perda estava no cache
do front: depois do PUT ele conservava apenas `id/nome`; ao reabrir, enviava fundo zero e lista vazia.
Contas agora sempre recarregam `/api/contas/saldos` após salvar. Provas:
`cadastro-local.test.ts` e `conta-fundo-saldo.test.ts`, incluindo PUT seguido de consulta direta a
`contas` e `contas_usuarios`.

---

## 3. Pendências que TRAVAM (precisam do José)

### 3.1 Migrations do sprint — RESOLVIDO no dev, **produção continua pendente**

> Atualizado em 30/07. A redação anterior (“0019 não rodou nem no dev nem em produção”) estava
> imprecisa e vale registrar por quê, porque a confusão é fácil de repetir.

**No dev o schema já estava completo.** Conferido objeto por objeto: `grupos_patrimonio` e
`patrimonio_itens` (0016), `despesas_itens.grupo_patrimonio_id` + o CHECK `grupo_unico` (0017),
`contas.saldo_inicial` + CHECK (0018), `lancamentos_recorrencias` + os `recorrencia_id/ordem` nas
três tabelas de lançamento e as FKs (0019) — **todos presentes**. O que faltava não era schema, era
o **registro**: `drizzle.__drizzle_migrations` estava vazia. Por isso `db:migrate` teria tentado
aplicar da 0000 e quebrado em objeto existente — o sintoma que parecia “migration não rodou”.

**O que foi feito:** `db/baseline-migrations.ts` (`npm run db:baseline`) registra as 20 migrations
que o banco já reflete, **sem reexecutar nenhuma**. Ele se recusa a rodar se a tabela de controle
não estiver vazia, ou se marcadores da última migration estiverem ausentes — marcar como aplicada
uma migration que não está no banco faria o `migrate` pular ela para sempre.

Detalhe que torna o baseline confiável: o drizzle decide o que aplicar **só pelo `created_at`**
(`pg-core/dialect.js`: `if (!ultima || Number(ultima.created_at) < migration.folderMillis)`). O hash
é gravado mas não entra na decisão — ainda assim gravamos o sha256 correto do arquivo.

**Prova:** `select count(*) from drizzle.__drizzle_migrations` → **20** (era 0), e
`npm run db:migrate` no dev termina **exit 0** sem reaplicar nada. É exatamente o critério de
“como saber que foi resolvido” do `18` D-01. Backup antes em `backups/dev_antes_baseline_*.dump`.

**Em produção: nada foi feito.** Se o banco de produção já tem `__drizzle_migrations` populada até a
0015, o caminho normal (`db:migrate`) aplica 0016–0019 sozinho e **não** se usa o baseline lá — ele
existe só para banco que nunca passou por migration. Isso continua sendo decisão de deploy do José,
e a branch nem foi mergeada.

### 3.2 S7 — mapa confirmado e **aplicado no dev** (produção ainda não)

> Atualizado em 30/07 pela entrega do `scripts/seed-planilha.ts`.

**O diagnóstico anterior desta seção estava errado, e a causa era um bug de leitor.** O
`planilha-xlsx.ts` casava célula com a regex `<c r="…">(.*?)</c>`, que **não trata célula vazia
self-closing** (`<c r="D14" s="603"/>`). O `</c>` mais próximo era o da célula SEGUINTE: a vazia
engolia a próxima, gravava o valor na coluna errada e perdia o `t="s"` no caminho — o índice do
sharedStrings vazava como número cru (`860`, `870`, `894`). Colunas inteiras apareciam deslocadas.
Foi daí que saiu "contas em X/Y, nenhuma coluna RET, tipos de produto em V". Corrigido.

**Mapa real** (linha 5 de cada aba tem o cabeçalho; o dado começa na 11):

| Alvo           | Colunas confirmadas                                                                     |
| -------------- | --------------------------------------------------------------------------------------- |
| Despesas       | `I` nome · `H` REF (8 baldes do DRE)                                                    |
| Mercadorias    | `K` nome · `J` REF · `L` margem % · `M` tipo (VENDA/TRANSFORMAÇÃO)                      |
| Retiradas      | `V` nome · `U` REF (`RETIRADAS` \| `INVESTIMENTO INTERNO`) — inclui `RET. SÓCIOS - …`   |
| Contas         | `X` todas (33) · `W` ativa · `Y` só as ativas (21)                                      |
| Patrimônio     | `E` SIG · `F` grupo · `G` item · `H` TNP · `J` marca                                    |
| Setores/Cargos | `Q` setores · `G` cargos · `P` áreas (listas verticais independentes)                   |
| Produtos       | aba **(BASE)**, `D`=LOJAS diz de quem é. As abas `(TNP)/(LI)/(HORA)` são modelos vazios |

O `17` §3 continua desatualizado — **vale este quadro**, não o de lá.

**Três coisas que o prompt pediu e a planilha não tem** (não são falha do script):

- mercadorias `computar`/`docfnf`: `P` e `Q` são a **lista de valores possíveis** (2 linhas), não
  atributo por grupo;
- retiradas `ativa`: a coluna `ATIVA` é das **contas** — `Y` repete a conta exatamente quando
  `W=ATIVA`, 33 de 33 linhas. Retiradas têm REF, não flag;
- patrimônio: os 26 itens (TNP=SIM) **não têm coluna ligando item → grupo**, e
  `patrimonio_itens.grupo_patrimonio_id` é NOT NULL. Os 8 grupos entram; os itens não.

`margem` e `tipo` existem na planilha mas **não têm coluna em `grupos_mercadorias`** — precisariam de
migration; hoje não entram. O **REF entra como `grupo_pai_id`**, que já existe.

**Estado (30/07): APLICADO NO DEV.** `--apply` rodou no banco local com o OK do José. Gravou
exatamente o previsto pelo dry-run: 106 grupos de despesa (8 REF + 98), 77 de mercadoria, 14 de
retirada, 33 contas (21 ativas / 12 inativas), 4 áreas, 24 setores, 31 cargos, 8 grupos de
patrimônio e 146 produtos com EAN normalizado.

**Idempotência provada, não prometida:** a segunda passada do `--apply` gravou **0** em todas as
tabelas e as contagens não mudaram (110/38/147/41). Rodar de novo não duplica.

**Em produção: nada.** O seed só rodou no dev.

Dois achados de qualidade do dado (da planilha, não do script):

- 12 produtos ficaram **sem grupo de mercadoria** — a planilha não informa grupo para eles;
- 2 pares de produtos têm **EAN diferente e descrição idêntica** (`TIAL MANGA 200,000 ML`,
  `TÔNICA ANTÁRTICA 350,000 LT`). A chave natural é o EAN, então os dois entraram — mas na tela
  viram duas linhas iguais. Quem for corrigir, corrige na planilha.

### 3.3 Item 5 — 3 duplicidades achadas, nenhuma corrigida

Detalhadas em `18` D-02: fechar caixa em 2 telas · modal genérico morto em `WorkspaceDialogs` ·
logout reimplementado 3×. Cada uma viola o item 2 do DoD. Não foram tocadas porque **escolher qual
caminho morre é decisão de produto**.

---

## 4. Pendências que NÃO travam

`18` D-01 (migration nunca exercitada no dev — alta) · D-02 (duplicidades) · D-03 (`format:check`
vermelho por CRLF, ruído do Windows) · D-04 (cancelar/editar série de recorrência em bloco).

---

## 5. Como validar (comandos que funcionam de verdade)

```bash
npm run build:libs                          # shared + db PRIMEIRO, senão os checks falham
npm run check --workspace @padaria/api
npm run check --workspace @padaria/web-vue  # nuxt typecheck = a verdade (o IDE mente, ver memória)
cd web-vue && npx vitest run                # 149 testes, ~20s

# integração: subconjunto, não a suíte inteira
npx vitest run --config ./vitest.config.ts --project integration tests/integration/caixa
```

**Três armadilhas conhecidas:**

- **`npm test` dá ERRO falso.** O wrapper `scripts/test.mjs` mata cada fase em 600s e a integração
  leva ~19min nesta máquina. Os testes passam; o wrapper é que desiste. Rodar subconjunto direto.
- **`npm run format:check` é vermelho no repositório inteiro** por CRLF (`18` D-03). Validar arquivo
  a arquivo: `npx prettier --check --end-of-line auto <arquivos>`.
- **A API do dev não faz hot-reload.** Mudou `api/`, `db/` ou `shared/`? Rodar
  `docker restart padaria-dev-api-1`. Já custou horas de "por que não arruma?" com o código certo.

---

## 6. Fora do sprint (não confundir com pendência)

`17` §7 congela: Transferências · Entradas (integração pronta — só a listagem D7, que é o S6) ·
Cockpit/abertura de caixa. Os 3 PNGs de marca em `web-vue/public/cicluz/` (`3ea387e`) estão
versionados mas **não referenciados por nenhum componente**, e `logo-cicluz-branca.png` é byte a byte
igual a `logo-cicluz.png` — a variante branca ainda precisa ser exportada.
