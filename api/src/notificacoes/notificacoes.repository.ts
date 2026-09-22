import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or } from "drizzle-orm";
import { notificacoes } from "@padaria/db/schema/caixa";
import {
  colaboradores,
  colaboradoresCargos,
  cargos,
  perfisUsuarios,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import { despesas } from "@padaria/db/schema/despesa";
import { mercadorias, mercadoriasItens } from "@padaria/db/schema/mercadoria";
import type { TipoNotificacao } from "@padaria/shared/notificacoes";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export function listarNotificacoesRepository(
  empresaId: string,
  destinatarioUsuarioId: string,
  incluirVerificadas = false,
  db: ExecutorBanco = banco
) {
  return db
    .select()
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.empresaId, empresaId),
        eq(notificacoes.destinatarioUsuarioId, destinatarioUsuarioId),
        ...(incluirVerificadas ? [] : [eq(notificacoes.verificado, false)])
      )
    )
    .orderBy(desc(notificacoes.criadoEm));
}

export async function listarDetalhesLancamentosNotificacaoRepository(
  empresaId: string,
  referencias: string[],
  db: ExecutorBanco = banco
): Promise<Map<string, { setor: string; descricao: string | null; dataVencimento: string | null; rota: string }>> {
  if (!referencias.length) return new Map();
  const [linhasDespesas, linhasMercadorias, itensMercadorias] = await Promise.all([
    db
      .select({
        id: despesas.id,
        observacao: despesas.observacao,
        descricao: despesas.descricao,
        dataVencimento: despesas.dataVencimento
      })
      .from(despesas)
      .where(and(eq(despesas.empresaId, empresaId), inArray(despesas.id, referencias))),
    db
      .select({
        id: mercadorias.id,
        observacao: mercadorias.observacao,
        descricao: mercadorias.descricao,
        dataVencimento: mercadorias.dataVencimento
      })
      .from(mercadorias)
      .where(and(eq(mercadorias.empresaId, empresaId), inArray(mercadorias.id, referencias))),
    db
      .select({ mercadoriaId: mercadoriasItens.mercadoriaId, descricao: mercadoriasItens.descricao })
      .from(mercadoriasItens)
      .where(inArray(mercadoriasItens.mercadoriaId, referencias))
  ]);
  const itensPorMercadoria = new Map<string, string[]>();
  for (const item of itensMercadorias) {
    const itens = itensPorMercadoria.get(item.mercadoriaId) ?? [];
    if (itens.length < 3) itens.push(item.descricao);
    itensPorMercadoria.set(item.mercadoriaId, itens);
  }
  const resultado = new Map<
    string,
    { setor: string; descricao: string | null; dataVencimento: string | null; rota: string }
  >();
  for (const linha of linhasDespesas) {
    resultado.set(linha.id, {
      setor: "Despesas",
      descricao: linha.observacao ?? linha.descricao,
      dataVencimento: linha.dataVencimento,
      rota: "/despesas"
    });
  }
  for (const linha of linhasMercadorias) {
    const itens = itensPorMercadoria.get(linha.id);
    resultado.set(linha.id, {
      setor: "Mercadorias",
      descricao: itens?.length ? itens.join(" · ") : (linha.observacao ?? linha.descricao),
      dataVencimento: linha.dataVencimento,
      rota: "/mercadorias"
    });
  }
  return resultado;
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
    // Aviso de vencimento é renovado no máximo uma vez por dia contábil. Assim, marcar o sino como
    // lido vale pelo resto do dia, mas a pendência volta no dia seguinte enquanto não for quitada.
    reabrirUmaVezPorDia?: boolean;
    diaNegocio?: string;
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

  if (input.reabrirUmaVezPorDia && input.diaNegocio) {
    // `criado_em` e timestamptz. O limite e a meia-noite do negocio (BRT), e nao UTC: a mesma
    // notificacao lida as 22h BRT nao pode reabrir de novo porque o calendario UTC virou.
    const inicioDoDiaNegocio = new Date(`${input.diaNegocio}T00:00:00-03:00`);
    for (const linha of linhas) {
      await db
        .update(notificacoes)
        .set({
          titulo: linha.titulo,
          valor: linha.valor,
          verificado: false,
          verificadoPor: null,
          verificadoEm: null,
          criadoEm: new Date()
        })
        .where(
          and(
            eq(notificacoes.empresaId, linha.empresaId),
            eq(notificacoes.tipo, linha.tipo),
            eq(notificacoes.destinatarioUsuarioId, linha.destinatarioUsuarioId),
            eq(notificacoes.referenciaId, linha.referenciaId),
            lt(notificacoes.criadoEm, inicioDoDiaNegocio)
          )
        );
    }
    // Se a linha ainda nao existia, cria. Corrida entre duas abas e inofensiva pelo unique; se
    // ja existia hoje, o UPDATE acima nao a reabre e este insert e ignorado.
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

export async function listarLancamentosParaAvisoDeVencimento(
  empresaId: string,
  vencendoAte: string,
  db: ExecutorBanco = banco
) {
  const [linhasDespesas, linhasMercadorias] = await Promise.all([
    db
      .select({ id: despesas.id, dataVencimento: despesas.dataVencimento, valor: despesas.valorOriginal })
      .from(despesas)
      .where(
        and(
          eq(despesas.empresaId, empresaId),
          isNull(despesas.dataPagamento),
          ne(despesas.status, "cancelado"),
          lte(despesas.dataVencimento, vencendoAte)
        )
      ),
    db
      .select({ id: mercadorias.id, dataVencimento: mercadorias.dataVencimento, valor: mercadorias.valorOriginal })
      .from(mercadorias)
      .where(
        and(
          eq(mercadorias.empresaId, empresaId),
          isNull(mercadorias.dataPagamento),
          ne(mercadorias.status, "cancelado"),
          lte(mercadorias.dataVencimento, vencendoAte)
        )
      )
  ]);
  return [
    ...linhasDespesas.map((linha) => ({ ...linha, dominio: "despesa" as const })),
    ...linhasMercadorias.map((linha) => ({ ...linha, dominio: "mercadoria" as const }))
  ];
}

// Destinatários explicitamente definidos por Rodrigo: Tesouraria, Financeiro, Admin legado e
// Administrador Geral. Cada consulta exige vínculo com a empresa para não vazar aviso entre TNP/Lisboa.
export async function listarDestinatariosAvisoDeVencimentoRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<string[]> {
  const [administradores, retaguarda] = await Promise.all([
    db
      .selectDistinct({ usuarioId: perfisUsuarios.usuarioId })
      .from(perfisUsuarios)
      .innerJoin(usuariosEmpresas, eq(usuariosEmpresas.usuarioId, perfisUsuarios.usuarioId))
      .where(and(eq(usuariosEmpresas.empresaId, empresaId), inArray(perfisUsuarios.role, ["usuario_admin", "admin"]))),
    db
      .selectDistinct({ usuarioId: colaboradores.usuarioId })
      .from(colaboradoresCargos)
      .innerJoin(colaboradores, eq(colaboradores.id, colaboradoresCargos.colaboradorId))
      .innerJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
      .where(
        and(
          eq(colaboradoresCargos.empresaId, empresaId),
          eq(colaboradoresCargos.ativo, true),
          isNotNull(colaboradores.usuarioId),
          or(ilike(cargos.nome, "%Tesouraria%"), ilike(cargos.nome, "%Financeiro%"))
        )
      )
  ]);
  return [
    ...new Set(
      [...administradores, ...retaguarda]
        .map((linha) => linha.usuarioId)
        .filter((usuarioId): usuarioId is string => usuarioId !== null)
    )
  ];
}

// O aviso é operacional, não lançamento financeiro: quando a pendência sai da janela (pagamento,
// cancelamento ou novo vencimento), remove apenas a linha ainda aberta do sino. Nenhuma despesa,
// mercadoria ou histórico financeiro é alterado.
export async function removerAvisosDeVencimentoForaDaJanela(
  empresaId: string,
  referenciasAtivas: string[],
  db: ExecutorBanco = banco
) {
  await db
    .delete(notificacoes)
    .where(
      and(
        eq(notificacoes.empresaId, empresaId),
        eq(notificacoes.tipo, "lancamento_vencimento"),
        eq(notificacoes.verificado, false),
        ...(referenciasAtivas.length ? [notInArray(notificacoes.referenciaId, referenciasAtivas)] : [])
      )
    );
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

/**
 * Marca como vistas somente as pendencias do proprio destinatario na empresa ativa. O UPDATE e
 * unico: duas abas clicando em "Li tudo" nao criam estado intermediario, e notificacao de outro
 * usuario ou outra empresa nunca entra no lote.
 */
export async function verificarTodasNotificacoesRepository(
  empresaId: string,
  usuarioId: string,
  db: ExecutorBanco = banco
): Promise<number> {
  const linhas = await db
    .update(notificacoes)
    .set({ verificado: true, verificadoPor: usuarioId, verificadoEm: new Date() })
    .where(
      and(
        eq(notificacoes.empresaId, empresaId),
        eq(notificacoes.destinatarioUsuarioId, usuarioId),
        eq(notificacoes.verificado, false)
      )
    )
    .returning({ id: notificacoes.id });
  return linhas.length;
}
