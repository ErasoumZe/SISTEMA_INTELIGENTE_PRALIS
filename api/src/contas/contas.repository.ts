import { and, asc, eq } from "drizzle-orm";
import { contas } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export async function listarContasRepository() {
  return banco
    .select({ id: contas.id, empresaId: contas.empresaId, nome: contas.nome })
    .from(contas)
    .orderBy(asc(contas.nome));
}

export async function salvarContaRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(contas)
      .set({ nome: input.nome })
      .where(and(eq(contas.id, input.id), eq(contas.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(contas)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: contas.id });
  return criada;
}

export async function buscarContaEmpresaRepository(contaId: string, db: ExecutorBanco = banco) {
  const [conta] = await db
    .select({ id: contas.id, empresaId: contas.empresaId })
    .from(contas)
    .where(eq(contas.id, contaId))
    .limit(1);
  return conta ?? null;
}

export async function copiarContasRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(contas), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(contas).where(eq(contas.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const conta of origem) {
      if (jaImportado(destinos, conta.empresaId, conta.id)) continue;
      await db
        .insert(contas)
        .values({ empresaId: empresaDestinoId, nome: conta.nome, importadoDe: conta.empresaId, idImportado: conta.id });
      inseridos += 1;
    }
    return { tipo: "contas", inseridos };
  });
}
