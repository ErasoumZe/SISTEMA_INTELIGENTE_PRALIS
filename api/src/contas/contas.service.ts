import type { DadosExternos } from "@padaria/shared/api";
import {
  contaPayloadSchema,
  type ExportarContaPayload as ExportarPayload,
  type ImportarContasPayload as ImportarPayload
} from "@padaria/shared/contas";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import {
  copiarContasRepository,
  listarContasComSaldoRepository,
  listarContasRepository,
  salvarContaRepository
} from "./contas.repository.js";

export async function listarContas(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarContasRepository(), escopoDados);
}

// Tela de Contas (D8): fundo + saldo ATUAL derivado + usuarios vinculados. Separada de listarContas
// porque aquela e a lista de OPCAO de formulario (id/nome) e e chamada em quase toda tela — nao vale
// pagar as cinco consultas de movimento so para preencher um <select>.
export async function listarContasComSaldo(escopoDados: string[]) {
  return listarContasComSaldoRepository(escopoDados);
}

export async function salvarConta(id: string | null, body: DadosExternos) {
  const dados = contaPayloadSchema.parse(body);
  return salvarContaRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    ...(dados.saldoInicial === undefined ? {} : { saldoInicial: dados.saldoInicial }),
    ...(dados.usuariosIds === undefined ? {} : { usuariosIds: dados.usuariosIds })
  });
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
