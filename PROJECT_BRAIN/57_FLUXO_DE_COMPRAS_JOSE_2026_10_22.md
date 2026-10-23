# 57 — Fluxo de Compras definido por José (22/10/2026) — REGRA VIGENTE

> José, 22/10/2026: "vale o que eu vou falar agora". Este documento **substitui** os documentos 52, 53, 54 e 56
> em tudo o que conflitar com ele (lista no §9). Onde ele não fala, os anteriores continuam valendo.
>
> **Atenção (23/10/2026):** o doc **58** (ajustes do Rodrigo) substitui este em §3 (envio na data), §4 (tela de
> Pedidos), §5 (cotado → retornado → comprado), o "Pedido rápido" e o recebimento. A tabela do doc 58 §10 lista
> o que mudou.

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
- **Na próxima compra, a referência passa a ser o MENOR valor oferecido na rodada** (de qualquer fornecedor), **desde
  que ele seja menor que a referência atual: a referência só desce** (§10). Produto sem referência ganha a menor
  oferta. Vale para todo produto; com um fornecedor só, não há disputa, mas a regra é a mesma.
- **Dois passos.** (1) valor e quantidade → salva → se ganhou, o item fica com ele (**Cotado**). (2) Ele separa a
  mercadoria e **ajusta a quantidade real** (pediu 5 kg, separou 5,2 kg) e envia → **Retornado**. O comprador
  confere e **confirma** → **Comprado**; o fornecedor recebe pelo WhatsApp o ok para entregar.
- O recebimento confere **exatamente o que foi confirmado** (os 5,2 kg), nunca o pedido original.

### 5.1 O fornecedor marca o que também vende (José, 22/10)

A página do link mostra, além da cotação, a **lista de produtos que a padaria compra**. O fornecedor marca o que ele
também vende; o vínculo nasce **aprovado** (origem fornecedor) e, **a partir da próxima cotação**, ele recebe esses
produtos. Ex.: a Mercearia do Lu recebe a cotação do abacaxi; o Bahamas, a da mortadela e a do abacaxi. Só acrescenta:
desmarcar continua sendo no catálogo, pelo comprador. _Substitui, para este caso, o "vínculo nasce pendente" do doc 53._

## 6. Decisões tomadas na implementação

1. "A fazer" também mostra o que a rodada não resolveu (item sem resposta, acima da referência, sem referência),
   com a decisão do comprador que já existe (exceção com a rodada fechada, doc 54). Daí, os pendentes podem ir para
   um **Pedido rápido** com outro fornecedor.
2. **Confirmado por José (22/10): a contagem só registra.** Mostra o contado e a diferença, não mexe no estoque.
3. **Confirmado por José (22/10): margem de variação de 10, 20, 30 ou 40%**, escolhida no agendamento de pedido e no
   Pedido rápido (padrão 10%), **para menos e para mais, nos dois passos**. No passo 1, quem informa quantidade fora
   da faixa não ganha sozinho (vai para a decisão do comprador); no passo 2, a separação fora da faixa é recusada.
   Cotação aberta antes da margem existir aceita até a quantidade pedida, nunca a mais.
4. "Não trabalho mais" fica registrado na resposta; o vínculo do catálogo **não** é desligado sozinho.
5. Envio automático sem o WhatsApp configurado: a mensagem fica **pendente** e a tela avisa; quando a conexão
   existir, a fila envia sozinha. O link manual só aparece com o WhatsApp desconectado ou com falha (contingência).
   O token do link é trocado na hora do envio: o link que saiu no WhatsApp é o único válido.
6. Agendamento de pedido: o produto entra com a quantidade padrão ou a sugestão do estoque (máximo − saldo); sem
   nenhuma das duas, **não entra naquela data**. Se nada entrar, a data passa sem abrir cotação.
7. A aba "Solicitações" e o "abrir rodada" manual saíram da tela. Pedido fora da agenda = Pedido rápido. As rotas da
   API (`/api/compras/solicitacoes`, `POST /api/compras/rodadas`) ficam: o Pedido rápido e os testes as usam.
8. A exceção aprovada pelo comprador também nasce **cotada** (o fornecedor separa e devolve, como na compra
   automática).
9. Conferência: quem conta é o responsável da agenda ou quem tem permissão de agendar conferências; concluir exige
   todos os produtos contados. Editar a agenda vale para as próximas datas; o que já nasceu fica.

## 7. Conectividade (José executa ou faz junto)

WhatsApp: integração por API — **Meta WhatsApp Cloud API** (oficial, exige modelos de mensagem aprovados) **ou** um
gateway por webhook (Z-API, Evolution, n8n). Passo a passo e variáveis no relatório de entrega.

A API escolhe pelo `WHATSAPP_PROVEDOR` (`desligado` | `meta` | `webhook`; `teste` só nos testes):

- `meta`: `WHATSAPP_META_TOKEN`, `WHATSAPP_META_TELEFONE_ID`, e os modelos `WHATSAPP_META_MODELO_COTACAO` (padrão
  `cotacao_compra`, 4 variáveis: fornecedor, empresa, prazo, link) e `WHATSAPP_META_MODELO_CONFIRMACAO` (padrão
  `pedido_confirmado`, 3 variáveis: fornecedor, empresa, itens), idioma `WHATSAPP_META_IDIOMA` (padrão `pt_BR`).
- `webhook`: `WHATSAPP_WEBHOOK_URL` e `WHATSAPP_WEBHOOK_TOKEN` (Bearer); o corpo é `{ telefone, mensagem, tipo }`.

A fila tenta 5 vezes por mensagem (tick de 60 s); depois fica "Falhou" e o comprador reenvia.

## 8. Schema

Migration 0067 (SQL no relatório de 22/10, aprovado antes de gerar): status `cotado` no pedido; quantidade e motivo
na resposta do fornecedor; fila de envio do WhatsApp; agenda e itens da conferência; aviso no sino da conferência.

## 9. O que este documento substitui

| Antes                                                                                    | Agora                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Doc 52 §5 / 53 / 56 §4: "recorrência nunca envia cotação"; "o comprador confere e envia" | Envio automático na data (§3)                                  |
| R-221 decisão 8: o fornecedor não vê o preço-base                                        | O fornecedor vê o valor de referência (§5)                     |
| Doc 54 E6: base nova = custo da compra automática                                        | Menor valor oferecido na rodada, e só se descer (§5, §10)      |
| Doc 54 E5: compra automática nasce **confirmada**                                        | Nasce **cotada**; confirma depois do ajuste do fornecedor (§5) |
| Doc 53: recontagem cega                                                                  | A contagem mostra a quantidade em estoque (§2)                 |
| Pedidos com painel de catálogo/preço-base/solicitações e fila em abas                    | Pedido rápido + matriz (§4); cadastro em módulo próprio (§1)   |
| Conferência agendada para uma data só (sem lista de produtos)                            | Agenda com recorrência, lista com saldo e contagem (§2)        |

## 10. Decisão — a referência só DESCE (José, 22/10/2026)

No fechamento, cada produto compara a **menor oferta** da rodada com a referência vigente:

- menor oferta **menor** que a referência → a referência passa a ser a menor oferta;
- menor oferta **igual ou maior** → a referência **fica como está** (ofertas a 12 com referência 10: continua 10);
- produto **sem referência** → ganha a menor oferta.

Motivo: com um fornecedor só, uma oferta alta numa rodada não pode virar o preço que ele ganha sozinho na seguinte.
Quando o mercado sobe de verdade, as ofertas caem na decisão do comprador (exceção), e a exceção não vira referência.
Mantém a regra da R-218 ("a base só desce"). Código: `compras-fechamento.service.ts` (comparação em décimos de
milésimo, o preço-base é numeric(14,4)); testes em `tests/integration/compras/fechamento.test.ts`.

## 11. Estado da implementação (22/10/2026)

Branch `feat/compras-fase2-solicitacao-rodada-20261021`, só local. Migration 0067 aplicada **só no banco de dev**.
Telas, API, agendadores e testes de unidade e integração entregues; o WhatsApp sai quando a conexão for configurada
(variáveis no relatório de entrega). Produção: nada aplicado.
