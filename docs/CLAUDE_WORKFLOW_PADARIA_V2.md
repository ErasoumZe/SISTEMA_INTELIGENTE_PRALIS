# Workflow Claude Code — Sistema Caixa / Padaria v2

Guia operacional de **como** trabalhar neste projeto com o Claude Code. Complementa:

- `docs/CONSTITUICAO_DO_PROJETO.md` — os princípios permanentes (o **porquê**);
- `docs/CLAUDE_CONTEXT_ORCHESTRATION.md` — a matriz agent/skill e o contexto por área (o **quem**);
- `docs/INVENTARIO_CLAUDE_CODE.md` — catálogo dos 24 agents e 47 skills instalados.

Este documento não repete a matriz nem o catálogo — ele os referencia.

---

## 1. O que é o workflow

Uma sequência de comandos slash (`.claude/commands/`) que padroniza como uma ideia vira código
entregue com segurança: **/context → /spec → (aprovação) → /build → /review → /qa → /adr? →
/handoff**. Cada comando tem um papel único e guardrails embutidos.

## 2. Por que ele existe

Para garantir que toda mudança respeite a Constituição (backend autoritativo, dinheiro em
centavos, caixa com fórmula única, nada de commit/migração sem OK) e para que qualquer sessão/
modelo (Fable 5, Opus 4.8…) retome o trabalho sem perder contexto e sem regredir decisões.

## 3. `/context`

Carrega o contexto antes de qualquer tarefa (read-only). Identifica fase atual, decisões e ADRs
relevantes, pendências, divergências doc×código, e recomenda agents/skills. **Sempre o primeiro
passo** numa sessão nova ou ao trocar de área. Não altera nada.

## 4. `/spec <nome>`

Transforma ideia em especificação. **Nunca implementa.** Grava em `docs/spec/SPEC_<data>_<nome>.md`.
É **bloqueante**: se a spec não define _onde a inteligência mora_ (que intenção o cliente envia ×
o que o servidor recomputa), nenhum `/build` pode começar. Termina pedindo aprovação do Zé.

## 5. `/build <nome>`

Implementa **só uma spec aprovada**. Confirma branch, lê ADRs+spec, lista arquivos/riscos/plano,
declara agents/skills. Não toca banco/auth/dinheiro/caixa/multiempresa/infra sem OK explícito
item a item. Ao fim, roda gates e encaminha para review. Não commita sem autorização.

## 6. `/review <nome>`

Revisão adversarial contra a spec. Não cria feature, não corrige sem OK. Verifica escopo,
backend autoritativo, segurança, permissões, multiempresa, dinheiro/caixa, front/design, testes,
docs/ADRs. Emite **APROVADO / APROVADO COM OBSERVAÇÕES / REPROVADO**.

## 7. `/qa <nome>`

Valida a branch tecnicamente (não altera código). Roda `check`, `lint`, `test`, `test:unit`,
`knip`, build e validações de Docker/migrations quando aplicável. Grava
`docs/qa/QA_<data>_<nome>.md` com saída real e veredito **LIBERADO / COM RESSALVAS / BLOQUEADO**.

## 8. `/handoff <nome>`

Gera `docs/handoff/HANDOFF_<data>_<nome>.md` com objetivo, contexto, o que foi feito, arquivos,
decisões, ADRs, pendências, riscos, como rodar/testar, rollback e próximo passo. Baseado no
estado real do git, não em memória. O `HANDOFF-CONTEXTO-COMPLETO.md` é o handoff-mestre acumulado.

## 9. `/adr <título>`

Registra uma decisão de arquitetura em `docs/adr/ADR-XXX-*.md` (formato dos ADRs 001–004).
Decisão de negócio é do Zé/Luis; decisão técnica pode ser sua, marcada "Proposto" até aprovação.
ADR registra — não implementa.

## 10. Como escolher agents/skills

Use a **matriz do `CLAUDE_CONTEXT_ORCHESTRATION.md` §5** — não decore, consulte. Regras:

- toda tarefa não trivial tem um agent "dono" + ao menos um revisor independente;
- skills de **fluxo** orientam o início; skills de **gate** (checklists) rodam no fim;
- dinheiro/caixa exige o pacote completo (solution + backend + database + security + qa);
- reutilize agent/skill existente antes de propor um novo (há 24 agents, 47 skills instalados).
  Agents/skills exigem **reinício de sessão** após instalação/alteração.

## 11. Como respeitar a Constituição

Leia `docs/CONSTITUICAO_DO_PROJETO.md` no `/context`. Os 18 princípios são inegociáveis sem ADR.
Em caso de dúvida entre princípio e conveniência, o princípio vence e a dúvida vai para o Zé.

## 12. Como respeitar ADRs

Antes de tocar caixa → ADR-001; qualquer persistência derivada → ADR-002; regra pura no shared
→ ADR-003; `computar`/`dataPagamento` → ADR-004. Uma mudança que contrarie um ADR exige um
**novo ADR** que o supersede, aprovado pelo Zé — nunca uma contradição silenciosa.

## 13. Como respeitar o backend autoritativo (ADR-002)

Para todo campo de payload, responda no PR/spec: "se o cliente mentir aqui, o que acontece?".
Valor derivado → servidor recomputa (ex.: `salvarProduto` recalcula preço quando `auto=true`).
Campo sensível → gate de permissão + **teste de payload hostil** obrigatório.

## 14. Regras para banco/migrations

Migration **só com ordem explícita do Zé**, via `drizzle-kit generate` no workspace `db`. O
journal (`db/migrations/meta/`) é versionado; o teste `tests/integration/migracoes/` asserta o
**total de entradas** — atualize-o ao criar migration. Dev/teste usam `push --force` + a SQL da
0002 pós-push. Nunca `push` em produção.

## 15. Regras para dinheiro/caixa

Centavos via `shared/dinheiro`; fórmula de saldo só em `shared/src/caixa/regras.ts`; fechamento/
acerto só por `caixaId`. Nenhuma fórmula paralela. Preview do front usa a mesma função do shared.

## 16. Regras para permissões/multiempresa

Permissões vêm do catálogo `shared/src/autenticacao`; autorização é no servidor (default-deny +
guard por rota). Escopo de empresa **no WHERE** / `validarReferencias` — nunca filtro só em
memória. Front esconde UI por permissão apenas como UX.

## 17. Regras para frontend/design-system

Front cuida de UX, render, estado temporário, preview e validações de conveniência. Não decide
regra crítica nem monta autoridade. Identidade visual Pralis: consultar `design-system/` e o
playbook. Serialização de payload mora no shared (`@padaria/shared/cadastros`), não no front.

## 18. Regras para a Fase 4 (em andamento)

Unificação de produtos. Já feito: catálogo Pralis importado (TNP/Lisboa/Hora), preço vigente com
promoção derivado no servidor, front em centavos, payloads no shared. Restante: réplica
TNP→Lisboa (feature de exportar entre empresas já existe), confirmações do Luis (mercadorias na
fórmula de saldo; política definitiva de `computar`/`dataPagamento`) e as pendências de produção
(backup + observabilidade) reservadas para o **fim** da fase.

## 19. Bloqueio da Fase 5

Financeiro, Compras, Estoque, RH e Produção **não começam** sem regras de negócio aprovadas com a
equipe (Princípios 15–16). Cada módulo novo nasce no padrão do Caixa (camadas + contratos no
shared + guards + testes desde o primeiro endpoint) e **com migration versionada**.

## 20. Fluxo ideal (exemplo)

```
/context                     # carrega estado + recomenda agents/skills
/spec pagamento-parcial      # spec: objetivo, onde a inteligencia mora, testes, rollback
   → aprovação explícita do Zé
/build pagamento-parcial     # implementa a spec aprovada; roda gates
/review pagamento-parcial    # veredito contra a spec
/qa pagamento-parcial        # gates + relatorio em docs/qa/
/adr backend-baixa-pagamento # se a decisao for arquitetural
/handoff pagamento-parcial   # transferencia de contexto em docs/handoff/
   → aprovação do Zé para commitar
```

---

### Nota de versionamento

`.claude/` (agents, skills, **e estes comandos**) está hoje **fora do git** (decisão do Zé). Se a
equipe quiser compartilhar o workflow, recomenda-se versionar apenas `.claude/commands/` via
exceção no `.gitignore` (`!.claude/commands/`) — os comandos são pequenos e específicos do
projeto. Alteração de `.gitignore` exige autorização do Zé (Princípio 18).
