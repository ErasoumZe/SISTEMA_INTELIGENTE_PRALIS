import {
  produtoPayloadSchema,
  type ExportarProdutoPayload as ExportarPayload,
  type ImportarProdutosPayload as ImportarPayload
} from "@padaria/shared/produtos";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { apenasDigitos, validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { copiarGruposRepository } from "../grupos/grupos.repository.js";
import { copiarUnidadesMedidaRepository } from "../unidades-medida/unidades-medida.repository.js";
import { copiarProdutosRepository, listarProdutosRepository, salvarProdutoRepository } from "./produtos.repository.js";

export async function listarProdutos(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarProdutosRepository(), escopoDados);
}

export async function salvarProduto(id: string | null, body: unknown) {
  const dados = produtoPayloadSchema.parse(body);
  return salvarProdutoRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    codigo: dados.codigo?.trim() || null,
    codigoBarras: apenasDigitos(dados.codigoBarras) ?? dados.codigoBarras?.trim() ?? null,
    descricao: dados.descricao.trim(),
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
    precoVenda: dados.precoVenda ?? null,
    auto: dados.auto,
    status: dados.status,
    tipo: dados.tipo,
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
