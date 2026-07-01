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
    custo: dados.custo ?? null,
    margem: dados.margem ?? null,
    precoVenda: dados.precoVenda ?? null,
    auto: dados.auto,
    status: dados.status,
    tipo: dados.tipo,
    conversoes: dados.conversoes
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
