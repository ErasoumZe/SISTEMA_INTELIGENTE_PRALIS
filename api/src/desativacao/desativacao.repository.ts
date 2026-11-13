import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { sessaoAutenticacao, usuarioAutenticacao } from "@padaria/db/schema/autenticacao";
import { colaboradores, contas, contasUsuarios, pdvs, perfisUsuarios } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import type { TransacaoBanco } from "../banco/conexao.js";

// "Excluir" = desativar (Marco, 13/11/2026). Nada e apagado: o historico (caixas, transferencias, relatorios)
// continua apontando para o mesmo id. So deixa de aparecer nas listas e de aceitar operacao nova.

const caixaEmAndamento = inArray(fechamentosCaixa.status, ["aberto", "em_fechamento"]);

export async function travarPdvRepository(id: string, tx: TransacaoBanco) {
  const [pdv] = await tx
    .select({ id: pdvs.id, empresaId: pdvs.empresaId, nome: pdvs.nome, ativo: pdvs.ativo })
    .from(pdvs)
    .where(eq(pdvs.id, id))
    .limit(1)
    .for("update");
  return pdv ?? null;
}

export async function pdvTemCaixaEmAndamentoRepository(pdvId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(and(eq(fechamentosCaixa.pdvId, pdvId), caixaEmAndamento))
    .limit(1);
  return Boolean(linha);
}

export async function contarContasDePostoDoPdvRepository(pdvId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(colaboradores)
    .where(eq(colaboradores.pdvPadraoId, pdvId));
  return Number(linha?.total ?? 0);
}

// O nome do PDV e unico por empresa: o desativado ganha um sufixo para o nome ficar livre para o PDV novo.
// O codigo (ligacao com a CREARE) tambem fica livre.
export async function desativarPdvRepository(id: string, nome: string, tx: TransacaoBanco) {
  await tx.update(pdvs).set({ ativo: false, nome, codigo: null }).where(eq(pdvs.id, id));
}

export async function travarContaRepository(id: string, tx: TransacaoBanco) {
  const [conta] = await tx
    .select({ id: contas.id, empresaId: contas.empresaId, nome: contas.nome, ativa: contas.ativa })
    .from(contas)
    .where(eq(contas.id, id))
    .limit(1)
    .for("update");
  return conta ?? null;
}

export async function contaEhDePdvAtivoRepository(contaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ nome: pdvs.nome })
    .from(pdvs)
    .where(and(eq(pdvs.contaId, contaId), eq(pdvs.ativo, true)))
    .limit(1);
  return linha?.nome ?? null;
}

export async function desativarContaRepository(id: string, tx: TransacaoBanco) {
  await tx.update(contas).set({ ativa: false }).where(eq(contas.id, id));
  await tx.delete(contasUsuarios).where(eq(contasUsuarios.contaId, id));
}

export async function travarUsuarioRepository(usuarioId: string, tx: TransacaoBanco) {
  const [perfil] = await tx
    .select({
      usuarioId: perfisUsuarios.usuarioId,
      empresaId: perfisUsuarios.empresaId,
      email: perfisUsuarios.email,
      role: perfisUsuarios.role
    })
    .from(perfisUsuarios)
    .where(and(eq(perfisUsuarios.usuarioId, usuarioId), isNull(perfisUsuarios.desativadoEm)))
    .limit(1)
    .for("update");
  return perfil ?? null;
}

export async function usuarioTemCaixaEmAndamentoRepository(usuarioId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(
      and(
        or(eq(fechamentosCaixa.usuarioId, usuarioId), eq(fechamentosCaixa.usuarioCaixaId, usuarioId)),
        caixaEmAndamento
      )
    )
    .limit(1);
  return Boolean(linha);
}

// Desativa o login: marca o perfil, troca o e-mail (o original fica livre para um cadastro novo), derruba as
// sessoes abertas, tira os vinculos de conta e libera o posto do Caixa (o indice do posto e unico).
export async function desativarUsuarioRepository(usuarioId: string, emailNovo: string, tx: TransacaoBanco) {
  await tx
    .update(perfisUsuarios)
    .set({ desativadoEm: new Date(), email: emailNovo })
    .where(eq(perfisUsuarios.usuarioId, usuarioId));
  await tx.update(usuarioAutenticacao).set({ email: emailNovo }).where(eq(usuarioAutenticacao.id, usuarioId));
  await tx.delete(sessaoAutenticacao).where(eq(sessaoAutenticacao.userId, usuarioId));
  await tx.delete(contasUsuarios).where(eq(contasUsuarios.usuarioId, usuarioId));
  await tx
    .update(colaboradores)
    .set({ pdvPadraoId: null, turnoCaixa: null })
    .where(eq(colaboradores.usuarioId, usuarioId));
}
