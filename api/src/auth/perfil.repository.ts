import { and, eq, inArray } from "drizzle-orm";
import {
  cargos,
  colaboradores,
  colaboradoresCargos,
  permissoesCargos,
  permissoesSetores,
  permissoesUsuarios,
  perfisUsuarios,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import type { PerfilUsuario, RegrasPermissoes } from "@padaria/shared";
import { banco } from "../banco/conexao.js";

export interface PerfilLinha {
  usuario_id: string;
  empresa_id: string | null;
  colaborador_id: string;
  setor_id: string | null;
  cargo_ids: string[];
  cargos: Array<{ id: string; nome: string }>;
  role: PerfilUsuario["role"];
  nome: string;
  email: string;
  empresa_ids: string[];
  regras_permissoes: {
    setor: RegrasPermissoes | null;
    cargos: RegrasPermissoes[];
    usuario: RegrasPermissoes | null;
  };
}

export async function obterPerfilPorUsuarioId(usuarioId: string): Promise<PerfilLinha | null> {
  const [perfil] = await banco
    .select({
      usuarioId: perfisUsuarios.usuarioId,
      empresaId: perfisUsuarios.empresaId,
      nome: perfisUsuarios.nome,
      email: perfisUsuarios.email,
      role: perfisUsuarios.role
    })
    .from(perfisUsuarios)
    .where(eq(perfisUsuarios.usuarioId, usuarioId))
    .limit(1);

  if (!perfil) return null;

  const [colaborador] = await banco
    .select({
      id: colaboradores.id,
      setorId: colaboradores.setorId
    })
    .from(colaboradores)
    .where(eq(colaboradores.usuarioId, usuarioId))
    .limit(1);

  if (!colaborador) return null;

  const [empresas, permissoesDoUsuario, cargosAtivos] = await Promise.all([
    banco
      .select({ empresaId: usuariosEmpresas.empresaId })
      .from(usuariosEmpresas)
      .where(eq(usuariosEmpresas.usuarioId, usuarioId)),
    banco
      .select({ regras: permissoesUsuarios.regras })
      .from(permissoesUsuarios)
      .where(eq(permissoesUsuarios.usuarioId, usuarioId)),
    banco
      .select({ cargoId: colaboradoresCargos.cargoId, cargoNome: cargos.nome })
      .from(colaboradoresCargos)
      .innerJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
      .where(and(eq(colaboradoresCargos.colaboradorId, colaborador.id), eq(colaboradoresCargos.ativo, true)))
  ]);

  const cargosPerfil = cargosAtivos.map((cargo) => ({ id: cargo.cargoId, nome: cargo.cargoNome }));
  const permissoesDosCargos = cargosPerfil.length
    ? await banco
        .select({ regras: permissoesCargos.regras })
        .from(permissoesCargos)
        .where(
          inArray(
            permissoesCargos.cargoId,
            cargosPerfil.map((cargo) => cargo.id)
          )
        )
    : [];

  const permissoesDoSetor = colaborador.setorId
    ? await banco
        .select({ regras: permissoesSetores.regras })
        .from(permissoesSetores)
        .where(eq(permissoesSetores.setorId, colaborador.setorId))
    : [];

  return {
    usuario_id: perfil.usuarioId,
    empresa_id: perfil.empresaId,
    colaborador_id: colaborador.id,
    setor_id: colaborador.setorId,
    cargo_ids: cargosPerfil.map((cargo) => cargo.id),
    cargos: cargosPerfil,
    role: perfil.role,
    nome: perfil.nome,
    email: perfil.email,
    empresa_ids: empresas.map((empresa) => empresa.empresaId),
    regras_permissoes: {
      setor: permissoesDoSetor[0]?.regras ?? null,
      cargos: permissoesDosCargos.map((permissao) => permissao.regras),
      usuario: permissoesDoUsuario[0]?.regras ?? null
    }
  };
}
