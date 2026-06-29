import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { clientes, colaboradores, formasPagamento, pdvs } from "@padaria/db/schema/cadastro";
import { vendas, vendasComprovantes, vendasPagamentos, vendasProdutos } from "@padaria/db/schema/venda";
import type { VendaDto, VendaPayload, VendasQuery } from "@padaria/shared/vendas";
import { banco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "../lancamentos/referencias.js";

export async function listarVendasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<VendaDto[]> {
  const filtros = filtrosEmpresa(vendas, query, empresasPermitidasIds);
  if (query.dataInicio) filtros.push(gte(vendas.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(vendas.dataReferencia, query.dataFim));
  if (query.pdvId) filtros.push(eq(vendas.pdvId, query.pdvId));
  if (query.clienteId) filtros.push(eq(vendas.clienteId, query.clienteId));
  if (query.colaboradorId) filtros.push(eq(vendas.colaboradorId, query.colaboradorId));
  if (query.status) filtros.push(eq(vendas.status, query.status));

  const pagamentosFiltro = query.formaPagamentoId
    ? await banco
        .select({ vendaId: vendasPagamentos.vendaId })
        .from(vendasPagamentos)
        .where(eq(vendasPagamentos.formaPagamentoId, query.formaPagamentoId))
    : [];
  if (query.formaPagamentoId) {
    const vendaIds = pagamentosFiltro.map((item) => item.vendaId);
    if (!vendaIds.length) return [];
    filtros.push(inArray(vendas.id, vendaIds));
  }

  const linhas = await banco
    .select({
      id: vendas.id,
      empresaId: vendas.empresaId,
      dataReferencia: vendas.dataReferencia,
      dataPagamento: vendas.dataPagamento,
      descricao: vendas.descricao,
      valorOriginal: vendas.valorOriginal,
      valorAcrescimo: vendas.valorAcrescimo,
      valorDesconto: vendas.valorDesconto,
      computar: vendas.computar,
      status: vendas.status,
      pdvId: vendas.pdvId,
      pdvNome: pdvs.nome,
      clienteId: vendas.clienteId,
      clienteNome: clientes.nome,
      colaboradorId: vendas.colaboradorId,
      colaboradorNome: colaboradores.nome
    })
    .from(vendas)
    .leftJoin(pdvs, eq(pdvs.id, vendas.pdvId))
    .leftJoin(clientes, eq(clientes.id, vendas.clienteId))
    .leftJoin(colaboradores, eq(colaboradores.id, vendas.colaboradorId))
    .where(filtros.length ? and(...filtros) : undefined);

  const ids = linhas.map((linha) => linha.id);
  if (!ids.length) return [];

  const [pagamentos, comprovantes] = await Promise.all([
    banco
      .select({
        id: vendasPagamentos.id,
        vendaId: vendasPagamentos.vendaId,
        formaPagamentoId: vendasPagamentos.formaPagamentoId,
        formaPagamentoNome: formasPagamento.nome,
        totalPago: vendasPagamentos.totalPago
      })
      .from(vendasPagamentos)
      .leftJoin(formasPagamento, eq(formasPagamento.id, vendasPagamentos.formaPagamentoId))
      .where(inArray(vendasPagamentos.vendaId, ids)),
    banco
      .select({ id: vendasComprovantes.id, vendaId: vendasComprovantes.vendaId })
      .from(vendasComprovantes)
      .where(inArray(vendasComprovantes.vendaId, ids))
  ]);

  return linhas.map((linha) => ({
    ...linha,
    pagamentos: pagamentos
      .filter((pagamento) => pagamento.vendaId === linha.id)
      .map(({ vendaId: _vendaId, ...pagamento }) => pagamento),
    totalComprovantes: comprovantes.filter((comprovante) => comprovante.vendaId === linha.id).length
  }));
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
