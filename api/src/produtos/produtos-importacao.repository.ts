import { and, eq, inArray } from "drizzle-orm";
import {
  gruposMercadorias,
  produtos,
  produtosFiscal,
  produtosPromocoes,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { executarComTransacaoOpcional } from "../banco/conexao.js";
import type { ExecutorBanco } from "../banco/conexao.js";
import { sqlTravarCadastroDeProdutos } from "@padaria/db/sessao";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";
import { gerarCodigoExternoUnico, proximoCodigoInterno } from "./produtos-escrita.repository.js";

export interface ResultadoCopiaProdutos extends ResultadoImportacaoEntidade {
  /**
   * Quantos produtos de ORIGEM o filtro achou DENTRO do escopo autorizado. Zero significa
   * "nao existe ou nao e seu" — quem chama transforma isso em 404, nunca em sucesso com 0.
   */
  encontradosNaOrigem: number;
}

/**
 * Modo "completo": depois de copiar, religa grupo e unidade de cada produto importado aos
 * cadastros equivalentes DA EMPRESA DESTINO.
 *
 * A versao anterior carregava `select().from(produtos)` inteiro — todas as linhas de todas as
 * empresas — so para achar as origens. Agora busca so os ids realmente referenciados.
 */
async function completarProdutos(empresaDestinoId: string, db: ExecutorBanco) {
  const produtosDestino = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
  const idsOrigem = Array.from(
    new Set(produtosDestino.filter((p) => p.importadoDe && p.idImportado).map((p) => p.idImportado as string))
  );
  if (!idsOrigem.length) return;

  const produtosOrigem = await db.select().from(produtos).where(inArray(produtos.id, idsOrigem));
  const gruposDestino = await db
    .select()
    .from(gruposMercadorias)
    .where(eq(gruposMercadorias.empresaId, empresaDestinoId));
  const unidadesDestino = await db.select().from(unidadesMedida).where(eq(unidadesMedida.empresaId, empresaDestinoId));

  for (const destino of produtosDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = produtosOrigem.find((item) => item.id === destino.idImportado);
    if (!origem) continue;
    const grupoDestino = origem.grupoMercadoriaId
      ? gruposDestino.find(
          (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.grupoMercadoriaId
        )
      : null;
    const unidadeDestino = origem.unidadeMedidaId
      ? unidadesDestino.find(
          (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.unidadeMedidaId
        )
      : null;
    await db
      .update(produtos)
      .set({ grupoMercadoriaId: grupoDestino?.id ?? null, unidadeMedidaId: unidadeDestino?.id ?? null })
      .where(and(eq(produtos.id, destino.id), eq(produtos.empresaId, empresaDestinoId)));
  }
}

// Copia as satelites (fiscal 1:1, transformacao 1:1, promocoes 1:N) de um produto de origem para o destino.
async function copiarSatelitesProduto(db: ExecutorBanco, origemId: string, destinoId: string) {
  const [fiscal] = await db
    .select({
      ncm: produtosFiscal.ncm,
      cest: produtosFiscal.cest,
      categoriaFiscal: produtosFiscal.categoriaFiscal,
      cstPisCofins: produtosFiscal.cstPisCofins,
      aliquotaCheia: produtosFiscal.aliquotaCheia,
      aliquotaFcp: produtosFiscal.aliquotaFcp,
      aliquotaPis: produtosFiscal.aliquotaPis,
      aliquotaCofins: produtosFiscal.aliquotaCofins,
      reducaoIcms: produtosFiscal.reducaoIcms,
      icms: produtosFiscal.icms,
      tributacaoSimples: produtosFiscal.tributacaoSimples,
      aliquotaSimples: produtosFiscal.aliquotaSimples,
      icmsRe: produtosFiscal.icmsRe,
      baseFiscal: produtosFiscal.baseFiscal,
      codigoFiscal: produtosFiscal.codigoFiscal,
      produtoFiscal: produtosFiscal.produtoFiscal,
      cstReforma: produtosFiscal.cstReforma,
      cClassTrib: produtosFiscal.cClassTrib,
      aliquotaIbs: produtosFiscal.aliquotaIbs,
      aliquotaCbs: produtosFiscal.aliquotaCbs,
      origemFiscal: produtosFiscal.origemFiscal,
      aliquotaEcf: produtosFiscal.aliquotaEcf,
      aliquotaEcfId: produtosFiscal.aliquotaEcfId,
      estado: produtosFiscal.estado,
      motivo: produtosFiscal.motivo,
      conferidoEm: produtosFiscal.conferidoEm,
      pctNcm: produtosFiscal.pctNcm
    })
    .from(produtosFiscal)
    .where(eq(produtosFiscal.produtoId, origemId));
  if (fiscal) await db.insert(produtosFiscal).values({ produtoId: destinoId, ...fiscal });

  const [transformacao] = await db
    .select({
      precisao: produtosTransformacao.precisao,
      quantidade: produtosTransformacao.quantidade,
      unidade: produtosTransformacao.unidade,
      produtoReceituario: produtosTransformacao.produtoReceituario,
      refReceituario: produtosTransformacao.refReceituario
    })
    .from(produtosTransformacao)
    .where(eq(produtosTransformacao.produtoId, origemId));
  if (transformacao) await db.insert(produtosTransformacao).values({ produtoId: destinoId, ...transformacao });

  const promocoes = await db
    .select({
      tipo: produtosPromocoes.tipo,
      valor: produtosPromocoes.valor,
      descontoFracao: produtosPromocoes.descontoFracao,
      horaInicio: produtosPromocoes.horaInicio,
      horaFim: produtosPromocoes.horaFim,
      seg: produtosPromocoes.seg,
      ter: produtosPromocoes.ter,
      qua: produtosPromocoes.qua,
      qui: produtosPromocoes.qui,
      sex: produtosPromocoes.sex,
      sab: produtosPromocoes.sab,
      dom: produtosPromocoes.dom,
      validaAte: produtosPromocoes.validaAte
    })
    .from(produtosPromocoes)
    .where(eq(produtosPromocoes.produtoId, origemId));
  if (promocoes.length) {
    await db.insert(produtosPromocoes).values(promocoes.map((promo) => ({ produtoId: destinoId, ...promo })));
  }
}

export async function copiarProdutosRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoCopiaProdutos> {
  return executarComTransacaoOpcional(db, async (db) => {
    // A origem serializa o código entre lojas; manter o mesmo escopo também ao copiar produtos.
    await db.execute(sqlTravarCadastroDeProdutos());
    // A origem so pode ser lida DENTRO do escopo autorizado: `filtrarOrigemEntidade` cruza o filtro
    // com `empresasPermitidasIds`. Produto de empresa alheia simplesmente nao entra na lista.
    const candidatos = filtro.id
      ? await db.select().from(produtos).where(eq(produtos.id, filtro.id))
      : await db
          .select()
          .from(produtos)
          .where(eq(produtos.empresaId, filtro.empresaOrigemId ?? ""));
    const origem = filtrarOrigemEntidade(candidatos, filtro, empresasPermitidasIds);
    const destinos = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
    // Codigos internos ja usados na loja destino (para herdar sem colidir com o unique por empresa).
    const internosUsados = new Set<string>(destinos.map((d) => d.codigoInterno).filter((c): c is string => Boolean(c)));
    let inseridos = 0;
    for (const produto of origem) {
      if (jaImportado(destinos, produto.empresaId, produto.id)) continue;
      // Codigo externo novo (unico global); codigo interno herdado da origem, ou proximo se colidir/ausente.
      const codigo = await gerarCodigoExternoUnico(db);
      const codigoInterno =
        produto.codigoInterno && !internosUsados.has(produto.codigoInterno)
          ? produto.codigoInterno
          : await proximoCodigoInterno(db);
      internosUsados.add(codigoInterno);
      const [novo] = await db
        .insert(produtos)
        .values({
          empresaId: empresaDestinoId,
          codigo,
          codigoInterno,
          codigoBarras: produto.codigoBarras,
          descricao: produto.descricao,
          nomeCatalogo: produto.nomeCatalogo,
          pesavel: produto.pesavel,
          marca: produto.marca,
          compraAproximada: produto.compraAproximada,
          habilitarAjuda: produto.habilitarAjuda,
          // Grupo e unidades ficam NULOS de proposito: apontar para o cadastro da empresa de
          // origem seria referencia cross-tenant. O modo "completo" religa aos equivalentes do destino.
          grupoMercadoriaId: null,
          unidadeMedidaId: null,
          unidadeIndividualId: null,
          quantidadeIndividual: produto.quantidadeIndividual,
          embalagem: produto.embalagem,
          cDe: produto.cDe,
          quantidadeCaixa: produto.quantidadeCaixa,
          medidaCompra: produto.medidaCompra,
          custo: produto.custo,
          margem: produto.margem,
          precoVenda: produto.precoVenda,
          auto: produto.auto,
          status: produto.status,
          tipo: produto.tipo,
          // Importar o cadastro nunca importa o saldo fisico da empresa de origem.
          quantidadeEstoque: "0",
          estoqueMin: produto.estoqueMin,
          estoqueMax: produto.estoqueMax,
          areaEstoque: produto.areaEstoque,
          setorEstoque: produto.setorEstoque,
          curvaAbc: produto.curvaAbc,
          localVenda1: produto.localVenda1,
          localVenda2: produto.localVenda2,
          setorVenda1: produto.setorVenda1,
          setorVenda2: produto.setorVenda2,
          fotoUrl: produto.fotoUrl,
          importadoDe: produto.empresaId,
          idImportado: produto.id
        })
        .returning({ id: produtos.id });
      if (novo?.id) await copiarSatelitesProduto(db, produto.id, novo.id);
      inseridos += 1;
    }
    if (modo === "completo") await completarProdutos(empresaDestinoId, db);
    return { tipo: "produtos", inseridos, encontradosNaOrigem: origem.length };
  });
}
