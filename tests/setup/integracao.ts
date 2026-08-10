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

export async function sessoesBloqueadasPor({ cliente, pid }: ClienteBloqueador) {
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

/** Espera ate que `minimo` sessoes estejam bloqueadas POR este bloqueador. Condicao, nao sleep. */
export async function esperarBloqueioPor(bloqueador: ClienteBloqueador, minimo = 1, limiteMs = 20_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if ((await sessoesBloqueadasPor(bloqueador)) >= minimo) return true;
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
  return false;
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
    ) as snapshot`
};

export async function snapshotDoLancamento(tabela: "despesa" | "mercadoria" | "retirada", id: string) {
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
