import { and, desc, eq } from "drizzle-orm";
import { notificacoes } from "@padaria/db/schema/caixa";
import type { TipoNotificacao } from "@padaria/shared/notificacoes";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export function listarNotificacoesRepository(
  empresaId: string,
  destinatarioUsuarioId: string,
  db: ExecutorBanco = banco
) {
  return db
    .select()
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.empresaId, empresaId),
        eq(notificacoes.destinatarioUsuarioId, destinatarioUsuarioId),
        eq(notificacoes.verificado, false)
      )
    )
    .orderBy(desc(notificacoes.criadoEm));
}

export async function criarNotificacoesRepository(
  input: {
    empresaId: string;
    tipo: TipoNotificacao;
    destinatariosUsuarioIds: string[];
    referenciaId: string;
    titulo: string;
    valorCentavos?: number | null;
  },
  db: ExecutorBanco = banco
) {
  if (!input.destinatariosUsuarioIds.length) return;
  await db
    .insert(notificacoes)
    .values(
      input.destinatariosUsuarioIds.map((destinatarioUsuarioId) => ({
        empresaId: input.empresaId,
        tipo: input.tipo,
        destinatarioUsuarioId,
        referenciaId: input.referenciaId,
        titulo: input.titulo,
        valor: input.valorCentavos == null ? null : centavosParaDecimalBanco(input.valorCentavos)
      }))
    )
    .onConflictDoNothing();
}

export async function verificarNotificacaoRepository(
  notificacaoId: string,
  empresaId: string,
  usuarioId: string,
  db: ExecutorBanco = banco
) {
  const [item] = await db
    .update(notificacoes)
    .set({ verificado: true, verificadoPor: usuarioId, verificadoEm: new Date() })
    .where(
      and(
        eq(notificacoes.id, notificacaoId),
        eq(notificacoes.empresaId, empresaId),
        eq(notificacoes.destinatarioUsuarioId, usuarioId),
        eq(notificacoes.verificado, false)
      )
    )
    .returning({ id: notificacoes.id });
  return item ?? null;
}
