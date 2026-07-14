# Backlog — Sistema Caixa (Padaria v2 / ERP Cicluz)

> Itens derivados da auditoria ([ANALISE.md](ANALISE.md)) e do plano de unificação com o Pralis
> ([UNIFICACAO.md](UNIFICACAO.md)). IDs por categoria. Severidade: 🔴 crítico · 🟠 alto · 🟡 médio ·
> 🟢 baixo. Atualizado em 30/06/2026.

## Status (o que já existe hoje)

- ✅ Monorepo Fastify + Drizzle + Postgres + Nuxt/Vuetify, com pipeline de qualidade forte.
- ✅ Caixa operacional (abrir/fechar/acertar por PDV+usuário), vendas/entradas, despesas,
  mercadorias, retiradas, transferências, malotes.
- ✅ ~25 módulos de API; multiempresa por `empresa_id`; permissões granulares.
- ✅ Integração CREARE/Compilarte funcional (manual).
- ✅ Produto = catálogo fino (código, descrição, marca, unidade, conversões) — **sem** preço.

---

## 1. Higiene / fundação (fazer primeiro — rápido)

- **FND-01** 🔴 Remover `api/src/**/*.d.ts.map` do git e ajustar `.gitignore`/`.dockerignore`.
- **FND-02** 🔴 Senha de seed: tirar `123456` de qualquer caminho não-dev; gerar aleatória/forçar
  reset.
- **FND-03** 🟠 Validar `BETTER_AUTH_SECRET` em boot de prod (≠ default e ≥ 32 chars).
- **FND-04** 🟢 Adicionar `ARCHITECTURE.md` + diagrama; documentar `integracoes.vue`.

## 2. Unificação com o Pralis (o grande tema)

- **UNI-01** 🔴 Portar regras puras do Pralis (`calcularVVenda`, `calcularVVendaFinal`,
  `montarDescricao`, `montarComoSeCompra`) + testes para `shared/src/produtos/`. (Não toca produção.)
- **UNI-02** 🔴 Estender contrato `produtoPayloadSchema`: `custo`, `margem`, `precoVenda`/`auto`,
  `status`, `tipo` (revenda/transformação).
- **UNI-03** 🟠 Migration: novos campos em `produtos` + tabelas `produtos_fiscal`,
  `produtos_transformacao`, `promocoes`. ⚠️ Exige aprovação explícita (`AGENTS.md`).
- **UNI-04** 🟠 Service/repository de produtos gravando/validando o modelo rico.
- **UNI-05** 🟠 UI de produto (revenda×transformação, fiscal, promoção, **preview de preço ao vivo**
  via regras compartilhadas) na tela `produtos.vue`.
- **UNI-06** 🟡 Mapear lojas (TNP/LI/HORA) → empresas; reusar `importadoDe`/`idImportado` p/ "BASE".
- **UNI-07** 🟡 Migração de dados de produção do Pralis → Caixa (produtos + usuários para better-auth).
- **UNI-08** 🟢 Cutover e descontinuação do Pralis isolado.

## 3. Backend

- **BK-01** 🔴 Definir estoque/inventário: tabela de saldo por produto + movimentação a partir de
  mercadorias (decisão de negócio — ver UNI/ANÁLISE B2).
- **BK-02** 🟠 Validar `empresaId` via Zod nos controllers (eliminar `body as {empresaId?}` ~15x).
- **BK-03** 🟠 Erros tipados em services (`erroValidacao`/`naoEncontrado`/`proibido`) p/ status HTTP
  corretos.
- **BK-04** 🟠 Soft-delete + auditoria de operações em entidades críticas (produtos/vendas/caixa).
- **BK-05** 🟡 Validação de datas (ISO/faixa/ordem) com `z.coerce.date()`.
- **BK-06** 🟡 Pré-validar unicidade no service (documento/e-mail) → erro 400, não 500.
- **BK-07** 🟡 Paginação universal nas listagens + índice textual em `descricao`.
- **BK-08** 🟢 Versionamento de API (`/v1`) e logging estruturado (Pino JSON).

## 4. Frontend

- **FE-01** 🔴 Refatorar `AppWorkspace.vue` (~1700 linhas) em composables; quebrar
  `WorkspaceDialogs.vue` por modal.
- **FE-02** 🟠 Validação de formulário no cliente (CPF/CNPJ/e-mail/valores; conversões > 0 e sem
  unidade duplicada).
- **FE-03** 🟠 Corrigir parsing silencioso de `conversoes` (sem `catch` que esconde erro).
- **FE-04** 🟠 Resolver ambiguidade "mercadorias" (compra) × "produtos" (cadastro) no menu/nomes.
- **FE-05** 🟡 Concluir telas parciais: `index`, `usuarios`, `contas_pagar`, `RelatorioProdutos`,
  `FechamentoCaixaPage`, `forgot/reset-password`.
- **FE-06** 🟡 Feedback de erro/loading + retry em `carregarDadosTela`; corrigir race ao trocar
  empresa.
- **FE-07** 🟢 Centralizar lista de permissões (1 fonte) para não divergir do backend.

## 5. Testes / Integrações

- **QA-01** 🟠 Testes de integração com Postgres real (Testcontainers) + coverage gate (≥ 80%).
- **QA-02** 🟠 CREARE: scheduling (cron/fila) + retry/DLQ + testes (mock server) + logging.
- **QA-03** 🟡 Testes de migration (up) e de idempotência do `setup-dev`.

## 6. Observabilidade / Deploy

- **OPS-01** 🟡 Logger estruturado + métricas (latência/erros) + healthcheck já existe.
- **OPS-02** 🟢 Reverse proxy/orquestração se houver mais de 1 instância; pgBouncer se necessário.

---

## Ordem sugerida (dependências)

1. **FND-01..03** — higiene e segurança (1–2 dias, destrava o resto com segurança).
2. **UNI-01 + UNI-02** — regras e contrato de produto unificados (sem tocar produção).
3. **BK-02 + BK-03** — endurecer controllers/erros (base sólida p/ o resto).
4. **UNI-03..05** — schema rico + UI de produto (após aprovar migration e decisões de negócio).
5. **QA-01** — Postgres real nos testes (antes de migração de dados).
6. **UNI-06..08** — mapear lojas→empresas e migrar dados do Pralis.
7. **BK-01 (estoque)**, **FE-01 (refactor)**, **QA-02 (CREARE robusto)** em paralelo conforme time.

## ⚠️ Confirmar antes de codar (negócio)

1. Loja → Empresa é 1:1? Onde fica a "BASE"? (UNI-06)
2. Preço/margem por empresa ou global? (UNI-02/04)
3. O preço de venda alimenta o PDV/vendas (hoje vindas do CREARE)? Qual a fonte de verdade?
4. Estoque entra agora? (BK-01)
5. Migração de usuários: reset de senha (Argon2→better-auth) ou importar hashes? (UNI-07)
   </content>
