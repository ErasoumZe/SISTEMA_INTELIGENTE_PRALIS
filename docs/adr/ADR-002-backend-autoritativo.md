# ADR-002 — Backend autoritativo (regra oficial de distribuicao da inteligencia)

**Data:** 03/07/2026 · **Status:** Aceito (decisao do Ze, 02/07) · **Contexto completo:** `docs/ARQUITETURA-OFICIAL-INTELIGENCIA.md`

## Decisao

> **O cliente envia intencoes. Toda decisao persistida e do servidor. O shared define as
> formulas e contratos; o servidor as executa com autoridade; o cliente pode executa-las
> apenas como preview.**

Filosofia herdada do Pralis, corrigida: no Pralis o preco nunca era persistido (derivado na
exibicao); no Padaria v2 valores derivados SAO persistidos — logo o servidor RECOMPUTA na
escrita, nunca confiando em resultado calculado no cliente.

## Consequencias

- Preco de venda de produto: recalculado no servidor ao salvar quando `auto=true`
  (`api/src/produtos/produtos.service.ts`); valor do cliente ignorado. Manual (`auto=false`)
  aceito como intencao legitima.
- Campos sensiveis de lancamento (`computar`, `dataPagamento`): decisao de servidor (ADR-004).
- Todo PR de feature nova responde ao checklist da secao 11 de
  `ARQUITETURA-OFICIAL-INTELIGENCIA.md` (qual intencao o cliente envia; o que o servidor
  recomputa; teste de payload hostil obrigatorio).
- Gabarito de referencia: fechamento de caixa (ADR-001) — formula no shared, execucao
  exclusiva do servidor em centavos.

## Rollback

Reverter os commits de M1/M2; a regra em si e organizacional e nao tem rollback tecnico.
