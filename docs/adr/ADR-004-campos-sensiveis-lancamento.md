# ADR-004 — Campos sensiveis de lancamento sao decisao de servidor

**Data:** 03/07/2026 · **Status:** Aceito (politica provisoria explicita)

## Problema

`computar` (movimento conta ou nao no saldo do caixa) e `dataPagamento` (marca despesa/
mercadoria/retirada como ja paga, tirando-a de contas a pagar pendentes) eram aceitos
verbatim do payload — vetor de desvio de caixa (computar:false) e de burla de contas a
pagar (dataPagamento na criacao).

## Decisao (implementada em `lancamentos.dominio.ts`)

- `resolverComputarLancamento`: cliente comum SEMPRE grava `computar=true`; marcar como
  nao-computavel exige `caixas_gerenciar`. Mercadorias mantem a regra propria de nota
  fiscal (`deveComputarMercadoria`) aplicada sobre o valor ja resolvido.
- `resolverDataPagamentoLancamento`: `dataPagamento` na criacao/edicao so e aceita com
  `caixas_gerenciar`; sem a permissao, o lancamento nasce pendente (null).

## Politica provisoria — MANTIDA por decisao do Ze (03/07/2026)

Decisao explicita: **manter a politica provisoria como esta** e revisitar **apos testes com
usuarios reais**, mudando as regras so se a operacao mostrar necessidade. `caixas_gerenciar` e
um proxy de "gerencia" ate o modulo Financeiro (Fase 5) definir permissoes proprias (ex.:
`contas_pagar_baixar`) e o fluxo formal de baixa (`POST /api/despesas/:id/baixa`). Gatilho de
reavaliacao: feedback de uso real ou inicio do modulo Financeiro. Ao criar o fluxo de baixa,
remover `dataPagamento` dos payloads de criacao/edicao.

## Consequencias

- Telas atuais continuam enviando os campos; o servidor decide (sem quebra de contrato).
- Testes de payload hostil em `tests/integration/operacoes/operacoes-campos-sensiveis.test.ts`.
