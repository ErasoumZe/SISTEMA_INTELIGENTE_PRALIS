# Integração de admissões na `main`

**Data:** 24/09/2026  
**Branch de integração:** `integrate/admissoes-main-20260923`  
**Base:** `origin/main` em `b238322`  
**Fonte incorporada:** `feat/admissoes-testes-tnp` em `9fe9f7f`

## Objetivo

Levar para o tronco principal o cadastro de colaborador e o fluxo de admissões já construídos
(período de teste, processo, convite, ficha pública, dependentes, revisão do DP, fila, turnos e
funções operacionais), preservando as verticais do Caixa e os contratos que já estavam na `main`.

## Decisão de migrations

A `main` tinha as migrations `0000` a `0041` quando a integração começou, mas recebeu as migrations
`0042` a `0047` do Caixa antes do fechamento. A branch de admissões também usava os números `0034`
a `0040`; renumerar snapshots antigos criaria uma sequência falsa e poderia divergir do banco. Por
isso o schema final combinado foi regenerado como uma única migration nova, `0048_overjoyed_pride.sql`,
com snapshot e journal correspondentes, depois das seis migrations do Caixa.

Essa migration contém as tabelas e índices de admissões, o catálogo de funções, os campos e regras
de turno e os seis triggers manuais de `atualizado_em`. A unicidade composta de `turnos (id,
empresa_id)` é criada antes da FK que a referencia. A migration só deve ser aplicada em banco
persistente após revisão e preflight explícitos; durante esta integração, apenas containers
descartáveis podem ser usados.

## O que foi preservado

- Caixa, mensagens, campanhas, produtos e demais verticais da `origin/main`.
- Permissões de Tesouraria e regras de limpeza/contas do seed da `main`.
- E2E existentes da `main`; o Playwright mantém projetos para Caixa, usuários/menu, produtos e
  admissões/funções.
- `TesteFormDialog.vue`, `PROJECT_BRAIN/32_ROBO_CARTOGRAFO_PLANILHAS.md` e
  `PROJECT_BRAIN/panilhas/` permanecem fora da integração quando não pertencem a este worktree.

## Estado e limites

- Nenhum banco persistente, Supabase, Coolify, produção ou volume do Caixa foi tocado.
- Nenhum push, PR, merge remoto ou deploy faz parte da integração local até os gates fecharem.
- Os documentos 35–45 registram a história das verticais de admissões; este documento é a camada de
  integração na `main` e corrige a leitura dos números de migration: os artefatos ativos no tronco
  são os `0000–0047` originais mais o `0048` consolidado.
- O próximo trabalho pode partir da `main` para ponto, efetivação, documentos, importação e
  Conplus, sem voltar para a branch histórica.

## Gates de fechamento

Executar antes de atualizar a `main`: `npm run check`, `npm run lint`, `git diff --check`, testes
unitários, integração proporcional (admissões + migrations + segurança) e a lista E2E. O resultado,
o commit final e qualquer pendência operacional devem ser registrados no checkpoint do segundo
cérebro, sem segredos ou PII.
