# 56 — Agendamento de pedido (módulo novo de Compras)

> Tela desenhada por José em 21/10/2026, primeira do redesenho "tela por tela" de Compras. Este documento
> registra o que ele disse e o que decidiu; **nada foi implementado**. Complementa e, onde diz, **substitui** o
> doc 52 (recorrência como calendário). O que ainda está aberto está no §7: não implementar por suposição.

## 1. O que é

Um **módulo próprio no menu de Compras**, ao lado de "Conferências de estoque" (mesmo padrão: agenda de um
lado, cadastro do agendamento do outro). Não é aba da tela de Pedidos.

O uso real, nas palavras de José: o comprador vai a uma **área da loja** (ex.: Salão), escolhe o **local**
(ex.: Geladeira), olha na lista **todos os produtos daquele lugar**, marca os que precisam de pedido, define a
recorrência (ex.: bebidas, duas vezes por semana) e o tempo que o fornecedor tem para responder, e salva.

## 2. A tela

### 2.1 Lista de produtos (embaixo)

- Filtros: **grupo e subgrupo**, **área/setor da loja**, **local de estoque** e **local de venda**.
  (Subgrupo = grupo de mercadoria filho, `grupos_mercadorias.grupo_pai_id`. Área, setor e locais já existem no
  produto: `area_estoque`, `setor_estoque`, `local_venda_1/2` — o mesmo conjunto de filtros da conferência.)
- O comprador **marca** os produtos que entram no agendamento.
- Ao lado de cada produto, **legenda em bolinhas** (pode ter mais de uma):
  - **verde** — está entre os que **mais vendem**;
  - **amarela** — está entre os que **mais compramos**;
  - **azul** — está entre os que **mais dão lucro**.
- **Critério das bolinhas (decisão de José, 21/10):** top **20%** dos produtos da empresa nos **últimos 3 meses**:
  - verde: quantidade vendida (vendas integradas do PDV);
  - amarela: valor gasto comprando (histórico de compras, doc 55);
  - azul: lucro = (preço de venda − custo) × quantidade vendida.

### 2.2 Card "Agendamento de pedido"

- **Grupo e subgrupo** do pedido.
- **Recorrência** (§3).
- **Tempo de resposta da cotação**: é o prazo que o **fornecedor** vê para responder (o mesmo prazo da rodada).
- **Salvar** e **Cancelar**.

## 3. Recorrência (decisão de José, 21/10: "o que tiver mais opções")

José citou o Calendário do iPhone porque ele tem muitos tipos de repetição; na resposta, pediu **o mais completo**
— se o do Mac tem mais, segue o do Mac — e deu exemplos: uma vez por semana; um dia a cada três meses; **dia 2 de
janeiro e dia 3 de fevereiro**.

O Calendário da Apple grava a repetição no padrão aberto **iCalendar (RFC 5545, regra RRULE)**, o mesmo do
EventKit. Replicar o padrão dá o comportamento exato. Opções (superconjunto iPhone + Mac + datas avulsas):

| Opção             | Como funciona                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Atalhos           | Nunca · Todo dia · Toda semana · A cada 2 semanas · Todo mês · Todo ano · Personalizado                                               |
| Frequência        | Diária, semanal, mensal ou anual, **a cada N** (1 a 999)                                                                              |
| Semanal           | um ou **vários dias da semana**                                                                                                       |
| Mensal "Cada"     | um ou **vários dias do mês** (1 a 31)                                                                                                 |
| Mensal "No(a)"    | 1º, 2º, 3º, 4º, 5º ou último + domingo…sábado, **dia**, **dia útil** ou **fim de semana**                                             |
| Anual             | um ou **vários meses**, opcionalmente com "No(a)" (ex.: última sexta de março)                                                        |
| **Datas avulsas** | lista de datas sem padrão (ex.: 2/jan e 3/fev) — não existe na tela da Apple, mas existe no padrão (RDATE) e atende o exemplo de José |
| Término           | **Nunca**, **na data** ou **depois de N vezes** (esta última é do Mac)                                                                |
| Resumo            | frase no topo dizendo a regra ("A cada 2 semanas, na segunda e na quinta")                                                            |
| Editar/excluir    | **só esta** ou **esta e as futuras**, como no iPhone; nunca reescreve ocorrência passada (doc 52)                                     |

Data inexistente (dia 31 em mês de 30) **não vira outro dia**: é pulada, como no padrão (doc 52).

**Ferramentas:** José sugeriu REA e Ghidra. Elas analisam programas; não há Calendário da Apple neste PC (Windows),
e o comportamento já é público (RFC 5545 + documentação do EventKit + guias da Apple). A conferência usará uma
biblioteca de referência do padrão nos testes. Se José quiser, ele entra no iCloud.com pelo navegador e o REA lê
o editor de repetição da Apple (somente leitura); o login é dele.

## 4. O que acontece na data (decisão de José, 21/10)

Na data de cada ocorrência, o pedido **aparece para o comprador conferir**: ele pode **adicionar produtos** e então
**envia a cotação aos fornecedores por WhatsApp**. O sistema **não envia sozinho** (mantém doc 52 §6 opção 1 e doc 53).

- O fornecedor de cada produto vem da **base produto → fornecedor (e valor)**, que nasce da planilha: é o catálogo
  fornecedor–produto alimentado pelo histórico de compras (doc 55). Cada fornecedor recebe **os seus** produtos
  (rodada multi-fornecedor, doc 54).
- O fornecedor precisa estar **cadastrado com pelo menos nome e WhatsApp** (regra de convite já existente).
- O prazo de resposta vem do agendamento.

## 5. Relação com o que existe

- Usa o fluxo da Fase 2: a ocorrência vira uma **solicitação** pronta para conferir; enviar = abrir a **rodada**.
- Substitui de vez os campos antigos `pedidos.data_agendada` e `pedidos.recorrencia` (legado; a remoção entra na
  mesma entrega, regra-mãe).
- Doc 52: as tabelas `pedidos_agendas`/`pedidos_agenda_ocorrencias` seguem como base; ganham produtos marcados,
  grupo/subgrupo, prazo de resposta, datas avulsas e término por quantidade.

## 6. Fora desta tela

A tela de Pedidos atual (painel com catálogo, histórico, preço-base, solicitações) será redesenhada por José,
tela por tela. Até lá, nada novo entra nela.

## 7. Ainda em aberto (perguntar, não supor)

1. **Quantidade**: o agendamento guarda quantidade por produto, ou ela é preenchida na conferência (sugestão pelo
   estoque mínimo/máximo da data)?
2. **Tempo de resposta**: em horas, em dias, ou data e hora fixa a partir do envio?
3. **Produto com mais de um fornecedor** no catálogo: a cotação vai para todos eles, ou só para o principal?
4. **Produto sem fornecedor** no catálogo: bloqueia o envio daquele item, ou o comprador escolhe na conferência?
5. **Área × setor × local**: "Salão" é `area_estoque` e "Geladeira" é `local_venda`? (conferir com a planilha do Rodrigo)
6. **Quem recebe o aviso** de que o pedido do dia está para conferir (quem criou o agendamento, ou todo o cargo Compras)?
