import { eq } from "drizzle-orm";
import { gruposMercadorias, produtosCatalogoBase, unidadesMedida } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

/** Grupos e unidades que a loja ja tem (fase B1 da virada, doc 56). */
export async function gruposEUnidadesDaLojaRepository(empresaId: string, tx: ExecutorBanco = banco) {
  const [grupos, unidades] = await Promise.all([
    tx
      .select({ nome: gruposMercadorias.nome })
      .from(gruposMercadorias)
      .where(eq(gruposMercadorias.empresaId, empresaId)),
    tx.select({ sigla: unidadesMedida.sigla }).from(unidadesMedida).where(eq(unidadesMedida.empresaId, empresaId))
  ]);
  return { grupos: grupos.map((g) => g.nome), unidades: unidades.map((u) => u.sigla) };
}

/** Os dados oficiais da BASE: as siglas de unidade que os produtos realmente usam saem daqui. */
export async function dadosOficiaisDaBaseRepository(tx: ExecutorBanco = banco) {
  const linhas = await tx.select({ dados: produtosCatalogoBase.dadosOficiais }).from(produtosCatalogoBase);
  return linhas.map((linha) => linha.dados);
}

export async function criarGruposEUnidadesRepository(
  tx: TransacaoBanco,
  empresaId: string,
  grupos: string[],
  unidades: Array<{ sigla: string; nome: string }>
): Promise<{ grupos: number; unidades: number }> {
  if (grupos.length) await tx.insert(gruposMercadorias).values(grupos.map((nome) => ({ empresaId, nome })));
  if (unidades.length) await tx.insert(unidadesMedida).values(unidades.map((u) => ({ empresaId, ...u })));
  return { grupos: grupos.length, unidades: unidades.length };
}
