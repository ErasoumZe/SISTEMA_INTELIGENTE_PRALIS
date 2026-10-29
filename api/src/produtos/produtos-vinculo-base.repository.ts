import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { produtos, produtosCatalogoBase } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

/**
 * Vinculo dos produtos de loja que ja existem no ERP ao catalogo BASE (passo da virada, R-222). No app
 * oficial toda copia de loja tem `base_product_id`; no ERP os produtos que vieram antes da BASE ficaram
 * soltos — sem heranca e fora do espelho da planilha.
 */
export async function basesParaVinculoRepository(tx: ExecutorBanco = banco) {
  return tx
    .select({
      id: produtosCatalogoBase.id,
      nome: produtosCatalogoBase.nome,
      codigoInterno: produtosCatalogoBase.codigoInterno,
      codigoBarras: produtosCatalogoBase.codigoBarras
    })
    .from(produtosCatalogoBase);
}

export async function produtosDaLojaParaVinculoRepository(
  empresaId: string,
  bloquear: boolean,
  tx: ExecutorBanco = banco
) {
  const consulta = tx
    .select({
      id: produtos.id,
      produtoBaseId: produtos.produtoBaseId,
      nomeCatalogo: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      // Codigo do PDV: o unico codigo dos produtos que a integracao de vendas criou sozinha.
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno,
      codigoBarras: produtos.codigoBarras
    })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId))
    .orderBy(produtos.id);
  return bloquear ? consulta.for("update") : consulta;
}

/**
 * Liga so quem ainda esta solto (a guarda e o proprio `produto_base_id IS NULL`). Codigo interno, codigo
 * de barras e nome do catalogo chegam resolvidos pelo plano: so preenchem o que estava vazio.
 */
export async function ligarProdutosABaseRepository(
  tx: TransacaoBanco,
  empresaId: string,
  pares: Array<{
    produtoId: string;
    produtoBaseId: string;
    codigoInterno: string | null;
    codigoBarras: string | null;
    nomeCatalogo: string | null;
  }>
): Promise<number> {
  let ligados = 0;
  for (const par of pares) {
    const atingidos = await tx
      .update(produtos)
      .set({
        produtoBaseId: par.produtoBaseId,
        codigoInterno: par.codigoInterno,
        codigoBarras: par.codigoBarras,
        nomeCatalogo: par.nomeCatalogo,
        atualizadoEm: new Date()
      })
      .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, par.produtoId), isNull(produtos.produtoBaseId)))
      .returning({ id: produtos.id });
    ligados += atingidos.length;
  }
  return ligados;
}

/** BASEs que ja tem copia nesta loja (uma BASE, no maximo uma copia por loja). */
export async function basesComCopiaNaLojaRepository(empresaId: string, tx: ExecutorBanco = banco) {
  const linhas = await tx
    .select({ produtoBaseId: produtos.produtoBaseId })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), isNotNull(produtos.produtoBaseId)));
  return new Set(linhas.map((linha) => linha.produtoBaseId));
}
