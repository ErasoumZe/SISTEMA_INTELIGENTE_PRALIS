import { filtrarPorEmpresas } from "../auth/empresa.js";
import {
  atualizarMaloteRepository,
  buscarLacrePorEmpresaRepository,
  buscarLacrePorNumeroRepository,
  buscarMaloteEmpresaRepository,
  contarTransferenciasDoMaloteRepository,
  copiarMalotesRepository,
  criarMaloteRepository,
  excluirMaloteRepository,
  listarLacresMaloteRepository,
  listarMalotesRepository
} from "./malotes.repository.js";
import type { AtualizarMalotePayload, CriarMalotePayload } from "@padaria/shared/malotes";
import type {
  ExportarMalotePayload as ExportarPayload,
  ImportarMalotesPayload as ImportarPayload
} from "@padaria/shared/malotes";
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

// "So lacre": o malote e identificado pelo proprio LACRE. Codigo informado (compat) e respeitado, mas
// sem codigo o valor passa a ser o (primeiro) lacre — nada de codigo inventado tipo "Malote 0001".
// lacres ja vem validado como nao-vazio por validarLacresUnicosNoPayload, entao lacres[0] existe.
function resolverCodigoMalote(codigoInformado: string | undefined, lacres: string[]): string {
  const codigo = codigoInformado?.trim();
  return codigo || lacres[0] || "";
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

export async function listarMalotes(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarMalotesRepository(), escopoDados);
}

function empresaPermitida(empresaId: string, empresasPermitidasIds: string[]): boolean {
  return empresasPermitidasIds.includes(empresaId);
}

export async function listarLacresMalote(maloteId: string, empresasPermitidasIds: string[]) {
  if (!empresasPermitidasIds.length) return [];
  return listarLacresMaloteRepository(maloteId, empresasPermitidasIds);
}

export async function validarLacre(numero: string, empresasPermitidasIds: string[]) {
  if (!empresasPermitidasIds.length) return { existe: false, disponivel: false, erro: "Lacre inexistente" };
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

  const codigo = resolverCodigoMalote(payload.codigo, lacres);
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
  empresasPermitidasIds: string[]
) {
  const malote = await buscarMaloteEmpresaRepository(maloteId);
  if (!malote || !empresaPermitida(malote.empresaId, empresasPermitidasIds)) throw new Error("Empresa nao permitida");

  const lacres = lacresNormalizados(payload.lacres);
  validarLacresUnicosNoPayload(lacres);
  await validarLacresUnicosPorEmpresa(malote.empresaId, lacres, maloteId);

  const codigo = resolverCodigoMalote(payload.codigo, lacres);
  await atualizarMaloteRepository({ maloteId, empresaId: malote.empresaId, codigo, lacres });

  return { id: maloteId, ...payload, codigo, lacres };
}

export async function excluirMalote(maloteId: string, empresasPermitidasIds: string[]) {
  const malote = await buscarMaloteEmpresaRepository(maloteId);
  if (!malote || !empresaPermitida(malote.empresaId, empresasPermitidasIds)) throw new Error("Empresa nao permitida");
  const emUso = await contarTransferenciasDoMaloteRepository(maloteId);
  if (emUso > 0) throw new Error("Malote em uso em transferencias; nao pode ser excluido.");
  await excluirMaloteRepository(maloteId, malote.empresaId);
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
