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
- **Catálogo BASE:** decisão de José em 26/10/2026: BASE será catálogo mestre separado, sem ser mapeado
  para uma empresa do ERP. TNP/LI/HORA permanecem catálogos operacionais associados às empresas. A
  persistência e a cópia BASE→empresa precisam manter essa distinção e a proveniência.

## Inventário preliminar de paridade

| Área                                    | Já existe no ERP                                                             | Origem oficial / trabalho de integração                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro e consulta                     | CRUD, listagem/busca, foto, scanner, código de barras, conversões e unidades | comparar campos, validação e regras de nome/código; fechar diferenças sem duplicar telas/rotas                                                                                                                                                        |
| Fiscal e promoções                      | seção fiscal/promoções e tabelas `produtos_fiscal`, `produtos_promocoes`     | comparar schema e regras de ida/volta; preservar conteúdo fiscal sem transformação                                                                                                                                                                    |
| Comercial e estoque                     | custo, margem, preço, mínimo/máximo, áreas/setores e saldo                   | mapear campos que são catálogo versus saldo operacional; saldo da loja fonte não pode virar movimento do ERP                                                                                                                                          |
| Transformação                           | tipo e receita/transformação                                                 | comparar unidades, precisão, quantidades e relações; adaptar sem cruzar tenant                                                                                                                                                                        |
| Código interno                          | sequência antiga de cinco dígitos por empresa                                | `origin/main` consultada em 1ba6774 usa sequência global e piso 13129; checkout local em 7ea8bd9 usa faixas por loja (BASE/TNP 1325, LI 4396, HORA 0). SHA implantado ainda não confirmado; identificar a versão do Coolify antes de afirmar paridade |
| Central e reconciliação                 | não identificado equivalente completo no ERP                                 | portar classificação de grupo, conciliação, divergências, duplicidades e histórico, sem perda de evidência                                                                                                                                            |
| SIA / planilhas / importação-exportação | existem importações distintas do ERP                                         | inventariar contratos e arquivos oficiais, idempotência, permissões e relatórios; remover o seed antigo como fonte concorrente quando a substituição vertical estiver pronta                                                                          |
| Histórico e governança                  | auditoria básica no cadastro                                                 | portar trilha reversível de alterações relevantes, autorização e relatórios de operação                                                                                                                                                               |

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
- O primeiro núcleo reutilizável da Central foi portado para `shared/src/produtos/central-reconciliacao.ts`:
  agrupamento determinístico por ID compartilhado, código de barras/CREARE, código interno somente na
  mesma loja e nome como chave fraca; candidato mantém origem dos campos e o fiscal ausente permanece
  nulo. Seis testes unitários cobrem nomes divergentes, limites entre lojas, código CREARE, fiscal
  ausente e conflito de barras. `npm run check --workspace @padaria/shared`, `npm run lint:shared` e
  esses testes passaram. Ainda não há tabelas de staging/decisões, endpoints ou tela da Central; este
  motor isolado não constitui entrega funcional da Central.
- Na retomada, foi acrescentado um parser CSV com suporte a aspas/separadores em campos, validação de
  cabeçalhos e preservação literal dos dados de origem. Quatro testes adicionais cobrem CSV com
  delimitador interno, BOM, fiscal literal e rejeição de arquivo inválido. O modelo Drizzle local e a
  migration `0083_curly_kulan_gath.sql` descrevem staging isolado para cargas, linhas fonte, grupos,
  vínculos e decisões; migration apenas gerada, não aplicada. Os 10 testes unitários de
  reconciliação/parser, `check` de `shared` e `db`, `lint:shared` e `git diff --check` passaram. Ainda
  não há persistência operacional/endpoints/tela; não houve importação nem escrita no catálogo.
- Também existe agora uma preparação de prévia em memória que recusa arquivo duplicado da mesma fonte,
  conta linhas e aponta EANs ligados a nomes diferentes antes de propor os grupos. Ela não salva nem
  aplica as sugestões. Três arquivos de teste da Central (12 testes) passaram, junto com `check` e
  `lint:shared`; integração com banco e UI continuam pendentes.
- A auditoria da implementação oficial refinou o porte: conflito de EAN é calculado dentro de cada
  fonte, fiscal de LI vem do SIA e fiscal TNP somente da fonte contábil; valores fiscais legados do
  cadastro não podem apagar o alerta de ausência. Dois testes de regressão cobrem essas regras.
- A origem depende de arquivos de fontes e de configuração/credenciais de Google Sheets, enquanto o
  ERP não tem o mesmo contrato nem mapeamento confirmado entre Base/TNP/LI e `empresa_id`. O porte deve
  definir um adaptador isolado e dry-run; não deve tratar arquivos antigos como dados atuais nem
  escrever na Base durante recálculo automático. O SHA implantado e uma exportação autenticada atual
  continuam necessários antes de qualquer carga real.

### Estado atual da retomada — 26/10/2026

- A `main` acessível do repositório oficial `ErasoumZe/SISTEMA_PRALIS_PRODUTOS` foi consultada novamente
  pela conexão GitHub somente leitura e continua no SHA `1ba67740527f1c9c348d8b013c088af4f12f40c1`
  (13/10/2026). Isso confirma a referência de código disponível, não o SHA implantado.
- A migration 0082 de histórico de nomes e a 0083 de staging/auditoria foram aplicadas **somente no
  PostgreSQL local de desenvolvimento**, após autorização explícita. A 0083 precisou ter a ordem de
  dois índices e FKs corrigida antes da aplicação; a aplicação corrigida foi verificada. Nenhuma delas
  foi aplicada em homologação/produção, e nenhum registro do catálogo foi alterado.
- A gravação de decisão da Central agora bloqueia a linha do grupo dentro da transação e recusa uma
  segunda decisão para o mesmo grupo/carga com HTTP 409. A UI mostra autor e horário e desabilita as
  ações já decididas. O teste de integração para decisão repetida foi adicionado, mas ainda aguarda a
  execução dos gates finais.
- Continuam pendentes as ações oficiais de vincular/atualizar e adicionar à Base, as fontes vivas de
  Pralis/PDV, exportação autenticada atual, SHA efetivamente implantado e a carga real com dry-run,
  backup restaurável, amostras, colisões e plano de reversão. A integração completa, visual e funcional,
  segue inacabada; sem push, PR, merge ou deploy.

### Backup completo XLSX para staging (26/10/2026)

- A leitura do código oficial confirmou que `GET /admin/produtos/export.xlsx` exporta as abas `Resumo`,
  `Produtos` e `Promocoes`, incluindo todas as lojas, todos os status e os campos operacionais/fiscais.
  O CSV oficial tem apenas 24 colunas e não é fonte suficiente para uma migração integral. O SHA
  consultado segue sendo referência GitHub, não confirmação do código implantado.
- A Central do ERP agora aceita esse XLSX em um campo separado, exige as três abas relevantes, valida
  data e contagens do resumo, recusa ID duplicado e mantém todos os valores/cabeçalhos originais, fiscal,
  foto e promoções em `dadosOriginais` no staging. O campo `venda_pontual` foi alinhado ao nome usado
  pelo exportador oficial. Isso não lê a sessão nem baixa arquivo da origem automaticamente.
- O endpoint continua limitado pelo multipart global do ERP (10 MiB por arquivo) e o parser limita a
  expansão ZIP a 50 MiB. O envio é somente staging/prévia; não altera o catálogo nem executa migration.
  A migration 0083 foi aplicada apenas no PostgreSQL local após autorização; nenhum ambiente
  compartilhado/produção foi tocado.
- A suíte unitária completa passou (726 testes/82 arquivos), `npm run check`, `npm run lint` e `git diff
--check` passaram; o ESLint focado também passou após os últimos ajustes. O Nuxt ainda emite avisos
  conhecidos de `useLayout` e do plugin `vue-router/volar/sfc-route-blocks`. Testes de integração não
  rodaram porque o Docker Engine local recusou conexão. Revisão visual desta tela não foi concluída.
- Nenhuma carga real foi feita; ainda faltam as verticais de cadastro oficial, importação segura,
  histórico, relatórios e permissões para considerar a paridade concluída.

### Campos oficiais de balança (27/10/2026)

- A revisão do `main` oficial confirmou que a importação da BASE gera um novo código interno pela
  sequência global do catálogo; não copia o código interno da BASE. O repositório oficial calcula o
  máximo sem filtrar loja, apesar de um comentário local mencionar sequência da loja. O código
  original permanece disponível no catálogo mestre como referência.
- O contrato do ERP foi ampliado para transportar `teclaBalanca`, `validadeBalanca`, `grupoIdExterno`
  e `areaVenda` na tela, leitura e gravação, preservando os valores existentes em edições de clientes
  antigos. A validação de TypeScript de `shared`, `db`, `api` e Nuxt passou; o teste unitário de
  mapeamento passou (5 testes).
- A migration aditiva `0085_produtos_campos_oficiais.sql` e sua entrada de journal estão preparadas,
  mas não aplicadas. O snapshot Drizzle não foi gerado porque `drizzle-kit generate` falhou com
  `uv_os_get_passwd returned ENOMEM`; `check:migrations` permanece bloqueado por esse snapshot ausente.
- A operação de persistência da carga BASE usa Drizzle parametrizado, exige carga validada, faz upsert
  idempotente por ID de origem e não toca produtos de loja nem saldos. A cópia BASE→loja agora mapeia
  dados fiscais e bloqueia unidades/grupos sem equivalência única; foi acrescentada cópia em lote com
  resultado por item. Nenhum produto oficial foi carregado; nenhuma migration foi aplicada em banco
  compartilhado.
- A leitura do exportador XLSX no `main` oficial revelou campos presentes no modelo mas ausentes no
  backup: `pesavel`, `teclaBalanca`, `validadeBalanca`, `grupoId` e `areaVenda`. O XLSX sozinho não
  prova paridade desses atributos. A carga para loja deve bloquear ou receber um export/API completo
  antes de afirmar migração integral; não preencher valores ausentes por inferência.

### Divergência entre branches da fonte oficial (27/10/2026)

- O checkout local `C:\Users\José\Desktop\Cicluz\CADASTRO DE PRODUTOS\pralis` está na branch
  `fix/creare-planilha-confiavel`, SHA `7ea8bd99`, rastreando `origin/fix/creare-planilha-confiavel`.
  O `origin/main` local está em `1ba6774`; a branch local `main` está em `f9f781a`.
- O `origin/main` de `1ba6774` usa sequência global, conforme registrado acima. O checkout `7ea8bd99`
  contém o commit `b89dfb5` (`feat(produtos): reconciliar codigos internos por loja`), ausente de
  `origin/main`, e gera código em sequência por catálogo: BASE 1325, TNP 1325, LI 4396 e HORA 0,
  com trava advisory dentro da transação.
- O SHA/branch implantado no app usado nas lojas ainda não foi confirmado. O ERP continua na regra global
  da referência `origin/main`; não afirmar paridade do código interno nem alterar códigos/dados até
  identificar a versão do Coolify.
- Nenhum dos pisos autoriza renumerar produtos existentes. A carga real exige dry-run atual, backup
  verificável e autorização operacional específica.

### Execução local autorizada (27/10/2026)

- Marco/José autorizaram aplicar a migration `0084_catalogo_base_separado.sql` somente no Postgres
  local de desenvolvimento e confirmaram a regra de cópia BASE→loja: mapear unidade/embalagem/grupo
  por equivalência única, bloquear falta ou ambiguidade e nunca copiar saldo.
- A 0084 foi aplicada em `localhost:5543/padaria`. Antes/depois: 54 produtos locais; a contagem não
  mudou. Verificados a tabela `produtos_catalogo_base`, o vínculo `produtos.produto_base_id` e os
  cinco índices esperados. Nenhuma linha do catálogo foi criada ou atualizada por essa migration.
- A 0085 continua pendente de autorização específica. O Docker daemon não está acessível nesta sessão;
  a operação local aprovada foi feita por conexão PostgreSQL direta após validar host/porta/database.
- A paridade integral e a identificação do SHA implantado no app oficial continuam pendentes; não
  importar catálogo real nem afirmar equivalência dos códigos internos até resolver esses pontos.

### Inventário funcional confirmado no checkout da fonte (27/10/2026)

- `stack/api/src/modules/product/product.routes.ts` na branch `fix/creare-planilha-confiavel` registra
  CRUD/listagem BASE, importação para loja, export CSV global, backup XLSX global, prévia/execução de
  zeragem do catálogo e prévia/aplicação de reconciliação de códigos.
- A tela oficial `stack/pwa/app/pages/produtos/manutencao.vue` também agrega panorama e backfill fiscal,
  além de reenvio de sincronização pendente. A tela declara a zeragem como operação destrutiva e exige
  backup, frase de confirmação e total esperado; isso não é equivalente a uma sincronização de catálogo.
- No ERP, existem CRUD e cópia BASE→loja, importação da Central e operações por produto; não foram
  encontrados endpoints equivalentes ao export global CSV/XLSX nem à manutenção global fiscal/zeragem/
  reconciliação no módulo `api/src/produtos`. Esses itens permanecem gaps de paridade para decisão e
  implementação. A zeragem exige avaliação separada de dependências e proteções antes de portá-la.
- O `foto_url` do backup é apenas uma referência do storage de origem. A cópia BASE→loja agora bloqueia
  produtos com foto até haver transferência binária para o storage do ERP; reutilizar o path da origem
  produziria imagem quebrada. O cenário foi acrescentado ao teste de integração da Central.
- Foi portada a exportação CSV de reconciliação da fonte para `GET /api/produtos/export.csv`, limitada
  às empresas permitidas ao administrador, com os cabeçalhos oficiais, dados fiscais presentes no ERP,
  preservação de zeros em códigos e proteção contra fórmulas em texto. A ação ficou na página
  administrativa Manutenção, separada da listagem. O teste unitário do formato passou; o teste de autorização/rota foi adicionado, mas
  depende do runtime de integração com PostgreSQL/Testcontainers.
- A página administrativa Manutenção oferece `GET /api/produtos/backup.xlsx`, com abas Resumo, Produtos, Promoções e
  Conversões, filtrado pelo mesmo escopo. O gerador cria células como texto para preservar códigos e
  valores; inclui os campos de produto/fiscal atualmente persistidos. Teste unitário confirmou o ZIP e
  nomes/cabeçalhos das abas. A rota/autorização aguarda integração com Testcontainers; os quatro campos
  que dependem da 0085 ainda não podem constar do backup executável até a migration estar autorizada e aplicada.
- O backup XLSX foi complementado com `pesavel`, que já existe no schema vigente e no catálogo oficial;
  o dado acompanha cada produto na aba Produtos. Os campos `teclaBalanca`, `validadeBalanca`,
  `grupoIdExterno` e `areaVenda` continuam vinculados à 0085, ainda não aplicada. O snapshot 0085 foi
  gerado pelo Drizzle em uma cópia isolada até 0084; o SQL gerado coincide com os quatro `ALTER TABLE`
  existentes, `prevId` aponta para 0084 e `check:migrations` passou com 86 SQL/journal/snapshots.
- A página administrativa Manutenção exibe o panorama fiscal somente de leitura, servido por
  `GET /api/produtos/fiscal/panorama`, com contagem por estado e escopo de empresas permitido ao admin.
  A listagem tem um único acesso a essa página; produtos sem linha fiscal entram como `sem_registro` e o painel não executa backfill nem altera valores.
- A busca local por uma fonte de carga encontrou apenas: o seed `pralis/stack/api/src/db/base-products.json`
  com 149 itens; a planilha `tabela/Cópia de CENTRAL PRODUTOS (BASE) - CICLUZ GESTÃO PROFISSIONAL .xlsx`,
  alterada em 17/06/2026 e com uma aba de 9.930 linhas; e `outputs/backup-local-validacao.xlsx`,
  alterado em 23/09/2026, com 300 linhas de produtos. O seed declara produtos transformados sem fiscal,
  a planilha antiga não tem as três abas do backup oficial e o arquivo de validação é massa local.
  Nenhum deles foi importado. Não há no workspace uma exportação autenticada atual do catálogo em uso.
- Este inventário descreve o checkout disponível, não prova que tais fluxos/rotas correspondem ao SHA
  atualmente implantado. Não executar zeragem, backfill fiscal ou reconciliação sem prévia, escopo,
  contagem/amostra e autorização operacional própria.

### Atualização após autorização local (27/10/2026)

- A migration `0085_produtos_campos_oficiais.sql` foi autorizada por José e aplicada em uma transação
  somente ao Postgres local `localhost:5543/padaria`. Foram criadas as colunas `tecla_balanca`,
  `validade_balanca`, `grupo_id_externo` e `area_venda`; a contagem permaneceu em 54 produtos. O histórico
  `drizzle.__drizzle_migrations` está vazio porque esse banco local foi preparado fora do migrator; por
  isso não se executou `drizzle-kit migrate`, que tentaria reaplicar a sequência histórica inteira.
- A inspeção autenticada do app em uso confirmou a página de manutenção com reconciliação de códigos,
  carga fiscal com prévia/aplicação, fila de reenvio e zeragem protegida por backup e confirmação. A tela
  de produtos indicou 2.366 itens na aba `Geral (Base)`; a manutenção reportou 14.598 produtos no total.
  Esses números são observações do app em 27/10/2026, não dados importados no ERP.
- O ERP atual já tem export CSV/XLSX e panorama fiscal somente de leitura. Permanecem sem paridade
  funcional as rotinas de reconciliação de códigos da fonte, prévia/aplicação fiscal, fila de reenvio e
  manutenção/zeragem protegida. A execução de alterações em produção continua fora do escopo.
- Foi acionado uma vez o botão oficial de backup completo. O app abriu/navegou para outra rota sem
  entregar arquivo observável; não há XLSX recente de produtos na pasta Downloads. O backup oficial
  autenticado e atual continua necessário para validar e importar os dados reais. Nenhum arquivo antigo
  local foi promovido a fonte, e nenhum produto local foi importado.
- O SHA implantado no app oficial ainda não foi exposto pela interface. O checkout de origem inspecionado
  permanece na branch `fix/creare-planilha-confiavel`, HEAD `7ea8bd9`; isso não prova que seja o mesmo
  código da instalação em produção.

### Retomada com evidências (27/10/2026, Claude Desktop)

**Versão em produção do app oficial — resolvido por evidência.** `GET https://api-produtos.cicluzieai.com.br/health`
(leitura pública, sem segredo) respondeu `buildTime: 2026-10-13T17:36:57Z`, `commit: null`. O merge `1ba6774`
(PR #156) na `main` do `ErasoumZe/SISTEMA_PRALIS` é de 13/10 14:36:39 -03:00, 18 s antes do build: o deploy
automático da `main`. O commit dos pisos por loja (`b89dfb5`, 18/09) **não está na `main`** (só em
`origin/fix/creare-planilha-confiavel`), e `7ea8bd9` (14:42 -03:00) é posterior ao build. Conclusão: produção
usa a **sequência global com piso 13129**, a mesma regra do ERP. Prova por horário; o painel do Coolify
confirmaria em definitivo.

**Backup XLSX oficial falha em produção (500) — causa no código, sem correção no app.** `listAllForBackup()`
dispara `findById` para os 14.598 produtos ao mesmo tempo (4 consultas cada, ~58 mil), com pool de 10 conexões
e timeout de conexão de 5 s (`PG_POOL_MAX`/`PG_CONN_TIMEOUT_MS` padrão): a fila estoura e a rota responde 500.
O export CSV usa o mesmo padrão de leitura. **Risco operacional:** na Manutenção oficial, "Backup XLSX baixado" é
marcado no clique (o próprio código diz que não é prova); com o backup falhando, a zeragem fica liberada sem
cópia. **José decidiu não alterar o app oficial** (está estável em uso). A fonte dos dados passa a ser a
**planilha do Google Sheets** que o app espelha — abas `(BASE) CADASTRO PRODUTOS`, `(TNP) CADASTRO PRODUTOS`,
`(LI) CADASTRO PRODUTOS`, cabeçalho na linha 5 e dados a partir da 11 —, baixada por José como XLSX; e, se
preciso, a base geral do SIA/CREARE.

**Correções no ERP nesta retomada (commit `0d2e11e1`):**

- **Código interno quebrado:** a consulta do maior código abria um parêntese sem fechar — todo cadastro de
  produto respondia 500 (na integração e no localhost). E, selecionada `from produtos`, devolvia zero linhas com
  a tabela vazia, ignorando a BASE. Virou consulta completa que sempre devolve uma linha
  (`sqlConsultaMaiorCodigoInterno`), com teste de regressão (próximo código acima da BASE).
- **BASE guarda o código e o EAN da fonte** pelas colunas normalizadas da carga (antes só do JSON bruto).
- **Migration 0086** (aditiva): as chaves `(id, carga_id)` de `produtos_central_fontes`/`grupos` passam de índice
  único a restrição única via `UNIQUE USING INDEX` (sem recriar nada; as FKs compostas dependem delas). O
  `db:push` dos testes não conseguia criar as FKs. Cadeia 0000–0086 validada num Postgres limpo; aplicada **só**
  no Postgres local (`localhost:5543/padaria`), em transação, 54 produtos intactos. Decisão técnica delegada por
  José ("faz o que uma equipe sênior faria").
- Testes da Central corrigidos para o próprio fixture (empresaB pelo usuário multiempresa; fiscal literal;
  contagens com a linha do Pralis; total de produtos +1 pela cópia explícita BASE→loja).

**Gates desta retomada:** integração de Produtos com Testcontainers **49/49** (antes 0 rodavam); unitários 728/728;
web 844/844; `lint`, `check` (avisos conhecidos do Nuxt) e `check:migrations` (87) verdes.

**Ainda pendente:** importação da planilha oficial (aguarda o XLSX), paridade de listagem/formulário/telas
(inventário em andamento), rotinas de manutenção, E2E e 4 larguras, PR.

### Decisões de José (27/10/2026) após o inventário de paridade

1. **Modelo do catálogo igual ao oficial:** produto novo nasce na BASE (só admin cria); a loja importa da BASE;
   campos herdados ficam travados na loja e acompanham as edições da BASE (propagação), como no app oficial.
   Substitui o desenho anterior do ERP (loja cria direto; BASE só para copiar).
2. **Código de barras repetido:** igual ao oficial — avisa ao digitar e ao salvar e permite "Cadastrar mesmo
   assim" com confirmação (kit, fracionado). Substitui o bloqueio absoluto do ERP.
3. **Excluir produto:** NÃO portar. Mantém-se só inativar (preserva histórico de vendas, estoque e compras);
   inativar em lote pela lista para admin.
4. **Margem padrão por grupo:** implementar como no oficial (produto sem margem própria usa a do grupo), com
   migration aditiva — SQL mostrado antes e aplicado só no banco local.
5. **App oficial não é alterado** (está estável em uso); dados vêm da planilha do Google Sheets baixada por José.

### Correção de registro: a cópia BASE→loja HERDA o código interno (27/10/2026)

A nota "Campos oficiais de balança" acima afirmou que a importação da BASE gera um código interno novo. **Está
errada.** No `origin/main` oficial (1ba6774), `importFromBase` passa `codigoInterno: base.codigoInterno`
("herda o mesmo código interno da base (igual entre lojas)", `product.service.ts`) e o repositório só gera
código quando o contexto vem `undefined`; o teste oficial `product.governance.integration.test.ts` confere
`copia.codigoInterno === base.codigoInterno`. O ERP passou a herdar o código; se a loja já tiver outro produto
com aquele código, a cópia é bloqueada com o motivo (o índice único é por empresa).

### V1 — regras de cadastro do oficial portadas (27/10/2026)

Implementado e coberto por teste (unitário `tests/unit/produtos-regras-cadastro.test.ts` e integração
`tests/integration/produtos/produtos-regras-oficiais.test.ts`):

- regras puras em `shared/src/produtos/regras-cadastro.ts` (tela e API usam as mesmas): estoque por embalagem
  (mínimo ≥ embalagem e múltiplo; máximo múltiplo e maior que o mínimo), balança (validade 0–999 obrigatória
  quando vai para a balança; tecla fixa 000; quem não vai fica sem tecla e validade), EAN vazio recebe o código
  interno na criação, maiúsculas nos textos descritivos (nome, descrição, marca, setores, locais, produto do
  receituário, categoria fiscal);
- gramatura 0 aceita e a descrição automática não mostra "0";
- produto novo exige grupo; na edição só exige de quem já tinha grupo (legado sem grupo continua editável);
- produto novo sem resposta de balança nasce "Não"; edição de legado com balança "não conferida" continua aceita
  pela API, mas a tela exige Sim/Não como no oficial;
- EAN repetido pede confirmação e aceita "Cadastrar mesmo assim" (decisão 2);
- as regras valem para o que a pessoa digita; a cópia da BASE é importação e não é barrada por cadastro legado
  que viole regra de entrada (mesma separação do oficial).

### V3 — status na listagem (27/10/2026)

- `PATCH /api/produtos/status`: ativa/inativa um produto (quem edita produto); vários só o administrador, só
  para inativar e com a frase `INATIVAR N PRODUTOS` (decisão 3 — não existe excluir). Ids de outra loja são
  ignorados sem distinguir de inexistentes.
- Listagem: status clicável em card e linha; seleção e "Inativar selecionados" para o administrador; botão
  "Importar da base" para quem cria produto (antes só o admin via "Catálogo BASE").

### V2 — margem padrão por grupo (27/10/2026)

- Migration aditiva `0087_margem_padrao_grupos.sql` (SQL mostrado e aprovado por José): coluna
  `grupos_mercadorias.margem_padrao numeric(6,4)` nula + CHECK `>= 0`. Aplicada **só** no Postgres local
  (`localhost:5543`), em transação. Nenhum preço existente foi recalculado.
- Margem em fração (0,30 = 30%), como o `margemPadrao` do oficial. Produto com preço automático e sem margem
  própria usa a do grupo, no servidor (ADR-002) e na prévia; a margem própria continua tendo prioridade.
- Campo "Margem padrão do grupo" no cadastro de grupos de mercadoria; editar sem mandar a margem preserva a
  gravada. Teste: `produtos-preco.test.ts` (custo 50 / caixa 10 + 40% do grupo = 7,00; margem própria 30% = 6,50).
- Diferença conhecida: no oficial a margem vem da aba `(TNP/LI/HORA - EXP.) GRUPOS/REF. - VLD SAIDA`
  (`M5:N130`) do Google Sheets. No ERP é editada na tela; a carga da planilha deve preencher os valores atuais.

### Fiscal pelo grupo — como o oficial funciona (levantamento de 27/10/2026, pendente de implementação)

Decisão de José: o fiscal do produto **não é digitado**; é puxado pelo grupo como no app da loja. O oficial
(`stack/api/src/modules/apoio/tax-rule.service.ts`) lê ao vivo do Google Sheets, sem tabela no banco:

- aba `(TNP) FISCAL - DE PARA PRODUTOS`: `AB4:AG79` regra por grupo (grupo, CST PIS/COFINS, tributação
  Simples, alíquota Simples, % ICMS RE, base fiscal); `A4:E2000` de-para por produto (código EAN/PLU, NCM, CST,
  % ICMS RE, nome); `H4:M200` reforma por NCM (CST reforma, cClassTrib, IBS, CBS); `O4:Q20` CST → Simples;
- aba `(TNP) FISCAL - CADASTRO ECF` (`A2:Q4000`): alíquotas de ECF casadas pelo NOME do produto (nome repetido =
  ambíguo); LI/HORA usam o de-para do SIA (`sia_produto_depara`) por código de barras;
- classificação: regra do grupo (nome normalizado) + de-para por EAN/PLU de balança + ECF por nome/SIA; estados
  `completo`, `parcial`, `pendente_grupo_invalido`, `pendente_fonte_da_loja`, `pendente_ambiguo`,
  `pendente_conflito`, `fonte_indisponivel`; roda na criação e quando grupo/EAN mudam ("completar" quando o
  produto não tem carga fiscal); a cópia BASE→loja copia o fiscal, não reclassifica;
- campos que pessoa edita (só admin): NCM, CEST, categoria, alíquotas cheia/FCP/PIS/COFINS, redução, ICMS; o resto
  é derivado.

Para portar: as abas precisam virar dados do ERP (tabelas novas, migration a mostrar a José com base nas colunas
reais) carregados do XLSX da planilha inteira. **Bloqueado até José enviar o XLSX completo.**

### Ensaio das planilhas enviadas por José (27/10/2026) — só leitura, nada gravado

Arquivos: `CICLUZ GP - TNP_LI - CADASTRO PRODUTOS (MER).xlsx` (17 abas) e
`CICLUZ GP - TNP - DISCRIMINAÇÃO_ESTOQUE (MER).xlsx` (14 abas). O XLSX remove `/` dos nomes de aba:
`(TNPLI) CADASTRO PRODUTOS` é a `(TNP/LI) CADASTRO PRODUTOS` que o oficial usa na carga da BASE. Cabeçalho
da linha 5 conferido coluna a coluna contra o oficial: sem divergência.

- **Produtos (aba TNP/LI):** 7.407 linhas com nome, todas com o ID do app oficial (sem repetição); 2.379 ativas e
  5.028 inativas; 1 sem código interno; nenhum código interno repetido; maior código < 700000 = 13189;
  22 sem EAN; 246 nomes repetidos (normalizados); 1.190 sem grupo de revenda (1.188 têm grupo de
  transformação); 48 grupos; medida base UN 6.493, KG 636, G 12, ML 6, LT 1, vazia 259.
- **A faixa LI está vazia** (1 produto). A aba `(LI) CADASTRO PRODUTOS` também tem 1 linha.
- **Fiscal por produto está ZERADO na planilha** (NCM `00000000` em 7.095 linhas, ECF `00`): é o
  `FISCAL_ZERADO` que a carga oficial grava. O fiscal real só existe no banco do app e no espelho que ele
  escreve na aba `(BASE) CADASTRO PRODUTOS`, **que não veio neste arquivo**; também faltou a aba
  `(TNP) FISCAL - CADASTRO ECF`.
- **Regras fiscais presentes** (aba `(TNP) FISCAL - DE PARA PRODUTOS`): 88 regras por grupo, 944 linhas de
  de-para por produto, 17 de reforma por NCM, 4 de CST→Simples. Três grupos dos produtos não têm regra
  (`MER INATIVOS`, `MER MATERIAL LIMPEZA - EMPRESA`, `MER PATRIMONIO NÃO VENDAS`), somando 4.633 produtos,
  quase todos inativos — no oficial ficam `pendente_grupo_invalido`.
- **Margem por grupo:** 79 grupos na aba de grupos, só 3 com margem (cigarros); 79 pares nome→ID do grupo.
- **SIA (`BASE SIA FULL`):** 7.369 produtos, todos com NCM, 4.334 com alíquota de saída (ECF), 1.161 pesáveis;
  todos casam com o código interno da planilha. É o equivalente do `sia_produto_depara` que o oficial usa.
- **Custo e fornecedor (regra DB-05 do oficial: compra mais recente pelo nome × qt. embalagem):**
  11.773 linhas de compra da TNP, 2.608 notas, 182 fornecedores, 1.338 produtos distintos comprados. Dos
  2.379 ativos: 952 com compra (todos com fornecedor da última compra; 485 comprados de mais de um
  fornecedor), 1.384 sem compra na base, 43 com nome ambíguo no cadastro (ficam sem custo, como no oficial);
  741 teriam custo diferente do que está na planilha.

Pendente de José: confirmar se existe a planilha onde o app escreve (com `(BASE) CADASTRO PRODUTOS` e
`(TNP) FISCAL - CADASTRO ECF`) e decidir a fonte do ECF.

### V2 desfeita — margem e fiscal vêm da planilha, como no app da loja (27/10/2026)

José: "só preciso que seja IGUAL ao cadastro de produtos que funciona na loja". No oficial a margem padrão
**não é editável**: vem da aba `(TNP/LI/HORA - EXP.) GRUPOS/REF. - VLD SAIDA` (`M5:N130`), lida junto com as
regras fiscais. A V2 (coluna `margem_padrao` + campo na tela de grupos) foi **revertida**: a migration 0087
saiu do repositório antes de chegar a qualquer ambiente (só existiu no Postgres local, de onde a coluna foi
removida). O preço automático usa a margem da regra do grupo lida da planilha.

Fiscal pelo grupo **portado e ligado** (commits `c978a2f9` e `5e42e426`): o ERP lê as mesmas abas/faixas da
mesma planilha do oficial (configuração `GOOGLE_PRODUTOS_SPREADSHEET_ID`, abas com os padrões do oficial),
cache de 5 min, e classifica na criação, na troca de grupo/EAN e para completar quem está sem carga; só o
admin altera o fiscal manual. Pendências: a conta Google do ERP precisa ter acesso a essa planilha; a loja de
cada empresa é lida do `matricula_prefixo` (TNP/LI/HORA) — **confirmar em produção**; o de-para do SIA por
loja (LI/HORA) depende da tabela `sia_produto_depara` (migration a aprovar).

### Paridade completa com o app da loja — inventário do `origin/main` (27/10/2026)

José: "IGUAL ao cadastro de produtos que funciona na loja". O inventário do código de produção mostra que o
app faz bem mais que o cadastro. Situação de cada parte no ERP:

| Parte do app oficial                                                                                                                                 | No ERP                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Cadastro: regras de entrada, código interno, EAN, maiúsculas, balança, estoque por embalagem                                                         | feito (V1)                                           |
| Fiscal puxado pelo grupo (regras, de-para, reforma, ECF por nome, margem da aba de grupos)                                                           | feito; falta de-para SIA por loja                    |
| Listagem: ativar/inativar, lote do admin, importar da base                                                                                           | feito (V3); excluir não portado (decisão 3)          |
| Modelo BASE: só admin cria na BASE, herança travada, propagação BASE→loja                                                                            | falta (V5)                                           |
| Espelho na planilha: grava cada produto na aba `(BASE) CADASTRO PRODUTOS` + abas de loja, fila de reenvio                                            | falta                                                |
| TXT do CREARE (363 posições) publicado no Drive a cada gravação + download por lote dos robôs da loja (`/creare/produtos.txt`, entrega, confirmação) | falta — **é o que leva o cadastro ao PDV**           |
| De-para SIA por loja (upload do export do SIA), pesáveis, código de cadastro, duplicados históricos, Giulia/SIA                                      | falta                                                |
| Custo pela discriminação (DB-05), backfill fiscal, panorama fiscal, reconciliação planilha × banco, backup                                           | parcial (panorama/backup existem no ERP)             |
| Central de produtos (unificação)                                                                                                                     | existe outra versão no ERP                           |
| Vendas/Gerentes/metas/fator de pontos/curva ABC do app                                                                                               | fora do cadastro; o ERP tem módulo de vendas próprio |

Risco central: enquanto o app estiver no ar ele é quem escreve a planilha e publica o TXT do PDV. O ERP não
pode escrever nos mesmos lugares ao mesmo tempo (dois escritores). A troca precisa de um corte planejado.

Decisão de José (27/10/2026): seguir construindo tudo igual ao app **sem o ERP escrever na planilha nem
publicar o TXT do PDV** até um dia de virada combinado.

### V5 — modelo BASE igual ao app da loja (27/10/2026)

Como o app faz (`ProductService` do `origin/main`): produto **novo só o admin cria, sempre na BASE**; a loja
recebe por importação; editar a BASE é do admin e a mudança **desce campo a campo** para cada cópia que ainda
tinha o valor antigo da BASE (onde a loja tem valor próprio, ele fica). Na tela da loja, o que veio da BASE
fica em leitura, com o selo "segue a base" / "campos que não seguem mais" e "Voltar a herdar da base". Fiscal
e promoção são da loja (a BASE não tem esses cartões). Área de venda só na TNP.

No ERP (sem migration):

- a BASE é o `produtos_catalogo_base` que já existia, gravado com as **mesmas chaves do banco do app**
  (`dados_oficiais`). Um produto criado pelo ERP fica igual a um vindo do app: a cópia para a loja usa um só
  leitor (`montarPayloadBase`);
- `POST /api/produtos/base` (admin; `ONLY_ADMIN_CREATE` para os demais) cria com fiscal pelo grupo, código
  interno da sequência global e EAN = código quando vazio; `PUT /api/produtos/base/:id` (admin) repassa a
  edição às cópias na mesma transação; `GET` devolve o produto no formato do formulário. Unidade e grupo são
  escolhidos no cadastro da empresa de referência de quem cadastra e a BASE guarda **sigla e nome** — cada
  loja resolve para o seu id;
- foto na BASE (`/api/produtos/base/:id/foto`), no storage do ERP em `produtos-base/`; a cópia herda o mesmo
  arquivo. Foto que está no storage do app de origem continua bloqueando a cópia (ainda não transferida);
- o cadastro direto na loja (`POST /api/produtos`) **foi removido**, e também a cópia loja → loja
  (`/api/produtos/importar`, `/:id/exportar`): no app a loja só recebe pela BASE;
- a cópia monta a descrição como o app: nome + quantidade + medida (antes copiava só o nome);
- telas: `/produtos/novo` e `/produtos/base/:id` (base, só admin); `/produtos/:id` (loja) com os campos
  herdados travados e o selo de herança; a seção Fiscal mostra o estado em selo + motivo e só o admin digita
  os campos manuais.

Diferenças conscientes, a confirmar:

1. **Só a cópia da BASE fica travada.** O app trava todo produto de loja; no ERP os produtos de loja que já
   existem não têm BASE (ninguém poderia mais editar o nome deles). Depois da carga que liga cada produto à
   sua BASE, os dois comportamentos ficam iguais.
2. **Duplicado na BASE** usa o código único do app (`DUPLICATE_PRODUCT`) para nome **ou** EAN; o EAN repetido
   continua pedindo confirmação ("Cadastrar mesmo assim").
3. Enquanto o app estiver no ar, a BASE do ERP é alimentada pela Central (importação da carga do app). Uma
   edição feita no ERP num produto que veio do app é **sobrescrita** na próxima importação — o app ainda é o
   dono da BASE até a virada.

Efeito em produção ao publicar (precisa de decisão de quem opera): quem hoje cadastra produto no ERP sem ser
administrador (ex.: perfil de Compras, que tem "criar" e não "editar") passa a **importar da base**; para
completar estoque e locais na cópia da loja precisa da permissão "editar".

Verificação da V5 (27/10/2026, local): integração completa 1228 ok / 8 pulados / 0 falhas; front 845/845;
lint, arquitetura e migrations (87) ok; E2E de Produtos no navegador 55 de 58 na rodada inteira — as 3
falhas foram resolvidas e reconferidas isoladamente, restando só o 500 de `/api/caixa/status` do banco de dev
atrasado (`colaboradores.pdv_padrao_id` ausente, fora de Produtos); E2E de Compras afetados 2/2. Typecheck do
front sem erro em Produtos; numa instalação limpa do lock atual o `nuxt typecheck` não acha
`vue-router/volar` (igual na `main`) e acusa 2 erros de `$vuetify` em Compras — problema de ambiente, não
desta entrega.

### De-para do SIA por loja (27/10/2026) — migration 0087 aprovada por José

Como o app faz (`creare/sia-depara.parser.ts`, `depara-upload.service.ts`, tela `produtos/depara-sia`): o
admin envia a exportação do SIA Supervisor de uma loja; a prévia confere sem gravar; gravar **substitui o
de-para da loja inteiro** com a frase "SUBSTITUIR O DE-PARA DESTA LOJA". Recusa barras apontando para dois
produtos, `coditem` repetido, arquivo só de entrega e pesável sem Pesável/Validade; pesável sem tecla recebe
`000`; linhas de entrega (código ≥ 700000) ficam de fora. O de-para é a fonte do fiscal de LI e HORA
(alíquota ECF, redução, grupo) e do `coditem` que o importador do CREARE usa como chave.

No ERP: tabela `sia_produto_depara` (0087, mesmas colunas do app com `empresa_id` no lugar do texto da loja;
aplicada só no banco local); leitor portado em `shared/src/produtos/sia-depara.ts` com os casos do teste do
app; `POST /api/produtos/sia-depara/previa` e `POST /api/produtos/sia-depara` (só admin); tela
`/produtos/depara-sia`, a partir da Manutenção. As tabelas fiscais leem o de-para por loja (prefixo de
matrícula da empresa) e são invalidadas ao importar.

Diferença consciente: o ERP aceita **.xlsx e .csv**; o `.xls` antigo exige biblioteca (o app usa o pacote
`xlsx` do npm, que tem falhas de segurança conhecidas para arquivo malicioso). Até decidir, salvar o `.xls`
como `.xlsx` no Excel.

### Backfill fiscal e revisão independente (27/10/2026)

- **Backfill da carga fiscal** (oficial `BackfillFiscalService`): `POST /api/produtos/fiscal/backfill`, só
  admin; confere por padrão e grava só com `aplicar`; cursor por id, até 500 por rodada; entra quem não tem
  fiscal ou está `nao_classificado`/`parcial`/`fonte_indisponivel`; grava pelo MESMO caminho do cadastro.
  Na Manutenção, o cartão "Carga fiscal" tem Conferir e Completar. Não escreve na planilha.
- **Revisão independente** (agente só de leitura) sobre BASE e de-para. Corrigido: unidade/grupo sem par na
  loja agora fica de fora só naquele campo (antes a loja inteira deixava de herdar); troca de nome vinda da
  BASE grava histórico; edição da BASE não trava pela unidade atual; de-para com trava por empresa, admin
  conferido antes de ler o arquivo e empresa sem loja recusada. O achado "a loja também herda fiscal,
  custo e estoque" veio de outra branch do app — no `origin/main` a lista de campos herdados é a que o ERP
  usa.
- **Regra até a virada (dois escritores):** enquanto o app estiver no ar, **produto novo continua sendo
  cadastrado no app**. Se o ERP também criar na BASE, os dois sistemas podem gerar o mesmo código interno, e a
  importação da Central sobrescreve a BASE do ERP sem repassar às lojas.

### TXT do PDV (CREARE) e espelho na planilha — migration 0088 aprovada por José (27/10/2026)

José aprovou a 0088 como proposta (fila da planilha com `empresa_id` anulável para a BASE,
`proxima_tentativa_em`, cascade nos cursores, itens do lote em jsonb) e pediu para **não ligar escrita até a
virada**. Aplicada só no banco local; a FK da BASE na fila ganhou nome curto (o gerado passava de 63 bytes).

- **Gerador do TXT** (363 posições): layout e gerador do app copiados literalmente para o shared, com os 51
  testes oficiais passando.
- **Exportação** (porte de `creare.service`/`creare-export.repository`):
  - `GET /api/creare/produtos.txt` traz o catálogo completo; com `modo=pendentes` gera o lote incremental.
  - `GET /api/creare/lotes/pendente`, mais `POST .../entrega` e `POST .../confirmar` (os dois por hash).
  - O robô autentica por `Bearer CREARE_EXPORT_TOKEN` e informa `?loja=`; sem token, vale a sessão.
  - `GET /api/produtos/creare/saude` dá o diagnóstico (só admin).
  - A trava por loja é a linha da empresa, e não `pg_advisory` (o ERP proíbe SQL cru).
  - `CREARE_EXPORT_ENABLED=false` por padrão. A publicação no Drive foi portada depois (ver a seção
    seguinte).
- **Espelho na planilha:**
  - O mapa das colunas e a grafia numérica do Creare foram copiados literalmente, com os 44 testes oficiais.
  - A fila `produtos_planilha_sincronizacoes` recebe toda gravação na mesma transação: loja, BASE, foto,
    herança, status e backfill.
  - Na falha, a espera dobra (1, 2, 4… até 60 min), com teto de 8 tentativas. O sucesso **zera o contador**:
    no app ele contava a vida inteira do produto, e um produto muito editado desistia na primeira falha.
  - Rotas `GET /api/produtos/planilha/fila` e `POST /api/produtos/planilha/reenvio`, só admin.
  - `GOOGLE_PRODUTOS_ESPELHO_ENABLED=false` por padrão: desligado, nada entra na fila.
  - O escritor real foi portado depois (ver a seção seguinte).

### Escritor da planilha e publicação no Drive — portados, desligados (27/10/2026)

José autorizou ("Sim, segue") portar o escritor real e a publicação no Drive, **sem ligar nada**.

- **Escritor** (`produtos-planilha-escritor.ts`, porte do `ProductSheetService`):
  - Acha a linha pelo UUID na coluna `ID`. Na BASE o UUID é o `id_origem` (o mesmo id do app), então as
    linhas que o app já criou são reencontradas.
  - Produto novo da BASE segue a ordem do oficial: aumenta a grade, reserva a linha gravando **só o ID**
    (RAW), registra a linha na fila e copia formato e validação da linha-modelo 12 (duas requisições).
    Depois repõe as fórmulas que faltam e grava as células de entrada.
  - Coluna que a linha calcula nunca recebe valor. Texto vai RAW; número, hora e percentual vão
    USER_ENTERED. A planilha nova é detectada pelos rótulos da linha 3; a antiga continua suportada para a
    BASE.
  - A cópia da loja grava só a faixa dela (`TNP - CADASTRO`) na linha do produto da BASE. **Nunca cria
    linha**: sem a linha da BASE, falha com o motivo e não recadastra o produto. É a regra oficial de 25/09,
    a do `syncStoreProducts`; no oficial, a edição avulsa da loja ainda podia reservar uma linha.
  - As abas `(TNP)` e `(LI) CADASTRO PRODUTOS` recebem a mesma linha, cada uma só com os produtos da sua
    loja. HORA fica fora.
  - Fila em processo: uma gravação de cada vez, como no oficial.
- **Drive** (`produtos-creare-drive.ts`, porte do `CreareDriveService`):
  - Depois do commit, publica `cadastro-{loja}.txt` com o catálogo inteiro da loja. A BASE republica todas
    as lojas.
  - Só atualiza um arquivo que já existe: ele é criado uma vez por uma pessoa.
  - Nunca derruba o salvamento. Estados: publicado, desligado, sem_pasta, sem_arquivo, sem_depara,
    sem_produtos, falhou.
- **Diferenças conscientes em relação ao app:**
  - Credencial: o ERP usa a OAuth da conta Google dele, e não a conta de serviço. Na virada, a planilha e
    as pastas da loja precisam estar compartilhadas com essa conta.
  - O espelho roda pela fila (worker de 5 min mais "Reenviar"), não logo depois de salvar.
  - Não foram portados o espelho legado por posição das abas de loja (`espelharVarios`), a limpeza da
    linha na exclusão (o ERP não exclui produto) nem o health da planilha.
  - O ERP não guarda o rótulo "ATÉ x%" da promoção: a coluna `DESCONTO ATÉ` fica vazia.
- **Correções da revisão independente (mesmo dia):**
  - **Edição durante o reenvio:** uma edição feita enquanto o reenvio escreve não é mais marcada como
    sincronizada. A fila só conclui se `atualizado_em` não mudou desde a leitura.
  - **Google fora do ar com o cache frio:** a cópia da loja fica na fila com falha, em vez de sair como
    sincronizada.
  - **Produto da BASE que já está na aba sem o ID** (carga que entrou lendo a planilha):
    - o escritor recusa reservar linha nova quando o `CODIGO INT.` já aparece na aba, e diz em que linha;
    - ligar essa linha ao produto continua sendo decisão de gente.
    - **Antes de ligar o espelho, conferir se a coluna ID da planilha de produção está preenchida.**
  - **Drive:**
    - a importação em lote publica uma vez no fim, não uma vez por produto;
    - o cliente do Drive tem prazo (`GOOGLE_PRODUTOS_TIMEOUT_MS`);
    - ativar ou inativar produto também republica o arquivo.
  - **Escritor:**
    - empresa "SEM LOJA" não escreve na planilha;
    - `V. VENDA PONTUAL` fica vazio com cálculo automático, como no oficial, onde é o preço digitado.
- **Clientes reais:** os dois clientes Google recusam rodar sob teste, como no oficial. Os testes usam uma
  planilha em memória (`tests/setup/planilha-falsa.ts`).
- **Flags, todas `false`/vazias por padrão:**
  - `GOOGLE_PRODUTOS_ESPELHO_ENABLED` e `GOOGLE_PRODUTOS_SPREADSHEET_ID`;
  - `GOOGLE_PRODUTOS_LOJA_TABS`, `GOOGLE_PRODUTOS_DEFAULT_LOJAS` e `GOOGLE_PRODUTOS_TIMEOUT_MS`;
  - `CREARE_DRIVE_ENABLED` e `CREARE_DRIVE_FOLDERS_JSON`.
- **Para a virada:**
  1. Aplicar as migrations 0084/0087/0088 em produção (autorização própria).
  2. Configurar `CREARE_STORE_CONFIG_JSON`, o token do robô e `CREARE_DRIVE_FOLDERS_JSON`.
  3. Compartilhar a planilha e as pastas com a conta Google do ERP.
  4. Desligar a escrita do app.
  5. Ligar as flags do ERP.
  6. Conferir um produto na planilha e no TXT.
  7. Apontar o robô da loja para o ERP.
  - Nunca deixar os dois escrevendo ao mesmo tempo: as linhas se trocariam.

### Manutenção: pesáveis portados; código, custo e duplicados aguardam decisão (28/10/2026)

**Pesáveis portados** (tela `/produtos/pesaveis`, link na Manutenção, só para administrador). São os três cards de
pesável da `manutencao` do app. Os planos foram copiados literalmente para o shared, com os 32 testes
oficiais.

| Ferramenta             | Loja    | O que faz                                                                                                                                  | Frase                        |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Pela exportação do SIA | só TNP  | Quem o SIA marca `Pesável = S` vira S, tecla 000 e a validade do SIA, no produto e no de-para. Casa só pelo código interno.                | `ATUALIZAR PESAVEIS TNP`     |
| Classificar            | TNP, LI | Dá valor a quem não tem, nesta ordem: cadastro, depois de-para, depois N/0/0. Conflito bloqueia, ou mantém o cadastro e corrige o de-para. | `CLASSIFICAR PESAVEL {loja}` |
| Padronizar             | TNP, LI | Todo ativo vira S/000/5. Quem tem barras próprias fica N, por padrão, como no app. Sobrescreve.                                            | `TODOS PESAVEIS {loja}`      |

- **Como grava:** a prévia não grava nada. Gravar exige a frase e o hash da prévia; se o arquivo ou o cadastro
  mudaram no meio, a resposta é 409 e nada é gravado.
- **Diferenças em relação ao app:**
  - o app aceita `.xls`; o ERP só lê `.xlsx` e `.csv`, a mesma pendência do de-para;
  - o app libera para quem tem a tela de Manutenção; o ERP exige administrador.
- **Fora do porte:**
  - `pesavel-sia-reconcile`: é só um script de linha de comando que lê a aba "BASE SIA FULL", e o
    Classificar já cobre o mesmo caso pelo de-para;
  - `giulia-sia`: depende de produto da BASE criado por uma pessoa específica (`created_by_name`), do histórico
    de código interno e da BASE como linha de `products`. Nada disso existe no ERP.

**Aguardam decisão:**

- **Código de cadastro** (alinhar o `codigo_interno` ao `coditem` do SIA, em lote ou por decisão):
  - o motor é puro, mas a gravação precisa de uma tabela de **histórico de código interno**, que o ERP não
    tem. É migration nova: mostrar o SQL antes;
  - o lote troca até 200 códigos por vez, na BASE e nas cópias.
- **Custo pela discriminação (DB-05):**
  - **fórmula de dinheiro**: custo = custo unitário da nota mais recente × `qtCad`, arredondado;
  - no ERP o custo é por empresa e a BASE não tem custo; é preciso decidir onde gravar;
  - a fonte é outra planilha (MER), que precisa de configuração própria.
- **Duplicados históricos** (aposentar os códigos 00001–00428 que duplicam o SIA 10000–13126):
  - precisa do status `unificado` e de uma tabela de merges, ou seja, migration;
  - muda listagens, TXT e planilha;
  - é preciso decidir se a unificação é feita no ERP ou se o ERP só importa o resultado do app.
