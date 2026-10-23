# 71 — Auditoria de menu e permissões (19/10/2026)

## Evidências confirmadas

- A categoria `lancamentos` representa Despesas, Mercadorias e Retiradas. O editor contava os filhos como fora de seção apesar de já estarem agrupados.
- `conferencias_estoque` possui tela, rota e permissão, mas faltava no catálogo Zod configurável; por isso não podia ser persistida no menu personalizado.
- Ocultar `lancamentos` no editor não ocultava seu submenu no drawer.

## Proteções verificadas

- `PUT /api/menu-empresa` exige `cadastro_permissoes_editar` e valida escopo de empresa.
- Menu é só navegação: permissões continuam filtrando telas, rotas e APIs.

## Próximas PRs

1. Fazer a prévia de permissões respeitar a estrutura personalizada da empresa.
2. Decidir, tela a tela, se as 12 telas bloqueadas no drawer saem do editor ou voltam a ser navegáveis.
3. Consolidar a matriz de telas, seed de perfis e permissões, sem alterar grants sem regra aprovada.
