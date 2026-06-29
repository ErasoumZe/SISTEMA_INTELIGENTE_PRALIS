import { areaPayloadSchema, type ExportarAreaSetorPayload as ExportarPayload, type ImportarAreasSetoresPayload as ImportarPayload } from "@padaria/shared/areas";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { listarSetoresRepository } from "../setores/setores.repository.js";
import { copiarAreasSetoresRepository, listarAreasRepository, salvarAreaRepository } from "./areas.repository.js";

export async function listarAreas(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarAreasRepository(), escopoDados);
}

export async function listarAreasSetores(escopoDados: string[] | null) {
  const [areas, setores] = await Promise.all([listarAreasRepository(), listarSetoresRepository()]);
  return {
    areas: filtrarPorEmpresas(areas, escopoDados),
    setores: filtrarPorEmpresas(setores, escopoDados)
  };
}

export async function salvarArea(id: string | null, body: unknown) {
  const dados = areaPayloadSchema.parse(body);
  return salvarAreaRepository({ ...(id ? { id } : {}), empresaId: dados.empresaId, nome: dados.nome.trim() });
}

export async function importarAreasSetores(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarAreasSetoresRepository({ empresaOrigemId: body.empresaOrigemId }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}

export async function exportarAreaSetor(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarAreasSetoresRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}
