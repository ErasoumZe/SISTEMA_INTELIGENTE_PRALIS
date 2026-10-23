// MODULO DO COMPRADOR — contraproposta versionada (Fase 2, R-221 decisao 7). Escreve no MESMO livro de
// propostas do convite que o fornecedor, com `autor_tipo='comprador'`. NUNCA e importado pelo modulo
// publico do fornecedor (a regra de verificar-arquitetura garante).
import { desc, eq } from "drizzle-orm";
import {
  comprasConvitesItens,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadasConvites
} from "@padaria/db/schema";
import type { TransacaoBanco } from "../banco/conexao.js";

export async function itensDoConviteRepository(
  conviteId: string,
  tx: TransacaoBanco
): Promise<Array<{ conviteItemId: string; rodadaItemId: string }>> {
  return tx
    .select({ conviteItemId: comprasConvitesItens.id, rodadaItemId: comprasConvitesItens.rodadaItemId })
    .from(comprasConvitesItens)
    .where(eq(comprasConvitesItens.conviteId, conviteId));
}

/** Proxima versao do livro do convite (fornecedor e comprador compartilham a sequencia). */
export async function proximaVersaoDoConviteRepository(conviteId: string, tx: TransacaoBanco): Promise<number> {
  const [linha] = await tx
    .select({ versao: comprasPropostas.versao })
    .from(comprasPropostas)
    .where(eq(comprasPropostas.conviteId, conviteId))
    .orderBy(desc(comprasPropostas.versao))
    .limit(1);
  return (linha?.versao ?? 0) + 1;
}

export async function criarContrapropostaRepository(
  input: {
    empresaId: string;
    conviteId: string;
    versao: number;
    autorUsuarioId: string;
    itens: Array<{ conviteItemId: string; valorUnitario: number }>;
  },
  tx: TransacaoBanco
): Promise<string> {
  const [proposta] = await tx
    .insert(comprasPropostas)
    .values({
      empresaId: input.empresaId,
      conviteId: input.conviteId,
      versao: input.versao,
      autorTipo: "comprador",
      autorUsuarioId: input.autorUsuarioId,
      // Contraproposta nao tem rascunho (constraint compras_propostas_rascunho_check).
      status: "enviada",
      enviadaEm: new Date()
    })
    .returning({ id: comprasPropostas.id });
  if (!proposta) throw new Error("Contraproposta nao criada");
  await tx.insert(comprasPropostasItens).values(
    input.itens.map((item) => ({
      empresaId: input.empresaId,
      propostaId: proposta.id,
      conviteItemId: item.conviteItemId,
      indisponivel: false,
      valorUnitario: item.valorUnitario.toFixed(2)
    }))
  );
  return proposta.id;
}

/** O convite "volta a aberto" com o MESMO token (decisao 7): o fornecedor pode responder de novo. */
export async function marcarConviteAbertoRepository(conviteId: string, tx: TransacaoBanco): Promise<void> {
  await tx.update(comprasRodadasConvites).set({ status: "aberto" }).where(eq(comprasRodadasConvites.id, conviteId));
}
