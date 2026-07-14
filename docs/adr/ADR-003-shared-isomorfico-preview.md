# ADR-003 — Shared isomorfico com autoridade de execucao no servidor

**Data:** 03/07/2026 · **Status:** Aceito

## Decisao

Regras puras e deterministicas (preco, promocao, descricao, saldo, dinheiro) vivem no
`@padaria/shared` e PODEM rodar no cliente — **exclusivamente como preview de UX**. E
proibido persistir resultado calculado no cliente: a mesma funcao do shared e executada
pelo servidor na escrita, e o valor do servidor e o que vale.

Split do shared por sigilo de formula (M5 da auditoria) foi avaliado e **rejeitado**:
sigilo nao e requisito do negocio; o risco real e manipulacao, tratado pela ADR-002.

## Consequencias

- Front e servidor importam a MESMA funcao (ex.: `calcularPrecoVenda`) — preview e valor
  gravado nunca divergem por formula.
- Schemas zod de response do shared que nao validam nada devem ser removidos ou passar a
  validar (pendencia registrada; knip acusa).
- O front deve migrar sua aritmetica monetaria para `shared/dinheiro` (M4).
