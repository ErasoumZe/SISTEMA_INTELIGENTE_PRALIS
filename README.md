# Pralis — ERP Cicluz

ERP para a rede de padarias Cicluz. **Opera em producao, todo dia, na unidade TNP.**

Monorepo npm workspaces: `api` (Fastify + Drizzle + Postgres), `web-vue` (Nuxt 4 + Vuetify, SPA),
`db` (schema + migrations + seeds), `shared` (Zod + regras puras), `integracoes-scripts` (agente do
PDV CREARE) e `tests` (Vitest + Testcontainers).

> **Antes de tocar em qualquer coisa, leia o `AGENTS.md`.** Ele e o manual de operacao do projeto e
> define como se trabalha aqui. Regra de negocio vive em `PROJECT_BRAIN/` — o `00_INDICE.md` lista
> tudo, e o `19_REGISTRO_DE_REGRAS.md` e a fonte unica das regras numeradas.

## Instalacao

```bash
cp .env.example .env
npm install
```

Node 22. O `npm install` instala o hook de pre-commit (husky + lint-staged).

## Desenvolvimento

Comando do dia a dia. Sobe o Postgres em um Compose separado, prepara dependencias em volumes
Docker, roda setup e seed pelo container da API, inicia a API em container e o Web Vue no host com
hot reload.

```powershell
npm.cmd run dev
```

- Web: http://localhost:5174
- API: http://localhost:4100

Para rodar API e Web no host, mantendo apenas o Postgres em container:

```powershell
npm.cmd run dev:local
```

Para uma validacao automatizada que sobe, espera os healthchecks e encerra:

```powershell
npm.cmd run dev -- --once
```

## Qualidade

| Comando                                     | O que faz                                                           |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `npm run check`                             | typecheck de todos os workspaces + os 3 verificadores de `scripts/` |
| `npm run lint`                              | builda `shared` e `db` e roda o ESLint com informacao de tipo       |
| `npm test`                                  | testes unitarios e depois a suite de integracao (Testcontainers)    |
| `npm run test --workspace @padaria/web-vue` | testes do front — **nao sao cobertos pelo `npm test`**              |
| `npm run lint:deps`                         | dependency-cruiser: ciclos e violacao de camada                     |
| `npm run quality`                           | lint + lint:deps + format:check + check + test + audit              |

**Atencao:** `npm test` e `npm run quality` **nao executam os testes do `web-vue`**. Rode-os
separadamente antes de dizer que terminou. Registrado como divida D-19.

Tres verificadores proprios rodam dentro do `npm run check` e derrubam o build:

- `scripts/verificar-arquitetura.mjs` — proibe SQL cru em `api/src`, `*.schema.ts` em `api/src`,
  controller importando repository, repository importando service, e import de subpath de
  `@padaria/shared` no `web-vue` (que viraria 404 em runtime com lint e typecheck verdes).
- `scripts/verificar-texto.mjs` — mojibake e nome de dominio em ingles, tanto em nome de tabela
  quanto em rota. O dominio deste sistema e escrito em portugues; migrations e testes sao isentos.
  (Nao reproduza os exemplos proibidos aqui: o proprio verificador varre este arquivo.)
- `scripts/verificar-data-pendente.mjs` — catraca em 0: a marca de "campo que aparece e nao salva"
  nao pode voltar.

**CI** (`.github/workflows/ci.yml`), em push na `main` e em todo PR: job `qualidade` (lint →
check → testes unitarios → testes do web-vue → build) e job `integracao` (`npm test` completo, com
Postgres real).

## Docker e Compose

O ambiente dev e separado em dois projetos Compose:

- `padaria-db-dev` — Postgres e volume persistente de desenvolvimento.
- `padaria-dev` — API em desenvolvimento. No fluxo `npm run dev` o Web roda no host.

```powershell
npm.cmd run db:dev:up      # sobe so o banco dev
npm.cmd run db:dev:down    # para o banco preservando dados
npm.cmd run dev:destroy    # remove containers, redes e volumes locais de dev/prod
```

## Migrations

O schema de producao e criado exclusivamente por migrations versionadas em `db/migrations/`, com
journal em `db/migrations/meta/_journal.json`. Hoje sao **30 migrations** (`0000_extensoes_uuid` ate
`0029_item_de_despesa_vem_do_cadastro`).

- **Producao:** `npm run api:prod:migrate` executa `drizzle-kit migrate` e depois `better-auth
migrate`. A ordem importa — o drizzle roda primeiro para nao colidir com tabelas criadas pelo
  better-auth.
- **Dev e testes:** usam `drizzle-kit push --force`, mais rapido e tolerante a iteracao de schema.
  Por isso existe `db/baseline-migrations.ts`, que registra migrations sem reexecuta-las, e por isso
  a divida D-01 (o caminho de migration nunca e exercitado em dev) continua aberta.

`tests/integration/migracoes/migracoes.test.ts` provisiona um Postgres vazio so com
`drizzle-kit migrate` e compara a estrutura com o banco provisionado por `push`. Se o schema evoluir
sem migration correspondente, esse teste falha.

> **Duas regras.** Migration so com ordem explicita e com o SQL mostrado antes (R-111). E depois de
> gerar, **confira a paridade** entre `db/migrations/*.sql`, `meta/_journal.json` e
> `meta/*_snapshot.json`: as tres contagens tem que bater. O `drizzle-kit check` **nao detecta**
> snapshot faltando, e isso ja quebrou o deploy duas vezes.

Essa paridade e verificada por `npm run check:migrations` (dentro de `npm run check`), que compara as
tres contagens, casa cada entrada do journal com o seu `.sql` e o seu snapshot, aponta arquivo orfao
que nunca seria aplicado e confere a corrente de `prevId` entre os snapshots.

```powershell
npm.cmd run check:migrations
```

## Deploy — Coolify

O arquivo de publicacao e `infra/docker-compose.coolify.yml`:

- `migrate` — roda migrations, bootstrap e seed de referencia antes da API.
- `api` — Fastify em container, healthcheck em `/health`, volume nomeado `padaria_api_storage` em
  `/app/storage` (uploads de comprovantes sobrevivem a redeploy).
- `web-vue` — Nuxt gerado como SPA estatica, servido por Nginx unprivileged.

**O deploy dispara sozinho no push da `main`.** Nao ha workflow de deploy no repositorio — o Coolify
observa o repositorio. Isso torna a disciplina de branch critica: um merge errado vai para a padaria
sem ninguem apertar nada.

Variaveis obrigatorias: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL`, `WEB_ORIGIN`,
`NUXT_PUBLIC_API_URL`.

```powershell
npm.cmd run compose:coolify:check   # valida o compose com valores ficticios
```

## Backup

```powershell
npm.cmd run db:backup     # pg_dump --format=custom, retencao de 14 dumps
npm.cmd run db:restore    # pg_restore --clean, exige --confirmar
```

**O backup nao e agendado** — nenhum cron, workflow ou servico chama `db:backup`. Registrado como
divida D-18.

## Autenticacao e permissoes

**Default-deny de verdade:** um hook `onRequest` em `api/src/app.ts` exige sessao valida em toda
rota, com allowlist de 6 entradas (`/health`, `/api/auth/*`, `/api/me`, `/api/sessao` e as duas de
integracao, que autenticam por `x-api-key`). **Rota nova nasce 401.**

Catalogo de 240 permissoes em `shared/src/autenticacao/index.ts`, resolvidas em tres camadas —
**usuario > cargos ativos > setor** — com deny-by-default. O role `usuario_admin` recebe o catalogo
inteiro menos as flags `_somente_caixa_aberto`. O role `admin` nao tem efeito especial.

O catalogo por cargo vive em `db/src/referencia-permissoes.ts` (codigo, nao documento). O modelo
completo, a matriz cargo × acao e os achados abertos estao em
`PROJECT_BRAIN/23_PERMISSOES_MODELO_E_AUDITORIA.md`.

O isolamento multiempresa e logico, por `empresa_id` e vinculos em `usuarios_empresas`.
`usuario_admin` recebe todas as permissoes, mas **nao** recebe acesso global a empresas.

## Caixa

O caixa e aberto e fechado por usuario e PDV. Rotas principais em `api/src/caixa/caixa.controller.ts`:

| Rota                         | Permissao               | O que faz                                                 |
| ---------------------------- | ----------------------- | --------------------------------------------------------- |
| `GET /api/caixa/status`      | `caixa_operar`          | caixa aberto do usuario e resumo                          |
| `POST /api/caixa/abrir`      | `caixa_operar`          | abre por PDV, turno e lacre                               |
| `POST /api/caixa/:id/fechar` | `caixa_operar`          | fecha; recusa saldo positivo e exige observacao em quebra |
| `GET /api/caixa/historico`   | `caixas_gerenciar`      | historico com token de edicao                             |
| alteracao de horario         | `caixa_alterar_horario` | revincula as vendas do periodo, auditando                 |

**Abrir informando o lacre e confirmar o recebimento da transferencia** (R-040): numa unica
transacao o sistema confirma, credita e rompe o lacre. Sem lacre, o caixa abre zerado (R-033).

**Nao existe reabertura de caixa.** O que existe e alteracao de horario enquanto aberto (auditada em
`edicoes_caixa` com valores antigos e novos) e venda tardia entrando em caixa fechado (marcada em
`alteracoes_pos_fechamento_caixa`).

**Vocabulario:** o termo e **transferencia**, nunca "malote" — a tabela e o conceito morreram na
migration `0026_malote_morre_lacre_unico.sql`. O lacre e identificador unico e de uso unico.

## Integracao CREARE

`integracoes-scripts/` e o agente que roda no servidor da padaria (via NSSM), le o MySQL do CREARE e
envia para `POST /api/integracoes`. Ciclo padrao de 10 minutos, releitura do dia corrente inteiro,
throttle de 4 req/s, lock em arquivo.

**Ativo somente na unidade TNP, 4 PDVs.**

Este workspace e JS puro e esta **fora do ESLint, fora do `npm run check` e fora do CI**. Tem gate
proprio (`node --check` + `node --test`) que precisa ser rodado a mao. Riscos abertos conhecidos
estao em `PROJECT_BRAIN/22_AUDITORIA_STACK_2026_08_05.md` §4.

## Credenciais de seed (dev)

Senha padrao `123456`. Contas: `diretor@`, `caixa@`, `gerencia@`, `tesouraria@`, `compras@`, `dp@`,
`rh@`, `fiscal@`, `operacoes@`, `financeiro@` — todas `@email.com`. `diretor@email.com` e seedado
como `usuario_admin` com o cargo Diretor Geral.
