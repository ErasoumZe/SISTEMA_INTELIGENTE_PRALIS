# 57 — Fluxo de Compras definido por José (22/10/2026) — REGRA VIGENTE

> José, 22/10/2026: "vale o que eu vou falar agora". Este documento **substitui** os documentos 52, 53, 54 e 56
> em tudo o que conflitar com ele (lista no §9). Onde ele não fala, os anteriores continuam valendo.

## 1. Princípio das telas

Cada tela faz **uma** função, é limpa e funcional, sem regra escrita em excesso. Função que sobra vira **módulo
próprio no menu de Compras**. Vale para todas as telas de Compras.

| Tela (menu Compras)            | Só faz isto                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Estoques de produtos           | ver o estoque (não muda nesta rodada)                                            |
| Conferências de estoque        | agendar conferências e fazer a contagem do dia                                   |
| Agendamento de pedidos         | agendar pedidos (o visual de 21/10 está aprovado)                                |
| Pedidos                        | pedido rápido + a matriz de pedidos e seus status                                |
| **Cadastro de compras** (novo) | catálogo fornecedor–produto, histórico de compras e preço-base (saem de Pedidos) |
| Fornecedores / Produtos        | cadastro, sem mudança agora (fornecedor: o essencial é nome e WhatsApp)          |

## 2. Agendamento de conferência de estoque

- Igual ao agendamento de pedido: mesma recorrência (doc 56 §3), grupo e subgrupo, área, setor/local.
- Além dos grupos normais, pode escolher **mais vendidos, mais comprados ou que mais dão lucro** (top 20% dos
  últimos 3 meses, como as bolinhas).
- Escolhe **quem vai contar** (colaborador com permissão de conferência).
- Na data: **notificação no sino** dessa pessoa; ela abre a tela de conferência de estoque.
- Tela de conferência: lista **as conferências a fazer e as já feitas**. Ao abrir a do dia: card com grupo, área e
  setor, e a **lista de produtos com a quantidade em estoque e um campo para a quantidade contada**; salvar.

## 3. Agendamento de pedido — o envio é AUTOMÁTICO

- Chegou a data: cada produto que tem **fornecedor vinculado com WhatsApp** vai **sozinho** para o fornecedor;
  cada fornecedor recebe **os seus** produtos (ex.: Coca 2 L, 1,5 L e 250 ml vão juntos para a Coca-Cola).
  Ninguém copia link nem abre o próprio WhatsApp: **o sistema envia pelo WhatsApp do fornecedor**.
- Produto **sem fornecedor** (ou fornecedor sem WhatsApp) fica **"A fazer"** na tela de Pedidos; o comprador vincula
  o fornecedor e envia — e esse envio também é automático. Um produto sem fornecedor não segura os outros.
- O que foi enviado aparece em Pedidos como **Enviado**.

## 4. Pedidos — matriz limpa

- Mantém o **Pedido rápido** como está (item em falta, um fornecedor); ele também envia sozinho pelo WhatsApp.
- No lugar da fila: **matriz** com os status nas colunas — **A fazer, Enviado, Cotado, Retornado, Comprado, Recebido
  parcialmente, Recebido** — e os fornecedores nas linhas, com seletor/busca de fornecedor. Clicar numa célula
  mostra os pedidos daquele fornecedor naquele status.

## 5. A cotação do fornecedor (formulário) e a regra do preço

- Formulário **limpo, estilo Google Forms**, sem texto de regra. Por item: nome, quantidade pedida e o **valor de
  referência** (o último preço pago ou cotado por nós, daquele ou de outro fornecedor do mesmo produto).
- O fornecedor responde **valor (obrigatório)** e **a quantidade que tem**, ou marca **"não tenho"** ou **"não
  trabalho mais com este produto"**. Frete, forma de pagamento, prazo de entrega e observação ficam, **opcionais**.
- **Quem responder primeiro com valor igual ou menor que a referência ganha o item** e salva a cotação: o item é
  dele nesta rodada, mesmo que outro responda mais barato depois.
- **Na próxima compra, a referência passa a ser o MENOR valor oferecido na rodada** (de qualquer fornecedor). Vale
  para todo produto; com um fornecedor só, não há disputa, mas a regra é a mesma.
- **Dois passos.** (1) valor e quantidade → salva → se ganhou, o item fica com ele (**Cotado**). (2) Ele separa a
  mercadoria e **ajusta a quantidade real** (pediu 5 kg, separou 5,2 kg) e envia → **Retornado**. O comprador
  confere e **confirma** → **Comprado**; o fornecedor recebe pelo WhatsApp o ok para entregar.
- O recebimento confere **exatamente o que foi confirmado** (os 5,2 kg), nunca o pedido original.

## 6. Decisões tomadas na implementação (José confirma)

1. "A fazer" também mostra o que a rodada não resolveu (item sem resposta, acima da referência, sem referência),
   com a decisão do comprador que já existe (exceção com a rodada fechada, doc 54).
2. A contagem da conferência **não mexe no estoque**: registra o contado e mostra a diferença (doc 53: só a aprovação
   de Compras/Gerência/Admin movimenta). _Pergunta 2 do envio de 22/10._
3. Fornecedor com **menos** do que o pedido: ganha o item com a quantidade que tem (o comprador vê a diferença ao
   confirmar). _Pergunta 3 do envio de 22/10._
4. "Não trabalho mais" fica registrado na resposta; o vínculo do catálogo **não** é desligado sozinho.
5. Envio automático sem o WhatsApp configurado: a mensagem fica **pendente** e a tela avisa; quando a conexão
   existir, a fila envia sozinha. O link manual só aparece se o envio falhar (contingência).
6. Agendamento de pedido: o produto entra com a quantidade padrão ou a sugestão do estoque (máximo − saldo); se
   não houver nenhuma das duas, a tela exige a quantidade padrão.
7. "Nova solicitação" manual com vários fornecedores sai da tela de Pedidos: o ad-hoc vira um agendamento para
   agora (repetição "Nunca") ou o Pedido rápido.

## 7. Conectividade (José executa ou faz junto)

WhatsApp: integração por API — **Meta WhatsApp Cloud API** (oficial, exige modelos de mensagem aprovados) **ou** um
gateway por webhook (Z-API, Evolution, n8n). Passo a passo e variáveis no relatório de entrega.

## 8. Schema

Migration 0067 (SQL no relatório de 22/10, aprovado antes de gerar): status `cotado` no pedido; quantidade e motivo
na resposta do fornecedor; fila de envio do WhatsApp; agenda e itens da conferência; aviso no sino da conferência.

## 9. O que este documento substitui

| Antes                                                                                    | Agora                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Doc 52 §5 / 53 / 56 §4: "recorrência nunca envia cotação"; "o comprador confere e envia" | Envio automático na data (§3)                                  |
| R-221 decisão 8: o fornecedor não vê o preço-base                                        | O fornecedor vê o valor de referência (§5)                     |
| Doc 54 E6 / R-218: base nova = custo da compra automática; "base só desce"               | Base nova = menor valor oferecido na rodada (§5)               |
| Doc 54 E5: compra automática nasce **confirmada**                                        | Nasce **cotada**; confirma depois do ajuste do fornecedor (§5) |
| Doc 53: recontagem cega                                                                  | A contagem mostra a quantidade em estoque (§2)                 |
| Pedidos com painel de catálogo/preço-base/solicitações e fila em abas                    | Pedido rápido + matriz (§4); cadastro em módulo próprio (§1)   |
