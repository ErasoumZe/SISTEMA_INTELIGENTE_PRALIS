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
    // Quando o mesmo fato acontece DE NOVO sobre a mesma referencia (ex.: a segunda recusa de
    // conferencia da mesma transferencia), a pendencia precisa voltar a aparecer. Sem isto, o
    // `unique(tipo, destinatario, referencia)` fazia o segundo aviso sumir em silencio — quem ja
    // tinha marcado como visto nunca mais era avisado.
    reabrir?: boolean;
  },
  db: ExecutorBanco = banco
) {
  if (!input.destinatariosUsuarioIds.length) return;
  const linhas = input.destinatariosUsuarioIds.map((destinatarioUsuarioId) => ({
    empresaId: input.empresaId,
    tipo: input.tipo,
    destinatarioUsuarioId,
    referenciaId: input.referenciaId,
    titulo: input.titulo,
    valor: input.valorCentavos == null ? null : centavosParaDecimalBanco(input.valorCentavos)
  }));

  if (!input.reabrir) {
    await db.insert(notificacoes).values(linhas).onConflictDoNothing();
    return;
  }

  await db
    .insert(notificacoes)
    .values(linhas)
    .onConflictDoUpdate({
      target: [notificacoes.tipo, notificacoes.destinatarioUsuarioId, notificacoes.referenciaId],
      // Titulo e valor sao os mesmos para todos os destinatarios desta chamada, entao valem os
      // literais — nao ha necessidade de `excluded.*` (que exigiria SQL cru, proibido em api/src).
      set: {
        titulo: input.titulo,
        valor: input.valorCentavos == null ? null : centavosParaDecimalBanco(input.valorCentavos),
        // Os tres zeram juntos: `notificacoes_verificacao_check` exige que verificado, verificadoPor
        // e verificadoEm sejam coerentes entre si.
        verificado: false,
        verificadoPor: null,
        verificadoEm: null
      }
    });
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
