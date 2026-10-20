# 53 — Reestruturação de Compras: contrato e Fase 1

> Decisões de José e Rodrigo consolidadas em 20/10/2026 a partir dos manuscritos. Este documento
> substitui os bloqueios correspondentes do documento 48. A implementação é aditiva: o fluxo legado
> continua legível e nenhuma publicação em produção está autorizada por este registro.

## Fluxo-alvo

`Necessidade de compra → rodada de cotação multi-fornecedor → compra por fornecedor → separação → recebimento/NF → estoque e financeiro`.

- A solicitação nasce sem fornecedor e a rodada pode convidar vários fornecedores.
- Cada item pode ter um vencedor diferente. Uma compra já realizada nunca é substituída por resposta tardia.
- A resposta do fornecedor compra automaticamente somente itens ainda livres cujo custo final seja menor
  ou igual ao preço-base. Sem base ou acima dela, exige decisão manual.
- Quantidade solicitada fica bloqueada após o envio. Produto por peso recebe quantidade efetiva na
  separação e tolerância configurável de 0% a 30%; fora da faixa exige aprovação.
- Compra automática cria pedido ao fornecedor, nunca pagamento. Cada NF conferida cria seu próprio
  lançamento financeiro, protegido contra duplicidade.

## Preço-base

- A carga inicial acontece uma única vez a partir da coluna `ÚLTIMO MENOR CUSTO`.
- O pareamento usa código/EAN e, como fallback, descrição normalizada.
- A análise é gravada separadamente da aplicação. Ambiguidades e produtos não encontrados bloqueiam a
  aplicação; não existe gravação silenciosa por aproximação.
- Ao fechar uma rodada, a base vigente passa a ser o menor custo final válido daquela rodada e pode subir
  ou cair. O histórico temporal nunca é apagado.

## Catálogo fornecedor–produto

- Compras pode cadastrar e aprovar o vínculo diretamente.
- Produto sugerido pelo fornecedor nasce pendente e só se torna utilizável após aprovação de Compras.
- Toda mudança de estado gera evento imutável com ator, data, preço ofertado e observação.

## Agenda e conferência

- A recorrência segue série de calendário no modelo Apple: diária, semanal por dias, mensal por dia ou
  posição, anual, intervalo e término por data ou quantidade.
- Cada ocorrência cria somente uma tarefa de revisão. Nunca compra, envia cotação ou altera estoque.
- Conferência admite salvamento parcial, recontagem cega por outra pessoa e ajuste pendente. Somente a
  aprovação de Compras, Gerência ou Admin movimenta estoque.

## Fase 1 implementada localmente

Migration `0060_peaceful_tarantula.sql`:

- reforça grupo/subgrupo e produto no escopo da mesma empresa;
- adiciona fuso e prazo padrão de cotação à empresa;
- adiciona WhatsApp ao perfil do usuário;
- adiciona produto de quantidade variável e tolerância de 0% a 30%;
- cria catálogo fornecedor–produto e eventos;
- cria análise de importação e histórico temporal de preço-base.

Aplicação:

- campos novos em Empresa, Usuário e Produto;
- painel da fundação dentro de Pedidos, atrás de permissões específicas;
- upload `.xlsx` em memória, sem arquivo temporário nem nova dependência;
- análise, relatório e aplicação transacional única da base inicial;
- rotas protegidas no backend e isoladas por empresa.

Estado: implementado e testado localmente. Não mergeado, não publicado e não homologado em produção.
