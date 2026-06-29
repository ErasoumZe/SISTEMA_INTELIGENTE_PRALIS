import { fornecedorPayloadSchema, type ExportarFornecedorPayload as ExportarPayload, type ImportarFornecedoresPayload as ImportarPayload } from "@padaria/shared/fornecedores";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { apenasDigitos, validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { copiarFornecedoresRepository, listarFornecedoresRepository, salvarFornecedorRepository } from "./fornecedores.repository.js";

export async function listarFornecedores(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarFornecedoresRepository(), escopoDados);
}

export async function salvarFornecedor(id: string | null, body: unknown) {
  const dados = fornecedorPayloadSchema.parse(body);
  return salvarFornecedorRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    documento: apenasDigitos(dados.documento)
  });
}

export async function importarFornecedores(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarFornecedoresRepository({ empresaOrigemId: body.empresaOrigemId }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}

export async function exportarFornecedor(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarFornecedoresRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}
