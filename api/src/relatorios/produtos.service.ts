import { listarProdutosMaisVendidos, type ProdutoMaisVendido } from "./produtos.repository.js";

export async function obterProdutosMaisVendidos(empresaId: string): Promise<ProdutoMaisVendido[]> {
  return listarProdutosMaisVendidos(empresaId);
}
