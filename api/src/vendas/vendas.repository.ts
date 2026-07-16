import { and, asc, count, desc, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { clientes, colaboradores, formasPagamento, pdvs } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import { vendas, vendasComprovantes, vendasPagamentos, vendasProdutos } from "@padaria/db/schema/venda";
import type { TotaisVendas, VendaDetalheDto, VendaDto, VendaPayload, VendasQuery } from "@padaria/shared/vendas";
import {
  centavosParaDecimalBanco,
  deCentavos,
  liquidoCentavos,
  liquidoDeSomasCentavos
} from "@padaria/shared/dinheiro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";

// Vendas nao tem turno proprio: o turno vive no caixa. Filtrar por turno = restringir aos caixas
// daquele turno (venda orfa, sem caixa, nao entra no filtro).
async function caixaIdsPorTurno(turnoId: string): Promise<string[]> {
  const caixas = await banco
    .select({ id: fechamentosCaixa.id })
    .from(fechamentosCaixa)
    .where(eq(fechamentosCaixa.turnoId, turnoId));
  return caixas.map((caixa) => caixa.id);
}

// Ordem cronologica da listagem. Em "asc"/"desc" a chave e data_venda (hora real); data_referencia
// entra como desempate para a venda manual, que nao tem hora.
function ordenacaoVendas(ordem: "asc" | "desc" | undefined) {
  if (ordem === "asc") return [asc(vendas.dataVenda), asc(vendas.dataReferencia)];
  if (ordem === "desc") return [desc(vendas.dataVenda), desc(vendas.dataReferencia)];
  return [desc(vendas.dataReferencia), desc(vendas.dataVenda)];
}

export async function listarVendasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<VendaDto[]> {
  const filtros = filtrosEmpresa(vendas, query, empresasPermitidasIds);
  if (query.dataInicio) filtros.push(gte(vendas.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(vendas.dataReferencia, query.dataFim));
  if (query.caixaId) filtros.push(eq(vendas.caixaId, query.caixaId));
  if (query.pdvId) filtros.push(eq(vendas.pdvId, query.pdvId));
  if (query.clienteId) filtros.push(eq(vendas.clienteId, query.clienteId));
  if (query.colaboradorId) filtros.push(eq(vendas.colaboradorId, query.colaboradorId));
  if (query.status) filtros.push(eq(vendas.status, query.status));
  if (query.turnoId) {
    const caixaIds = await caixaIdsPorTurno(query.turnoId);
    if (!caixaIds.length) return [];
    filtros.push(inArray(vendas.caixaId, caixaIds));
  }

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
      // Hora real da venda (integracao). data_referencia e date-only e nao responde "que horas
      // foi": era por isso que o relatorio nao mostrava hora.
      dataVenda: vendas.dataVenda,
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
    .where(filtros.length ? and(...filtros) : undefined)
    // data_referencia e date-only: sozinha empilha o dia inteiro sem ordem interna; data_venda
    // desempata pela hora real. `ordem` vem do Relatorio de Vendas (cabecalho clicavel); sem ela,
    // mantem o padrao das telas operacionais (mais recente primeiro).
    .orderBy(...ordenacaoVendas(query.ordem));

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
    // timestamp -> ISO no contrato (dataReferencia/dataPagamento sao date-only e ja vem string).
    dataVenda: linha.dataVenda ? new Date(linha.dataVenda).toISOString() : null,
    // O que o cliente pagou. valorOriginal segue no DTO (subtotal) para quem precisar da decomposicao.
    valorLiquido: centavosParaDecimalBanco(liquidoCentavos(linha)),
    pagamentos: pagamentos
      .filter((pagamento) => pagamento.vendaId === linha.id)
      .map(({ vendaId: _vendaId, ...pagamento }) => pagamento),
    totalComprovantes: comprovantes.filter((comprovante) => comprovante.vendaId === linha.id).length
  }));
}

// Totais do relatorio sobre TODO o conjunto filtrado (mesmos filtros da listagem): total geral
// (soma de valor_original das vendas) + subtotais por forma de pagamento (soma de total_pago).
export async function totaisVendasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TotaisVendas> {
  const filtros = filtrosEmpresa(vendas, query, empresasPermitidasIds);
  if (query.dataInicio) filtros.push(gte(vendas.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(vendas.dataReferencia, query.dataFim));
  if (query.caixaId) filtros.push(eq(vendas.caixaId, query.caixaId));
  if (query.pdvId) filtros.push(eq(vendas.pdvId, query.pdvId));
  if (query.clienteId) filtros.push(eq(vendas.clienteId, query.clienteId));
  if (query.colaboradorId) filtros.push(eq(vendas.colaboradorId, query.colaboradorId));
  if (query.status) filtros.push(eq(vendas.status, query.status));
  if (query.turnoId) {
    const caixaIds = await caixaIdsPorTurno(query.turnoId);
    if (!caixaIds.length) return { totalGeral: 0, quantidade: 0, porFormaPagamento: [] };
    filtros.push(inArray(vendas.caixaId, caixaIds));
  }

  if (query.formaPagamentoId) {
    const comForma = await banco
      .select({ vendaId: vendasPagamentos.vendaId })
      .from(vendasPagamentos)
      .where(eq(vendasPagamentos.formaPagamentoId, query.formaPagamentoId));
    const vendaIds = comForma.map((item) => item.vendaId);
    if (!vendaIds.length) return { totalGeral: 0, quantidade: 0, porFormaPagamento: [] };
    filtros.push(inArray(vendas.id, vendaIds));
  }
  const where = filtros.length ? and(...filtros) : undefined;

  // Total geral. Soma e linear, entao somamos as tres colunas e combinamos no liquido — evita
  // expressao aritmetica em SQL (proibida na API) e da o mesmo SUM(original - desconto + acrescimo).
  const [resumo] = await banco
    .select({
      somaOriginal: sum(vendas.valorOriginal),
      somaDesconto: sum(vendas.valorDesconto),
      somaAcrescimo: sum(vendas.valorAcrescimo),
      quantidade: count()
    })
    .from(vendas)
    .where(where);

  // Com filtro de forma ativo, o total geral e a PARCELA paga naquela forma — nao o valor inteiro
  // da venda. Numa venda multi-forma ("CREDITO, PIX"), somar a venda toda ao filtrar por CREDITO
  // inflava o relatorio com dinheiro que entrou por outra forma.
  const [parcelaDaForma] = query.formaPagamentoId
    ? await banco
        .select({ total: sum(vendasPagamentos.totalPago) })
        .from(vendasPagamentos)
        .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
        .where(and(eq(vendasPagamentos.formaPagamentoId, query.formaPagamentoId), ...(where ? [where] : [])))
    : [undefined];

  const porForma = await banco
    .select({
      formaPagamentoId: vendasPagamentos.formaPagamentoId,
      formaPagamento: formasPagamento.nome,
      total: sum(vendasPagamentos.totalPago),
      quantidade: count()
    })
    .from(vendasPagamentos)
    .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
    .leftJoin(formasPagamento, eq(formasPagamento.id, vendasPagamentos.formaPagamentoId))
    .where(where)
    .groupBy(vendasPagamentos.formaPagamentoId, formasPagamento.nome);

  return {
    // Sem filtro de forma: liquido das vendas (cada venda conta UMA vez, sem join com pagamentos).
    // Com filtro: so a parcela daquela forma. quantidade continua sendo "vendas com a forma".
    totalGeral: query.formaPagamentoId
      ? numeroDecimal(parcelaDaForma?.total ?? "0")
      : deCentavos(liquidoDeSomasCentavos(resumo ?? { somaOriginal: 0, somaDesconto: 0, somaAcrescimo: 0 })),
    quantidade: Number(resumo?.quantidade ?? 0),
    porFormaPagamento: porForma.map((linha) => ({
      formaPagamentoId: linha.formaPagamentoId,
      formaPagamento: linha.formaPagamento ?? "Sem forma",
      total: numeroDecimal(linha.total ?? "0"),
      quantidade: Number(linha.quantidade)
    }))
  };
}

export async function criarVendaRepository(
  dados: VendaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
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

export async function buscarVendaDetalheRepository(
  vendaId: string,
  db: ExecutorBanco = banco
): Promise<VendaDetalheDto | null> {
  const [venda] = await db
    .select({
      id: vendas.id,
      empresaId: vendas.empresaId,
      caixaId: vendas.caixaId,
      status: vendas.status,
      dataReferencia: vendas.dataReferencia,
      dataPagamento: vendas.dataPagamento,
      descricao: vendas.descricao,
      observacao: vendas.observacao,
      valorOriginal: vendas.valorOriginal,
      valorAcrescimo: vendas.valorAcrescimo,
      descricaoAcrescimo: vendas.descricaoAcrescimo,
      valorDesconto: vendas.valorDesconto,
      descricaoDesconto: vendas.descricaoDesconto,
      contaOrigemId: vendas.contaOrigemId,
      pdvId: vendas.pdvId,
      colaboradorId: vendas.colaboradorId,
      computar: vendas.computar
    })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1);
  if (!venda) return null;

  const itens = await db
    .select({
      produtoId: vendasProdutos.produtoId,
      produtoAutomacaoId: vendasProdutos.produtoAutomacaoId,
      produtoAutomacaoCodigo: vendasProdutos.produtoAutomacaoCodigo,
      descricaoProduto: vendasProdutos.descricaoProduto,
      quantidade: vendasProdutos.quantidade,
      valorUnitario: vendasProdutos.valorUnitario,
      valorTotal: vendasProdutos.valorTotal
    })
    .from(vendasProdutos)
    .where(eq(vendasProdutos.vendaId, vendaId));
  const pagamentos = await db
    .select({
      formaPagamentoId: vendasPagamentos.formaPagamentoId,
      tipoPagamentoAutomacaoId: vendasPagamentos.tipoPagamentoAutomacaoId,
      tipoPagamentoAutomacao: vendasPagamentos.tipoPagamentoAutomacao,
      numeroVendas: vendasPagamentos.numeroVendas,
      totalPago: vendasPagamentos.totalPago
    })
    .from(vendasPagamentos)
    .where(eq(vendasPagamentos.vendaId, vendaId));

  return {
    ...venda,
    valorOriginal: numeroDecimal(venda.valorOriginal),
    valorAcrescimo: numeroDecimal(venda.valorAcrescimo),
    valorDesconto: numeroDecimal(venda.valorDesconto),
    itensVenda: itens.map((item) => ({
      ...item,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valorUnitario),
      valorTotal: numeroDecimal(item.valorTotal)
    })),
    tiposPagamento: pagamentos.map((pagamento) => ({
      ...pagamento,
      totalPago: numeroDecimal(pagamento.totalPago)
    }))
  };
}

export async function atualizarVendaRepository(
  vendaId: string,
  dados: VendaPayload,
  computar: boolean,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(vendas)
      .set({
        ...valoresBaseEdicao(dados, computar),
        pdvId: dados.pdvId ?? null,
        colaboradorId: dados.colaboradorId ?? null
      })
      .where(eq(vendas.id, vendaId));

    await tx.delete(vendasProdutos).where(eq(vendasProdutos.vendaId, vendaId));
    await tx.delete(vendasPagamentos).where(eq(vendasPagamentos.vendaId, vendaId));

    for (const item of dados.itensVenda) {
      await tx.insert(vendasProdutos).values({
        vendaId,
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
        vendaId,
        formaPagamentoId: pagamento.formaPagamentoId ?? null,
        tipoPagamentoAutomacaoId: pagamento.tipoPagamentoAutomacaoId ?? null,
        tipoPagamentoAutomacao: pagamento.tipoPagamentoAutomacao ?? null,
        numeroVendas: pagamento.numeroVendas,
        totalPago: String(pagamento.totalPago)
      });
    }
  });
}
