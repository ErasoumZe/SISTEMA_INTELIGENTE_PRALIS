import pg from "pg";
import { expect } from "vitest";

export function poolTeste() {
  return new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
}

export async function consultarUm<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const pool = poolTeste();
  try {
    const { rows } = await pool.query<T>(sql, params);
    return rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

export async function consultarTodos<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const pool = poolTeste();
  try {
    const { rows } = await pool.query<T>(sql, params);
    return rows;
  } finally {
    await pool.end();
  }
}

export async function executarSql(sql: string, params: unknown[] = []) {
  const pool = poolTeste();
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

// Alguns testes de caixa montam um estado contabil ja recebido, mas nao testam a autorizacao da
// confirmacao (essa vertical tem teste proprio). Mantem a fixture coerente com os CHECKs e rompe o
// lacre junto, sem repetir em cada arquivo o SQL de transicao.
export async function confirmarTransferenciaPorLacreDireto(numeroLacre: string, usuarioId: string) {
  const pool = poolTeste();
  try {
    await pool.query(
      `update transferencias
          set status = 'recebido', confirmado_por = $2, data_recebimento = now(), atualizado_em = now()
        where n_lacre_doc = $1`,
      [numeroLacre, usuarioId]
    );
    await pool.query("update lacres set rompido = true where numero = $1", [numeroLacre]);
  } finally {
    await pool.end();
  }
}

export function json<T>(resposta: { json: () => unknown }) {
  return resposta.json() as T;
}

// --- Ferramental das corridas -------------------------------------------------------------------
//
// Promovido para ca porque ja existiam DUAS copias (usuarios/edicao-segura e
// colaboradores/cross-tenant) e a terceira nasceria com esta entrega.
//
// O detector NAO e `wait_event_type = 'Lock'` ("existe ALGUM waiter no banco"): isso e falso
// positivo esperando para acontecer, porque qualquer outra sessao travada satisfaz a condicao. A
// transacao bloqueadora informa o proprio `pg_backend_pid()` e o teste exige que a sessao esperando
// esteja bloqueada ESPECIFICAMENTE por ela, via `pg_blocking_pids` (core do Postgres desde a 9.6).
export type ClienteBloqueador = { cliente: pg.Client; pid: number };

/**
 * Abre uma conexao DEDICADA (client, nao pool) para segurar transacao. As funcoes de consulta deste
 * arquivo nao servem: cada uma cria um pool proprio e o `pool.end()` do `finally` derruba a conexao,
 * abortando qualquer transacao aberta e soltando os locks.
 */
export async function abrirBloqueador(): Promise<ClienteBloqueador> {
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    // Teto de espera NESTA conexao: se um teste for interrompido, o `finally` dele nao roda e sem
    // teto a transacao seguraria a linha, queimando o `testTimeout` de todos os testes seguintes.
    await cliente.query("set lock_timeout = '15s'");
    const { rows } = await cliente.query<{ pid: number }>("select pg_backend_pid() as pid");
    const pid = rows[0]?.pid;
    if (pid === undefined) throw new Error("nao foi possivel obter o pid da conexao bloqueadora");
    return { cliente, pid };
  } catch (erro) {
    await cliente.end().catch(() => undefined);
    throw erro;
  }
}

export async function fecharBloqueador(bloqueador: ClienteBloqueador) {
  await bloqueador.cliente.query("rollback").catch(() => undefined);
  await bloqueador.cliente.end().catch(() => undefined);
}

// pg_stat_activity e CONGELADA por transacao, e todo poll daqui roda NA conexao do bloqueador —
// que esta dentro de `begin`. Sem descartar o snapshot, uma sessao que nasceu DEPOIS do primeiro
// poll (conexao nova do pool da API) fica invisivel para sempre: `pg_blocking_pids` e vivo, mas a
// LISTA de linhas nao e. Medido no P0: a despesa em espera (pg_locks granted=false) nao aparecia e
// a cadeia parava em 1; o proprio retrato congelado ainda mostrava a query ANTERIOR da sessao.
async function descartarSnapshotDeAtividade(cliente: pg.Client) {
  await cliente.query("select pg_stat_clear_snapshot()");
}

export async function sessoesBloqueadasPor({ cliente, pid }: ClienteBloqueador) {
  await descartarSnapshotDeAtividade(cliente);
  const { rows } = await cliente.query<{ total: number }>(
    `select count(*)::int as total
       from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and $1 = any(pg_blocking_pids(pid))`,
    [pid]
  );
  return rows[0]?.total ?? 0;
}

/**
 * Espera ate que `minimo` sessoes estejam bloqueadas POR este bloqueador. Condicao, nao sleep.
 * Teto padrao ABAIXO do `lock_timeout` de 10s das transacoes da API — passar disso, a rota presa
 * morre por 55P03 e o caso falharia pelo motivo errado.
 */
export async function esperarBloqueioPor(bloqueador: ClienteBloqueador, minimo = 1, limiteMs = 8_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if ((await sessoesBloqueadasPor(bloqueador)) >= minimo) return true;
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
  return false;
}

// NOTA, para quem for escrever corrida com DUAS chamadas de rota reais: `sessoesBloqueadasPor` conta
// so o nivel DIRETO, e isso nao basta ali. Com duas sessoes disputando a mesma linha, a primeira
// espera o `transactionid` de quem segura, e a segunda espera o `tuple` lock da PRIMEIRA — entao
// `pg_blocking_pids` da segunda traz a primeira, nao o dono, e a contagem para em 1 para sempre.
// Medido no grafo de `pg_stat_activity`: dono=1206, primeira=1207 ([1206]), segunda=1209 ([1207]).

/**
 * CADEIA transitiva de espera a partir do bloqueador. Fecha o furo da NOTA acima: com duas rotas
 * reais em fila (fechamento atras do gate, lancamento atras do fechamento), a segunda aparece
 * bloqueada pela PRIMEIRA — nao pelo bloqueador. BFS em JS sobre um retrato unico do grafo de
 * `pg_blocking_pids`; mais legivel que CTE recursiva e imune a ciclo.
 */
export async function sessoesNaCadeiaDe({ cliente, pid }: ClienteBloqueador): Promise<number[]> {
  await descartarSnapshotDeAtividade(cliente);
  const { rows } = await cliente.query<{ pid: number; bloqueadores: number[] }>(
    `select pid, pg_blocking_pids(pid) as bloqueadores
       from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()`
  );
  const alcancados = new Set<number>();
  const fila = [pid];
  while (fila.length) {
    const atual = fila.shift()!;
    for (const linha of rows) {
      if (alcancados.has(linha.pid)) continue;
      if (linha.bloqueadores.includes(atual)) {
        alcancados.add(linha.pid);
        fila.push(linha.pid);
      }
    }
  }
  return [...alcancados];
}

/**
 * Espera ate a cadeia transitiva do bloqueador ter `minimo` sessoes. Condicao, nao sleep.
 * Teto padrao ABAIXO do `lock_timeout` de 10s das transacoes da API: se a cadeia nao formou em
 * 8s, esperar mais so faria a rota presa morrer por 55P03 e o caso falhar pelo motivo errado.
 */
export async function esperarCadeiaDeBloqueio(bloqueador: ClienteBloqueador, minimo = 1, limiteMs = 8_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if ((await sessoesNaCadeiaDe(bloqueador)).length >= minimo) return true;
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
  return false;
}

/**
 * SONDA DE ORDEM dos locks (mata a mutacao "travar o caixa DEPOIS de inserir"). Devolve as tabelas
 * em que as sessoes bloqueadas DIRETAMENTE por este bloqueador ja detem lock de ESCRITA enquanto
 * esperam. Uma rota que trava o caixa ANTES de escrever esta parada no `FOR SHARE` e nao segura
 * RowExclusiveLock em tabela de lancamento nenhuma; uma rota que escreveu primeiro esta parada no
 * proprio INSERT/UPDATE e ja segura o RowExclusiveLock da tabela.
 */
export async function travasDeEscritaDaSessaoBloqueada({ cliente, pid }: ClienteBloqueador): Promise<string[]> {
  await descartarSnapshotDeAtividade(cliente);
  const { rows } = await cliente.query<{ tabela: string }>(
    `select distinct l.relation::regclass::text as tabela
       from pg_locks l
      where l.locktype = 'relation'
        and l.mode in ('RowExclusiveLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
        and l.granted
        and l.pid in (
          select a.pid
            from pg_stat_activity a
           where a.datname = current_database()
             and a.pid <> pg_backend_pid()
             and $1 = any(pg_blocking_pids(a.pid))
        )`,
    [pid]
  );
  return rows.map((linha) => linha.tabela);
}

// Precisa de um TICK de macrotask, nao de microtask: com `Promise.resolve(marcador)` a corrida seria
// decidida antes de `promessa.then(...)` rodar, e a funcao devolveria `true` ate para uma promessa JA
// RESOLVIDA. `setTimeout(0)` deixa a fila de microtasks drenar primeiro.
export async function aindaPendente(promessa: Promise<unknown>) {
  const marcador = Symbol("pendente");
  return (
    (await Promise.race([
      promessa.then(
        () => "resolvida",
        () => "rejeitada"
      ),
      new Promise((resolver) => setTimeout(() => resolver(marcador), 0))
    ])) === marcador
  );
}

// --- Snapshot integral do lancamento ------------------------------------------------------------
//
// Prova de "nao gravou nada" que nao depende de escolher as colunas certas na mao. Pega tambem o que
// as assercoes de 1-2 campos deixavam passar: `atualizado_em` (trigger BEFORE UPDATE da migration
// 0002 dispara ate em UPDATE no-op) e a reescrita das tabelas derivadas — o DELETE+INSERT gera ids
// novos, e `uuid_generate_v7` e ordenado no tempo, entao o snapshot muda mesmo com valores iguais.
//
// `order by` explicito nas derivadas: sem ele o `jsonb_agg` herda a ordem fisica e o teste fica
// flaky depois do primeiro DELETE+INSERT.
const SNAPSHOT_POR_TABELA: Record<string, string> = {
  despesa: `select jsonb_build_object(
      'raiz',    (select to_jsonb(t) from despesas t where t.id = $1),
      'itens',   coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from despesas_itens i where i.despesa_id = $1), '[]'::jsonb),
      'debitos', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from debitos_colaboradores d where d.despesa_id = $1), '[]'::jsonb),
      'ajustes', coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from ajustes_fechamento_caixa a where a.despesa_id = $1), '[]'::jsonb)
    ) as snapshot`,
  mercadoria: `select jsonb_build_object(
      'raiz',  (select to_jsonb(t) from mercadorias t where t.id = $1),
      'itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from mercadorias_itens i where i.mercadoria_id = $1), '[]'::jsonb),
      'notas', coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from notas_fiscais n where n.mercadoria_id = $1), '[]'::jsonb)
    ) as snapshot`,
  retirada: `select jsonb_build_object(
      'raiz',    (select to_jsonb(t) from retiradas t where t.id = $1),
      'debitos', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from debitos_colaboradores d where d.retirada_id = $1), '[]'::jsonb)
    ) as snapshot`,
  venda: `select jsonb_build_object(
      'raiz',       (select to_jsonb(t) from vendas t where t.id = $1),
      'produtos',   coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from vendas_produtos p where p.venda_id = $1), '[]'::jsonb),
      'pagamentos', coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from vendas_pagamentos g where g.venda_id = $1), '[]'::jsonb),
      'trilha',     coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from alteracoes_pos_fechamento_caixa a where a.venda_id = $1), '[]'::jsonb)
    ) as snapshot`,
  transferencia: `select jsonb_build_object(
      'raiz',       (select to_jsonb(t) from transferencias t where t.id = $1),
      'candidatos', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from transferencias_destinos_candidatos c where c.transferencia_id = $1), '[]'::jsonb),
      'lacres',     coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from lacres l where l.transferencia_id = $1), '[]'::jsonb)
    ) as snapshot`
};

export async function snapshotDoLancamento(
  tabela: "despesa" | "mercadoria" | "retirada" | "venda" | "transferencia",
  id: string
) {
  const sql = SNAPSHOT_POR_TABELA[tabela];
  if (!sql) throw new Error(`snapshot nao definido para ${tabela}`);
  const linha = await consultarUm<{ snapshot: unknown }>(sql, [id]);
  return linha?.snapshot ?? null;
}

/**
 * Marca-d'agua do universo de lancamentos. Substitui a contagem por `descricao`, que e coluna LEGADO
 * em remocao: no dia em que ela parar de ser escrita, todo `expect(gravadas(...)).toBe(0)` vira
 * vacuamente verde. `max(id::text)` pega o caso "inseriu e deletou", que o count sozinho perde,
 * porque `uuid_generate_v7` e ordenado no tempo.
 */
export async function universoDeLancamentos() {
  return consultarUm<Record<string, string | number | null>>(
    `select
       (select count(*) from despesas)              as despesas,
       (select count(*) from mercadorias)           as mercadorias,
       (select count(*) from retiradas)             as retiradas,
       (select count(*) from despesas_itens)        as despesas_itens,
       (select count(*) from mercadorias_itens)     as mercadorias_itens,
       (select count(*) from debitos_colaboradores) as debitos,
       (select max(id::text) from despesas)         as ultima_despesa,
       (select max(id::text) from mercadorias)      as ultima_mercadoria,
       (select max(id::text) from retiradas)        as ultima_retirada,
       (select max(id::text) from debitos_colaboradores) as ultimo_debito`
  );
}

export function expectNaoConterJson(resposta: { json: () => unknown }, valor: string) {
  expect(JSON.stringify(resposta.json())).not.toContain(valor);
}
