import { empresaPayloadSchema } from "@padaria/shared/empresas";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { apenasDigitos } from "../utils.js";
import { listarEmpresasRepository, salvarEmpresaRepository } from "./empresas.repository.js";

export async function listarEmpresas(perfil?: PerfilComEmpresa) {
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  const empresas = await listarEmpresasRepository();
  return empresas.filter((empresa) => empresasLiberadas.includes(empresa.id));
}

export async function salvarEmpresa(id: string | null, body: unknown) {
  const dados = empresaPayloadSchema.parse(body);
  return salvarEmpresaRepository({ ...(id ? { id } : {}), nome: dados.nome.trim(), cnpj: apenasDigitos(dados.cnpj) });
}
