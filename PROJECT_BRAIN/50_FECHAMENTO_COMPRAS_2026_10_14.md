# 50 — Fechamento técnico de Compras, Pedidos e Fornecedores — 14/10/2026

> Escopo: branch `feat/compras-recebimento-estoque`, rebaseada sobre `origin/main` em 14/10/2026. Nenhuma ação foi feita em produção: sem deploy, sem migração produtiva, sem push, PR ou merge.

## Resultado da rodada

Os bloqueios técnicos da auditoria 49 foram fechados no código e comprovados no ambiente local:

1. A branch foi rebaseada duas vezes: primeiro para absorver a base que estava 97 commits à frente e, no fechamento, sobre a `main` que avançou durante a rodada. Ao final, `git rev-list --left-right --count origin/main...HEAD` retornou `0 30`.
2. O seed de desenvolvimento passou a limpar corretamente o domínio de Compras antes de apagar os perfis e passou a reutilizar unidade e grupos-base referenciados por produtos. Em banco local limpo, três execuções consecutivas concluíram com sucesso.
3. O ciclo de pedido passou a recusar `enviado → confirmado` diretamente. A sequência permitida é `A fazer → Enviado → Retornado → Confirmado → Recebido parcialmente → Recebido`; cancelamento continua terminal.
4. `pages/pedidos.vue` foi reduzida de 464 para 203 linhas. O estado e as operações foram extraídos para `web-vue/composables/usePedidos.ts`; o contrato do formulário ficou em `web-vue/types/pedidos.ts`.
5. A fila de pedidos deixou os dois filtros concorrentes (chips e select) e passou a ter abas únicas, na ordem do ciclo operacional, com contagem por etapa.
6. A projeção completa de fornecedor passou a ter teste que exige também `whatsapp`. A projeção operacional reduzida continua expondo somente `id`, `empresaId` e `nome`.

## Prova executada

| Verificação | Resultado |
| --- | --- |
| Seed local repetido | Três execuções concluídas após recriar somente o volume de desenvolvimento |
| Playwright Compras | 6 de 6 cenários aprovados: menu, fornecedor/WhatsApp, produto/filtros, ciclo, recebimento/idempotência/extrato e responsividade |
| Teste de transição inválida | A suíte de Pedidos cobre `enviado → confirmado` recusado e recebimento antes da confirmação recusado |
| Vitest unitário | 39 arquivos, 375 testes aprovados |
| Vitest integração | 132 arquivos, 1.007 testes aprovados e 8 ignorados |
| Lint global | aprovado |
| Check global | aprovado; inclui texto, arquitetura, 58 migrations e TypeScript de todos os workspaces |
| Rebase final | `range-diff` confirmou todos os patches de Compras; a atualização de `main` trouxe somente a animação de login e seu teste |

Durante a primeira execução completa, a integração de credores revelou que o teste de contrato completo ainda esperava quatro campos. A API já retornava corretamente `whatsapp`; a expectativa foi atualizada e a suíte completa foi repetida, verde.

## WhatsApp: limite real e decisão técnica recomendada

O botão atual abre `wa.me`, monta o texto com fornecedor e itens e registra `enviado`. Ele não transmite uma mensagem pelo sistema e não pode receber resposta. Portanto, ele **não satisfaz** a necessidade de enviar a um número de teste e fazer a resposta voltar ao Comprador.

Não foi enviado WhatsApp externo nesta rodada. Não há no repositório credencial de provedor, Phone Number ID, token, App Secret, template aprovado, URL pública HTTPS ou webhook configurado. Inventar esses elementos, ou simular que uma resposta chegou, seria uma falha de auditoria.

Recomendação para a próxima entrega vertical, quando a empresa disponibilizar os ativos da Meta WhatsApp Cloud API:

1. Cadastrar o número corporativo no Meta Business e fornecer Phone Number ID, token de acesso de servidor, App Secret e verify token em cofre de segredos — nunca no Git.
2. Aprovar um template utilitário de pedido que leve referência não adivinhável do pedido, fornecedor e itens.
3. Criar persistência de envio/retorno correlacionada a pedido, id externo da mensagem e evento auditável; isso requer migration aprovada antes de implementação.
4. Expor webhook HTTPS com verificação GET e assinatura `X-Hub-Signature-256`; rejeitar duplicidade pelo ID da mensagem.
5. Ao chegar resposta de pedido `enviado`, registrar conteúdo e ator de sistema, mover somente para `retornado` e criar fila para o Comprador. A resposta não altera quantidade, preço nem estoque; o Comprador revisa e somente então confirma.

Com esses ativos, o envio ao número indicado pelo solicitante e o retorno auditável poderão ser provados em sandbox/produção autorizada. Sem eles, esta etapa depende de coordenação externa, não de mais tela local.

## Pendências de regra de negócio, preservadas sem invenção

- Inventário físico: início, contagem por produto/local, sobra/perda, justificativa, aprovação e impacto financeiro.
- Curva ABC automática: métrica, período e faixas.
- Reposição automática: somente após movimentos confiáveis de venda, produção, perdas e inventário.
- Agendador ativo: recorrência, responsável, aviso e consequência de atraso.
- Vínculo Pedido ↔ Mercadoria/NF-e: precisa decisão e migration; recebimento físico permanece o único ato que altera estoque.

## Arquivos centrais desta rodada

- `db/seed.ts`
- `api/src/pedidos/pedidos.service.ts`
- `tests/integration/pedidos/pedidos.test.ts`
- `web-vue/pages/pedidos.vue`
- `web-vue/composables/usePedidos.ts`
- `web-vue/components/pedidos/PedidosFila.vue`
- `tests/e2e/compras-pedido-ciclo.spec.ts`
