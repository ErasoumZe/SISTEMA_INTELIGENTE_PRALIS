import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { contas, contasUsuarios } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

const colunasVinculo = {
  id: contasUsuarios.id,
  empresaId: contasUsuarios.empresaId,
  contaId: contasUsuarios.contaId,
  usuarioId: contasUsuarios.usuarioId,
  criadoEm: contasUsuarios.criadoEm
};

export async function listarContasUsuariosRepository(
  filtro: { empresasPermitidas: string[]; contaId?: string; usuarioId?: string },
  db: ExecutorBanco = banco
) {
  if (!filtro.empresasPermitidas.length) return [];
  const condicoes = [inArray(contasUsuarios.empresaId, filtro.empresasPermitidas)];
  if (filtro.contaId) condicoes.push(eq(contasUsuarios.contaId, filtro.contaId));
  if (filtro.usuarioId) condicoes.push(eq(contasUsuarios.usuarioId, filtro.usuarioId));
  return db
    .select(colunasVinculo)
    .from(contasUsuarios)
    .where(and(...condicoes))
    .orderBy(desc(contasUsuarios.criadoEm));
}

// Contas que o usuario opera (via vinculo contas_usuarios). Alimenta os seletores operacionais
// (Origem/Destino da transferencia e Conta dos lancamentos). Retorna [] quando o usuario nao tem
// nenhum vinculo — a regra "sem vinculo = nenhuma conta" (Jose, 27/07) mora no service, aqui so a
// consulta pura.
export async function listarContasDoUsuarioRepository(usuarioId: string, db: ExecutorBanco = banco) {
  return db
    .select({ id: contas.id, empresaId: contas.empresaId, nome: contas.nome })
    .from(contas)
    .innerJoin(contasUsuarios, eq(contasUsuarios.contaId, contas.id))
    .where(eq(contasUsuarios.usuarioId, usuarioId))
    .orderBy(asc(contas.nome));
}

// Unicidade (conta+usuario) tambem e garantida pelo banco (contas_usuarios_unica); checagem previa
// so para devolver mensagem de dominio amigavel.
export async function existeVinculoRepository(contaId: string, usuarioId: string, db: ExecutorBanco = banco) {
  const [existente] = await db
    .select({ id: contasUsuarios.id })
    .from(contasUsuarios)
    .where(and(eq(contasUsuarios.contaId, contaId), eq(contasUsuarios.usuarioId, usuarioId)))
    .limit(1);
  return existente ?? null;
}

export async function criarContaUsuarioRepository(
  input: { empresaId: string; contaId: string; usuarioId: string },
  db: ExecutorBanco = banco
) {
  const [criado] = await db.insert(contasUsuarios).values(input).returning({ id: contasUsuarios.id });
  return criado;
}

export async function buscarContaUsuarioRepository(id: string, db: ExecutorBanco = banco) {
  const [vinculo] = await db
    .select({ id: contasUsuarios.id, empresaId: contasUsuarios.empresaId })
    .from(contasUsuarios)
    .where(eq(contasUsuarios.id, id))
    .limit(1);
  return vinculo ?? null;
}

export async function excluirContaUsuarioRepository(id: string, db: ExecutorBanco = banco) {
  await db.delete(contasUsuarios).where(eq(contasUsuarios.id, id));
}
