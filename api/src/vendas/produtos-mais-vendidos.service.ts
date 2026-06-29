import { listarProdutosMaisVendidos, type ProdutoMaisVendido } from "./produtos-mais-vendidos.repository.js";

export async function obterProdutosMaisVendidos(empresaId: string): Promise<ProdutoMaisVendido[]> {
  return listarProdutosMaisVendidos(empresaId);
}
