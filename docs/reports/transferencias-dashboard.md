# Entrega — Transferências como painel de tesouraria

Data: 2026-10-02
Branch: `feat/caixa-ux-clean`

## Escopo entregue

- A rota mantém a mesma API, status, permissões, ações de conferir/editar/cancelar e cálculos financeiros.
- A criação deixou de aparecer no cabeçalho e no estado vazio: o único ponto de criação é o `+ Novo` global.
- O painel foi dividido em três componentes:
  - `TransferenciasResumoCards.vue`: Saídas, Entradas e Saldo, explicitamente rotulados **Nesta página** para não aparentarem ser totais de um período paginado.
  - `TransferenciasFiltros.vue`: Status, intervalo de datas e PDV sempre visíveis; Criado por, origem, destino e lacre no mesmo painel expansível; filtros aplicados ficam em chips removíveis.
  - `TransferenciasLista.vue`: tabela compacta no desktop e cartões reais no mobile, sem rolagem horizontal.
- A referência visual foi usada como linguagem, não como cópia: superfície neutra, informação primária em cada linha, ações discretas e filtro contextual.

## Não alterado

- Endpoints, payloads, fórmula de entrada/saída/saldo, semântica de status, permissões e regras de conferência.
- Não houve migration, alteração de dados ou deploy.

## Validação

- `npm run check --workspace @padaria/web-vue` — passou.
- `TesourariaCockpit.test.ts` — 3 testes passaram com pool `threads`/1 worker.
- `TransferenciasFiltros.test.ts` — 2 testes passaram com pool `threads`/1 worker.
