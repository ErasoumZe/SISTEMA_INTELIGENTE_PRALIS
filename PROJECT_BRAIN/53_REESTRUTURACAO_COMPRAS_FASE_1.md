# 53 — Reestruturação de Compras: contrato e Fase 1

> Decisões de José e Rodrigo consolidadas em 20/10/2026 a partir dos manuscritos. Este documento
> substitui os bloqueios correspondentes do documento 48. A implementação é aditiva: o fluxo legado
> continua legível e nenhuma publicação em produção está autorizada por este registro.

## Fluxo-alvo

`Necessidade de compra → rodada de cotação multi-fornecedor → compra por fornecedor → separação → recebimento/NF → estoque e financeiro`.

- A solicitação nasce sem fornecedor e a rodada pode convidar vários fornecedores.
- Ao enviar a cotação, Compras usa um seletor múltiplo. O sistema sugere os fornecedores com vínculo
  aprovado no catálogo, mas o comprador pode pesquisar e selecionar qualquer fornecedor ativo da
  empresa, mesmo sem vínculo prévio com os produtos. A inclusão manual não aprova silenciosamente um
  vínculo no catálogo: o comprador define quais itens aquele fornecedor receberá naquela rodada.
- Se o fornecedor ainda não existir, o próprio seletor oferece cadastro rápido de nome e WhatsApp. Ao
  salvar, o fornecedor é persistido no cadastro geral e já fica selecionado, sem tirar o comprador da
  cotação. O WhatsApp continua obrigatório para que o convite possa ser enviado.
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

Migration `0061_naive_moondragon.sql` (renumerada de `0060` em 20/10/2026 ao integrar a `main`, que
já tinha a própria `0060_ajustes_contas`; o SQL aprovado é o mesmo, só mudou o número e a posição,
que agora é depois da `0060` da main):

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

## Endurecimento da Fase 1 (20/10/2026)

Revisão read-only em sete frentes (domínio, backend, segurança, front, QA, arquitetura) encontrou
defeitos na Fase 1 que não dependiam de nova regra nem de migration. Todos corrigidos nesta rodada,
sem alterar o DDL da migration (que depois foi só renumerada de `0060` para `0061`):

**Campo que aparecia e não salvava (DoD item 2).** A grade de cadastro projetava apenas `id`, `nome`
e `cnpj` da empresa, e nenhum `whatsapp` do usuário. Como o formulário de edição é montado da linha
da grade, qualquer edição seguinte — mesmo só corrigir o nome — reenviava `fusoHorario` no default e
`comprasPrazoRespostaHoras`/`whatsapp` nulos, apagando o que havia sido gravado. Fechado com projeção
na grade, gravação no cache local e testes de fio ponta a ponta para Empresa e Usuário.

**Permissões novas invisíveis na tela.** `compras_catalogo_gerir` e `compras_preco_base_importar`
não pertenciam a nenhuma seção do mapa de permissões do front: existiam no catálogo e nos cargos de
referência, mas não apareciam na tela de Permissões, então ninguém podia concedê-las pela interface.
Dois testes do projeto já estavam vermelhos por isso desde a entrega da Fase 1.

**Leitura de planilha exposta a upload.** O leitor `.xlsx` foi escrito para seeding e passou a receber
arquivo de usuário autenticado. Recebeu teto de inflação por entrada e agregado, teto de linhas e de
colunas, limite de abas, memoização das entradas, guardas de deslocamento, remoção de caracteres de
controle e conversão de arquivo inválido em erro de validação. Antes, um arquivo de poucos KB podia
derrubar o processo da API (e com ele o Caixa da padaria) por consumo de memória, e um `.xls`
renomeado respondia 500.

**Volume.** A análise gravava todos os itens num `INSERT` único: acima de ~6.550 linhas estourava o
limite de parâmetros do Postgres, embora o contrato aceite 50.000. Passou a gravar em lotes, na mesma
transação. A listagem de preços-base e o detalhe da importação ganharam teto de linhas e filtro no
servidor; a aba de preço-base deixou de carregar junto com a tela de Pedidos.

**Produto repetido na planilha.** Duas linhas apontando para o mesmo produto passavam como duas
correspondências e a aplicação tentava gravar dois preços vigentes, violando o índice único e
respondendo 500. Agora viram ambiguidade, com as linhas nomeadas, e a importação pede correção em vez
de escolher um custo por conta própria.

**Relatório de pendências.** A tela mostrava só as contagens e desabilitava o botão Aplicar, sem dizer
quais linhas estavam erradas — e a carga inicial é ato único. O endpoint de detalhe já existia e não
era consumido; agora há diálogo com linha, código, descrição, custo e motivo.

**Concorrência.** A aplicação passou a serializar por empresa com trava de transação, porque a regra
"uma única vez por empresa" depende do conjunto e não da linha. As duas pré-checagens de duplicidade
passaram a devolver 409 em vez de 500 quando perdem a corrida.

**Contratos.** WhatsApp de usuário e fuso da empresa passaram a ser validados no contrato
compartilhado; antes qualquer texto passava e o CHECK do banco respondia 500 sem explicar o erro.

## Decisões tomadas em 20/10/2026 (José aprovou a execução; recomendações do time)

| Pergunta                                             | Decisão                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `"1,250"` na coluna de custo                         | **R$ 1,25** (José). A planilha é pt-BR e a vírgula é decimal. R-220.                                                                        |
| Custo `0`                                            | Não é base válida: a linha vira pendência. Base zero reprovaria toda compra automática da R-218, e em silêncio.                             |
| Produto inativo no pareamento                        | Fora. Dar preço-base a item descontinuado é ruído, e inativo com a mesma descrição do ativo criava ambiguidade sem solução para o operador. |
| Análise com pendência presa pelo hash                | Criada a ação **Descartar**, que apaga a análise não aplicada e libera o arquivo para reenvio. Análise já aplicada nunca é apagada.         |
| Transição do catálogo                                | Revisão continua livre (o histórico está nos eventos), mas decisão que não muda nada é recusada com 409. `aprovado_por` só na aprovação.    |
| `compras_preco_base_importar` com Gerência e Compras | Mantido: os dois cargos compram de verdade.                                                                                                 |
| Teto de 50.000 linhas por importação                 | Mantido, agora com `INSERT` em lotes. O número real da planilha do Rodrigo só ajustaria o teto para baixo, e nada depende disso hoje.       |
| Tolerância em produto que não é por peso             | Recusada no contrato, em vez de descartada em silêncio; a tela limpa o campo ao desligar "vendido por peso".                                |
| Número da linha nas mensagens de erro                | Passa a vir do atributo `r` da planilha. Contado por posição, apontava a linha errada sempre que o Excel omitia uma linha vazia.            |

## Decisões que a Fase 2 exigia (todas fechadas em 20/10/2026)

As dez perguntas que este documento listava como ausentes ou em conflito foram decididas por José em
20/10/2026 e viraram a regra **R-221** (documento 19) e o contrato completo no **documento 54**. Em
resumo: a compra automática é pré-autorização pelo preço-base (revoga parcialmente a R-216); o pedido
manual vira rodada de um fornecedor (fecha a regra-mãe); prazo em horas por empresa com fallback de 2
dias úteis; fuso da empresa só em Compras; frete rateado só sobre os itens livres; fechamento no
vencimento com fila de decisão; contraproposta versionada; o fornecedor vê só o próprio último valor;
separação e recebimento são números distintos; permissões reusam `pedidos_criar`/`pedidos_editar` mais
`compras_excecao_aprovar`; fornecedor ganha situação ativo/inativo. Nada da Fase 2 foi implementado
ainda: cada migration continua sendo um gate de SQL aprovado antes do arquivo.
