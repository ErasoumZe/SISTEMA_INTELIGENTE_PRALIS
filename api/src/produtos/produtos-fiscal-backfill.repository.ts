import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { produtos, produtosFiscal } from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

/** Estados que ainda pedem uma tentativa (oficial). `completo` e as pendencias humanas nao. */
export const ESTADOS_QUE_PEDEM_TENTATIVA = ["nao_classificado", "parcial", "fonte_indisponivel"] as const;

/**
 * Quem entra na rodada do backfill: ordenado por `id` e cortado pelo cursor — retomada sem repetir nem
 * pular (ordenar por coluna mutavel faria o item mudar de lugar no meio da paginacao).
 */
export async function elegiveisDoBackfillRepository(filtro: {
  escopoEmpresas: string[];
  empresaId?: string | undefined;
  produtoId?: string | undefined;
  cursor?: string | undefined;
  limite: number;
}) {
  if (!filtro.escopoEmpresas.length) return [];
  const condicoes = [
    inArray(produtos.empresaId, filtro.escopoEmpresas),
    filtro.empresaId ? eq(produtos.empresaId, filtro.empresaId) : undefined,
    filtro.produtoId ? eq(produtos.id, filtro.produtoId) : undefined,
    filtro.cursor ? gt(produtos.id, filtro.cursor) : undefined,
    // Sem linha fiscal nenhuma tambem entra: e quem nunca foi classificado.
    filtro.produtoId
      ? undefined
      : or(
          isNull(produtosFiscal.produtoId),
          isNull(produtosFiscal.estado),
          inArray(produtosFiscal.estado, [...ESTADOS_QUE_PEDEM_TENTATIVA])
        )
  ].filter((condicao) => condicao !== undefined);
  return banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      descricao: produtos.descricao,
      nomeCatalogo: produtos.nomeCatalogo,
      codigoBarras: produtos.codigoBarras,
      estado: produtosFiscal.estado
    })
    .from(produtos)
    .leftJoin(produtosFiscal, eq(produtosFiscal.produtoId, produtos.id))
    .where(and(...condicoes))
    .orderBy(asc(produtos.id))
    .limit(filtro.limite);
}
