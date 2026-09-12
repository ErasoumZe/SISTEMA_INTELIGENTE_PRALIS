import { asc, eq, inArray } from "drizzle-orm";
import { empresas } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarEmpresasRepository(idsPermitidos: string[]) {
  return banco
    .select({
      id: empresas.id,
      nome: empresas.nome,
      cnpj: empresas.cnpj,
      contaCofreId: empresas.contaCofreId,
      configuracoesAparencia: empresas.configuracoesAparencia
    })
    .from(empresas)
    .where(inArray(empresas.id, idsPermitidos))
    .orderBy(asc(empresas.nome));
}

export async function salvarEmpresaRepository(
  input: { id?: string; nome: string; cnpj: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db.update(empresas).set({ nome: input.nome, cnpj: input.cnpj }).where(eq(empresas.id, input.id));
    return { id: input.id, nome: input.nome, cnpj: input.cnpj };
  }
  const [criada] = await db
    .insert(empresas)
    .values({ nome: input.nome, cnpj: input.cnpj })
    .returning({ id: empresas.id });
  return criada;
}
