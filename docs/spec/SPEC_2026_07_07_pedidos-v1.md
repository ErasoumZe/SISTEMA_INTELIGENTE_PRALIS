# SPEC — Módulo de Pedidos (compra/reposição de estoque) V1

**Data:** 2026-07-07 · **Status:** V1 em andamento — fundação entregue (sem migration/commit)
**Origem:** pedido do Zé/Luis (07/07) — setor de compras faz pedidos para repor estoque.

## Objetivo

Permitir que o **comprador** gere e gerencie pedidos de reposição de estoque:

- **Manual**: monta os itens na mão.
- **Automático**: quando um produto atinge o **estoque mínimo**, gera um pedido com a quantidade
  que **enche até o estoque máximo** (`max − atual`).
- Alguns produtos são pedidos por **data/hora** (agendamento).
- O comprador **confere, edita e aprova**.

## O que JÁ existe no código (reaproveitado)

- Produtos têm `quantidade_estoque`, `estoque_min`, `estoque_max` (nullable). A regra usa isso.
- Tela stub `pedidos` (menu, permissão `pedidos_visualizar`) e o carregamento de dados já preveem
  "pedidos" junto de mercadorias (grupos/fornecedores/unidades/produtos).

## Entregue nesta fundação (testável AGORA, sem migration)

- `shared/src/pedidos/index.ts`: contratos zod (`pedidoPayloadSchema`, `pedidoEdicaoPayloadSchema`,
  `gerarPedidoAutomaticoPayloadSchema`, tipos/status) + a **regra PURA** `gerarItensReposicao`.
- **Regra automática (pura, testada 6/6):** para cada produto com min/max definido e
  `quantidadeEstoque ≤ estoqueMin`, sugere `estoqueMax − quantidadeEstoque`. Ignora sem min/max,
  acima do mínimo, ou sugestão ≤ 0. (`tests/unit/pedidos-reposicao.test.ts`)

## Plano de V1 (a construir após seu OK — precisa de migration)

### Dados (novas tabelas — MIGRATION, precisa da sua ordem explícita)

- `pedidos`: id, empresa_id, tipo (`manual`|`automatico`), status (`rascunho`|`aprovado`|
  `cancelado`), fornecedor_id (nullable), data_agendada (timestamptz, nullable), observacao,
  criado_por, aprovado_por, aprovado_em, timestamps.
- `pedidos_itens`: id, pedido_id, produto_id, quantidade; + snapshot no momento da geração
  (estoque_atual, estoque_min, estoque_max) para auditoria.

### Backend (api/src/pedidos/)

- `GET /api/pedidos?empresaId=` — lista (com filtro por status).
- `GET /api/pedidos/:id` — detalhe com itens.
- `POST /api/pedidos` — cria manual (status rascunho).
- `POST /api/pedidos/gerar-automatico` — lê produtos no mínimo, aplica `gerarItensReposicao`,
  cria um pedido rascunho automático.
- `PUT /api/pedidos/:id` — edita itens/quantidades enquanto rascunho.
- `POST /api/pedidos/:id/aprovar` — aprova (rascunho → aprovado).
- (V2: baixa/recebimento que soma ao estoque; recorrência do agendamento.)

### Frontend

- Tela Pedidos: lista + botão "Gerar automático" + editar itens + aprovar. (Wire na app.)

### Testes

- Unit: regra de reposição (feito). Integração: gerar-automatico cria pedido com os produtos
  certos; aprovar muda status; editar só em rascunho; multiempresa/permissão.

## Decisões que preciso de você antes de construir o resto

1. **Migration**: OK gerar as tabelas `pedidos`/`pedidos_itens` (drizzle-kit generate) e aplicar
   no seu banco de dev? (a suíte de migrações valida a contagem do journal — atualizo o teste junto.)
2. **Nome/escopo**: é **compra/reposição** (fornecedor) — confirmo? (o nome "pedido de produção"
   sugeria produção interna; a descrição é de compras.)
3. **Permissões**: hoje só existe `pedidos_visualizar`. V1 usa ela para tudo, ou já crio
   `pedidos_criar`/`pedidos_editar`/`pedidos_aprovar` (mexe no enum de permissões + seed)?
4. **Agendamento "por data e hora"**: é uma data única por pedido (V1) ou recorrência por produto
   (ex.: "toda terça")? V1 assume **data única** no pedido.
5. **Fornecedor**: um pedido é de **um** fornecedor, ou pode misturar produtos de vários? V1 assume
   fornecedor opcional no cabeçalho (misto permitido).

## Restrições respeitadas

Domínio em português, código sem acento; nada commitado; sem migration sem sua ordem; regra de
negócio isolada e pura (testável); reaproveita `estoque_min/max` já existentes.
