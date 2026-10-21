import { asc, eq, inArray } from "drizzle-orm";
import { empresas, usuariosEmpresas } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarEmpresasRepository(idsPermitidos: string[]) {
  return banco
    .select({
      id: empresas.id,
      nome: empresas.nome,
      cnpj: empresas.cnpj,
      matriculaPrefixo: empresas.matriculaPrefixo,
      fusoHorario: empresas.fusoHorario,
      comprasPrazoRespostaHoras: empresas.comprasPrazoRespostaHoras,
      contaCofreId: empresas.contaCofreId,
      configuracoesAparencia: empresas.configuracoesAparencia
    })
    .from(empresas)
    .where(inArray(empresas.id, idsPermitidos))
    .orderBy(asc(empresas.nome));
}

export async function salvarEmpresaRepository(
  input: {
    id?: string;
    nome: string;
    cnpj: string | null;
    matriculaPrefixo: string;
    fusoHorario: string;
    comprasPrazoRespostaHoras: number | null;
  },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(empresas)
      .set({
        nome: input.nome,
        cnpj: input.cnpj,
        matriculaPrefixo: input.matriculaPrefixo,
        fusoHorario: input.fusoHorario,
        comprasPrazoRespostaHoras: input.comprasPrazoRespostaHoras
      })
      .where(eq(empresas.id, input.id));
    return input;
  }
  const [criada] = await db.insert(empresas).values(input).returning({ id: empresas.id });
  return criada;
}

export async function vincularUsuarioEmpresaRepository(
  usuarioId: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  await db.insert(usuariosEmpresas).values({ usuarioId, empresaId }).onConflictDoNothing();
}
