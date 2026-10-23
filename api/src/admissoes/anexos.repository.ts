import { and, desc, eq } from "drizzle-orm";
import { admissoesProcessosFichaAnexos } from "@padaria/db/schema";
import type { TransacaoBanco } from "../banco/conexao.js";
import { banco } from "../banco/conexao.js";

export async function listarAnexosFichaRepository(
  fichaId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  return db
    .select()
    .from(admissoesProcessosFichaAnexos)
    .where(
      and(eq(admissoesProcessosFichaAnexos.fichaId, fichaId), eq(admissoesProcessosFichaAnexos.empresaId, empresaId))
    )
    .orderBy(desc(admissoesProcessosFichaAnexos.criadoEm));
}

export async function buscarAnexoFichaRepository(
  anexoId: string,
  fichaId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .select()
    .from(admissoesProcessosFichaAnexos)
    .where(
      and(
        eq(admissoesProcessosFichaAnexos.id, anexoId),
        eq(admissoesProcessosFichaAnexos.fichaId, fichaId),
        eq(admissoesProcessosFichaAnexos.empresaId, empresaId)
      )
    )
    .limit(1);
  return linha ?? null;
}

export async function criarAnexoFichaRepository(
  input: {
    empresaId: string;
    fichaId: string;
    processoId: string;
    tipo: string;
    nomeOriginal: string;
    nomeArquivo: string;
    caminho: string;
    mimeType: string;
    tamanhoBytes: number;
  },
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db.insert(admissoesProcessosFichaAnexos).values(input).returning();
  return linha;
}

export async function removerAnexoFichaRepository(
  anexoId: string,
  fichaId: string,
  empresaId: string,
  db: TransacaoBanco | typeof banco = banco
) {
  const [linha] = await db
    .delete(admissoesProcessosFichaAnexos)
    .where(
      and(
        eq(admissoesProcessosFichaAnexos.id, anexoId),
        eq(admissoesProcessosFichaAnexos.fichaId, fichaId),
        eq(admissoesProcessosFichaAnexos.empresaId, empresaId)
      )
    )
    .returning();
  return linha ?? null;
}
