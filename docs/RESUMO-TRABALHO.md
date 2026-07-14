# Resumo do trabalho — Sistema Caixa (do início até agora)

> Documento-resumo de tudo que foi feito desde o começo. Atualizado em 01/07/2026.
> Companheiro de [VISAO-GERAL.md](VISAO-GERAL.md), [ANALISE.md](ANALISE.md),
> [UNIFICACAO.md](UNIFICACAO.md) e [backlog.md](backlog.md).

---

## 1. Ponto de partida e objetivo

A padaria Cicluz tem **dois sistemas** que devem virar **um só**:

- **Cadastro de Produtos ("Pralis")** — em produção; catálogo de produtos **rico** (custo, margem,
  preço de venda, promoção, fiscal, transformação). É, na verdade, **um módulo** do sistema maior.
- **Sistema Caixa ("Padaria v2")** — o ERP operacional (caixa, vendas, despesas, compras,
  transferências, malotes, cadastros, permissões, relatórios, integração com o ERP legado CREARE).
  Multiempresa por `empresa_id`. Cada **loja (TNP/LI/HORA) = uma empresa**.

Objetivo: unificar, começando por entender os dois e depois fundir o módulo de produtos.

---

## 2. Análise e documentação (fase inicial)

Auditoria minuciosa (equipe sênior: backend, frontend, infra/QA, arquitetura) dos dois projetos.
Documentos gerados em `docs/`:

- **VISAO-GERAL.md** — o que é o sistema e como funciona.
- **ANALISE.md** — auditoria por camada, acertos e problemas (com severidade).
- **UNIFICACAO.md** — como fundir o Pralis como módulo (loja→empresa; portar regras de preço).
- **backlog.md** — backlog priorizado.

**Descobertas-chave:**

- Stack quase idêntica entre os dois (Fastify + Drizzle + Postgres + Nuxt/Vuetify + Zod).
- O **produto do ERP é fino** (código, descrição, marca, unidade, conversões) — **sem** preço/margem/
  fiscal/promoção/estoque. O Pralis é o "cérebro comercial". São **complementares**.
- Pipeline de qualidade forte; multiempresa e permissões bem estruturados.

---

## 3. Permissões e caixa (o grosso do trabalho)

### 3.1. Diagnóstico inicial

- Suspeita de que "as permissões não funcionavam". Investigando, o **mecanismo estava correto**
  (resolução setor+cargo+usuário e guards 403).
- **Achado real 1:** o `role` estava **inerte** — `usuario_admin` NÃO concedia nada; o Diretor só
  tinha tudo porque o cargo "Diretor Geral" enumerava as ~196 permissões (poluía a tela).
- **Achado real 2:** o escopo "somente caixa aberto" das telas de movimentação era **só no front** —
  a API não impunha; um usuário podia ver dados de outros caixas por chamada direta (brecha).
- **Achado 3:** mensagem de abertura de caixa enganosa; regra de sobreposição meio implementada.

### 3.2. Testes automatizados (validação ao vivo)

- Harness que dirige a **API real** (better-auth + Postgres), criando fixtures isolados
  (conta/PDV/cargo/usuário) e validando permissões efetivas + matriz de autorização (200/403) por
  cargo, além do ciclo do caixa (abrir → venda → despesa → resumo → fechar).
- Cobertos os 10 cargos do seed; hierarquia **usuário > cargo > setor** comprovada ao vivo.

### 3.3. Decisões de negócio (as 7 perguntas) e o que virou código

1. Gerência acessa histórico do caixa → **SIM** → `caixas_gerenciar` no cargo Gerência.
2. Financeiro cria entradas/vendas → **manter** (não cria) → sem mudança.
3. Diretor deve ser só um cargo (via `usuario_admin`) → **SIM** → cargo "Diretor Geral" esvaziado.
4. `admin` superusuário acima de empresas → **não** → sem mudança (admin segue sem efeito especial).
5. "Permitir" de usuário anula "negar" de cargo/setor → **manter** (precedência atual).
6. Permissão de cargo/setor vale em todas as empresas do usuário → **sim** → sem mudança.
7. Quem gerencia permissões pode dar para si mesmo → **sim** → sem mudança.
   E depois: **Gerência também opera caixa** → `caixa` adicionado ao cargo Gerência.

### 3.4. Correções implementadas (commitadas)

- **`usuario_admin` concede todas as permissões** (`api/src/auth/perfil.service.ts`), sem afetar o
  escopo de empresas. Diretor deixou de precisar do cargo "todas".
- **Barreira de escopo no servidor** (`api/src/caixa/caixa.service.ts` + 5 controllers de
  movimentação): com a flag `menu_<tela>_somente_caixa_aberto`, a listagem fica presa ao caixa aberto
  do usuário (ignora `caixaId` externo); sem a flag, comportamento livre. Fecha a brecha.
- **Seed ajustado** (`db/seed.ts`): Gerência com histórico + operar caixa; Diretor Geral sem "todas";
  **setor "Loja" esvaziado** (antes concedia `caixa_operar`/`entradas`/`relatorio_produtos` a TODOS,
  contaminando cargos estreitos como Tesouraria/DP/Fiscal).
- **Teste de regressão** (`tests/integration/permissoes/hierarquia.test.ts`, Testcontainers): prova a
  hierarquia usuário>cargo>setor, o padrão-nega, os guards e o short-circuit do `usuario_admin`.

### 3.5. Estado final dos cargos (verificado ao vivo)

| Cargo      | Operar caixa | Ver entradas | Histórico | Malotes | Observação                                |
| ---------- | ------------ | ------------ | --------- | ------- | ----------------------------------------- |
| Diretor    | ✅           | ✅           | ✅        | ✅      | tudo via role `usuario_admin`             |
| Caixa      | ✅           | ✅           | ❌        | ❌      | lançamentos só com caixa aberto           |
| Gerência   | ✅           | ✅           | ✅        | ❌      | opera + gerencia                          |
| Tesouraria | ❌           | ❌           | ❌        | ✅      | só malotes/transferências                 |
| Financeiro | ❌           | ❌           | ❌        | ❌      | despesas/mercadorias/retiradas/relatórios |

---

## 4. Reconciliação com a `main` (trabalho do Luis)

O Luis subiu para a `main` (`b694ad2`): **testes de integração reais com Testcontainers** (Postgres
real, sem mock, em `tests/setup/`) e **infra robusta** (Dockerfiles multi-stage, compose dev/prod/
coolify, nginx) — o que **fechou 2 gaps** apontados na ANALISE.md.

- Trouxe a `main` para a branch via **fast-forward (sem merge commit)** e **reapliquei o diff** por
  cima (sem conflito — arquivos diferentes).
- Rodei a **suíte completa dele com o diff**: **104/104 testes passando**. typecheck/arquitetura/texto OK.
- Papercut de infra observado: `scripts/test.mjs` mata a suíte em 120s (curto para Testcontainers,
  ~400s); vale subir `TEST_TIMEOUT_MS`.

---

## 5. Estado do git

Branch `analise-e-documentação-+-teste-de-permissões`, sobre `b694ad2`. Commits locais (autor
**ErasoumZe <zezinrique@gmail.com>**, **não pushados**):

```
f6e223b chore(seed): Gerencia tambem opera caixa (caixa_operar)
9a201ce test(permissoes): hierarquia usuario > cargo > setor (Testcontainers)
72c597c chore(seed): ajustar permissoes por decisao de negocio
b004c8e feat(caixa): listagens de movimentacao presas ao caixa aberto
07c75d3 feat(perfil): usuario_admin concede todas as permissoes
```

- **`docs/` ficou fora do git** (decisão do usuário).
- Nada foi pushado; a reconciliação com o repositório separado do "Marco" é do usuário.

---

## 6. Pendências e próximos passos

- **Push/reconciliação** da branch com a `main` (decisão de quando/onde — o usuário controla o git).
- **Fase A da unificação de produtos** (baixo risco, não toca produção): portar as **regras puras do
  Pralis** (`calcularVVenda`, `calcularVVendaFinal`, `montarDescricao`) + testes para
  `shared/src/produtos/`, e estender o contrato de produto com `custo`/`margem`/`preçoVenda`/`status`/
  `tipo`. Depois: schema fiscal/transformação/promoção, UI, e migração loja→empresa.
- **Estoque/inventário** (não existe hoje): decisão de negócio para controle por produto.
- **Regra do malote/transferência** (fluxo físico) — regra de negócio a definir.
- Opcional: portar a **matriz cargo×permissão** para dentro da suíte Testcontainers.

---

## 7. Convenções firmadas no processo

- **Atuar sempre como equipe sênior** (backend, frontend, infra/QA, arquitetura).
- **Nunca commitar/branch/push automaticamente** — o usuário decide quando e onde.
- Domínio em **português**; **migrations só com ordem explícita**; validar **ao vivo/com testes reais**.
- Identidade git do projeto: **ErasoumZe <zezinrique@gmail.com>** (o `luisanselmobd` é colaborador).
  </content>
