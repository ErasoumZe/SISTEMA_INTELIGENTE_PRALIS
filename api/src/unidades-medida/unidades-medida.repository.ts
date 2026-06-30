import { and, asc, eq } from "drizzle-orm";
import { unidadesMedida } from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export async function listarUnidadesMedidaRepository() {
  return banco
    .select({
      id: unidadesMedida.id,
      empresaId: unidadesMedida.empresaId,
      nome: unidadesMedida.nome,
      sigla: unidadesMedida.sigla
    })
    .from(unidadesMedida)
    .orderBy(asc(unidadesMedida.nome));
}

export async function salvarUnidadeRepository(
  input: { id?: string; empresaId: string; nome: string; sigla: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(unidadesMedida)
      .set({ nome: input.nome, sigla: input.sigla })
      .where(and(eq(unidadesMedida.id, input.id), eq(unidadesMedida.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome, sigla: input.sigla };
  }
  const [criada] = await db
    .insert(unidadesMedida)
    .values({ empresaId: input.empresaId, nome: input.nome, sigla: input.sigla })
    .returning({ id: unidadesMedida.id });
  return criada;
}

export async function copiarUnidadesMedidaRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(unidadesMedida), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(unidadesMedida).where(eq(unidadesMedida.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const unidade of origem) {
      if (jaImportado(destinos, unidade.empresaId, unidade.id)) continue;
      await db.insert(unidadesMedida).values({
        empresaId: empresaDestinoId,
        nome: unidade.nome,
        sigla: unidade.sigla,
        importadoDe: unidade.empresaId,
        idImportado: unidade.id
      });
      inseridos += 1;
    }
    return { tipo: "unidades", inseridos };
  });
}
