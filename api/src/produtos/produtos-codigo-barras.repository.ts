import { and, eq, inArray } from "drizzle-orm";
import { codigoBarrasSemZerosIniciais } from "@padaria/db/expressions";
import { produtos, produtosCatalogoBase } from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

/** Quantos achados no maximo: e aviso, nao listagem (EAN repetido de verdade e raro: kit, fracionado). */
const LIMITE = 5;

/**
 * Produtos da EMPRESA cujo EAN, sem zeros a esquerda, e IGUAL a uma das variantes (`candidatosDeCodigo`
 * do shared — o `barcodeCandidates` do oficial: sem zeros e etiqueta de balanca virando PLU).
 */
export async function produtosDaLojaPorCodigoDeBarrasRepository(empresaId: string, variantes: string[]) {
  if (!variantes.length) return [];
  return banco
    .select({
      id: produtos.id,
      nomeCatalogo: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      codigoInterno: produtos.codigoInterno
    })
    .from(produtos)
    .where(
      and(eq(produtos.empresaId, empresaId), inArray(codigoBarrasSemZerosIniciais(produtos.codigoBarras), variantes))
    )
    .limit(LIMITE);
}

/** O mesmo no catalogo BASE (global): e onde o produto novo nasce. */
export async function produtosDaBasePorCodigoDeBarrasRepository(variantes: string[]) {
  if (!variantes.length) return [];
  return banco
    .select({
      id: produtosCatalogoBase.id,
      nome: produtosCatalogoBase.nome,
      codigoInterno: produtosCatalogoBase.codigoInterno
    })
    .from(produtosCatalogoBase)
    .where(inArray(codigoBarrasSemZerosIniciais(produtosCatalogoBase.codigoBarras), variantes))
    .limit(LIMITE);
}
