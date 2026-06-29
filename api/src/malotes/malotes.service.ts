import { filtrarPorEmpresas } from "../auth/empresa.js";
import {
  atualizarMaloteRepository,
  buscarLacrePorEmpresaRepository,
  buscarLacrePorNumeroRepository,
  buscarMaloteEmpresaRepository,
  copiarMalotesRepository,
  criarMaloteRepository,
  listarLacresMaloteRepository,
  listarMalotesRepository
} from "./malotes.repository.js";
import type { AtualizarMalotePayload, CriarMalotePayload } from "@padaria/shared/malotes";
import type { ExportarMalotePayload as ExportarPayload, ImportarMalotesPayload as ImportarPayload } from "@padaria/shared/malotes";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";

function normalizarLacre(lacre: string): string {
  return lacre.trim();
}

function chaveLacre(lacre: string): string {
  return normalizarLacre(lacre).toLocaleLowerCase("pt-BR");
}

function lacresNormalizados(lacres: string[]): string[] {
  return lacres.map(normalizarLacre).filter(Boolean);
}

function validarLacresUnicosNoPayload(lacres: string[]): void {
  if (!lacres.length) {
    throw new Error("Informe ao menos um lacre");
  }

  const lacresVistos = new Set<string>();
  for (const lacre of lacres) {
    const chave = chaveLacre(lacre);
    if (lacresVistos.has(chave)) {
      throw new Error(`Lacre duplicado: ${lacre}`);
    }
    lacresVistos.add(chave);
  }
}

async function validarLacresUnicosPorEmpresa(
  empresaId: string,
  lacres: string[],
  maloteIdIgnorado?: string
): Promise<void> {
  const lacreExistente = await buscarLacrePorEmpresaRepository(empresaId, lacres, maloteIdIgnorado);
  if (lacreExistente) {
    throw new Error(`Lacre ja cadastrado: ${lacreExistente.numero}`);
  }
}

type ErroBanco = Error & { code?: string; constraint?: string };

export function mensagemErroMalote(error: Error): string {
  const erro = error as ErroBanco;
  if (erro.code === "23505" && erro.constraint?.includes("malotes_empresa_id_codigo")) {
    return "Ja existe um malote com este codigo.";
  }
  if (erro.code === "23505" && erro.constraint?.includes("lacres_malotes")) {
    return "Ja existe um lacre com este numero.";
  }
  if (erro.message?.includes("duplicate key")) {
    return "Registro duplicado.";
  }
  return error.message;
}

export async function listarMalotes(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarMalotesRepository(), escopoDados);
}

function empresaPermitida(empresaId: string, empresasPermitidasIds: string[] | null): boolean {
  return empresasPermitidasIds === null || empresasPermitidasIds.includes(empresaId);
}

export async function listarLacresMalote(maloteId: string, empresasPermitidasIds: string[] | null) {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarLacresMaloteRepository(maloteId, empresasPermitidasIds);
}

export async function validarLacre(numero: string, empresasPermitidasIds: string[] | null) {
  if (empresasPermitidasIds?.length === 0) return { existe: false, disponivel: false, erro: "Lacre inexistente" };
  const lacre = await buscarLacrePorNumeroRepository(numero, empresasPermitidasIds);
  if (!lacre) return { existe: false, disponivel: false, erro: "Lacre inexistente" };
  return {
    existe: true,
    disponivel: lacre.status === "disponivel",
    erro: lacre.status === "disponivel" ? null : "Lacre ja usado ou indisponivel",
    ...lacre
  };
}

export async function criarMalote(payload: CriarMalotePayload, usuarioId?: string) {
  const lacres = lacresNormalizados(payload.lacres);
  validarLacresUnicosNoPayload(lacres);
  await validarLacresUnicosPorEmpresa(payload.empresaId, lacres);

  const codigo = payload.codigo.trim();
  const malote = await criarMaloteRepository({
    empresaId: payload.empresaId,
    codigo,
    lacres,
    ...(usuarioId ? { usuarioId } : {})
  });

  return { id: malote.id, ...payload, codigo, lacres };
}

export async function atualizarMalote(
  maloteId: string,
  payload: AtualizarMalotePayload,
  empresasPermitidasIds: string[] | null
) {
  const malote = await buscarMaloteEmpresaRepository(maloteId);
  if (!malote || !empresaPermitida(malote.empresaId, empresasPermitidasIds)) throw new Error("Empresa nao permitida");

  const lacres = lacresNormalizados(payload.lacres);
  validarLacresUnicosNoPayload(lacres);
  await validarLacresUnicosPorEmpresa(malote.empresaId, lacres, maloteId);

  const codigo = payload.codigo.trim();
  await atualizarMaloteRepository({ maloteId, empresaId: malote.empresaId, codigo, lacres });

  return { id: maloteId, ...payload, codigo, lacres };
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

