import type { SocioGestorPayload } from "@padaria/shared/socios-gestores";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import {
  listarSociosGestoresRepository,
  salvarSocioGestorRepository
} from "./socios-gestores.repository.js";

export async function listarSociosGestores(escopoDados: string[], somenteAtivos: boolean) {
  const itens = filtrarPorEmpresas(await listarSociosGestoresRepository(), escopoDados);
  return somenteAtivos ? itens.filter((item) => item.ativo) : itens;
}

export function salvarSocioGestor(id: string | null, dados: SocioGestorPayload) {
  return salvarSocioGestorRepository({ ...(id ? { id } : {}), ...dados, nome: dados.nome.trim() });
}
