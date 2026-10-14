# 49 — Auditoria de Compras, Pedidos e Fornecedores — 14/10/2026

> **Escopo:** estado da branch local `feat/compras-recebimento-estoque`, no commit `6c633d7`, auditado em 14/10/2026. Foram inspecionados contratos, schema, rotas, serviços, repositórios, telas e testes de Fornecedores, Pedidos, Estoque e Conferência. Não houve acesso, escrita, migration, deploy ou reinício em produção.

## 1. Conclusão executiva

O fluxo novo de Compras está implementado na branch: fornecedor único por pedido, sugestão de reposição assistida, pedido manual, envio por WhatsApp, ciclo de situação, recebimento parcial e final, idempotência e extrato de estoque auditável. O saldo nasce em zero e, fora de criação ou importação de cadastro, só é escrito pelo recebimento físico do pedido.

Ele **não está pronto para integrar**: a branch está 97 commits atrás de `origin/main`, sem upstream configurado localmente, e o ambiente de desenvolvimento não consegue ser semeado depois de existirem eventos de pedido. Isso bloqueou a reexecução dos E2E no navegador. Não é falha do recebimento em si, mas impede a prova visual reprodutível e qualquer decisão de merge neste HEAD.

| Situação           | Quantidade | Itens                                                                                   |
| ------------------ | ---------: | --------------------------------------------------------------------------------------- |
| P1                 |          2 | branch desatualizada; seed local quebra                                                 |
| P2                 |          2 | página acima do limite; cobertura de salto inválido ausente                             |
| Bloqueios de regra |          5 | inventário, ABC automático, reposição automática, agenda ativa, vínculo Mercadoria/NF-e |

## 2. Onde o trabalho parou

- **Branch e HEAD:** `feat/compras-recebimento-estoque` em `6c633d7` (`13/10/2026 22:15:12 -03:00`), árvore de trabalho limpa no início da auditoria.
- **Distância de integração:** `git rev-list --left-right --count origin/main...HEAD` retornou `97 24`: há 97 commits apenas em `origin/main` e 24 apenas nesta branch. Antes de PR/merge, é obrigatório rebase ou merge controlado da base atual, resolução de conflitos e nova revisão do HEAD resultante.
- **Publicação:** `git branch -vv` não mostra upstream para esta branch. Não há evidência local de push ou PR para o HEAD auditado.
- **Último estado funcional registrado:** o último commit corrigiu o contrato reduzido de produtos para não ampliar dados além do necessário (`6c633d7`). Depois dele não há commit de correção, rebase, push, PR, merge ou deploy.

## 3. O que foi feito em 13/10/2026

Foram feitos **11 commits**, das 16:14 às 22:15. A sequência mostra que a rodada terminou na prova do fluxo, não numa tela isolada.

| Hora  | Commit    | Entrega                                                                                     |
| ----- | --------- | ------------------------------------------------------------------------------------------- |
| 16:14 | `4271b5d` | Teste E2E do menu Compras para Diretor e Compras.                                           |
| 16:30 | `089073c` | Restauração da edição de fornecedor por permissão.                                          |
| 17:35 | `760565e` | Correções para as telas do módulo renderizarem no navegador.                                |
| 18:20 | `12b4423` | Resolução do campo de produto e registro legível do ator no histórico.                      |
| 18:39 | `e495df1` | Correção dos seletores ambíguos da prova E2E.                                               |
| 18:45 | `1f7f7cf` | Redesenho do compositor de pedido, com saldo, mínimo e máximo à vista.                      |
| 19:44 | `423b718` | Paginação de todos os fornecedores no seletor e reformulação da conferência de recebimento. |
| 21:05 | `c381a78` | Fechamento da prova de ciclo de pedido no navegador.                                        |
| 21:13 | `81c205e` | Prova de responsividade de Pedidos em 1440, 1024, 768 e 390 px.                             |
| 21:28 | `2e5946f` | Registro das decisões operacionais ainda bloqueadas no documento 48.                        |
| 22:15 | `6c633d7` | Restrição do contrato reduzido de produtos ao seu limite.                                   |

Os 13 commits anteriores desta branch, de 08 a 09/10, estabeleceram R-208/R-209, criaram recebimento auditado, lista de estoque, agenda de conferência, extrato, WhatsApp e o menu único de Compras.

## 4. Fluxo efetivamente implementado

### Fornecedores

- CRUD em `/api/fornecedores`, protegido por permissões; criação e edição guardam nome, documento e WhatsApp em `fornecedores`.
- `web-vue/pages/fornecedores.vue` é o caminho único de cadastro; Pedidos não cria uma segunda tela de fornecedor.
- O seletor de pedido pagina até 20 lotes de 100 fornecedores em `web-vue/pages/pedidos.vue`; o 11º fornecedor não some por causa da paginação padrão.
- Para quem só opera lançamentos, a API reduz o contrato a `id`, `empresaId` e `nome`, sem documento. O contrato completo exige `cadastro_fornecedores_visualizar`.

### Pedidos

- Todo pedido novo exige `fornecedorId` e nasce em `a_fazer`; `fornecedor_id` nos itens novos é `null`, preservando o campo apenas para leitura histórica.
- Pedido manual e sugestão passam pelo mesmo escritor e não excedem `estoqueMax` quando este foi configurado. A sugestão só inclui produto com `atual <= mínimo` e usa `máximo - atual`.
- O ciclo é `a_fazer → enviado → retornado → confirmado → recebido_parcial → recebido`, com cancelamento terminal. `rascunho` e `aprovado` são somente leitura histórica.
- Cada situação grava `pedidos_eventos` com ator, hora do servidor e observação. A tela mostra o nome do ator no histórico.
- WhatsApp usa número persistido do fornecedor e itens gravados; antes de abrir o link, a tela move o pedido para `enviado`.

### Recebimento e estoque

- `POST /api/pedidos/:id/recebimentos` só aceita pedido `confirmado` ou `recebido_parcial` e exige chave UUID de idempotência.
- A transação trava pedido e produtos, recusa item repetido ou quantidade acima do pendente, cria recebimento e `estoque_movimentos` por item e atualiza saldo no mesmo ato.
- A chave é única por empresa. Reenvio da mesma intenção não soma saldo; reutilização com itens ou observação diferentes é recusada.
- `estoque_movimentos` guarda pedido, item, recebimento, quantidade, saldo anterior/posterior, conferente e horários. O extrato filtra produto, local e período.
- `quantidade_estoque` só é inicializada em `0` na criação/importação de produto e atualizada pelo repositório de recebimento; não há campo livre de alteração de saldo.

### Estoque e conferência

- A tela de Estoque filtra grupo, área, local de venda, local de estoque e Curva ABC, conforme R-210.
- Curva ABC é classificação manual A/B/C; não há cálculo inventado.
- Conferência agenda escopo, data e observação. Criar/listar agenda não cria movimento nem altera saldo.

## 5. Matriz de prova

| Caso da checklist                   | Evidência atual                                                                                                                | Resultado                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1. Caminho único no menu            | `web-vue/utils/menu.ts`; `tests/e2e/compras-menu.spec.ts`                                                                      | Coberto; reexecução E2E bloqueada pelo seed.                                    |
| 2. Fornecedor e WhatsApp persistem  | controller/service/repository; `tests/integration/fornecedores/fornecedores.test.ts`; `tests/e2e/compras-fornecedores.spec.ts` | API provada hoje; prova visual existe, mas não reexecutou.                      |
| 3. Parâmetros de estoque do produto | contratos de Produtos; `tests/e2e/compras-produto-estoque.spec.ts`                                                             | Coberto por E2E existente; reexecução bloqueada.                                |
| 4. Cinco filtros de Estoque         | `api/src/compras/compras.repository.ts`; mesma spec E2E                                                                        | Coberto por E2E existente; reexecução bloqueada.                                |
| 5. Manual, edição em A fazer e teto | `pedidos.service.ts`; integração; `compras-pedido-ciclo.spec.ts`                                                               | Teto provado hoje pela API; edição coberta por E2E existente.                   |
| 6. Sugestão máximo − atual          | `gerarItensReposicao`; `pedidos.test.ts`                                                                                       | **Provado hoje.**                                                               |
| 7. WhatsApp do fornecedor           | `pages/pedidos.vue`; `compras-pedido-ciclo.spec.ts`                                                                            | Coberto por E2E existente; reexecução bloqueada.                                |
| 8. Transições e rejeição de saltos  | máquina `transicoesPermitidas`; E2E percorre válidas                                                                           | Válidas cobertas; falta teste explícito de salto inválido.                      |
| 9. Recebimento parcial              | `receberPedido`; `pedidos.test.ts`                                                                                             | **Provado hoje:** 3 de 5, saldo 0 para 3.                                       |
| 10. Final e idempotência            | serviço, unique no schema e integração                                                                                         | **Provado hoje:** repetição não duplica; final chega a 5.                       |
| 11. Extrato auditável               | `compras.repository.ts`; integração; E2E                                                                                       | **Provado hoje pela API:** pedido, produto, quantidade, saldos, ator e horário. |

## 6. Validações desta auditoria

| Comando                                        | Resultado                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run lint`                                 | Passou.                                                                                     |
| `npm run check`                                | Passou: texto, arquitetura, migrations (51), TypeScript de shared/db/scripts/api/web/tests. |
| Testes de integração de Pedidos e Fornecedores | Passou: 2 arquivos, 6 testes, 74,52 s.                                                      |
| Bootstrap local para E2E                       | Falhou antes de API/Web; ver P1-02.                                                         |

## 7. Achados

### P1-01 — branch de Compras não está na base atual

**Evidência:** 24 commits próprios e 97 commits atrás de `origin/main`; sem upstream configurado.

**Risco:** não se pode avaliar conflitos, compatibilidade ou gates do HEAD que seria integrado.

**Ação necessária:** atualizar da `origin/main`, resolver conflitos, repetir lint, check, integração e E2E, revisar o novo HEAD e só então abrir PR.

### P1-02 — seed local quebra depois de eventos de pedido

**Evidência:** `npm run api:dev:prepare` falhou em `db/seed.ts:546`, dentro de `removerUsuariosSeed()`, ao executar `delete from perfis_usuarios`. PostgreSQL retornou `23503`: `pedidos_eventos_criado_por_perfis_usuarios_usuario_id_fk`; o perfil de Compras ainda é referenciado em `pedidos_eventos`.

**Risco:** não é possível levantar a stack local repetidamente para executar os E2E de Compras. A rotina de seed remove perfis antes dos fatos auditáveis que apontam para eles.

**Ação necessária:** corrigir a limpeza idempotente do banco de desenvolvimento, respeitando a ordem de dependências de `pedidos_eventos`, `pedidos_recebimentos` e `estoque_movimentos`, sem tocar em produção. Depois, repetir Playwright de Compras.

### P2-01 — página de Pedidos excede o limite de componente

**Evidência:** `web-vue/pages/pedidos.vue` tem 464 linhas; o limite do projeto é aproximadamente 400.

**Ação necessária:** extrair carregamento de fornecedores/estoque e ações de pedido para composable ou componentes, preservando rota única e provas.

### P2-02 — salto inválido não tem teste dedicado

**Evidência:** a máquina de estados recusa saltos em `pedidos.service.ts`, mas `tests/integration/pedidos/pedidos.test.ts` cobre somente a sequência válida.

**Ação necessária:** testar `a_fazer → confirmado`, `enviado → recebido` e recebimento fora de `confirmado`/`recebido_parcial`, sem mudar a regra.

## 8. Bloqueios que exigem decisão operacional

1. Contagem física por produto/local, permissões de iniciar/encerrar, sobra/perda, justificativa e impacto financeiro.
2. Fórmula, período, cortes e frequência da Curva ABC automática.
3. Reposição automática, dependente de saídas rastreáveis por venda, produção, perda e inventário.
4. Responsável, aviso e consequência de agenda vencida para o agendador ativo.
5. Vínculo persistente Pedido ↔ Mercadoria/NF-e, que exige migration aprovada e não altera estoque.

## 9. Limites

Não foram executados E2E nesta data porque o ambiente local falhou antes de subir API e Web. Não foram consultados dados de produção, usuários reais, migrations aplicadas, PRs remotos ou deployment. As specs E2E existentes são cobertura versionada, não prova de execução atual até corrigir o seed e repetir a suíte na base atualizada.
