import type { DadosExternos } from "@padaria/shared/api";
import {
  calcularPrecoVenda,
  calcularPrecoVendaComPromocao,
  produtoPayloadSchema,
  type ExportarProdutoPayload as ExportarPayload,
  type ImportarProdutosPayload as ImportarPayload,
  type PromocaoRegra
} from "@padaria/shared/produtos";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { apenasDigitos, validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { copiarGruposRepository } from "../grupos/grupos.repository.js";
import { copiarUnidadesMedidaRepository } from "../unidades-medida/unidades-medida.repository.js";
import {
  buscarProdutoDuplicadoRepository,
  copiarProdutosRepository,
  listarProdutosRepository,
  salvarProdutoRepository
} from "./produtos.repository.js";

// Lancada quando ha produto duplicado (nome/codigo de barras) na loja e nao foi marcado "cadastrar mesmo assim".
export class ProdutoDuplicadoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ProdutoDuplicadoError";
  }
}

export async function listarProdutos(escopoDados: string[]) {
  if (!escopoDados.length) return [];
  const agora = new Date();
  const linhas = await listarProdutosRepository(escopoDados);
  // ADR-002/003: o preco vigente (com promocao ativa por dia/horario) e derivado na
  // LEITURA, pelo servidor — nunca persistido nem calculado pelo cliente.
  return linhas.map((produto) => ({
    ...produto,
    precoVendaAtual:
      produto.precoVenda == null
        ? null
        : calcularPrecoVendaComPromocao({
            precoVenda: Number(produto.precoVenda),
            agora,
            promocoes: produto.promocoes.map(
              (promo): PromocaoRegra => ({
                tipo: promo.tipo === "valor" ? "valor" : "desconto",
                valor: promo.valor == null ? null : Number(promo.valor),
                descontoFracao: promo.descontoFracao == null ? null : Number(promo.descontoFracao),
                horaInicio: promo.horaInicio,
                horaFim: promo.horaFim,
                dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom]
              })
            )
          })
  }));
}

export async function salvarProduto(id: string | null, body: DadosExternos, criadoPorUsuarioId?: string | null) {
  const dados = produtoPayloadSchema.parse(body);
  const descricao = dados.descricao.trim();
  const codigoBarras = apenasDigitos(dados.codigoBarras) ?? dados.codigoBarras?.trim() ?? null;
  // Governanca: bloqueia duplicado (nome/codigo de barras) na mesma loja, salvo "cadastrar mesmo assim".
  if (!dados.forcar) {
    const duplicado = await buscarProdutoDuplicadoRepository(dados.empresaId, descricao, codigoBarras, id ?? undefined);
    if (duplicado) {
      const porQuem = duplicado.criadoPorNome ? ` (cadastrado por ${duplicado.criadoPorNome})` : "";
      throw new ProdutoDuplicadoError(`Ja existe o produto "${duplicado.descricao}" nesta loja${porQuem}.`);
    }
  }
  // ADR-002: preco de venda e decisao do servidor. Com auto=true o valor enviado pelo
  // cliente e IGNORADO e recalculado pela regra oficial do shared; manual (auto=false)
  // aceita o valor digitado. Mesma formula que o front usa no preview.
  const precoVenda = dados.auto
    ? dados.custo == null
      ? null
      : calcularPrecoVenda({
          auto: true,
          custo: dados.custo,
          quantidadeCaixa: dados.quantidadeCaixa ?? 1,
          margem: dados.margem ?? null,
          margemGrupo: 0,
          precoManual: 0
        })
    : (dados.precoVenda ?? null);

  return salvarProdutoRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    codigo: dados.codigo?.trim() || null,
    criadoPor: criadoPorUsuarioId ?? null,
    codigoBarras,
    descricao,
    marca: dados.marca?.trim() || null,
    unidadeIndividualId: dados.unidadeIndividualId,
    quantidadeIndividual: dados.quantidadeIndividual,
    grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
    embalagem: dados.embalagem ?? null,
    cDe: dados.cDe ?? null,
    quantidadeCaixa: dados.quantidadeCaixa,
    medidaCompra: dados.medidaCompra ?? null,
    custo: dados.custo ?? null,
    margem: dados.margem ?? null,
    precoVenda,
    auto: dados.auto,
    status: dados.status,
    tipo: dados.tipo,
    quantidadeEstoque: dados.quantidadeEstoque ?? null,
    estoqueMin: dados.estoqueMin ?? null,
    estoqueMax: dados.estoqueMax ?? null,
    setorEstoque: dados.setorEstoque?.trim() || null,
    localVenda1: dados.localVenda1?.trim() || null,
    localVenda2: dados.localVenda2?.trim() || null,
    fotoUrl: dados.fotoUrl?.trim() || null,
    conversoes: dados.conversoes,
    fiscal: dados.fiscal
      ? {
          ncm: dados.fiscal.ncm?.trim() || null,
          cest: dados.fiscal.cest?.trim() || null,
          categoriaFiscal: dados.fiscal.categoriaFiscal?.trim() || null,
          cstPisCofins: dados.fiscal.cstPisCofins?.trim() || null,
          aliquotaCheia: dados.fiscal.aliquotaCheia ?? null,
          aliquotaFcp: dados.fiscal.aliquotaFcp ?? null,
          aliquotaPis: dados.fiscal.aliquotaPis ?? null,
          aliquotaCofins: dados.fiscal.aliquotaCofins ?? null,
          reducaoIcms: dados.fiscal.reducaoIcms ?? null,
          icms: dados.fiscal.icms ?? null
        }
      : null,
    transformacao: dados.transformacao
      ? {
          precisao: dados.transformacao.precisao ?? null,
          quantidade: dados.transformacao.quantidade ?? null,
          unidade: dados.transformacao.unidade ?? null,
          produtoReceituario: dados.transformacao.produtoReceituario?.trim() || null
        }
      : null,
    promocoes: dados.promocoes.map((promo) => ({
      tipo: promo.tipo,
      valor: promo.valor ?? null,
      descontoFracao: promo.descontoFracao ?? null,
      horaInicio: promo.horaInicio?.trim() || null,
      horaFim: promo.horaFim?.trim() || null,
      seg: promo.seg,
      ter: promo.ter,
      qua: promo.qua,
      qui: promo.qui,
      sex: promo.sex,
      sab: promo.sab,
      dom: promo.dom,
      validaAte: promo.validaAte?.trim() || null
    }))
  });
}

export async function importarProdutos(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  const permitidas = perfil ? empresasPermitidas(perfil) : [];
  return executarEmTransacao(async (tx) => {
    let inseridos = 0;
    if (body.modo === "completo") {
      inseridos += (
        await copiarGruposRepository(
          { empresaOrigemId: body.empresaOrigemId },
          body.empresaDestinoId,
          permitidas,
          body.modo,
          tx
        )
      ).inseridos;
      inseridos += (
        await copiarUnidadesMedidaRepository(
          { empresaOrigemId: body.empresaOrigemId },
          body.empresaDestinoId,
          permitidas,
          body.modo,
          tx
        )
      ).inseridos;
    }
    inseridos += (
      await copiarProdutosRepository(
        { empresaOrigemId: body.empresaOrigemId },
        body.empresaDestinoId,
        permitidas,
        body.modo,
        tx
      )
    ).inseridos;
    return { tipo: "produtos", modo: body.modo, inseridos };
  });
}

export async function exportarProduto(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarProdutosRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}
