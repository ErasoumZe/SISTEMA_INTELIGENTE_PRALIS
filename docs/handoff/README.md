# docs/handoff/ — Transferências de contexto

Handoffs incrementais gerados pelo comando `/handoff <nome>` (ver
`docs/CLAUDE_WORKFLOW_PADARIA_V2.md` §8).

**Convenção de nome:** `HANDOFF_<AAAA_MM_DD>_<nome-do-marco>.md`
(ex.: `HANDOFF_2026_07_03_fase4-produtos.md`).

**Relação com o handoff-mestre:** `docs/HANDOFF-CONTEXTO-COMPLETO.md` é o handoff **acumulado**
(estado completo do projeto, lido primeiro ao retomar). Os arquivos aqui são os handoffs
**incrementais** de cada marco/sessão. Marcos grandes atualizam também o mestre e a memória do
projeto.

**Cada handoff contém:** objetivo, contexto (fase atual), o que foi feito (commits com porquê),
arquivos alterados, decisões/ADRs, pendências (e de quem dependem), riscos, como rodar/testar,
rollback e próximo passo. Baseado no estado real do git — não em memória.
