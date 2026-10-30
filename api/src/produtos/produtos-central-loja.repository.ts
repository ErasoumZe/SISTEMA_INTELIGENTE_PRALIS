import { and, asc, count, eq, inArray, isNull, max, ne } from "drizzle-orm";
import {
  produtos,
  produtosCatalogoBase,
  produtosCentralCargas,
  produtosCentralFontes
} from "@padaria/db/schema/cadastro";
import { integracoesVinculos, vendas, vendasProdutos } from "@padaria/db/schema/venda";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

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
      codigoInterno: produtos.codigoInterno,
      descricao: produtos.descricao
    })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId));
}

/** Quantas vendas validas cada produto teve e quando foi a ultima (para escolher quem fica num par). */
export async function vendasDosProdutosRepository(empresaId: string, ids: string[], tx: ExecutorBanco = banco) {
  if (!ids.length) return new Map<string, { vendas: number; ultima: Date | null }>();
  const linhas = await tx
    .select({ produtoId: vendasProdutos.produtoId, vendas: count(), ultima: max(vendasProdutos.criadoEm) })
    .from(vendasProdutos)
    .innerJoin(vendas, eq(vendas.id, vendasProdutos.vendaId))
    .where(
      and(
        eq(vendas.empresaId, empresaId),
        ne(vendas.status, "cancelado"),
        eq(vendasProdutos.cancelado, false),
        inArray(vendasProdutos.produtoId, ids)
      )
    )
    .groupBy(vendasProdutos.produtoId);
  return new Map(linhas.map((linha) => [linha.produtoId!, { vendas: linha.vendas, ultima: linha.ultima }]));
}

/**
 * Junta produtos antigos do PDV com o mesmo codigo: o que fica e ligado a BASE (so se ainda estiver solto) e
 * recebe o codigo interno; os vinculos de venda dos outros passam a apontar para ele; os outros sao
 * inativados. Nada e apagado: as vendas antigas continuam nos produtos de origem.
 */
export async function juntarProdutosAntigosRepository(
  tx: TransacaoBanco,
  dados: {
    empresaId: string;
    ficaId: string;
    produtoBaseId: string;
    codigoInterno: string | null;
    inativarIds: string[];
  }
) {
  const ligado = await tx
    .update(produtos)
    .set({ produtoBaseId: dados.produtoBaseId, codigoInterno: dados.codigoInterno, atualizadoEm: new Date() })
    .where(and(eq(produtos.empresaId, dados.empresaId), eq(produtos.id, dados.ficaId), isNull(produtos.produtoBaseId)))
    .returning({ id: produtos.id });
  if (!ligado.length || !dados.inativarIds.length) return { ligado: ligado.length > 0, vinculos: 0, inativados: 0 };
  const vinculos = await tx
    .update(integracoesVinculos)
    .set({ registroSistemaId: dados.ficaId, atualizadoEm: new Date() })
    .where(
      and(
        eq(integracoesVinculos.empresaId, dados.empresaId),
        eq(integracoesVinculos.tipoRegistro, "produto"),
        inArray(integracoesVinculos.registroSistemaId, dados.inativarIds)
      )
    )
    .returning({ id: integracoesVinculos.id });
  const inativados = await tx
    .update(produtos)
    .set({ status: "inativo", atualizadoEm: new Date() })
    .where(and(eq(produtos.empresaId, dados.empresaId), inArray(produtos.id, dados.inativarIds)))
    .returning({ id: produtos.id });
  return { ligado: true, vinculos: vinculos.length, inativados: inativados.length };
}
