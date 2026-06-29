import { resolverPermissoesEfetivas, type PerfilUsuario } from "@padaria/shared";
import { obterPerfilPorUsuarioId } from "./perfil.repository.js";

export async function buscarPerfilUsuario(usuarioId: string): Promise<PerfilUsuario | null> {
  const perfil = await obterPerfilPorUsuarioId(usuarioId);
  if (!perfil) return null;
  const permissoesEfetivas = resolverPermissoesEfetivas([
    [perfil.regras_permissoes.setor],
    perfil.regras_permissoes.cargos,
    [perfil.regras_permissoes.usuario]
  ]);

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
    permissoes: permissoesEfetivas
  };
}
