# Plano de execução — para uso com Claude Code

> Fonte: ANALISE-PROJETO-E-INTEGRACOES-2026-07-10.pdf + ANALISE-V2-REUNIOES-E-LEGADO-2026-07-10.pdf.
> Regra de uso: **uma tarefa por sessão**, pedir plano antes de código, `npm run check` e testes ao final
> (conforme AGENTS.md), commit por tarefa. Não mexer em migrations sem pedido explícito.

## Como usar

1. Abra o Claude Code na raiz do repositório.
2. Copie o prompt da tarefa desejada (blocos abaixo), na ordem.
3. Revise o plano que ele propuser ANTES de aprovar edições.
4. Ao final: `npm run check` + testes; revise o diff; commite.

Tarefas manuais (NÃO delegar): segredos no Coolify, criar conta Sentry/provedor de e-mail,
rotacionar credenciais do bot legado, DNS/domínios.

---

## FASE 0 — Produção agora (sem feature nova)

### T0.1 — Paleta de cores por categoria (front, tarefa pequena)

```
Leia docs/PLANO-EXECUCAO-CLAUDE-CODE.md (contexto) e me apresente um plano antes de editar.
Tarefa: aplicar identidade visual por categoria nas telas e menu do web-vue:
vendas/entradas = amarelo, transferências = laranja, mercadorias = verde,
lucros/retiradas = azul. O sistema de tema por empresa/tela já existe — quero isso
como paleta padrão (default), sem quebrar a customização existente. Ajuste ícones/menu
em web-vue/utils/domain.ts e os defaults de tema. Não altere schema nem API.
```

### T0.2 — E-mail transacional mínimo (reset de senha)

```
Me apresente um plano antes de editar. Tarefa: configurar envio real de e-mail no
better-auth (api/src/auth/config.ts) — sendResetPassword e verificação de e-mail —
usando [Resend | SMTP] via variáveis de ambiente novas (validar em api/src/env.ts com Zod,
documentar em .env.example). Em dev, manter log no console. No front: remover o e-mail
hardcoded de web-vue/pages/forgot-password.vue, corrigir a mensagem, e adicionar
credentials: "include" no reset-password.vue. Adicionar teste de integração do fluxo.
```

### T0.3 — Senha de seed fora de dev (FND-02 do backlog)

```
Me apresente um plano antes de editar. Tarefa: garantir que a senha padrão 123456 do
seed exista apenas em desenvolvimento/teste. O bootstrap de produção (db/bootstrap-prod.ts)
já usa ADMIN_SENHA — confirme que nenhum caminho de produção usa o seed de dev e
adicione um guard explícito (falhar se NODE_ENV=production tentar rodar o seed de dev).
```

---

## FASE 1 — Integração CREARE contínua (a integração nº 1)

### T1.1 — Modo produção do agente integrador

```
Me apresente um plano antes de editar. Contexto: integracoes-scripts/ já lê o MySQL do
CREARE e envia vendas para POST /api/integracoes (hoje só em modo teste, reescrevendo
datas). Tarefa: criar src/sincronizar.js (modo produção) que:
1) NÃO reescreve datas nem usa prefixo TESTE;
2) sincroniza por janela incremental com cursor persistido em arquivo JSON local
   (último dia/venda processado);
3) reaproveita payload.js e api-client.js;
4) retry com backoff exponencial (3-5 tentativas) para falhas de rede;
5) fila local em disco para payloads que falharem após retries, com replay no
   início da próxima execução (inspiração: o bot legado usava esse desenho);
6) log resumido por ciclo (recebidas/criadas/atualizadas/sem_novidade/erros).
Script npm: "sincronizar". Sem dependências novas além das existentes, exceto se justificar.
```

### T1.2 — Agendamento e operação

```
Me apresente um plano antes de editar. Tarefa: preparar a operação contínua do
integracoes-scripts: loop interno com intervalo configurável (SYNC_INTERVALO_MINUTOS,
default 10) com lock para não sobrepor execuções, + documentação em
integracoes-scripts/README.md de como rodar como serviço no Windows da loja
(NSSM ou Agendador de Tarefas) e as variáveis de .env de produção necessárias.
```

### T1.3 — Registrar erros no histórico de integrações

```
Me apresente um plano antes de editar. Tarefa: hoje o fluxo de ingestão
(api/src/integracoes/integracoes.service.ts) nunca grava status "erro" no histórico —
erros de payload viram 500 sem registro. Quero: falhas de validação/processamento de
venda integrada gravadas em integracoes_historico com status "erro" e mensagemErro,
retornando erro estruturado ao cliente. Adicionar teste de integração. NÃO criar migration
(o schema já suporta).
```

---

## FASE 2 — Fluxo de mercadorias/notas (decisões da reunião de 09/07)

### T2.1 — Fluxo de discriminação em 2 etapas

```
Me apresente um plano antes de editar. Contexto de negócio: o gerente lança no caixa só
o cabeçalho da mercadoria/despesa (fornecedor, valor total, vencimento, foto, computar,
data de referência — campos que JÁ existem). A discriminação dos itens (qtd, produto,
valor unitário, desconto em % ou R$, grupo por item) é feita DEPOIS por outro setor.
Tarefa: adicionar estado "pendente de discriminação" (proposta: derivado — tem itens ou não —
ou campo novo SEM migration se possível; se precisar de migration, PARE e me pergunte),
uma listagem/fila de pendências filtrável, permissão própria para discriminar, e validação
de que a soma dos itens (com descontos) bate com o valor total do cabeçalho.
Front: telas de mercadorias/despesas. Testes de integração para a validação de soma.
```

### T2.2 — Importação de NF-e (canal Make.com do legado)

```
Me apresente um plano antes de editar. Contexto: existe um webhook Make.com já contratado
que lista NF-e por CNPJ/período e baixa XMLs em lote (ZIP). Referência de contrato e parser:
C:\Users\José\Desktop\Cicluz\padaria_planilhas\bot\body.obternfeporfiltro.yaml,
body.obterxmlporids.yaml e bot/services/notasFiscaisContabilidadeService.js (parseNfe).
Tarefa: novo módulo api/src/notas-fiscais (padrão controller/service/repository) que:
1) busca NF-e por empresa/período no webhook (envs novas NOTAS_FISCAIS_URL/TOKEN/CNPJ por
   empresa, validadas em env.ts);
2) parseia os XMLs (fornecedor por CNPJ, vencimentos, itens com NCM/CFOP/CEST/EAN);
3) cria mercadorias com cabeçalho + itens pré-preenchidos, status pendente de revisão,
   casando fornecedor existente por CNPJ (criar se não existir, seguindo o padrão do
   dicionário de integrações);
4) idempotente por chave da NF-e.
Se precisar de tabela nova, PARE e me apresente a proposta de migration antes.
```

---

## FASE 3 — Pedidos v2 e PDV Restaurante (HORA)

### T3.1 — Spec de pedidos v2 (só documento, sem código)

```
Leia docs/spec/SPEC_2026_07_07_pedidos-v1.md e o módulo api/src/pedidos. Tarefa: escrever
docs/spec/SPEC_pedidos-v2.md incorporando: [COLAR AQUI o resultado da entrevista com o
comprador]. Inclua o módulo futuro de negociação (enviar pedido a fornecedores para cotação).
Não escreva código.
```

### T3.2 — Conector do PDV Restaurante (Firebird/SIAC)

```
Me apresente um plano antes de editar. Contexto: a empresa HORA usa PDV Restaurante
SIAC (Firebird), não CREARE. Referência pronta do legado:
C:\Users\José\Desktop\Cicluz\padaria_planilhas\bot\queries\PDV_RESTAURANTE_*.sql e
bot/services/pdvRestauranteService.js e databaseService.js (driver node-firebird).
Tarefa: adicionar ao integracoes-scripts um conector Firebird que monte o MESMO payload
de venda agregada (shared/src/integracoes) a partir do SIAC e envie para
POST /api/integracoes com a chave da empresa HORA. Reaproveitar o desenho incremental
e a fila de falhas da T1.1.
```

---

## FASE 4+ — Backlog (uma spec por vez, sem código até aprovar)

- Estoque/inventário (BK-01): saldo por produto + contagens com foto + lista de diferenças
  - vínculo com débitos/premiações. Escrever spec primeiro.
- iPonto → folha*ponto: queries prontas em padaria_planilhas/bot/queries/IPONTO*\*.sql;
  regras de INSS/jornada documentadas em planilhas/back e DOCUMENTACAO_FLUXOS_E_REGRAS.md.
- Parser CNAB do extrato Caixa (.RET layout 089) + tela de conciliação.
- Curva ABC de vendas/compras (relatório).
- Refactor AppWorkspace.vue (FE-01) — fazer em janela calma, com testes de front antes.

## Lembretes permanentes (colar no fim de qualquer prompt, se necessário)

- Não alterar/gerar migrations sem aprovação explícita (AGENTS.md).
- Rodar npm run check e testes só ao final das edições.
- Textos de domínio em português (o linter de texto bloqueia nomes em inglês).
- Arquitetura em camadas: controller não importa repository; sem SQL cru (o CI verifica).
