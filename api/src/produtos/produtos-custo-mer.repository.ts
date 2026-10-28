import { and, eq, inArray, isNull } from "drizzle-orm";
import { empresas, produtos } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

/**
 * Produtos que recebem o custo da discriminacao (DB-05). Decisao de José (28/10/2026): SO A TNP — a aba e
 * "TNP - DISCRIMINAÇÃO MERCADORIAS". Ativos e inativos, como no oficial (que so tirava os unificados).
 */
export async function empresasComPrefixoRepository() {
  return banco.select({ id: empresas.id, matriculaPrefixo: empresas.matriculaPrefixo }).from(empresas);
}

export async function produtosParaCustearRepository(empresaIds: string[]) {
  if (!empresaIds.length) return [];
  return banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      nomeCatalogo: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      custo: produtos.custo,
      quantidadeCaixa: produtos.quantidadeCaixa
    })
    .from(produtos)
    .where(inArray(produtos.empresaId, empresaIds))
    .orderBy(produtos.descricao);
}

/**
 * Grava o custo novo SO se o custo ainda e o da previa (oficial): quem editou o produto no meio nao tem o
 * que digitou sobrescrito. Devolve a empresa do produto quando gravou.
 */
export async function gravarCustoRepository(
  tx: ExecutorBanco,
  id: string,
  custoAtual: number | null,
  custoNovo: number
) {
  const [atingido] = await tx
    .update(produtos)
    .set({ custo: custoNovo.toFixed(2), atualizadoEm: new Date() })
    .where(
      and(eq(produtos.id, id), custoAtual === null ? isNull(produtos.custo) : eq(produtos.custo, custoAtual.toFixed(2)))
    )
    .returning({ empresaId: produtos.empresaId });
  return atingido?.empresaId ?? null;
}
