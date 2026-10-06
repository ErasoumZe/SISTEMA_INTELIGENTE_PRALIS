# Caixa aberto — resumo operacional limpo

## Entrega

- O resumo do caixa aberto deixou a grade de cards repetidos e passou a usar `CaixaResumoOperacao.vue`.
- O saldo físico do turno é a única faixa de destaque.
- Entradas, transferências, sangrias, despesas, mercadorias, retiradas e vendas canceladas são linhas compactas, com cor sólida própria e o mesmo clique de consulta que existia antes.
- As formas de pagamento também passaram para uma lista compacta, preservando total e quantidade de vendas.
- O atalho `Fechar caixa` continua apontando exclusivamente para a etapa de fechamento já separada por query. Nenhum ato de retorno/sangria ou fechamento foi reintroduzido na página aberta.

## Preservado

- Valores vêm das mesmas propriedades de `ResumoCaixa`; não há novo cálculo financeiro.
- Os eventos de detalhes continuam sendo `abrirUltimosLancamentos` e `modalVendasCanceladasAberto`.
- A consulta de conferência do malote continua disponível somente na linha de transferências.
- Não houve mudança de API, permissão, regra de saldo, status, migration ou dado histórico.

## Responsividade e tema

- Desktop: grade de duas áreas (movimentações e formas de pagamento).
- Até 900px: uma coluna; até 480px: linhas menores, sem overflow horizontal.
- Fundos, bordas e textos usam `--cx-*`; cores operacionais usam os tokens `--cat-*-faixa`, preservando contraste nos temas claro e escuro.

## Validação executada

- `git diff --check` sem apontamentos.
- Teste focado: `npm run test --workspace @padaria/web-vue -- CaixaResumoOperacao.test.ts`.
- `npm run check --workspace @padaria/web-vue` foi iniciado, mas há processos `nuxt typecheck` preexistentes e concorrentes na árvore; o gate completo deve ser consolidado pelo responsável da branch antes de merge.
