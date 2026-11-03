# 59 — Direções do Rodrigo para Compras (reunião de 29/10/2026)

> **Fonte:** reunião do Rodrigo com o Marco, gravada em áudio (48 min). Transcrição automática, feita localmente em 30/10/2026. A transcrição completa fica fora do repositório, que é público. Nomes e palavras podem ter erro de transcrição; as direções abaixo foram conferidas no contexto.
>
> **Relação com os docs 57 e 58:** este documento **não muda** as regras de dinheiro dos docs 57 e 58 (referência, margem, quem ganha o item). Ele acrescenta o que o Rodrigo exige **antes** de o Compras ir para a loja e o que precisa mudar de nome e de comportamento.
>
> **Como ler:**
>
> - **[DIREÇÃO]** — o Rodrigo pediu explicitamente;
> - **[PRÉ-REQUISITO]** — sem isso o Compras não roda na loja;
> - **[DECIDIR]** — precisa de decisão do José ou do Rodrigo antes de implementar (migration, dinheiro ou regra que não ficou fechada).

## 1. A ideia central

**[DIREÇÃO]** O Compras **não funciona enquanto o cadastro de produtos e o de fornecedores não estiverem completos**.

- Sem "como se compra", sem estoque mínimo e máximo e sem fornecedor com WhatsApp, o pedido vira burocracia na mão de quem compra, e ela abandona a ferramenta.
- O sistema tem que **exigir** o cadastro completo e mostrar, numa lista, **o que falta preencher**.
- Palavras dele: _sem base de cada produto e sem fornecedor, é perda de tempo tentar implementar o pedido pelo aplicativo._

**Quem opera:** a pessoa que compra usa o celular, tem pouca familiaridade com sistema e hoje compra "no jeito rápido": liga, manda foto. A tela tem que ser **simples, sem informação demais**, e o caminho tem que ser automático.

## 2. Pré-requisitos, nesta ordem

**[PRÉ-REQUISITO] 2.1 Produto "liberado para compra"**

- Cada produto ganha uma marcação **"liberado para compra (pelo pedido)": sim ou não**.
- **Começa com todos em "não".** Quem compra vai liberando um a um, olhando a geladeira, as vitrines e a planilha.
- Ao liberar, completa no produto:
  - **como se compra** (caixa, fardo, pacote, com quantas unidades);
  - **estoque mínimo e máximo**;
  - **local**.
- **Não comprar não é inativar:** o produto continua ativo e continua vendendo no caixa; só sai da lista de pedidos.
- Estimativa do Rodrigo: dos ~2.375 ativos da TNP, **não passam de 300** os comprados por pedido, cerca de 4 dias de trabalho de quem compra.
- **[DECIDIR]** A coluna não existe no banco: precisa de migration, cujo SQL vai ao José antes do arquivo existir.

**[PRÉ-REQUISITO] 2.2 Cadastro de fornecedores completo**

- **Origem:** todos os fornecedores da discriminação de mercadorias das planilhas. A importação já foi feita na fase B3 (30/10): 159 fornecedores na Padaria Principal.
- **Cada um precisa de WhatsApp e categoria.**
  - Hoje **só 2 dos 159 têm WhatsApp**.
  - **[DECIDIR]** "Categoria" de fornecedor não existe no banco, então precisa de migration. Falta definir quais categorias são.
- Estimativa do Rodrigo: ~180 fornecedores, 30 por dia, em uns 6 dias.

**[PRÉ-REQUISITO] 2.3 Lista de pendências**

- **[DIREÇÃO]** Uma lista, dentro de cada cadastro, com:
  - os **produtos liberados para compra com cadastro incompleto**: sem como se compra, sem mínimo/máximo, sem fornecedor;
  - os **fornecedores pendentes**: sem WhatsApp, sem categoria.
- **[DIREÇÃO]** Um **cadastro rápido de fornecedor**, para o momento em que o produto não tem fornecedor.

Só **depois** de 2.1–2.3 o pedido automático entra na loja.

## 3. A quantidade do pedido é na embalagem de compra

**[DIREÇÃO]** Hoje o pedido pede "10" e ninguém sabe se são 10 unidades ou 10 caixas. Isso dá **dupla interpretação**.

- O pedido tem que dizer **"10 caixas com 24 unidades"**, usando o "como se compra" do produto. Exemplos dele: Coca em fardo de 6, 8, 12 ou 24; chocolate em caixa de 21; bala em caixa de 24.
- **[DIREÇÃO, próxima etapa]** O **fornecedor pode corrigir quantas unidades vêm na embalagem** (ex.: o chocolate passou de 21 para 24 por caixa), e isso atualiza o cadastro. Até lá, ele avisa no campo de observação da cotação.
- **[DECIDIR]** Pedir por embalagem muda o que o "valor" da cotação significa (preço da caixa ou da unidade) e a comparação com a referência. Isso é **regra de dinheiro**: definir antes de implementar.

## 4. O fluxo e os nomes das telas

**[DIREÇÃO]** São quatro etapas: **agendar → solicitar (fazer o pedido) → cotar → receber**.

| Etapa     | Tela                   | Mudança pedida                                                                         |
| --------- | ---------------------- | -------------------------------------------------------------------------------------- |
| Agendar   | Agendamento de pedido  | Sem quantidade (já é assim, doc 58 §2).                                                |
| Solicitar | Solicitação de compra  | O botão **"Conferir e enviar"** passa a ser **"Fazer o pedido"**.                      |
| Cotar     | Cotação por fornecedor | Sem mudança (doc 58 §4).                                                               |
| Receber   | **Pedidos a receber**  | Renomear de **"Pedidos finalizados"**: "finalizado" dá a entender que já foi entregue. |

Se o sistema não achar o fornecedor do produto, escolher o fornecedor na hora continua valendo, como **segunda via**.

## 5. Menu e permissões

**[DIREÇÃO]** O menu tem que seguir o **mapa (XMind) do Rodrigo**: cores, nomes e organização.

- A empresa é "entrada e saída": **Vendas, Mercadoria, Despesas, Retiradas e Contas**, mais **Resultados/Relatórios** e **Configurações**.
- **Os cadastros ficam em "Cadastro"**, cada um com a cor do setor a que pertence: grupos de mercadoria, unidades de medida, setores e locais, fornecedores, produtos…
- **Cada pessoa vê só o que executa no setor dela.** Ex.: quem compra vê Mercadoria e o que faz em Compras.
- **Permissões:**
  - os 5 grupos (vendas, contas, despesa, mercadoria, retirada);
  - visualizar, editar e excluir, inclusive depois de editado;
  - para o Rodrigo é a parte **mais complexa**, e ele quer organizar **depois de terminar** o sistema.
- **[DECIDIR]** É uma entrega própria, grande. Não cabe "hoje" sem cortar outra coisa.

## 6. Estoque (depois)

**[DIREÇÃO, futuro]**

- A venda baixa o estoque.
- Com tudo funcionando (caixa, integração, cadastros), **zera-se o estoque e conta-se a loja inteira** (estoque inicial).
- A partir daí, confere-se: estoque inicial + entradas − o que passou no PDV.

## 7. Como entregar

**[DIREÇÃO]**

- **Concluir a etapa, levar para a loja, treinar, ouvir, ajustar.** Sem isso sobram "ferramentas soltas prontas que ninguém usa".
- **Realismo:** hoje a loja usa os **aplicativos paralelos**, não o sistema oficial; o sistema oficial ainda é feito de pedaços.
- **Proposta:** reunião **José + Rodrigo + Léo** para alinhar a visão da operação.

## 8. Estado em 30/10/2026

**Números medidos em produção, só leitura:**

| Item                                   | Situação                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Grupos de mercadoria na loja           | **Feito** (fase B1: 79 grupos e 6 unidades)                                                     |
| Produtos da TNP iguais ao paralelo     | **Feito** (fase B2: 7.149)                                                                      |
| Fornecedores das planilhas no ERP      | **Feito** (fase B3: 159, com 2.000 vínculos fornecedor × produto e 11.580 compras no histórico) |
| Produtos ativos com "como se compra"   | **23 de 2.576**: falta quase tudo                                                               |
| Produtos ativos com estoque mín./máx.  | 2.047 de 2.576                                                                                  |
| Fornecedores com WhatsApp              | **2 de 159**                                                                                    |
| "Liberado para compra"                 | **Não existe** (precisa de migration)                                                           |
| Categoria de fornecedor                | **Não existe** (precisa de migration)                                                           |
| Pedido por embalagem                   | **Não existe** (precisa de decisão de dinheiro)                                                 |
| "Fazer o pedido" / "Pedidos a receber" | Falta renomear                                                                                  |
| Menu do XMind                          | Não feito                                                                                       |
