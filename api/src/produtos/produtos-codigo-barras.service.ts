import { candidatosDeCodigo } from "@padaria/shared/produtos";
import {
  produtosDaBasePorCodigoDeBarrasRepository,
  produtosDaLojaPorCodigoDeBarrasRepository
} from "./produtos-codigo-barras.repository.js";

export interface ProdutoComMesmoCodigoDeBarras {
  id: string;
  nome: string;
  codigoInterno: string | null;
}

/**
 * Aviso de EAN repetido AO DIGITAR (F4, decisao D2; oficial `findByCodigoBarras` + aviso do
 * `ProductForm`). Igualdade com as variantes do oficial, nunca pedaco de codigo. So informa: salvar
 * continua decidindo (duplicidade na criacao pede "cadastrar mesmo assim"). Sem digito, nada.
 */
export async function produtosComMesmoCodigoDeBarras(entrada: {
  codigoBarras: string;
  catalogo: "loja" | "base";
  empresaId?: string | undefined;
}): Promise<ProdutoComMesmoCodigoDeBarras[]> {
  const variantes = candidatosDeCodigo(entrada.codigoBarras);
  if (entrada.catalogo === "base") return produtosDaBasePorCodigoDeBarrasRepository(variantes);
  if (!entrada.empresaId) return [];
  const achados = await produtosDaLojaPorCodigoDeBarrasRepository(entrada.empresaId, variantes);
  return achados.map((produto) => ({
    id: produto.id,
    nome: produto.nomeCatalogo ?? produto.descricao,
    codigoInterno: produto.codigoInterno
  }));
}
