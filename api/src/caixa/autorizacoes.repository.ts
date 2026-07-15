import { and, desc, eq } from "drizzle-orm";
import { perfisUsuarios, usuariosEmpresas } from "@padaria/db/schema/cadastro";
import { caixaAutorizacoes, fechamentosCaixa } from "@padaria/db/schema/caixa";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type StatusAutorizacao = "pendente" | "usada" | "expirada" | "negada";

export async function criarAutorizacaoCaixaRepository(
  input: { caixaId: string; solicitanteId: string; autorizadorId: string; observacao: string | null },
  db: ExecutorBanco = banco
): Promise<{ id: string }> {
  const [linha] = await db
    .insert(caixaAutorizacoes)
    .values({ ...input, status: "pendente" })
    .returning({ id: caixaAutorizacoes.id });
  if (!linha) throw new Error("Autorizacao nao criada");
  return linha;
}

export async function buscarAutorizacaoPorIdRepository(id: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({
      id: caixaAutorizacoes.id,
      caixaId: caixaAutorizacoes.caixaId,
      empresaId: fechamentosCaixa.empresaId,
      solicitanteId: caixaAutorizacoes.solicitanteId,
      autorizadorId: caixaAutorizacoes.autorizadorId,
      status: caixaAutorizacoes.status,
      tokenHash: caixaAutorizacoes.tokenHash,
      expiraEm: caixaAutorizacoes.expiraEm,
      observacao: caixaAutorizacoes.observacao
    })
    .from(caixaAutorizacoes)
    .innerJoin(fechamentosCaixa, eq(fechamentosCaixa.id, caixaAutorizacoes.caixaId))
    .where(eq(caixaAutorizacoes.id, id))
    .limit(1);
  return linha ?? null;
}

// Fila do autorizador: solicitacoes pendentes das quais ele e o autorizador escolhido, na empresa.
export async function listarAutorizacoesPendentesRepository(
  autorizadorId: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      id: caixaAutorizacoes.id,
      caixaId: caixaAutorizacoes.caixaId,
      solicitanteId: caixaAutorizacoes.solicitanteId,
      solicitanteNome: perfisUsuarios.nome,
      observacao: caixaAutorizacoes.observacao,
      tokenHash: caixaAutorizacoes.tokenHash,
      expiraEm: caixaAutorizacoes.expiraEm,
      criadoEm: caixaAutorizacoes.criadoEm
    })
    .from(caixaAutorizacoes)
    .innerJoin(fechamentosCaixa, eq(fechamentosCaixa.id, caixaAutorizacoes.caixaId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, caixaAutorizacoes.solicitanteId))
    .where(
      and(
        eq(caixaAutorizacoes.autorizadorId, autorizadorId),
        eq(caixaAutorizacoes.status, "pendente"),
        eq(fechamentosCaixa.empresaId, empresaId)
      )
    )
    .orderBy(desc(caixaAutorizacoes.criadoEm));
}

export async function definirTokenAutorizacaoRepository(
  input: { id: string; tokenHash: string; expiraEm: Date },
  db: ExecutorBanco = banco
) {
  await db
    .update(caixaAutorizacoes)
    .set({ tokenHash: input.tokenHash, expiraEm: input.expiraEm })
    .where(eq(caixaAutorizacoes.id, input.id));
}

// Busca a solicitacao por hash do token (qualquer status) para distinguir invalido x expirado x usado.
export async function buscarAutorizacaoPorTokenRepository(
  input: { caixaId: string; solicitanteId: string; tokenHash: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({
      id: caixaAutorizacoes.id,
      autorizadorId: caixaAutorizacoes.autorizadorId,
      status: caixaAutorizacoes.status,
      expiraEm: caixaAutorizacoes.expiraEm
    })
    .from(caixaAutorizacoes)
    .where(
      and(
        eq(caixaAutorizacoes.caixaId, input.caixaId),
        eq(caixaAutorizacoes.solicitanteId, input.solicitanteId),
        eq(caixaAutorizacoes.tokenHash, input.tokenHash)
      )
    )
    .limit(1);
  return linha ?? null;
}

export async function atualizarStatusAutorizacaoRepository(
  input: { id: string; status: StatusAutorizacao },
  db: ExecutorBanco = banco
) {
  await db.update(caixaAutorizacoes).set({ status: input.status }).where(eq(caixaAutorizacoes.id, input.id));
}

export async function listarUsuariosDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .selectDistinct({ usuarioId: perfisUsuarios.usuarioId, nome: perfisUsuarios.nome, role: perfisUsuarios.role })
    .from(perfisUsuarios)
    .innerJoin(usuariosEmpresas, eq(usuariosEmpresas.usuarioId, perfisUsuarios.usuarioId))
    .where(eq(usuariosEmpresas.empresaId, empresaId));
}
