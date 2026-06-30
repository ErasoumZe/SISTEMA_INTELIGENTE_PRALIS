import {
  unidadeMedidaPayloadSchema,
  type ExportarUnidadeMedidaPayload as ExportarPayload,
  type ImportarUnidadesMedidaPayload as ImportarPayload
} from "@padaria/shared/unidades-medida";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import {
  copiarUnidadesMedidaRepository,
  listarUnidadesMedidaRepository,
  salvarUnidadeRepository
} from "./unidades-medida.repository.js";

export async function listarUnidadesMedida(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarUnidadesMedidaRepository(), escopoDados);
}

export async function salvarUnidadeMedida(id: string | null, body: unknown) {
  const dados = unidadeMedidaPayloadSchema.parse(body);
  return salvarUnidadeRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    sigla: dados.sigla.trim()
  });
}

export async function importarUnidadesMedida(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarUnidadesMedidaRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarUnidadeMedida(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarUnidadesMedidaRepository(
    { id },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}
