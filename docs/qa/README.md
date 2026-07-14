# docs/qa/ — Relatórios de QA

Relatórios gerados pelo comando `/qa <nome>` (ver `docs/CLAUDE_WORKFLOW_PADARIA_V2.md` §7).

**Convenção de nome:** `QA_<AAAA_MM_DD>_<nome-da-tarefa>.md` (ex.: `QA_2026_07_03_pagamento-parcial.md`).

**Cada relatório contém:**

- Comandos rodados e o **resultado real** (verde/vermelho + números de testes).
- Falhas encontradas, com a saída, classificadas por severidade.
- Cobertura da área e riscos remanescentes.
- Veredito: **LIBERADO / LIBERADO COM RESSALVAS / BLOQUEADO**.

O QA **não altera código** — se um gate falhar, o relatório aponta a causa e o fix sugerido
para o `/build` ou o `bug-fixer`. Gates padrão: `npm run check`, `npm run lint`, `npm test`,
`npm run test:unit`, `npm run knip`, e Docker/migrations quando aplicável.
