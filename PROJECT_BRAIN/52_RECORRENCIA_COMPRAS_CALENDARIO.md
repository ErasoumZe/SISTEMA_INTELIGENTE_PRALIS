# 52 — Recorrência de Compras como Calendário

> **21/10/2026:** a tela e as decisões novas estão no doc 56 (agendamento de pedido), que resolve a pergunta do
> §6 (opção 1: o comprador confere e envia) e amplia a recorrência (término por quantidade e datas avulsas).

> Decisão de José em 19/10/2026. Este documento define a regra-alvo e o limite da primeira
> vertical. Nenhuma migration foi gerada ou aplicada; nenhum deploy foi executado.

## 1. Decisão confirmada

A recorrência de Compras segue uma **série de calendário**. As ocorrências são independentes:

- uma ocorrência atrasada não bloqueia as seguintes;
- concluir ou cancelar uma ocorrência não conclui nem cancela a série;
- editar somente uma ocorrência cria uma exceção;
- editar esta e as futuras encerra a série anterior antes da ocorrência escolhida e cria uma nova
  série vinculada à anterior;
- nunca se reescrevem ocorrências passadas.

## 2. Configuração funcional

O formulário deve oferecer:

1. **Não repetir**, diariamente, semanalmente, mensalmente ou anualmente.
2. Intervalo: a cada `N` dias, semanas, meses ou anos.
3. Na semana, um ou mais dias selecionados.
4. No mês:
   - no mesmo dia numérico; ou
   - por posição, como primeira segunda-feira ou última sexta-feira.
5. No ano, a data correspondente da série.
6. Término: nunca, em uma data, ou após `N` ocorrências.
7. Data e hora de início no fuso `America/Sao_Paulo`.

Datas inexistentes não podem ser inventadas. Exemplo: uma série configurada para o dia 31 não
deve virar silenciosamente dia 30 ou 28. O comportamento exato nesses meses será coberto por teste
de contrato antes da implementação da tela.

## 3. Estado atual que será substituído

Hoje `pedidos` guarda somente:

- `data_agendada`;
- `recorrencia` em `nenhuma`, `semanal`, `quinzenal` ou `mensal`.

Esses campos não suportam intervalo configurável, vários dias da semana, anual, término,
exceções nem edição parcial da série. Eles não serão ampliados com mais enums: a regra-alvo
precisa separar **série**, **ocorrência** e **pedido**.

## 4. Modelo técnico proposto

A migration a apresentar deve criar, no mínimo:

### `pedidos_agendas`

Uma linha por série, contendo empresa, nome, responsável, início, fuso, regra de recorrência,
estado da série, eventual série anterior e autoria. A regra será validada pelo contrato do servidor;
o navegador não enviará texto de recorrência arbitrário.

### `pedidos_agenda_ocorrencias`

Uma linha por data efetivamente materializada, com chave única por série e instante original,
data atual, situação, eventual pedido relacionado, conclusão/cancelamento e respectivos atores.
A chave única impede que duas execuções do agendador criem a mesma ocorrência.

O servidor materializará uma janela futura limitada, renovada de forma idempotente. Uma série
sem término nunca pode gerar infinitas linhas numa única transação.

## 5. Limites de segurança

- Recorrência não envia WhatsApp.
- Recorrência não confirma pedido.
- Recorrência não recebe mercadoria.
- Recorrência não altera estoque.
- Reprocessamento não duplica ocorrção nem pedido.
- Empresa, responsável, fornecedor e produtos devem pertencer à mesma empresa.
- Histórico passado permanece imutável ao editar a série.

## 6. Decisão ainda necessária antes do SQL

Ao chegar a data de uma ocorrência, o sistema deve:

1. **Recomendado:** criar uma tarefa de revisão, e o comprador decide se gera a sugestão ou o
   pedido `A fazer`; ou
2. criar automaticamente um pedido `A fazer`, ainda sem enviar ou confirmar.

Essa escolha define se a ocorrência referencia uma tarefa própria ou nasce obrigatoriamente
vinculada a `pedidos`. O SQL será mostrado depois dessa resposta e antes de gerar a migration.

## 7. Prova obrigatória da futura vertical

- diária a cada dois dias;
- semanal em dois ou mais dias;
- mensal por dia numérico;
- mensal por posição do dia da semana;
- anual;
- término por data e por quantidade;
- ocorrência atrasada sem bloquear a seguinte;
- editar somente esta;
- editar esta e as futuras;
- cancelar somente uma ocorrência;
- materialização repetida sem duplicidade;
- nenhuma alteração de estoque, cotação ou confirmação automática.
