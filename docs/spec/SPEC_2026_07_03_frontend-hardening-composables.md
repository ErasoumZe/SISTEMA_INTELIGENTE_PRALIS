# SPEC — Endurecimento do front (fase 2): decomposição por composables

**Data:** 2026-07-03 · **Status:** proposta, aguardando aprovação do Zé para `/build`
**Tipo:** refactor de frontend (sem mudança de comportamento) · **Pré-requisito:** harness de front (já entregue)

## Objetivo

Continuar a decomposição do `web-vue/components/app/AppWorkspace.vue` (hoje 1608 linhas) tirando
do componente a **orquestração** (chamadas de API + mutação de estado reativo) que sobrou depois
das extrações de lógica pura, deixando cada domínio isolado e **coberto por teste**.

## Contexto

- Já extraído e testado (lógica pura): `operacoes.ts`, `domain.formCadastroDeLinha`, `tema.ts` —
  27 testes no harness, no CI. AppWorkspace caiu de ~1870 → 1608 linhas.
- O que resta no componente **não é lógica pura** — é orquestração acoplada a `useApi`
  (apiPost/apiPut/apiGet) e a refs reativos (`empresaId`, `telaAtiva`, `caixaSalvando`,
  `resumo`, `opcoes`, `empresas`…). Ex.: `abrirCaixaOperacional`/`editarAberturaCaixa`/
  `acertarSaldoOperacional`/`fecharCaixaOperacional` (setam `caixaSalvando`, chamam a API,
  re-buscam `carregarStatusCaixa`, `notificar`), `atualizarCadastroLocal` (143 linhas, muta
  `opcoes.value`), os async de tema (`buscarTema`/`salvarTema`/`carregarTemaTela`).

## Escopo

Extrair, um domínio por incremento, em ordem de valor/risco:

1. **Ações de caixa** → `web-vue/composables/useCaixaAcoes.ts` (ou factory `criarAcoesCaixa`):
   abrir/editar-abertura/acertar/fechar + `carregarStatusCaixa`.
2. **Atualização local de cadastro** → extrair `atualizarCadastroLocal` (o mapeamento
   tela→item é quase puro; a mutação da lista fica isolada e testável com listas fake).
3. **Tema (async)** → `useTemaAparencia`: buscar/salvar/carregar, reusando o `tema.ts` puro
   que já existe.
4. (Opcional, se sobrar valor) sessão/logout e cópia entre empresas.

## Fora de escopo

- Mudar comportamento, contratos, endpoints, regra de negócio ou UI.
- Tocar backend, banco, shared de contrato, permissões, dinheiro/caixa (regra), infra.
- Reescrever o template do componente (só a camada de script/estado).

## Onde a inteligência mora (ADR-002)

Inalterado. Isto é refactor de **orquestração de UI**; o servidor continua autoritativo. Nenhuma
decisão persistida muda de lugar. A fórmula de saldo segue no shared/caixa; o front só chama a API.

## Regra de negócio

Nenhuma nova. O critério é **comportamento idêntico** — mesmas chamadas, mesma ordem, mesmos
efeitos e mensagens.

## Estratégia de teste (a decisão de design central deste spec)

O problema: composables que usam `useApi` (→ `useRuntimeConfig`, `fetch`) e refs não são
unit-testáveis sem runtime Nuxt. Três opções avaliadas:

- **(A) Injeção de dependência / factory (RECOMENDADO).** Extrair a orquestração como uma factory
  que **recebe as dependências** (um "port" de API + callbacks: `{ api, notificar,
carregarStatusCaixa, empresaId }`) e devolve as ações. O componente injeta as deps reais; os
  testes injetam **fakes** (api falso que registra chamadas, notificar espião). Sem mock de
  Nuxt, baixo acoplamento, testável no harness atual. Custo: as ações passam a receber deps
  explícitas (mais verboso no wire, mas honesto).
- **(B) `vi.mock('~/composables/useApi')`.** Composable idiomático, mas exige mockar também
  `useRuntimeConfig`/`fetch`; frágil e acoplado ao Nuxt.
- **(C) `@nuxt/test-utils` / `@vue/test-utils`.** Necessário só para o que for genuinamente
  UI-acoplado; mais pesado. Fica como complemento, não como base.

**Decisão proposta:** (A) para toda a orquestração de dados; (C) reservado para um eventual
smoke de componente no futuro. Isso mantém o padrão "função testável + wire fino no componente"
que já rendeu bem.

## Segurança / permissões / multiempresa / banco / dinheiro

N/A — refactor puro de front. O escopo de empresa continua no servidor (WHERE) e o front segue
mandando `empresaId` como intenção. Sem migration, sem mudança de auth.

## Fases (cada uma = 1 commit verde, reversível)

1. `useCaixaAcoes` + testes (fakes de api/notificar/carregarStatus). ~4 ações + status.
2. `atualizarCadastroLocal` extraído (mapa tela→item testado com listas fake).
3. Tema async (`useTemaAparencia`) sobre o `tema.ts` puro.
4. Revisão: AppWorkspace deve cair para ~1.2–1.3k linhas; medir.

## Testes necessários (por fase)

- Caixa: cada ação chama o endpoint certo com o corpo certo, re-busca o status, notifica sucesso;
  em erro, notifica erro e reseta `caixaSalvando`; acerto pede confirmação e aborta se negada.
- Cadastro local: mapeamento tela→item (empresas/contas/pdv/clientes/colaboradores/grupos/
  areas_setores/usuarios) e o retorno `false` que força reload (produtos/novoColaborador).
- Tema: salvar aplica `montarConfiguracaoAparencia` e persiste; carregar resolve via
  `resolverTemaDeConfiguracao`.

## Validação (gate de cada fase)

`npm run test --workspace @padaria/web-vue` (harness) + `npm run check --workspace @padaria/web-vue`
(nuxt typecheck) + **`npm run build --workspace @padaria/web-vue` (Vite — pega alias/resolução)** +
`npm run lint`. Regra aprendida: front valida com **build Vite**, não só typecheck; e front só
importa `@padaria/shared` pela raiz.

## Rollback

Cada fase é um commit atômico; `git revert` restaura o componente e remove o composable/util.
Sem migração de dados, sem efeito em produção.

## Necessidade de ADR

Sim, pequeno: **ADR-005 — Estratégia de teste do frontend (DI/factory + harness Vitest)** para
registrar a decisão (A) como padrão dos próximos composables e módulos de front.

## Agents/skills

`frontend-expert` (dono), `architecture-reviewer` (fronteiras/acoplamento), `qa-build-fixer`
(gate). Skills: `frontend-quality-flow`, `composition-patterns`, `javascript-testing-patterns`.

## Critérios de aceite

- Ações de caixa, atualização local de cadastro e tema async fora do AppWorkspace, em
  composables/factories testados.
- Comportamento idêntico (mesmas chamadas/efeitos/mensagens) — verificado por testes.
- AppWorkspace visivelmente menor (meta ~1.2–1.3k linhas).
- Gates verdes em cada fase; 0 mudança de contrato/back/infra.
- ADR-005 registrado.

---

_Aguardando aprovação do Zé. Só após o "ok" um `/build` inicia — fase a fase._
