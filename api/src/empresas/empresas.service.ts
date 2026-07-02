import type { DadosExternos } from "@padaria/shared/api";
import { empresaPayloadSchema } from "@padaria/shared/empresas";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { apenasDigitos } from "../utils.js";
import { listarEmpresasRepository, salvarEmpresaRepository } from "./empresas.repository.js";

export async function listarEmpresas(perfil?: PerfilComEmpresa) {
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  if (!empresasLiberadas.length) return [];
  return listarEmpresasRepository(empresasLiberadas);
}

export async function salvarEmpresa(id: string | null, body: DadosExternos) {
  const dados = empresaPayloadSchema.parse(body);
  return salvarEmpresaRepository({ ...(id ? { id } : {}), nome: dados.nome.trim(), cnpj: apenasDigitos(dados.cnpj) });
}
