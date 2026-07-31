# Corujão v3 — inspeção humana de responsividade pendente

R-102 permanece ⚠️. Os breakpoints e proteções contra vazamento horizontal existem, mas isso não
substitui olhar cada fluxo nas quatro larguras. Esta lista considera as telas e superfícies visuais
tocadas desde o início do Corujão v2 (`4711d4b^`) até o fechamento do v3.

Em cada item, conferir **1440 / 1024 / 768 / 390 px**, incluindo abertura de modal, conteúdo longo,
teclado no celular e ausência de scroll horizontal.

| Conferir | Tela/fluxo | Rota ou acesso principal | Pontos críticos |
| --- | --- | --- | --- |
| ☐ | Login, recuperação de senha e erro global | `/login`, `/forgot-password`, tela de erro | marca, formulário, mensagens e botão de acesso |
| ☐ | Shell, navegação e menu “+ Novo” | `/` e menu lateral | drawer, cabeçalho, troca de empresa e diálogo de confirmação |
| ☐ | Caixa: abertura e resumo | `/caixa` | grade de abertura, categorias, totais e ações de fechamento |
| ☐ | Histórico e detalhe de caixas | `/historico_caixas` | marca “alterado após o fechamento”, tabelas e detalhe |
| ☐ | Pendências/notificações | `/pendencias` | lista, valores, verificação e textos longos |
| ☐ | Transferências | `/transferencias` e “+ Novo” | modal, múltiplos destinos, prazo e retorno/sangria expandido |
| ☐ | Despesa, mercadoria e retirada | `/despesas`, `/mercadorias`, `/retiradas` e “+ Novo” | modal único, fotos, recorrência e discriminação larga |
| ☐ | Entradas e detalhe da venda | `/entradas` | tabela paginada, pagamentos e itens da venda |
| ☐ | Contas a pagar e painéis financeiros | `/contas_pagar`, telas de operações/tesouraria | filtros, aprovação, botões por permissão e tabelas |
| ☐ | Cadastros tabulares | `/clientes`, `/fornecedores`, `/produtos`, `/colaboradores`, `/pdv`, `/turnos`, `/formas_pagamento`, `/unidades` | tabela, paginação e formulário de edição |
| ☐ | Contas e usuários vinculados | `/contas`, `/usuarios` | fundo, saldo, checkboxes de contas e edição persistida |
| ☐ | Áreas, setores e grupos | `/areas_setores`, `/grupos` | árvore, níveis aninhados e formulários |
| ☐ | Empresas, sócios/gestores e maquininhas | `/empresas`, `/socios_gestores`, `/maquininhas` | formulários secundários e seleção de empresa |
| ☐ | Permissões | `/permissoes` | grade operacional em cartões no celular e módulos sem duplicidade |
| ☐ | Integrações, pedidos e notas fiscais | `/integracoes`, `/pedidos`, `/notas_fiscais` | tabelas, ações, estados vazios e mensagens antigas acentuadas |
| ☐ | Relatórios | `/relatorio_produtos`, `/relatorio_vendas` | filtros, tabelas, comprovantes e totais |

Só alterar R-102 para ✅ depois da conferência visual dos 16 itens nas quatro larguras.
