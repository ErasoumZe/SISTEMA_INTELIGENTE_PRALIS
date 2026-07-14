# Diagnóstico Técnico — Sistema Caixa / Padaria v2

**Data:** 02/07/2026
**Branch auditada:** `analise-e-documentação-+-teste-de-permissões` (working tree limpo, sincronizada com origin)
**Método:** 7 auditorias paralelas por subsistema (backend, banco, frontend, shared, testes, documentação, infra) + validação prática executada (typecheck, lint, testes de integração e unitários, validação de composes). Nenhum arquivo do projeto foi alterado durante a auditoria.

---

## 1. Resumo executivo

O projeto é um **ERP multiempresa para padaria** em monorepo TypeScript, com fundação arquitetural **acima da média para o estágio**: camadas controller→service→repository impostas por ferramenta, contratos Zod em pacote shared, permissões em 3 camadas, isolamento multiempresa consistente e **107/107 testes de integração passando contra Postgres real (Testcontainers)**. O módulo Caixa é de fato o mais maduro e serve como referência.

Os problemas não estão na arquitetura, e sim na **prontidão para produção**:

1. As migrations de produção **não criam o schema** — o deploy do zero falharia.
2. A aritmética de dinheiro no caixa roda em **float** com **duas fórmulas de saldo divergentes**.
3. Uploads se perdem a cada redeploy.
4. **Não existe CI**, os hooks de git estão inativos e o `npm run lint` está **vermelho com 4.896 erros** (causa-raiz de tooling, não de código).
5. Sem backups nem observabilidade.

Estimativa: o sistema está a **3–5 semanas de trabalho focado** de um "pronto para produção" honesto, sem retrabalho arquitetural.

---

## 2. O que o projeto faz

Sistema de gestão operacional/financeira para uma rede de padarias (marca **Pralis**; empresas TNP/Lisboa/Oro-Hora):

- Controle de **caixa por PDV e usuário** (abertura com token de edição, lançamentos, acerto de diferença, fechamento).
- Lançamentos financeiros (vendas/entradas, despesas, mercadorias, retiradas, transferências com malotes/lacres).
- **Cadastros ricos de produtos** (custo, margem, preço, fiscal, promoções, transformação — herdados do sistema legado Pralis, unificação em andamento).
- Colaboradores/cargos/jornadas, usuários com **permissões por setor/cargo/usuário**, multiempresa lógico.
- **Integração de vendas** vinda do PDV legado CREARE/Compilarte (MySQL → `POST /api/integracoes` com api-key).

---

## 3. Arquitetura encontrada

Monorepo npm workspaces (`package.json`) com 6 pacotes:

- **`api/`** — Fastify 5 + TypeScript. 27 módulos de rota, cada um em trinca `*.controller.ts` / `*.service.ts` / `*.repository.ts` (`api/src/app.ts`). Drizzle sobre `pg.Pool` (`api/src/banco/conexao.ts`), zero SQL cru (verificado por script). Auth better-auth com sessão em cookie httpOnly.
- **`db/`** — Drizzle/PostgreSQL 16. Fonte de verdade é `db/src/schema/app.schema.ts` (1.081 linhas, 56 tabelas); os schemas por domínio apenas reexportam dele. Seed monolítico `db/seed.ts` (~1.274 linhas).
- **`shared/`** — `@padaria/shared`: 30 módulos de contratos Zod + tipos, catálogo de ~197 permissões e resolução em camadas (`shared/src/autenticacao/index.ts`), regras puras de precificação (`shared/src/produtos/regras.ts`), helpers de centavos (`shared/src/dinheiro/index.ts`).
- **`web-vue/`** — Nuxt 4 + Vue 3 + Vuetify 3, **SPA pura** (`ssr:false`), 34 páginas, estado global via `useState` (sem Pinia), consumindo tipos do shared via alias.
- **`tests/`** — Vitest 4 + Testcontainers; exercita a API real in-process (`app.inject`) e confere efeitos no banco com `pg`.
- **`integracoes-scripts/`** — worker JS que lê o MySQL do CREARE e empurra vendas para a API.

As fronteiras são **impostas por ferramenta**, não por convenção: `.dependency-cruiser.cjs` (controller não importa repository, shared não importa apps, sem ciclos), `scripts/verificar-arquitetura.mjs` (sem SQL cru na API, contratos só no shared) e `scripts/verificar-texto.mjs` (domínio em português, bloqueia mojibake).

---

## 4. Módulos existentes

| Módulo                                     | Estado real                                                                                                   | Evidência                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Caixa**                                  | Maduro: abrir/editar (token + auditoria)/acertar/fechar/histórico/status, lançamentos presos ao caixa aberto  | `api/src/caixa/`, `tests/integration/caixa/caixa.test.ts`                                 |
| **Lançamentos**                            | Funcional: vendas, despesas, mercadorias, retiradas, transferências (com malote/lacre)                        | `api/src/lancamentos/lancamentos.dominio.ts` e módulos irmãos                             |
| **Produtos**                               | Fase A da unificação Pralis implementada: comercial, fiscal, promoções, transformação, códigos, import/export | `shared/src/produtos/`, `api/src/produtos/`, commits `f8609a3`→`d3573ff`                  |
| **Permissões**                             | Funcional: catálogo ~197, resolução usuário>cargo>setor, `usuario_admin` concede tudo, CRUD de regras         | `api/src/auth/`, `api/src/permissoes/`, `tests/integration/permissoes/hierarquia.test.ts` |
| **Usuários/Empresas/Cadastros**            | CRUD funcional + clonagem entre empresas (importar/exportar)                                                  | `api/src/usuarios/`, `api/src/empresas/` e 10+ módulos de cadastro                        |
| **Autenticação**                           | Funcional: better-auth, sessão cookie, reset de senha (link só no log — dev)                                  | `api/src/auth/config.ts`                                                                  |
| **Integrações**                            | Funcional: chaves com hash, ingestão idempotente, dicionário de conversão, histórico                          | `api/src/integracoes/`, `integracoes-scripts/`                                            |
| **Uploads**                                | Parcial: comprovantes de venda em multipart, gravados em disco local                                          | `api/src/vendas/comprovantes.service.ts`                                                  |
| **Relatórios**                             | Mínimo: produtos mais vendidos + resumo de fechamento                                                         | `api/src/vendas/produtos-mais-vendidos.controller.ts`                                     |
| **Financeiro/RH/Compras/Estoque/Produção** | **Não existem** — ~16 telas placeholder/ocultas no menu                                                       | `web-vue/utils/domain.ts` (`telasOcultasNoDrawerEPermissoes`)                             |

---

## 5. Funcionalidades já implementadas

- **Caixa completo por usuário+PDV**: bloqueio de duplo caixa no PDV, sobreposição de período, edição de abertura com token trocado e auditoria em `edicoes_caixa`, acerto de saldo positivo gerando despesa "Diferença de caixa" + débito do colaborador, fechamento condicionado ao saldo.
- **Escopo "somente caixa aberto"** no servidor: listagens de movimentação presas ao caixa aberto do usuário quando o perfil tem a flag (`resolverEscopoListagemPorCaixa`, `api/src/caixa/caixa.service.ts`).
- **Multiempresa lógico** em ~36 tabelas com `empresa_id` + vínculos `usuarios_empresas`, validado em praticamente todos os endpoints (403 `FORBIDDEN_COMPANY` testado módulo a módulo).
- **Produtos Pralis**: custo/margem/preço automático, satélites fiscal/transformação/promoções, código interno sequencial + externo `PR-XXXX-XXXX`, dedup com `forcar`, importação entre empresas.
- **Permissões em 3 camadas** com `false` vencendo na camada e camada posterior sobrescrevendo anterior; menu do front filtrado por permissões efetivas.
- **Integração CREARE**: ingestão de vendas idempotente com chave hasheada e vínculos pendentes resolvíveis pela tela `web-vue/pages/integracoes.vue`.
- **Tema/aparência por empresa e tela**, identidade visual Pralis aplicada (logos, paleta laranja, Montserrat).

---

## 6. O que está bom

1. **Fronteiras de camada garantidas por ferramenta** (dependency-cruiser + scripts próprios rodando no `npm run check`) — decisão rara e valiosa; manter.
2. **Testes de integração reais**: Postgres efêmero, API real, asserts que conferem o efeito no banco (ex.: `caixa_id` gravado no movimento). 107/107 verdes em execução feita nesta auditoria.
3. **Dinheiro como `numeric(14,2)` no banco** — nunca float no armazenamento (`db/src/schema/app.schema.ts`, helper `valorMonetario`).
4. **Contratos Zod centralizados no shared** consumidos pela API (`.parse()` em todas as rotas) e tipos consumidos pelo front — sem rota sem validação de input.
5. **Docker de produção decente**: multi-stage, runtime não-root (node / nginx-unprivileged), Coolify com `cap_drop: ALL` e `no-new-privileges`, secrets obrigatórios via `${VAR:?}`.
6. **Segurança de app na API**: helmet, CORS restrito a `WEB_ORIGIN`, rate-limit global 300/min + limites específicos (auth 20/min, integrações 30/min), multipart limitado a 10 MB.
7. **Domínio em português consistente**, imposto por check automatizado.
8. **Zero TODO/FIXME/ts-ignore** no código de produção — o débito está explícito (placeholders), não escondido.

---

## 7. O que parece finalizado

Critérios usados: **funciona** (fluxo completo executável) < **testado** (integração cobrindo happy path + negativos) < **pronto para produção** (também sobrevive a deploy, concorrência, falha e auditoria).

- **Funciona + testado**: Caixa (ciclo completo), lançamentos, permissões (hierarquia + CRUD), autenticação/sessão, multiempresa, produtos (CRUD + satélites + import/export), integrações, malotes, colaboradores.
- **Funciona, teste raso**: usuários, empresas, PDVs, formas de pagamento (1–2 testes cada).
- **Pronto para produção**: **nada ainda** — nem o Caixa, porque o caminho de deploy (migrations), a integridade monetária sob concorrência e a persistência de uploads não estão resolvidos. Essa é a distância real entre "testado" e "produção".

---

## 8. O que está incompleto

- **~16 telas placeholder** (financeiro, DRE, estoque, folha ponto, patrimônio, ficha técnica, ingredientes, notas fiscais…) ocultas no menu (`web-vue/utils/domain.ts`).
- **Botão "Editar" de operações não edita**: `abrirOperacao` abre modal de novo lançamento e `salvarOperacao` sempre faz POST (`web-vue/components/app/AppWorkspace.vue`, ~linhas 686–796). Funcionalidade ausente disfarçada de botão ativo.
- **Acerto de caixa só cobre diferença positiva** na UI (`precisaAcerto = saldo > 0`, `web-vue/components/caixa/CaixaResumoPage.vue`); sobra/diferença negativa sem tratamento.
- **Sangria/suprimento** não existem como conceito nomeado — são retiradas/transferências genéricas; não há conferência cega no fechamento (e a documentação nunca prometeu — requisito a decidir).
- **Reset de senha** gera link apenas no log da API (comportamento dev; sem e-mail real).
- **Fase A de produtos sem migration versionada** — schema Drizzle à frente de `db/migrations/`.
- **Matriz e2e cargo×operação de caixa** ainda não portada para Testcontainers (só a prova genérica de hierarquia).

---

## 9. Problemas encontrados

1. **Migrations de produção vazias de schema** — `db/migrations/` tem só `0000_hardening.sql`, **sem `meta/_journal.json`**; `drizzle-kit migrate` (o que roda no deploy: `api:prod:migrate`) não aplica nada. O hardening (triggers de `atualizado_em`, índice de `codigo_hash`) também está órfão e defasado.
2. **Duas fórmulas de saldo de caixa divergentes**: `saldoCaixa` em `api/src/caixa/caixa.regras.ts` (não considera mercadorias nem o split de transferências) × `calcularSaldoOperacional` em `api/src/caixa/caixa.service.ts` (considera). E **dois fluxos de "acertar saldo"** com efeitos diferentes: o legado por data grava só a despesa; o operacional grava despesa + item + débito + ajuste (`api/src/caixa/caixa.repository.ts`).
3. **Agregações monetárias em float**: `total + Number(valorOriginal)` e `.toFixed(2)` em `obterTotaisCaixa` e `calcularTotaisCaixaOperacionalRepository`; validação "soma dos itens === total" com `Math.round(v*100)/100` e `===` (`api/src/lancamentos/lancamentos.dominio.ts:223`). O shared tem `somarCentavos` — **morto, 0 usos**.
4. **Erros inesperados viram 400 sem log**: controllers mapeiam status por **texto da mensagem** do `Error`; uma falha de banco dentro do try/catch responde 400 com a mensagem crua e não é logada. `ErroDominio` existe (`api/src/erros.ts`) mas só integrações usa.
5. **Lint vermelho (4.896 erros)**: ~98% são `no-unsafe-*` porque o typed-lint resolve `@padaria/shared` pelos `types` que apontam para `dist/` inexistente (tsc passa porque usa a condição `development`). Gate de qualidade quebrado no checkout limpo.
6. **Corrida na abertura de caixa**: check + insert em transação, mas sem unique parcial `(pdv_id) WHERE status='aberto'` nem `FOR UPDATE` — duas aberturas simultâneas do mesmo PDV podem passar.
7. **Zero índices não-únicos** no schema de negócio: nem `empresa_id`, nem FKs, nem colunas de data/status.
8. **Filtro multiempresa em memória**: `listarProdutos`, `listarFormasPagamento` e `listarEmpresas` fazem SELECT da tabela inteira e filtram no service — risco latente de vazamento + problema de escala.
9. **Front soma dinheiro em float** e monta payloads da API em `web-vue/utils/domain.ts` (`cadastroPayload`) — regra de contrato fora do shared.
10. Menores: tabela órfã `itens_vendas` (só o seed escreve, ninguém lê); `atualizado_em` de produtos nunca atualiza; pares redundantes `data_hora_abertura`/`aberto_em`; `.env.example` documenta `API_PORT` mas a API lê `PORT`; duplicações (`arredondar` reimplementado na API, dois "tema padrão" divergentes, `dataHoraLocal` duplicado); `perfis_usuarios.usuario_id` sem FK para `user`.

---

## 10. Riscos críticos

| #   | Risco                                                 | Onde                                                                       | Por quê / Impacto                                                                                                                                                                                                 | Correção                                                                                                                                                 | Prioridade |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **CRÍTICO** — Deploy de produção não cria o schema    | `db/migrations/`, `api:prod:migrate` em `api/package.json`                 | `drizzle-kit migrate` sem journal não aplica nada; primeiro deploy real falha ou sobe API sem tabelas. Impacto: bloqueio total de go-live; risco de alguém "resolver" rodando `push --force` em prod (destrutivo) | Gerar baseline com `drizzle-kit generate` + journal (inclui hardening); teste automatizado que provisiona banco só via `migrate`                         | P0         |
| 2   | **CRÍTICO** — Integridade monetária do caixa          | `api/src/caixa/caixa.repository.ts`, `caixa.regras.ts`, `caixa.service.ts` | Duas fórmulas de saldo + dois acertos com efeitos distintos + somas em float. Impacto: fechamento com centavos errados, débito indevido de colaborador, perda de confiança no sistema                             | Uma única fórmula em centavos (no shared), deprecar caminho legado por data, somatórios via `somarCentavos`, testes de propriedade com muitos movimentos | P0         |
| 3   | **CRÍTICO** — Uploads perdidos em produção            | `api/src/vendas/comprovantes.service.ts:16`; composes em `infra/`          | Comprovantes gravados no filesystem do container sem volume; cada redeploy apaga documentos fiscais/financeiros                                                                                                   | Volume nomeado no compose Coolify/prod (curto prazo) ou storage S3-compatível (médio)                                                                    | P0         |
| 4   | **ALTO** — Erros mascarados como 400 sem log          | Controllers da API (padrão `statusErro` por string)                        | Falhas reais de infraestrutura ficam invisíveis e vazam mensagem interna ao cliente                                                                                                                               | Migrar services para `ErroDominio`; try/catch dos controllers relança o que não for domínio para o handler global                                        | P1         |
| 5   | **ALTO** — Secret de auth com default embutido        | `api/src/env.ts:7`                                                         | Se a API subir fora do compose que força a var, assina sessões com `dev-secret-change-me...`; `NODE_ENV` é string livre (typo desativa gates de produção)                                                         | `NODE_ENV` como enum; em produção, recusar boot se secret == default                                                                                     | P1         |
| 6   | **ALTO** — Corrida na abertura de caixa               | `api/src/caixa/caixa.service.ts:183` + repository                          | Dois caixas abertos no mesmo PDV corrompem o escopo de lançamentos e o fechamento                                                                                                                                 | Unique parcial `(pdv_id) WHERE status='aberto'` + tratamento do conflito; teste de concorrência                                                          | P1         |
| 7   | **ALTO** — Sem CI, hooks inativos, lint vermelho      | ausência de `.github/` e `.husky/`; `shared/package.json` `types→dist`     | Todo o gate (`quality`, `test:complete`) depende de disciplina manual e o lint nem passa; regressões entram silenciosamente                                                                                       | GitHub Actions com `check` + testes + lint; consertar resolução de tipos do lint (condição development ou build prévio); `prepare: husky`                | P1         |
| 8   | **ALTO** — Sem backup nem observabilidade             | `infra/`, `db/`                                                            | Perda de dados financeiros sem recuperação; incidentes invisíveis                                                                                                                                                 | `pg_dump` agendado + retenção; Sentry/OTel mínimo; redact no pino                                                                                        | P1         |
| 9   | **MÉDIO** — Sem índices; filtro de empresa em memória | `db/src/schema/app.schema.ts`; services citados                            | Degradação de performance com crescimento; risco latente de vazamento cross-empresa                                                                                                                               | Índices em `empresa_id`, FKs, datas; mover filtro para o WHERE                                                                                           | P2         |
| 10  | **MÉDIO** — Segurança opt-in por rota                 | `api/src/auth/guards.ts`                                                   | Rota nova sem preHandler nasce pública (hoje não há nenhuma desprotegida, verificado)                                                                                                                             | Hook global `onRequest` com allowlist explícita de rotas públicas                                                                                        | P2         |
| 11  | **MÉDIO** — Sem soft delete/trilha de auditoria geral | schema (cascade físico)                                                    | ERP financeiro apaga vendas/empresas fisicamente em cascata; rastro só em `edicoes_caixa`                                                                                                                         | Definir política: soft delete nas tabelas de movimento ou tabela de auditoria de mutações                                                                | P2         |
| 12  | **BAIXO** — Divergências menores                      | seções 8–9                                                                 | Confusão de manutenção                                                                                                                                                                                            | Tratar na fase de consolidação                                                                                                                           | P3         |

---

## 11. Divergências entre documentação e código

O `PROJECT_BRAIN - Copia/` (62 docs, fora do git por decisão registrada no `.gitignore`) foi produzido **contra um repositório paralelo** ("ambiente do Marco") — o próprio doc 61 admite. Hierarquia de confiança que o acervo declara e que esta auditoria confirma: **código > docs/ (30/06–01/07) > 61_RECONCILIACAO > demais PROJECT_BRAIN**.

Divergências confirmadas:

- **Scripts de QA citados não existem** (`permission-doctor.mjs`, `validar-permissoes.mjs`, `runtime-qa.mjs`) — as métricas "0/0/0 · 50/50 · 84/84" são irreproduzíveis aqui; a validação real é a suíte Testcontainers.
- **`usuario_admin`**: doc 08 diz que não concede tudo; o código concede (`api/src/auth/perfil.service.ts:11`) — docs 57/61 e README já corrigem.
- **Produtos**: toda a documentação trata a unificação Pralis como futura; o código já implementou a Fase A (commits `f8609a3`→`a4404b2`).
- **Testes**: docs antigos dizem "mocks, sem Postgres real"; a realidade é Testcontainers.
- **Matriz de permissões** com dois conjuntos de números entre docs (Tesouraria 13 vs 7).
- README promete que Gerência "opera caixas" — commit `f6e223b` alinhou o seed (Gerência tem `caixa_operar`); divergência resolvida.
- **Doc não versionada**: `docs/`, PROJECT_BRAIN e design-system fora do git — conhecimento crítico sem histórico nem backup.

---

## 12. Qualidade dos testes

**Executado nesta auditoria: integração 107/107 verdes (25 arquivos, ~7,5 min) e unit 16/16.**

Pontos fortes: banco real, API real in-process, asserts de efeito colateral no banco, zero testes pulados, helpers limpos em `tests/setup/`.

Gaps:

- **`npm test` não roda os unitários** (project `unit` fora do gate).
- **Migrations nunca exercitadas** (testes usam `push --force` — o caminho de produção não tem teste).
- **Zero testes de frontend** (nem component nem e2e de browser).
- **Zero testes de concorrência** (abertura simultânea de PDV).
- Dinheiro com cobertura rasa (acerto só com diferença positiva de valor 5; sem casos de arredondamento/sobra).
- DELETE quase não testado; sem relatório de cobertura.
- Datas hardcoded (`2026-06-30`…) com risco de quebra temporal.
- Artefatos de upload acumulando em `tests/storage/` sem limpeza.

---

## 13. Segurança e permissões

**Bom:** todas as rotas de negócio têm guard de permissão (verificado rota a rota — as únicas sem guard são `/health`, `/api/auth/*`, `/api/me`, `/api/sessao` e `/api/integracoes`, todas intencionais); resolução de permissões em camadas testada; isolamento de empresa validado por teste em praticamente todos os módulos; cookies httpOnly; helmet/CORS/rate-limit; chave de integração armazenada como hash; senhas com better-auth; nenhum secret real versionado (verificado via `git ls-files`).

**Atenção:** segurança **opt-in por rota** (risco de rota futura nascer pública); guards chamam `erro(reply,…)` sem `return` — funciona por detalhe interno do Fastify 5 (`reply.sent`), mas é frágil; default fraco de `BETTER_AUTH_SECRET` embutido; senha seed `123456` (dev, mas documentar rotação no go-live); logger sem `redact`; integridade tenant fraca nas tabelas-filhas (itens podem apontar para produto de outra empresa — o banco não impede, só a aplicação).

---

## 14. Banco de dados e migrations

56 tabelas bem modeladas: dinheiro sempre `numeric` (14,2 valores; 14,4 unitários; 6,4 frações), CHECKs fartos, FKs com `onDelete` explícito, uniques por empresa nos cadastros principais, UUIDv7.

**Porém:**

- Estratégia de migrations é o risco nº 1 do projeto (seção 10, item 1).
- **Nenhum índice não-único**.
- Uniques faltando (`contas(empresa,nome)`, `empresas.cnpj`, `fornecedores`, `unidades_medida(empresa,sigla)`, `grupos_*`).
- `produtos.status/tipo` sem CHECK (domínio só em comentário).
- Tabela órfã `itens_vendas`; `atualizado_em` de produtos/satélites nunca atualiza (fora das triggers do hardening e não setado no repository).
- Sem soft delete; timestamps ausentes em várias tabelas.
- Seed rico e idempotente, coerente com o schema.

---

## 15. Frontend

SPA Nuxt 4/Vuetify funcional e com controle de UI por permissão bem centralizado (`web-vue/composables/usePermissoes.ts` + menu com tooltip de motivo). Fluxo do caixa completo na UI.

**Dívidas:** God-components (`AppWorkspace.vue` 1.733 linhas, `WorkspaceDialogs.vue` 1.195); dinheiro em float ignorando `shared/dinheiro`; inputs monetários `type="number"` sem máscara; "Editar" operação que só cria; guarda de auth imperativa em `onMounted` sem middleware Nuxt (já duplicada em `integracoes.vue`); payloads de API montados no front; e-mail dev hardcoded em `forgot-password.vue:4`; paleta legada roxa convivendo com a Pralis via `!important` em `main.css`; zero testes.

---

## 16. Backend/API

Estrutura exemplar em camadas, validação Zod universal, transações nas operações críticas do caixa e lançamentos (`executarEmTransacao`), dupla checagem de permissão nos lançamentos.

**Dívidas:** tratamento de erro por string (seção 10, item 4); agregações em float; caminho legado de fechamento por data convivendo com o operacional por `caixaId`; filtro de empresa em memória em 3 listagens; casts `request.body as …` antes do parse (34 ocorrências); `fechamentos_caixa` nomeando também o caixa aberto (nome enganoso); `.env.example` com `API_PORT` que a API não lê.

---

## 17. Shared/contracts/regras de negócio

Pacote bem desenhado (30 módulos, request schemas completos, DRY via `api/index.ts`), mas **subutilizado onde mais importa**:

- A regra de saldo de caixa vive na API (duplicada e divergente).
- `somarCentavos`/`formatarDecimalBanco`/`temTodasPermissoes` e os schemas Zod de resposta estão mortos (respostas nunca são validadas em runtime — o front faz cast).
- `arredondar` foi reimplementado na API.
- A matriz permissão↔tela vive só no front.
- A truncagem de sub-centavo de `paraCentavos` não tem teste.

Consolidar regra de dinheiro e de caixa aqui é o movimento estrutural mais importante da Fase 1.

---

## 18. Infra/Docker/CI

Docker sólido (multi-stage, não-root, healthchecks, Coolify com hardening, portas dev em loopback, composes validando limpo — verificado).

**Faltas:** CI/CD inexistente; husky sem `.husky/` nem `prepare` (lint-staged inativo); sem backup; sem observabilidade; `infra/docker-compose.prod.yml` (variante não-Coolify) publica API em `0.0.0.0` sem `cap_drop`; `.dockerignore` sem `.nuxt/.output/storage`; variável `HOST` não documentada no `.env.example`.

---

## 19. Roadmap recomendado

### Fase 0 — Consolidação e diagnóstico (0,5–1 semana)

Ordem:

1. Este relatório versionado no repo (decidir se `docs/` volta ao git).
2. Consertar o lint (resolver tipos do shared no ESLint via condição `development` ou build prévio no script; zerar os ~83 erros reais restantes).
3. Incluir `test:unit` no `npm test`.
4. `prepare: husky` + hook pre-commit.
5. Decidir dono/local único da documentação viva.

Motivo: sem gate confiável, toda fase seguinte regride silenciosamente.
Arquivos: `eslint.config.mjs`, `package.json`, `scripts/test.mjs`.
Critério de pronto: `npm run quality` verde do checkout limpo.

### Fase 1 — Correções críticas (1–1,5 semana) — depende da Fase 0

1. **Migrations baseline**: gerar journal + migration inicial do schema completo (absorvendo o hardening), teste que provisiona banco só via `migrate`. ⚠️ Convenção do projeto: migrations só com ordem explícita — esta é a ordem a pedir. Arquivos: `db/migrations/`, `db/drizzle.config.ts`, `tests/setup/testcontainers.ts`.
2. **Unificar dinheiro do caixa**: fórmula única de saldo em centavos no shared; deprecar fluxo legado por data; somatórios com `somarCentavos`; testes com sobra, arredondamento e N movimentos. Arquivos: `shared/src/caixa/`, `api/src/caixa/`.
3. **Unique parcial de caixa aberto por PDV** + teste de concorrência.
4. **Volume para `storage/`** nos composes de produção.
5. **Erros**: services lançam `ErroDominio`; controllers relançam o resto.

Critério de pronto: deploy do zero via `migrate` funciona; fechamento bate ao centavo em teste de propriedade; dois opens concorrentes → 1 sucesso + 1 conflito.

### Fase 2 — Hardening para produção (1–1,5 semana) — depende da Fase 1

- CI (GitHub Actions: quality + testes + build de imagens).
- Backup agendado do Postgres + teste de restore.
- Sentry/OTel mínimo + `redact` no pino.
- Gate de produção no `env.ts` (enum `NODE_ENV`, recusa de secret default).
- Hook global de auth com allowlist.
- Índices (`empresa_id`, FKs, datas) — via migration com ordem explícita.
- Filtro de empresa no WHERE; `.dockerignore` completo.

Critério de pronto: pipeline verde obrigatório em PR; restore de backup demonstrado; painel de erros ativo.

### Fase 3 — Finalização do Caixa (1–2 semanas) — depende da Fase 2

- Editar operação de verdade (PUT + UI).
- Tratamento de diferença negativa/sobra.
- Decidir e implementar (ou descartar formalmente) sangria/suprimento nomeados e conferência cega.
- Matriz e2e cargo×operação de caixa em Testcontainers.
- Middleware de auth no Nuxt.
- Começar a quebrar `AppWorkspace.vue` (extrair o domínio caixa primeiro).
- Front consumindo `shared/dinheiro` com máscara monetária.

Critério de pronto: caixa operável ponta a ponta por todos os cargos com teste, sem botão enganoso.

### Fase 4 — Unificação/módulo de produtos (1–2 semanas) — pode iniciar em paralelo à Fase 3 após a Fase 1

Fases B–D do plano (`docs/UNIFICACAO.md`):

- Migração de dados reais das planilhas/Pralis.
- Conectar `calcularPrecoVendaComPromocao` ao runtime (hoje é código sem consumidor).
- CHECKs para `produtos.status/tipo`; `atualizado_em` funcionando.
- Remover `itens_vendas`; mover serialização de payloads do front para o shared.

Critério de pronto: catálogo real importado e precificação com promoção ativa em produção.

### Fase 5 — Próximos módulos (contínuo) — depende das Fases 2–3

Ordem sugerida: **Financeiro** (contas a pagar já tem embrião em `api/src/despesas/`) → **Compras** (fornecedores/mercadorias existem) → **Estoque** (campos já no produto; falta movimentação) → **RH** (jornadas inertes no modelo) → **Produção** (ficha técnica/ingredientes).

Regra: cada módulo novo replica o padrão do Caixa (trinca de camadas + contratos no shared + guards + testes de integração desde o primeiro endpoint) e **nasce com migration versionada**.

---

## 20. Plano de ação imediato

1. **Hoje**: pedir a ordem explícita para gerar a migration baseline (destrava o risco nº 1 e é pré-requisito de tudo).
2. **Esta semana**: consertar o lint + incluir unit no `npm test` + husky ativo; unique parcial do caixa aberto; volume de `storage/` no Coolify.
3. **Próxima semana**: unificação da fórmula de saldo em centavos com bateria de testes de dinheiro; CI mínimo (quality + testes em PR).
4. **Decisões que só o negócio pode tomar**: política de soft delete/auditoria; sangria/suprimento/conferência cega como conceitos formais; destino da documentação (versionar `docs/` ou não); estratégia de backup do banco gerenciado no Coolify.

---

## 21. Conclusão como Principal Engineer

Este é um projeto **incomumente bem fundamentado para a idade que tem**: fronteiras arquiteturais impostas por ferramenta, testes de integração reais e verdes, domínio consistente, multiempresa e permissões que funcionam de verdade (validado rodando a suíte, não confiando na doc). A decisão de tratar o Caixa como módulo-referência está correta e o padrão dele merece ser replicado.

O que impede produção não é falta de funcionalidade — é **operação**: o caminho de deploy não materializa o banco, dinheiro é agregado em float com duas fórmulas concorrentes, uploads evaporam no redeploy e não há CI/backup/observabilidade para perceber quando algo quebrar. São problemas concentrados, bem localizados e corrigíveis em semanas, não meses — desde que atacados **antes** de abrir novas frentes de módulo. A documentação (PROJECT_BRAIN) deve ser lida como memória histórica de um repositório paralelo, não como especificação: a fonte de verdade é este código, e ele está em melhor estado do que parte da doc sugere.

Recomendação final: **congelar features novas por ~2 semanas**, executar Fases 0–2, e só então retomar a unificação de produtos e os módulos seguintes sobre uma base que aguenta produção.

---

### Anexo — Validação prática executada (02/07/2026)

| Verificação                                                           | Resultado                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run check` (typecheck todos os workspaces + arquitetura + texto) | ✅ Verde                                                                                                         |
| `npm run lint`                                                        | ❌ 4.896 erros (~98% `no-unsafe-*`; causa-raiz: typed-lint resolvendo `@padaria/shared` via `dist/` inexistente) |
| `npm test` (integração, Testcontainers)                               | ✅ 107/107 em 25 arquivos (~7,5 min)                                                                             |
| `npm run test:unit`                                                   | ✅ 16/16 (fora do gate do `npm test`)                                                                            |
| `docker compose config` (db dev)                                      | ✅ Válido                                                                                                        |
| `npm run compose:coolify:check`                                       | ✅ Válido                                                                                                        |
| `.github/` (CI)                                                       | ❌ Não existe                                                                                                    |
| `.husky/` (hooks)                                                     | ❌ Não existe (husky nas devDependencies sem `prepare`)                                                          |
| Secrets versionados (`git ls-files`)                                  | ✅ Nenhum `.env` real commitado (313 arquivos rastreados)                                                        |
