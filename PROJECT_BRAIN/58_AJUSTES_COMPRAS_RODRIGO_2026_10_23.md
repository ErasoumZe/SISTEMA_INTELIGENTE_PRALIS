# 58 — Ajustes de Compras pedidos pelo Rodrigo (23/10/2026) — REGRA VIGENTE

> José, 23/10/2026: o Rodrigo explicou como quer certos funcionamentos que tinham sido entendidos de outro jeito.
> Este documento **substitui o doc 57** em tudo o que conflitar com ele (lista no §10). Onde ele não fala, o 57 vale.
> As respostas de José às 4 dúvidas de implementação estão marcadas como **(José, 23/10)**.

## 1. Responsável pelo pedido

No agendamento de pedido escolhe-se **o responsável por executar o pedido**: é ele quem confere, põe as quantidades e
envia aos fornecedores. Só aparece quem pode enviar cotação (`pedidos_editar`).

## 2. Tela nova: Solicitação de compra

- Cada agendamento vira um **card** na tela **Solicitação de compra**, visível para o **responsável** daquele pedido
  (quem gere agendamentos vê todos).
- Chegou a data: o responsável recebe a **notificação no sino**; o card fica pronto para executar.
- Ele abre o card, vê a lista de produtos do agendamento (com a quantidade sugerida: a padrão ou máximo − saldo),
  **põe as quantidades** e **envia**. O envio vai sozinho pelo WhatsApp para cada fornecedor, cada um só com os seus
  produtos.
- Produto **sem fornecedor** no catálogo: o responsável **escolhe o fornecedor ali mesmo**; ao enviar, o vínculo vai
  para o catálogo **(José, 23/10)**.
- _Substitui o doc 57 §3 (envio automático na data sem conferência)._

## 3. Pedido urgente

"Pedido rápido" passa a se chamar **Pedido urgente** (mesmo funcionamento: um fornecedor, sai na hora).

## 4. Cotação por fornecedor (a matriz)

- A tela de Pedidos vira **Cotação por fornecedor**.
- **Linhas = produtos em cotação** (não fornecedores), com a legenda das **bolinhas**: mais vende, mais compra, mais
  lucro (doc 56 §2.1).
- **Colunas = situação**, e cada célula conta **quantos fornecedores** estão naquela situação para aquele produto:

| Coluna          | O fornecedor…                                                                               |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Enviado**     | recebeu a cotação (o número mostra para quantos fornecedores o produto foi)                 |
| **Cotado**      | abriu e preencheu preço e quantidade, mas **ainda não enviou** (rascunho) **(José, 23/10)** |
| **Retornado**   | **enviou** a resposta e ela chegou ao comprador **(José, 23/10)**                           |
| **Com aumento** | enviou preço **acima da referência** (ou o produto não tem referência): o comprador decide  |
| **Comprado**    | ganhou o produto (automático se ≤ referência, ou aceito pelo comprador)                     |

- **Com aumento**: o comprador abre a cotação do produto e escolhe **aceitar o preço** (só desta vez; a referência
  não muda) **ou aceitar e reajustar a referência** para a próxima rodada.
- Quando o produto é comprado, o pedido vai para a tela **Pedidos finalizados**.

## 5. Pedidos finalizados

Tela nova com os pedidos **comprados (a caminho)** e os **recebidos**. É onde se confere o recebimento.

## 6. Comprado e o ajuste de quantidade

- O preço aceito (automático ou pelo comprador) **compra na hora**: não há mais o passo Cotado → Retornado →
  Confirmar do pedido (doc 57 §5).
- **Depois de comprado**, o **fornecedor** ajusta a quantidade ao que tem em estoque (ex.: 5 kg → 5,2 kg), pelo mesmo
  link, **dentro da margem** de 10/20/30/40%, **sem nova aprovação**; o comprador vê o ajuste no pedido **(José,
  23/10)**.

## 7. Recebimento com devolução

Na conferência do recebimento, quem confere informa, por item, **quanto recebeu** e **quanto devolveu** (com o
motivo). Ex.: pediu 2 kg de tomate, chegaram 2 kg, 1 kg estragado: recebe 1, devolve 1. **O item fecha**: o estoque
entra só o recebido, e a devolução fica registrada **(José, 23/10)**. Item sem devolução e com falta continua como
hoje (recebido parcialmente, esperando o resto).

## 8. Data de entrega e horário de recebimento

- Na cotação do fornecedor, o campo "Prazo de entrega" passa a se chamar **Data de entrega**.
- No agendamento de pedido configura-se o **horário de recebimento da loja** (ex.: "recebemos das 7h às 11h"). Ele
  aparece para o fornecedor na cotação.

## 9. Decisões de 23/10 (José)

1. **Com aumento pode ser aceito com a cotação ainda aberta.** Aceitar compra na hora e o produto sai da cotação; um
   preço menor que chegar depois não ganha mais. _Substitui a R-221 (decisão de 21/10: exceção só com a rodada
   fechada) para o caso "Com aumento"._
2. **Migration 0068 aprovada** (SQL no chat de 23/10): horário de recebimento na agenda e na cotação; tabela
   `pedidos_devolucoes`. Aplicada só no banco de dev.
3. A mensagem de WhatsApp "pode entregar" sai quando o produto fica **Comprado** (não mais depois do Retornado).

## 10. O que este documento substitui

| Antes (doc 57)                                                    | Agora                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| §3: na data, a cotação sai sozinha, sem ninguém conferir          | Na data, o responsável confere na Solicitação de compra e envia                     |
| §4: Pedidos = matriz fornecedor × situação, com "A fazer"         | Cotação por fornecedor = matriz produto × situação (§4)                             |
| §5: vencedor nasce Cotado; fornecedor devolve; comprador confirma | Vencedor nasce Comprado; fornecedor ajusta depois, na margem (§6)                   |
| "Pedido rápido"                                                   | "Pedido urgente"                                                                    |
| Recebimento: só parcial (falta fica pendente)                     | Recebido + devolvido por item; devolvido fecha o item (§7)                          |
| §10 (referência só desce)                                         | Continua; mas "aceitar e reajustar" sobe a referência por decisão do comprador (§4) |
