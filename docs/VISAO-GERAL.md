# Visão Geral — Sistema Caixa (Padaria v2 / ERP Cicluz)

> Documento de referência: explica **o que é o sistema**, **como cada parte funciona** e
> **como foi construído**, em linguagem acessível. Companheiro de [ANALISE.md](ANALISE.md)
> (auditoria), [UNIFICACAO.md](UNIFICACAO.md) (fusão com o Pralis) e [backlog.md](backlog.md).

---

## 1. O que é

Um **ERP web para a operação da padaria** (rede TNP / Lisboa / Oro-Hora), muito mais amplo que o
cadastro de produtos: cobre **caixa operacional** (abertura/fechamento por PDV e usuário),
**vendas/entradas, despesas, mercadorias (compras), retiradas, transferências, malotes**,
**cadastros** (clientes, fornecedores, colaboradores, contas, formas de pagamento, grupos, áreas,
setores, unidades, PDVs, empresas), **permissões granulares**, **relatórios** e **integração com o
ERP legado CREARE/Compilarte**.

É **multiempresa** (isolamento lógico por `empresa_id`) e está em estágio **MVP/staging** — código
volumoso e bem estruturado, mas recém-versionado (repositório com poucos dias e 7 commits).

---

## 2. Arquitetura (a visão de cima)

Monorepo npm (workspaces) com 5 pacotes que conversam entre si:

```
┌──────────────┐   HTTP (fetch)   ┌──────────────┐   SQL    ┌────────────┐
│   WEB-VUE    │ ───────────────▶ │     API      │ ───────▶ │  BANCO     │
│ Nuxt 4 +     │ ◀─────────────── │   Fastify 5  │ ◀─────── │ PostgreSQL │
│ Vuetify (SPA)│      JSON        │  (servidor)  │          │   16       │
└──────────────┘                  └──────────────┘          └────────────┘
       │                                 │                         ▲
       └─────────────┬───────────────────┘                        │
                     ▼                                             │
            ┌─────────────────────┐                  ┌────────────────────────┐
            │   SHARED            │                  │  INTEGRACOES-SCRIPTS    │
            │ contratos Zod +     │                  │  lê CREARE (MySQL) e    │
            │ regras (dinheiro…)  │                  │  envia vendas p/ a API  │
            └─────────────────────┘                  └────────────────────────┘
```

- **web-vue** — o que o usuário vê. Não guarda dados; pede tudo à API.
- **api** — o cérebro: recebe, valida (Zod), aplica regras, fala com o banco.
- **db** — schema Drizzle, migrations e seed.
- **shared** — contratos (Zod) e regras puras (ex.: `dinheiro`) usados por front e API.
- **integracoes-scripts** — cliente externo que importa vendas do ERP legado **CREARE/Compilarte**
  (MySQL) e as posta na API via `POST /api/integracoes` (autenticado por `x-api-key`).

Pacotes (workspaces): `api`, `db`, `shared`, `web-vue`, `integracoes-scripts`, `tests`.

---

## 3. Cada parte, por dentro

### 3.1. `shared` — contratos + regras

Espelha o front e a API por domínio (`autenticacao`, `caixa`, `produtos`, `mercadorias`, `vendas`,
`despesas`, `retiradas`, `transferencias`, `permissoes`, etc.). Escrito em **Zod**. Inclui regras
puras como `dinheiro` (cálculo em centavos, sem float). É **isolado**: não importa `api`, `db` nem
`web-vue` (garantido pelo dependency-cruiser).

### 3.2. `api` — o servidor (Fastify 5 + TypeScript)

Organizado por **módulos** por domínio, com padrão MVC em camadas:

```
modulo/
├─ modulo.controller.ts   # rota Fastify + valida payload + checa empresa/permissão
├─ modulo.service.ts      # regras de negócio + orquestração
├─ modulo.repository.ts   # acesso a dados (Drizzle) — único que fala com o banco
└─ modulo.regras.ts       # (opcional) regras complexas puras
```

Regras de camada são **forçadas em CI** (`scripts/verificar-arquitetura.mjs` +
`.dependency-cruiser.cjs`): controller não importa repository/banco; repository não importa
service/controller; nada usa SQL cru (só Drizzle).

Tecnologias-chave: **Fastify 5**, **Drizzle ORM** + **PostgreSQL**, **better-auth** (login/sessão),
**Zod** (validação), **@fastify/helmet/cors/rate-limit/multipart** (segurança).

**Autenticação:** `better-auth` (email+senha, sessão por token, UUIDv7). Guards
(`exigirAutenticacao`, `exigirPermissao`) injetam `request.perfilUsuario` e validam permissão a
cada request.

**Multiempresa:** isolamento lógico por `empresa_id` + vínculos em `usuarios_empresas`. Controllers
validam o escopo de empresa (`podeAcessarEmpresa`, `escopoEmpresaAtiva`).

### 3.3. `web-vue` — o front (Nuxt 4 + Vuetify, modo SPA)

```
web-vue/
├─ pages/                 # 1 arquivo por tela do menu (caixa, despesas, produtos…)
│  └─ [tela].vue          # fallback p/ telas ainda não implementadas
├─ components/
│  ├─ app/                # AppShell (layout/menu) + AppWorkspace (estado central)
│  ├─ cadastros/ caixa/ financeiro/ relatorios/ workspace/ comum/
├─ composables/           # useApi, usePermissoes, useCadastroView
└─ utils/                 # formatacao.ts, domain.ts
```

Autentica por cookie (`credentials: "include"`), guarda sessão/empresa ativa em `useState` e provê
contexto via `AppWorkspace`. Tema é salvo por empresa/tela.

### 3.4. O banco (PostgreSQL + Drizzle)

Schema por domínio em `db/src/schema/` (`autenticacao`, `cadastro`, `caixa`, `despesa`,
`mercadoria`, `retirada`, `transferencia`, `venda`, `tema`). Função `uuid_generate_v7()` criada via
`pgcrypto`. Migrations em `db/migrations/` (baseline `0000_hardening.sql` + better-auth). Em prod, um
serviço `migrate` roda **antes** da API; o seed **não** roda em produção.

---

## 4. Caixa operacional (o coração do ERP)

Caixa é aberto/fechado **por usuário e por PDV**. O seed cria `PDV 01` ligado à conta `Caixa loja`.

- `GET /api/caixa/status` — caixa aberto do usuário + resumo por `caixaId`.
- `POST /api/caixa/abrir` — exige `operar_caixa`, PDV ativo com conta, bloqueia período já aberto.
- `POST /api/caixa/:id/acertar-saldo` — saldo positivo gera despesa "Diferença de caixa" + débito no
  colaborador.
- `POST /api/caixa/:id/fechar` — só fecha quando o saldo não exige acerto.
- Movimentações novas gravam `caixa_id`. Várias telas (transferências, despesas, mercadorias,
  retiradas, fechamento) ficam **bloqueadas no front sem caixa aberto**.

---

## 5. Segurança

- 🔑 **better-auth** com hash de senha e sessão por token; verificação de e-mail em produção.
- 🛡️ **Helmet** + **CORS** travado por `WEB_ORIGIN` + **rate-limit** global (300/min).
- ✅ **Validação Zod** em todo endpoint; erros padronizados (`ErroDominio`, ProblemDetails).
- 🔒 **Drizzle ORM** (queries parametrizadas — sem SQL cru, forçado em CI).
- 🧱 **Fail-fast de segredos** em prod (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc. obrigatórios).

_(Pendências de hardening em [ANALISE.md](ANALISE.md): senha de seed `123456`, observabilidade,
testes com Postgres real, scheduling/retry da integração CREARE.)_

---

## 6. Qualidade (pipeline)

Pipeline rigoroso (`npm run quality` / `test:complete`):
`lint` (ESLint estrito: sem `any`, sem `unsafe`, sem floating promises, plugin security) →
`lint:deps` (dependency-cruiser: isolamento de camadas e workspaces) →
`check:texto` (acentuação/encoding + força nomes de domínio em português) →
`check:arquitetura` (camadas) → `typecheck` → `test` (Vitest) → `audit:deps` → `knip` → `depcheck`.

---

## 7. Como roda

- **Dev:** `npm run dev` sobe só o Postgres dev (Docker, tmpfs), prepara o banco (`push --force` +
  seed) e roda API (`:4100`) + Web (`:5174`) com hot reload.
- **Prod:** `npm run compose:prod` — `infra/docker-compose.prod.yml` builda imagem multistage, roda
  `migrate` e sobe a API. Variáveis obrigatórias com fail-fast.

---

## 8. Resumo de uma frase

Um ERP de padaria **multiempresa** (caixa, vendas, despesas, compras, cadastros, permissões,
relatórios e integração com o ERP legado CREARE), em **Fastify + Drizzle + Postgres + Nuxt/Vuetify**
com contratos/regra compartilhados — bem arquitetado e com pipeline forte, em estágio **MVP/staging**,
cujo módulo de **produtos é propositalmente fino** e deve ser unificado com o **Pralis** (ver
[UNIFICACAO.md](UNIFICACAO.md)).
</content>
</invoke>
