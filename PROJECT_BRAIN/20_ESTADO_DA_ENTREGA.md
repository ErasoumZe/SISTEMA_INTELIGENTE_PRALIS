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

### Corujão v2 — Etapa 6

**ENTREGUE em 31/07/2026.** O logout tem uma única implementação e um único botão, no menu do perfil
de `AppShell`. O modal operacional genérico sem entrada alcançável foi removido; permanecem somente
os modais próprios de lançamento e transferência. Os antigos `fechamento.vue` e
`FechamentoCaixaPage.vue` já tinham sido removidos e a rota de notificações é `/pendencias`. A matriz
agora é exclusiva: Gerência efetua, Financeiro paga, e Financeiro/Gerência/Tesouraria conferem os
quatro domínios; admin continua recebendo o catálogo completo. O item Entradas do “+ Novo” já era
filtrado por `entradas_visualizar`, com prova em `menu.test.ts`. A edição de Conta permanece coberta
pelo teste de integração entregue em `8c9843f`.

### Corujão v2 — Etapa 7

**ENTREGUE no dev em 31/07/2026.** O seed passou a usar a planilha operacional para os 75 grupos
de despesa, 3 de retirada, saldos de conta, patrimônio e folha, preservando a planilha de cadastro
como fonte dos produtos e grupos de mercadoria. O dry-run descartou 9 `TOTAL `, encontrou zero
movimentos anteriores nas 33 contas e ficou abaixo do limite de 200 grupos. A migration
`0023_grupos_ativos_seed_planilha.sql` foi gerada pelo Drizzle, renomeada, ensaiada numa cópia do
dev e aplicada somente no dev. O apply criou 18 pais de despesa, 1 grupo de despesa que faltava,
14 pais de mercadoria e 2 pais de retirada; marcou 11 despesas e 1 retirada de uso único como
inativas e aplicou os cinco fundos da aba SALDOS. A segunda passagem apresentou zero novos em todos
os alvos, e a consulta final encontrou zero totalizadores no banco.

Os 26 itens de patrimônio TNP não foram gravados: a planilha traz listas verticais independentes e
não liga cada item ao grupo, enquanto a FK `grupo_patrimonio_id` é obrigatória. Os 8 grupos de
patrimônio foram preservados. Associar itens por posição inventaria uma relação contábil.

### Corujão v2 — Etapa 8

**ENTREGUE em 31/07/2026.** A identidade visível agora é Cicluz Gestão Profissional no login,
sidebar, título e favicon; os seis assets Pralis foram removidos. Os tokens fixos passaram de
`--pralis-*` para `--marca-*`, mantendo `#6515dd` como primária e `#c0521d` exclusivamente no botão
de acesso. Os subtítulos do "+ Novo" seguem a R-094, a camada visual principal (login, navegação,
erros globais e páginas centrais de caixa/financeiro/relatórios) recebeu acentuação e as quatro
confirmações nativas foram substituídas por um único diálogo Vuetify reutilizável. Como o inventário
passa de 150 strings, a revisão parou nessa camada: textos secundários de cadastro/integração e
mensagens antigas da API ainda precisam de uma rodada própria; R-100 permanece ⚠️.

**Complemento do Corujão v3 (31/07):** cadastros secundários e a tela de integrações foram
revisados. Mensagens legadas da API agora são acentuadas na fronteira HTTP por palavras inteiras,
sem modificar códigos/identificadores, com teste unitário. A varredura de código chegou até essas
três camadas; R-100 continua ⚠️ até inspeção visual humana de todas as telas, para não transformar
check estático em prova visual.

### Corujão v3 — P3.3

**ENTREGUE em 31/07/2026.** O seed de desenvolvimento mantém os 10 usuários nomeados da matriz e
cria, de forma idempotente, um usuário comum para cada cargo adicional importado da planilha. Cada
usuário recebe colaborador e vínculo ao cargo, sem regra em `permissoes_usuarios`: portanto herda
exatamente a matriz do cargo. Execução no dev: **41 cargos, 41 cobertos, 0 sem usuário e 0
permissões diretas** nos 31 usuários adicionais.

### Corujão v3 — P3.4

- R-006/R-025/R-027: integração em banco real prova que uma transferência saindo do cofre exige lacre e que o mesmo número não pode selar dois movimentos. A tentativa de reuso agora retorna erro de negócio, mantendo a restrição `lacres_numero_unico` como última barreira contra corrida.
- R-031: `TransferenciaRetornoCampos.test.ts` prova que a checkbox expande retorno/sangria dentro do mesmo formulário de transferência.
- R-078: o agrupamento usado pela tela tem uma função única e testada; todas as permissões visíveis pertencem a exatamente um módulo. Em sobreposição, vence o prefixo mais específico (`menu_contas_pagar_*` fica somente em Contas a pagar).

### Corujão v3 — P4

**Somente registro, sem implementação, como decidido pelo José.** O `18_DIVIDAS_TECNICAS.md`
agora explicita: (D-06) a consequência diária da R-007 sobre diferença e atribuição indevida de
quebra; (D-05) que o Coolify está em uma réplica e que uma segunda exige trava no banco; e (D-07)
o descompasso entre o lacre criado pela transferência e o malote esperado pela R-024, incluindo o
ciclo que precisa ser decidido antes da correção.

### Corujão v3 — P5

R-102 continua ⚠️ por decisão expressa: breakpoint em código não é inspeção visual. O relatório
`docs/relatorios/CORUJAO-V3-RESPONSIVIDADE-PENDENTE.md` lista as 16 telas/fluxos tocados desde
`4711d4b^`, com rotas e pontos críticos, para conferência humana em 1440 / 1024 / 768 / 390 px.
Nenhuma tela foi marcada como visualmente aprovada nesta etapa.

### Corujão v3 — validação final

- `npm run lint`: verde.
- `npm run check`: verde, inclusive arquitetura e catraca `data-pendente: 0/0`.
- Unitários: 13 arquivos, 117/117 testes verdes.
- Web: 13 arquivos, 154/154 testes verdes.
- Integração completa: 69 arquivos; 323/328 passaram na primeira rodada. As cinco falhas eram expectativas antigas (duas sem acento e três anteriores à matriz vigente de Gerência). Após alinhá-las à regra já implementada, os três arquivos afetados passaram 19/19. Não houve falha funcional remanescente.
- O timeout padrão de `npm test` subiu de 10 para 30 minutos porque a integração completa levou 27m21s; o limite antigo encerrava uma suíte saudável.
- Auditoria canônica do §3: **64 ✅, 5 ⚠️ e 4 ❌ entre 73 regras avaliáveis**. Assim, o sistema cumpre 64 das 73 regras ativas com status. Há ainda 2 regras revogadas (🚫) e 11 regras de processo sem coluna de status, que não entram no denominador.

### Corujão v2 — Etapa 9

**AUDITADA em 31/07/2026, sem correções de implementação.** Havia 15 regras ainda marcadas
`❓` (o cabeçalho dizia 20, mas cinco haviam sido resolvidas nas etapas anteriores). Pelo critério
estrito de exigir implementação e teste, o sistema cumpre **3 das 15 regras auditadas**: R-008,
R-014 e R-095. Sete ficaram ⚠️ por existirem sem prova automatizada completa (R-006, R-025,
R-027, R-028, R-031, R-078 e R-102) e cinco ficaram ❌: R-007,
R-010, R-013, R-024 e R-079 (cinco regras). A soma correta é 3 ✅ + 7 ⚠️ + 5 ❌ = 15.
As evidências por arquivo e linha estão na coluna Status do `19`.

### Corujão v2 — Etapa 10

**QA concluído em 31/07/2026.** Foi acrescentada uma prova vertical de integração para a lacuna
mais arriscada da Etapa 3: origem debitada imediatamente com pendente informativo, múltiplos
destinos concorrendo, um único vencedor, lacre rompido, notificação nos dois lados, trava 423 por
prazo e liberação pela Tesouraria. As fixtures antigas foram atualizadas para não tratar
transferência pendente como entrada confirmada e para usar os estados aceitos pelo CHECK atual.

Resultado final automatizado: `lint` ✅; `check` ✅; catraca `data-pendente` **0/0**; 115 testes
unitários ✅; web teve 150/151 na rodada geral por uma expectativa sem acento, corrigida e validada
no arquivo afetado (28/28) ✅; integração completa executada uma vez, **69 arquivos e 325 testes,
todos verdes**, em 28 minutos. Não houve teste pulado.

A responsividade tem breakpoints para 1024/768/390 e regras contra vazamento horizontal, mas não
foi possível fazer inspeção visual automatizada em navegador nas quatro larguras neste ambiente;
R-102 permanece ⚠️ por esse motivo. Produção não foi tocada e não houve merge.

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

---

## 7. Fluxo do dia — 31/07/2026

**O dia inteiro roda de ponta a ponta contra o dev real.** Não é teste automatizado: é o fluxo do
José, executado passo a passo pela API, com tesouraria e caixa em logins separados.

| #   | Passo                                                                                      | Resultado                             |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| 1   | Tesouraria cria transferência do COFRE PRINCIPAL, com lacre, múltiplos destinos, em aberto | ✅ de primeira                        |
| 2   | Operador abre o caixa informando o lacre (R-040)                                           | ✅ **depois da entrega desta rodada** |
| 2b  | Dinheiro entrou naquele caixa (saldo 300)                                                  | ✅                                    |
| 3   | Entradas do dia respondem (R-096)                                                          | ✅                                    |
| 4   | Despesa com juros %, doc fiscal, credor tipado                                             | ✅                                    |
| 4b  | Despesa **reabre** com tudo salvo (R-041/R-044/R-045/R-046)                                | ✅ 10% sobre 50 → acréscimo 5         |
| 5   | Retirada com sócio/gestor                                                                  | ✅                                    |
| 6   | Retorno ao COFRE PRINCIPAL (R-008b)                                                        | ✅                                    |
| 6b  | Saldo zerou (R-008)                                                                        | ✅                                    |
| 6c  | Caixa fecha                                                                                | ✅                                    |
| 7   | Sem observação **não** fecha havendo quebra (R-016)                                        | ✅                                    |
| 7b  | Com observação fecha                                                                       | ✅                                    |
| 7c  | Tesouraria recebe a notificação da quebra (R-017)                                          | ✅                                    |
| 7d  | Tesouraria marca verificado (R-018)                                                        | ✅ **depois do fix do 500**           |

### O que travou pelo caminho e como foi resolvido

1. **Passo 2 não existia** — a abertura procurava malote, não transferência. É a R-040; ver `19` §1-C.
2. **`contas_usuarios` estava vazia** (0 vínculos): a Tesouraria via a tela de Transferência com
   Origem e Destino em branco e o passo 1 travava sem explicar por quê. Contornado no dev; dívida
   registrada em `18` D-10.
3. **`empresas.conta_cofre_id` apontava para a conta "Cofre" do seed antigo**, não para
   `CNT CONTA - COFRE PRINCIPAL`. O retorno do fechamento ia para a conta errada e o cofre principal
   fechava o dia com menos dinheiro do que devia (R-008b). Corrigido no dev por UPDATE.
4. **R-018 devolvia 500** — `PUT .../verificar` com corpo JSON vazio virava "Erro interno". O Fastify
   já levantava 400; o handler global só respeitava o 429 e mascarava o resto. Corrigido em
   `54d1f0c`, com teste de regressão.
5. **Nenhum sócio/gestor cadastrado no dev** — o cadastro existe (R-047), a tabela estava vazia. Um
   foi criado durante o percurso.

### Achado que NÃO foi corrigido (decisão do José)

**Juros e desconto do lançamento não entram no total do caixa** — `18` D-09. Medido: despesa de 50
com 10% de juros tira 50 do caixa, não 55. A diferença vira quebra falsa, atribuída ao operador
pela R-015. Corrigir muda o saldo de todo caixa já fechado, então parou aqui.
