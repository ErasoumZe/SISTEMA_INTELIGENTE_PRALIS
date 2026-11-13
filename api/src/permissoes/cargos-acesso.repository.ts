import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  cargos,
  colaboradores,
  colaboradoresCargos,
  pdvs,
  perfisUsuarios,
  permissoesCargos
} from "@padaria/db/schema/cadastro";
import type { RegrasPermissoes } from "@padaria/shared";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// Aba "Cargos" de Permissoes (Marco, 13/11/2026). `cargos` e catalogo de ACESSO (chave de
// `permissoes_cargos`); a funcao do DP mora em outro lugar e nao e tocada aqui.

export async function listarCargosDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: cargos.id,
      nome: cargos.nome,
      regras: permissoesCargos.regras,
      pessoas: sql<number>`(
        select count(distinct ${colaboradoresCargos.colaboradorId})::int
        from ${colaboradoresCargos}
        where ${colaboradoresCargos.cargoId} = ${cargos.id} and ${colaboradoresCargos.ativo} = true
      )`
    })
    .from(cargos)
    .leftJoin(permissoesCargos, eq(permissoesCargos.cargoId, cargos.id))
    .where(eq(cargos.empresaId, empresaId))
    .orderBy(asc(cargos.nome));
}

// Conta de posto do Caixa = colaborador com posto (PDV) configurado e login vinculado (R-229).
export async function listarContasPostoRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      usuarioId: perfisUsuarios.usuarioId,
      nome: perfisUsuarios.nome,
      email: perfisUsuarios.email,
      pdvNome: pdvs.nome,
      turnoCaixa: colaboradores.turnoCaixa,
      cargoId: cargos.id,
      cargoNome: cargos.nome
    })
    .from(colaboradores)
    .innerJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, colaboradores.usuarioId))
    .innerJoin(pdvs, eq(pdvs.id, colaboradores.pdvPadraoId))
    .leftJoin(
      colaboradoresCargos,
      and(
        eq(colaboradoresCargos.colaboradorId, colaboradores.id),
        eq(colaboradoresCargos.empresaId, colaboradores.empresaId),
        eq(colaboradoresCargos.ativo, true)
      )
    )
    .leftJoin(cargos, and(eq(cargos.id, colaboradoresCargos.cargoId), eq(cargos.empresaId, colaboradores.empresaId)))
    .where(and(eq(colaboradores.empresaId, empresaId), isNotNull(colaboradores.pdvPadraoId)))
    .orderBy(asc(pdvs.nome), asc(colaboradores.turnoCaixa), asc(perfisUsuarios.nome));
}

export async function criarCargoComRegrasRepository(
  dados: { empresaId: string; nome: string; regras: RegrasPermissoes },
  tx: TransacaoBanco
) {
  const [criado] = await tx
    .insert(cargos)
    .values({ empresaId: dados.empresaId, nome: dados.nome })
    .returning({ id: cargos.id });
  if (!criado) throw new Error("Cargo nao foi criado");
  await tx.insert(permissoesCargos).values({ cargoId: criado.id, regras: dados.regras });
  return criado.id;
}

// Trava a linha do colaborador: duas trocas simultaneas da mesma conta nao deixam dois cargos ativos.
export async function travarContaPostoRepository(usuarioId: string, empresaId: string, tx: TransacaoBanco) {
  const [conta] = await tx
    .select({ id: colaboradores.id, setorId: colaboradores.setorId, pdvPadraoId: colaboradores.pdvPadraoId })
    .from(colaboradores)
    .where(and(eq(colaboradores.usuarioId, usuarioId), eq(colaboradores.empresaId, empresaId)))
    .limit(1)
    .for("update");
  return conta ?? null;
}

// Troca o cargo ATIVO: desliga os outros (o historico fica) e liga o novo a partir de hoje. Se a conta
// ja estava nesse cargo, nada muda.
export async function trocarCargoAtivoRepository(
  dados: { empresaId: string; colaboradorId: string; setorId: string | null; cargoId: string; hoje: string },
  tx: TransacaoBanco
) {
  await tx
    .update(colaboradoresCargos)
    .set({ ativo: false })
    .where(
      and(
        eq(colaboradoresCargos.colaboradorId, dados.colaboradorId),
        eq(colaboradoresCargos.empresaId, dados.empresaId),
        eq(colaboradoresCargos.ativo, true),
        ne(colaboradoresCargos.cargoId, dados.cargoId)
      )
    );
  const [jaAtivo] = await tx
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(
      and(
        eq(colaboradoresCargos.colaboradorId, dados.colaboradorId),
        eq(colaboradoresCargos.empresaId, dados.empresaId),
        eq(colaboradoresCargos.cargoId, dados.cargoId),
        eq(colaboradoresCargos.ativo, true)
      )
    )
    .limit(1);
  if (jaAtivo) return;
  await tx
    .insert(colaboradoresCargos)
    .values({
      empresaId: dados.empresaId,
      colaboradorId: dados.colaboradorId,
      setorId: dados.setorId,
      cargoId: dados.cargoId,
      remuneracaoMinuto: "1",
      dataInicio: dados.hoje,
      ativo: true
    })
    .onConflictDoUpdate({
      target: [
        colaboradoresCargos.empresaId,
        colaboradoresCargos.colaboradorId,
        colaboradoresCargos.cargoId,
        colaboradoresCargos.dataInicio
      ],
      set: { ativo: true }
    });
}
