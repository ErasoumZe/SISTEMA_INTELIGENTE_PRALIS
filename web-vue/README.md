# Organizacao do web-vue

## Rotas

`pages/` contem as telas navegaveis reais do Nuxt. Cada rota de negocio deve ter arquivo proprio:

- `entradas.vue`
- `transferencias.vue`
- `despesas.vue`
- `mercadorias.vue`
- `retiradas.vue`
- `caixa.vue`
- `fechamento.vue`
- `clientes.vue`
- `produtos.vue`
- `usuarios.vue`
- demais telas do menu.

Nao criar wrappers genericos como `TelaOperacoes.vue` ou `TelaCadastro.vue`. Se a rota aparece no menu, ela fica em `pages/` com nome proprio.

`pages/[tela].vue` existe apenas como fallback para telas ainda nao implementadas.

## Casca da aplicacao

`components/app/` contem a estrutura comum da aplicacao autenticada:

- `AppShell.vue`: layout, menu lateral, topbar e navbar.
- `AppWorkspace.vue`: carrega sessao, empresa ativa, estado compartilhado e expõe esse contexto para as telas.

## Componentes por dominio

- `components/cadastros/`: tabelas e arvores de cadastro.
- `components/caixa/`: componentes de caixa e fechamento.
- `components/financeiro/`: operacoes e contas a pagar.
- `components/relatorios/`: relatorios.
- `components/workspace/`: modais e contexto compartilhados pelo workspace.
- `components/comum/`: componentes genericos pequenos.

## Regras compartilhadas

- Permissoes do front ficam em `composables/usePermissoes.ts`.
- Formatacao e mascaras ficam em `utils/formatacao.ts`.
- Preparacao de dados de cadastro fica em `composables/useCadastroView.ts`.
