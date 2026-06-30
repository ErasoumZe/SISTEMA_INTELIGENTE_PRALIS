import { and, desc, eq, sql } from "drizzle-orm";
import { produtos } from "@padaria/db/schema/cadastro";
import { vendas, vendasProdutos } from "@padaria/db/schema/venda";
import { banco } from "../banco/conexao.js";

export type ProdutoMaisVendido = {
  produto: string;
  quantidade: number;
  valorTotal: number;
};

export async function listarProdutosMaisVendidos(empresaId: string, caixaId?: string): Promise<ProdutoMaisVendido[]> {
  const produto = sql<string>`coalesce(${produtos.descricao}, ${vendasProdutos.descricaoProduto})`;
  const quantidade = sql<number>`sum(${vendasProdutos.quantidade})::float`;
  const valorTotal = sql<number>`sum(${vendasProdutos.valorTotal})::float`;
  const filtros = [eq(vendas.empresaId, empresaId)];
  if (caixaId) filtros.push(eq(vendas.caixaId, caixaId));

  return banco
    .select({
      produto,
      quantidade,
      valorTotal
    })
    .from(vendasProdutos)
    .innerJoin(vendas, eq(vendas.id, vendasProdutos.vendaId))
    .leftJoin(produtos, eq(produtos.id, vendasProdutos.produtoId))
    .where(and(...filtros))
    .groupBy(produto)
    .orderBy(desc(quantidade))
    .limit(20);
}
