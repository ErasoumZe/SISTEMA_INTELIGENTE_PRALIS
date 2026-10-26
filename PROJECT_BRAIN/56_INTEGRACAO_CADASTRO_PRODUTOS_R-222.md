# 56 · Integração do Cadastro de Produtos em uso nas lojas

**Regra de produto:** R-222 (José, 26/10/2026). **Branch de trabalho:** `feat/cadastro-produtos-integracao`.

## Decisão e fonte

O app Cadastro de Produtos em uso nas lojas é a fonte autoritativa de comportamento e dados, incluindo
fiscal e código interno. O ERP atual contém uma versão anterior. A integração deve trazer a paridade
funcional e o catálogo para o monorepo, adaptando identidade, empresas, permissões, persistência e
integrações ao desenho do ERP. Este app continua em uso até a paridade ser entregue e validada.

Fonte de código inspecionada: `C:\Users\José\Desktop\Cicluz\CADASTRO DE PRODUTOS\pralis`,
`origin/main` do repositório `SISTEMA_PRALIS`, commit `1ba6774`. O checkout local estava na branch
`fix/creare-planilha-confiavel`, 221 commits atrás e 6 à frente; por isso não foi usado como versão
canônica. O SHA efetivamente implantado no Coolify ainda precisa ser confirmado antes da carga real.

O checklist versionado da origem reporta 4.178 produtos; 3.389 sem NCM/CST, 178 “A CLASSIFICAR”,
4 códigos de barras conflitantes e 176 grupos divergentes. Esses números são referência do checklist,
não contagem atual do banco; dry-run deverá recalculá-los. Código fiscal ausente não será inferido.

## Regras já confirmadas

- **Código interno:** gerar a partir do maior código de produto numérico mais um; piso histórico `13129`
  (primeiro novo `13130`); ignorar códigos `>= 700000` (entrega/equipamento/embalagem); completar com
  zeros até cinco dígitos sem truncar códigos maiores. Cópias entre lojas preservam o código de origem
  se ele não conflitar na loja de destino.
- **Fiscal:** trazer valores existentes literalmente, incluindo NCM, CEST, categoria fiscal, CST
  PIS/COFINS e alíquotas. Null/ausente permanece null e gera pendência; não inferir por descrição,
  EAN, grupo ou produto parecido.
- **Segurança da carga:** não apagar catálogo existente. Não renumerar códigos existentes. Importação
  deve ser idempotente e auditável, com dry-run, contagem, amostra, relatório de colisões e caminho de
  reversão. Carga real/migration exige mostrar SQL, contagem e amostra e obter autorização específica.
- **Ação de zerar catálogo:** a origem possui fluxo destrutivo que exclui produtos exceto o piloto
  `13125`. Replicar a capacidade funcional somente após mapear efeitos e protegê-la com escopo explícito,
  confirmação forte e trilha de auditoria; nunca executar como parte da importação.

## Inventário preliminar de paridade

| Área                                    | Já existe no ERP                                                             | Origem oficial / trabalho de integração                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro e consulta                     | CRUD, listagem/busca, foto, scanner, código de barras, conversões e unidades | comparar campos, validação e regras de nome/código; fechar diferenças sem duplicar telas/rotas                                                                                              |
| Fiscal e promoções                      | seção fiscal/promoções e tabelas `produtos_fiscal`, `produtos_promocoes`     | comparar schema e regras de ida/volta; preservar conteúdo fiscal sem transformação                                                                                                          |
| Comercial e estoque                     | custo, margem, preço, mínimo/máximo, áreas/setores e saldo                   | mapear campos que são catálogo versus saldo operacional; saldo da loja fonte não pode virar movimento do ERP                                                                                |
| Transformação                           | tipo e receita/transformação                                                 | comparar unidades, precisão, quantidades e relações; adaptar sem cruzar tenant                                                                                                              |
| Código interno                          | sequência antiga de cinco dígitos por empresa                                | origem usa sequência global, piso 13129 e faixa >=700000 reservada; gerador foi atualizado com trava global, sem renumerar registros; conferir catálogo antes de habilitar via merge/deploy |
| Central e reconciliação                 | não identificado equivalente completo no ERP                                 | portar classificação de grupo, conciliação, divergências, duplicidades e histórico, sem perda de evidência                                                                                  |
| SIA / planilhas / importação-exportação | existem importações distintas do ERP                                         | inventariar contratos e arquivos oficiais, idempotência, permissões e relatórios; remover o seed antigo como fonte concorrente quando a substituição vertical estiver pronta                |
| Histórico e governança                  | auditoria básica no cadastro                                                 | portar trilha reversível de alterações relevantes, autorização e relatórios de operação                                                                                                     |

### Diferenças de schema confirmadas no código

O modelo oficial em `stack/api/src/modules/product/product.table.ts` tem atributos que não existem no
schema ERP de `db/src/schema/app.schema.ts`:

- Produto: `compraAproximada`, `habilitarAjuda`, `setorVenda1` e `setorVenda2`.
- Transformação: `refReceituario`.
- Fiscal: `tributacaoSimples`, `aliquotaSimples`, `icmsRe`, `baseFiscal`, `codigoFiscal`,
  `produtoFiscal`, `cstReforma`, `cClassTrib`, `aliquotaIbs`, `aliquotaCbs`, `origemFiscal`,
  `aliquotaEcf`, `aliquotaEcfId`, `estado`, `motivo`, `conferidoEm` e `pctNcm`.
- Governança de reconciliação: tabelas de unificação, recusa de pares, histórico de alteração do
  código interno e histórico de nomes; sem equivalentes identificados no ERP.

### Histórico de nomes (vertical em implementação)

A origem guarda `productNameHistory` com produto, loja, código, nome anterior/novo, usuário e data;
registra a mudança de nome dentro do serviço de atualização e restringe a consulta a admin. No ERP,
o nome canônico é `produtos.nome_catalogo` (não a descrição operacional derivada). A implementação
registra as alterações na mesma transação do PUT, guarda o nome do ator como snapshot e filtra por
empresa. A consulta exige o perfil `usuario_admin`, conforme a regra observada na origem. A migration
aditiva 0082 e o snapshot foram gerados automaticamente e commitados; sua aplicação em qualquer banco
continua pendente de autorização específica. Nenhuma migration 0082 foi aplicada. A falha anterior de
`uv_os_get_passwd ... ENOMEM` foi contornada apenas no processo local de geração e validação; não
representa bloqueio atual do Drizzle.

O formato de `montarComoSeCompra` no ERP foi substituído pelo formato do cadastro oficial; quando
`compraAproximada` está ativo, a frase inclui `APROXIMADAMENTE`. O comportamento tem teste unitário.
`habilitarAjuda` também ativa as dicas padrão do formulário sem remover as dicas personalizadas.

Não mapear `products.quantidade` automaticamente para `produtos.quantidadeEstoque`: no ERP o saldo é
derivado de movimentos auditados. A carga deverá guardar a quantidade de origem no relatório/staging;
qualquer abertura de saldo seguirá processo próprio, com regra e autorização operacional.

Arquivos representativos da origem em `origin/main`: `stack/api/src/modules/product/` contém CRUD,
código interno, carga-base, cadastro de código, import/export, reconciliação, histórico e fluxo de zerar;
`stack/shared/src/product/` contém schemas e regras. O módulo ERP equivalente está em
`api/src/produtos/`, `db/src/schema/app.schema.ts` e `web-vue/components/produtos/`.

## Plano de execução por verticais

1. **Baseline e contrato (em andamento):** confirmar SHA implantado; fechar matriz campo-a-campo e
   rotas; comparar migrations/schema; conferir regras de permissão, tenant e fluxo antigo. Sem escrita
   no banco.
2. **Identidade e código interno:** sequência da origem com lock concorrente e testes está implementada
   nesta branch; gerar relatório seguro de valores e colisões entre empresas antes de habilitar na
   instalação compartilhada. Preservar códigos existentes e cópia entre lojas. Gate: nenhuma colisão
   nem renumeração silenciosa.
3. **Atributos do cadastro e fiscal:** migration aditiva `0080` com 22 colunas para compra, venda,
   fiscal e referência de receituário. Contrato, gravação/leitura, cópia entre empresas, formulário e
   round-trip foram ampliados. Aplicada somente no PostgreSQL local de desenvolvimento em 26/10/2026,
   após autorização de José; não aplicada em homologação ou produção.
4. **Catálogo vertical:** reconciliar CRUD, busca, foto, scanner, códigos de barras, unidades,
   transformação e comercial no backend e UI; um único caminho para cada operação.
5. **Central e reconciliação:** grupos, diferenças, duplicidades, aprovações, histórico e resolução
   manual, com teste de isolamento multiempresa.
6. **Importação/exportação oficial:** adaptar arquivos e fluxos SIA/planilhas para execução idempotente,
   dry-run, relatório de erros e fiscal literal; desativar o caminho antigo apenas quando a nova vertical
   estiver completa e os testes provarem a troca.
7. **Carga de dados:** confirmar origem e destino, backup restaurável, relatório atual de contagem e
   amostra, SQL e reversão. Só depois de revisão e autorização específica, rodar em homologação; produção
   exige nova autorização e janela própria.
8. **Fechamento:** lint, check, testes unitários e integração proporcionais, revisão da PR e prova dos
   quatro tamanhos responsivos do Definition of Done. PR/merge/deploy são passos separados.

## Estado em 26/10/2026

- PR de Compras #205 está em branch/PR separado; não misturar com esta entrega.
- Branch de Produtos foi criada sobre `main` `80eccf85`; R-222 e este plano estão commitados em
  `5088f967`.
- O gerador de código interno da branch já segue o piso/faixa do app, serializa lojas e não renumera
  registros. O catálogo compartilhado ainda não foi consultado; revisar os códigos antes de merge/deploy.
- Validação da fatia do código interno: teste unitário 4/4, `lint` e `check` completos passaram. O teste
  de integração multiempresa foi escrito e typechecked, mas não executou localmente porque Testcontainers
  não encontrou runtime Docker disponível.
- Migration `0080_cadastro_produtos_oficial.sql` e snapshot Drizzle foram gerados. O SQL é aditivo.
  Depois do registro inicial abaixo, 0080 foi aplicada exclusivamente no PostgreSQL local de
  desenvolvimento (22 colunas confirmadas); nenhum dado de catálogo foi importado ou atualizado.
  `npm run lint`, `npm run check`, os 3 arquivos de teste unitário de produtos
  (34 testes) e o round-trip do formulário fiscal (2 testes) passaram. O check Nuxt manteve os avisos
  preexistentes de `useLayout` e `vue-router/volar/sfc-route-blocks`.
- Testes de integração com Testcontainers não foram executados: `docker info` não conseguiu conectar
  ao Docker Engine local (pipe sem acesso). A carga de dados e o restante das verticais seguem pendentes.
- Depois, a regra da frase de compra aproximada passou por lint e check completos; os testes focados
  tiveram 27 aprovações para regras compartilhadas e 2 para o round-trip do formulário.
- A tela real `https://produtos.cicluzieai.com.br/` foi conferida em 26/10/2026 com sessão autenticada:
  o catálogo Geral (Base) mostrava 2.366 produtos; a navegação também expunha importação da base,
  importação e conferência de planilha, Central de Produtos, duplicados históricos, histórico de nomes,
  manutenção, relatórios de vendas e gerentes, usuários, permissões e régua de pontos. O formulário
  oficial usa nome + gramatura + medida base + indicador de balança e descrição automática, além de
  embalagem/compra exata ou aproximada, operação, fiscal e mídia por câmera/galeria com opção de fundo
  por IA. A API e a branch de origem local não confirmam o SHA atualmente implantado.
- A comparação com o ERP local revelou que a tela continua sendo a versão antiga: descrição livre e
  quantidade/unidade individual, sem as abas de catálogo Base/TNP/LI nem a navegação e os fluxos
  operacionais completos do app oficial. Os cinco commits desta branch são uma base de regras/campos,
  não uma migração completa da experiência. O banco de desenvolvimento local tem 54 registros de teste,
  não o catálogo oficial. A migration 0080 foi aplicada somente nesse banco local, após autorização,
  por 22 `ALTER TABLE ... ADD COLUMN`; não foi aplicada em homologação ou produção.

### Retomada e estado corrigido

- Em 26/10/2026 a inspeção da sessão autenticada confirmou a navegação da aplicação oficial em uso:
  Produtos, Importar da base, importação/conferência de planilha, relatórios, Central de Produtos,
  duplicados históricos, histórico, manutenção, usuários, régua de pontos e permissões. O formulário
  oficial também foi inspecionado por acessibilidade: nome, gramatura, medida base, indicador de
  balança, descrição automática, embalagem/compra, operação e mídia. A branch de código disponível no
  repositório antigo continua sem representar a versão implantada; portanto, a tela em execução e os
  contratos observáveis são a referência até que o SHA implantado seja obtido.
- A migration `0080` continua aplicada apenas localmente; banco local contém 54 registros de teste.
  Nenhuma carga, atualização histórica, migration em homologação ou alteração de produção foi feita.
- **Paridade integral ainda não entregue.** O cadastro/listagem do ERP continua diferente e os fluxos
  Central/reconciliação, histórico, importações oficiais, permissões e relatórios precisam de inventário
  e entrega vertical. Não aprovar merge desta branch como integração completa antes de fechar esses itens,
  validar responsividade e obter gates verdes.

### Inspeção adicional da aplicação oficial (26/10/2026)

- A Central autenticada mostrou 4.217 produtos únicos no universo conciliado, 3.049 já na Base,
  232 vinculados e 8 descartados. Fontes indicadas na tela: Compilart TNP (4.309), Fiscal TNP (940),
  planilha nova (1), planilha antiga TNP (3.122), Cadastro Pralis (7.624), SIA Lisboa (4.186) e vendas
  dos PDVs em 12 meses (1.668). São contagens apresentadas pela Central, não contagem independente
  recalculada neste repositório.
- A listagem Geral (Base) mostrou 2.366 itens e 5.041 ocultos pelo filtro inicial “Só ativos”. Existem
  também catálogos por loja (TNP e LI), busca por nome/código/EAN, filtro de vendidos, visualização em
  cards/lista, ativação/inativação e exclusão individual.
- A conferência de planilha declara ser somente leitura. A tela “Importar da planilha” declara que zera
  a Base e a refaz com a planilha; esse fluxo é destrutivo e não foi executado nem deve ser portado como
  sincronização automática.
- A página de histórico de nomes exibiu 44 alterações, com data, produto/código, loja, antes/depois e
  autor. A Central também tem decisões explícitas: vincular/atualizar, adicionar à Base, marcar que não
  é o mesmo produto ou ignorar; decisões existentes exibem autoria.
- A migration `0081_cadastro_produtos_identidade_pesagem.sql` adiciona `nome_catalogo` e `pesavel` e
  foi aplicada somente no Postgres local de desenvolvimento após autorização específica. Não altera
  linhas existentes. O teste focal da prévia automática passou 4/4; lint dos arquivos e lint de testes
  passaram. A correção foi commitada em `eec6c47a`.
- O ambiente local continua aberto em `/produtos/novo` para conferência visual. O formulário exibe
  nome, gramatura, medida base, pesagem e demais campos já existentes; isso ainda não representa a
  experiência completa da aplicação oficial.
- Nenhuma importação, decisão na Central, alteração histórica, migration posterior a 0081, push, PR,
  merge ou deploy foi realizada. A integração segue incompleta e não está liberada para merge.

### Conferência da fonte de dados disponível (26/10/2026, retomada)

- A sessão autenticada continua ativa. A listagem oficial de Produtos apresenta os catálogos Geral
  (Base), TNP e LI; busca por nome/código interno/EAN; filtros de ativos e vendidos; modos cards/lista;
  e ações de ativar/inativar, editar e excluir. A tela atual mostra 2.366 produtos ativos no catálogo
  Geral (Base), em 237 páginas. Esse número é o resultado da consulta atual da interface, não o total
  histórico de produtos.
- A Central autenticada apresenta 4.217 produtos únicos, 3.049 já na Base, 232 vinculados e 8
  descartados; 141 páginas no universo atual. Expõe fontes Compilart TNP, Fiscal TNP, duas planilhas,
  Cadastro Pralis, SIA Lisboa e vendas dos PDVs. As ações mantêm decisões explícitas de
  vincular/atualizar, adicionar, recusar equivalência ou ignorar, com autoria.
- O arquivo `stack/api/src/db/base-products.json` obtido do `main` do repositório
  `ErasoumZe/SISTEMA_PRALIS_PRODUTOS` tem blob `3b49470b184398366d47d15452d40b0215b33c0a` e apenas
  149 registros. A auditoria sem escrita encontrou zero códigos internos, zero blocos fiscais,
  zero fotos e três EANs repetidos. Ele não corresponde ao catálogo exibido pela aplicação em uso e
  não pode ser usado como carga real.
- O importador local de teste `scripts/importar-catalogo-pralis-teste.ts` é inadequado para a carga
  oficial: deliberadamente descarta fiscal e foto e gera sequência local de código interno; portanto,
  permanece restrito a massa descartável local e não deve ser usado para importar o catálogo de
  produção.
- Próximo passo de dados: obter exportação autenticada e atual da fonte oficial, confirmar o SHA
  implantado e produzir relatório dry-run com contagens, amostras, códigos, campos fiscais, EANs
  duplicados e conflitos por empresa. Não houve download/exportação nem escrita de catálogo nesta
  conferência. A carga seguirá dependendo de backup validado, plano de reversão e autorização
  específica, conforme R-222.

### Fonte de código e fatia de listagem (26/10/2026, continuação)

- Consulta ao repositório GitHub `ErasoumZe/SISTEMA_PRALIS_PRODUTOS` confirmou que a `main` disponível
  está no SHA `1ba67740527f1c9c348d8b013c088af4f12f40c1`, commit de 13/10/2026. Como a tela autenticada
  foi observada em 26/10 e o SHA implantado não foi identificado, esse código é referência parcial,
  não prova da versão hoje em produção.
- A fonte disponível define “Só os que já vendi” como correspondência do produto ou do EAN do PDV
  com zeros à esquerda removidos. A fatia adicionada ao ERP mantém paginação e escopo por empresa,
  ignora item e venda cancelados, e não presume janela temporal. O ERP não possui o de/para oficial
  de códigos CREARE nesta entrega; itens sem `produto_id` ou EAN correspondente continuarão fora do
  filtro até esse vínculo ser integrado.
- A listagem do ERP recebeu filtro de ativos inicial e alternância cards/lista, além do filtro de
  vendidos com suporte de API e teste de integração. Isso aproxima a tela, mas não completa a
  paridade dos catálogos Base/TNP/LI, Central, histórico, importações, permissões, relatórios e mídia.
- O modo de visualização segue a preferência do app oficial em `localStorage` (`pralis:produtos:modo`),
  com fallback para cards quando o armazenamento do navegador não estiver disponível.
- Validação local desta fatia: `npm run lint`, `npm run check` e 13 testes de integração de listagem
  passaram. A suíte E2E teve 24/25 aprovados na primeira execução; o único restante reportou uma
  resposta 500 transitória em `/api/caixa/status` (fora do módulo Produtos) e passou ao ser repetido
  isoladamente. Os testes
  responsivos cobrem cards e lista em 1440, 1366, 1024, 768, 412, 390, 360 e 844 px sem overflow.
- A fonte de dados completa segue pendente: SHA implantado e exportação autenticada atual precisam
  ser confirmados. Nenhuma carga de catálogo foi executada; 0080 e 0081 continuam aplicadas apenas
  no banco local de desenvolvimento. A migration 0082 de histórico de nomes foi gerada e commitada,
  mas ainda não foi aplicada em nenhum banco.

### Histórico de nomes e retomada (26/10/2026)

- A branch contém o commit `2f5ee900 feat(produtos): registra historico de nomes`. O PUT do produto
  grava a alteração na mesma transação, com nome anterior/novo, empresa, autor e data. O endpoint
  `GET /api/produtos/:id/historico-nomes` verifica perfil `usuario_admin` no servidor, valida o escopo
  da empresa, e a tela vinculada ao formulário apresenta histórico responsivo. Testes de integração
  cobrem autoria, acesso negado e isolamento entre empresas.
- A migration `0082_cadastro_produtos_historico_nomes.sql` e o snapshot foram gerados pelo Drizzle e
  estão commitados. Não foram aplicados a nenhum banco. A autorização para aplicá-la somente no banco
  local continua pendente; a aprovação anterior cobre somente a migration 0081.
- Após o commit, `npm run lint`, `npm run check`, `git diff --check` e `npm run check:migrations`
  passaram. Os testes de integração que dependem da tabela 0082 ainda não foram executados. Não houve
  push, PR, merge, deploy nem carga de catálogo.
- A consulta read-only mais recente ao repositório oficial `ErasoumZe/SISTEMA_PRALIS_PRODUTOS`
  confirmou que a `main` descreve a Central como fluxo administrativo de reconciliação: staging de
  fontes, filtros/paginação no servidor, decisões humanas por grupo e ações separadas para incluir,
  vincular, recusar equivalência ou ignorar. A fonte de serviço também lê o catálogo Pralis, vendas
  recentes e, quando habilitada, a planilha Google em tempo real. Esses comportamentos ainda não existem
  no ERP e não são apenas uma tela CRUD.
- A origem depende de arquivos de fontes e de configuração/credenciais de Google Sheets, enquanto o
  ERP não tem o mesmo contrato nem mapeamento confirmado entre Base/TNP/LI e `empresa_id`. O porte deve
  definir um adaptador isolado e dry-run; não deve tratar arquivos antigos como dados atuais nem
  escrever na Base durante recálculo automático. O SHA implantado e uma exportação autenticada atual
  continuam necessários antes de qualquer carga real.
