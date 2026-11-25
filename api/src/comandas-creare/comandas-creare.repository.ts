import { and, asc, count, desc, eq, gte, inArray, lt, max } from "drizzle-orm";
import { creareComandaItens, creareComandas, creareComandasRetrato } from "@padaria/db/schema/venda";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

// Comandas do CREARE (R-248). Sem SQL cru: agregacoes pequenas (itens de uma pagina, fechadas de um dia) sao
// feitas no service, em memoria.

export type ComandaGravar = typeof creareComandas.$inferInsert;
export type ItemGravar = typeof creareComandaItens.$inferInsert;
export type ComandaLinha = typeof creareComandas.$inferSelect;
export type ItemLinha = typeof creareComandaItens.$inferSelect;

const EM_ABERTO = [1, 2, 4];

export async function idsEmAbertoNoSistemaRepository(empresaId: string, db: ExecutorBanco = banco) {
  const linhas = await db
    .select({ idComanda: creareComandas.idComanda })
    .from(creareComandas)
    .where(and(eq(creareComandas.empresaId, empresaId), inArray(creareComandas.status, EM_ABERTO)));
  return linhas.map((linha) => linha.idComanda);
}

export async function maiorIdComandaRepository(empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ maior: max(creareComandas.idComanda) })
    .from(creareComandas)
    .where(eq(creareComandas.empresaId, empresaId));
  return linha?.maior ?? null;
}

export async function gravarRetratoRepository(empresaId: string, abertas: number, db: ExecutorBanco = banco) {
  const recebidoEm = new Date();
  await db
    .insert(creareComandasRetrato)
    .values({ empresaId, abertas, recebidoEm })
    .onConflictDoUpdate({ target: creareComandasRetrato.empresaId, set: { abertas, recebidoEm } });
}

export async function retratoRepository(empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select()
    .from(creareComandasRetrato)
    .where(eq(creareComandasRetrato.empresaId, empresaId))
    .limit(1);
  return linha ?? null;
}

// Retencao de 1 ano: so fechadas e canceladas, pela data de fechamento (indice creare_comandas_fechada_idx).
export async function apagarFechadasAntesDeRepository(empresaId: string, limite: Date, db: ExecutorBanco = banco) {
  await db
    .delete(creareComandas)
    .where(
      and(
        eq(creareComandas.empresaId, empresaId),
        inArray(creareComandas.status, [3, 5]),
        lt(creareComandas.fechadaEm, limite)
      )
    );
}

export async function hashesRepository(empresaId: string, ids: number[], db: ExecutorBanco = banco) {
  if (!ids.length) return new Map<number, string>();
  const linhas = await db
    .select({ idComanda: creareComandas.idComanda, hash: creareComandas.conteudoHash })
    .from(creareComandas)
    .where(and(eq(creareComandas.empresaId, empresaId), inArray(creareComandas.idComanda, ids)));
  return new Map(linhas.map((linha) => [linha.idComanda, linha.hash]));
}

/** Grava a comanda (upsert) e troca os itens dela por inteiro. Chamar dentro de uma transacao. */
export async function gravarComandaRepository(comanda: ComandaGravar, itens: ItemGravar[], db: ExecutorBanco) {
  const { empresaId: _empresa, idComanda: _id, ...campos } = comanda;
  await db
    .insert(creareComandas)
    .values(comanda)
    .onConflictDoUpdate({
      target: [creareComandas.empresaId, creareComandas.idComanda],
      set: { ...campos, atualizadaEm: new Date() }
    });
  await db
    .delete(creareComandaItens)
    .where(
      and(eq(creareComandaItens.empresaId, comanda.empresaId), eq(creareComandaItens.idComanda, comanda.idComanda))
    );
  if (itens.length) await db.insert(creareComandaItens).values(itens);
}

/* ---------- Leitura ---------- */

export async function listarPorStatusRepository(empresaId: string, status: number[], db: ExecutorBanco = banco) {
  return db
    .select()
    .from(creareComandas)
    .where(and(eq(creareComandas.empresaId, empresaId), inArray(creareComandas.status, status)))
    .orderBy(asc(creareComandas.abertaEm), asc(creareComandas.idComanda))
    .limit(5000);
}

// Ids das comandas em que o funcionario lancou algum item (filtro "funcionario").
function comandasDoFuncionario(empresaId: string, funcionarioCodigo: string, db: ExecutorBanco) {
  return db
    .selectDistinct({ idComanda: creareComandaItens.idComanda })
    .from(creareComandaItens)
    .where(
      and(eq(creareComandaItens.empresaId, empresaId), eq(creareComandaItens.funcionarioCodigo, funcionarioCodigo))
    );
}

export type FiltroFechadas = {
  inicio: Date;
  fim: Date;
  status: number[];
  numero?: number | undefined;
  funcionarioCodigo?: string | undefined;
};

function ondeFechadas(empresaId: string, filtro: FiltroFechadas, db: ExecutorBanco) {
  return and(
    eq(creareComandas.empresaId, empresaId),
    inArray(creareComandas.status, filtro.status),
    gte(creareComandas.fechadaEm, filtro.inicio),
    lt(creareComandas.fechadaEm, filtro.fim),
    filtro.numero === undefined ? undefined : eq(creareComandas.numero, filtro.numero),
    filtro.funcionarioCodigo
      ? inArray(creareComandas.idComanda, comandasDoFuncionario(empresaId, filtro.funcionarioCodigo, db))
      : undefined
  );
}

export async function listarFechadasRepository(
  empresaId: string,
  filtro: FiltroFechadas,
  pagina: { limite: number; deslocamento: number },
  db: ExecutorBanco = banco
) {
  const onde = ondeFechadas(empresaId, filtro, db);
  const [linhas, [total]] = await Promise.all([
    db
      .select()
      .from(creareComandas)
      .where(onde)
      .orderBy(desc(creareComandas.fechadaEm), desc(creareComandas.idComanda))
      .limit(pagina.limite)
      .offset(pagina.deslocamento),
    db.select({ total: count() }).from(creareComandas).where(onde)
  ]);
  return { linhas, total: total?.total ?? 0 };
}

/** Todas as fechadas (status 5) de uma janela, so os campos dos indicadores. */
export async function fechadasDaJanelaRepository(
  empresaId: string,
  inicio: Date,
  fim: Date,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      abertaEm: creareComandas.abertaEm,
      puxadaEm: creareComandas.puxadaEm,
      fechadaEm: creareComandas.fechadaEm,
      valorTotal: creareComandas.valorTotal,
      vendaValorTotal: creareComandas.vendaValorTotal
    })
    .from(creareComandas)
    .where(
      and(
        eq(creareComandas.empresaId, empresaId),
        eq(creareComandas.status, 5),
        gte(creareComandas.fechadaEm, inicio),
        lt(creareComandas.fechadaEm, fim)
      )
    );
}

export async function buscarComandaRepository(empresaId: string, idComanda: number, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select()
    .from(creareComandas)
    .where(and(eq(creareComandas.empresaId, empresaId), eq(creareComandas.idComanda, idComanda)))
    .limit(1);
  return linha ?? null;
}

export async function itensDasComandasRepository(empresaId: string, ids: number[], db: ExecutorBanco = banco) {
  if (!ids.length) return [];
  return db
    .select()
    .from(creareComandaItens)
    .where(and(eq(creareComandaItens.empresaId, empresaId), inArray(creareComandaItens.idComanda, ids)))
    .orderBy(asc(creareComandaItens.lancadoEm), asc(creareComandaItens.idItem));
}

// Funcionarios para o filtro: quem lancou item nas comandas em aberto ou fechadas desde `desde`.
export async function funcionariosRepository(empresaId: string, desde: Date, db: ExecutorBanco = banco) {
  const recentes = db
    .select({ idComanda: creareComandas.idComanda })
    .from(creareComandas)
    .where(and(eq(creareComandas.empresaId, empresaId), gte(creareComandas.fechadaEm, desde)));
  const abertas = db
    .select({ idComanda: creareComandas.idComanda })
    .from(creareComandas)
    .where(and(eq(creareComandas.empresaId, empresaId), inArray(creareComandas.status, EM_ABERTO)));
  const consulta = (ids: typeof recentes) =>
    db
      .selectDistinct({ codigo: creareComandaItens.funcionarioCodigo, nome: creareComandaItens.funcionarioNome })
      .from(creareComandaItens)
      .where(and(eq(creareComandaItens.empresaId, empresaId), inArray(creareComandaItens.idComanda, ids)));
  const [a, b] = await Promise.all([consulta(recentes), consulta(abertas)]);
  return [...a, ...b];
}
