# 22 · Auditoria de stack e ferramental — 05/08/2026

> Auditoria completa do monorepo feita na branch `chore/ambiente-time-senior`, sobre o commit
> `2234239` (Merge PR #28). **Somente leitura** — nada de código foi alterado para produzi-la.
>
> Escopo: stack real, qualidade automatizada, riscos abertos com evidência, comparação com o
> ferramental que um time sênior costuma usar, e plano priorizado.

---

## §1 · Sumário executivo

**Este projeto está tecnicamente acima da média para o seu porte.** Isso precisa ser dito antes de
qualquer crítica, porque a lista de riscos abaixo é longa e sozinha daria a impressão errada.

O que já existe e é raro em projeto deste tamanho: default-deny de autenticação de verdade no
servidor; 247 permissões catalogadas; TypeScript estrito de verdade (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`); ESLint com informação de tipo e `no-explicit-any` como **erro**;
guardiões de arquitetura escritos à mão que quebram o build; um teste que lê o CSS e falha se a cor
divergir do TypeScript; 462 casos de teste, 327 deles de integração com Postgres real em
Testcontainers; CI em dois jobs; deploy containerizado com `cap_drop: ALL`; e uma disciplina de
migration com baseline documentado.

**O problema não é a qualidade média — é a distribuição dela.** Há zonas de excelência ao lado de
zonas sem nenhuma rede:

| Zona                                         | Estado                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Domínio de caixa e transferência no servidor | **forte** — regras no `shared`, testes de concorrência, trilha em `edicoes_caixa` |
| Ingestão de venda do CREARE                  | **frágil** — dois riscos críticos, sem UNIQUE, hash com defeito                   |
| `integracoes-scripts` (o robô)               | **sem rede nenhuma** — fora do ESLint, fora do `check`, fora do CI                |
| Front `web-vue`                              | **frágil** — 1 teste de componente montado, god-component de 1.991 linhas         |
| Infra e deploy                               | **boa base**, observabilidade rasa                                                |
| Documentação (PROJECT_BRAIN)                 | **excelente e desatualizada** — três cópias concorrentes no disco                 |

**Os três problemas mais caros, em ordem:**

1. **A ingestão de venda pode duplicar** (A-01) e **não reprocessa venda com hora corrigida** (A-02).
   Juntos, explicam o histórico de divergência melhor do que qualquer outra hipótese.
2. **O front não tem como ser refatorado com segurança** — sem teste de componente e sem E2E, mexer
   no `AppWorkspace.vue` é apostar.
3. **O brain está 4 dias atrás do código e tem três cópias no disco**, com numeração colidente. Brain
   desatualizado é pior que brain ausente: manda o próximo agente "consertar" o que já está certo.

---

## §2 · A stack real

Monorepo npm workspaces `padariav2`. Node **22** (fixado só em Dockerfile e CI — **nenhum
workspace declara `engines`**). TypeScript **5.9.3** uniforme.

| Workspace             | Stack principal                                                      | Tamanho                   |
| --------------------- | -------------------------------------------------------------------- | ------------------------- |
| `api`                 | Fastify 5.8 · Drizzle 0.45 · Postgres 16 · better-auth 1.6 · Zod 4.4 | 127 arq. / 17.642 linhas  |
| `web-vue`             | Nuxt 4.4 · Vue 3.5 · Vuetify 3.12 · SPA (`ssr: false`)               | 78 `.vue` / 11.378 linhas |
| `db`                  | Drizzle schema + 30 migrations + seeds                               | **70 tabelas**            |
| `shared`              | Zod + regras puras (dinheiro, datas, saldo), só `zod` e `uuid`       | 44 módulos / 4.109 linhas |
| `integracoes-scripts` | JS puro + mysql2 — o agente do CREARE                                | 17 arquivos               |
| `tests`               | Vitest 4 + Testcontainers                                            | 86 arq. / 462 casos       |

**API.** Tripla `controller` → `service` → `repository` por domínio, 36 domínios, registrados
manualmente em `app.ts`. Default-deny por hook `onRequest` com allowlist de 6 entradas. Helmet, CORS
com origem explícita, rate limit global 300/min, multipart limitado a 10 MB. Erro tipado por
`ErroDominio` com 6 fábricas e handler global que mapeia `ZodError`, `ErroDominio`, 429 e fallback 500. **176 chamadas `.parse(`** nos controllers.

**Os 10 maiores arquivos da API:** `caixa.repository.ts` 979 · `caixa.service.ts` 921 ·
`integracoes.service.ts` 786 · `integracoes.repository.ts` 765 · `lancamentos.dominio.ts` 698 ·
`produtos.repository.ts` 488 · `colaboradores.repository.ts` 450 · `notas-fiscais.repository.ts` 437
· `mercadorias.repository.ts` 396 · `vendas.repository.ts` 375.

**Banco.** 66 `pgTable` num único `db/src/schema/app.schema.ts` (1.848 linhas) — os arquivos por
domínio são re-exports de 1 a 12 linhas. 30 migrations, 30 snapshots, 30 entradas no journal. Dev usa
`push --force`, produção usa `migrate` — por isso existe `baseline-migrations.ts` e por isso a dívida
D-01 continua aberta.

**Shared.** É o acerto arquitetural mais importante do projeto. Só `zod` e `uuid` como dependência;
sem I/O. Concentra as regras que não podem divergir entre servidor e tela: dinheiro em centavos
inteiros (`liquidoCentavos`, `jurosCentavos` com **um único arredondamento**, `valorTotalCentavos`),
datas no fuso do negócio (`diaNegocio`, `janelaDiaNegocio` DST-safe) e saldo (`saldoCaixaCentavos`,
`saldoContaCentavos`).

**Front.** Sem Pinia: estado global em `useState()` com prefixo `padaria.workspace.*` distribuído por
`provide/inject` com ~100 campos. Cliente de API central em `composables/useApi.ts` (com 7 `fetch()`
crus fora dele). 30 `@media` cobrindo 1024/768/390.

**Infra.** Compose em 4 arquivos (`base`, `dev`, `prod`, `coolify`). Deploy no **Coolify disparado
por push na `main`** — não há workflow de deploy no repositório. CI em 2 jobs: `qualidade` (lint →
check → test:unit → test web-vue → build, 25 min) e `integracao` (`npm test` completo, 30 min).

---

## §3 · Qualidade automatizada — o que já protege o projeto

Vale enumerar porque parte disso é melhor do que o padrão de mercado:

- **`scripts/verificar-arquitetura.mjs`** — proíbe SQL cru em `api/src`, `*.schema.ts` em `api/src`,
  controller→repository, repository→service, e import de subpath de `@padaria/shared` no `web-vue`
  (que viraria 404 em runtime com lint e typecheck verdes). Hoje: **0 ocorrências** de SQL cru.
- **`scripts/verificar-texto.mjs`** — 30 padrões de mojibake e bloqueio de nome de domínio em inglês
  (`pgTable("users")`, `/api/products`).
- **`scripts/verificar-data-pendente.mjs`** — catraca fechada em **0/0**: a marca física de "campo que
  aparece e não salva" não pode voltar.
- **`.dependency-cruiser.cjs`** — 9 regras de erro (ciclos, camadas, `shared` isolado).
- **`eslint.config.mjs`** — `recommendedTypeChecked`, `no-explicit-any` **erro**, `no-unsafe-*`
  **erro**, `eslint-plugin-security`, e uma regra rara: `unknown` explícito proibido fora do alias
  `DadosExternos`.
- **`web-vue/utils/cores-categoria.test.ts`** — lê o `main.css` e falha se os hex divergirem do
  TypeScript. Também testa contraste WCAG programaticamente. Nasceu porque havia duas fontes com hex
  diferentes e ninguém percebia.
- **`web-vue/vitest.config.ts`** — fixa `TZ=America/Sao_Paulo`, com o comentário explicando que num
  CI em UTC os testes de fuso passariam por acidente.

**O que existe como script e não roda em gate nenhum:** `lint:deps`, `format:check`, `audit:deps`,
`knip`, `depcheck`, e o `check` do `integracoes-scripts`.

---

## §4 · Riscos abertos, com evidência

### Críticos

**A-01 · Venda duplicada por corrida na ingestão**
`api/src/integracoes/integracoes.service.ts:722` lê o registro e `:733` insere a venda dentro de uma
transação em READ COMMITTED (`api/src/banco/conexao.ts:19-21`), **sem `FOR UPDATE` e sem advisory
lock**. E `db/src/schema/app.schema.ts:903-917` mostra que `vendas` só tem UNIQUE `(id, empresa_id)`
— **não há UNIQUE em `identificador_externo`**. Dois POSTs simultâneos do mesmo `CREARE:<id>` criam
duas vendas com itens e pagamentos duplicados; o ledger aponta para uma só e a outra vira órfã
permanente, contando em dobro no caixa e na conciliação.
Caminho concreto para isso acontecer: `integracoes-scripts/README.md:104-105` **recomenda rodar o
reprocesso junto com o robô**, e `reprocessar.js:14` confirma que pode.
→ **É o mecanismo mais provável da duplicação histórica.**

**A-02 · O hash de idempotência ignora todas as datas**
`integracoes.service.ts:102-110` — `jsonCanonico` trata `Date` pelo ramo de objeto e
`Object.keys(date)` devolve `[]`, produzindo `{}`. Como o schema converte para `Date`
(`shared/src/integracoes/index.ts:83` e `:96`), **`dataHoraVenda` e `dataHoraItem` colapsam para
`{}` no hash**. Verificado empiricamente: duas vendas idênticas com timestamps de dias diferentes
geram o mesmo hash. Consequência: se o CREARE corrigir a hora de uma venda, o servidor responde
`sem_novidade` e **a venda nunca migra para o caixa correto**. Nenhum reprocesso resolve.

### Altos

**A-03 · `ILIKE` sem escape no número do lacre**
`api/src/caixa/caixa.repository.ts:364` usa `ilike(lacres.numero, numeroLacre)` com o número digitado
pelo operador (`caixa.service.ts:273`, `:316`). `%` e `_` são curingas: abrir caixa com lacre `%`
casa um lacre arbitrário (`LIMIT 1`, sem `ORDER BY`). Mesmo padrão em 4 resoluções de vínculo da
integração (`integracoes.repository.ts:475/513/549/579`).

**A-04 · Venda tardia não recalcula os totais congelados**
`integracoes.service.ts:744-749` grava a marca R-013 e `integracoes.repository.ts:664/693` grava
`caixa_id`, mas nada reexecuta `atualizarFechamentoCaixaRepository` (`caixa.repository.ts:835-866`,
chamado só no fechamento). Resultado: o **histórico** lê colunas congeladas
(`caixa.repository.ts:901-928`) e o **detalhe** recalcula ao vivo (`:595-666`) — **duas telas mostram
números diferentes para o mesmo caixa**.

**A-05 · Tabelas de log crescem sem expurgo e a listagem não tem `LIMIT`**
Cada venda reenviada grava uma linha em `integracoes_sem_novidade` **e** uma em
`integracoes_historico`, ambas com o **payload jsonb completo**. Com ciclo de 10 min relendo o dia
inteiro, são ~72 × (vendas do dia) linhas por dia. Nenhuma das duas tem índice
(`app.schema.ts:817-853`) e não há rotina de expurgo. Pior:
`listarHistoricoIntegracaoRepository` (`integracoes.repository.ts:249-257`) faz **SELECT sem filtro
de data e sem LIMIT**, agregando em JS.

**A-06 · Unicidade de lacre case-sensitive contra busca case-insensitive**
`lacres.repository.ts:37` usa `eq`; a constraint é sobre o texto exato. `caixa.repository.ts:364`
busca com `ilike` e `LIMIT 1` sem desempate. `AB123` e `ab123` coexistem e qual será rompido é
indefinido.

**A-07 · Edição de transferência troca o lacre sem validar**
`transferencias.repository.ts:290-305` grava `nLacreDoc` sem consultar `existeNumeroLacreRepository`
e **sem tocar na tabela `lacres`** — ao contrário da criação. O número pode apontar para um lacre já
rompido ou inexistente, e a confirmação lança erro genérico.

**A-08 · Venda integrada é editável sem trilha**
`PUT /api/vendas/:vendaId` (`vendas.controller.ts:109-126`) não verifica `integracaoChaveId`. Um
usuário com `entradas_editar` altera valor e itens de uma venda do CREARE, os filhos são apagados e
reinseridos, e **nada é auditado**. Como o hash não muda, o próximo ciclo responde `sem_novidade` e a
alteração **nunca é revertida**. Contraria a regra de negócio explícita da reunião.

**A-09 · Front sem rede de segurança**
`AppWorkspace.vue` tem **1.991 linhas** (o pico citado no `AGENTS.md` era 1.886 — já foi
ultrapassado), 94% script. **11 arquivos** passam de 400 linhas. Existe **1 único teste de componente
montado** em toda a base, sobre um componente de 50 linhas. **Zero E2E** — nenhum Playwright, Cypress
ou axe. Cobertura não é medida.

### Médios

**A-10 · Configuração de fuso do agente é contraditória e o valor vazio é ignorado**
`integracoes-scripts/.env.producao.example:27-29` manda deixar `SYNC_FUSO_OFFSET=""` afirmando que
isso rotula a hora local como UTC; o `README.md:31` diz o contrário; e `env.js:40` (`?.trim() ||
"-03:00"`) faz string vazia virar `-03:00`, tornando **inalcançável** o ramo alternativo de
`payload.js:31`. Quem seguir o `.env.example` acredita estar numa convenção e está em outra. Se
alguém "corrigir" para `+00:00`, **todas as vendas deslocam 3h**. O offset é fixo, não IANA — a volta
do horário de verão quebra a conciliação.

**A-11 · Heartbeat do lock 1× por ciclo, expiração de 30 min**
`loop.js:57` renova o lock uma vez por ciclo; `lock.js:34-40` considera obsoleto qualquer lock com
mais de 30 min. A 4 req/s, 30 min comportam ~7.200 vendas — um backfill, a virada de dia ou uma
sequência de 429 estouram isso. Outra execução rouba o lock e **dois processos enviam as mesmas
vendas em paralelo**: o gatilho direto do A-01.

**A-12 · Orçamento de rate limit estourado**
A API permite 300 req/min por chave; o agente usa até 240 e o `reprocessar.js` cria o **próprio**
throttle em outro processo (mais 240). O README recomenda rodar os dois juntos. Resultado: 429 em
rajada e venda descartada em silêncio (`reprocessar.js:139`).

**A-13 · Reenvio sobrescreve decisão humana**
Um reenvio com hash diferente recalcula e sobrescreve `caixa_id`, desfazendo a revinculação que um
gerente fez (e que **foi** auditada em `edicoes_caixa`) — sem nenhuma linha de auditoria.

**A-14 · Venda órfã não gera alerta**
Sem caixa que cubra o instante, `caixaId = null`, a marca pós-fechamento não é criada, e a venda não
aparece em caixa nenhum. Não há relatório de "vendas sem caixa" nem alerta.

**A-15 · A API cria PDV e conta sozinha**
`configPadrao` devolve `criarAutomaticamente: true`. Um `ID_DISPOSITIVO` novo no CREARE dispara
`criarPdvComContaRepository`, criando um PDV **e** uma conta contábil sem intervenção humana. **Não há
no código nenhuma restrição a "4 PDVs" nem à unidade TNP.**

**A-16 · ~~`/health` não toca o banco~~ — CORRIGIDO em 05/08/2026 (issue #33 / G-04)**
Era objeto estático; agora consulta o banco e responde **503** em 2s quando ele não responde. A
verificação com `docker stop` no Postgres revelou algo que a auditoria não tinha visto: **a API
morria junto com o banco** (`error` sem ouvinte no `pg.Pool` = `throw` no Node), então o 503 nunca
chegaria a existir. Detalhes e números medidos na D-21.

**A-17 · Sem request-id**
`grep requestId|reqId|genReqId` em `api/src` = 0 ocorrências, embora `ProblemDetails` no `shared` já
preveja o campo. Um erro no Sentry não se liga ao log da requisição.

**A-18 · Backup sem agendamento**
`scripts/backup-db.mjs` existe e é bom (`pg_dump -Fc`, retenção 14). **Nada o chama** — nenhum cron,
workflow ou serviço. Os 3 dumps existentes têm nome fora do padrão e estão fora da retenção.

**A-19 · Agendador dentro do processo da API**
`server.ts` roda `processarTransferenciasTemporais()` a cada 60s via `setInterval`, sem lock
distribuído. Com duas réplicas, roda duas vezes. (Já registrado como D-05.)

**A-20 · `paraCentavos` não tolera separador de milhar**
`shared/src/dinheiro/index.ts` — `paraCentavos("1.234,56")` vira `123` centavos em vez de `123.456`.
Só é seguro para `1234,56` e `1234.56`. **Não confirmado** se algum caminho atual entrega esse
formato, mas é um destruidor silencioso de valor.

### Baixos, mas registrados

- **Três "fontes de verdade" documentais no disco**, com numeração colidente: `PROJECT_BRAIN/`
  (00-20, 67, 68), `PROJECT_BRAIN - Copia/` (63 docs em inglês, 00-62) e
  `design-system/PROJECT_BRAIN/` (61-66). O salto 20→67 é porque os dois últimos continuam a série
  do design system e foram gravados na pasta errada.
- **`design-system/web-vue/`** contém 8 cópias divergentes de arquivos vivos, com uma segunda marca
  (Pralis vs Cicluz). Fora do git, mas no disco.
- **`dist/` versionado no disco** em `api`, `db` e `shared`, e 3 `.d.ts.map` órfãos dentro de
  `api/src`.
- **`.env.example` com dado real de produção** (e-mail de admin, CNPJ).
- **Snapshot de migration já ficou para trás duas vezes** (0027/0028 e 0029) e o `drizzle-kit check`
  **não detecta** — ele nunca valida paridade journal↔snapshot.
- **12 telas no menu caem em placeholder** (27% do menu) e "aparência" tem rota **e** modal.
- **Duas cascas de aplicação**: `/integracoes` e `/pedidos` reimplementam sessão e permissões, e por
  isso ficam sem cor de menu, sem sino de notificações e sem "+ Novo".

---

## §5 · Ferramental de time sênior — o que já temos e o que falta

Comparação honesta com a lista clássica. O critério não é "o que times grandes usam", é **"o que um
time de duas pessoas consegue operar sem virar plantonista"**.

| Categoria      | Padrão de mercado              | Aqui                                                  | Veredito                                                                    |
| -------------- | ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Versionamento  | Git + GitHub                   | **existe e bem usado** — PRs, branches, concurrency   | nada a fazer                                                                |
| CI             | GitHub Actions                 | **existe**, 2 jobs, integração com Postgres real      | **melhorar**: trazer 3 checagens que já existem                             |
| CD             | pipeline de deploy             | Coolify auto-deploy no push da `main`, sem workflow   | **aceitável**, mas exige disciplina de branch                               |
| Containers     | Docker                         | **existe e bem feito** (`cap_drop: ALL`, healthcheck) | nada a fazer                                                                |
| Orquestração   | Kubernetes                     | não existe                                            | **não fazer.** Um serviço, um banco, uma padaria                            |
| Erro           | Sentry                         | **existe**, `tracesSampleRate: 0`, sem request-id     | **melhorar** — barato e alto retorno                                        |
| Métricas       | Prometheus + Grafana           | não existe                                            | **não agora.** `/health` real + alerta de silêncio da integração cobrem 90% |
| Logs           | ELK / Loki                     | pino + log do Coolify                                 | **não agora** neste volume                                                  |
| Testes         | unit + integração + E2E        | 462 casos, **zero E2E**                               | **fazer** — 3 fluxos de dinheiro em Playwright                              |
| Cobertura      | medida com limiar              | não medida                                            | **fazer** — medir primeiro, limiar depois                                   |
| Segurança deps | Dependabot / `npm audit` no CI | script existe, não roda                               | **fazer** — uma linha no CI                                                 |
| Documentação   | Confluence / Notion            | PROJECT_BRAIN no git, 22 docs                         | **melhor que o padrão** — mas precisa consolidar as 3 cópias                |
| ADR            | pasta de ADRs                  | comando `.claude/commands/adr.md`, uso irregular      | **formalizar** — decisão estrutural vira ADR                                |
| Design         | Figma                          | fotos dos desenhos do Rodrigo + tokens em CSS/TS      | **talvez** — um arquivo só de tokens ajudaria                               |
| Gestão         | Jira / ClickUp                 | PROJECT_BRAIN + prompts em `docs/`                    | **não** — GitHub Issues bastam para 2 pessoas                               |
| Code review    | PR obrigatório                 | PRs existem; regra formal **não foi acordada**        | **decidir** — é o bloco 6 adiado da reunião                                 |

**Conclusão:** o gap real não é de ferramenta, é de **cobertura das ferramentas que já existem**.
Cinco checagens já escritas e pagas não rodam em gate nenhum. Isso é o item de melhor retorno do
projeto inteiro, e custa uma tarde.

---

## §6 · Plano priorizado

Ordenado por (risco × custo). Cada item cabe em uma entrega vertical.

### Faixa 0 — barato e imediato (uma tarde, tudo junto)

| #   | Ação                                                                                      | Por quê                                                   |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0.1 | Incluir `test --workspace @padaria/web-vue` no `npm test` da raiz                         | hoje `npm run quality` **não roda nenhum teste de front** |
| 0.2 | Trazer `lint:deps`, `format:check` e `audit:deps` para o CI                               | 3 checagens já escritas que não protegem nada             |
| 0.3 | Regra `max-lines` no ESLint para `web-vue`                                                | fecha a regra 4.5 do `AGENTS.md` automaticamente          |
| 0.4 | ~~`/health` executando `SELECT 1`~~ ✅ **feito em 05/08** (G-04, sem SQL cru — ver D-21)  | hoje o container fica verde com o banco morto (A-16)      |
| 0.5 | `engines: { node: ">=22" }` nos 7 `package.json`                                          | Node só está fixado em Dockerfile e CI                    |
| 0.6 | Declarar `SYNC_FUSO_OFFSET` corretamente no `.env.producao.example` e no README do agente | a documentação hoje contradiz o código (A-10)             |

### Faixa 1 — dinheiro (fazer antes de qualquer módulo novo)

| #   | Ação                                                                                                                                                                 | Risco     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | **UNIQUE em `vendas(empresa_id, identificador_externo)`** + `ON CONFLICT` na ingestão. Antes: contar duplicatas existentes e decidir com o José o que fazer com elas | A-01      |
| 1.2 | **Corrigir `jsonCanonico`** para serializar `Date` em ISO. Depois: reprocessar o período afetado                                                                     | A-02      |
| 1.3 | **Escapar `%`, `_` e `\`** em toda busca `ilike` com entrada de usuário (5 pontos)                                                                                   | A-03      |
| 1.4 | **Teste de ingestão concorrente** do mesmo `identificador_externo` — é o que prova o 1.1                                                                             | A-01      |
| 1.5 | **Teste de pagamento dividido** (2 e 3 formas na mesma venda) — hoje não existe nenhum                                                                               | histórico |
| 1.6 | **Recalcular os totais do fechamento** quando venda tardia entra em caixa fechado                                                                                    | A-04      |
| 1.7 | **Bloquear edição de venda integrada** ou exigir permissão dedicada + trilha de auditoria                                                                            | A-08      |
| 1.8 | **Unicidade de lacre case-insensitive** (índice sobre `lower(numero)`)                                                                                               | A-06      |

### Faixa 2 — continuidade e operação

| #   | Ação                                                                                                            | Risco |
| --- | --------------------------------------------------------------------------------------------------------------- | ----- |
| 2.1 | Agendar `db:backup` e padronizar o nome dos dumps existentes                                                    | A-18  |
| 2.2 | Retenção e índice em `integracoes_historico` / `integracoes_sem_novidade`; `LIMIT` e filtro de data na listagem | A-05  |
| 2.3 | Heartbeat do lock do agente a cada N vendas, não 1× por ciclo                                                   | A-11  |
| 2.4 | Orçamento de rate limit compartilhado entre agente e reprocesso (ou recusar rodar em paralelo)                  | A-12  |
| 2.5 | Request-id no Fastify, propagado para o log e para o Sentry                                                     | A-17  |
| 2.6 | Alerta de "venda órfã" e relatório de vendas sem caixa                                                          | A-14  |
| 2.7 | Desligar criação automática de PDV/conta, ou exigir aprovação                                                   | A-15  |

### Faixa 3 — poder mexer no front sem medo

| #   | Ação                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------- |
| 3.1 | Playwright com 3 fluxos que movem dinheiro: abrir caixa por lacre → lançar despesa → fechar           |
| 3.2 | Asserção automatizada de scroll horizontal em 1440/1024/768/390 (fecha a parte objetiva da R-102)     |
| 3.3 | `@vitest/coverage-v8` só para medir, sem limiar                                                       |
| 3.4 | Unificar as duas cascas: `/integracoes` e `/pedidos` passam a usar `AppWorkspace`                     |
| 3.5 | Extrair de `AppWorkspace.vue` (1.991 l.) pelo menos sessão/empresa e notificações                     |
| 3.6 | Resolver "aparência" (rota **ou** modal, não os dois) e decidir o destino das 12 telas em placeholder |

### Faixa 4 — higiene documental ✅ **FEITA em 05/08/2026** (ver D-23)

| #   | Ação                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- |
| 4.1 | ✅ arquivados em `_ARQUIVO_MORTO/`, com o conteúdo útil resgatado em `23`, `24` e `67` §13           |
| 4.2 | ✅ apagado                                                                                           |
| 4.3 | ✅ reescrito                                                                                         |
| 4.4 | ⚠️ parcial — marcado como histórico no índice e as referências às pastas arquivadas foram corrigidas |
| 4.5 | Desambiguar os dois cabeçalhos **D-07** em `18_DIVIDAS_TECNICAS.md`                                  |
| 4.6 | Resolver as colisões de id em `19`: R-021 e R-110 aparecem com dois significados                     |

---

## §7 · O que esta auditoria NÃO cobriu

Honestidade sobre os limites:

- **`npm audit` não foi executado** (exigiria rede) — não há afirmação sobre vulnerabilidade aberta.
- **Nada foi medido em produção.** Volume real de vendas/dia, tamanho atual das tabelas de log e
  latência das rotas são desconhecidos. Os riscos de crescimento (A-05) são projeção, não medição.
- **A branch está muito à frente da `main`.** Não foi quantificado o quanto a produção está atrás —
  vários riscos aqui descritos podem não existir na versão que roda hoje na TNP, e outros podem ser
  piores lá.
- **`integracoes-scripts` foi lido, não executado.** As conclusões sobre o robô vêm do código e das
  queries, não de observação do processo rodando no servidor da padaria.
