# ADR-005 — Estrategia de teste do frontend: injecao de dependencia + harness Vitest

**Data:** 03/07/2026 · **Status:** Aceito

## Problema

O AppWorkspace.vue concentrava logica de negocio e orquestracao. A logica **pura** (mapeamento
de operacao, reconstrucao de cadastro, diff/merge de tema) ja foi extraida para `utils/*` e
coberta por testes. Resta a **orquestracao**: funcoes que chamam `useApi`
(`apiPost/apiPut/apiGet`) e mutam refs reativos (`caixaSalvando`, `resumo`, `empresaId`…).
Essas funcoes nao sao unit-testaveis sem um runtime Nuxt (o `useApi` depende de
`useRuntimeConfig` e `fetch`; os refs, de `useState`/`ref`).

## Decisao

Extrair a orquestracao como **factories que recebem as dependencias por parametro** (injecao
de dependencia): um "port" de API mais callbacks (`notificar`, `carregarStatusCaixa`,
`carregarDadosTela`, getters de estado, `confirmar`). O componente injeta as dependencias
reais; os testes injetam **fakes** (`vi.fn()`), sem nenhum mock de Nuxt.

- Primeiro caso: `utils/caixa-acoes.ts` → `criarAcoesCaixa(deps)` (abrir/editar-abertura/
  acertar/fechar). O AppWorkspace faz `const { ... } = criarAcoesCaixa({ api: { post: apiPost,
put: apiPut }, empresaId: () => empresaId.value, ... })`.
- Fica como **padrao** para os proximos composables de front (tema async, atualizacao local de
  cadastro) e para os modulos novos da Fase 5.

### Alternativas consideradas

- **`vi.mock('~/composables/useApi')`** — composable idiomatico, mas exige mockar tambem
  `useRuntimeConfig`/`fetch`; fragil e acoplado ao Nuxt. Rejeitada como base.
- **`@nuxt/test-utils` / `@vue/test-utils`** — necessario so para o que for genuinamente
  UI-acoplado (montar componente, interagir com o DOM). Fica como **complemento** para um
  eventual smoke de componente, nao como base da cobertura de orquestracao.

## Consequencias

- Orquestracao testavel no harness Vitest atual (happy-dom), sem runtime Nuxt: rapido e estavel.
- Custo: o wire no componente fica mais verboso (as acoes recebem deps explicitas) — troca
  aceita por testabilidade e fronteira explicita.
- O port de API tipa `body` como `DadosExternos` (o unico `unknown` sancionado), preservando a
  regra de lint do projeto.
- Gate por fase inalterado: `vitest` + `nuxt typecheck` + **build Vite** + `eslint`. O build
  Vite e obrigatorio porque o typecheck nao pega erros de alias/resolucao (front so importa
  `@padaria/shared` pela raiz).
- Cobertura inicial: `utils/caixa-acoes.test.ts` (9 casos — endpoint/corpo, re-fetch de status,
  notificacao, reset de `salvando`, confirmacao do acerto).
