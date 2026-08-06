import { and, asc, eq, ilike, ne } from "drizzle-orm";
import { usuarioAutenticacao } from "@padaria/db/schema/autenticacao";
import {
  cargos,
  colaboradores,
  colaboradoresCargos,
  perfisUsuarios,
  setores,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import type { RoleUsuario } from "@padaria/shared";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";

// Contrato de fio: e exatamente isto que sai em GET /api/usuarios e no campo `usuarios` de
// GET /api/permissoes. Nao acrescente campo aqui sem olhar web-vue/utils/domain.ts:679-683.
export type UsuarioLinha = {
  usuarioId: string;
  empresaId: string | null;
  empresaIds: string[];
  nome: string;
  email: string;
  colaboradorId: string;
  setorId: string | null;
  cargoIds: string[];
  cargos: string[];
  role: string;
};

// Procedencia por empresa dos metadados agregados. NAO vai para o fio: existe so para o service
// poder decidir quais campos pertencem a empresa consultada. Sem ela o recorte e impossivel, porque
// `colaboradores.empresa_id` e `cargos.empresa_id` nem eram selecionados aqui — era esse descarte
// que fazia a linha de um usuario compartilhado carregar o colaborador, o setor e os cargos da
// outra empresa.
//
// Os cargos vem como UMA lista de objetos, e nao como arrays paralelos: `cargoIds` e `cargos` do fio
// sao derivados dela ja recortada, entao id e nome nao tem como desalinhar por indice.
export type UsuarioLinhaComEmpresas = Omit<UsuarioLinha, "cargoIds" | "cargos"> & {
  colaboradorEmpresaId: string | null;
  cargosComEmpresa: { id: string; nome: string; empresaId: string }[];
};

// Continua lendo as tabelas sem `where` de empresa: o recorte e do service, que recebe o escopo ja
// validado contra o perfil. Mesmo desenho de listarPermissoesRepository.
export async function listarUsuariosRepository(): Promise<UsuarioLinhaComEmpresas[]> {
  const [perfis, empresasUsuarios, colaboradoresUsuarios, cargosUsuarios] = await Promise.all([
    banco
      .select({
        usuarioId: perfisUsuarios.usuarioId,
        empresaId: perfisUsuarios.empresaId,
        nome: perfisUsuarios.nome,
        email: perfisUsuarios.email,
        role: perfisUsuarios.role
      })
      .from(perfisUsuarios)
      .orderBy(asc(perfisUsuarios.nome)),
    banco
      .select({ usuarioId: usuariosEmpresas.usuarioId, empresaId: usuariosEmpresas.empresaId })
      .from(usuariosEmpresas),
    banco
      .select({
        id: colaboradores.id,
        usuarioId: colaboradores.usuarioId,
        setorId: colaboradores.setorId,
        empresaId: colaboradores.empresaId
      })
      .from(colaboradores),
    banco
      .select({
        colaboradorId: colaboradoresCargos.colaboradorId,
        cargoId: colaboradoresCargos.cargoId,
        cargoNome: cargos.nome,
        // A empresa do CARGO, e nao a do vinculo: o que vaza no corpo e o id e o nome do cargo.
        empresaId: cargos.empresaId
      })
      .from(colaboradoresCargos)
      .innerJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
      .where(eq(colaboradoresCargos.ativo, true))
  ]);

  return perfis.map((perfil) => {
    const colaborador = colaboradoresUsuarios.find((item) => item.usuarioId === perfil.usuarioId);
    const cargosDoUsuario = colaborador ? cargosUsuarios.filter((cargo) => cargo.colaboradorId === colaborador.id) : [];
    return {
      usuarioId: perfil.usuarioId,
      empresaId: perfil.empresaId,
      empresaIds: empresasUsuarios
        .filter((empresa) => empresa.usuarioId === perfil.usuarioId)
        .map((empresa) => empresa.empresaId),
      nome: perfil.nome,
      email: perfil.email,
      colaboradorId: colaborador?.id ?? "",
      colaboradorEmpresaId: colaborador?.empresaId ?? null,
      setorId: colaborador?.setorId ?? null,
      cargosComEmpresa: cargosDoUsuario.map((cargo) => ({
        id: cargo.cargoId,
        nome: cargo.cargoNome,
        empresaId: cargo.empresaId
      })),
      role: perfil.role
    };
  });
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

// Usuario criado por admin (fluxo confiavel, senha definida na hora) ja nasce com o e-mail
// verificado, para poder logar em producao (onde requireEmailVerification e true). Diferente do
// auto-cadastro publico, em que a verificacao sera obrigatoria.
export async function marcarEmailVerificadoRepository(id: string, db: ExecutorBanco = banco) {
  await db
    .update(usuarioAutenticacao)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(usuarioAutenticacao.id, id));
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

export async function substituirEmpresasUsuarioRepository(usuarioId: string, empresaIds: string[], db?: ExecutorBanco) {
  await executarComTransacaoOpcional(db, async (db) => {
    await db.delete(usuariosEmpresas).where(eq(usuariosEmpresas.usuarioId, usuarioId));
    if (!empresaIds.length) return;
    await db
      .insert(usuariosEmpresas)
      .values(empresaIds.map((empresaId) => ({ usuarioId, empresaId })))
      .onConflictDoNothing();
  });
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

// Dedup por CPF: um colaborador ja existente com o mesmo CPF na empresa deve ser reutilizado no
// cadastro de usuario, em vez de criar uma copia. CPF e sempre gravado so com digitos.
export async function buscarColaboradorPorCpfRepository(empresaId: string, cpf: string, db: ExecutorBanco = banco) {
  const [colaborador] = await db
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      usuarioId: colaboradores.usuarioId,
      setorId: colaboradores.setorId
    })
    .from(colaboradores)
    .where(and(eq(colaboradores.empresaId, empresaId), eq(colaboradores.cpf, cpf)))
    .limit(1);
  return colaborador ?? null;
}

export async function buscarCargoEmpresaRepository(cargoId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db
    .select({ empresaId: cargos.empresaId, nome: cargos.nome })
    .from(cargos)
    .where(eq(cargos.id, cargoId))
    .limit(1);
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

export async function salvarColaboradorUsuarioRepository(
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

export async function salvarCargoColaboradorUsuarioRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    setorId: string | null;
    cargoId: string;
    remuneracaoMinuto: number;
    dataInicio: string;
    ativo: boolean;
  },
  db: ExecutorBanco = banco
) {
  const [criado] = await db
    .insert(colaboradoresCargos)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      setorId: input.setorId,
      cargoId: input.cargoId,
      remuneracaoMinuto: String(input.remuneracaoMinuto),
      dataInicio: input.dataInicio,
      ativo: input.ativo
    })
    .returning({ id: colaboradoresCargos.id });
  return criado;
}

export async function vincularUsuarioColaboradorRepository(
  usuarioId: string,
  colaboradorId: string,
  db?: ExecutorBanco
) {
  await executarComTransacaoOpcional(db, async (db) => {
    await db.update(colaboradores).set({ usuarioId: null }).where(eq(colaboradores.usuarioId, usuarioId));
    await db.update(colaboradores).set({ usuarioId }).where(eq(colaboradores.id, colaboradorId));
  });
}
