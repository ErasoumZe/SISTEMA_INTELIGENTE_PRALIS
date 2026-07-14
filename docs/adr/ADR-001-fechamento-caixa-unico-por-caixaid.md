# ADR-001 — Fechamento de caixa unico por caixaId

**Data:** 02/07/2026 · **Status:** Aceito · **Decisores:** Ze (aprovacao), Luis (regra de dominio), equipe de engenharia

## Contexto

O sistema herdou dois fluxos de fechamento/acerto de caixa:

1. **Operacional por `caixaId`** — caixa por PDV+usuario, formula completa, efeitos completos em transacao. Usado pelas telas atuais do web-vue.
2. **Legado por empresa+data** — `GET /api/fechamento-caixa/resumo` e `POST /api/fechamento-caixa/acertar-saldo`.

## Problema

Os dois fluxos davam resultados diferentes para o mesmo periodo:

- O legado somava movimentos **cancelados** e com `computar=false`; nao considerava **mercadorias**; subtraia **todas** as transferencias (inclusive as de entrada, que deveriam somar); com filtro de colaborador, ignorava transferencias por completo.
- O acerto legado gravava **apenas a despesa** ("Quebra de caixa"), **sem** `caixa_id`, sem item, **sem debito do colaborador** e sem registro em `ajustes_fechamento_caixa` — alem de aceitar o valor do cliente sem recalculo.
- Por nao ter `caixa_id`, a despesa do acerto legado **nao zerava o saldo do caixa** — reintroduzindo o bug historico ja corrigido no fluxo operacional (despesa criada sem vinculo impedia o fechamento).

## Decisao

**Remover completamente o fluxo legado** e consolidar o fechamento/acerto no fluxo operacional por `caixaId`, unica implementacao da regra oficial.

Verificacao previa (02/07/2026): **zero consumidores reais** — nenhuma chamada no web-vue (as telas usam `/api/caixa/:id/...`), nenhuma em integracoes/scripts, sistema **sem deploy em producao**. Unicos usos: 2 testes de integracao (substituidos por equivalentes operacionais no commit anterior a remocao) e documentacao historica.

## Formula oficial de saldo (confirmada pelo Luis)

```
saldo = entradas/vendas
      + transferencias de ENTRADA para a conta do PDV do caixa
      - retiradas
      - despesas
      - transferencias de SAIDA da conta do PDV do caixa
```

Consideram-se apenas movimentos do caixa (`caixa_id`) com `computar = true` e `status != 'cancelado'`.

**Mercadorias entram na formula — CONFIRMADO pelo Ze (03/07/2026):** **mercadorias** lancadas no caixa subtraem do saldo — sao compras pagas com dinheiro da gaveta, analogas a despesas. Ja e o comportamento implementado em `saldoCaixaCentavos` (`shared/src/caixa/regras.ts`); esta decisao apenas oficializa a extensao. A formula completa e:

```
saldo = entradas + transf. entrada - retiradas - despesas - transf. saida - mercadorias
```

## Regra oficial de acerto (quando ha diferenca)

Em transacao unica: despesa "Diferenca de caixa" **pendente** (`data_pagamento IS NULL`) vinculada ao colaborador e ao caixa (`caixa_id`) + item em `despesas_itens` + debito do colaborador com **tipo `FECHAMENTO_CAIXA`** + registro em `ajustes_fechamento_caixa`. Nota de modelagem: o "tipo fechamento_caixa" vive no **debito do colaborador** (a tabela `despesas` nao tem coluna tipo). A despesa entra no proprio caixa e zera o saldo, liberando o fechamento.

## Consequencias

- A permissao `fechamento_com_diferenca_visualizar` deixa de guardar endpoints proprios; permanece como gate da tela `fechamento` (que usa o fluxo operacional). Renomear/reorganizar e decisao de produto futura.
- Vendas ingeridas pela integracao CREARE tem `caixa_id NULL` e **nao aparecem** em nenhum resumo por caixa. Um **relatorio de conferencia diaria** (empresa x CREARE) fica registrado como feature futura do modulo Relatorios/Financeiro — nao e papel do fechamento de caixa.
- Schemas removidos do shared: `resumoCaixaQuerySchema`, `ajusteSaldoSchema`, `ajusteSaldoResponseSchema` (+ tipos).
- O grupo de despesa "Quebra de caixa" continua existindo (o acerto operacional o utiliza via `buscarGrupoQuebraCaixa`).

## Rollback

A remocao e um commit atomico — `git revert` restaura endpoints, service, repository, regras e schemas de uma vez. Os testes equivalentes foram commitados separadamente (antes) e nao precisam ser revertidos.

## Impacto futuro

- Consolidacao monetaria (mesma T2): formula centralizada em `shared/src/caixa` com aritmetica em **centavos inteiros** — passo seguinte a esta remocao.
- Qualquer necessidade futura de "resumo do dia da empresa" deve nascer como rollup dos caixas do dia sobre a regra operacional (feature de relatorio), nunca como formula paralela.
