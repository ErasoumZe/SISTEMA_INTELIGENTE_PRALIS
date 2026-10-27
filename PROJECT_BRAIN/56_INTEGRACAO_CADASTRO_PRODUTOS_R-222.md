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
