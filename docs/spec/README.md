# docs/spec/ — Especificações

Specs geradas pelo comando `/spec <nome>` (ver `docs/CLAUDE_WORKFLOW_PADARIA_V2.md` §4).

**Convenção de nome:** `SPEC_<AAAA_MM_DD>_<nome>.md` (ex.: `SPEC_2026_07_03_pagamento-parcial.md`).

**Toda spec é bloqueante para o `/build`:** precisa definir objetivo, escopo/fora-de-escopo,
regra de negócio, **onde a inteligência mora** (que intenção o cliente envia × o que o servidor
recomputa — ADR-002), segurança, permissões, multiempresa, banco/migrations, dinheiro/caixa,
frontend/backend/shared, testes (incl. payload hostil), rollback, necessidade de ADR e critérios
de aceite. `/build` só roda sobre spec **aprovada explicitamente pelo Zé**.
