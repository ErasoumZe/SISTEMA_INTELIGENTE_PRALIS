import {
  grupoPayloadSchema,
  type ExportarGrupoPayload as ExportarPayload,
  type ImportarGruposPayload as ImportarPayload
} from "@padaria/shared/grupos";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { copiarGruposRepository, listarGruposRepository, salvarGrupoRepository } from "./grupos.repository.js";

export async function listarGrupos(escopoDados: string[]) {
  const grupos = await listarGruposRepository();
  return {
    gruposDespesas: filtrarPorEmpresas(grupos.gruposDespesas, escopoDados),
    gruposMercadorias: filtrarPorEmpresas(grupos.gruposMercadorias, escopoDados),
    gruposRetiradas: filtrarPorEmpresas(grupos.gruposRetiradas, escopoDados),
    gruposVendas: filtrarPorEmpresas(grupos.gruposVendas, escopoDados)
  };
}

export async function salvarGrupo(tipo: string, id: string | null, body: unknown) {
  const dados = grupoPayloadSchema.parse(body);
  const tipoGrupo =
    tipo === "grupos-despesas"
      ? "despesa"
      : tipo === "grupos-mercadorias"
        ? "mercadoria"
        : tipo === "grupos-retiradas"
          ? "retirada"
          : tipo === "grupos-vendas"
            ? "vendas"
            : dados.tipoGrupo;
  return salvarGrupoRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    tipoGrupo,
    nome: dados.nome.trim(),
    grupoPaiId: dados.grupoPaiId ?? null
  });
}

export async function importarGrupos(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarGruposRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarGrupo(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarGruposRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}
