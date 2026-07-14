# Análise Técnica — Sistema Caixa (auditoria sênior)

> Auditoria minuciosa por camada (backend, frontend, infra/qualidade), no estilo da documentação do
> Pralis. Cada item tem severidade. Datas absolutas. Base: estado do repositório em **30/06/2026**
> (7 commits, ~188 arquivos `.ts/.vue`).
>
> Legenda de severidade: 🔴 crítico · 🟠 alto · 🟡 médio · 🟢 baixo · ✅ acerto.

---

## 0. Panorama

| Camada                    | Nota       | Resumo                                                                                    |
| ------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Arquitetura backend       | ⭐⭐⭐⭐⭐ | MVC em camadas, isolamento forçado em CI, multiempresa consistente.                       |
| Pipeline de qualidade     | ⭐⭐⭐⭐⭐ | ESLint estrito + dependency-cruiser + checks de texto/arquitetura.                        |
| Cobertura funcional       | ⭐⭐⭐⭐   | ~25 domínios; caixa/vendas/despesas maduros; vários cadastros básicos.                    |
| Frontend                  | ⭐⭐⭐½    | Bem organizado, mas `AppWorkspace.vue` concentra ~1700 linhas.                            |
| Testes                    | ⭐⭐⭐½    | Vitest unit+integração via `app.inject()`, mas **sem Postgres real** e sem coverage gate. |
| Infra/Deploy              | ⭐⭐⭐⭐   | Dev e prod bem montados; falta observabilidade.                                           |
| Integrações (CREARE)      | ⭐⭐⭐     | Funcional, mas manual, sem retry/scheduling/testes.                                       |
| **Prontidão p/ produção** | **~70%**   | Falta hardening de segredos, observabilidade e robustez da integração.                    |

---

## 1. Acertos (o que está bem feito) ✅

1. **Arquitetura em camadas forçada por CI.** `scripts/verificar-arquitetura.mjs` +
   `.dependency-cruiser.cjs` impedem SQL cru em `api/src`, controller→repository, repository→service,
   dependências circulares e `shared` importando `api/db/web-vue`. Isolamento real, não só convenção.
2. **Type safety estrito.** `eslint.config.mjs`: `no-explicit-any`, `no-unsafe-*`,
   `no-floating-promises`, `consistent-type-imports`, plugin `security`. Pouquíssimo escape hatch.
3. **Multiempresa coerente.** `empresa_id` no schema + `usuarios_empresas`; guards
   `podeAcessarEmpresa`/`escopoEmpresaAtiva`/`filtrarPorEmpresas` (`api/src/auth/empresa.ts`).
4. **Permissões granulares.** Soma de permissões diretas + cargos + setor; `usuario_admin` recebe
   todas. Menu do front filtrado por permissões efetivas (`composables/usePermissoes.ts`).
5. **Transações ACID nos pontos críticos.** Ex.: mercadoria + itens em uma transação
   (`mercadorias.repository.ts`), upsert de conversões de produto (`produtos.repository.ts`).
6. **Dinheiro em centavos.** `shared/.../dinheiro` + `arredondar()` evitam erros de float.
7. **Caixa operacional robusto.** Abertura/fechamento por PDV+usuário, acerto de saldo gerando
   despesa e débito de colaborador, auditoria em `edicoes_caixa`, bloqueios de UX sem caixa aberto.
8. **Pipeline de qualidade completo** (`quality`, `test:complete`) com `knip`/`depcheck`/`audit`.
9. **Prod fail-fast de segredos.** `infra/docker-compose.prod.yml` exige
   `DATABASE_URL`/`BETTER_AUTH_SECRET`/`AUTH_BASE_URL`/`WEB_ORIGIN`; `migrate` roda antes da API.
10. **check:texto** força nomenclatura em português e bloqueia encoding corrompido — ótimo para
    consistência do domínio.

---

## 2. Backend — problemas e riscos

- 🔴 **B1 — Produtos sem dimensão comercial.** A tabela `produtos`
  (`db/src/schema/app.schema.ts:389`) e o contrato (`shared/src/produtos/index.ts`) têm apenas
  código, código de barras, descrição, marca, unidade e conversões. **Não há custo, margem, preço de
  venda, status/ativo, fiscal, transformação nem promoção.** É um catálogo fino de compra — toda a
  inteligência de preço/venda vive hoje no Pralis. Decisão central da unificação (ver
  [UNIFICACAO.md](UNIFICACAO.md)).
- 🔴 **B2 — Sem estoque/inventário.** `mercadorias_itens.produto_id` é **opcional**; não há tabela de
  saldo por produto nem movimentação. Impossível saber quanto há de cada item. Bloqueia controle de
  estoque, custo médio e ruptura.
- 🟠 **B3 — Validação de empresa por cast fraco.** Padrão repetido ~15x:
  `const body = request.body as { empresaId?: string }` (ex.: `produtos.controller.ts:26`,
  `clientes.controller.ts:26`). Deveria validar com schema Zod antes de checar `podeAcessarEmpresa`.
- 🟠 **B4 — Erros genéricos em services.** `throw new Error("...")`
  (ex.: `caixa.service.ts`, `colaboradores.service.ts`) viram 400 genérico. Usar `erroValidacao`/
  `naoEncontrado`/`proibido` de `erros.ts` para status HTTP corretos (400/404/403).
- 🟠 **B5 — Sem soft-delete em entidades críticas.** Produtos/Vendas/Caixa/Mercadorias não devem
  permitir delete físico; falta padrão `ativo`/`deletadoEm` e trilha de auditoria de operações.
- 🟡 **B6 — Validação de datas frágil.** `new Date(valor)` sem checar formato ISO/faixa/ordem
  (`dataVencimento ≥ dataReferencia`). Preferir `z.coerce.date()` + regras.
- 🟡 **B7 — Unicidade só no banco.** Constraints `unique` (ex.: documento por empresa) não são
  pré-validadas no service → vira erro 500 em vez de 400 amigável.
- 🟡 **B8 — Listagens sem paginação em alguns módulos** (ex.: fornecedores) e **sem índice de busca**
  textual em `descricao` (table scan em base grande).
- 🟢 **B9 — Sem versionamento de API** (`/v1`) nem logging estruturado/auditoria de operações
  (hoje só `request.log.error`).
- 🟢 **B10 — Rate-limit global único** (300/min) sem granularidade por rota/usuário.

---

## 3. Frontend — problemas e riscos

- 🔴 **F1 — `components/app/AppWorkspace.vue` com ~1700 linhas** concentra operações, cadastros,
  temas, malotes, permissões e caixa. Inviável de testar isolado; qualquer bug afeta tudo. Quebrar em
  composables (`useWorkspace`, `useCadastros`, `useOperacoes`, …). `WorkspaceDialogs.vue` (~929
  linhas) idem (extrair um componente por modal).
- 🟠 **F2 — Ambiguidade "mercadorias".** `pages/mercadorias.vue` é **operação** (lançamento de
  compra), enquanto o cadastro do item vive em `produtos.vue`. Confunde usuário e mapeamento. Alinhar
  nomenclatura (ex.: "Compras" vs "Produtos").
- 🟠 **F3 — Parsing frágil de `conversoes`.** JSON é serializado/parseado em 3+ lugares com
  `try/catch` que retorna `[]` em silêncio (`AppWorkspace.vue` ~linha 1061). Erro de dados some.
- 🟠 **F4 — Sem validação de formulário no cliente.** `cadastroPayload()` (`utils/domain.ts`) só
  converte tipos; não valida CPF/CNPJ/e-mail, valores ≤ 0, nem produto sem código/nome. Conversões
  não impedem unidade duplicada nem quantidade ≤ 0.
- 🟡 **F5 — Telas parciais/stub:** `index.vue` (landing vazia), `usuarios.vue` (form mínimo),
  `contas_pagar.vue`/`RelatorioProdutos.vue`/`FechamentoCaixaPage.vue` esqueléticas,
  `ficha_tecnica.vue`/`ingredientes.vue` ocultas, `forgot/reset-password` mínimas.
- 🟡 **F6 — Race condition ao trocar de empresa** (`trocarEmpresa`): dados antigos podem aparecer
  antes do novo carregamento; `caixaAberto` e `resumo` podem dessincronizar.
- 🟡 **F7 — Sem feedback de erro/loading consistente** em carregamentos críticos
  (`carregarDadosTela`): falha silenciosa, sem retry/snackbar.
- 🟢 **F8 — Permissões duplicadas** em `utils/domain.ts` e `AppWorkspace.vue` (risco de divergir do
  backend). `integracoes.vue` (~650 linhas) sem documentação de propósito.

---

## 4. Infra, testes e integrações

- 🔴 **I1 — Senha de seed `123456`** (`db/seed.ts`, e em testes). OK para dev, **proibido** vazar
  para qualquer ambiente acessível. Gerar senha aleatória/forçar troca fora de dev.
- 🟠 **I2 — `BETTER_AUTH_SECRET` default em dev** (`api/src/env.ts`). Validar em CI/boot de prod que
  **não** é o default e tem ≥ 32 chars (hoje só fail-fast se ausente).
- 🟠 **I3 — Testes sem Postgres real.** Integração usa `app.inject()` com auth mockado; sem
  Testcontainers. Bugs de constraint/concorrência/migration escapam. Sem **coverage gate**.
- 🟠 **I4 — Integração CREARE/Compilarte frágil.** `integracoes-scripts` lê MySQL legado e posta em
  `POST /api/integracoes` (autenticado por `x-api-key`), mas é **manual** (`npm run
dev:teste_integracao`), **sem scheduling, sem retry/DLQ, sem testes e só `console.log`**. Risco de
  perda de vendas se a API estiver fora.
- 🟡 **I5 — Artefatos de build versionados.** `api/src/*.d.ts.map` (`auth.d.ts.map`, `env.d.ts.map`,
  `banco/conexao.d.ts.map`) estão no git. Ajustar `.gitignore` e remover do índice.
- 🟡 **I6 — `setup-dev.mjs` migra "papel"→"role" silenciosamente** e roda `push --force`; documentar
  e testar idempotência.
- 🟢 **I7 — Observabilidade ausente:** sem logger estruturado (Pino JSON), métricas ou tracing; sem
  load balancer/orquestração para múltiplas instâncias.
- ✅ Infra dev (tmpfs, hot reload, liberação de portas no Windows) e prod (multistage, migrate
  sidecar, healthcheck, fail-fast de segredos) estão bem feitas.

---

## 5. Top correções recomendadas (antes de evoluir features)

1. 🔴 Remover artefatos `.d.ts.map` do git e corrigir `.gitignore` (**I5** — rápido, higiene).
2. 🔴 Trocar senha de seed e validar `BETTER_AUTH_SECRET` em prod (**I1/I2**).
3. 🔴 Decidir o modelo unificado de **produto** (com Pralis) antes de mexer no domínio (**B1** →
   [UNIFICACAO.md](UNIFICACAO.md)).
4. 🟠 Padronizar validação de `empresaId` por Zod nos controllers (**B3**) e erros tipados (**B4**).
5. 🟠 Testes de integração com Postgres real (Testcontainers) + coverage gate (**I3**).
6. 🟠 Robustez da integração CREARE: scheduling + retry/DLQ + testes (**I4**).
7. 🟠 Refatorar `AppWorkspace.vue` em composables (**F1**) e validar formulários (**F4**).
   </content>
