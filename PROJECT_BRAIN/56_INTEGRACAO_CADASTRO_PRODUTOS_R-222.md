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
