import { eq } from "drizzle-orm";
import { configuracoesMenuEmpresas } from "@padaria/db/schema";
import type { EstruturaMenuEmpresa } from "@padaria/shared";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function obterEstruturaMenuEmpresaRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<EstruturaMenuEmpresa | null> {
  const [linha] = await db
    .select({ estrutura: configuracoesMenuEmpresas.estrutura })
    .from(configuracoesMenuEmpresas)
    .where(eq(configuracoesMenuEmpresas.empresaId, empresaId))
    .limit(1);
  return linha?.estrutura ?? null;
}

export async function salvarEstruturaMenuEmpresaRepository(
  empresaId: string,
  estrutura: EstruturaMenuEmpresa,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .insert(configuracoesMenuEmpresas)
    .values({ empresaId, estrutura, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: configuracoesMenuEmpresas.empresaId,
      set: { estrutura, atualizadoEm: new Date() }
    });
}
