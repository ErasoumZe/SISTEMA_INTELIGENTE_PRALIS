import { asc, eq } from "drizzle-orm";
import {
  cargos,
  permissoesCargos,
  permissoesSetores,
  permissoesTabela,
  permissoesUsuarios
} from "@padaria/db/schema/cadastro";
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { listarSetoresRepository } from "../setores/setores.repository.js";
import { listarUsuariosRepository } from "../usuarios/usuarios.repository.js";

export async function listarPermissoesRepository() {
  const [permissoes, cargosLista, cargosPermissoes, setoresLista, setoresPermissoes, usuarios, usuariosPermissoes] =
    await Promise.all([
      banco
        .select({ codigo: permissoesTabela.codigo, nome: permissoesTabela.nome, descricao: permissoesTabela.descricao })
        .from(permissoesTabela)
        .orderBy(asc(permissoesTabela.codigo)),
      banco
        .select({ id: cargos.id, empresaId: cargos.empresaId, nome: cargos.nome })
        .from(cargos)
        .orderBy(asc(cargos.nome)),
      banco
        .select({ cargoId: permissoesCargos.cargoId, regras: permissoesCargos.regras })
        .from(permissoesCargos)
        .orderBy(asc(permissoesCargos.cargoId)),
      listarSetoresRepository(),
      banco
        .select({ setorId: permissoesSetores.setorId, regras: permissoesSetores.regras })
        .from(permissoesSetores)
        .orderBy(asc(permissoesSetores.setorId)),
      listarUsuariosRepository(),
      banco
        .select({ usuarioId: permissoesUsuarios.usuarioId, regras: permissoesUsuarios.regras })
        .from(permissoesUsuarios)
        .orderBy(asc(permissoesUsuarios.usuarioId))
    ]);

  return {
    permissoes,
    cargos: cargosLista,
    cargosPermissoes,
    setores: setoresLista,
    setoresPermissoes,
    usuarios,
    usuariosPermissoes
  };
}

export async function substituirPermissoesCargoRepository(
  cargoId: string,
  regras: RegrasPermissoes,
  db?: ExecutorBanco
) {
  await executarComTransacaoOpcional(db, async (db) => {
    await db.delete(permissoesCargos).where(eq(permissoesCargos.cargoId, cargoId));
    if (!Object.keys(regras).length) return;
    await db.insert(permissoesCargos).values({ cargoId, regras }).onConflictDoNothing();
  });
}

export async function substituirPermissoesSetorRepository(
  setorId: string,
  regras: RegrasPermissoes,
  db?: ExecutorBanco
) {
  await executarComTransacaoOpcional(db, async (db) => {
    await db.delete(permissoesSetores).where(eq(permissoesSetores.setorId, setorId));
    if (!Object.keys(regras).length) return;
    await db.insert(permissoesSetores).values({ setorId, regras }).onConflictDoNothing();
  });
}

export async function substituirPermissoesUsuarioRepository(
  usuarioId: string,
  regras: RegrasPermissoes,
  db?: ExecutorBanco
) {
  await executarComTransacaoOpcional(db, async (db) => {
    await db.delete(permissoesUsuarios).where(eq(permissoesUsuarios.usuarioId, usuarioId));
    if (!Object.keys(regras).length) return;
    await db.insert(permissoesUsuarios).values({ usuarioId, regras }).onConflictDoNothing();
  });
}

function removerRegraPermissao(regras: RegrasPermissoes | null | undefined, permissao: Permissao): RegrasPermissoes {
  const proximas = { ...(regras ?? {}) };
  delete proximas[permissao];
  return proximas;
}

export async function excluirPermissaoCargoRepository(cargoId: string, permissao: Permissao, db?: ExecutorBanco) {
  await executarComTransacaoOpcional(db, async (db) => {
    const [linha] = await db
      .select({ regras: permissoesCargos.regras })
      .from(permissoesCargos)
      .where(eq(permissoesCargos.cargoId, cargoId))
      .limit(1);
    const regras = removerRegraPermissao(linha?.regras, permissao);
    await db.delete(permissoesCargos).where(eq(permissoesCargos.cargoId, cargoId));
    if (Object.keys(regras).length) await db.insert(permissoesCargos).values({ cargoId, regras }).onConflictDoNothing();
  });
}

export async function excluirPermissaoSetorRepository(setorId: string, permissao: Permissao, db?: ExecutorBanco) {
  await executarComTransacaoOpcional(db, async (db) => {
    const [linha] = await db
      .select({ regras: permissoesSetores.regras })
      .from(permissoesSetores)
      .where(eq(permissoesSetores.setorId, setorId))
      .limit(1);
    const regras = removerRegraPermissao(linha?.regras, permissao);
    await db.delete(permissoesSetores).where(eq(permissoesSetores.setorId, setorId));
    if (Object.keys(regras).length)
      await db.insert(permissoesSetores).values({ setorId, regras }).onConflictDoNothing();
  });
}

export async function excluirPermissaoUsuarioRepository(usuarioId: string, permissao: Permissao, db?: ExecutorBanco) {
  await executarComTransacaoOpcional(db, async (db) => {
    const [linha] = await db
      .select({ regras: permissoesUsuarios.regras })
      .from(permissoesUsuarios)
      .where(eq(permissoesUsuarios.usuarioId, usuarioId))
      .limit(1);
    const regras = removerRegraPermissao(linha?.regras, permissao);
    await db.delete(permissoesUsuarios).where(eq(permissoesUsuarios.usuarioId, usuarioId));
    if (Object.keys(regras).length)
      await db.insert(permissoesUsuarios).values({ usuarioId, regras }).onConflictDoNothing();
  });
}
