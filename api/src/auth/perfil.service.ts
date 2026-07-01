import { permissoes as catalogoPermissoes, resolverPermissoesEfetivas, type PerfilUsuario } from "@padaria/shared";
import { obterPerfilPorUsuarioId } from "./perfil.repository.js";

export async function buscarPerfilUsuario(usuarioId: string): Promise<PerfilUsuario | null> {
  const perfil = await obterPerfilPorUsuarioId(usuarioId);
  if (!perfil) return null;
  // usuario_admin concede todas as permissoes (nao afeta o escopo de empresas, que segue por empresaIds).
  // O role "admin" NAO tem efeito especial (decisao de negocio: manter como esta).
  const permissoesEfetivas =
    perfil.role === "usuario_admin"
      ? [...catalogoPermissoes]
      : resolverPermissoesEfetivas([
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
