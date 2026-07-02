import { and, asc, eq, ilike, max, ne, or } from "drizzle-orm";
import {
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  produtosConversoes,
  produtosFiscal,
  produtosPromocoes,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco, executarComTransacaoOpcional } from "../banco/conexao.js";
import type { ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

// Codigo externo: PR-XXXX-XXXX (alfabeto sem caracteres ambiguos I/O/0/1). Unico global — tenta ate achar livre.
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function blocoCodigo(tamanho: number): string {
  let saida = "";
  for (let i = 0; i < tamanho; i += 1) saida += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)];
  return saida;
}
async function gerarCodigoExternoUnico(tx: ExecutorBanco): Promise<string> {
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const candidato = `PR-${blocoCodigo(4)}-${blocoCodigo(4)}`;
    const existente = await tx
      .select({ id: produtos.id })
      .from(produtos)
      .where(eq(produtos.codigo, candidato))
      .limit(1);
    if (!existente.length) return candidato;
  }
  return `PR-${blocoCodigo(4)}-${blocoCodigo(4)}`;
}
// Codigo interno: sequencial de 5 digitos por empresa (00001, 00002, ...). Zero-padded => max lexicografico = numerico.
export async function proximoCodigoInterno(tx: ExecutorBanco, empresaIdAlvo: string): Promise<string> {
  const [linha] = await tx
    .select({ maximo: max(produtos.codigoInterno) })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaIdAlvo));
  const atual = Number(linha?.maximo ?? 0) || 0;
  return String(atual + 1).padStart(5, "0");
}

// Governanca: acha um produto ja cadastrado na mesma loja por nome (case-insensitive) OU codigo de barras.
// Retorna a descricao do conflito e o nome de quem cadastrou (para o aviso de "cadastrar mesmo assim").
export async function buscarProdutoDuplicadoRepository(
  empresaIdAlvo: string,
  descricao: string,
  codigoBarras: string | null,
  ignorarId?: string
): Promise<{ descricao: string; criadoPorNome: string | null } | null> {
  const nomeOuBarras = codigoBarras
    ? or(ilike(produtos.descricao, descricao), eq(produtos.codigoBarras, codigoBarras))
    : ilike(produtos.descricao, descricao);
  const [linha] = await banco
    .select({ descricao: produtos.descricao, criadoPorNome: perfisUsuarios.nome })
    .from(produtos)
    .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
    .where(and(eq(produtos.empresaId, empresaIdAlvo), nomeOuBarras, ignorarId ? ne(produtos.id, ignorarId) : undefined))
    .limit(1);
  return linha ?? null;
}

export async function listarProdutosRepository() {
  const linhas = await banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      unidadeMedidaId: produtos.unidadeMedidaId,
      unidadeIndividualId: produtos.unidadeIndividualId,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno,
      codigoBarras: produtos.codigoBarras,
      descricao: produtos.descricao,
      marca: produtos.marca,
      quantidadeIndividual: produtos.quantidadeIndividual,
      embalagem: produtos.embalagem,
      cDe: produtos.cDe,
      quantidadeCaixa: produtos.quantidadeCaixa,
      medidaCompra: produtos.medidaCompra,
      custo: produtos.custo,
      margem: produtos.margem,
      precoVenda: produtos.precoVenda,
      auto: produtos.auto,
      status: produtos.status,
      tipo: produtos.tipo
    })
    .from(produtos)
    .orderBy(asc(produtos.descricao));
  const conversoes = await banco
    .select({
      id: produtosConversoes.id,
      produtoId: produtosConversoes.produtoId,
      unidadeMedidaId: produtosConversoes.unidadeMedidaId,
      quantidade: produtosConversoes.quantidade,
      unidadesIndividuais: produtosConversoes.unidadesIndividuais
    })
    .from(produtosConversoes);
  const fiscais = await banco
    .select({
      produtoId: produtosFiscal.produtoId,
      ncm: produtosFiscal.ncm,
      cest: produtosFiscal.cest,
      categoriaFiscal: produtosFiscal.categoriaFiscal,
      cstPisCofins: produtosFiscal.cstPisCofins,
      aliquotaCheia: produtosFiscal.aliquotaCheia,
      aliquotaFcp: produtosFiscal.aliquotaFcp,
      aliquotaPis: produtosFiscal.aliquotaPis,
      aliquotaCofins: produtosFiscal.aliquotaCofins,
      reducaoIcms: produtosFiscal.reducaoIcms,
      icms: produtosFiscal.icms
    })
    .from(produtosFiscal);
  const transformacoes = await banco
    .select({
      produtoId: produtosTransformacao.produtoId,
      precisao: produtosTransformacao.precisao,
      quantidade: produtosTransformacao.quantidade,
      unidade: produtosTransformacao.unidade,
      produtoReceituario: produtosTransformacao.produtoReceituario
    })
    .from(produtosTransformacao);
  const promocoes = await banco
    .select({
      id: produtosPromocoes.id,
      produtoId: produtosPromocoes.produtoId,
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
    .from(produtosPromocoes);
  return linhas.map((produto) => ({
    ...produto,
    conversoes: conversoes.filter((conversao) => conversao.produtoId === produto.id),
    fiscal: fiscais.find((item) => item.produtoId === produto.id) ?? null,
    transformacao: transformacoes.find((item) => item.produtoId === produto.id) ?? null,
    promocoes: promocoes.filter((item) => item.produtoId === produto.id)
  }));
}

export async function salvarProdutoRepository(input: {
  id?: string;
  empresaId: string;
  codigo: string | null;
  codigoInterno?: string | null;
  criadoPor?: string | null;
  codigoBarras: string | null;
  descricao: string;
  marca: string | null;
  unidadeIndividualId: string;
  quantidadeIndividual: number;
  grupoMercadoriaId: string | null;
  embalagem: string | null;
  cDe: string | null;
  quantidadeCaixa: number;
  medidaCompra: string | null;
  custo: number | null;
  margem: number | null;
  precoVenda: number | null;
  auto: boolean;
  status: "ativo" | "inativo";
  tipo: "revenda" | "transformacao";
  conversoes: Array<{ unidadeMedidaId: string; quantidade: number; unidadesIndividuais: number }>;
  fiscal: {
    ncm: string | null;
    cest: string | null;
    categoriaFiscal: string | null;
    cstPisCofins: string | null;
    aliquotaCheia: number | null;
    aliquotaFcp: number | null;
    aliquotaPis: number | null;
    aliquotaCofins: number | null;
    reducaoIcms: number | null;
    icms: number | null;
  } | null;
  transformacao: {
    precisao: string | null;
    quantidade: number | null;
    unidade: string | null;
    produtoReceituario: string | null;
  } | null;
  promocoes: Array<{
    tipo: "valor" | "desconto";
    valor: number | null;
    descontoFracao: number | null;
    horaInicio: string | null;
    horaFim: string | null;
    seg: boolean;
    ter: boolean;
    qua: boolean;
    qui: boolean;
    sex: boolean;
    sab: boolean;
    dom: boolean;
    validaAte: string | null;
  }>;
}) {
  return banco.transaction(async (tx) => {
    const valores = {
      empresaId: input.empresaId,
      codigo: input.codigo,
      codigoBarras: input.codigoBarras,
      descricao: input.descricao,
      marca: input.marca,
      unidadeMedidaId: input.unidadeIndividualId,
      unidadeIndividualId: input.unidadeIndividualId,
      quantidadeIndividual: String(input.quantidadeIndividual),
      grupoMercadoriaId: input.grupoMercadoriaId,
      embalagem: input.embalagem,
      cDe: input.cDe,
      quantidadeCaixa: input.quantidadeCaixa,
      medidaCompra: input.medidaCompra,
      custo: input.custo != null ? String(input.custo) : null,
      margem: input.margem != null ? String(input.margem) : null,
      precoVenda: input.precoVenda != null ? String(input.precoVenda) : null,
      auto: input.auto,
      status: input.status,
      tipo: input.tipo
    };
    let produtoId: string;
    if (input.id) {
      // Edicao: nao regera codigo interno (atribuido uma vez); codigo externo vem do form (preservado).
      await tx
        .update(produtos)
        .set(valores)
        .where(and(eq(produtos.id, input.id), eq(produtos.empresaId, input.empresaId)));
      produtoId = input.id;
    } else {
      // Criacao: codigo externo (PR-XXXX-XXXX) se nao veio manual; codigo interno sequencial (ou herdado na importacao).
      const codigo = valores.codigo || (await gerarCodigoExternoUnico(tx));
      const codigoInterno = input.codigoInterno ?? (await proximoCodigoInterno(tx, input.empresaId));
      const inserido = await tx
        .insert(produtos)
        .values({ ...valores, codigo, codigoInterno, criadoPor: input.criadoPor ?? null })
        .returning({ id: produtos.id });
      produtoId = inserido[0]?.id ?? "";
    }
    if (!produtoId) throw new Error("Produto nao criado");
    await tx.delete(produtosConversoes).where(eq(produtosConversoes.produtoId, produtoId));
    if (input.conversoes.length) {
      await tx.insert(produtosConversoes).values(
        input.conversoes.map((conversao) => ({
          produtoId,
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: String(conversao.quantidade),
          unidadesIndividuais: String(conversao.unidadesIndividuais)
        }))
      );
    }
    // Fiscal (1:1): regrava por completo — apaga e reinsere se houver dados.
    await tx.delete(produtosFiscal).where(eq(produtosFiscal.produtoId, produtoId));
    if (input.fiscal) {
      await tx.insert(produtosFiscal).values({
        produtoId,
        ncm: input.fiscal.ncm,
        cest: input.fiscal.cest,
        categoriaFiscal: input.fiscal.categoriaFiscal,
        cstPisCofins: input.fiscal.cstPisCofins,
        aliquotaCheia: input.fiscal.aliquotaCheia != null ? String(input.fiscal.aliquotaCheia) : null,
        aliquotaFcp: input.fiscal.aliquotaFcp != null ? String(input.fiscal.aliquotaFcp) : null,
        aliquotaPis: input.fiscal.aliquotaPis != null ? String(input.fiscal.aliquotaPis) : null,
        aliquotaCofins: input.fiscal.aliquotaCofins != null ? String(input.fiscal.aliquotaCofins) : null,
        reducaoIcms: input.fiscal.reducaoIcms != null ? String(input.fiscal.reducaoIcms) : null,
        icms: input.fiscal.icms != null ? String(input.fiscal.icms) : null
      });
    }
    // Transformacao (1:1): regrava por completo.
    await tx.delete(produtosTransformacao).where(eq(produtosTransformacao.produtoId, produtoId));
    if (input.transformacao) {
      await tx.insert(produtosTransformacao).values({
        produtoId,
        precisao: input.transformacao.precisao,
        quantidade: input.transformacao.quantidade != null ? String(input.transformacao.quantidade) : null,
        unidade: input.transformacao.unidade,
        produtoReceituario: input.transformacao.produtoReceituario
      });
    }
    // Promocoes (1:N): apaga e reinsere.
    await tx.delete(produtosPromocoes).where(eq(produtosPromocoes.produtoId, produtoId));
    if (input.promocoes.length) {
      await tx.insert(produtosPromocoes).values(
        input.promocoes.map((promo) => ({
          produtoId,
          tipo: promo.tipo,
          valor: promo.valor != null ? String(promo.valor) : null,
          descontoFracao: promo.descontoFracao != null ? String(promo.descontoFracao) : null,
          horaInicio: promo.horaInicio,
          horaFim: promo.horaFim,
          seg: promo.seg,
          ter: promo.ter,
          qua: promo.qua,
          qui: promo.qui,
          sex: promo.sex,
          sab: promo.sab,
          dom: promo.dom,
          validaAte: promo.validaAte
        }))
      );
    }
    return { id: produtoId, empresaId: input.empresaId };
  });
}

async function completarProdutos(empresaDestinoId: string, db: ExecutorBanco) {
  const produtosDestino = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
  const produtosOrigem = await db.select().from(produtos);
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
      .where(eq(produtos.id, destino.id));
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
      icms: produtosFiscal.icms
    })
    .from(produtosFiscal)
    .where(eq(produtosFiscal.produtoId, origemId));
  if (fiscal) await db.insert(produtosFiscal).values({ produtoId: destinoId, ...fiscal });

  const [transformacao] = await db
    .select({
      precisao: produtosTransformacao.precisao,
      quantidade: produtosTransformacao.quantidade,
      unidade: produtosTransformacao.unidade,
      produtoReceituario: produtosTransformacao.produtoReceituario
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
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(produtos), filtro, empresasPermitidasIds);
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
          : await proximoCodigoInterno(db, empresaDestinoId);
      internosUsados.add(codigoInterno);
      const [novo] = await db
        .insert(produtos)
        .values({
          empresaId: empresaDestinoId,
          codigo,
          codigoInterno,
          codigoBarras: produto.codigoBarras,
          descricao: produto.descricao,
          marca: produto.marca,
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
          quantidadeEstoque: produto.quantidadeEstoque,
          estoqueMin: produto.estoqueMin,
          estoqueMax: produto.estoqueMax,
          setorEstoque: produto.setorEstoque,
          localVenda1: produto.localVenda1,
          localVenda2: produto.localVenda2,
          fotoUrl: produto.fotoUrl,
          importadoDe: produto.empresaId,
          idImportado: produto.id
        })
        .returning({ id: produtos.id });
      if (novo?.id) await copiarSatelitesProduto(db, produto.id, novo.id);
      inseridos += 1;
    }
    if (modo === "completo") await completarProdutos(empresaDestinoId, db);
    return { tipo: "produtos", inseridos };
  });
}
