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

// R-239: o numero nao repete enquanto o lacre esta ATIVO (indice lacres_numero_ativo_unico, `rompido = false`).
// Depois da baixa o numero pode voltar num lote novo. Checagem previa para devolver mensagem de dominio
// amigavel antes de bater no indice.
export async function existeNumeroLacreRepository(empresaId: string, numero: string, db: ExecutorBanco = banco) {
  const [existente] = await db
    .select({ id: lacres.id, numero: lacres.numero })
    .from(lacres)
    .where(and(eq(lacres.empresaId, empresaId), eq(lacres.numero, numero), eq(lacres.rompido, false)))
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
