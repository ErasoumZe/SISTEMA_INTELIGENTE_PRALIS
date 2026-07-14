# Constituição do Projeto — Sistema Caixa / Padaria v2

**Status:** norma permanente. Vale para todo colaborador humano e todo agente de IA.
**Precedência:** esta Constituição está acima de qualquer documentação antiga. Onde um ADR
(`docs/adr/`) detalha um princípio, o ADR é a fonte operacional; onde houver conflito com
documentação histórica (PROJECT_BRAIN etc.), esta Constituição vence.

> Estes princípios só mudam por decisão explícita do Zé, registrada em ADR.

---

## Os 18 princípios

### 1. Código real + testes + schema + ADRs recentes vencem documentação antiga

Ao decidir o que é verdade sobre o sistema, a ordem de confiança é: código → testes → schema/
migrations/seeds → ADRs recentes → docs recentes → PROJECT_BRAIN (histórico). Divergência entre
doc e código é **reportada**, nunca "resolvida" mudando o código para casar com a doc.

### 2. Backend é autoritativo

Toda regra de negócio, validação semântica, autorização e integridade acontecem e são
**decididas no servidor** (ADR-002). O servidor nunca confia num valor calculado no cliente.

### 3. Cliente envia intenções

O frontend manda o que o usuário **quer fazer** (inputs crus / intenção), não decisões prontas.
Ex.: envia custo+margem+flag `auto`, não o preço final "já calculado" para ser gravado.

### 4. Toda decisão persistida é do servidor

Qualquer valor que vai para o banco e que resulta de uma regra é **recomputado no servidor**
antes de gravar (preço com `auto=true`, saldo, `computar`, `dataPagamento` — ADR-002/004).

### 5. Shared define contratos, tipos e regras puras

`@padaria/shared` é a fonte única de contratos zod, tipos e funções puras determinísticas
(preço, promoção, saldo, dinheiro). Front e servidor importam a **mesma** função — o servidor
a executa com autoridade; o cliente só para **preview** (ADR-003).

### 6. Frontend nunca é barreira única de segurança

Esconder botão/menu por permissão é UX, não segurança. A negação real é sempre no servidor
(default-deny global + guard por rota + escopo de empresa no WHERE). Uma tela nova nunca é a
única coisa que impede um acesso.

### 7. Banco garante integridade

Constraints, FKs, uniques, CHECKs, índices e triggers são a **última linha de defesa** — o banco
recusa estado inválido mesmo se a aplicação falhar. Toda invariante crítica tem constraint.

### 8. Dinheiro sempre em centavos

Toda aritmética monetária usa inteiros em centavos via `@padaria/shared/dinheiro`. Float não
entra no caminho do dinheiro (nem no servidor, nem no preview do front). Banco em `numeric`;
gravação via `centavosParaDecimalBanco`.

### 9. Caixa segue fórmula única

O saldo do caixa é calculado **exclusivamente** por `saldoCaixaCentavos` em
`shared/src/caixa/regras.ts`, executado pelo servidor (ADR-001). O fechamento/acerto existe só
por `caixaId` (o fluxo legado por empresa+data foi removido).

### 10. Nenhuma fórmula paralela de saldo

É proibido recriar cálculo de saldo em outro lugar (controller, repository, front, relatório).
Se um relatório precisar de agregação, ele reusa a regra do shared — não reimplementa.

### 11. Nenhuma feature nasce sem spec

Toda funcionalidade começa por `/spec`, que define objetivo, escopo, regra de negócio e —
obrigatoriamente — **onde a inteligência mora**. Sem isso, não há `/build`.

### 12. Nenhum build nasce sem spec aprovada

`/build` só roda sobre uma spec **aprovada explicitamente pelo Zé**. A aprovação da spec não é
autorização em branco para tocar banco/auth/dinheiro/caixa/infra — esses exigem OK item a item.

### 13. Toda entrega passa por review e QA

Fluxo mínimo: `/build` → `/review` (compara com a spec, veredito) → `/qa` (gates + relatório).
Nada é "pronto" sem os gates verdes (`check`, `lint`, `test`) e um veredito de review/QA.

### 14. Toda decisão arquitetural relevante vira ADR

Decisões sobre arquitetura, segurança, backend autoritativo, permissões, multiempresa, caixa,
dinheiro, banco, migrations, integrações, deploy ou fronteira front×back são registradas em
`docs/adr/` via `/adr`. Decisão não registrada não existe.

### 15. Fase 5 bloqueada até decisão de negócio

Novos módulos (Financeiro, Compras, Estoque, RH, Produção) **não começam** sem que as regras de
negócio sejam definidas com a equipe. Placeholders de menu não são funcionalidade.

### 16. Novos módulos só com regras aprovadas pela equipe

Antes de qualquer módulo novo: escopo (product-strategist) → arquitetura (solution-architect) →
fases (project-manager) → critério de teste (qa) — e aprovação do Zé/Luis nas regras de negócio.

### 17. PROJECT_BRAIN é histórico, não verdade absoluta

O acervo PROJECT_BRAIN foi escrito contra um repositório paralelo; serve para entender
intenções passadas, **nunca** como estado atual. Confirme tudo no código.

### 18. Não commitar/pushar sem autorização do Zé

Nenhum commit, push, merge, migration aplicada ou mudança de `.gitignore`/infra/CI acontece sem
autorização explícita. O trabalho fica no working tree até o Zé mandar commitar.

---

## Guardrails operacionais (derivados dos princípios)

Nenhum comando/agente altera **automaticamente**, sem OK explícito do Zé:
banco · migrations · seed · auth · permissões · dinheiro · caixa · multiempresa · integrações
(CREARE) · Docker · CI · produção.

Convenções de código (impostas por ferramenta — `scripts/verificar-*.mjs`,
`.dependency-cruiser.cjs`, ESLint):

- Domínio em **português**, código **sem acentos**.
- Camadas **controller → service → repository**; sem SQL cru na API; contratos no shared.
- `unknown` explícito apenas via alias `DadosExternos` (`shared/src/api`).
- Migrations só com `drizzle-kit generate` e ordem explícita; nunca `push` em produção.

---

## Como esta Constituição se relaciona com os outros documentos

- `docs/CLAUDE_WORKFLOW_PADARIA_V2.md` — **como** trabalhar (comandos, fluxo, gates).
- `docs/CLAUDE_CONTEXT_ORCHESTRATION.md` — **quem** trabalha (matriz agent/skill, contexto).
- `docs/adr/*` — decisões que detalham princípios (001 caixa, 002 backend autoritativo,
  003 shared isomórfico, 004 campos sensíveis).
- `docs/HANDOFF-CONTEXTO-COMPLETO.md` — **onde** o projeto está (estado acumulado).
