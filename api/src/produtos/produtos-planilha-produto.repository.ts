import { and, eq, isNotNull } from "drizzle-orm";
import {
  empresas,
  gruposMercadorias,
  produtos,
  produtosCatalogoBase,
  produtosFiscal,
  produtosPlanilhaSincronizacoes,
  produtosPromocoes,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";
import type { AlvoDaPlanilha } from "./produtos-planilha.repository.js";

/**
 * O que o escritor da planilha precisa ler do banco (R-222): o produto da BASE (`dados_oficiais`, chaves do
 * oficial) ou a copia da loja, com unidade, grupo, fiscal, transformacao, promocoes, a loja da empresa e
 * o id (do oficial) do produto da BASE — que e o ID da linha na planilha nova.
 */
export async function baseParaPlanilhaRepository(produtoBaseId: string) {
  const [linha] = await banco
    .select({
      idOrigem: produtosCatalogoBase.idOrigem,
      nome: produtosCatalogoBase.nome,
      codigoBarras: produtosCatalogoBase.codigoBarras,
      codigoInterno: produtosCatalogoBase.codigoInterno,
      status: produtosCatalogoBase.status,
      dadosOficiais: produtosCatalogoBase.dadosOficiais
    })
    .from(produtosCatalogoBase)
    .where(eq(produtosCatalogoBase.id, produtoBaseId))
    .limit(1);
  return linha ?? null;
}

export async function produtoDaLojaParaPlanilhaRepository(empresaId: string, produtoId: string) {
  const [linha] = await banco
    .select({
      id: produtos.id,
      nomeCatalogo: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      quantidadeIndividual: produtos.quantidadeIndividual,
      sigla: unidadesMedida.sigla,
      codigoBarras: produtos.codigoBarras,
      marca: produtos.marca,
      embalagem: produtos.embalagem,
      cDe: produtos.cDe,
      quantidadeCaixa: produtos.quantidadeCaixa,
      medidaCompra: produtos.medidaCompra,
      compraAproximada: produtos.compraAproximada,
      codigoInterno: produtos.codigoInterno,
      fotoUrl: produtos.fotoUrl,
      grupoNome: gruposMercadorias.nome,
      tipo: produtos.tipo,
      status: produtos.status,
      habilitarAjuda: produtos.habilitarAjuda,
      estoqueMin: produtos.estoqueMin,
      estoqueMax: produtos.estoqueMax,
      setorEstoque: produtos.setorEstoque,
      custo: produtos.custo,
      margem: produtos.margem,
      precoVenda: produtos.precoVenda,
      auto: produtos.auto,
      localVenda1: produtos.localVenda1,
      localVenda2: produtos.localVenda2,
      matriculaPrefixo: empresas.matriculaPrefixo,
      baseIdOrigem: produtosCatalogoBase.idOrigem,
      produtoBaseId: produtos.produtoBaseId
    })
    .from(produtos)
    .innerJoin(empresas, eq(empresas.id, produtos.empresaId))
    .leftJoin(unidadesMedida, eq(produtos.unidadeIndividualId, unidadesMedida.id))
    .leftJoin(gruposMercadorias, eq(produtos.grupoMercadoriaId, gruposMercadorias.id))
    .leftJoin(produtosCatalogoBase, eq(produtosCatalogoBase.id, produtos.produtoBaseId))
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)))
    .limit(1);
  if (!linha) return null;
  const [fiscal] = await banco.select().from(produtosFiscal).where(eq(produtosFiscal.produtoId, produtoId)).limit(1);
  const [transformacao] = await banco
    .select()
    .from(produtosTransformacao)
    .where(eq(produtosTransformacao.produtoId, produtoId))
    .limit(1);
  const promocoes = await banco
    .select()
    .from(produtosPromocoes)
    .where(eq(produtosPromocoes.produtoId, produtoId))
    .orderBy(produtosPromocoes.criadoEm);
  return { ...linha, fiscal: fiscal ?? null, transformacao: transformacao ?? null, promocoes };
}

/**
 * Segunda fonte para a linha do produto da BASE (oficial `linhasPorProduto`): a que a fila ja registrou.
 * A coluna ID da aba e a primeira fonte, mas pode estar vazia (carga que entrou lendo a planilha).
 */
export async function linhaConhecidaDaBaseRepository(produtoBaseId: string): Promise<number | null> {
  const [linha] = await banco
    .select({ linha: produtosPlanilhaSincronizacoes.linha })
    .from(produtosPlanilhaSincronizacoes)
    .where(
      and(
        eq(produtosPlanilhaSincronizacoes.produtoBaseId, produtoBaseId),
        isNotNull(produtosPlanilhaSincronizacoes.linha)
      )
    )
    .limit(1);
  return linha?.linha ?? null;
}

/** Registra a linha logo depois de a planilha aceitar a reserva (oficial `setRowNumber`). */
export async function registrarLinhaDaPlanilhaRepository(alvo: AlvoDaPlanilha, linha: number): Promise<void> {
  await banco
    .update(produtosPlanilhaSincronizacoes)
    // Sem mexer em `atualizado_em`: ele e a versao da pendencia (uma edicao no meio do reenvio a muda).
    .set({ linha })
    .where(
      "produtoBaseId" in alvo
        ? eq(produtosPlanilhaSincronizacoes.produtoBaseId, alvo.produtoBaseId)
        : eq(produtosPlanilhaSincronizacoes.produtoId, alvo.produtoId)
    );
}
