# Inventário Claude Code — Sistema Caixa / Padaria v2

**Data:** 02/07/2026
**Origem dos pacotes:** `C:\Users\José\Downloads\agents\agents\` (27 arquivos) e `C:\Users\José\Downloads\skills\skills\` (76 pastas), já extraídos dos `.rar` correspondentes.
**Destino:** instalação **local no projeto** — `.claude/agents/` (24 agents) e `.claude/skills/` (47 skills). Instalação global (`~/.claude/`) não foi feita; se quiser replicar, é uma cópia das mesmas pastas.

> Nota 1: agents e skills instalados passam a ser carregados **na próxima sessão** do Claude Code (reinicie a sessão para ativá-los).
> Nota 2: os prompts vieram do ambiente do "Marco" (mencionam esse nome nos gatilhos) — funcionam normalmente aqui; os gatilhos em português batem com o vocabulário do projeto.

## Agents instalados (24)

| Agent                    | Finalidade                                                                                           | Quando usar                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `master-orchestrator`    | Atua como CTO/primeiro respondedor; decompõe pedidos não triviais e aciona os demais                 | Início de qualquer pedido grande ("quero construir/mudar X") |
| `solution-architect`     | Arquitetura de solução: stack, fronteiras, estrutura, reversibilidade                                | Antes de qualquer build/refactor não trivial                 |
| `architecture-reviewer`  | Revisão adversarial de arquitetura existente (acoplamento, camadas)                                  | Depois que um design/código existe, antes de endurecer       |
| `backend-architect`      | Fronteiras de serviço, contratos de API, camadas handler→service→repository, validação, idempotência | Antes de criar/refatorar lógica de servidor                  |
| `node-api-expert`        | Implementação de endpoints Node/Fastify: middleware, auth, validação, CORS, rate-limit               | Ao implementar/corrigir rotas HTTP                           |
| `database-architect`     | Modelagem de dados PostgreSQL: chaves, índices, constraints, migrations                              | Sempre que o modelo de dados for criado/alterado             |
| `frontend-expert`        | Construção/revisão de UI: componentes, páginas, estados, motion                                      | Qualquer trabalho de interface                               |
| `design-system-guardian` | Tokens, theming e consistência de componentes                                                        | Quando padronização visual/tokens estiver em jogo            |
| `designer-agent`         | Direção visual (paleta, tipografia, conceito) ANTES do código                                        | Início de qualquer trabalho de UI/marca                      |
| `creative-director`      | Direção criativa autoral, anti-genérico, identidade                                                  | Frente de qualquer trabalho visual novo                      |
| `motion-director`        | Linguagem de movimento: transições, micro-interações                                                 | Quando a interface precisar de animação                      |
| `ux-ui-reviewer`         | Auditoria UX/UI com rubrica de craft                                                                 | Depois de qualquer UI construída/alterada                    |
| `accessibility-director` | Auditoria WCAG: contraste, teclado, ARIA                                                             | Após UI construída, antes de release                         |
| `security-reviewer`      | AppSec: auth, dados, uploads, segredos, brechas                                                      | Antes de release; após mudanças em auth/permissões/uploads   |
| `performance-reviewer`   | Performance e escalabilidade (telas de lista, queries, N+1)                                          | Antes de release; quando algo "está lento"                   |
| `qa-build-fixer`         | Roda build/typecheck/lint/testes e CONSERTA até ficar verde; dono do gate de release                 | Antes de qualquer entrega; depois de refactors               |
| `deployment-specialist`  | Deploy, Docker, variáveis de ambiente, rollback                                                      | Mudanças de produção/infra                                   |
| `bug-fixer`              | Reproduz, isola causa-raiz, fix mínimo + teste de regressão                                          | Quando algo está quebrado                                    |
| `documentation-writer`   | README, arquitetura, API reference, changelog                                                        | Ao documentar qualquer entrega                               |
| `project-manager`        | Quebra escopo em fases ordenadas e rastreáveis                                                       | Depois que escopo+arquitetura existem                        |
| `product-strategist`     | Define escopo/MVP/critérios de sucesso antes de codar                                                | Início de qualquer ideia/feature nova                        |
| `product-critic`         | Crítica de produto: fricção, valor, "isso resolve mesmo?"                                            | Depois que um fluxo/tela é desenhado, antes de subir         |
| `prompt-engineer`        | Transforma pedidos vagos em spec executável                                                          | Quando o pedido for curto/ambíguo                            |
| `prompt-optimizer`       | Afia os prompts dos próprios agents/skills                                                           | Quando um agent/skill "não obedece"                          |

## Skills instaladas (47)

### Fluxos de processo (10)

| Skill                       | Finalidade / quando usar                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| `project-context-builder`   | Rotina canônica de detecção de stack/contexto — ler ANTES de tocar em código |
| `request-understanding`     | Extrair objetivo real e requisitos ocultos de pedidos vagos, antes de codar  |
| `prompt-refinement`         | Transformar pedido+contexto em spec com critérios de aceite                  |
| `app-development-flow`      | Fluxo ponta-a-ponta para tirar uma ideia do papel com revisão                |
| `architecture-review-flow`  | Revisão estruturada de arquitetura (fronteiras, acoplamento, camadas)        |
| `backend-development-flow`  | Fluxo contract-first para feature de backend validada e testada              |
| `frontend-quality-flow`     | Passe de endurecimento de UI (estados, responsividade, WCAG)                 |
| `bug-fixing-flow`           | Reproduzir → causa-raiz → fix mínimo → teste de regressão                    |
| `product-thinking-flow`     | Enquadrar problema/MVP/métricas antes de qualquer código                     |
| `project-finalization-flow` | Gate final de entrega: tudo verde + docs + handoff                           |

### Gates e checklists (9)

| Skill                         | Finalidade / quando usar                                         |
| ----------------------------- | ---------------------------------------------------------------- |
| `final-delivery-gate`         | Gate MESTRE: agrega todos os gates e emite veredito por dono     |
| `build-and-test-checklist`    | Gate de build/typecheck/lint/teste                               |
| `security-checklist`          | Checklist AppSec (auth, dados, segredos, uploads, input externo) |
| `performance-checklist`       | Checklist de performance/escalabilidade                          |
| `deployment-checklist`        | Gate pré/pós-deploy                                              |
| `design-gate`                 | Checkpoint duro de design antes de polish/entrega                |
| `ux-review-checklist`         | Rubrica pontuada de revisão UX/UI (10 dimensões)                 |
| `accessibility-review`        | Auditoria WCAG 2.2 AA completa                                   |
| `visual-innovation-checklist` | Detector pontuado de design genérico/templático                  |

### Backend, banco e qualidade (12)

| Skill                          | Finalidade / quando usar                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `database-safe-design`         | Schema seguro: constraints, índices, **dinheiro em centavos inteiros**, migrations expand→migrate→contract |
| `sql-optimization-patterns`    | Otimização de queries, índices, EXPLAIN                                                                    |
| `node-api-development`         | API Node produção: estrutura, middleware, erros estruturados                                               |
| `nodejs-backend-patterns`      | Padrões de backend Node (Express/Fastify)                                                                  |
| `error-handling-patterns`      | Taxonomia de erros, Result types, degradação graciosa                                                      |
| `auth-implementation-patterns` | JWT, OAuth2, sessão, RBAC                                                                                  |
| `javascript-testing-patterns`  | Vitest/Jest/Testing Library: unit, integração, mocks, fixtures                                             |
| `e2e-testing-patterns`         | E2E com Playwright/Cypress, anti-flake                                                                     |
| `code-review-excellence`       | Prática de code review construtivo                                                                         |
| `debugging-strategies`         | Técnicas sistemáticas de debug e profiling                                                                 |
| `monorepo-management`          | Gestão de monorepo/workspaces                                                                              |
| `git-advanced-workflows`       | Rebase, bisect, worktrees, recuperação                                                                     |

### Frontend e design (14)

| Skill                   | Finalidade / quando usar                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| `frontend-design`       | Direção visual intencional, anti-template                                        |
| `premium-ui-design`     | Transformar tela genérica em autoral/premium                                     |
| `premium-saas-design`   | Framework Define→Build→Review→Refine para SaaS                                   |
| `ui-ux-pro-max`         | Base de inteligência: 50+ estilos, 161 paletas, 57 pares tipográficos            |
| `design-principles`     | Fundamentos: gestalt, hierarquia, cor, tipografia                                |
| `design-masters`        | Referências de mestres do design                                                 |
| `design-movements`      | Movimentos históricos (Bauhaus, Swiss etc.)                                      |
| `brand-systems`         | Sistemas de identidade de marca                                                  |
| `web-design-guidelines` | Compliance com guidelines de interface web                                       |
| `mobile-first-ui`       | Mobile-first: 320px, touch targets, clamp()                                      |
| `microinteractions`     | Catálogo de micro-interações úteis                                               |
| `motion-design-system`  | Linguagem de movimento como tokens                                               |
| `composition-patterns`  | Padrões de composição de componentes (escrito p/ React; princípios valem p/ Vue) |
| `documentation-flow`    | Fluxo de documentação de projeto                                                 |

### Linguagem (2)

| Skill                        | Finalidade / quando usar                          |
| ---------------------------- | ------------------------------------------------- |
| `modern-javascript-patterns` | ES6+: async/await, módulos, padrões funcionais    |
| `typescript-advanced-types`  | Generics, conditional/mapped types, utility types |

## Agents/skills ignorados

### Agents (3)

| Agent                   | Motivo                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `n8n-automation`        | Fora do escopo — o projeto não usa n8n                                                                                          |
| `react-tailwind-expert` | Fora do escopo — o frontend é Vue/Nuxt/Vuetify, não React/Tailwind                                                              |
| `supabase-specialist`   | Fora do escopo — o banco é PostgreSQL/Drizzle self-hosted, não Supabase (referências a ele dentro de outros agents são inertes) |

### Skills sem `SKILL.md` (12 — inválidas pela regra)

`LibreUIUX-Claude-Code`, `apple`, `application`, `awesome-claude-skills`, `bencium-innovative-ux-designer`, `canva`, `document-skills`, `linear-app`, `lovable`, `luxury`, `n8n-mcp`, `ui-ux-pro-max-skill` — são pacotes de tokens/coleções/repos clonados (3 deles contêm `.git`), não skills válidas. `ui-ux-pro-max-skill` é duplicata da `ui-ux-pro-max` (esta sim instalada).

### Skills fora do escopo (11)

`n8n-code-javascript`, `n8n-code-python`, `n8n-expression-syntax`, `n8n-mcp-tools-expert`, `n8n-node-configuration`, `n8n-validation-expert`, `n8n-whatsapp-automation`, `n8n-workflow-patterns` (não há n8n no projeto); `supabase-safe-backend` (não usamos Supabase); `react-best-practices`, `react-typescript-tailwind` (frontend é Vue).

### Skills meta/utilitárias (6)

`skill-creator`, `template-skill`, `mcp-builder`, `project-installer`, `od-contribute`, `developer-growth-analysis` — ferramentas de criação de skills/análise pessoal, não agregam ao projeto.

### Não encontrada no pacote (1)

`design-system-context` — estava na lista prioritária, mas **não existe** no pacote recebido. O papel é parcialmente coberto por `design-system-guardian` (agent) + a pasta `design-system/` do projeto.

## Fluxo operacional obrigatório

Como o Claude Code trabalha neste projeto daqui para frente (detalhado em `docs/CLAUDE_CONTEXT_ORCHESTRATION.md`):

1. **Contexto antes de código** — ler README, `docs/` (diagnóstico mais recente: `docs/DIAGNOSTICO-TECNICO-2026-07-02.md`), PROJECT_BRAIN (como memória histórica), design-system, package.json, schema/seeds/migrations e testes relevantes à tarefa.
2. **Código > documentação** — fonte de verdade: código real > testes > schema/seeds > docs recentes > PROJECT_BRAIN.
3. **Diferenciar sempre**: implementado × documentado × testado × pronto-para-produção × placeholder.
4. **Escalar agents/skills por tipo de tarefa** antes de executar, declarando: agent principal, auxiliares, skills ativadas, contexto consultado, riscos e plano de validação.
5. **Gates**: nenhuma entrega é "pronta" sem `npm run check` + `npm test` + `npm run test:unit` (+ lint quando o pipeline estiver consertado, + validação Docker/migrations quando aplicável) e sem passar pelo `final-delivery-gate`.
6. **Convenções invioláveis do projeto**: migrations só com ordem explícita; domínio em português sem acentos no código; nunca commitar sem autorização; dinheiro caminhando para centavos no shared.
