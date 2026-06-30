import {
  contaPayloadSchema,
  type ExportarContaPayload as ExportarPayload,
  type ImportarContasPayload as ImportarPayload
} from "@padaria/shared/contas";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { copiarContasRepository, listarContasRepository, salvarContaRepository } from "./contas.repository.js";

export async function listarContas(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarContasRepository(), escopoDados);
}

export async function salvarConta(id: string | null, body: unknown) {
  const dados = contaPayloadSchema.parse(body);
  return salvarContaRepository({ ...(id ? { id } : {}), empresaId: dados.empresaId, nome: dados.nome.trim() });
}

export async function importarContas(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarContasRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarConta(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarContasRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}
