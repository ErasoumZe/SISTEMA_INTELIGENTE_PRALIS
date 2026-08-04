import { and, desc, eq, inArray } from "drizzle-orm";
import { lacres } from "@padaria/db/schema/transferencia";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import type { OrigemLacre } from "@padaria/shared/lacres";

const colunasLacre = {
  id: lacres.id,
  empresaId: lacres.empresaId,
  numero: lacres.numero,
  transferenciaId: lacres.transferenciaId,
  origem: lacres.origem,
  rompido: lacres.rompido,
  criadoEm: lacres.criadoEm
};

export async function listarLacresRepository(
  filtro: { empresasPermitidas: string[]; transferenciaId?: string; origem?: OrigemLacre },
  db: ExecutorBanco = banco
) {
  if (!filtro.empresasPermitidas.length) return [];
  const condicoes = [inArray(lacres.empresaId, filtro.empresasPermitidas)];
  if (filtro.transferenciaId) condicoes.push(eq(lacres.transferenciaId, filtro.transferenciaId));
  if (filtro.origem) condicoes.push(eq(lacres.origem, filtro.origem));
  return db
    .select(colunasLacre)
    .from(lacres)
    .where(and(...condicoes))
    .orderBy(desc(lacres.criadoEm));
}

// Um lacre nunca repete por empresa (constraint lacres_numero_unico). Checagem previa para devolver
// mensagem de dominio amigavel antes de bater na constraint.
export async function existeNumeroLacreRepository(empresaId: string, numero: string, db: ExecutorBanco = banco) {
  const [existente] = await db
    .select({ id: lacres.id, numero: lacres.numero })
    .from(lacres)
    .where(and(eq(lacres.empresaId, empresaId), eq(lacres.numero, numero)))
    .limit(1);
  return existente ?? null;
}

export async function criarLacreRepository(
  input: { empresaId: string; numero: string; origem: OrigemLacre },
  db: ExecutorBanco = banco
) {
  const [criado] = await db
    .insert(lacres)
    .values({ empresaId: input.empresaId, numero: input.numero, origem: input.origem })
    .returning({ id: lacres.id });
  return criado;
}
