# 48 — Compras: as decisões que ainda travam o módulo

> **Atualização de 20/10/2026:** os bloqueios deste documento foram decididos na R-218 e no documento 53. Este arquivo permanece como histórico do estado anterior; não deve mais ser usado como regra vigente.

> Escrito em 13/10/2026, depois da prova funcional ponta a ponta do módulo Compras no navegador.
> **Nada aqui foi implementado.** Este documento existe para que José e Rodrigo decidam; enquanto a
> decisão não vier, o código não inventa regra.

## 1. Por que este documento existe

A prova no navegador fechou o ciclo operacional: sugestão de reposição, pedido manual com teto de
estoque, envio por WhatsApp, as quatro transições de situação, recebimento parcial e final somando
só o conferido, reenvio que não duplica saldo, e o extrato auditável com conferente e saldo
anterior/posterior.

O que sobrou **não é código faltando — é regra faltando**. Cada item abaixo mexe em estoque e pode
afetar custo e financeiro. Implementar por conta própria aqui seria inventar número de dinheiro.

## 2. Conferência de estoque: hoje só agenda

R-215 definiu que agendar ou concluir a agenda **não altera saldo**. Isso está implementado e
provado. Para a conferência virar operação completa, falta decidir:

| Pergunta                                                            | Por que trava                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Quem pode **iniciar** a contagem e quem pode **encerrar**?          | Define permissão nova; hoje só existe `conferencias_estoque_agendar`    |
| A contagem registra quantidade física **por produto** ou por local? | Muda o formato da tabela de contagem e da tela                          |
| Diferença entre contado e saldo vira **sobra** ou **perda** como?   | É o ato que altera saldo fora do recebimento: precisa de regra própria  |
| Exige **justificativa**? Exige **aprovação** de um segundo ator?    | Define se o ajuste é imediato ou entra em fila                          |
| O ajuste **afeta custo e DRE**, ou é só quantidade?                 | Se afeta, encosta em fórmula de dinheiro e exige confirmação do Rodrigo |
| Contagem **cega** (sem ver o saldo) ou aberta?                      | Contagem aberta tende a confirmar o sistema em vez de contar            |

Enquanto isso não for decidido, a tela continua agendando e dizendo que agendar não mexe em saldo.

## 3. Curva ABC: hoje é classificação manual

R-215 definiu ABC como `A`, `B` ou `C` digitado à mão, visível e filtrável. Foi uma decisão
consciente para não fingir cálculo. Para virar automática falta:

- **Critério**: giro em quantidade, faturamento, margem, ou uma combinação.
- **Período**: últimos 30, 60, 90 dias, ou mês fechado.
- **Cortes**: a regra clássica é 80/15/5 do acumulado, mas o corte é escolha do negócio.
- **Quando recalcula**: diário, semanal, ou sob demanda do comprador.

Sem venda, produção, perda e inventário gerando movimento confiável, qualquer cálculo automático
hoje mediria só o recebimento de compra, que é metade da história.

## 4. Reposição automática: depende de saldo confiável

O gerador `máximo − atual` é **sugestão assistida** acionada pelo comprador, nunca um robô. Só pode
virar automático quando saída por venda, consumo de produção, perda e ajuste de inventário também
emitirem movimento rastreável. Hoje o estoque só sobe, nunca desce: um gatilho automático em cima
disso compraria em cima de saldo que não existe mais na prateleira.

## 5. Agendador: hoje é lembrete

O campo de recorrência e data lembra o comprador de revisar. Para virar agendador de verdade falta
decidir: quem é o responsável por cada agenda, qual o aviso (e-mail, WhatsApp, notificação interna),
o que acontece quando a data passa sem ação, e se a recorrência gera uma nova sugestão sozinha.

**Atualização de 19/10/2026:** a forma temporal foi decidida na R-217 e no documento 52. A agenda
segue uma série de calendário, com ocorrências independentes; uma atrasada não bloqueia as
seguintes. Continua pendente somente o ato operacional de cada ocorrência: criar uma tarefa de
revisão ou criar diretamente um pedido `A fazer`.

## 6. Compras ↔ Mercadorias/NF-e: vínculo ainda não existe

Hoje os dois fluxos convivem no menu sem laço operacional. O comportamento pretendido é claro e
não conflita com R-213: **uma mercadoria ou NF-e pode ser relacionada ao pedido sem alterar
estoque**; o recebimento físico segue sendo o único ato que altera saldo.

O que falta é persistência: uma coluna `pedido_id` em `mercadorias`, com chave estrangeira. Isso é
**migration**, e migration neste projeto só sai com ordem explícita. O SQL será mostrado antes de
qualquer aplicação, e produção tem autorização própria.

## 7. O que NÃO está bloqueado

Para não confundir pendência de regra com pendência de trabalho, estes itens já estão prontos e
provados no navegador: menu por perfil, cadastro de fornecedor com WhatsApp, parâmetros de estoque
do produto, os cinco filtros da tela de Estoque, pedido manual com bloqueio de teto, sugestão de
reposição, envio por WhatsApp, ciclo de situações, recebimento parcial e final, idempotência do
reenvio e extrato auditável.
