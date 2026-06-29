import { and } from "drizzle-orm";
import { vendas, vendasPagamentos, vendasProdutos } from "@padaria/db/schema/venda";
import type { VendaDto, VendaPayload, VendasQuery } from "@padaria/shared/vendas";
import { banco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "../lancamentos/referencias.js";

export async function listarVendasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<VendaDto[]> {
  const filtros = filtrosEmpresa(vendas, query, empresasPermitidasIds);
  return banco
    .select({
      id: vendas.id,
      empresaId: vendas.empresaId,
      dataReferencia: vendas.dataReferencia,
      descricao: vendas.descricao,
      valorOriginal: vendas.valorOriginal,
      computar: vendas.computar,
      status: vendas.status
    })
    .from(vendas)
    .where(filtros.length ? and(...filtros) : undefined);
}

export async function criarVendaRepository(
  dados: VendaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null
): Promise<{ id: string }> {
  return banco.transaction(async (tx) => {
    const [venda] = await tx
      .insert(vendas)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId),
        pdvId: dados.pdvId ?? null,
        colaboradorId: dados.colaboradorId ?? null
      })
      .returning({ id: vendas.id });
    if (!venda) throw new Error("Venda nao criada");

    for (const item of dados.itensVenda) {
      await tx.insert(vendasProdutos).values({
        vendaId: venda.id,
        produtoId: item.produtoId ?? null,
        produtoAutomacaoId: item.produtoAutomacaoId ?? null,
        produtoAutomacaoCodigo: item.produtoAutomacaoCodigo ?? null,
        descricaoProduto: item.descricaoProduto,
        quantidade: String(item.quantidade),
        valorUnitario: String(item.valorUnitario),
        valorTotal: String(item.valorTotal)
      });
    }

    for (const pagamento of dados.tiposPagamento) {
      await tx.insert(vendasPagamentos).values({
        vendaId: venda.id,
        formaPagamentoId: pagamento.formaPagamentoId ?? null,
        tipoPagamentoAutomacaoId: pagamento.tipoPagamentoAutomacaoId ?? null,
        tipoPagamentoAutomacao: pagamento.tipoPagamentoAutomacao ?? null,
        numeroVendas: pagamento.numeroVendas,
        totalPago: String(pagamento.totalPago)
      });
    }

    return venda;
  });
}
