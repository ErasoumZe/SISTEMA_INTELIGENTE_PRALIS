import type { PerfilUsuario } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { proibido } from "../erros.js";

// --- Empresa derivada -----------------------------------------------------------------------------
//
// A UNICA fonte de empresa deste modulo. Nada aqui le empresa do corpo, da query ou do path — os
// contratos em `shared/src/admissoes` nem sequer tem o campo.
//
// Tres recusas distintas, todas 403 e todas fail-closed:
//   1. sem perfil          -> nao ha ator;
//   2. perfil sem empresa  -> `perfis_usuarios.empresa_id` e NULLABLE (e vira null quando a empresa
//                             e removida, por `on delete set null`);
//   3. empresa fora do escopo -> `empresa_id` do perfil e gravado por um caminho independente de
//                             `usuarios_empresas` e PODE apontar para fora do escopo do usuario.
//                             Isto esta documentado no proprio codigo, em
//                             api/src/usuarios/usuarios.service.ts. Sem o cruzamento, o DP gravaria
//                             teste numa empresa que ele nao tem permissao de acessar.
//
// Nunca escolher empresa automaticamente: cair para `empresaIds[0]` seria adivinhar em qual empresa
// uma pessoa esta sendo avaliada.
export function empresaDoAtor(perfil?: PerfilUsuario): string {
  if (!perfil) throw proibido("Perfil de usuario nao configurado", "PROFILE_NOT_CONFIGURED");
  const empresaId = perfil.empresaId;
  if (!empresaId) {
    throw proibido(
      "Seu perfil nao tem empresa definida. Peca ao administrador para configurar antes de usar Periodos de teste.",
      "PROFILE_COMPANY_NOT_SET"
    );
  }
  if (!podeAcessarEmpresa(perfil, empresaId)) {
    throw proibido(
      "A empresa do seu perfil esta fora do seu escopo de acesso. Peca ao administrador para corrigir.",
      "PROFILE_COMPANY_OUT_OF_SCOPE"
    );
  }
  return empresaId;
}

export function atorDoPerfil(perfil?: PerfilUsuario): string {
  if (!perfil) throw proibido("Perfil de usuario nao configurado", "PROFILE_NOT_CONFIGURED");
  return perfil.usuarioId;
}
