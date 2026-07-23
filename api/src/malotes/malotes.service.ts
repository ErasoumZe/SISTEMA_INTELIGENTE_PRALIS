import { centavosParaDecimalBanco, paraCentavos } from "@padaria/shared/dinheiro";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import {
  atualizarMaloteRepository,
  buscarMaloteEmpresaRepository,
  buscarMalotePorNumeroLacreRepository,
  copiarMalotesRepository,
  criarMaloteRepository,
  existeNumeroLacreRepository,
  listarMalotesRepository
} from "./malotes.repository.js";
import type { AtualizarMalotePayload, CriarMalotePayload } from "@padaria/shared/malotes";
import type {
  ExportarMalotePayload as ExportarPayload,
  ImportarMalotesPayload as ImportarPayload
} from "@padaria/shared/malotes";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";

function normalizarLacre(numero: string): string {
  return numero.trim();
}

async function validarLacreUnicoPorEmpresa(
  empresaId: string,
  numeroLacre: string,
  maloteIdIgnorado?: string
): Promise<void> {
  const existente = await existeNumeroLacreRepository(empresaId, numeroLacre, maloteIdIgnorado);
  if (existente) throw new Error(`Lacre ja cadastrado: ${existente.numeroLacre}`);
}

type ErroBanco = Error & { code?: string; constraint?: string };

export function mensagemErroMalote(error: Error): string {
  const erro = error as ErroBanco;
  if (erro.code === "23505" && erro.constraint?.includes("malotes_empresa_numero_lacre")) {
    return "Ja existe um malote com este lacre.";
  }
  if (erro.message?.includes("duplicate key")) {
    return "Registro duplicado.";
  }
  return error.message;
}

export async function listarMalotes(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarMalotesRepository(), escopoDados);
}

function empresaPermitida(empresaId: string, empresasPermitidasIds: string[]): boolean {
  return empresasPermitidasIds.includes(empresaId);
}

// Validacao de lacre no caixa (abertura/retorno): o lacre e a identidade de um malote — existe e
// esta disponivel? Busca o malote por numero de lacre nas empresas permitidas.
export async function validarLacre(numero: string, empresasPermitidasIds: string[]) {
  if (!empresasPermitidasIds.length) return { existe: false, disponivel: false, erro: "Lacre inexistente" };
  const malote = await buscarMalotePorNumeroLacreRepository(normalizarLacre(numero), empresasPermitidasIds);
  if (!malote) return { existe: false, disponivel: false, erro: "Lacre inexistente" };
  return {
    existe: true,
    disponivel: malote.status === "disponivel",
    erro: malote.status === "disponivel" ? null : "Lacre ja usado ou indisponivel",
    ...malote
  };
}

export async function criarMalote(payload: CriarMalotePayload, usuarioId?: string) {
  const numeroLacre = normalizarLacre(payload.numeroLacre);
  await validarLacreUnicoPorEmpresa(payload.empresaId, numeroLacre);

  const valor = centavosParaDecimalBanco(paraCentavos(payload.valor));
  const malote = await criarMaloteRepository({
    empresaId: payload.empresaId,
    numeroLacre,
    valor,
    ...(usuarioId ? { usuarioId } : {})
  });

  return { id: malote.id, ...payload, numeroLacre };
}

export async function atualizarMalote(
  maloteId: string,
  payload: AtualizarMalotePayload,
  empresasPermitidasIds: string[]
) {
  const malote = await buscarMaloteEmpresaRepository(maloteId);
  if (!malote || !empresaPermitida(malote.empresaId, empresasPermitidasIds)) throw new Error("Empresa nao permitida");

  const numeroLacre = normalizarLacre(payload.numeroLacre);
  await validarLacreUnicoPorEmpresa(malote.empresaId, numeroLacre, maloteId);

  const valor = centavosParaDecimalBanco(paraCentavos(payload.valor));
  await atualizarMaloteRepository({ maloteId, empresaId: malote.empresaId, numeroLacre, valor });

  return { id: maloteId, ...payload, numeroLacre };
}

export async function importarMalotes(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarMalotesRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarMalote(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarMalotesRepository({ id }, body.empresaDestinoId, perfil ? empresasPermitidas(perfil) : [], body.modo);
}
