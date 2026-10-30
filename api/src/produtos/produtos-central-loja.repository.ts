import { and, asc, eq } from "drizzle-orm";
import {
  produtos,
  produtosCatalogoBase,
  produtosCentralCargas,
  produtosCentralFontes
} from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

/**
 * Leituras da fase B2 da virada (doc 56): as linhas de UMA loja do backup do paralelo que estao na carga da
 * Central, a BASE do ERP por ID de origem e os produtos que a loja ja tem. Nada aqui grava: a gravacao de
 * cada produto passa por `salvarProduto`, o mesmo caminho da copia BASE -> loja.
 */
export async function estadoDaCargaRepository(cargaId: string, tx: ExecutorBanco = banco) {
  const [carga] = await tx
    .select({ estado: produtosCentralCargas.estado })
    .from(produtosCentralCargas)
    .where(eq(produtosCentralCargas.id, cargaId))
    .limit(1);
  return carga?.estado ?? null;
}

export async function linhasDaLojaNaCargaRepository(cargaId: string, loja: string, tx: ExecutorBanco = banco) {
  return tx
    .select({
      chave: produtosCentralFontes.chaveLinhaFonte,
      codigoInterno: produtosCentralFontes.codigoInterno,
      codigoBarras: produtosCentralFontes.codigoBarras,
      nome: produtosCentralFontes.nome,
      dados: produtosCentralFontes.dadosOriginais
    })
    .from(produtosCentralFontes)
    .where(
      and(
        eq(produtosCentralFontes.cargaId, cargaId),
        eq(produtosCentralFontes.fonte, "pralis"),
        eq(produtosCentralFontes.lojaFonte, loja)
      )
    )
    .orderBy(asc(produtosCentralFontes.chaveLinhaFonte));
}

export async function basesPorOrigemRepository(tx: ExecutorBanco = banco) {
  const linhas = await tx
    .select({ id: produtosCatalogoBase.id, idOrigem: produtosCatalogoBase.idOrigem })
    .from(produtosCatalogoBase);
  return new Map(linhas.map((linha) => [linha.idOrigem, linha.id]));
}

export async function produtosDaLojaRepository(empresaId: string, tx: ExecutorBanco = banco) {
  return tx
    .select({
      id: produtos.id,
      produtoBaseId: produtos.produtoBaseId,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno
    })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId));
}
