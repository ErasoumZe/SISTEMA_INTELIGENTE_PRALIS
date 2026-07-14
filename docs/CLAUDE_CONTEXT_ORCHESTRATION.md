# Orquestração Claude Code — Sistema Caixa / Padaria v2

**Objetivo:** definir como o Claude Code (e qualquer agente de IA) opera neste repositório. Este documento é normativo: vale para toda tarefa, de qualquer tamanho.

---

## 1. Hierarquia de contexto do projeto

Ordem de confiança ao responder qualquer pergunta ou tomar qualquer decisão (do mais confiável para o menos):

1. **Código real** (`api/`, `db/`, `shared/`, `web-vue/`, `scripts/`, `infra/`)
2. **Testes** (`tests/integration/`, `tests/unit/`) — provam comportamento
3. **Schema, migrations e seeds** (`db/src/schema/app.schema.ts`, `db/migrations/`, `db/seed.ts`)
4. **Documentação recente** (`docs/` — em especial `DIAGNOSTICO-TECNICO-2026-07-02.md`, `INVENTARIO_CLAUDE_CODE.md`, `UNIFICACAO.md`, `README.md` da raiz)
5. **PROJECT_BRAIN - Copia/** — **memória histórica**, escrita contra um repositório paralelo ("ambiente do Marco"); usar para entender intenções e decisões passadas, nunca como estado atual (doc 61 é a reconciliação mais confiável do acervo)
6. **design-system/** — referência de identidade visual Pralis (playbook em `62_DESIGN_DIRECTION_PRALIS_ADMIN.md` e `66_PRALIS_UI_PLAYBOOK.md`)

**Regra de ouro (código > documentação):** se doc e código divergirem, o código vence e a divergência deve ser reportada explicitamente. Nunca "corrigir" código para casar com doc antiga sem confirmar a regra de negócio com o Zé.

**Regra complementar:** design-system, docs e PROJECT_BRAIN nunca são ignorados — são sempre _consultados_; apenas não são _obedecidos cegamente_. Toda tarefa visual consulta o design-system; toda tarefa de domínio consulta o PROJECT_BRAIN como histórico.

## 2. Fluxo obrigatório antes de qualquer task

```
pedido → [request-understanding] entender objetivo real
       → [project-context-builder] ler contexto: README, docs/, schema, testes, código-alvo
       → [prompt-refinement] transformar em spec com critérios de aceite (se pedido vago)
       → declarar: agent principal | agents auxiliares | skills ativadas |
                   arquivos de contexto | riscos | plano de validação
       → executar
       → gates de qualidade (seção 4)
       → só então reportar como concluído
```

Toda execução deve diferenciar e declarar quando relevante:

- **implementado** (código existe e roda)
- **documentado** (a doc afirma, mas verificar no código)
- **testado** (coberto pela suíte)
- **pronto para produção** (sobrevive a deploy, concorrência, falha, auditoria)
- **placeholder** (ex.: as ~16 telas de roadmap ocultas no menu)

## 3. Como usar agents e skills

**Agents** (`.claude/agents/`) são subagentes com papel/persona; o Claude os invoca via ferramenta de agentes para trabalho paralelo, revisão adversarial ou perspectiva especializada. **Skills** (`.claude/skills/`) são procedimentos/checklists carregados sob demanda; guiam _como_ executar. Regra prática: agents decidem e revisam; skills padronizam a execução. Ambos exigem **reinício de sessão** após instalação/alteração.

Princípios:

- Toda tarefa não trivial começa com um agent "dono" (accountable) e pelo menos um revisor independente.
- Skills de gate (checklists) rodam ao FINAL; skills de fluxo (flows) orientam do INÍCIO.
- Se dois agents divergirem, `solution-architect` arbitra decisões técnicas; o Zé arbitra regra de negócio.
- Prompts dos pacotes citam "Marco"/Supabase/React — aplicar o _papel_ ao contexto real deste projeto (Fastify/Drizzle/Vue); `supabase-specialist` e `react-tailwind-expert` não foram instalados.

## 4. Gates de qualidade (obrigatórios)

Nenhuma entrega é chamada de "pronta" sem:

| Gate                            | Comando/skill                                                  | Quando                                                                                            |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Typecheck + arquitetura + texto | `npm run check`                                                | Sempre                                                                                            |
| Testes de integração            | `npm test` (Testcontainers; inclui teste de migrations/drift)  | Sempre                                                                                            |
| Testes unitários                | `npm run test:unit --workspace @padaria/tests`                 | Sempre (não incluso no `npm test` — rodar explícito)                                              |
| Lint                            | `npm run lint` (builda `shared`/`db` antes via `build:libs`)   | Sempre (consertado na T5 — 0 erros; `unknown` de fronteira usa o alias `DadosExternos` do shared) |
| Migrations/Docker               | teste `tests/integration/migracoes/` + `compose:coolify:check` | Quando tocar schema/infra                                                                         |
| Gate mestre                     | skill `final-delivery-gate`                                    | Toda entrega                                                                                      |

**Convenções invioláveis** (de `AGENTS.md` + decisões registradas):

- Migrations **somente com ordem explícita** do Zé (`drizzle-kit generate`; nunca `push` em produção).
- Domínio em **português**, código **sem acentos** (imposto por `scripts/verificar-texto.mjs`).
- Camadas controller→service→repository sem SQL cru (imposto por `scripts/verificar-arquitetura.mjs` + dependency-cruiser).
- Contratos em `@padaria/shared`; nunca duplicar regra de negócio em api/web.
- **Nunca commitar/pushar sem autorização** do Zé.
- Dinheiro: banco em `numeric`; cálculo em **centavos inteiros** no shared (`shared/dinheiro`); fórmula de saldo única em `shared/src/caixa/regras.ts` (concluído na T2 — ADR-001).

## 5. Matriz agent/skill por tipo de tarefa

| Tipo de tarefa                            | Agent principal                                                                                | Agents auxiliares (mínimo)                                                                                                     | Skills ativadas                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Backend (qualquer)**                    | `backend-architect`                                                                            | `node-api-expert`, `qa-build-fixer`; `database-architect` se tocar banco; `security-reviewer` se tocar auth/permissões/uploads | `backend-development-flow`, `node-api-development`, `error-handling-patterns`, `build-and-test-checklist`    |
| **Frontend (qualquer)**                   | `frontend-expert`                                                                              | `designer-agent` ou `design-system-guardian`, `ux-ui-reviewer`, `accessibility-director`, `qa-build-fixer`                     | `frontend-quality-flow`, `design-gate`, `ux-review-checklist`, `accessibility-review`                        |
| **Dinheiro / caixa / financeiro / saldo** | `solution-architect`                                                                           | `backend-architect`, `database-architect`, `security-reviewer`, `qa-build-fixer` (todos obrigatórios)                          | `database-safe-design`, `error-handling-patterns`, `javascript-testing-patterns`, `build-and-test-checklist` |
| **Banco / schema / migrations**           | `database-architect`                                                                           | `backend-architect`, `qa-build-fixer`                                                                                          | `database-safe-design`, `sql-optimization-patterns` (+ ordem explícita do Zé p/ migration)                   |
| **Produção / deploy / infra**             | `deployment-specialist`                                                                        | `security-reviewer`, `database-architect`, `qa-build-fixer` (obrigatórios)                                                     | `deployment-checklist`, `security-checklist`, `final-delivery-gate`                                          |
| **Funcionalidade nova**                   | `product-strategist` (escopo) → `solution-architect` (arquitetura) → `project-manager` (fases) | `qa-build-fixer` define critério de teste ANTES de codar                                                                       | `product-thinking-flow`, `request-understanding`, `prompt-refinement`                                        |
| **Bug**                                   | `bug-fixer`                                                                                    | `qa-build-fixer`; especialista da área afetada                                                                                 | `bug-fixing-flow`, `debugging-strategies`                                                                    |
| **Revisão de arquitetura**                | `architecture-reviewer`                                                                        | `solution-architect`, `performance-reviewer`                                                                                   | `architecture-review-flow`, `code-review-excellence`                                                         |
| **Design/identidade Pralis**              | `creative-director`                                                                            | `designer-agent`, `design-system-guardian`, `ux-ui-reviewer`, `accessibility-director`                                         | `premium-ui-design`, `design-principles`, `visual-innovation-checklist`, `brand-systems`                     |
| **Documentação**                          | `documentation-writer`                                                                         | revisor da área documentada                                                                                                    | `documentation-flow`                                                                                         |
| **Testes**                                | `qa-build-fixer`                                                                               | especialista da área                                                                                                           | `javascript-testing-patterns`, `e2e-testing-patterns`                                                        |
| **Entrega final (qualquer)**              | `qa-build-fixer`                                                                               | `security-reviewer` + `performance-reviewer` quando aplicável                                                                  | `final-delivery-gate`, `project-finalization-flow`                                                           |

## 6. Contexto mínimo por área (arquivos a consultar)

| Área            | Arquivos-âncora                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Caixa           | `api/src/caixa/*`, `shared/src/caixa/`, `tests/integration/caixa/`, README §"Caixa operacional"                                    |
| Lançamentos     | `api/src/lancamentos/lancamentos.dominio.ts` + módulos vendas/despesas/mercadorias/retiradas/transferencias                        |
| Permissões      | `shared/src/autenticacao/index.ts`, `api/src/auth/*`, `tests/integration/permissoes/`                                              |
| Produtos/Pralis | `shared/src/produtos/`, `api/src/produtos/`, `docs/UNIFICACAO.md`, `CADASTRO DE PRODUTOS/pralis/` (referência legada, fora do git) |
| Banco           | `db/src/schema/app.schema.ts`, `db/migrations/` (+ journal), `db/seed.ts`, `tests/setup/`                                          |
| Frontend        | `web-vue/components/app/AppWorkspace.vue`, `web-vue/utils/domain.ts`, `web-vue/composables/`, `design-system/`                     |
| Infra           | `infra/*.yml`, `db/docker-compose-db*.yml`, `scripts/*.mjs`, `.env.example`                                                        |
| Estado geral    | `docs/DIAGNOSTICO-TECNICO-2026-07-02.md` (auditoria completa + roadmap de sprints)                                                 |

## 7. Estado atual que todo agente deve saber (atualizado 03/07/2026)

> Para o estado completo e a linha do tempo de todos os commits, leia
> `docs/HANDOFF-CONTEXTO-COMPLETO.md` (handoff-mestre). Os princípios permanentes estão em
> `docs/CONSTITUICAO_DO_PROJETO.md`; o como-trabalhar em `docs/CLAUDE_WORKFLOW_PADARIA_V2.md`.

- **Sprint 1 concluída** (T1 migrations, T2 caixa único, T3 uploads/imagem, T4 concorrência,
  T5 lint/husky/CI). **Fase 2 (segurança)** concluída exceto produção (backup + observabilidade
  reservados para o fim da Fase 4). **Fase 3** item 1 (edição de operações) concluído.
  **Fase 4 (produtos)** em andamento: catálogo Pralis importado, preço com promoção derivado no
  servidor, front em centavos, payloads no shared.
- **Backend autoritativo é regra oficial (ADR-002):** cliente envia intenções; toda decisão
  persistida é do servidor; shared define, servidor executa, cliente faz preview. Preço de
  produto é recomputado no servidor quando `auto=true`; `computar`/`dataPagamento` exigem
  `caixas_gerenciar` (ADR-004).
- **Caixa:** o fluxo legado `/api/fechamento-caixa/*` foi **removido** (ADR-001). Fechamento/
  acerto só por `caixaId`; **fórmula de saldo única** em `shared/src/caixa/regras.ts`, em
  centavos. **Nunca recriar fórmula paralela** — a divergência histórica de "duas fórmulas" já
  não existe.
- **ADRs vigentes:** 001 (caixa único), 002 (backend autoritativo), 003 (shared isomórfico),
  004 (campos sensíveis). Consultar antes de tocar caixa/dinheiro/produtos/campos sensíveis.
- Suíte com 120+ testes (integração Testcontainers + unit), todos verdes. Lint zerado; CI no
  GitHub Actions; pre-commit ativo.
- Fronteiras de dados externos usam o alias `DadosExternos` (`shared/src/api`) — não introduzir
  `unknown` explícito fora dele.
- Multiempresa real: **TNP** (era "Padaria Principal"), **Lisboa** e **Hora** (Hora sem vínculos
  = inativa). Módulos Financeiro/Estoque/RH/Produção continuam **placeholder** (Fase 5 bloqueada).
