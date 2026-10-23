# 72 — Ajustes auditáveis de saldo das contas

**Decisão confirmada por Marco em 20/10/2026.**

## Regra

O campo **Fundo inicial** continua sendo apenas o ponto de partida da conta. O **Saldo atual** é derivado de fundo, entradas, transferências, lançamentos e ajustes; ele não é uma coluna mutável nem pode ser apagado ao editar o Fundo.

Quando for necessário corrigir ou reiniciar o saldo, o sistema registra um **ajuste de saldo** imutável com conta, empresa, saldo anterior, saldo desejado, diferença, justificativa, autor e data. O ajuste entra na mesma fórmula do saldo. Portanto, depois de um ajuste, novas saídas continuam abatendo e novas entradas continuam somando normalmente.

## Segurança e operação

- Somente **Administrador total** (`usuario_admin`) e usuário cujo cargo comece por **Tesouraria** podem criar ajustes ou executar a zeragem em lote.
- A zeragem não apaga vendas, transferências, despesas, retiradas ou mercadorias históricas. Ela cria um ajuste contrário para cada conta com saldo diferente de zero.
- A interface deve mostrar previamente as contas e seus saldos afetados, exigir justificativa e pedir confirmação explícita.
- Não há edição nem exclusão de ajuste pelo fluxo operacional; correção posterior é sempre outro ajuste, preservando a trilha.

## Escopo técnico

- Tabela: `ajustes_contas`.
- Projeção: `saldo atual = fundo + entradas - saídas + soma dos ajustes`.
- Rotas: ajuste individual e zeragem em lote, ambas protegidas pelo servidor.
- Migration associada: `0060_ajustes_contas.sql`.
