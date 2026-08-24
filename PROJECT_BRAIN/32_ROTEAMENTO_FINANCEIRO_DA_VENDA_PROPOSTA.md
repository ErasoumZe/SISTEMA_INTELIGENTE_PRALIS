# Issue #152 — contrato de roteamento financeiro do CREARE + proposta de migration 0032

> **STATUS: PARADO AGUARDANDO AUTORIZAÇÃO.** Nada foi aplicado. Nenhum arquivo de schema,
> migration, journal ou snapshot foi criado ou alterado. Este documento é o gate do item 3 da
> `docs/prompts/RETOMADA-CAIXA-TESTAVEL-2026-08-24.md` e do §4.6 do `AGENTS.md` (migration +
> fórmula que envolve dinheiro).

## 1. Estado verificado (Gate Zero)

| Item                | Verificado                                                  |
| ------------------- | ----------------------------------------------------------- |
| Branch              | `fix/caixa-saldo-insuficiente`                              |
| HEAD                | `103679f3f8339c56426af44b794c2b5e7beb5056`                  |
| Base local          | `origin/main` em `5127525071d655d31cf316324d3549fc24c69c45` |
| Árvore              | limpa (`git status --porcelain` vazio)                      |
| Stash               | vazio                                                       |
| Commits preservados | 14 commits à frente da base; nenhum reescrito               |
| `git fetch origin`  | **BLOQUEADO** — sem credencial; `gh` não instalado          |

O `fetch` falhou com `could not read Username for 'https://github.com'`. O credential helper é o
`manager` (GUI) e a sessão é não-interativa. É o **mesmo bloqueio já registrado no documento `30`,
§2** — continua sem prova de que a base remota é a local. Não houve rebase nem merge.

### Migration realmente livre

Última migration no repositório: `0031_solicitacao_cofre_cancelamento_recusa` (journal `idx 31`,
snapshot `0031_snapshot.json`). Varri **todas as refs locais e todos os `refs/remotes/origin/*`**
(78 branches) procurando `db/migrations/003[2-9]*` e `db/migrations/00[4-9]*`: **nenhuma ocorrência**.

**Próximo número livre: `0032`** — com a ressalva de que o remoto não pôde ser atualizado nesta
sessão, então isso vale para o estado remoto conhecido localmente.

## 2. RED reproduzido pelo fio real (item 1 da entrega vertical)

Rodei a suíte focada no HEAD atual, contra Postgres 16 em Testcontainers:

```
npx vitest run --config vitest.config.ts --project integration \
  tests/integration/contas/conta-receita-creare.test.ts

Test Files  1 passed (1)
Tests       2 passed (2)
Duration    221.34s
exit code   0
```

Os dois testes **prendem o defeito** (passam porque o defeito existe):

1. Venda de R$ 500 pela rota real `POST /api/integracoes` nasce com `vendas.conta_origem_id = NULL`
   e o saldo da conta do PDV continua **0**.
2. Consequência direta: despesa legítima de R$ 100 nessa mesma conta é recusada com
   **409 `SALDO_INSUFICIENTE`**.

Mecanismo confirmado no código:

- [integracoes.repository.ts:659-687](../api/src/integracoes/integracoes.repository.ts#L659-L687) —
  `valoresVenda` não tem `contaOrigemId`.
- [contas.repository.ts:167-175](../api/src/contas/contas.repository.ts#L167-L175) — o saldo soma
  vendas por `inArray(vendas.contaOrigemId, contaIds)`; `NULL` nunca entra em conta nenhuma.

## 3. O que procurei antes de propor estrutura nova

`grep -rni "adquirente|recebivel|liquidacao|roteamento"` em `api`, `db`, `shared`, `web-vue`,
`tests`: **zero ocorrências**. O conceito não existe em lugar nenhum.

Estruturas existentes avaliadas e descartadas, com o motivo:

| Candidata                   | Por que não serve                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendas.conta_origem_id`    | É **uma** conta por venda. Uma venda dividida (metade dinheiro, metade cartão) tem **dois** destinos. Estruturalmente insuficiente.          |
| `integracoes_vinculos`      | É de-para de identificador externo → registro do sistema (um `registro_sistema_id`). Não comporta recebível + conta final + disponibilidade. |
| `integracoes_campos_config` | Só dois booleanos de automação. Não é cadastro financeiro.                                                                                   |
| `maquininhas`               | É o equipamento físico, não o adquirente/provedor, e não tem conta.                                                                          |
| `notificacoes`              | Tem destinatário por usuário e `tipo` com CHECK fechado; pendência de cadastro não tem dono individual.                                      |

**Conclusão: migration é necessária.** Não há como cumprir R-167/R-168/R-169 sem schema novo.

## 4. O contrato mínimo proposto

Uma ideia só, em duas metades:

1. **CADASTRO** — `formas_pagamento` (que já é `unique(empresa_id, nome)`, já tem CRUD, tela,
   permissões `cadastro_formas_pagamento_*` e é a **única** tabela do sistema referenciada por
   `forma_pagamento_id`) ganha o roteamento: para onde vai o dinheiro desta forma nesta empresa.
2. **FATO** — `vendas_pagamentos` guarda o roteamento **que valia no momento da venda** (snapshot).
   Mudar o cadastro amanhã não pode reescrever o passado.

### Por que na `formas_pagamento` e não numa tabela nova

- A chave de roteamento de R-167 é (empresa, forma). `formas_pagamento` **é** exatamente essa chave.
  Uma tabela nova com `unique(empresa_id, forma_pagamento_id)` seria um segundo cadastro para a
  mesma chave — o "segundo caminho" que a regra-mãe do `AGENTS.md` proíbe.
- Reaproveita tela, endpoints e permissões existentes: zero página nova, zero API nova.
- `forma_pagamento_id` só existe em `vendas_pagamentos` (verificado no schema inteiro). A tabela é
  exclusivamente sobre **recebimento** — pôr conta de recebível nela não polui despesa nenhuma.

### O adquirente

O payload do CREARE (`PagamentosVenda`) tem só `idFormaPagamento`, `descricaoFormaPagamento` e
`valor`. **Não existe campo de adquirente na origem.** Logo o adquirente não pode ser chave de
roteamento hoje — ele é _atributo_ da forma (coluna `adquirente`, texto de cadastro administrativo,
nunca hardcoded), copiado para a venda junto com as contas. Se um dia o CREARE mandar o adquirente,
ele vira chave sem quebrar o que já estiver gravado.

### Os três estados de um pagamento

| `roteamento_status` | Quando                                               | Efeito no saldo                                           |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `nao_aplicavel`     | linhas anteriores à migration e vendas de retaguarda | nenhum (o crédito segue por `vendas.conta_origem_id`)     |
| `pendente`          | forma sem roteamento, ou PDV/forma não resolvidos    | **nenhum** — venda preservada, pendência aberta           |
| `roteado`           | roteamento resolvido                                 | `conta_final_id` **só quando `disponivel_em` não é nulo** |

E a disponibilidade (R-169):

| Forma                                                              | `usa_conta_do_pdv` | `disponibilidade` | `disponivel_em` na ingestão | Resultado                          |
| ------------------------------------------------------------------ | ------------------ | ----------------- | --------------------------- | ---------------------------------- |
| Dinheiro físico                                                    | `true`             | `imediata`        | `= venda.data_venda`        | entra no saldo da conta do PDV     |
| Débito / crédito / Pix maquininha / Pix direto / voucher / cliente | `false`            | `por_evento`      | `NULL`                      | vira **recebível**, não vira saldo |
| Sem cadastro                                                       | —                  | `NULL`            | `NULL`                      | pendência; nada entra              |

Não existe fallback: se a forma não tem roteamento, ou se `usa_conta_do_pdv = true` mas o PDV não
foi resolvido, o pagamento nasce `pendente`. Nunca cai em Dinheiro, Outro ou conta do PDV por
omissão. A conta do PDV só é usada quando o admin **marcou explicitamente** `usa_conta_do_pdv`.

## 5. Migration 0032 — SQL completo

Arquivo proposto: `db/migrations/0032_roteamento_financeiro_da_venda.sql`
(+ entrada `idx 32` no `_journal.json` + `meta/0032_snapshot.json`, ambos gerados por
`npm run db:generate --workspace @padaria/db`, nunca à mão — `scripts/verificar-migrations.mjs`
exige a paridade dos três).

**ADITIVA. Zero `UPDATE`, zero backfill, zero linha histórica reescrita (R-166).**

```sql
-- R-167/R-168/R-169 (issue #152): a venda integrada passa a ter DESTINO FINANCEIRO explicito.
--
-- Duas metades de UM contrato:
--   1. CADASTRO — `formas_pagamento` guarda para onde vai o dinheiro desta forma nesta empresa.
--   2. FATO     — `vendas_pagamentos` guarda o roteamento QUE VALIA no momento da venda.
-- A segunda e SNAPSHOT de proposito: mudar o cadastro amanha nao pode reescrever o passado.
--
-- ADITIVA. Nenhum UPDATE, nenhum backfill (R-166). Toda linha existente passa nos CHECKs com os
-- DEFAULTs abaixo, porque os DEFAULTs dizem a verdade sobre ela: o conceito nao existia.

-- 1) Tenant no proprio banco. A FK composta abaixo exige a UNIQUE (id, empresa_id) — o mesmo par
--    que `vendas` (vendas_id_empresa_unica) e `fechamentos_caixa` ja usam. Sem ela, o cadastro
--    poderia apontar para conta de OUTRA empresa e o banco nao reclamaria.
ALTER TABLE "contas" ADD CONSTRAINT "contas_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint

-- 2) CADASTRO do roteamento (por empresa + forma de pagamento).
ALTER TABLE "formas_pagamento" ADD COLUMN "adquirente" text;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "usa_conta_do_pdv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "conta_recebivel_id" uuid;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "conta_final_id" uuid;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "disponibilidade" text;--> statement-breakpoint

ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_recebivel_empresa_fk"
  FOREIGN KEY ("conta_recebivel_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_final_empresa_fk"
  FOREIGN KEY ("conta_final_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- `disponibilidade` NULL e o estado "sem roteamento" — e o que TODA forma existente vira, e o que
-- toda forma criada automaticamente pelo CREARE continua sendo ate o admin configurar. E o
-- estado que abre pendencia (R-168), nunca um destino inventado.
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_roteamento_check" CHECK (
  ("formas_pagamento"."disponibilidade" is null
       and "formas_pagamento"."usa_conta_do_pdv" = false
       and "formas_pagamento"."conta_recebivel_id" is null
       and "formas_pagamento"."conta_final_id" is null)
  or ("formas_pagamento"."disponibilidade" = 'imediata'
       and "formas_pagamento"."usa_conta_do_pdv" = true
       and "formas_pagamento"."conta_recebivel_id" is null
       and "formas_pagamento"."conta_final_id" is null)
  or ("formas_pagamento"."disponibilidade" = 'por_evento'
       and "formas_pagamento"."usa_conta_do_pdv" = false
       and "formas_pagamento"."conta_recebivel_id" is not null
       and "formas_pagamento"."conta_final_id" is not null));--> statement-breakpoint

-- 3) FATO: o roteamento gravado na venda. `nao_aplicavel` e o DEFAULT porque e a verdade sobre as
--    linhas que ja existem: elas sao anteriores ao conceito, e o credito delas (quando existe)
--    continua vindo de `vendas.conta_origem_id`, exatamente como hoje.
ALTER TABLE "vendas_pagamentos" ADD COLUMN "roteamento_status" text DEFAULT 'nao_aplicavel' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "conta_recebivel_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "conta_final_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "adquirente" text;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "disponivel_em" timestamp with time zone;--> statement-breakpoint

-- FK simples (nao composta): `vendas_pagamentos` nao tem `empresa_id`, e acrescenta-la exigiria
-- backfill de linha historica — proibido pela R-166. O escopo de tenant vem de cima: o roteamento
-- e copiado da forma de pagamento, que ja e da empresa da venda, e ha teste de isolamento.
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_conta_recebivel_id_contas_id_fk"
  FOREIGN KEY ("conta_recebivel_id") REFERENCES "public"."contas"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_conta_final_id_contas_id_fk"
  FOREIGN KEY ("conta_final_id") REFERENCES "public"."contas"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_roteamento_status_check"
  CHECK ("vendas_pagamentos"."roteamento_status" in ('nao_aplicavel', 'pendente', 'roteado'));--> statement-breakpoint

-- `disponivel_em` so pode existir em linha ROTEADA. E o unico jeito de o banco impedir que um
-- recebivel vire saldo gastavel sem roteamento (R-169).
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_roteamento_check" CHECK (
  ("vendas_pagamentos"."roteamento_status" <> 'roteado'
       and "vendas_pagamentos"."conta_recebivel_id" is null
       and "vendas_pagamentos"."conta_final_id" is null
       and "vendas_pagamentos"."disponivel_em" is null)
  or ("vendas_pagamentos"."roteamento_status" = 'roteado'
       and "vendas_pagamentos"."conta_recebivel_id" is not null
       and "vendas_pagamentos"."conta_final_id" is not null));--> statement-breakpoint

-- Indices PARCIAIS, porque a porta de saldo (R-165) le isto A CADA ESCRITA de saida. Sem eles a
-- porta ganharia uma varredura de `vendas_pagamentos` por lancamento.
CREATE INDEX "vendas_pagamentos_conta_final_disponivel_idx" ON "vendas_pagamentos"
  USING btree ("conta_final_id")
  WHERE "vendas_pagamentos"."roteamento_status" = 'roteado'
    and "vendas_pagamentos"."disponivel_em" is not null;--> statement-breakpoint
CREATE INDEX "vendas_pagamentos_conta_recebivel_aberto_idx" ON "vendas_pagamentos"
  USING btree ("conta_recebivel_id")
  WHERE "vendas_pagamentos"."roteamento_status" = 'roteado'
    and "vendas_pagamentos"."disponivel_em" is null;--> statement-breakpoint
CREATE INDEX "vendas_pagamentos_roteamento_pendente_idx" ON "vendas_pagamentos"
  USING btree ("forma_pagamento_id")
  WHERE "vendas_pagamentos"."roteamento_status" = 'pendente';
```

## 6. Rollback completo

```sql
DROP INDEX IF EXISTS "vendas_pagamentos_roteamento_pendente_idx";
DROP INDEX IF EXISTS "vendas_pagamentos_conta_recebivel_aberto_idx";
DROP INDEX IF EXISTS "vendas_pagamentos_conta_final_disponivel_idx";

ALTER TABLE "vendas_pagamentos" DROP CONSTRAINT IF EXISTS "vendas_pagamentos_roteamento_check";
ALTER TABLE "vendas_pagamentos" DROP CONSTRAINT IF EXISTS "vendas_pagamentos_roteamento_status_check";
ALTER TABLE "vendas_pagamentos" DROP CONSTRAINT IF EXISTS "vendas_pagamentos_conta_final_id_contas_id_fk";
ALTER TABLE "vendas_pagamentos" DROP CONSTRAINT IF EXISTS "vendas_pagamentos_conta_recebivel_id_contas_id_fk";
ALTER TABLE "vendas_pagamentos" DROP COLUMN IF EXISTS "disponivel_em";
ALTER TABLE "vendas_pagamentos" DROP COLUMN IF EXISTS "adquirente";
ALTER TABLE "vendas_pagamentos" DROP COLUMN IF EXISTS "conta_final_id";
ALTER TABLE "vendas_pagamentos" DROP COLUMN IF EXISTS "conta_recebivel_id";
ALTER TABLE "vendas_pagamentos" DROP COLUMN IF EXISTS "roteamento_status";

ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_roteamento_check";
ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_conta_final_empresa_fk";
ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_conta_recebivel_empresa_fk";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "disponibilidade";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "conta_final_id";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "conta_recebivel_id";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "usa_conta_do_pdv";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "adquirente";

ALTER TABLE "contas" DROP CONSTRAINT IF EXISTS "contas_id_empresa_unica";
```

**O rollback não perde nenhum dado anterior à 0032** — todo objeto derrubado foi criado por ela.
Perde-se o roteamento configurado depois (redigitável no cadastro) e os snapshots gravados nas
vendas novas. As **vendas em si continuam intactas**: nenhuma coluna pré-existente é tocada.

Ordem obrigatória em caso de reversão: **derruba o código primeiro, o schema depois.** Código que
lê coluna já derrubada quebra na primeira requisição.

## 7. Compatibilidade e impacto

**Bloqueio de tabela.** `ADD COLUMN` com `DEFAULT` constante é metadata-only no Postgres 11+ (aqui
é o 16), então não há rewrite. Mas `ADD CONSTRAINT ... CHECK` e `ADD CONSTRAINT ... UNIQUE` fazem
**varredura completa com `ACCESS EXCLUSIVE`**:

| Tabela              | Tamanho                                          | Risco                                                    |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `contas`            | dezenas de linhas                                | desprezível                                              |
| `formas_pagamento`  | poucas dezenas por empresa                       | desprezível                                              |
| `vendas_pagamentos` | **1..N linhas por venda integrada — não medido** | **é o único ponto a medir antes de aplicar em produção** |

Não tenho acesso a produção (proibido pelo Gate Zero, item 6), então **não sei o volume de
`vendas_pagamentos` na TNP**. Antes de qualquer aplicação em produção é preciso rodar
`select count(*) from vendas_pagamentos;` e, se for grande, trocar os dois CHECKs por
`ADD CONSTRAINT ... NOT VALID` + `VALIDATE CONSTRAINT` em janela separada (o `VALIDATE` só toma
`SHARE UPDATE EXCLUSIVE`). Em DEV/CI o volume é irrelevante. Os três `CREATE INDEX` também tomam
lock de escrita; em produção seriam `CREATE INDEX CONCURRENTLY` — que **não** pode viver dentro da
transação da migration e precisa de passo próprio.

**Ordem de lock (R-164/R-165).** As FKs novas fazem `INSERT` em `vendas_pagamentos` tomar
`FOR KEY SHARE` nas linhas de `contas`, dentro da transação de ingestão — ou seja, `contas` passa a
ser travada **depois** da linha da venda, o que inverte o degrau canônico
`pdvs → fechamentos_caixa → contas → linha do lançamento → filhas`. Pela matriz de conflito já
documentada em [contas.repository.ts:25-70](../api/src/contas/contas.repository.ts#L25-L70):

- `KEY SHARE` × `KEY SHARE` → convivem (duas ingestões nunca esperam uma pela outra);
- `KEY SHARE` × `NO KEY UPDATE` → convivem **nos dois sentidos** (a ingestão nunca espera a porta de
  saldo, e a porta nunca espera a ingestão).

Logo **nenhuma aresta nova de espera** é criada e o ciclo é impossível. O efeito colateral é
benigno e conservador: a porta de saldo pode não enxergar um crédito de venda ainda não commitado e
recusar uma saída que passaria um instante depois (409 transitório, o retry resolve). O sentido
perigoso — gastar dinheiro que não existe — continua impossível, porque **débitos** serializam sob
`NO KEY UPDATE`. **Este é o ponto que mais precisa do revisor de concorrência.**

**Compatibilidade de código.** Toda coluna é nulável ou tem default; API e front antigos continuam
funcionando sem enxergá-las. A migration pode ser aplicada **antes** do deploy do código.

## 8. A mudança de fórmula (exige autorização separada — `AGENTS.md` §4.6)

`shared/src/caixa/regras.ts` ganha **um** termo:

```ts
export type TotaisContaCentavos = {
  vendas: number;
  vendasRoteadasDisponiveis: number; // NOVO
  vendasRoteadasAReceber: number; // NOVO — nao entra no saldo, so e exibido
  transferenciasEntrada: number;
  // ... resto inalterado
};

export function saldoContaCentavos(saldoInicialCentavos: number, totais: TotaisContaCentavos) {
  return (
    saldoInicialCentavos +
    totais.vendas +
    totais.vendasRoteadasDisponiveis + // <— unica linha nova
    totais.transferenciasEntrada -
    totais.transferenciasSaida -
    totais.despesas -
    totais.retiradas -
    totais.mercadorias
  );
}
```

`saldosDasContasRepository` ganha uma 6ª consulta (Drizzle puro — `sql` tagged template é proibido
em `api/src` por `verificar-arquitetura.mjs`), somando em memória no mesmo padrão das outras cinco:

```
vendas_pagamentos vp JOIN vendas v ON v.id = vp.venda_id
WHERE vp.roteamento_status = 'roteado'
  AND vp.conta_final_id IN (:contaIds)      -- disponivel
  AND vp.disponivel_em IS NOT NULL
  AND v.conta_origem_id IS NULL             -- <— a guarda anti-dupla-contagem
  AND v.computar = true AND v.status <> 'cancelado'
```

**A guarda `v.conta_origem_id IS NULL` é o que impede contar o mesmo dinheiro duas vezes.** Venda de
retaguarda credita pela coluna da venda; venda integrada credita pelos pagamentos. Nunca as duas.

**Nada muda para histórico:** linha antiga tem `roteamento_status = 'nao_aplicavel'`, não entra na
6ª consulta, e as cinco consultas originais ficam byte-a-byte iguais. Saldo negativo histórico
continua negativo. O saldo do **caixa** (`caixa.service.ts`) não é tocado — ele soma por `caixa_id`,
outra entidade, outra pergunta.

## 9. Caminho de escrita — um só

Tudo dentro da transação que já existe em `receberVendaIntegracao`. Nenhuma segunda API.

1. `resolverVinculosVenda` passa a resolver também, por `formaPagamentoId`, a linha de roteamento da
   forma, e a `conta_id` do PDV resolvido (`pdvs.conta_id`, que é `NOT NULL`).
2. `criarOuAtualizarVendaIntegradaRepository` grava o snapshot em cada `vendas_pagamentos`:

| Situação                                     | `roteamento_status` | `conta_recebivel_id` | `conta_final_id` | `disponivel_em`    |
| -------------------------------------------- | ------------------- | -------------------- | ---------------- | ------------------ |
| forma sem roteamento, ou forma não resolvida | `pendente`          | `NULL`               | `NULL`           | `NULL`             |
| `usa_conta_do_pdv` e PDV resolvido           | `roteado`           | conta do PDV         | conta do PDV     | `venda.data_venda` |
| `usa_conta_do_pdv` e PDV **não** resolvido   | `pendente`          | `NULL`               | `NULL`           | `NULL`             |
| `por_evento`                                 | `roteado`           | do cadastro          | do cadastro      | `NULL`             |

3. `vendas.conta_origem_id` continua `NULL` na venda integrada — **de propósito**. Ela deixou de ser
   o canal de crédito dessa venda; quem credita são os pagamentos.

**Idempotência do reenvio:** o caminho já apaga e reinsere os `vendas_pagamentos` na mesma
transação, então o roteamento é recalculado e não há como duplicar linha nem pendência.

## 10. A pendência (R-168) — derivada, sem tabela nova

Pendência = consulta, não registro:

```
vendas_pagamentos WHERE roteamento_status = 'pendente'
  agrupado por empresa + forma_pagamento_id
  -> forma, adquirente, qtd de vendas, valor total, primeira e última ocorrência
```

Idempotente por construção — não existe linha de pendência para duplicar. Sem backfill, porque
nenhuma linha histórica é `pendente`.

**Onde aparece:** na própria tela **Formas de pagamento**, que é onde ela se resolve (editar a forma
e apontar as contas). Sem página nova, sem navegação, sem segundo caminho. Fica atrás de
`cadastro_formas_pagamento_visualizar`, que é o papel "Admin configura contas/adquirentes" da R-172.

## 11. Cobertura de testes proposta (item 5 da entrega vertical)

| #   | Teste                                                                                                   | Tipo       |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Dinheiro no PDV com turno aberto → saldo da conta do PDV sobe; a despesa que hoje dá 409 passa          | integração |
| 2   | Débito, crédito, Pix maquininha, Pix direto, voucher e cliente → recebível, saldo gastável **não** sobe | integração |
| 3   | Venda dividida (dinheiro + cartão) → dois destinos, só a parte em dinheiro entra no saldo               | integração |
| 4   | Forma sem roteamento → venda preservada, uma pendência, saldo inalterado                                | integração |
| 5   | Reenvio da mesma venda (idempotente) e reenvio concorrente → uma pendência, um roteamento               | integração |
| 6   | Isolamento: conta da Empresa B nunca é roteada por forma da Empresa A (FK composta + teste)             | integração |
| 7   | Histórico byte-a-byte: snapshot dos saldos antes/depois da migration + do deploy — idênticos            | integração |
| 8   | `conta-saldo-insuficiente.test.ts` (12 casos) e a suíte de corrida continuam verdes                     | regressão  |
| 9   | `conta-receita-creare.test.ts` **fica vermelho de propósito** e é reescrito para o novo contrato        | integração |
| 10  | `saldoContaCentavos` com o termo novo, incluindo negativo histórico preservado                          | unidade    |

Mutações que a suíte precisa matar (item 6): remover o lock; ler saldo pré-lock; ignorar delta no
PUT; **liberar recebível antes do evento**; **fallback silencioso para a conta do PDV**; duplicar
pendência no reenvio; **contar em dobro** (venda com `conta_origem_id` **e** pagamento roteado).

## 12. Decisões que são do José/Rodrigo, não minhas

1. **Reenvio de venda antiga.** O agente do CREARE reenvia vendas. Uma venda antiga reenviada
   depois do deploy passaria a ter roteamento e — se for dinheiro — creditaria retroativamente a
   conta do PDV, mudando o saldo de um período já fechado. Sem `UPDATE` e sem backfill, mas mexe em
   número de caixa fechado. Alternativas: (a) rotear todo reenvio; (b) rotear só venda cuja
   ingestão é posterior ao deploy. **Recomendo (b)** — é o que "corrigir somente o futuro" quer
   dizer, e evita saldo de caixa fechado mudando sozinho. Custa uma comparação de data na ingestão.
2. **Liquidação (o evento da R-169).** Esta entrega cria o **estado** recebível, mas não a ação de
   confirmar a liquidação. Sem ela, dinheiro de cartão fica em recebível para sempre. **Não é
   regressão** — hoje ele também nunca entra em conta nenhuma — e o bloqueio do R-165 (dinheiro
   físico) é resolvido de qualquer forma. Mas é uma vertical própria, que eu proporia como issue
   seguinte. Confirmar que ela **fica fora** da #152.
3. **A fórmula do dinheiro** (§8) precisa do seu "pode".

## 13. O que NÃO foi feito

- Nenhum arquivo criado, alterado ou gerado: `db/src/schema/**`, `db/migrations/**`,
  `_journal.json`, `meta/*_snapshot.json`, `api/src/**`, `shared/src/**`, `web-vue/**`.
- `git fetch` continua bloqueado por credencial — base remota não comprovada.
- Nenhuma implementação, nenhum revisor, nenhum gate pesado, nenhum Playwright, nenhum DEV local:
  todos vêm **depois** da autorização.
- Nada de produção, CREARE real, segredo, planilha, deploy ou backfill.
