# Relatório de Vendas — reorganização visual

Data: 2026-10-02
Escopo: `web-vue/components/relatorios/`

## Entregue

- Painel de filtros permanente, separado em **Período**, **Identificação** e **Contexto e pagamento**.
- Todos os 12 filtros existentes foram preservados com os mesmos nomes de parâmetro, incluindo as combinações data+hora enviadas como `dataHoraInicio` e `dataHoraFim`.
- Resumo do resultado com quantidade, total recebido e quantidade de formas de pagamento. Os valores continuam vindo de `/api/relatorios/vendas/totais`, portanto não há nova fórmula no front-end.
- Lista de vendas com hierarquia de leitura: venda/data/hora, contexto, pagamentos, valor e as mesmas ações existentes (detalhes e comprovantes).
- Em até 768px a grade deixa de ser tabela e vira cartões, sem rolagem horizontal.
- O rodapé continua mostrando a composição por forma de pagamento; agora limita a visualização inicial a cinco formas e informa quantas adicionais existem, sem omitir dados da API ou alterar os totais.

## Estrutura

- `RelatorioVendasPage.vue`: estado, chamadas já existentes e diálogos.
- `RelatorioVendasFiltros.vue`: apresentação e emissão dos filtros.
- `RelatorioVendasLista.vue`: lista responsiva e ações por venda.
- `relatorio-vendas.ts`: tipo e fábrica de filtros vazios compartilhados.

## Não alterado

- APIs, payloads, paginação, ordenação no servidor, permissões, fórmulas financeiras e upload de comprovante.
- As rotas de detalhe e comprovante permanecem as mesmas.

## Verificação

- `git diff --check`: verde.
- `npm run check --workspace @padaria/web-vue` e uma tentativa direta de `vue-tsc` foram iniciados, mas o ambiente já mantinha processos de `nuxt typecheck` ativos por horas (PIDs 22316, 44412, 45300 e 45452), sem conclusão/output final. É necessário rodar o gate em ambiente sem esses processos concorrentes antes do merge.
