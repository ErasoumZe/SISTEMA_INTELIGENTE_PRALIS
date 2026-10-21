import { and, asc, eq } from "drizzle-orm";
import { fornecedores } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export async function listarFornecedoresRepository() {
  return banco
    .select({
      id: fornecedores.id,
      empresaId: fornecedores.empresaId,
      nome: fornecedores.nome,
      documento: fornecedores.documento,
      whatsapp: fornecedores.whatsapp,
      situacao: fornecedores.situacao
    })
    .from(fornecedores)
    .orderBy(asc(fornecedores.nome));
}

export async function salvarFornecedorRepository(
  input: {
    id?: string;
    empresaId: string;
    nome: string;
    documento: string | null;
    whatsapp: string | null;
    situacao: "ativo" | "inativo";
  },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(fornecedores)
      .set({ nome: input.nome, documento: input.documento, whatsapp: input.whatsapp, situacao: input.situacao })
      .where(and(eq(fornecedores.id, input.id), eq(fornecedores.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(fornecedores)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      documento: input.documento,
      whatsapp: input.whatsapp,
      situacao: input.situacao
    })
    .returning({ id: fornecedores.id });
  return criado;
}

export async function copiarFornecedoresRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(fornecedores), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(fornecedores).where(eq(fornecedores.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const fornecedor of origem) {
      if (jaImportado(destinos, fornecedor.empresaId, fornecedor.id)) continue;
      await db.insert(fornecedores).values({
        empresaId: empresaDestinoId,
        nome: fornecedor.nome,
        documento: fornecedor.documento,
        whatsapp: fornecedor.whatsapp,
        importadoDe: fornecedor.empresaId,
        idImportado: fornecedor.id
      });
      inseridos += 1;
    }
    return { tipo: "fornecedores", inseridos };
  });
}
