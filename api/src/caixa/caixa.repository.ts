import { and, eq, ilike, sql, type SQL } from "drizzle-orm";
import { gruposDespesas } from "@padaria/db/schema/cadastro";
import { movimentacoesFinanceiras } from "@padaria/db/schema/movimentacao";
import type { AjusteSaldoPayload, ResumoCaixaQuery } from "@padaria/shared/caixa";
import { banco } from "../banco/conexao.js";

export type TotaisCaixaLinha = {
  totalEntradas: string;
  totalTransferencias: string;
  totalDespesas: string;
  totalRetiradas: string;
};

export async function obterTotaisCaixa(query: ResumoCaixaQuery): Promise<TotaisCaixaLinha> {
  const filtros: SQL[] = [
    eq(movimentacoesFinanceiras.empresaId, query.empresaId),
    eq(movimentacoesFinanceiras.dataReferencia, query.data)
  ];
  if (query.colaboradorId) filtros.push(eq(movimentacoesFinanceiras.colaboradorId, query.colaboradorId));

  const [totais] = await banco
    .select({
      totalEntradas: sql<string>`coalesce(sum(${movimentacoesFinanceiras.valorOriginal}) filter (where ${movimentacoesFinanceiras.tipo} = 'entrada'), 0)`,
      totalTransferencias: sql<string>`coalesce(sum(${movimentacoesFinanceiras.valorOriginal}) filter (where ${movimentacoesFinanceiras.tipo} = 'transferencia'), 0)`,
      totalDespesas: sql<string>`coalesce(sum(${movimentacoesFinanceiras.valorOriginal}) filter (where ${movimentacoesFinanceiras.tipo} = 'despesa'), 0)`,
      totalRetiradas: sql<string>`coalesce(sum(${movimentacoesFinanceiras.valorOriginal}) filter (where ${movimentacoesFinanceiras.tipo} = 'retirada'), 0)`
    })
    .from(movimentacoesFinanceiras)
    .where(and(...filtros));

  return (
    totais ?? {
      totalEntradas: "0",
      totalTransferencias: "0",
      totalDespesas: "0",
      totalRetiradas: "0"
    }
  );
}

export async function buscarGrupoQuebraCaixa(empresaId: string): Promise<{ id: string } | null> {
  const [grupo] = await banco
    .select({ id: gruposDespesas.id })
    .from(gruposDespesas)
    .where(and(eq(gruposDespesas.empresaId, empresaId), ilike(gruposDespesas.nome, "Quebra de caixa")))
    .limit(1);

  return grupo ?? null;
}

export async function criarAjusteSaldoCaixa(
  dados: AjusteSaldoPayload,
  grupoDespesaId: string | null,
  criadoPor: string
): Promise<{ id: string }> {
  const [movimentacao] = await banco
    .insert(movimentacoesFinanceiras)
    .values({
      empresaId: dados.empresaId,
      tipo: "despesa",
      dataReferencia: dados.data,
      dataVencimento: dados.data,
      descricao: "Quebra de caixa",
      valorOriginal: String(Math.abs(dados.valorDiferenca)),
      contaOrigemId: dados.contaOrigemId ?? null,
      colaboradorId: dados.colaboradorId,
      grupoDespesaId,
      criadoPor
    })
    .returning({ id: movimentacoesFinanceiras.id });

  if (!movimentacao) throw new Error("Ajuste de caixa nao criado");
  return movimentacao;
}
