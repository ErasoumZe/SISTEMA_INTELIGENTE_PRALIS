import type { Permissao, PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { buscarPerfilUsuario } from "../auth/perfil.service.js";
import { proibido } from "../erros.js";
import { usuariosDaEmpresaRepository } from "./conferencias-estoque.repository.js";

// Quem pode ser responsavel por uma tarefa de Compras: trabalha na empresa e tem a permissao do ato (doc 58 §1:
// executar o pedido = `pedidos_editar`; contar estoque = `conferencias_estoque_visualizar`).

export async function usuariosComPermissao(
  empresaId: string,
  permissao: Permissao
): Promise<Array<{ usuarioId: string; nome: string }>> {
  const usuarios = await usuariosDaEmpresaRepository(empresaId);
  const perfis = await Promise.all(usuarios.map((usuario) => buscarPerfilUsuario(usuario.usuarioId)));
  return usuarios.filter((_, indice) => perfis[indice]?.permissoes.includes(permissao));
}

export async function listarResponsaveis(empresaId: string, permissao: Permissao, perfil: PerfilUsuario) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  return usuariosComPermissao(empresaId, permissao);
}
