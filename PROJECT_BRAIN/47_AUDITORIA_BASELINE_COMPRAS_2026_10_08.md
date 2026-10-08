# 47 — Auditoria-base e entrada em Compras — 08/10/2026

> **Fonte do retrato:** código da `origin/main` no commit `4aeb3d7e8c8c0e1ccd93cac1f00da761b6f2a997`, conferido em 08/10/2026. O deployment `sistema-pralis` no Coolify estava **Running / healthy** neste mesmo commit; último deploy bem-sucedido em 26/09/2026. Não houve deploy, restart, migration nem consulta/escrita direta no banco para produzir este documento.
>
> Este documento supera descrições antigas quando elas conflitam com o código atual. Ele é um **baseline técnico e funcional**, não uma decisão de negócio nova.

---

## 1. Resumo para decidir o próximo passo

O Sistema Pralis é um monorepo operacional da TNP, com API Fastify, front Nuxt/Vuetify, PostgreSQL/Drizzle, regras puras no `shared` e agente do PDV CREARE. A produção acompanha a `main` neste momento.

**Compras já existe parcialmente e não deve ser recriada:** há cadastros de produtos e fornecedores, pedidos manuais e de reposição, lançamento de mercadorias, importação/aprovação de NF-e e permissões próprias. O que falta é a parte que torna estoque confiável no dia a dia: movimentos, contagem, perda/sobra e a ligação explícita entre receber uma compra e alterar o saldo.

**Cofre financeiro já existe e não deve ganhar um segundo caminho:** ele é a conta configurada em `empresas.conta_cofre_id`, usada em transferências com lacre, devolução do Caixa, conferência física, divergência e trilha de cancelamento. Um novo cofre financeiro só pode entrar se substituir explicitamente esse modelo ou tiver uma finalidade contábil distinta que o Rodrigo aprove.

---

## 2. O que está rodando hoje

| Camada                | Responsabilidade real                                                                            | Evidência principal                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `api`                 | API autenticada, autorização por permissão, regras de Caixa, Compras, Cadastros, Integração e DP | `api/src/app.ts` registra os domínios; o hook de autenticação é default-deny |
| `web-vue`             | SPA Nuxt 4/Vuetify para operação diária                                                          | rotas em `web-vue/pages/`; menu em `web-vue/utils/menu.ts`                   |
| `db`                  | Schema Drizzle, migrations `0000` a `0049`, seeds e permissões-padrão                            | `db/src/schema/app.schema.ts`, `db/migrations/`                              |
| `shared`              | Contratos Zod e regras puras de dinheiro, data, estoque e pedidos                                | `shared/src/`                                                                |
| `integracoes-scripts` | Agente que lê o CREARE e envia vendas para a API                                                 | `integracoes-scripts/src/`                                                   |
| Coolify               | Build e execução em produção                                                                     | aplicação `sistema-pralis`, commit `4aeb3d7`, saudável em 08/10              |

O menu operacional agrupa Entradas, Transferências, Saídas, Resultados, Departamento Pessoal e Configuração. `Lançamentos` é uma categoria única para Despesas, Mercadorias e Retiradas; não há três entradas soltas concorrendo no menu (`web-vue/utils/menu.ts`).

---

## 3. Cofre financeiro existente — o que é e como é auditado

### 3.1 Modelo vigente

- A empresa aponta uma conta contábil de cofre por `empresas.conta_cofre_id` (`db/src/schema/app.schema.ts`).
- O dinheiro circula por `transferencias`, sempre com origem e destino em contas diferentes; os tipos aceitos são `abertura`, `suprimento`, `sangria` e `retorno`.
- A abertura recebe suprimento da Tesouraria; no fechamento, o retorno parte da conta do PDV para a conta de cofre configurada (`api/src/caixa/caixa.repository.ts`, `caixa.service.ts`).
- O lacre pertence ao evento de transporte, não a uma entidade malote reutilizável. A tabela/caminho de malotes foi removido; manter ou recriar esse caminho violaria a regra de caminho único.

### 3.2 Trilha de auditoria existente

| Fato auditado                                | Onde fica                                                     | Proteção atual                                                                         |
| -------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Criação/estado/cancelamento da transferência | `transferencias`                                              | status restrito, origem e destino obrigatórios, cancelamento exige ator, data e motivo |
| Lacre usado no transporte                    | `lacres` + `transferencias.n_lacre_doc`                       | vínculo por empresa e unicidade no fluxo                                               |
| Conferência que não bateu                    | `transferencias_conferencias_recusadas`                       | append-only, motivo obrigatório, `RESTRICT` contra apagar a prova                      |
| Contagem física que bateu ou divergiu        | `transferencias_conferencias_fisicas`                         | valores declarados/contados, conferente, data, observação obrigatória na divergência   |
| Alteração autorizada em Caixa                | `edicoes_caixa`                                               | ator, autorizador, token, antes/depois e observação                                    |
| Cancelamento recente                         | campos `cancelado_por`, `cancelado_em`, `motivo_cancelamento` | CHECK exige o trio consistente                                                         |

**Limite conhecido:** existem colunas históricas do fluxo de “solicitação ao cofre” sem escritor ativo (`solicitacao_cofre_em`, `executado_por`, `executado_em`). Elas não devem ser reutilizadas para um recurso novo sem migration e decisão explícita; apagá-las também seria uma migration separada.

### 3.3 Decisão pendente antes de qualquer “novo cofre”

José e Rodrigo precisam dizer qual dos três significados se aplica:

1. **Nova conta contábil** para um fundo de Compras — informar origem, destino, quem opera, quem confere, se usa lacre e se afeta fechamento de Caixa.
2. **Novo ponto físico de guarda** — informar se é apenas uma conta existente com nova operação física ou se exige segregação de saldo.
3. **Cofre documental de auditoria** — não é financeiro; neste caso será um repositório de evidências e não tocará `contas`, `transferencias` ou saldos.

Sem essa resposta, criar tabela, tela ou saldo seria inventar regra e duplicar a tesouraria atual.

---

## 4. Compras — o que já está implementado

### 4.1 Acesso e responsabilidade

O cargo **Compras** existe no seed e no catálogo de permissões. Vê Pedidos, Mercadorias, Fornecedores e Produtos; pode criar/discriminar Mercadorias e criar Produtos/Fornecedores. A aprovação de Mercadorias/NF-e e de Pedidos é atribuída à Gerência no padrão atual (`db/src/referencia-permissoes.ts`). A API revalida cada ato com `exigirPermissao`; não depende apenas de esconder botão no front.

### 4.2 Produtos e fornecedores

- Produtos têm cadastro, edição, foto no storage próprio, busca/filtros/ordenação/paginação no servidor e seletor reduzido para formulários (`api/src/produtos/`, `web-vue/pages/produtos/`).
- O produto armazena `quantidade_estoque`, mínimo, máximo, setor de estoque, locais de venda, promoção e dados satélite/fiscais (`db/src/schema/app.schema.ts`).
- Fornecedores têm listagem, criação, edição, importação e exportação; a lista reduzida é permitida para quem opera Mercadorias (`api/src/fornecedores/fornecedores.controller.ts`).
- A fonte executável de criação em massa continua sendo a planilha do Rodrigo; o antigo Pralis é apenas referência visual/histórica, conforme R-165 em `30_PRODUTOS_PRALIS_X_ERP.md`.

### 4.3 Pedidos

- `POST /api/pedidos` cria pedido manual; `POST /api/pedidos/gerar-automatico` cria uma sugestão quando `estoque atual <= mínimo`, na quantidade `máximo - atual`.
- Cada item salva um **snapshot** de estoque atual, mínimo e máximo para explicar por que o pedido foi gerado (`pedidos_itens`).
- O ciclo atual é `rascunho → aprovado`; somente rascunho pode ser editado ou aprovado (`api/src/pedidos/pedidos.service.ts`).
- A tela `/pedidos` lista, cria manualmente, gera sugestão automática, detalha e aprova. A própria página declara que a edição de itens do rascunho existe na API, mas ainda não possui UI (`web-vue/pages/pedidos.vue`).

### 4.4 Mercadorias e NF-e

- Mercadoria é o lançamento financeiro de compra, com itens, fornecedor, valores, documento/foto, aprovação, recusa e discriminação (`mercadorias` e `mercadorias_itens`).
- A fila de NF-e mostra compras importadas aguardando aprovação; a retaguarda pode decidir se a compra computa no financeiro (`/api/mercadorias/aguardando-aprovacao`, aprovar e recusar).
- Há testes de integração específicos para a aprovação de Mercadorias originadas de NF-e (`tests/integration/operacoes/aprovacao-mercadorias-nfe.test.ts`).

---

## 5. Lacunas comprovadas para Compras operar de ponta a ponta

| Prioridade | Lacuna                      | Evidência                                                                                                                                                        | Consequência prática                                                                                |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P0         | Dados reais em produção     | O seed/planilha é idempotente, mas o registro histórico diz que a carga validada foi somente no dev; não foi feita consulta ao banco de produção nesta auditoria | Pedido, mínimo/máximo e relatórios não representam a operação até a carga ser validada e autorizada |
| P0         | Movimento de estoque        | `quantidade_estoque` é saldo no produto; a tela o deixa somente leitura e afirma que ele “só muda por movimentação”, mas não há domínio/tabela de movimentos     | Não existe trilha para receber compra, vender, contar, perder ou ajustar saldo                      |
| P0         | Recebimento da compra       | Pedido aprovado não cria Mercadoria nem movimento de estoque; Mercadoria aprovada não é apresentada como recebimento de Pedido                                   | A compra pode ficar financeira e o estoque pode continuar igual                                     |
| P1         | Automação de reposição      | Existe geração assistida pela pessoa usuária, não gatilho ao atingir mínimo nem prevenção de sugestões repetidas                                                 | O comprador precisa entrar na tela e gerar; risco de não repor ou duplicar pedido                   |
| P1         | Inventário, perdas e sobras | `estoque_produtos` e `perdas_sobras` aparecem na estrutura de menu, mas o backlog os identifica como placeholders/ocultos                                        | Sem contagem física não há diagnóstico de desvio                                                    |
| P1         | Decisões de operação        | Ainda falta definir como pedido chega ao fornecedor, menu próprio de estoque, regras de promoção, ficha técnica e critérios da Curva ABC                         | Não se deve automatizar comunicação ou fluxo que o Rodrigo ainda não aprovou                        |

Não é correto resolver a lacuna de estoque com campos livres no cadastro de produto: um saldo digitável apaga a causa do ajuste e não fornece auditoria.

---

## 6. Sequência proposta — entregas verticais, sem duplicidade

### Entrega 0 — decisão e auditoria de dados de produção (sem escrita)

Antes de código, fazer leitura controlada de produção: contagem de produtos, fornecedores, pedidos, mercadorias, contas/cofre; amostra dos vínculos; migrations aplicadas; e matriz efetiva do cargo Compras. O resultado vira anexo deste documento. Qualquer `UPDATE` histórico exige antes contagem e amostra para aprovação.

### Entrega 1 — recebimento de compra + movimento de estoque

Definir com Rodrigo o ato único: “receber a compra”. Ele deve vincular Pedido opcional, Mercadoria/NF-e, itens efetivamente recebidos, lote/local se necessário, aumento de saldo e ator/data/observação. Inclui schema/migration autorizada, API, tela, permissões, testes e remoção de qualquer ajuste paralelo de saldo.

### Entrega 2 — inventário, perdas e sobras

Criar contagem física por local/setor e lançar a diferença como perda, sobra ou ajuste aprovado, sempre a partir do movimento de estoque. Não criar uma segunda tela que altere `quantidade_estoque` diretamente.

### Entrega 3 — reposição automática com idempotência

Depois de movimentos confiáveis, decidir o gatilho e implementar rascunho único por produto/período, aprovação explícita e aviso ao Compras. O botão manual de sugestão deve sobreviver apenas se representar o mesmo caso de uso; caso contrário, ele é removido.

### Entrega 4 — visão de Estoque e relatórios de Compras

Só depois de haver histórico: saldo, mínimo/máximo, cobertura, pedidos pendentes, recebimentos e divergências; então Curva ABC com os cortes aprovados pelo Rodrigo.

---

## 7. Perguntas que precisam da decisão do José/Rodrigo

1. “Novo cofre” é uma conta financeira de Compras, um cofre físico, ou um cofre documental?
2. Um Pedido aprovado obriga recebimento parcial/total? Pode ser cancelado depois? Quem aprova?
3. Qual evento altera estoque: entrada pela NF-e, conferência física do recebimento, ou ambos em etapas diferentes?
4. O estoque será único por empresa, por loja, por setor/local ou por depósito?
5. Como o pedido chega ao fornecedor: telefone, WhatsApp, visita, site, e-mail ou integração? O sistema deve apenas preparar ou também enviar?
6. Perda, sobra e vencimento afetam só estoque, também custo/financeiro, ou exigem aprovação?
7. O cofre de Compras, caso financeiro, pode pagar Mercadorias diretamente ou todo pagamento continua em Contas a Pagar/Financeiro?

---

## 8. Limites honestos desta auditoria

Foi verificado código, schema, rotas, permissões, testes declarados e estado do deployment. Não foram executados testes nesta entrega documental, nem queries no banco de produção, login por todos os perfis, inspeção de dados pessoais, alteração de dados, migration, deploy ou reinício. A próxima auditoria de dados deve ser somente leitura até José aprovar qualquer correção.
