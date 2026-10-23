import type { EstoqueMovimentosQuery, EstoqueProdutosQuery } from "@padaria/shared/compras";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { proibido } from "../erros.js";
import { listarEstoqueMovimentosRepository, listarEstoqueProdutosRepository } from "./compras.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

export async function listarEstoqueProdutos(filtros: EstoqueProdutosQuery, perfil: PerfilUsuario) {
  validarEmpresa(perfil, filtros.empresaId);
  return listarEstoqueProdutosRepository(filtros);
}

export async function listarEstoqueMovimentos(filtros: EstoqueMovimentosQuery, perfil: PerfilUsuario) {
  validarEmpresa(perfil, filtros.empresaId);
  return listarEstoqueMovimentosRepository(filtros);
}
