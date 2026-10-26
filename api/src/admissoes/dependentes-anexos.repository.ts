import { and, asc, eq } from "drizzle-orm";
import { admissoesProcessosDependentesAnexos } from "@padaria/db/schema";
import type { TransacaoBanco } from "../banco/conexao.js";
import { banco } from "../banco/conexao.js";

const escopo = (dependenteId: string, empresaId: string) =>
  and(
    eq(admissoesProcessosDependentesAnexos.dependenteId, dependenteId),
    eq(admissoesProcessosDependentesAnexos.empresaId, empresaId)
  );

export function listarAnexosDependenteRepository(
  dependenteId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  return db
    .select()
    .from(admissoesProcessosDependentesAnexos)
    .where(escopo(dependenteId, empresaId))
    .orderBy(asc(admissoesProcessosDependentesAnexos.criadoEm));
}

export async function buscarAnexoDependenteRepository(
  dependenteId: string,
  empresaId: string,
  anexoId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .select()
    .from(admissoesProcessosDependentesAnexos)
    .where(and(escopo(dependenteId, empresaId), eq(admissoesProcessosDependentesAnexos.id, anexoId)))
    .limit(1);
  return linha ?? null;
}

export async function buscarAnexoPorTipoDependenteRepository(
  dependenteId: string,
  empresaId: string,
  tipo: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .select()
    .from(admissoesProcessosDependentesAnexos)
    .where(and(escopo(dependenteId, empresaId), eq(admissoesProcessosDependentesAnexos.tipo, tipo)))
    .limit(1);
  return linha ?? null;
}

export async function criarAnexoDependenteRepository(
  input: typeof admissoesProcessosDependentesAnexos.$inferInsert,
  db: TransacaoBanco
) {
  const [linha] = await db.insert(admissoesProcessosDependentesAnexos).values(input).returning();
  return linha ?? null;
}

export async function removerAnexoDependenteRepository(
  dependenteId: string,
  empresaId: string,
  anexoId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .delete(admissoesProcessosDependentesAnexos)
    .where(and(escopo(dependenteId, empresaId), eq(admissoesProcessosDependentesAnexos.id, anexoId)))
    .returning();
  return linha ?? null;
}
