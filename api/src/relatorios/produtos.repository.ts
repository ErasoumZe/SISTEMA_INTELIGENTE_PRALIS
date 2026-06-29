import { desc, eq, sql } from "drizzle-orm";
import { produtos } from "@padaria/db/schema/cadastro";
import { vendas, vendasItens } from "@padaria/db/schema/venda";
import { banco } from "../banco/conexao.js";

export type ProdutoMaisVendido = {
  produto: string;
  quantidade: number;
  valorTotal: number;
};

export async function listarProdutosMaisVendidos(empresaId: string): Promise<ProdutoMaisVendido[]> {
  const produto = sql<string>`coalesce(${produtos.descricao}, ${vendasItens.descricaoProduto})`;
  const quantidade = sql<number>`sum(${vendasItens.quantidade})::float`;
  const valorTotal = sql<number>`sum(${vendasItens.valorTotal})::float`;

  return banco
    .select({
      produto,
      quantidade,
      valorTotal
    })
    .from(vendasItens)
    .innerJoin(vendas, eq(vendas.id, vendasItens.vendaId))
    .leftJoin(produtos, eq(produtos.id, vendasItens.produtoId))
    .where(eq(vendas.empresaId, empresaId))
    .groupBy(produto)
    .orderBy(desc(quantidade))
    .limit(20);
}
