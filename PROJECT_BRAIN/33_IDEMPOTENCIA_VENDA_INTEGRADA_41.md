# 33 — #41: idempotência da venda integrada (desenho, aguardando autorização)

> **STATUS (25/08): MIGRATION CANDIDATA GERADA, NÃO APLICADA.** A auditoria read-only de produção
> voltou **zerada** (§4-A), o que liberou a geração local. `db/migrations/0032_*`, a entrada do
> journal e o snapshot existem no repositório e **não foram executados em banco nenhum** — nem DEV.
> Nenhum arquivo de `api/src` foi tocado: o `ON CONFLICT` (§6) continua **não implementado** e os 7
> RED continuam vermelhos de propósito. Este documento é o gate TECH-01 / `AGENTS.md` §4.6 da
> **#41**, que a **R-174** colocou à frente da #152.
>
> A #41 **não conhece roteamento financeiro**. Nada da #152 entra aqui.
>
> **Sobre os links deste documento.** Ele nasceu na branch da #152 e cita os documentos `30` e `32`
> e as regras R-166, R-173, R-176 e R-177, que **não estão nesta branch** — chegam com a #152. Aqui
> valem apenas **R-174** e **R-175**, transportadas para o documento `19`. Os links quebrados para
> `30`/`32` são esperados e voltam a resolver quando as duas branches estiverem em `main`.

## 1. Estado de partida

| Item                  | Valor                                                    |
| --------------------- | -------------------------------------------------------- |
| Branch da #41         | `fix/venda-integrada-idempotencia`                       |
| Criada de             | `origin/main` `5127525071d655d31cf316324d3549fc24c69c45` |
| RED                   | `b633afb` — 7 vermelhos + 3 guardas verdes               |
| Migration desta issue | `0032` (a da #152 passa a `0033`)                        |

> A tabela original citava `fix/caixa-saldo-insuficiente` e o HEAD `de3de2b` porque este documento
> nasceu na branch da #152, antes de a #41 existir. Corrigido em 25/08.

## 2. O defeito, pelo código

`receberVendaIntegracao` decide criar-ou-atualizar pelo **registro da integração**, e o registro é
escopado pela chave:

```
integracoes_registros_externo_unico = (empresa_id, integracao_chave_id, tipo_registro, identificador_externo)
```

([app.schema.ts:805-810](../db/src/schema/app.schema.ts#L805-L810), consulta em
[integracoes.repository.ts:400-422](../api/src/integracoes/integracoes.repository.ts#L400-L422)).

Disso saem **dois** caminhos que criam venda duplicada:

### 2.1 Corrida na primeira ingestão

`travarVendaRepository` — o único ponto que serializa — está **dentro** de
`if (registro?.registroSistemaId)`
([integracoes.service.ts:785-793](../api/src/integracoes/integracoes.service.ts#L785-L793)). Quando
o registro ainda não existe, nada serializa:

1. A e B leem o registro → ambos `null`;
2. ambos travam o caixa com `FOR SHARE` — que **convive consigo mesmo**, então não serializa;
3. ambos inserem em `vendas` ([integracoes.repository.ts:694](../api/src/integracoes/integracoes.repository.ts#L694));
4. só no fim o `upsertRegistroIntegracaoRepository` serializa no unique de `integracoes_registros`,
   e o segundo faz `DO UPDATE` apontando o registro para a **sua** venda.

Resultado: **duas vendas, uma órfã com pagamentos completos.** Não existe unique em
`vendas.identificador_externo` — conferido no schema
([app.schema.ts:904-916](../db/src/schema/app.schema.ts#L904-L916)) e em todas as migrations.

### 2.2 Troca de chave/credencial — o motivo da correção do José

Como o registro é escopado por `integracao_chave_id`, depois de uma rotação de credencial o mesmo
`idVenda` **não é encontrado** e o código toma o caminho de INSERT para uma venda que já existe.
Não é corrida: é sequencial e reproduzível.

**É por isso que a chave única não pode conter `integracao_chave_id`** (R-175). Com
`(empresa_id, integracao_chave_id, identificador_externo)`, a rotação criaria uma tupla nova e o
índice deixaria a duplicata passar — o índice pareceria protegido e não estaria.

> A rotação **não** é hipotética no código: `inativarChaveIntegracaoRepository` faz
> `ativa = false` ([integracoes.repository.ts:111-116](../api/src/integracoes/integracoes.repository.ts#L111-L116))
> e a criação de chave é uma rota normal. Não existe `delete(integracoesChaves)` em lugar nenhum —
> o que importa, porque a FK de `vendas.integracao_chave_id` é `on delete set null`
> ([app.schema.ts:866](../db/src/schema/app.schema.ts#L866)) e um delete faria a venda **sair** do
> índice parcial em silêncio. Fica registrado como invariante a preservar.

## 3. Migration 0032 — SQL integral

Arquivo proposto: `db/migrations/0032_idempotencia_venda_integrada.sql`, mais a entrada `idx 32` no
`_journal.json` e `meta/0032_snapshot.json` — os três **gerados por `db:generate`**, nunca à mão: o
teste `Deve_GerarEstruturaIdenticaAoPush_Quando_ProvisionarViaMigrate`
([migracoes.test.ts:133](../tests/integration/migracoes/migracoes.test.ts#L133)) compara a estrutura
vinda das migrations com a vinda do `db:push` do schema.

```sql
-- R-175 (#41): uma venda integrada por (empresa, identificador externo). ADITIVA — nenhuma coluna,
-- nenhum UPDATE, nenhum backfill (R-166).
--
-- POR QUE INDICE PARCIAL, e nao UNIQUE CONSTRAINT: constraint nao aceita predicado. A venda de
-- RETAGUARDA precisa ficar de fora — ela nasce com integracao_chave_id NULL e identificador_externo
-- NULL (o payload de /api/vendas nem tem o campo), e duas vendas manuais no mesmo dia sao legitimas.
--
-- POR QUE `integracao_chave_id` FICA NO PREDICADO E NAO NA CHAVE: o registro da integracao e
-- escopado por chave, entao uma troca de credencial faz o mesmo idVenda ser lido como inedito. Com
-- a chave dentro do indice, a tupla seria nova e a duplicata passaria — o indice pareceria proteger
-- e nao protegeria. No predicado, ele so separa integrada de manual, que e o papel dele.
--
-- Precedente de forma no repositorio: `transferencias_idempotencia_unica` (0030).
CREATE UNIQUE INDEX "vendas_integracao_identificador_unico_idx" ON "vendas"
  USING btree ("empresa_id","identificador_externo")
  WHERE "vendas"."integracao_chave_id" is not null
    and "vendas"."identificador_externo" is not null;
```

**É o arquivo inteiro.** Uma instrução.

### Impacto de lock

`CREATE UNIQUE INDEX` (não concorrente) toma **`SHARE`** em `vendas`: leitura continua, **escrita
para** durante a construção. `vendas` é a maior tabela candidata do sistema e o volume em produção
**não é conhecido** — Gate Zero proíbe o acesso.

- Em DEV/CI: irrelevante.
- Em produção: tem de ser `CREATE UNIQUE INDEX CONCURRENTLY`, que **não pode rodar dentro de
  transação** — e `drizzle-kit migrate` roda cada arquivo em uma. Ou seja, **não existe caminho
  suportado hoje**: precisa de um passo de runner próprio, fora do `db:migrate`. Isso é decisão de
  deploy, não desta entrega.
- A migration falha de imediato se houver duplicata — daí a consulta da §4 vir **antes**.

## 4. Consulta read-only de duplicidades

> **A seção 1 foi executada por Marco em 25/08 e voltou zerada — evidência na §4-A.** As seções 2 a
> 4 continuam sem execução (só fariam sentido com duplicata > 0). As quatro estão em
> [`db/scripts/auditoria-vendas-integradas-duplicadas.sql`](../db/scripts/auditoria-vendas-integradas-duplicadas.sql),
> junto dos demais scripts de diagnóstico do repositório:
> `psql "$DATABASE_URL" -f db/scripts/auditoria-vendas-integradas-duplicadas.sql`.
> Marco autoriza e executa, ou acompanha, uma sessão explicitamente read-only, preservando a
> evidência e sem ampliar o acesso.

**Somente leitura. Nenhum `UPDATE`, `DELETE` ou `INSERT`.** Nenhuma IA executa esta consulta em
produção automaticamente.

```sql
-- (1) Resposta em uma linha: existe duplicata?
select count(*)                        as grupos_duplicados,
       coalesce(sum(qtd - 1), 0)       as linhas_excedentes
from (
  select empresa_id, identificador_externo, count(*) as qtd
  from vendas
  where integracao_chave_id is not null
    and identificador_externo is not null
  group by empresa_id, identificador_externo
  having count(*) > 1
) d;
```

```sql
-- (2) Quais sao, com impacto em dinheiro, chave e caixa.
select v.empresa_id,
       v.identificador_externo,
       count(*)                                                     as qtd,
       array_agg(v.id                 order by v.criado_em)         as venda_ids,
       array_agg(v.criado_em          order by v.criado_em)         as criadas_em,
       array_agg(distinct v.integracao_chave_id)                    as chaves_envolvidas,
       array_agg(v.caixa_id           order by v.criado_em)         as caixas,
       array_agg(v.status             order by v.criado_em)         as status,
       array_agg(v.computar           order by v.criado_em)         as computar,
       sum(v.valor_original - v.valor_desconto + v.valor_acrescimo) as soma_liquida,
       max(v.valor_original - v.valor_desconto + v.valor_acrescimo) as liquido_unitario
from vendas v
where v.integracao_chave_id is not null
  and v.identificador_externo is not null
group by v.empresa_id, v.identificador_externo
having count(*) > 1
order by count(*) desc, soma_liquida desc;
```

`chaves_envolvidas` com **mais de um** elemento é a assinatura da rotação de credencial (§2.2); com
**um só**, é corrida de ingestão (§2.1). Os dois casos aparecem separados sem consulta extra.

```sql
-- (3) Quanto ja entrou em caixa FECHADO — o que nao pode ser mexido sem OS propria (R-166).
select coalesce(fc.status, '(sem caixa)') as status_caixa,
       count(*)                           as vendas_no_grupo_duplicado
from vendas v
left join fechamentos_caixa fc on fc.id = v.caixa_id
where (v.empresa_id, v.identificador_externo) in (
        select empresa_id, identificador_externo
        from vendas
        where integracao_chave_id is not null
          and identificador_externo is not null
        group by empresa_id, identificador_externo
        having count(*) > 1)
group by coalesce(fc.status, '(sem caixa)')
order by count(*) desc;
```

**Se (1) devolver zero, a migration entra direto.** Se devolver qualquer coisa maior que zero, a
migration **não pode ser aplicada** enquanto as duplicatas existirem — e limpá-las é
**regularização de histórico**, proibida pela R-166 nesta entrega: vira OS própria, medida,
auditável e autorizada, com a consulta (3) dizendo quanto disso está em caixa fechado.

## 4-A. Auditoria de produção — executada e ZERADA (25/08/2026)

Marco executou a **seção 1** de `db/scripts/auditoria-vendas-integradas-duplicadas.sql` em
produção, em transação **READ ONLY**, encerrada com **`ROLLBACK`**. Nenhum dado foi alterado.

| Campo               | Valor |
| ------------------- | ----- |
| `grupos_duplicados` | **0** |
| `linhas_excedentes` | **0** |

| Evidência | Registro                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------ |
| Data      | 25/08/2026                                                                                       |
| Ambiente  | produção                                                                                         |
| Modo      | transação `READ ONLY`, encerrada com `ROLLBACK`                                                  |
| Executor  | Marco (sessão read-only autorizada) — nenhuma IA acessou produção                                |
| Consultas | somente a seção 1, agregada; seções 2–4 **não** foram executadas                                 |
| Exposição | nenhuma: só os dois agregados saíram; nenhum `empresa_id`, `identificador_externo` ou `venda_id` |
| Exit code | 0 (aprovada)                                                                                     |

**Consequência:** a alternativa (B) do gate está satisfeita — a migration **pode ser gerada**
localmente. Zero duplicata também significa que o `CREATE UNIQUE INDEX` **não falhará por dado
preexistente**, e que **não há regularização histórica a fazer** (a R-166 continua intacta: nada a
limpar).

## 5. Rollback

```sql
DROP INDEX IF EXISTS "vendas_integracao_identificador_unico_idx";
```

Sem perda: o índice não guarda dado, e nenhuma coluna é criada. Mas o rollback **não é só o SQL** —
são quatro passos, na ordem (o passo 4 é o que faltava no rollback da #152, apontado pelo revisor de
banco em `32` §17 P1-2):

1. **Derrubar o código primeiro.** Código que espera o índice (o `ON CONFLICT`) contra um banco sem
   ele volta a duplicar em silêncio, que é pior que falhar.
2. `DROP INDEX` — em produção, `DROP INDEX CONCURRENTLY`, pelo mesmo motivo do `CREATE`.
3. Reverter em **bloco** `db/migrations/0032_*.sql`, a entrada `idx 32` do `_journal.json`,
   `meta/0032_snapshot.json` e `db/src/schema/app.schema.ts` — `scripts/verificar-migrations.mjs`
   exige a paridade dos três e a corrente de `prevId`.
4. Apagar a linha da 0032 em `drizzle.__drizzle_migrations`. Sem isso o banco fica "com a 0032
   aplicada" e sem o índice: impossível reaplicar, e o próximo `db:generate` diverge.

## 6. Desenho do `ON CONFLICT`

Duas mudanças no serviço. Nenhuma toca fórmula de dinheiro.

### 6.1 A existência da venda passa a ser decidida pela mesma chave do índice

Hoje é o registro (escopado por chave) que decide criar-ou-atualizar. Passa a ser a venda:

```ts
// novo, em integracoes.repository.ts — mesma chave do indice parcial
export async function buscarVendaIntegradaPorIdentificadorRepository(
  empresaId: string,
  identificadorExterno: string,
  db: ExecutorBanco
): Promise<string | null>;
//   select id from vendas
//   where empresa_id = $1 and identificador_externo = $2 and integracao_chave_id is not null
```

```ts
// em receberVendaIntegracao, logo apos o short-circuit de `sem_novidade`:
const vendaExistenteId =
  registro?.registroSistemaId ??
  (await buscarVendaIntegradaPorIdentificadorRepository(chave.empresaId, identificadorExterno, tx));
```

`vendaExistenteId` substitui `registro?.registroSistemaId` em **QUATRO** pontos. O `registro` mantém
**um só** papel: o atalho de `sem_novidade` por hash.

| #   | Linha atual                                                                   | O que muda                                                                                           |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | [service.ts:764-766](../api/src/integracoes/integracoes.service.ts#L764-L766) | a origem do caixa passa a usar `vendaExistenteId`                                                    |
| 2   | [service.ts:788-793](../api/src/integracoes/integracoes.service.ts#L788-L793) | a guarda `if (registro?.registroSistemaId)` vira `if (vendaExistenteId)`; a trava e a releitura idem |
| 3   | [service.ts:798](../api/src/integracoes/integracoes.service.ts#L798)          | `...(vendaExistenteId ? { vendaSistemaId: vendaExistenteId } : {})`                                  |
| 4   | **[service.ts:830](../api/src/integracoes/integracoes.service.ts#L830)**      | **`const status = vendaExistenteId ? "atualizado" : "criado";`**                                     |

> **CORREÇÃO DE 25/08 — o ponto 4 estava faltando neste documento.** A versão anterior dizia "três
> pontos" e deixava de fora
> [integracoes.service.ts:830](../api/src/integracoes/integracoes.service.ts#L830):
>
> ```ts
> const status = registro ? "atualizado" : "criado";
> ```
>
> **O status precisa depender de `vendaExistenteId`, não de `registro`.** Sem isso a rotação de
> credencial grava **uma** venda — que é o comportamento certo — mas responde **`"criado"`**, e o
> RED-2 (`venda-integrada-rotacao-de-chave.test.ts`) exige **`"atualizado"`**. O resultado seria um
> meio-verde: dado correto no banco, resposta mentindo para o agente. **Rotação de chave responde
> `"atualizado"`, sempre.** Achado na auditoria read-only registrada em
> `PRE-GREEN-ISSUE-41-IDEMPOTENCIA.md` (I-1).

Efeito: **a rotação de credencial (§2.2) deixa de chegar ao INSERT.** A venda é encontrada, o
caminho de atualização roda com todas as travas na ordem canônica, e o
`upsertRegistroIntegracaoRepository` cria o registro da chave nova. O registro da chave antiga fica
como histórico, apontando para a mesma venda — correto, é o que aconteceu.

### 6.2 O INSERT ganha `ON CONFLICT DO NOTHING`, e a corrida vira 5xx transitório

```ts
const [criada] = await db
  .insert(vendas)
  .values(valoresVenda)
  .onConflictDoNothing({
    target: [vendas.empresaId, vendas.identificadorExterno],
    // predicado do indice parcial, montado por operadores — NAO por template `sql`,
    // que `scripts/verificar-arquitetura.mjs` proibe em `api/src`
    where: and(isNotNull(vendas.integracaoChaveId), isNotNull(vendas.identificadorExterno))
  })
  .returning({ id: vendas.id });

if (!criada) throw erroVendaDuplicadaEmCorrida(); // code -> 503, o agente re-tenta
```

Assinatura conferida no drizzle-orm 0.45.2:
`onConflictDoNothing({ target?: IndexColumn | IndexColumn[], where?: SQL })`, onde `where` é o
predicado do índice parcial.

**Por que `DO NOTHING` e não `DO UPDATE`.** Com `DO UPDATE`, o perdedor atualizaria a venda do
vencedor — mas ele calculou `caixaOrigemId = null` porque acreditava estar criando, e **nunca
chamou `travarVendaRepository`** naquela linha. Isso atropela as invariantes da S8: trava de origem
e destino em ordem determinística, marca de pós-fechamento no caixa que **perdeu** a venda, e a
detecção de "a venda mudou de caixa". `DO NOTHING` + erro transitório preserva todas elas: o
re-envio seguinte entra pelo caminho de atualização, com as travas na ordem certa.

**Por que 5xx e não 4xx.** A R-013 proíbe recusar venda integrada: 4xx faz o agente **descartar** a
venda. Mesma família do `CODIGO_VENDA_MUDOU_DE_CAIXA`, que já vira 503 `LOCK_OCUPADO`
([integracoes.service.ts:856-859](../api/src/integracoes/integracoes.service.ts#L856-L859)). O novo
código entra ao lado dele.

**Sequência do perdedor**, sem ambiguidade: `ON CONFLICT DO NOTHING` **espera** o inserter
concorrente terminar; commitado ele, devolve zero linhas **sem abortar a transação**. O perdedor
levanta o erro transitório, sofre rollback (inclusive dos cadastros que `resolverVinculosVenda`
possa ter criado), responde 503, e o agente re-tenta. No re-envio, o §6.1 encontra a venda e o fluxo
é o de atualização.

### 6.3 Terceira mudança, OBRIGATÓRIA e P0: `23505` residual nunca pode virar 422

> **CORREÇÃO DE 25/08.** Este item era descrito aqui como "pequena". **Não é.** É P0 funcional: sem
> ele, um conflito que escape do `ON CONFLICT` **perde venda de verdade**.

O `catch` de `receberVendaIntegracao` re-lança só `55P03` e `40P01`; **todo o resto cai na última
linha e vira 422** via `naoProcessavel`
([integracoes.service.ts:834-862](../api/src/integracoes/integracoes.service.ts#L834-L862),
[erros.ts:51-53](../api/src/erros.ts#L51-L53)) — e o comentário do próprio arquivo diz que 4xx faz o
agente **descartar** a venda, o que a R-013 proíbe.

Contrato desta issue, sem ambiguidade:

- **conflito residual `23505` nunca pode virar 422 descartável;**
- **conflito transitório responde 503 retriable** — o agente re-tenta e, no re-envio, o §6.1 encontra
  a venda e o fluxo é o de atualização;
- **reutilizar o mecanismo do `VENDA_MUDOU_DE_CAIXA`**: `Error` simples com `code`, espelhando
  `erroVendaMudouDeCaixa` ([service.ts:128-133](../api/src/integracoes/integracoes.service.ts#L128-L133)),
  convertido a `ErroDominio(503, "LOCK_OCUPADO")` ao lado de
  [service.ts:858-860](../api/src/integracoes/integracoes.service.ts#L858-L860). **Nada de segundo
  caminho para o mesmo ato** (`AGENTS.md` §4.1);
- **não criar quinto status** em `integracoes_historico`. O
  `integracoes_historico_status_check` aceita `('criado','atualizado','sem_novidade','erro')`
  ([app.schema.ts:836-839](../db/src/schema/app.schema.ts#L836-L839)); um status novo exigiria
  migration, e migration fora do índice parcial está **fora do escopo da #41**.

#### P2 separado — ruído no contador de erros

O `catch` grava o histórico em [service.ts:840](../api/src/integracoes/integracoes.service.ts#L840),
**antes** de classificar o código em [856-860](../api/src/integracoes/integracoes.service.ts#L856-L860).
Logo **todo transitório de hoje já deixa uma linha `status = 'erro'`** — `55P03`, `40P01` e
`VENDA_MUDOU_DE_CAIXA` inclusive — e o erro de corrida se comportará igual. Consequência visível: a
tela de Integrações passa a mostrar `erros > 0` a cada entrega duplicada benigna, porque
`listarHistoricoIntegracao` agrega por dia.

**Fica documentado como P2 separado, fora da #41.** Não é regressão (o comportamento é o mesmo dos
transitórios que já existem) e resolvê-lo exigiria ou um status novo (migration) ou reordenar o
`catch` — decisões que não pertencem a esta issue.

### 6.4 O que a #41 NÃO faz

Não toca roteamento, saldo, fórmula, `vendas_pagamentos`, permissão, fechamento nem a #152. Não
limpa duplicata existente. Não acessa produção.

## 7. Testes RED determinísticos

Três arquivos RED. Nenhum usa `sleep`: a sincronização é por **condição**, com os utilitários que já
existem em `tests/setup/integracao.ts` (`abrirBloqueador`, `esperarCadeiaDeBloqueio`) — o mesmo
padrão de `conta-saldo-insuficiente.test.ts:308-341`. `aindaPendente` também existe ali
(`integracao.ts:211`) e passa a ser usado pelo **T-9**, não pelos três RED.

### RED-1 · corrida na primeira ingestão (as duas ordens)

**Barreira:** o único ponto por onde as duas requisições passam antes do INSERT é
`travarCaixaCompartilhadoRepository`, que é `FOR SHARE` em `fechamentos_caixa`
([caixa.repository.ts:490-500](../api/src/caixa/caixa.repository.ts#L490-L500)). Um cliente externo
segurando aquela linha com `FOR UPDATE` enfileira as duas — e, decisivo, **as duas já leram o
registro como `null` antes de bloquear**, porque a leitura do registro acontece antes da trava
(linha 747 contra linha ~772). A janela fica forçada, não sorteada.

```
1. abrir caixa para o PDV do vinculo, com a dataVenda dentro do periodo
2. bloqueador: begin; select id from fechamentos_caixa where id = $caixa for update;
3. dispara POST /api/integracoes (A) com idVenda X  -> enfileira na trava
4. esperarCadeiaDeBloqueio(bloqueador, 1)
5. dispara POST /api/integracoes (B) com o MESMO idVenda X, payload identico -> enfileira atras
6. esperarCadeiaDeBloqueio(bloqueador, 2)
7. fecharBloqueador  -> as duas seguem
8. await Promise.all([A, B])
```

**Determinismo:** hoje nada serializa as duas depois da barreira — `FOR SHARE` convive consigo
mesmo e não há unique. Ambos os INSERTs passam **em qualquer ordem**. Logo a asserção RED é fixa:

```
select count(*) from vendas where identificador_externo = X   -->  2     (hoje)
as duas respostas                                             -->  200   (hoje)
```

E a asserção GREEN, também independente de ordem — que é mais forte que testar duas ordens
separadas, porque vale para as duas:

```
count(vendas)                     = 1
respostas: exatamente uma 200 e exatamente uma 503
integracoes_registros aponta para a venda que sobrou
vendas_produtos / vendas_pagamentos: um conjunto so, sem empilhar
o re-envio seguinte devolve 'sem_novidade' ou 'atualizado', nunca cria outra venda
```

Para exercitar explicitamente as **duas ordens** de quem chega primeiro ao INSERT, o mesmo arquivo
roda o cenário duas vezes invertendo a ordem de enfileiramento (passos 3 e 5): a fila de locks do
Postgres é FIFO, então quem entra primeiro na fila sai primeiro. O invariante acima tem de valer
nas duas.

### RED-2 · troca de chave/credencial (sequencial, sem corrida)

O caso que motivou a R-175. Totalmente determinístico:

```
1. cria chave K1, vinculo de PDV, ingere idVenda X  -> 1 venda
2. inativa K1 (PATCH/DELETE de chave = ativa=false) e cria a chave K2 na MESMA empresa
3. reenvia o MESMO idVenda X, payload identico, com K2
```

```
hoje:   select count(*) from vendas where identificador_externo = X  -->  2
green:  1 venda; a linha migra para integracao_chave_id = K2;
        existe registro para K1 E para K2, os dois apontando para a mesma venda;
        a resposta e 'atualizado', nunca 'criado', e nunca 503 em loop
```

**Este teste é a prova de que a chave da R-175 está certa:** com
`(empresa_id, integracao_chave_id, identificador_externo)` ele continuaria **vermelho depois da
migration** — o índice deixaria a segunda venda entrar.

### RED-3 · as duas ordens no nível da sessão, com controle total

Onde a barreira de lock não dá controle sobre _quem commita primeiro_, duas sessões `pg` cruas
replicam as instruções do repositório com interleaving explícito — o mesmo recurso que
`tests/setup/integracao.ts` já expõe via `poolTeste()`:

```
ordem A→B:  S1 begin; S1 insert venda X;
            S2 begin; S2 insert venda X;      -- hoje passa; depois do indice, ESPERA
            S1 commit;                        -- depois do indice, S2 acorda com 23505
            S2 commit
ordem B→A:  o espelho exato
```

```
hoje:  os dois commits passam nas DUAS ordens  -> 2 linhas
green: nas duas ordens, um commit passa e o outro leva 23505 -> 1 linha
```

### Testes que FALTAM para o GREEN — T-8 a T-11 (acrescentados em 25/08)

Os três arquivos RED cobrem a corrida, a rotação e o interleaving. A auditoria read-only
(`PRE-GREEN-ISSUE-41-IDEMPOTENCIA.md`) achou quatro buracos. Entram junto com o GREEN.

| Id       | Caso                                                                                                                         | Por que é necessário                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-8**  | **Isolamento entre empresas** — o mesmo `idVenda` na empresa A e na B produz **duas** vendas legítimas, sem conflito         | A chave do índice começa por `empresa_id`, mas **nada prova isso hoje**. Exige uma chave de integração própria para `idsTeste.empresaB` (`tests/setup/contexto.ts:25`). Mata a mutação "buscar a venda sem filtrar `empresa_id`" |
| **T-9**  | **O perdedor permanece PENDENTE enquanto o vencedor não commita**, usando `aindaPendente` (`tests/setup/integracao.ts:211`)  | É a prova de que o índice **arbitra** de fato: `ON CONFLICT DO NOTHING` espera o inserter concorrente. Mata a mutação "tirar o predicado do `where`", que faria estourar `23505` cru em vez de esperar                           |
| **T-10** | **Resposta nominal 503**, com `code`, não apenas `statusCode >= 500`                                                         | RED-1 hoje só verifica a faixa. A R-013 merece asserção nominal: 4xx faria o agente **descartar** a venda                                                                                                                        |
| **T-11** | **Pagamento dividido sob corrida** — reusar o rateio assimétrico de `pagamento-dividido.test.ts` dentro da barreira do RED-1 | Garante que o rollback do perdedor não deixa pagamento órfão nem empilha rateio na venda que sobrou                                                                                                                              |

`aindaPendente` já existe e **não era usado** por nenhum dos três RED — a menção a ele no cabeçalho
da §7 estava adiantada. O T-9 é quem passa a usá-lo.

### Regressão obrigatória

`tests/integration/integracoes/` inteiro — em especial `pagamento-dividido.test.ts` (reenvio
idêntico, alteração de rateio, `sem_novidade`), `integracoes.test.ts` e
`conciliacao-integracao.test.ts` — mais `tests/integration/caixa/caixa-venda-integrada.test.ts` e
`tests/integration/migracoes/migracoes.test.ts`.

### Mutações que a suíte precisa matar

1. trocar `DO NOTHING` por `DO UPDATE` → RED-1 tem de pegar a trilha de pós-fechamento faltando;
2. tirar o predicado do `where` do `ON CONFLICT` → o Postgres não casa o índice parcial e a
   inserção estoura `23505` cru → 503 permanente em vez de conflito tratado;
3. pôr `integracao_chave_id` na chave do índice → **RED-2 fica vermelho**;
4. devolver 4xx no lugar de 5xx no perdedor → o agente descartaria a venda (R-013);
5. manter a decisão criar-ou-atualizar no registro em vez da venda → **RED-2 fica vermelho**;
6. remover o mapeamento de `23505` para 5xx → 422 e venda descartada;
7. transformar o índice parcial em `UNIQUE` cheio → a guarda "venda de RETAGUARDA continua livre"
   (RED-3) quebra na hora;
8. **esquecer a linha [830](../api/src/integracoes/integracoes.service.ts#L830)** (o `status`) →
   **RED-2 fica vermelho** exigindo `"atualizado"` e recebendo `"criado"`;
9. buscar a venda sem filtrar `empresa_id` → **T-8 fica vermelho**.

## 7-A. RED escrito e medido — 24/08/2026

Autorizado a avançar **somente** para a fase RED. Os três arquivos existem, rodaram e falham pelos
sintomas descritos acima.

| Arquivo                                             | Casos | Vermelhos | Verdes |
| --------------------------------------------------- | ----- | --------- | ------ |
| `venda-integrada-corrida-primeira-ingestao.test.ts` | 3     | 2         | 1      |
| `venda-integrada-rotacao-de-chave.test.ts`          | 4     | 3         | 1      |
| `venda-integrada-interleaving-sessoes.test.ts`      | 3     | 2         | 1      |
| **Total**                                           | 10    | **7**     | 3      |

```
npx vitest run --project integration tests/integration/integracoes/venda-integrada-*.test.ts
Test Files  3 failed (3)
Tests       7 failed | 3 passed (10)
Duration    80.35s
exit code   1
```

### O que cada vermelho provou

**Corrida — as duas ordens.** Os dois lados voltaram **200 com `status: "criado"` e `vendaId`
DIFERENTE**, para o mesmo `identificadorExterno`:

```
A=200 {"status":"criado","vendaId":"01a035f2-c358-73f3-806c-bc20310c7ef1", ...}
B=200 {"status":"criado","vendaId":"01a035f2-c355-76ba-9d07-fa386b96993e", ...}
```

Duas vendas, duas criações, um único `idVenda`. O resultado repetiu com a fila invertida — como
previsto, hoje nada serializa depois da barreira, então a ordem não muda o desfecho.

**Rotação de credencial.** Sem concorrência nenhuma: a ingestão pela chave nova respondeu
`status: "criado"` e gravou a **segunda** venda. E os registros se separaram — o da chave antiga
aponta para `01a035f3-17f1…` e o da chave nova para `01a035f3-18b9…`. **É a prova em execução de
que a R-175 está certa:** com `integracao_chave_id` dentro da chave única, esta duplicata passaria
mesmo depois da migration.

**Interleaving em duas sessões.** Nas duas ordens, o segundo `INSERT` foi _"aceito sem erro"_ —
nenhum `23505`, porque não existe `UNIQUE` parcial em `vendas`.

### Os três verdes são guardas, não acaso

1. **`o reenvio depois da corrida nao pode criar uma terceira venda`** — passa porque, depois da
   corrida, o registro já existe e o reenvio entra pelo caminho de atualização. Guarda contra
   regressão: a #41 não pode quebrar isto.
2. **`a venda entra uma vez com a chave antiga`** — a linha de base. Se ficar vermelha, o defeito
   medido é outro.
3. **`venda de RETAGUARDA continua livre`** — duas vendas manuais no mesmo dia continuam válidas.
   É a guarda do **predicado** do índice: se alguém transformar o parcial em `UNIQUE` cheio, este
   caso quebra na hora.

### Detalhes de execução que valem registro

- **Sem `sleep` em lugar nenhum.** A sincronização é por condição (`esperarCadeiaDeBloqueio`), e a
  barreira é a linha do caixa segurada por `FOR UPDATE` em conexão dedicada.
- **A ingestão de aquecimento é obrigatória** e está no `beforeAll`: sem ela as duas concorrentes
  disputariam o unique de `integracoes_vinculos` e serializariam **antes** do `INSERT`, medindo
  outra coisa.
- **A chave do seed não é tocada.** O arquivo da rotação cria as duas chaves que usa, para não
  derrubar os demais testes de integração.
- `tsc --noEmit` do workspace `tests`: **exit 0**. `eslint` nos três arquivos: **exit 0**.

## 8. Ordem de execução depois da autorização

1. Criar a branch a partir de `origin/main` (`5127525`).
2. Escrever os três RED e provar que ficam vermelhos pelo fio real.
3. **Rodar a consulta da §4 somente no ambiente e na sessão que Marco autorizar.** Havendo
   duplicata, **parar** — a
   limpeza é OS própria (R-166).
4. Só então gerar a migration por `db:generate`, mostrar o diff dos três arquivos e **parar de novo
   antes de aplicar**.
5. Implementar §6.1, §6.2 e §6.3, GREEN, mutações, gates, relatório.

## 9. O que NÃO foi feito (atualizado em 25/08)

- **A migration NÃO foi aplicada** — nem em produção, nem em DEV, nem no banco dos testes. Ela
  existe como arquivo versionado e nada mais.
- **Nenhum arquivo de `api/src` foi tocado.** O `ON CONFLICT` da §6 continua não implementado, a
  busca por `(empresa, identificador)` não existe, e o mapeamento de `23505` não foi feito.
- **Os 7 RED continuam vermelhos**, de propósito, e não foram reexecutados nesta rodada.
- T-8 a T-11 estão especificados e **não foram escritos**.
- `npm test` completo, mutações e gates finais não rodaram.
- Nenhuma IA acessou produção. As seções 2 a 4 da auditoria não foram executadas.
- Nenhuma duplicata foi limpa (não havia nenhuma) e nenhum dado histórico foi reescrito.
- Nada da #152, da #101 ou da D-06 foi tocado ou misturado.
- Sem push, PR, merge ou deploy.
