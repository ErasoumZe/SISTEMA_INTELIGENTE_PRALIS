# Issue #152 — contrato de roteamento financeiro do CREARE + migration 0033

> ## Estado em 26/08/2026 — a migration existe, e é a `0033`
>
> A #41 foi mesclada na `main` e levou a `0032`, como este documento previa nos §1 e §18. A migration
> desta issue é a **`0033_roteamento_financeiro_da_venda`**, gerada por
> `npm run db:generate --workspace @padaria/db` e commitada em `e7a9537`.
>
> **Toda menção a "0032" no corpo abaixo que fale da migration DESTA issue deve ser lida como
> `0033`.** As menções dos §1 e §18 à `0032` como número livre são históricas e continuam corretas —
> foi exatamente o que aconteceu, só que quem a levou foi a #41.
>
> **Uma correção ao SQL do §5:** o gerador emitiu o `UNIQUE` de `contas` **depois** das FKs compostas
> que o referenciam, e a migration **não aplicava** —
> `ERROR: there is no unique constraint matching given keys for referenced table "contas"`. O §5
> sempre esteve certo ao pôr esse statement em primeiro lugar; o gerador é que inverteu. O statement
> foi movido de volta para o topo, com o motivo escrito no cabeçalho do `.sql`.
>
> **Provado em Postgres 16 descartável, criado e derrubado:** as 34 migrations aplicam do zero; 18
> casos de comportamento passam, incluindo a forma meio-cadastrada (`disponibilidade` NULL com
> `usa_conta_do_pdv = true`) sendo recusada, a conta de outra empresa barrada pela FK composta e o
> pagamento `pendente` com `disponivel_em` recusado; o rollback do §6 foi aplicado de verdade e não
> sobrou objeto nenhum, com vendas e formas de pagamento preservadas; e a `0033` reaplica por cima.
> Suíte completa `npm test` **exit 0** (unidade 172, integração 790 + 1 skipped).
>
> **Nada foi aplicado em produção.** Esta entrega é schema; o caminho de escrita do §9 e a mudança de
> fórmula do §8 continuam fora dela.

> **STATUS: GATE RESPONDIDO EM 24/08 — as quatro confirmações chegaram.** As decisões viraram as
> regras **R-173 a R-177** no documento `19`; a fila mudou (R-174) e está em `30` §4. Esta issue
> (#152) **não é mais a próxima**: a #41 vem antes. Nada de schema, migration ou código foi aplicado.
>
> **STATUS ORIGINAL DESTE DOCUMENTO:** Nada foi aplicado — nenhum arquivo de
> schema, migration, journal, snapshot ou código foi criado ou alterado. Este documento é o gate do
> item 3 da `docs/prompts/RETOMADA-CAIXA-TESTAVEL-2026-08-24.md` e do §4.6 do `AGENTS.md`.
>
> **Leia a §18 primeiro** — ela é a conclusão. As §§8–12 estão mantidas como registro do que foi
> proposto e recusado, com aviso no topo de cada uma.
>
> **Histórico curto.** A proposta original foi reprovada por quatro revisores read-only (§13, §15,
> §16, §17): oito P0, cinco confirmados por mim no código. Um era meu, dentro do SQL, e já está
> corrigido na §5. Na consolidação de 24/08 (§18) os sete pontos restantes foram confrontados com
> R-166–R-172, com R-007/D-06 e com o código: **cinco já estavam decididos por regra vigente** e eu
> é que os havia transformado em pergunta. Restam **quatro confirmações**, três de uma linha.
>
> Duas conclusões que mudam a fila e não são minhas:
>
> - **A #41 entra antes da #152** (§18 ponto 3). A primeira ingestão concorrente da mesma venda
>   ainda cria duas linhas em `vendas`; hoje é invisível para o saldo, com o roteamento credita
>   duas vezes. Se a #41 for primeiro, ela leva a `0032` e esta issue passa a ser a `0033`.
> - **A conta do PDV continua derivando negativa depois da #152 — e isso está certo** (§18 ponto 2).
>   É a R-007, adiada pelo José, e a dívida D-06, que manda expressamente não alterar a fórmula do
>   fechamento. A #152 reduz o buraco de −1.000 para −600 no exemplo medido e **cria o dado que a
>   D-06 precisa** para ser resolvida depois. Não é regressão nem escopo faltando.

## 1. Estado verificado (Gate Zero)

| Item                | Verificado                                                  |
| ------------------- | ----------------------------------------------------------- |
| Branch              | `fix/caixa-saldo-insuficiente`                              |
| HEAD                | `e6df198` (era `103679f` quando o documento nasceu)         |
| Base remota         | `origin/main` = `5127525071d655d31cf316324d3549fc24c69c45`  |
| Árvore              | limpa (`git status --porcelain` vazio)                      |
| Stash               | vazio                                                       |
| Commits preservados | 16 commits à frente da base; nenhum reescrito               |
| `git fetch origin`  | ✅ **executado com sucesso em 24/08** — ver correção abaixo |

> **CORREÇÃO FACTUAL (rodada de consolidação, 24/08).** Quando este documento foi escrito, o
> `fetch` falhava por credencial e o texto dizia "base remota não comprovada". **Isso deixou de
> valer.** `git fetch origin --prune` rodou com sucesso e o resultado é:
>
> - `origin/main` está **exatamente** em `5127525071d655d31cf316324d3549fc24c69c45`, o mesmo hash
>   que o documento `30` §2 registrava como base local. **Divergência zero.**
> - `git rev-list --left-right --count origin/main...HEAD` = `0 16`: a branch só adiciona, o remoto
>   não andou. Não houve rebase, merge nem reset.
> - **Não existe branch remota `fix/caixa-saldo-insuficiente`** — este trabalho nunca foi enviado.
> - O bloqueio registrado no documento `30` §2 está **resolvido** e pode ser fechado lá.

### Migration realmente livre

Última migration no repositório: `0031_solicitacao_cofre_cancelamento_recusa` (journal `idx 31`,
snapshot `0031_snapshot.json`). Varri **todas as refs locais e todos os `refs/remotes/origin/*`**
(78 branches) procurando `db/migrations/003[2-9]*` e `db/migrations/00[4-9]*`: **nenhuma ocorrência**.

**Próximo número livre: `0032`** — agora **com prova remota**: depois do `fetch` bem-sucedido,
varri de novo todas as `refs/remotes/*` atrás de `db/migrations/003[2-9]*` e `00[4-9][0-9]*` e não
há nenhuma ocorrência. A ressalva original ("vale só para o estado remoto conhecido localmente")
caiu.

> ⚠️ **Mas o número provavelmente muda.** Se a **#41** entrar antes da #152 (§18, ponto 3), ela
> leva a `0032` com o `UNIQUE` parcial dela, e a migration desta issue passa a ser a **`0033`**.

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

## 5. Migration 0033 — SQL completo

Arquivo entregue: `db/migrations/0033_roteamento_financeiro_da_venda.sql`
(+ entrada `idx 33` no `_journal.json` + `meta/0033_snapshot.json`, ambos gerados por
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
-- Trilha (P1 do revisor de seguranca): mudar roteamento e mudar o destino do dinheiro. Sem esta
-- coluna, quem redirecionou e para onde some. Nulavel e sem backfill: linha antiga fica sem autor,
-- que e a verdade sobre ela.
ALTER TABLE "formas_pagamento" ADD COLUMN "atualizado_por" text;--> statement-breakpoint

ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_atualizado_por_perfis_usuarios_usuario_id_fk"
  FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_recebivel_empresa_fk"
  FOREIGN KEY ("conta_recebivel_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_final_empresa_fk"
  FOREIGN KEY ("conta_final_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- `disponibilidade` NULL e o estado "sem roteamento" — e o que TODA forma existente vira, e o que
-- toda forma criada automaticamente pelo CREARE continua sendo ate o admin configurar. E o
-- estado que abre pendencia (R-168), nunca um destino inventado.
--
-- DOMINIO SEPARADO, e nao por acidente da disjuncao abaixo: e o mesmo padrao enumerado do
-- `vendas_pagamentos_roteamento_status_check`, e sem ele o dominio nao seria enforcado.
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_disponibilidade_check"
  CHECK ("formas_pagamento"."disponibilidade" is null
      or "formas_pagamento"."disponibilidade" in ('imediata', 'por_evento'));--> statement-breakpoint

-- `is not distinct from`, e NAO `=`. CORRECAO P0 do revisor de banco: com `=`, uma coluna nulavel
-- faz o ramo valer NULL, e CHECK so recusa quando a expressao da FALSE — `FALSE or NULL or FALSE`
-- e NULL e PASSA. O estado que escapava era o pior possivel: `disponibilidade` NULL com
-- `usa_conta_do_pdv = true`. A tabela de decisao da ingestao ramifica por `usa_conta_do_pdv`, entao
-- uma forma meio-cadastrada (checkbox marcado, disponibilidade em branco) viraria dinheiro
-- IMEDIATAMENTE GASTAVEL na conta do PDV — exatamente o "fallback silencioso" que a suite tem de
-- matar. `is not distinct from` devolve TRUE/FALSE tambem para NULL e fecha o furo.
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_roteamento_check" CHECK (
  ("formas_pagamento"."disponibilidade" is null
       and "formas_pagamento"."usa_conta_do_pdv" = false
       and "formas_pagamento"."conta_recebivel_id" is null
       and "formas_pagamento"."conta_final_id" is null)
  or ("formas_pagamento"."disponibilidade" is not distinct from 'imediata'
       and "formas_pagamento"."usa_conta_do_pdv" = true
       and "formas_pagamento"."conta_recebivel_id" is null
       and "formas_pagamento"."conta_final_id" is null)
  or ("formas_pagamento"."disponibilidade" is not distinct from 'por_evento'
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
ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_disponibilidade_check";
ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_atualizado_por_perfis_usuarios_usuario_id_fk";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "atualizado_por";
ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_conta_final_empresa_fk";
ALTER TABLE "formas_pagamento" DROP CONSTRAINT IF EXISTS "formas_pagamento_conta_recebivel_empresa_fk";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "disponibilidade";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "conta_final_id";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "conta_recebivel_id";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "usa_conta_do_pdv";
ALTER TABLE "formas_pagamento" DROP COLUMN IF EXISTS "adquirente";

ALTER TABLE "contas" DROP CONSTRAINT IF EXISTS "contas_id_empresa_unica";
```

**O rollback foi executado, e não só revisado.** Aplicado no banco descartável logo depois da
`0033`: sobraram **zero** colunas, **zero** constraints e **zero** índices dela, e a venda e as três
formas de pagamento de teste continuaram lá. Em seguida a `0033` reaplicou por cima, o que fecha a
ida e volta.

**O rollback não perde nenhum dado anterior à 0033** — todo objeto derrubado foi criado por ela.
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

> ⚠️ **ESTA SEÇÃO NÃO SOBREVIVEU À REVISÃO.** Creditar por `sum(total_pago)` cria uma segunda
> fórmula de dinheiro (§15 P0-A), faz a diferença evaporar em silêncio contra a R-170
> (§15 P0-B) e, com a ingestão concorrente ainda não idempotente, credita em dobro
> (§17 P0-2). Está mantida como registro do que foi proposto e recusado.

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

> ⚠️ **O TÍTULO ESTÁ ERRADO E A SEÇÃO TAMBÉM.** Existem **três** escritores de
> `vendas_pagamentos`, não um, e o `PUT /api/vendas` apaga o snapshot de roteamento em venda
> integrada (§15 P0-D, §17 P0-3). Mantida como registro.

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

> ⚠️ **INSUFICIENTE.** O revisor de QA mostrou que o teste 9 não fica vermelho, que o 7 é
> tautológico, que a rede de regressão do 8 não cobre nada do novo e que o 6 não tem fixture.
> Cinco mutações sobrevivem. Ver §16 antes de escrever qualquer teste.

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

> ⚠️ **SUPERADA PELA §18.** Eram três decisões; depois das quatro revisões são sete.

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

## 13. Revisão read-only — segurança (achados incorporados)

Revisor read-only de segurança rodou sobre esta proposta. **Um P0 e três P1.** As correções abaixo
passam a fazer parte do escopo da #152; a migration da §5 muda em um ponto (P1 da trilha).

### P0 — a permissão de cadastro viraria permissão de dinheiro

> **CORREÇÃO FACTUAL (24/08).** Fui conferir a matriz padrão em `db/src/referencia-permissoes.ts`:
> **nenhum cargo de referência tem `cadastro_formas_pagamento_editar`** — só o Admin, pelo acesso
> total. O Financeiro tem `cadastro_formas_pagamento_criar`
> ([referencia-permissoes.ts:280](../db/src/referencia-permissoes.ts#L280)) e o `_visualizar` (via
> `ativas`). Ou seja: o achado **não é** "meio mundo pode redirecionar dinheiro" na matriz padrão,
> e a R-172 ("Admin configura contas/adquirentes/taxas") **já está satisfeita para o `_editar`**.
> O risco real, que continua P0, é outro e tem dois lados: (a) o roteamento andaria de carona no
> `_criar`, que o **Financeiro tem**; (b) permissão é editável por cargo/setor/usuário na tela de
> Permissões, então um cargo custom com `_editar` passaria a mandar em dinheiro sem nenhum aval
> financeiro. A correção recomendada é a mesma — permissão distinta para o subconjunto de
> roteamento — mas o motivo é a R-172, não uma falha da matriz atual.

Hoje essa permissão significa "renomear uma forma"
([formas-pagamento.controller.ts:55-72](../api/src/formas-pagamento/formas-pagamento.controller.ts#L55-L72)).
Com a 0033 ela passa a decidir **para onde vai o dinheiro** — quem podia renomear passaria a
poder apontar o recebimento para uma conta à sua escolha, inclusive uma que ele mesmo criou, sem
nenhuma permissão financeira. É escalação por reuso de permissão e contraria a R-172.

`exigirPermissao`/`exigirAlgumaPermissao` ([guards.ts](../api/src/auth/guards.ts)) não têm variante
AND, então a exigência tem de ficar no service e valer **só para o subconjunto de campos de
roteamento**: alterar `nome` continua com `cadastro_formas_pagamento_editar`; alterar
`conta_recebivel_id` / `conta_final_id` / `usa_conta_do_pdv` / `disponibilidade` / `adquirente` exige
permissão financeira dedicada. O cargo **Financeiro** já existe na referência
([referencia-permissoes.ts:280](../db/src/referencia-permissoes.ts#L280)) — é acrescentar uma
permissão ao conjunto, não inventar cargo.

### P1 — a FK simples de `vendas_pagamentos` deixa a 6ª consulta cruzar tenant

`vendas_pagamentos.conta_final_id` com FK simples para `contas(id)` permite, no banco, linha de
venda da Empresa A apontando para conta da Empresa B. A 6ª consulta da §8 filtra por
`conta_final_id IN (:contaIds)` **sem amarrar `vendas.empresa_id` a `contas.empresa_id`** — um bug
de resolução, um reenvio ou uma forma migrada de empresa creditaria a Empresa B e nada reclamaria.
O precedente de `forma_pagamento_id` (também FK simples) **não** serve de defesa: aquele campo é
rótulo, este entra no saldo.

**Correção sem backfill:** a 6ª consulta junta `contas c` exigindo `c.empresa_id = v.empresa_id`, e
o teste 6 da §11 passa a cobrir a **linha já gravada**, não só o `INSERT`.

### P1 — a projeção de `GET /api/formas_pagamento` vazaria ids de conta

O guard é um OR de três permissões
([formas-pagamento.controller.ts:14-22](../api/src/formas-pagamento/formas-pagamento.controller.ts#L14-L22)):
`cadastro_formas_pagamento_visualizar`, `relatorio_vendas_visualizar` **ou** `entradas_visualizar`.
Hoje projeta só `id/empresaId/nome`. Incluir os campos de roteamento entregaria ids de conta a
perfis que não passam em nenhuma das cinco permissões do `GET /api/contas`
([contas.controller.ts:18-28](../api/src/contas/contas.controller.ts#L18-L28)).

Não reabre sozinho o 409 da R-165 — o corpo restrito continua sem número — mas quebra a premissa
escrita em [lancamentos.dominio.ts:993-997](../api/src/lancamentos/lancamentos.dominio.ts#L993-L997)
("com `GET /api/contas` entregando os ids…"): a enumeração de contas deixaria de estar atrás de
`cadastro_contas_visualizar`, e o operador de caixa (`caixa_operar` + `entradas_visualizar`) passaria
a ter **ids e caminho de saída**. **Correção:** projeção condicional — roteamento só com
`cadastro_formas_pagamento_visualizar`; **nome** de conta só com `cadastro_contas_visualizar`.

### P1 — mudança de roteamento ficaria sem trilha

`formas_pagamento` não tem `criado_por`/`atualizado_por`, o repository grava só `nome` +
`atualizadoEm`
([formas-pagamento.repository.ts:17-24](../api/src/formas-pagamento/formas-pagamento.repository.ts#L17-L24))
e não existe tabela de trilha. Quem redirecionou o dinheiro, e para onde, sumiria.
**A migration da §5 ganha `ALTER TABLE "formas_pagamento" ADD COLUMN "atualizado_por" text` com FK
para `perfis_usuarios(usuario_id)`** — aditiva, nulável, sem backfill.

### P2 — dois defeitos de camada que o roteamento agrava

1. `salvarFormaPagamento`
   ([formas-pagamento.service.ts:10-13](../api/src/formas-pagamento/formas-pagamento.service.ts#L10-L13))
   valida só `empresaId` + `nome`. Com os campos novos, conta de outra empresa vira violação `23503`
   crua → **500 em vez de 403/400**. O schema Zod em
   [shared/src/formas-pagamento/index.ts](../shared/src/formas-pagamento/index.ts) precisa crescer junto.
2. O `UPDATE` usa `empresaId` **vindo do body** e não confere linhas afetadas: hoje é inofensivo
   (só renomeia); com roteamento vira **no-op silencioso devolvendo 204**.

### P2 — a pendência do §10 é faturamento, não cadastro

Agrupada por forma com **valor total**, ela é receita agregada. Atrás de
`cadastro_formas_pagamento_visualizar` daria faturamento a quem administra cadastro e não tem
`relatorio_vendas_visualizar`. Precisa ser **endpoint próprio** — embutida no
`GET /api/formas_pagamento` cairia no guard OR e chegaria a `entradas_visualizar` — com o **valor**
atrás de `relatorio_vendas_visualizar` e a contagem/ocorrências atrás da permissão de cadastro.

## 14. Achados meus, fora dos revisores

1. **Venda integrada pode chegar sem pagamento nenhum.** `PagamentosVenda` é
   `z.array(...).default([])`
   ([shared/src/integracoes/index.ts:116](../shared/src/integracoes/index.ts#L116)) e não há
   validação cruzada de total. Venda sem pagamento não roteia nada e credita nada — precisa nascer
   pendência, não passar em silêncio.
2. **A soma dos pagamentos pode divergir do valor da venda.** A venda de retaguarda **já** exige
   `soma(tiposPagamento) == valorOriginal`
   ([vendas.service.ts:39-44](../api/src/vendas/vendas.service.ts#L39-L44)) — tolerância zero, mas
   contra `valorOriginal`, **não** contra o líquido (`original − desconto + acréscimo`) que o saldo
   usa. A venda integrada **não tem validação nenhuma**. Se a conta for creditada por
   `sum(total_pago)` e a venda valer o líquido, os dois números divergem. É exatamente a divergência
   de tolerância zero da **R-170**: a ingestão precisa comparar `sum(PagamentosVenda.valor)` com
   `liquidoCentavos(venda)` e, divergindo, **preservar a venda e nascer pendente** em vez de
   escolher um número em silêncio. Isso pede motivo explícito na pendência — proponho
   `pendencia_motivo text` em `('sem_mapa','sem_pdv','sem_pagamento','divergencia')`, nulável,
   dentro da mesma migration.
3. **O SQL da §5 é intenção, não o arquivo final.** Existe teste que provisiona o banco pelas
   migrations e pelo `db:push` do schema e exige estrutura **idêntica**
   (`Deve_GerarEstruturaIdenticaAoPush_Quando_ProvisionarViaMigrate`,
   [migracoes.test.ts:133](../tests/integration/migracoes/migracoes.test.ts#L133)). O arquivo tem de
   sair de `db:generate` a partir de `app.schema.ts` editado — escrever à mão quebra esse teste.
4. **Playwright não existe neste repositório.** Nenhuma dependência, config, pasta `e2e/` ou
   `.spec.ts` em `package.json`, `web-vue/package.json`, `tests/package.json` ou `node_modules`. O
   teste visual focado exigido pela retomada precisa **instalar** Playwright — mexe em
   `package.json`, `package-lock.json` e nos gates `audit:deps`/`depcheck`/`knip`. É escopo próprio,
   precisa de autorização e só faz sentido depois do GREEN.
5. **Índice parcial não serve ao `ON DELETE restrict`.** Os três índices da §5 são parciais, então
   excluir uma conta faria varredura em `vendas_pagamentos`. Hoje é teórico: **não existe rota
   `DELETE` para contas nem para formas de pagamento** (verificado nos dois controllers). Fica
   registrado para quando existir.

## 15. Revisão read-only — finanças e dados (5 P0)

O revisor de finanças/dados leu a proposta contra o código. **Conferi pessoalmente os três achados
mais graves antes de aceitá-los** — todos se confirmaram.

### P0-A — a proposta cria uma SEGUNDA fórmula de dinheiro para o mesmo evento

O termo antigo credita o **líquido** (`original − desconto + acréscimo`,
[contas.repository.ts:243](../api/src/contas/contas.repository.ts#L243) via `liquidoCentavos`). O
termo que eu propus credita **Σ `vendas_pagamentos.total_pago`**. Nada garante que sejam iguais — e
o único validador existente garante o **contrário**:
[vendas.service.ts:39-44](../api/src/vendas/vendas.service.ts#L39-L44) compara a soma dos pagamentos
com `valorOriginal`, o **subtotal**, não com o líquido. Por contrato da retaguarda os dois números
diferem por `(desconto − acréscimo)`.

O ADR-001 ("a venda entra pelo líquido", [regras.ts:50-53](../shared/src/caixa/regras.ts#L50-L53))
deixaria de valer para a venda integrada. Duas fórmulas para o mesmo evento é exatamente o que o
`AGENTS.md` §4.1 proíbe. **Isso invalida a §8 como escrita.**

### P0-B — a diferença entre os dois números evapora em silêncio (é a R-170)

Consequência direta do P0-A: a diferença não é creditada, não é registrada, não abre pendência e
não aparece em relatório nenhum. A R-170 diz literalmente "tolerância de R$ 0,00 … nenhum número é
escolhido em silêncio". A proposta escolhe Σ pagamentos e descarta o líquido. Agravante levantado
pelo revisor: já existe `TOLERANCIA_CONCILIACAO_CENTAVOS = 1`
([shared/src/integracoes/index.ts:184](../shared/src/integracoes/index.ts#L184)) — a R-170 já tem
uma contradição em código, e a proposta acrescentaria a segunda.

### P0-C — o fechamento continua debitando a conta do PDV pelo líquido inteiro (**conferido por mim**)

O mais importante dos cinco. Eu havia escrito que "o saldo do caixa não é tocado — outra entidade,
outra pergunta". **Está errado, e o erro esconde o defeito de verdade.**

- `calcularTotaisCaixaOperacionalRepository` soma **toda** venda do caixa pelo líquido, **sem
  nenhum filtro de forma de pagamento**
  ([caixa.repository.ts:1147-1181](../api/src/caixa/caixa.repository.ts#L1147-L1181)). Cartão conta
  como dinheiro no caixa.
- `fecharCaixa` cria um `retorno` da conta do PDV para o cofre **no valor desse saldo inteiro**
  ([caixa.service.ts:618-641](../api/src/caixa/caixa.service.ts#L618-L641)) e esse caminho **não
  chama `exigirSaldoSuficienteNaConta`** (confirmei: a porta só aparece em despesas, mercadorias,
  retiradas e transferências; `caixa.service.ts` não a importa).

Depois da correção proposta, a conta do PDV passaria a **receber só a parcela em dinheiro** e a ser
**debitada pelo líquido inteiro** a cada fechamento. Ela continua derivando negativa todo dia,
exatamente pela parcela de cartão. **A entrega trocaria o 409 visível da despesa por um negativo
silencioso no fechamento.** O teste 1 da §11 provaria a correção dentro de um turno aberto e
passaria verde sem perceber isso.

### P0-D — existem TRÊS escritores de `vendas_pagamentos`, não um (**conferido por mim**)

A §9 afirma "um caminho de escrita, nenhuma segunda API". É falso:

| Escritor                                                                               | Origem                |
| -------------------------------------------------------------------------------------- | --------------------- |
| [integracoes.repository.ts:722](../api/src/integracoes/integracoes.repository.ts#L722) | integração            |
| [vendas.repository.ts:247](../api/src/vendas/vendas.repository.ts#L247)                | `POST /api/vendas`    |
| [vendas.repository.ts:379](../api/src/vendas/vendas.repository.ts#L379)                | `PUT /api/vendas/:id` |

E o PUT **apaga todos os `vendas_pagamentos` da venda** e reinsere só as colunas base
([vendas.repository.ts:364-387](../api/src/vendas/vendas.repository.ts#L364-L387)) — com a 0033, os
reinseridos voltam ao DEFAULT `nao_aplicavel`, com conta e `disponivel_em` nulos.

Conferi que esse PUT **alcança venda integrada**: `atualizarVenda`
([vendas.service.ts:82-108](../api/src/vendas/vendas.service.ts#L82-L108)) só exige
`entradas_editar` e que a venda pertença ao caixa aberto do ator
([lancamentos.dominio.ts:346-362](../api/src/lancamentos/lancamentos.dominio.ts#L346-L362)) — que é
exatamente a situação de uma venda em dinheiro roteada minutos antes. **O operador corrige um
detalhe da venda e apaga em silêncio o crédito da conta do PDV**, sem `UPDATE` em histórico, sem
trilha, sem a porta R-165 perceber.

Ainda no mesmo eixo: `POST/PUT /api/vendas` aceitam `contaOrigemId` **e** `tiposPagamento` no mesmo
payload ([shared/src/vendas/index.ts:71,76](../shared/src/vendas/index.ts#L71)). A guarda
`v.conta_origem_id IS NULL` não duplica — ela **engole o roteamento**: o líquido inteiro vai para
uma conta só, como disponível, incluindo a parcela de cartão. É a R-169 reaberta por um caminho que
já existe.

### P0-E — a onda de reenvio em massa já está agendada (**conferido por mim**)

Eu tratei "reenvio de venda antiga" como hipótese na §12.1. **É um evento programado.** O comentário
de `jsonCanonico` ([integracoes.service.ts:105-112](../api/src/integracoes/integracoes.service.ts#L105-L112))
registra que o hash canônico mudou e conclui: _"hashes armazenados antes desta correcao divergem no
proximo re-envio identico — um 'atualizado' idempotente unico"_. Ou seja: **toda venda ingerida antes
daquela correção será reprocessada exatamente uma vez como `atualizado`.** Se o roteamento subir
antes de essa onda escoar, um lote arbitrariamente grande de vendas históricas é roteado
retroativamente e o saldo de contas de períodos fechados muda sozinho — sem `UPDATE`, mas mudando
número de caixa fechado. A opção (b) da §12.1 deixa de ser preferência e vira **requisito**.

### P1 do mesmo revisor, aceitos

1. **Reenvio preserva `conta_origem_id`.** `valoresVenda` não tem `contaOrigemId` e o `update` usa
   `set(valoresVenda)` ([integracoes.repository.ts:699](../api/src/integracoes/integracoes.repository.ts#L699)),
   então um `conta_origem_id` posto pela retaguarda **sobrevive** ao reenvio e desliga o roteamento
   daquela venda para sempre — sem crédito, sem pendência, sem sinal.
2. **A §7 mede o eixo errado.** Ela prova ausência de **deadlock**. O risco real é outro: parte do
   saldo passaria a vir de `vendas_pagamentos`, tabela que o lock de `contas` **não** protege. Uma
   ingestão concorrente pode apagar as linhas roteadas ou cancelar a venda tomando só `KEY SHARE` —
   que **convive** com o `NO KEY UPDATE` da porta. O crédito que a porta acabou de contar some
   enquanto a despesa é autorizada. Minha frase "gastar dinheiro que não existe continua
   impossível" está errada: o perigo não é um débito novo, é um **crédito que desaparece**.
3. **Venda cancelada** continuaria aparecendo como recebível (`vendasRoteadasAReceber` sem filtro
   de status).
4. **"Zero página nova, zero API nova" é falso.** O cadastro é nome-only ponta a ponta —
   [useCadastroView.ts:259](../web-vue/composables/useCadastroView.ts#L259),
   [cadastro-local.ts:65-68](../web-vue/utils/cadastro-local.ts#L65-L68),
   [formas-pagamento.repository.ts:5-11](../api/src/formas-pagamento/formas-pagamento.repository.ts#L5-L11).
   Dois seletores de conta, adquirente, disponibilidade e painel de pendência significam mexer no
   motor genérico que serve ~18 telas. É uma vertical de front inteira, e o §4 subestimou o custo.
5. **Pendência com `forma_pagamento_id` NULL não se resolve na tela onde apareceria** — a correção
   vive no dicionário da integração, não no cadastro de formas.
6. **Venda de retaguarda sem conta fica fora da pendência**: `POST /api/vendas` com
   `tiposPagamento` e **sem** `contaOrigemId` (ambos opcionais) credita nada e não abre pendência.
7. **`disponivel_em` no futuro viraria saldo hoje** — o CHECK não compara com `now()`. Ou a fórmula
   exige `disponivel_em <= now()`, ou a coluna é um booleano disfarçado de timestamp.
8. **`adquirente` como texto livre não é cadastro** — diverge na grafia e quebra o agrupamento da
   §10. A decisão 7 do documento `30` pede cadastro de verdade.
9. **A conta do PDV pode ser auto-criada.** `criarPdvComContaRepository`
   ([integracoes.repository.ts:487-501](../api/src/integracoes/integracoes.repository.ts#L487-L501))
   cria PDV **e** conta quando o CREARE manda um `idCaixa` desconhecido, com `criarAutomaticamente`
   default `true`. Dinheiro real pode cair numa conta que o admin nunca viu — então
   `usa_conta_do_pdv` não é tão "explícito" quanto a §4 afirma.

## 16. Revisão read-only — QA e falso-verde

### P0 — o teste que eu disse que ficaria vermelho NÃO fica

A §11 item 9 afirma que `conta-receita-creare.test.ts` "fica vermelho de propósito". **Não fica.** A
forma "Dinheiro" do seed ([tests/setup/seed.ts:434-435](../tests/setup/seed.ts#L434-L435)) nasceria
com `disponibilidade = NULL` → pagamento `pendente` → saldo continua 0 → despesa continua 409. O
arquivo passaria **pelo motivo errado**: antes por coluna nula, depois por pendência. O RED que
prova a correção só existe se a fixture ganhar roteamento.

### P0 — a rede de regressão da §11 item 8 não cobre nada do novo

`conta-saldo-insuficiente.test.ts` (13 casos) e `conta-saldo-locks.test.ts` usam contas criadas por
`/api/contas`, sem PDV e sem venda integrada: a 6ª consulta vale **sempre 0** ali. Elas só pegariam
omissão total (campo faltando → `NaN`), nunca consulta errada. E **nenhum** teste ingere venda
concorrente com uma saída — a aresta de lock que a própria §7 manda revisar não tem cobertura.

### P0 — as fixtures não suportam o teste de isolamento

Não existe conta, forma, PDV nem chave de integração na Empresa B
([seed.ts:355-372, 405-419, 434-435, 588-595](../tests/setup/seed.ts#L355-L372) são todos da
Empresa A). O teste 6 da §11 não tem como ser escrito hoje. E dar roteamento à forma "Dinheiro" do
seed global derrubaria `conta-fundo-saldo.test.ts`, `caixa-abertura-lacre.test.ts` e o próprio
`conta-receita-creare.test.ts`. **Recomendação aceita: fixtures novas na Empresa B; roteamento
criado dentro de cada teste pela API, nunca no seed global.**

### P0 — o teste 7 (byte-a-byte) é tautológico

O seed trunca e recria tudo já sob o schema novo, onde o DEFAULT `nao_aplicavel` torna a igualdade
verdadeira **por construção**; e o banco de integração nasce de `db:push`
([testcontainers.ts:92](../tests/setup/testcontainers.ts#L92)), então "antes da migration" nem
existe nesse ambiente. Prova real: dois contêineres — migrar até 0031, semear, tirar snapshot
ordenado das cinco consultas; **restaurar o mesmo dump**, aplicar 0033 + código novo, snapshot de
novo, `toEqual`. O "antes" precisa conter venda de retaguarda com `conta_origem_id` **e**
`vendas_pagamentos`, conta com saldo **negativo**, venda cancelada e transferência pendente.

### Mutações que a suíte proposta NÃO mataria

1. **Trocar `conta_final_id` por `conta_recebivel_id` na 6ª consulta.** No caso `imediata` as duas
   colunas são a mesma conta do PDV, e no `por_evento` o `disponivel_em IS NULL` zera os dois lados.
   Nenhum dos 10 testes distingue.
2. **Remover a guarda `v.conta_origem_id IS NULL`.** Sob o caminho de escrita proposto ela é código
   morto — só morre com fixture que insere a combinação proibida direto no banco.
3. Remover `v.computar = true` / `v.status <> 'cancelado'` da 6ª consulta: sem teste de venda
   integrada cancelada, passa.
4. Trocar `disponivel_em = venda.data_venda` por `now()`: nenhum teste afirma a data.
5. **Enfraquecer um CHECK mantendo o nome:** `migracoes.test.ts` compara só `conname`, nunca
   `pg_get_constraintdef`. A paridade push × migrate é **nominal**, não estrutural.

### Buracos de aceite

Faltam: o caminho de **falha** do roteamento (a ingestão é uma transação só — se um CHECK novo
estourar, a **venda inteira** faz rollback, e é justamente o oposto de "venda preservada"); a linha
3 da tabela da §9 (`usa_conta_do_pdv` com PDV não resolvido); o assert negativo global (`roteado`
com conta fora do cadastro = 0 linhas); o **inverso** do teste 2 (despesa contra conta cujo único
crédito é `por_evento` tem de continuar **409**); e qualquer teste da decisão §12.1(b).

## 17. Revisão read-only — banco, concorrência e idempotência

O quarto revisor chegou depois de a §18 estar escrita. **Ele achou um P0 dentro do meu próprio SQL**
e dois P0 de código que mudam o que a §8 e a §9 podem afirmar.

### O que ele confirmou

- O SQL da §5 roda em Postgres 16 e **toda linha existente passa** — ele provou caso a caso
  (`MATCH SIMPLE` não checa FK com chave parcialmente nula; o DEFAULT `nao_aplicavel` satisfaz os
  dois CHECKs; os três índices parciais nascem vazios). O precedente de sintaxe está em
  `0021_minor_hobgoblin.sql` (checks qualificados) e `0030_idempotencia_transferencia_caixa.sql`
  (índice parcial).
- A ordem do rollback está certa: `contas_id_empresa_unica` cai **por último** porque as duas FKs
  compostas dependem dela.
- **Não há aresta nova de deadlock.** Ele refez a matriz contra os seis caminhos reais
  (transferência de quatro pontas, cron, PUTs, ingestão, PUT de venda, `travarPdvRepository`) e
  verificou o que sustenta tudo: **não existe `FOR UPDATE` em `contas` em lugar nenhum**, não
  existe `DELETE` de conta, e o único `UPDATE contas` mexe em `nome`/`saldo_inicial`. A conclusão
  da §7 está certa — pelo argumento incompleto, veja P1-3.

### P0-1 (no meu SQL — **corrigido na §5**) — a lógica ternária deixava passar o pior estado

`disponibilidade` é nulável e eu comparei com `=`. `NULL = 'imediata'` é `NULL`, e um `CHECK` só
recusa quando a expressão dá **FALSE**. Refiz a conta e confirmei:

| ramo | `disponibilidade` NULL, `usa_conta_do_pdv` **true**, contas NULL |
| ---- | ---------------------------------------------------------------- |
| 1    | `TRUE AND FALSE AND …` → **FALSE**                               |
| 2    | `NULL AND TRUE AND …` → **NULL**                                 |
| 3    | `NULL AND FALSE` → **FALSE**                                     |
|      | `FALSE OR NULL OR FALSE` = **NULL → passa**                      |

E esse é o estado mais perigoso que existe: a tabela de decisão da §9 ramifica por
`usa_conta_do_pdv` **sem olhar `disponibilidade`**, então uma forma meio-cadastrada — checkbox
marcado, disponibilidade em branco — viraria `roteado` + conta do PDV + `disponivel_em` preenchido,
ou seja **dinheiro imediatamente gastável criado por cadastro pela metade**. É exatamente o mutante
"fallback silencioso para a conta do PDV" que a §11 exige matar, e o CHECK que deveria matá-lo não
matava.

Já corrigido no SQL da §5: `is not distinct from` nos ramos 2 e 3, mais um
`formas_pagamento_disponibilidade_check` enumerando o domínio — o mesmo padrão que
`vendas_pagamentos_roteamento_status_check` já usava. O CHECK de `vendas_pagamentos` **não** tinha o
furo (`roteamento_status` é `NOT NULL` e os testes são `IS [NOT] NULL`).

### P0-2 — a #152 não pode subir antes da #41 (**conferido por mim**)

A primeira ingestão concorrente da mesma venda **não serializa**. `travarVendaRepository` só é
alcançado quando o registro **já existe** ([integracoes.service.ts:785-793](../api/src/integracoes/integracoes.service.ts#L785-L793)).
Duas requisições simultâneas do mesmo `idVenda`:

1. ambas leem `buscarRegistroIntegracaoRepository` e recebem `null`;
2. ambas **inserem uma linha em `vendas`** — confirmei que **não existe unique em
   `vendas.identificador_externo`**: o schema só tem `vendas_id_empresa_unica`, os índices de
   empresa/data e caixa, e o parcial de órfãs ([app.schema.ts:904-916](../db/src/schema/app.schema.ts#L904-L916));
3. ambas inserem os `vendas_pagamentos`;
4. só no fim o `upsertRegistroIntegracaoRepository` serializa no unique de `integracoes_registros`,
   e a segunda aponta o registro para a **sua** venda.

Resultado: **duas vendas, uma órfã, com pagamentos completos.** Hoje isso é invisível para o saldo
da conta porque `conta_origem_id` é NULL na venda integrada. **Com a fórmula da §8, a órfã passa a
somar: +100% do valor na conta.**

Isso é precisamente a issue **#41** ("idempotência da venda integrada: `UNIQUE` parcial +
`ON CONFLICT`"), que o documento `30` §5 mantém como P0 de go-live **separado** desta branch. A
minha afirmação da §9 ("não há como duplicar linha nem pendência") e o teste 5 da §11 estão errados
nesse ramo — o teste passaria por acaso se as duas requisições não se cruzassem.

Saídas possíveis, em ordem de preferência do revisor: `pg_advisory_xact_lock(hashtext(empresaId ||
':' || idVenda))` logo depois da autenticação (resolve sem migration); fazer o upsert em
`integracoes_registros` **antes** de criar a venda; ou o unique parcial da #41 — que exige contar
duplicatas em produção antes, e o Gate Zero proíbe esse acesso.

### P0-3 — mesmo achado do §16 P0-D, por outro caminho

O revisor de banco chegou sozinho ao `atualizarVendaRepository` que apaga o snapshot. Dois
revisores independentes no mesmo defeito. Ele acrescenta o outro lado: `valoresBaseEdicao`
([lancamentos.dominio.ts:135](../api/src/lancamentos/lancamentos.dominio.ts#L135)) grava
`contaOrigemId: dados.contaOrigemId ?? null`, então um PUT que **preencha** `conta_origem_id` numa
venda integrada **troca o canal de crédito** e move dinheiro de uma conta para outra sem registro
nenhum. Decisão explícita necessária: ou o PUT preserva o snapshot, ou venda integrada não é
editável por essa rota.

### P1-1 — erro de banco na ingestão vira 422 e o agente DESCARTA a venda (viola R-013)

Os CHECKs e FKs novos criam classes de erro que não existiam nesse caminho: `23514`, `23503`,
`23505`. O catch de [integracoes.service.ts:834-861](../api/src/integracoes/integracoes.service.ts#L834-L861)
só re-lança `55P03` e `40P01`; todo o resto vira **422**. O comentário do próprio arquivo diz:
_"4xx faz o agente DESCARTAR a venda, e a R-013 proibe recusar venda integrada."_ Ou seja: com a
0033, um bug de roteamento deixa de ser "venda sem crédito" e vira **"venda perdida"**. Precisa
mapear as três classes para 5xx **e** validar as invariantes no código antes do insert.

### P1-2 — o rollback da §6 deixa o banco mentindo sobre si mesmo

`db:migrate` é `drizzle-kit migrate`, que registra cada arquivo em `drizzle.__drizzle_migrations`. A
§6 derruba os objetos e **deixa a linha da 0033 lá**: banco "com a 0033 aplicada" e sem nenhum
objeto dela, impossível de reaplicar, e qualquer `db:generate` seguinte diverge. O rollback precisa
de três passos que não estavam escritos: apagar a linha do ledger; reverter em bloco
`0033_*.sql` + `idx 33` do journal + `meta/0033_snapshot.json` + `app.schema.ts` (a paridade dos
três é exigida por `scripts/verificar-migrations.mjs`); e `DROP INDEX CONCURRENTLY` no caminho de
produção.

### P1-3 — a prova de lock passa a depender de dois invariantes que ninguém escreveu

1. A **invariante 5** de [contas.repository.ts:65-66](../api/src/contas/contas.repository.ts#L65-L66)
   ("mais de uma conta na mesma transação entra SEMPRE por `travarContasRepository`, em ordem
   canônica de id") **fica falsa**: uma venda dividida trava N linhas de `contas` em `KEY SHARE` na
   ordem do payload. É inofensivo hoje só porque `KEY SHARE × KEY SHARE` convive. Se alguém
   reintroduzir `FOR UPDATE` em `contas` ou criar rota de DELETE de conta, o ABBA volta — agora com
   duas fontes de FK, não uma. Tem de entrar por escrito naquele bloco, junto com a exceção
   explícita à ordem canônica.
2. A `UNIQUE(id, empresa_id)` **promove `empresa_id` a coluna-chave de `contas`**. A partir da 0033,
   um futuro `UPDATE contas SET empresa_id` deixa de ser no-key-update e passa a conflitar com o
   `KEY SHARE` das FKs. Aresta nova, hoje latente. A §7 não viu.

### P1-5 — a §7 mediu o risco de lock na tabela errada

Eu escrevi que `contas` é "desprezível por ter dezenas de linhas". O tamanho é irrelevante: a
`ADD CONSTRAINT UNIQUE` toma **`ACCESS EXCLUSIVE` na tabela**, e `SELECT … FOR NO KEY UPDATE` toma
`ROW SHARE`, que conflita. Pior: enquanto a `ALTER` espera na fila, **até `SELECT` simples empilha
atrás dela** — toda a API que lê saldo congela, não só a porta de escrita. E a sessão da migration
**não tem `lock_timeout`** (o de 10s de `db/src/sessao.ts` é das sessões da API).

Ele fecha dois pontos que eu deixei pela metade na §7:

- `drizzle-kit migrate` roda **cada arquivo dentro de uma transação**, então `CREATE INDEX
CONCURRENTLY` **não tem caminho suportado hoje** — precisa de runner à parte.
- Pelo mesmo motivo, `ADD CONSTRAINT NOT VALID` + `VALIDATE CONSTRAINT` **no mesmo arquivo não
  ajuda em nada**: o `NOT VALID` já pegou `ACCESS EXCLUSIVE` e o segura até o commit. Tem de ser
  migration separada.

### P2 aceitos

- **O terceiro índice tem a chave errada.** `vendas_pagamentos_roteamento_pendente_idx` está em
  `forma_pagamento_id`, que na consulta da §10 é chave de `GROUP BY`, não filtro — o filtro de
  tenant só existe depois do join com `vendas`. Melhor `(venda_id)` ou `(forma_pagamento_id, venda_id)`.
- **Falta índice para o `RESTRICT`**: nenhum dos parciais é elegível para a checagem da FK, então
  apagar conta faria seq scan. Latente (não há rota de DELETE), mas registrado. E o efeito colateral
  precisa estar escrito: **a partir da 0033, conta que já apareceu num snapshot de venda vira
  indeletável** — `contas.ativa` já é o caminho de desativação, então é uma porta que se fecha.
- **O DEFAULT `nao_aplicavel` é modo de falha silencioso para linha NOVA**: se o código esquecer de
  setar o status, a venda integrada nasce sem crédito em conta nenhuma — o bug de hoje, agora
  invisível, e nenhum CHECK pega.
- **Roteamento lido fora da trava da venda** (`resolverVinculosVenda` roda antes do lock): se o
  admin editar a forma no meio, o snapshot pode ser o anterior. Defensável, mas o teste 5 precisa
  fixar o esperado, senão nasce flaky.
- **`criarFormaPagamentoRepository` roda dentro da transação de ingestão**: duas ingestões
  concorrentes com a mesma forma nova colidem no unique → `23505` → 422 → venda descartada. Mesma
  família do P1-1.
- **Nomes de constraint divergentes tornam o rollback um no-op silencioso** por causa dos
  `IF EXISTS`. O `db:generate` só emite esses nomes se `app.schema.ts` declarar `foreignKey({...})`
  e `check("nome", …)` nomeados.
- **Multixact na linha da conta do PDV**: toda venda em dinheiro do turno pega `KEY SHARE` na mesma
  linha e segura até o commit. Custo, não deadlock — mas é a primeira vez que uma linha de `contas`
  recebe lock de todo mundo.
- **`MATCH SIMPLE` é o que salva o histórico.** Se alguém "melhorar" para `MATCH FULL`, toda forma
  existente quebra. Precisa estar no comentário da migration.

## 18. Gate fechado — os sete pontos, classificados (consolidação de 24/08)

> Esta seção **substitui** a tabela anterior de "oito decisões". Cada ponto foi confrontado com
> R-166–R-172, com D-06/R-007 e com o código. **Cinco dos sete já estavam decididos por regra
> vigente** — eu é que os tinha transformado em pergunta. Sobram **quatro confirmações**, três
> delas de uma linha.

| #   | Ponto                                | Classe                           | Regra que decide              |
| --- | ------------------------------------ | -------------------------------- | ----------------------------- |
| 1   | Qual número credita a conta          | **A** — resolvido por regra      | R-004 + R-005/ADR-001 + R-170 |
| 2   | Fechamento debita o líquido          | **A** — resolvido: **não mexer** | R-007 adiada + D-06           |
| 3   | Ordem com a #41                      | **B** — dependência comprovada   | —                             |
| 4   | `PUT /api/vendas` em venda integrada | **B** — dependência comprovada   | —                             |
| 5   | Corte do reenvio                     | **A** — resolvido por regra      | R-166                         |
| 6   | Permissão de roteamento              | **A** — resolvido por regra      | R-172                         |
| 7   | Escopo da liquidação                 | **A** — resolvido por definição  | doc `30` §8                   |

### 1 — Qual número credita a conta · **A**

**Já está decidido.** R-004 diz que o saldo da conta é derivado; R-005/ADR-001 fixa o filtro; e a
convenção vigente, escrita em [contas.repository.ts:122-124](../api/src/contas/contas.repository.ts#L122-L124)
e [regras.ts:50-53](../shared/src/caixa/regras.ts#L50-L53), diz que **a venda entra pelo líquido**
(`original − desconto + acréscimo`). O roteamento muda **para qual conta** o dinheiro vai, nunca
**quanto** é.

O erro da §8 foi propor `Σ total_pago` como se fosse um número alternativo. A correção não precisa
de decisão nova, precisa de **invariante**:

> Na ingestão, exigir `Σ PagamentosVenda.valor == liquidoCentavos(venda)`.
> Batendo, creditar cada `vendas_pagamentos` pelo próprio `total_pago` — que é a mesma quantia,
> apenas distribuída entre as contas. **Zero rateio, zero arredondamento, uma fórmula só.**
> Não batendo, a R-170 já manda o que fazer: preserva a venda, nada vira saldo disponível, abre
> conciliação, e **nenhum número é escolhido em silêncio**.

Tolerância: **zero**, porque a R-170 diz R$ 0,00. O `TOLERANCIA_CONCILIACAO_CENTAVOS = 1`
([shared/src/integracoes/index.ts:184](../shared/src/integracoes/index.ts#L184)) é de outra
pergunta — conferência de totais do dia por PDV — e **não pode ser reusado aqui**: seria inventar
tolerância onde a regra proíbe.

**Efeito no Caixa.** Venda de R$ 100 = R$ 40 em dinheiro + R$ 60 no cartão. Soma bate com o
líquido: a conta do PDV sobe R$ 40 **disponíveis**, a conta de recebível sobe R$ 60 **não
disponíveis**. Se o CREARE mandar pagamentos somando R$ 99 para um líquido de R$ 100, **nada entra
em conta nenhuma**, a venda continua gravada e nasce uma conciliação de R$ 1.

**Arquivos:** `shared/src/caixa/regras.ts` (termo novo no `saldoContaCentavos`),
`api/src/contas/contas.repository.ts` (6ª consulta), `api/src/integracoes/integracoes.repository.ts`
(invariante + snapshot). **Testes:** unidade da invariante; integração de venda dividida; integração
de divergência que não credita nada.

**A única confirmação que sobrava** era de leitura, não de número: quando `Σ ≠ líquido`, a
diferença não é atribuível a um pagamento específico, então a **venda inteira** nasce pendente.
✅ **Aprovado pelo José em 24/08 — virou a R-173**, com tolerância zero explícita e a ressalva de
que o `TOLERANCIA_CONCILIACAO_CENTAVOS = 1` não pode ser reusado aqui.

### 2 — O fechamento debita o líquido inteiro · **A (a regra é "não mexer")**

Isto **não é** uma decisão nova desta issue: é a **R-007**, registrada como
"❌ adiada pelo José" ([19_REGISTRO_DE_REGRAS.md:376](19_REGISTRO_DE_REGRAS.md)), e a dívida
**D-06** ([18_DIVIDAS_TECNICAS.md:146](18_DIVIDAS_TECNICAS.md)), que diz literalmente: _"A correção
foi deliberadamente adiada; não alterar a fórmula nesta rodada."_ Portanto a #152 **não toca** a
fórmula do fechamento. Ponto encerrado por decisão anterior.

O que precisa ficar escrito é a **consequência medida**, e ela é melhor do que eu havia dito.
Fundo R$ 200, turno com R$ 1.000 em vendas (R$ 400 dinheiro + R$ 600 cartão):

| Momento                  | Conta do PDV depois do fechamento |
| ------------------------ | --------------------------------- |
| Hoje                     | `200 + 0 − 1.200` = **−1.000**    |
| Depois da #152           | `200 + 400 − 1.200` = **−600**    |
| Depois de D-06 resolvida | `200 + 400 − 600` = **0** ✅      |

A #152 **reduz** o buraco de R$ 1.000 para R$ 600; ela não o cria. E o mais importante: **a #152 é
o pré-requisito da D-06**, não o contrário. A D-06 exige _"separar formas que representam dinheiro
físico das demais, com decisão de negócio sobre a classificação"_ — e `usa_conta_do_pdv` +
`disponibilidade = 'imediata'` **são exatamente essa classificação**. Sem a #152, a D-06 não tem
dado com que trabalhar.

**Arquivos afetados na #152: nenhum.** Para a vertical futura da D-06:
`api/src/caixa/caixa.repository.ts` (`calcularTotaisCaixaOperacionalRepository`),
`api/src/caixa/caixa.service.ts` (`fecharCaixa` / `registrarEntregaAoCofre`),
`shared/src/caixa/regras.ts` (`saldoCaixaCentavos`).

### 3 — Ordem com a #41 · **B, confirmada**

Reconferido no código: em `receberVendaIntegracao`, o `travarVendaRepository` está dentro de
`if (registro?.registroSistemaId)`
([integracoes.service.ts:785-793](../api/src/integracoes/integracoes.service.ts#L785-L793)) — logo
a **primeira** ingestão não tem ponto de serialização nenhum; e `vendas` não tem `UNIQUE` em
`identificador_externo`. Duas ingestões simultâneas do mesmo `idVenda` criam **duas linhas em
`vendas`**, uma órfã com pagamentos completos. Hoje é invisível para o saldo da conta; com o
roteamento, a órfã **credita o valor de novo**.

✅ **Aprovado — R-174.** #41 antes da #152, em branch própria criada de `origin/main` atualizada, sem mistura. Além de fechar esta janela,
a #41 já é P0 de go-live autônomo no documento `30` §5, tem migration própria (`UNIQUE` parcial +
`ON CONFLICT`) e exige contagem de duplicatas em produção — acesso que o Gate Zero proíbe a mim,
mas que é da natureza da #41.

A alternativa (`pg_advisory_xact_lock(hashtext(empresaId || ':' || idVenda))` dentro da #152, sem
migration) **funciona**, mas cria um mecanismo temporário que a #41 depois substitui: dois caminhos
para a mesma garantia, que é o que a regra-mãe do `AGENTS.md` §4.1 proíbe. Só vale se o José
quiser a #152 primeiro por outro motivo.

### 4 — `PUT /api/vendas` em venda integrada · **B, com uma agravante nova**

Confirmado: `atualizarVendaRepository` apaga e reinsere os `vendas_pagamentos`
([vendas.repository.ts:364-387](../api/src/vendas/vendas.repository.ts#L364-L387)) e
`valoresBaseEdicao` grava `contaOrigemId`
([lancamentos.dominio.ts:135](../api/src/lancamentos/lancamentos.dominio.ts#L135)).

**A agravante:** o próximo reenvio do CREARE já sobrescreve a venda inteira
(`db.update(vendas).set(valoresVenda)`, [integracoes.repository.ts:699](../api/src/integracoes/integracoes.repository.ts#L699))
e apaga/reinsere produtos e pagamentos. Ou seja, **editar pagamentos de uma venda integrada pela
retaguarda já é uma capacidade que não sobrevive ao próximo reenvio — hoje, antes da #152.** Não é
uma função que estamos tirando; é uma que nunca foi confiável.

✅ **Aprovado — R-177.** No PUT, para venda com `integracao_chave_id is not null`, **recusar
alteração de `tiposPagamento` e de `contaOrigemId`** com mensagem clara. Os demais campos
permitidos continuam editáveis, e a venda manual não integrada mantém o fluxo próprio.

**Arquivos:** `api/src/vendas/vendas.service.ts` (`atualizarVenda`), `api/src/vendas/vendas.repository.ts`,
`shared/src/vendas/index.ts`. **Testes:** PUT em venda integrada recusa os dois campos; PUT em venda
de retaguarda continua igual.

### 5 — Corte do reenvio · **A**

**A R-166 já decide:** _"A correção atua somente nas escritas futuras. É proibido `UPDATE`, backfill
ou regularização automática nesta entrega."_ Rotear uma venda antiga num reenvio **é** regularização
automática de histórico. Proibido. Não há o que perguntar.

O que estava em aberto era o **critério técnico**, e a §12.1 pedia ao José uma "data de corte em
cadastro" que não é necessária. Melhor:

> Uma coluna booleana em `vendas` decidida **no INSERT** — `roteamento_aplicavel`, `DEFAULT false`
> (metadata-only para o histórico). Só a venda inserida pelo código que já tem roteamento nasce
> `true`; todo reenvio lê a flag em vez de comparar datas.

Sem data, sem cadastro, sem constante. E resolve exatamente a onda de reenvio já agendada pela
mudança do hash canônico ([integracoes.service.ts:105-112](../api/src/integracoes/integracoes.service.ts#L105-L112)):
as vendas antigas voltam como `atualizado`, continuam com a flag `false`, e nenhum saldo de período
fechado se mexe.

**Arquivos:** `db/src/schema/app.schema.ts` (coluna na migration desta issue),
`api/src/integracoes/integracoes.repository.ts`. **Testes:** reenvio de venda antiga não credita;
venda nova reenviada preserva o roteamento.

### 6 — Permissão de roteamento · **A**

A **R-172** já diz: _"Admin configura contas/adquirentes/taxas"_. Roteamento é configuração de
conta, logo é do Admin. E a matriz padrão já está de acordo (ver a correção factual em §13).

✅ **Aprovado — R-176.** Permissão dedicada, proibido reusar as genéricas de criar/renomear forma.
Concedida apenas no acesso total, protegendo o subconjunto de campos de roteamento **no POST e no PUT**. O
POST importa porque o Financeiro tem `cadastro_formas_pagamento_criar`, e sem isso o roteamento
entraria de carona na criação. Mais a projeção condicional no `GET /api/formas_pagamento`, cujo
guard é um OR que inclui `entradas_visualizar`.

**Arquivos:** `db/src/referencia-permissoes.ts`, `api/src/formas-pagamento/*`,
`shared/src/formas-pagamento/index.ts`. **Testes:** cargo sem a permissão não roteia; operador de
caixa não enxerga conta na listagem.

### 7 — Escopo da liquidação · **A**

O documento `30` §8 define "Caixa testável" como **P0-A, P0-B, P1-A, P1-B, P1-C e DEV concluídos**.
Liquidação não está na lista. Logo: **vertical imediatamente posterior**, fora da #152.
✅ **Confirmado pelo José:** a D-06/R-007 vem **depois** de roteamento e liquidação, como entrega
vertical separada, sem se misturar à #41 nem à #152.

Reforço técnico: sem liquidação, dinheiro de cartão nunca fica disponível — **igual a hoje**, então
não é regressão, e o bloqueio da R-165 (dinheiro físico) é resolvido de qualquer forma.

**Ressalva honesta:** o roteiro CT-00–CT-19 **não existe no repositório** — ele é citado nos
documentos `00`, `30` e `31`, mas o passo a passo está fora daqui. Não pude conferir item por item.
Se algum passo do roteiro for "confirmar recebimento de cartão", esta resposta muda.

### Nova ordem técnica recomendada

A fila do documento `31` colocava a #152 em primeiro. A dependência comprovada no ponto 3 muda isso:

| Ordem | Issue    | Branch                                                         | Migration | Por quê agora                                                                         |
| ----- | -------- | -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| 1     | **#41**  | nova, a partir de `origin/main`                                | `0032`    | fecha a janela de ingestão concorrente **antes** de o dinheiro passar a depender dela |
| 2     | **#152** | `fix/caixa-saldo-insuficiente` (rebase na #41 depois do merge) | `0033`    | roteamento financeiro; já tem a porta R-165 e o RED provados                          |
| 3     | **#101** | `origin/101-c-01-fechamento-retorno-sangria` (já existe)       | própria   | transferência pendente × fechamento, inalterada                                       |
| 4+    | —        | #76/#98, #153, #154                                            | —         | fila do `31` sem mudança                                                              |

Fora da fila, como vertical própria depois da #152: a **liquidação** (ponto 7) e a **D-06/R-007**
(ponto 2), nessa ordem — a D-06 depende da classificação de forma que a #152 cria.

**As duas issues não se misturam.** A #41 não conhece roteamento; a #152 não mexe em idempotência de
ingestão. O único acoplamento é a ordem e o número da migration.

### Próxima entrega executável

Assim que as quatro confirmações chegarem, a primeira entrega é a **#41**, em branch nova a partir
de `origin/main` (`5127525`), nesta ordem:

1. RED determinístico: duas ingestões simultâneas do mesmo `idVenda` produzem **duas** linhas em
   `vendas` — provado pelo fio real, como foi feito em `conta-receita-creare.test.ts`.
2. `UNIQUE` parcial conforme a **R-175** — chave `(empresa_id, identificador_externo)`, predicado
   `integracao_chave_id is not null and identificador_externo is not null` — mais `ON CONFLICT` no
   insert. **SQL, rollback e contagem de duplicatas apresentados antes de aplicar**; a contagem em
   produção é do José, não minha.

   > **CORREÇÃO DO JOSÉ (24/08).** Eu havia escrito a chave como
   > `(empresa_id, integracao_chave_id, identificador_externo)`. **Está errado e foi corrigido.**
   > Com `integracao_chave_id` dentro da chave, uma troca de chave/credencial cria uma tupla nova
   > para o mesmo `idVenda` e a venda duplica assim mesmo. A chave é `(empresa_id,
identificador_externo)`; `integracao_chave_id` fica só no **predicado**, para manter a venda de
   > retaguarda fora do índice. Virou a R-175.

3. GREEN, mutações, gates proporcionais, relatório.

A #152 só é rebaseada e retomada depois de a #41 estar mergeada.

## 19. O que NÃO foi feito

- **Nenhum arquivo de código criado, alterado ou gerado**: `db/src/schema/**`, `db/migrations/**`,
  `_journal.json`, `meta/*_snapshot.json`, `api/src/**`, `shared/src/**`, `web-vue/**`, `tests/**`.
  Os únicos arquivos tocados nesta sessão são este documento e `PROJECT_BRAIN/00_INDICE.md`.
- **`git fetch` deixou de estar bloqueado** e a base remota está comprovada (§1) — o texto
  original deste documento sobre isso está corrigido lá.
- **Nenhuma implementação.** Os pontos da §18 precisam de resposta antes.
- **Gates pesados não rodaram**: `lint`, `lint:deps`, `check`, build e `npm test` completo ficam
  para o estado final, conforme o §6 do `AGENTS.md`. Rodei apenas a suíte focada da §2.
- **Playwright não rodou porque não existe** (§14, item 4). Instalá-lo é escopo próprio, com
  impacto em `package.json`, `package-lock.json` e nos gates de dependência.
- **DEV local não foi levantado, não há prints e não há URL local para teste manual.** Isso vem
  depois do primeiro GREEN funcional, que depende da autorização.
- **Os quatro revisores read-only pedidos rodaram** — segurança (§13), finanças/dados (§15),
  QA/falso-verde (§16) e banco/concorrência/idempotência (§17). Somaram **oito P0**. Conferi
  pessoalmente no código os cinco mais graves antes de aceitá-los; todos se confirmaram.
- **A única coisa que já corrigi** foi o P0 que era meu: a lógica ternária do CHECK, no SQL
  da §5. Nada mais foi mexido, porque o resto depende das decisões da §18.
- Nada de produção, CREARE real, segredo, planilha, deploy ou backfill.
