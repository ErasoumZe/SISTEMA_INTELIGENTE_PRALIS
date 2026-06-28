import { permissoes, type PerfilUsuario, type Permissao } from "@padaria/shared";
import { obterPerfilPorUsuarioId } from "./perfil.repository.js";

export async function buscarPerfilUsuario(usuarioId: string): Promise<PerfilUsuario | null> {
  const perfil = await obterPerfilPorUsuarioId(usuarioId);
  if (!perfil) return null;
  const permissoesEfetivas =
    perfil.role === "usuario_admin" ? [...new Set([...perfil.permissoes, ...permissoes])] : perfil.permissoes;

  return {
    usuarioId: perfil.usuario_id,
    empresaId: perfil.empresa_id,
    empresaIds: perfil.empresa_ids,
    colaboradorId: perfil.colaborador_id,
    setorId: perfil.setor_id,
    cargoIds: perfil.cargo_ids,
    cargos: perfil.cargos,
    role: perfil.role,
    nome: perfil.nome,
    email: perfil.email,
    permissoes: permissoesEfetivas as Permissao[]
  };
}
