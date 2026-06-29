import { podeAcessarEmpresa, type PerfilComEmpresa } from "./auth/empresa.js";

export type FiltroOrigemEntidade = { id?: string; empresaOrigemId?: string };
export type ModoImportacaoEntidade = "simples" | "completo";
export type ResultadoImportacaoEntidade = { tipo: string; inseridos: number };
export type EntidadeComEmpresa = { id: string; empresaId: string };

export function falharValidacao(mensagem: string): never {
  throw new Error(mensagem);
}

export function apenasDigitos(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos || null;
}

export function normalizarBusca(valor: string | undefined | null) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function statusErroValidacao(mensagem: string) {
  if (mensagem === "Empresa nao permitida") return 403;
  if (mensagem === "Registro nao encontrado") return 404;
  return 400;
}

export function permitidoNoEscopoEmpresa(linha: EntidadeComEmpresa, empresasPermitidasIds: string[] | null): boolean {
  return empresasPermitidasIds === null || empresasPermitidasIds.includes(linha.empresaId);
}

export function filtrarOrigemEntidade<T extends EntidadeComEmpresa>(
  linhas: T[],
  filtro: FiltroOrigemEntidade,
  empresasPermitidasIds: string[] | null
): T[] {
  return linhas.filter((linha) => {
    const origemCorreta = filtro.id ? linha.id === filtro.id : linha.empresaId === filtro.empresaOrigemId;
    return origemCorreta && permitidoNoEscopoEmpresa(linha, empresasPermitidasIds);
  });
}

export function jaImportado<T extends { importadoDe: string | null; idImportado: string | null }>(
  destinos: T[],
  importadoDe: string,
  idImportado: string
) {
  return destinos.some((destino) => destino.importadoDe === importadoDe && destino.idImportado === idImportado);
}

export function validarImportacaoEntreEmpresas(
  empresaOrigemId: string,
  empresaDestinoId: string,
  perfil?: PerfilComEmpresa
) {
  if (empresaOrigemId === empresaDestinoId) throw new Error("Escolha empresas diferentes");
  if (perfil && (!podeAcessarEmpresa(perfil, empresaOrigemId) || !podeAcessarEmpresa(perfil, empresaDestinoId))) {
    throw new Error("Empresa nao permitida");
  }
}

export function validarExportacaoParaEmpresa(empresaDestinoId: string, perfil?: PerfilComEmpresa) {
  if (perfil && !podeAcessarEmpresa(perfil, empresaDestinoId)) throw new Error("Empresa nao permitida");
}
