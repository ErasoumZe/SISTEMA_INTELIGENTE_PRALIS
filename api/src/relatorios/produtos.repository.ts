import { desc, eq, sql } from "drizzle-orm";
import { produtos } from "@padaria/db/schema/cadastro";
import { itensVendas } from "@padaria/db/schema/venda";
import { banco } from "../banco/conexao.js";

export type ProdutoMaisVendido = {
  produto: string;
  quantidade: number;
  valorTotal: number;
};

export async function listarProdutosMaisVendidos(empresaId: string): Promise<ProdutoMaisVendido[]> {
  const produto = sql<string>`coalesce(${produtos.descricao}, ${itensVendas.descricaoProduto})`;
  const quantidade = sql<number>`sum(${itensVendas.quantidade})::float`;
  const valorTotal = sql<number>`sum(${itensVendas.valorTotal})::float`;

  return banco
    .select({
      produto,
      quantidade,
      valorTotal
    })
    .from(itensVendas)
    .leftJoin(produtos, eq(produtos.id, itensVendas.produtoId))
    .where(eq(itensVendas.empresaId, empresaId))
    .groupBy(produto)
    .orderBy(desc(quantidade))
    .limit(20);
}
