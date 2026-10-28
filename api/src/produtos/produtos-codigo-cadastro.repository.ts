import { and, eq, isNull } from "drizzle-orm";
import {
  empresas,
  produtos,
  produtosCatalogoBase,
  produtosHistoricoCodigoInterno,
  siaProdutoDepara
} from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

/**
 * Dados da reconciliacao do codigo de cadastro (porte de `CodigoCadastroRepository` do app oficial, R-222).
 * No ERP a BASE e `produtos_catalogo_base`; os "orfaos" sao produtos de loja sem `produto_base_id`.
 */
export async function baseParaReconciliarRepository() {
  return banco
    .select({
      id: produtosCatalogoBase.id,
      nome: produtosCatalogoBase.nome,
      codigoBarras: produtosCatalogoBase.codigoBarras,
      codigoInterno: produtosCatalogoBase.codigoInterno
    })
    .from(produtosCatalogoBase)
    .orderBy(produtosCatalogoBase.codigoInterno);
}

/** Produto de loja que nunca veio da BASE (oficial: `base_product_id IS NULL` fora da BASE). */
export async function orfaosParaReconciliarRepository() {
  return banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      matriculaPrefixo: empresas.matriculaPrefixo,
      nomeCatalogo: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      codigoBarras: produtos.codigoBarras,
      codigoInterno: produtos.codigoInterno
    })
    .from(produtos)
    .innerJoin(empresas, eq(empresas.id, produtos.empresaId))
    .where(isNull(produtos.produtoBaseId))
    .orderBy(empresas.matriculaPrefixo, produtos.codigo);
}

/** O de-para do SIA de TODAS as lojas — a regua da numeracao. */
export async function paresSiaRepository() {
  return banco
    .select({
      matriculaPrefixo: empresas.matriculaPrefixo,
      coditem: siaProdutoDepara.coditem,
      chaveBarras: siaProdutoDepara.chaveBarras,
      descricao: siaProdutoDepara.descricao
    })
    .from(siaProdutoDepara)
    .innerJoin(empresas, eq(empresas.id, siaProdutoDepara.empresaId));
}

/** Todos os codigos internos gravados (BASE e lojas): o maior e calculado por quem chama. */
export async function codigosGravadosRepository(tx: ExecutorBanco = banco): Promise<Array<string | null>> {
  const [daBase, dasLojas] = [
    await tx.select({ codigo: produtosCatalogoBase.codigoInterno }).from(produtosCatalogoBase),
    await tx.select({ codigo: produtos.codigoInterno }).from(produtos)
  ];
  return [...daBase, ...dasLojas].map((linha) => linha.codigo);
}

export interface AutorDaTroca {
  alteradoPor: string | null;
  alteradoPorNome: string | null;
}

/** Troca o codigo da BASE com guarda otimista; devolve false se ele mudou desde a tela. */
export async function trocarCodigoDaBaseRepository(
  tx: TransacaoBanco,
  id: string,
  esperado: string | null,
  codigoNovo: string
): Promise<boolean> {
  const [atual] = await tx
    .select({ codigo: produtosCatalogoBase.codigoInterno, dados: produtosCatalogoBase.dadosOficiais })
    .from(produtosCatalogoBase)
    .where(eq(produtosCatalogoBase.id, id))
    .for("update");
  if (!atual || (atual.codigo ?? null) !== esperado) return false;
  await tx
    .update(produtosCatalogoBase)
    // `dados_oficiais` guarda o codigo tambem (formato do oficial): os dois andam juntos.
    .set({
      codigoInterno: codigoNovo,
      dadosOficiais: { ...atual.dados, codigo_interno: codigoNovo },
      atualizadoEm: new Date()
    })
    .where(eq(produtosCatalogoBase.id, id));
  return true;
}

/** Troca o codigo de um produto de loja com guarda otimista. */
export async function trocarCodigoDoProdutoRepository(
  tx: TransacaoBanco,
  id: string,
  esperado: string | null,
  codigoNovo: string
): Promise<boolean> {
  const atingidas = await tx
    .update(produtos)
    .set({ codigoInterno: codigoNovo, atualizadoEm: new Date() })
    .where(
      and(eq(produtos.id, id), esperado == null ? isNull(produtos.codigoInterno) : eq(produtos.codigoInterno, esperado))
    )
    .returning({ id: produtos.id });
  return atingidas.length > 0;
}

/** As copias da BASE nas lojas, lidas ANTES de sobrescrever (o codigo da loja so existe agora). */
export async function copiasDaBaseParaCodigoRepository(tx: TransacaoBanco, produtoBaseId: string) {
  return tx
    .select({ id: produtos.id, empresaId: produtos.empresaId, codigoInterno: produtos.codigoInterno })
    .from(produtos)
    .where(eq(produtos.produtoBaseId, produtoBaseId))
    .for("update");
}

/** Outro produto da MESMA empresa ja usa o codigo? (o ERP tem unico por empresa; o oficial nao tinha). */
export async function donoDoCodigoNaEmpresaRepository(tx: TransacaoBanco, empresaId: string, codigo: string) {
  const [dono] = await tx
    .select({ id: produtos.id, descricao: produtos.descricao })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.codigoInterno, codigo)))
    .limit(1);
  return dono ?? null;
}

export async function registrarHistoricoDeCodigoRepository(
  tx: TransacaoBanco,
  alvo: { produtoBaseId: string } | { empresaId: string; produtoId: string },
  troca: { codigoAnterior: string | null; codigoNovo: string; fonte: string } & AutorDaTroca
) {
  await tx.insert(produtosHistoricoCodigoInterno).values({ ...alvo, ...troca });
}
