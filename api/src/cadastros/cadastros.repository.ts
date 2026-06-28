import { and, eq, ilike, ne } from "drizzle-orm";
import {
  areas,
  cargos,
  colaboradoresCargos,
  colaboradores,
  contas,
  empresas,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  permissoesCargos,
  permissoesSetores,
  permissoesUsuarios,
  perfisUsuarios,
  setores,
  unidadesMedida,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import { usuarioAutenticacao } from "@padaria/db/schema/autenticacao";
import type { Permissao, RoleUsuario } from "@padaria/shared";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

type GrupoTipo = "despesa" | "mercadoria" | "retirada";
type TabelaGrupo = typeof gruposDespesas | typeof gruposMercadorias | typeof gruposRetiradas;

function tabelaGrupo(tipo: GrupoTipo): TabelaGrupo {
  if (tipo === "despesa") return gruposDespesas;
  if (tipo === "mercadoria") return gruposMercadorias;
  return gruposRetiradas;
}

export async function salvarEmpresaRepository(input: { id?: string; nome: string }, db: ExecutorBanco = banco) {
  if (input.id) {
    await db.update(empresas).set({ nome: input.nome }).where(eq(empresas.id, input.id));
    return { id: input.id, nome: input.nome };
  }
  const [criada] = await db.insert(empresas).values({ nome: input.nome }).returning({ id: empresas.id });
  return criada;
}

export async function salvarColaboradorRepository(
  input: { id?: string; empresaId: string; nome: string; cpf: string | null; setorId?: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(colaboradores)
      .set({ nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null })
      .where(and(eq(colaboradores.id, input.id), eq(colaboradores.empresaId, input.empresaId)));
    return {
      id: input.id,
      empresaId: input.empresaId,
      nome: input.nome,
      cpf: input.cpf,
      setorId: input.setorId ?? null
    };
  }
  const [criado] = await db
    .insert(colaboradores)
    .values({ empresaId: input.empresaId, nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null })
    .returning({ id: colaboradores.id });
  return criado;
}

export async function salvarContaRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(contas)
      .set({ nome: input.nome })
      .where(and(eq(contas.id, input.id), eq(contas.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(contas)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: contas.id });
  return criada;
}

export async function salvarUnidadeRepository(
  input: { id?: string; empresaId: string; nome: string; sigla: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(unidadesMedida)
      .set({ nome: input.nome, sigla: input.sigla })
      .where(and(eq(unidadesMedida.id, input.id), eq(unidadesMedida.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome, sigla: input.sigla };
  }
  const [criada] = await db
    .insert(unidadesMedida)
    .values({ empresaId: input.empresaId, nome: input.nome, sigla: input.sigla })
    .returning({ id: unidadesMedida.id });
  return criada;
}

export async function salvarGrupoRepository(
  input: { id?: string; empresaId: string; tipoGrupo: GrupoTipo; nome: string; grupoPaiId: string | null },
  db: ExecutorBanco = banco
) {
  const tabela = tabelaGrupo(input.tipoGrupo);
  if (input.id) {
    await db
      .update(tabela)
      .set({ nome: input.nome, grupoPaiId: input.grupoPaiId })
      .where(and(eq(tabela.id, input.id), eq(tabela.empresaId, input.empresaId)));
    return {
      id: input.id,
      empresaId: input.empresaId,
      tipoGrupo: input.tipoGrupo,
      nome: input.nome,
      grupoPaiId: input.grupoPaiId
    };
  }
  const [criado] = await db
    .insert(tabela)
    .values({ empresaId: input.empresaId, nome: input.nome, grupoPaiId: input.grupoPaiId })
    .returning({ id: tabela.id });
  return criado;
}

export async function salvarAreaRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(areas)
      .set({ nome: input.nome })
      .where(and(eq(areas.id, input.id), eq(areas.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(areas)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: areas.id });
  return criada;
}

export async function salvarSetorRepository(
  input: { id?: string; empresaId: string; nome: string; areaId: string | null; setorPaiId: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(setores)
      .set({ nome: input.nome, areaId: input.areaId, setorPaiId: input.setorPaiId })
      .where(and(eq(setores.id, input.id), eq(setores.empresaId, input.empresaId)));
    return {
      id: input.id,
      empresaId: input.empresaId,
      nome: input.nome,
      areaId: input.areaId,
      setorPaiId: input.setorPaiId
    };
  }
  const [criado] = await db
    .insert(setores)
    .values({ empresaId: input.empresaId, nome: input.nome, areaId: input.areaId, setorPaiId: input.setorPaiId })
    .returning({ id: setores.id });
  return criado;
}

export async function existeEmailUsuarioRepository(
  email: string,
  usuarioIdIgnorado?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [ilike(usuarioAutenticacao.email, email)];
  if (usuarioIdIgnorado) filtros.push(ne(usuarioAutenticacao.id, usuarioIdIgnorado));
  const [existente] = await db
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(and(...filtros))
    .limit(1);
  return Boolean(existente);
}

export async function atualizarUsuarioAutenticacaoRepository(
  input: { id: string; nome: string; email: string },
  db: ExecutorBanco = banco
) {
  await db
    .update(usuarioAutenticacao)
    .set({ name: input.nome, email: input.email, updatedAt: new Date() })
    .where(eq(usuarioAutenticacao.id, input.id));
}

export async function buscarUsuarioAutenticacaoPorEmailRepository(email: string, db: ExecutorBanco = banco) {
  const [usuario] = await db
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(ilike(usuarioAutenticacao.email, email))
    .limit(1);
  return usuario ?? null;
}

export async function upsertPerfilUsuarioRepository(
  input: { usuarioId: string; empresaId: string; nome: string; email: string; role?: RoleUsuario },
  db: ExecutorBanco = banco
) {
  await db
    .insert(perfisUsuarios)
    .values({ ...input, role: input.role ?? "usuario_comum" })
    .onConflictDoUpdate({
      target: perfisUsuarios.usuarioId,
      set: {
        empresaId: input.empresaId,
        nome: input.nome,
        email: input.email,
        ...(input.role ? { role: input.role } : {}),
        atualizadoEm: new Date()
      }
    });
}

export async function substituirEmpresasUsuarioRepository(
  usuarioId: string,
  empresaIds: string[],
  db: ExecutorBanco = banco
) {
  await db.delete(usuariosEmpresas).where(eq(usuariosEmpresas.usuarioId, usuarioId));
  if (!empresaIds.length) return;
  await db
    .insert(usuariosEmpresas)
    .values(empresaIds.map((empresaId) => ({ usuarioId, empresaId })))
    .onConflictDoNothing();
}

export async function buscarColaboradorUsuarioRepository(colaboradorId: string, db: ExecutorBanco = banco) {
  const [colaborador] = await db
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      usuarioId: colaboradores.usuarioId,
      setorId: colaboradores.setorId
    })
    .from(colaboradores)
    .where(eq(colaboradores.id, colaboradorId))
    .limit(1);
  return colaborador ?? null;
}

export async function buscarCargoEmpresaRepository(cargoId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db.select({ empresaId: cargos.empresaId }).from(cargos).where(eq(cargos.id, cargoId)).limit(1);
  return cargo ?? null;
}

export async function buscarSetorEmpresaRepository(setorId: string, db: ExecutorBanco = banco) {
  const [setor] = await db
    .select({ empresaId: setores.empresaId })
    .from(setores)
    .where(eq(setores.id, setorId))
    .limit(1);
  return setor ?? null;
}

export async function listarEmpresasUsuarioRepository(usuarioId: string, db: ExecutorBanco = banco) {
  return db
    .select({ empresaId: usuariosEmpresas.empresaId })
    .from(usuariosEmpresas)
    .where(eq(usuariosEmpresas.usuarioId, usuarioId));
}

export async function colaboradorTemCargoAtivoRepository(colaboradorId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(and(eq(colaboradoresCargos.colaboradorId, colaboradorId), eq(colaboradoresCargos.ativo, true)))
    .limit(1);
  return Boolean(cargo);
}

export async function vincularUsuarioColaboradorRepository(
  usuarioId: string,
  colaboradorId: string,
  db: ExecutorBanco = banco
) {
  await db.update(colaboradores).set({ usuarioId: null }).where(eq(colaboradores.usuarioId, usuarioId));
  await db.update(colaboradores).set({ usuarioId }).where(eq(colaboradores.id, colaboradorId));
}

export async function substituirPermissoesCargoRepository(
  cargoId: string,
  permissoes: Permissao[],
  db: ExecutorBanco = banco
) {
  await db.delete(permissoesCargos).where(eq(permissoesCargos.cargoId, cargoId));
  if (!permissoes.length) return;
  await db
    .insert(permissoesCargos)
    .values(permissoes.map((permissaoCodigo) => ({ cargoId, permissaoCodigo })))
    .onConflictDoNothing();
}

export async function substituirPermissoesSetorRepository(
  setorId: string,
  permissoes: Permissao[],
  db: ExecutorBanco = banco
) {
  await db.delete(permissoesSetores).where(eq(permissoesSetores.setorId, setorId));
  if (!permissoes.length) return;
  await db
    .insert(permissoesSetores)
    .values(permissoes.map((permissaoCodigo) => ({ setorId, permissaoCodigo })))
    .onConflictDoNothing();
}

export async function substituirPermissoesUsuarioRepository(
  usuarioId: string,
  permissoes: Permissao[],
  db: ExecutorBanco = banco
) {
  await db.delete(permissoesUsuarios).where(eq(permissoesUsuarios.usuarioId, usuarioId));
  if (!permissoes.length) return;
  await db
    .insert(permissoesUsuarios)
    .values(permissoes.map((permissaoCodigo) => ({ usuarioId, permissaoCodigo })))
    .onConflictDoNothing();
}
