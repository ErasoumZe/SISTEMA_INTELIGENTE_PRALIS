import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { debitosColaboradores, fechamentosCaixa } from "@padaria/db/schema/caixa";
import { despesas, despesasItens } from "@padaria/db/schema/despesa";
import type {
  DespesaDetalheDto,
  DespesaDto,
  DespesaItemPayload,
  DespesaPayload,
  DespesasQuery
} from "@padaria/shared/despesas";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import type { TipoDesconto } from "@padaria/shared/discriminacao";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  calcularDiscriminacaoDespesa,
  filtrosEmpresa,
  numeroDecimal,
  valoresBase,
  valoresBaseEdicao
} from "../lancamentos/lancamentos.dominio.js";

// Linhas de item de UMA despesa. Igual a mercadoria: o calculo e da LISTA inteira porque o desconto
// geral (nivel 3) rateia entre os itens (§5/D4). `valor` continua sendo o V.Total liquido dos
// descontos de item — e a soma dele que a D5 confere.
function linhasItensDespesa(
  dados: {
    itensDespesa: DespesaItemPayload[];
    descontoGeralTipo?: TipoDesconto | null | undefined;
    descontoGeralValor?: number | null | undefined;
  },
  despesaId: string,
  grupoDespesaIdHeader: string | null,
  colaboradorIdHeader: string | null
) {
  const calculo = calcularDiscriminacaoDespesa(dados);
  return dados.itensDespesa.map((item, indice) => {
    const calculado = calculo.itens[indice];
    const quantidade = item.quantidade ?? 1;
    return {
      despesaId,
      grupoDespesaId: item.grupoDespesaId ?? grupoDespesaIdHeader ?? null,
      colaboradorId: item.colaboradorId ?? colaboradorIdHeader ?? null,
      descricao: item.descricao,
      quantidade: String(quantidade),
      valorUnitario: String(item.valorUnitario ?? (quantidade > 0 ? item.valor / quantidade : 0)),
      descontoTipo: item.descontoTipo ?? null,
      descontoValor: item.descontoValor != null ? String(item.descontoValor) : null,
      descontoTotalTipo: item.descontoTotalTipo ?? null,
      descontoTotalValor: item.descontoTotalValor != null ? String(item.descontoTotalValor) : null,
      valor: centavosParaDecimalBanco(calculado?.valorTotalCentavos ?? 0),
      valorUnitarioComDesconto: centavosParaDecimalBanco(calculado?.valorUnitarioComDescontoCentavos ?? 0),
      valorTotalComDesconto: centavosParaDecimalBanco(calculado?.valorTotalComDescontoCentavos ?? 0)
    };
  });
}

export async function listarDespesasRepository(
  query: DespesasQuery,
  empresasPermitidasIds: string[] | null,
  esconderPagos = false
): Promise<DespesaDto[]> {
  const filtros = filtrosEmpresa(despesas, query, empresasPermitidasIds);
  // visualizar_dpago: sem a permissao (esconderPagos), so lancamentos NAO pagos saem da listagem.
  if (query.somentePendentes || esconderPagos) filtros.push(isNull(despesas.dataPagamento));
  if (query.dataInicio) filtros.push(gte(despesas.dataVencimento, query.dataInicio));
  if (query.dataFim) filtros.push(lte(despesas.dataVencimento, query.dataFim));
  if (query.caixaId) filtros.push(eq(despesas.caixaId, query.caixaId));
  if (query.pdvId) {
    const caixas = await banco
      .select({ id: fechamentosCaixa.id })
      .from(fechamentosCaixa)
      .where(eq(fechamentosCaixa.pdvId, query.pdvId));
    const caixaIds = caixas.map((caixa) => caixa.id);
    if (!caixaIds.length) return [];
    filtros.push(inArray(despesas.caixaId, caixaIds));
  }
  const linhas = await banco
    .select({
      id: despesas.id,
      empresaId: despesas.empresaId,
      dataReferencia: despesas.dataReferencia,
      dataVencimento: despesas.dataVencimento,
      dataPagamento: despesas.dataPagamento,
      descricao: despesas.descricao,
      valorOriginal: despesas.valorOriginal,
      computar: despesas.computar,
      status: despesas.status,
      fotoDocumentoUrl: despesas.fotoDocumentoUrl
    })
    .from(despesas)
    .where(filtros.length ? and(...filtros) : undefined);

  // pendenteDiscriminacao = cabecalho sem nenhum item (derivado, sem coluna). Um so SELECT extra;
  // o resto e em memoria (a paginacao ja e feita em memoria no controller).
  const ids = linhas.map((linha) => linha.id);
  const comItens = ids.length
    ? await banco
        .select({ despesaId: despesasItens.despesaId })
        .from(despesasItens)
        .where(inArray(despesasItens.despesaId, ids))
    : [];
  const idsComItens = new Set(comItens.map((linha) => linha.despesaId));
  const resultado = linhas.map((linha) => ({ ...linha, pendenteDiscriminacao: !idsComItens.has(linha.id) }));
  return query.pendenteDiscriminacao ? resultado.filter((linha) => linha.pendenteDiscriminacao) : resultado;
}

export async function atualizarFotoDespesaRepository(
  id: string,
  empresaId: string,
  fotoDocumentoUrl: string | null,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(despesas)
    .set({ fotoDocumentoUrl })
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId)));
}

export async function criarDespesaRepository(
  dados: DespesaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [despesa] = await tx
      .insert(despesas)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
      })
      .returning({ id: despesas.id });
    if (!despesa) throw new Error("Despesa nao criada");

    for (const linha of linhasItensDespesa(
      dados,
      despesa.id,
      dados.grupoDespesaId ?? null,
      dados.colaboradorId ?? null
    )) {
      await tx.insert(despesasItens).values(linha);
    }

    if (dados.colaboradorId) {
      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "DESPESA",
        despesaId: despesa.id,
        caixaId: caixaId ?? null,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });
    }

    return despesa;
  });
}

export async function buscarDespesaDetalheRepository(
  despesaId: string,
  db: ExecutorBanco = banco
): Promise<DespesaDetalheDto | null> {
  const [despesa] = await db
    .select({
      id: despesas.id,
      empresaId: despesas.empresaId,
      caixaId: despesas.caixaId,
      status: despesas.status,
      dataReferencia: despesas.dataReferencia,
      dataVencimento: despesas.dataVencimento,
      dataPagamento: despesas.dataPagamento,
      descricao: despesas.descricao,
      observacao: despesas.observacao,
      valorOriginal: despesas.valorOriginal,
      valorAcrescimo: despesas.valorAcrescimo,
      descricaoAcrescimo: despesas.descricaoAcrescimo,
      valorDesconto: despesas.valorDesconto,
      descricaoDesconto: despesas.descricaoDesconto,
      contaOrigemId: despesas.contaOrigemId,
      fornecedorId: despesas.fornecedorId,
      colaboradorId: despesas.colaboradorId,
      grupoDespesaId: despesas.grupoDespesaId,
      fotoDocumentoUrl: despesas.fotoDocumentoUrl,
      computar: despesas.computar
    })
    .from(despesas)
    .where(eq(despesas.id, despesaId))
    .limit(1);
  if (!despesa) return null;

  const itens = await db
    .select({
      grupoDespesaId: despesasItens.grupoDespesaId,
      colaboradorId: despesasItens.colaboradorId,
      descricao: despesasItens.descricao,
      valor: despesasItens.valor
    })
    .from(despesasItens)
    .where(eq(despesasItens.despesaId, despesaId));

  return {
    ...despesa,
    valorOriginal: numeroDecimal(despesa.valorOriginal),
    valorAcrescimo: numeroDecimal(despesa.valorAcrescimo),
    valorDesconto: numeroDecimal(despesa.valorDesconto),
    itensDespesa: itens.map((item) => ({ ...item, valor: numeroDecimal(item.valor) }))
  };
}

export async function atualizarDespesaRepository(
  despesaId: string,
  dados: DespesaPayload,
  computar: boolean,
  caixaId: string | null,
  criadoPor: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(despesas)
      .set({
        ...valoresBaseEdicao(dados, computar),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
      })
      .where(eq(despesas.id, despesaId));

    await tx.delete(despesasItens).where(eq(despesasItens.despesaId, despesaId));
    for (const linha of linhasItensDespesa(
      dados,
      despesaId,
      dados.grupoDespesaId ?? null,
      dados.colaboradorId ?? null
    )) {
      await tx.insert(despesasItens).values(linha);
    }

    // O debito de colaborador e derivado do lancamento: substitui conforme o novo payload.
    await tx.delete(debitosColaboradores).where(eq(debitosColaboradores.despesaId, despesaId));
    if (dados.colaboradorId) {
      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "DESPESA",
        despesaId,
        caixaId,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });
    }
  });
}

// Discriminacao: substitui SO os itens (o cabecalho, o valorOriginal e o debito de colaborador,
// que e derivado do cabecalho, ficam intactos).
export async function discriminarDespesaRepository(
  despesaId: string,
  dados: {
    itensDespesa: DespesaItemPayload[];
    descontoGeralTipo?: TipoDesconto | null | undefined;
    descontoGeralValor?: number | null | undefined;
  },
  grupoDespesaIdHeader: string | null,
  colaboradorIdHeader: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    const calculo = calcularDiscriminacaoDespesa(dados);
    await tx.delete(despesasItens).where(eq(despesasItens.despesaId, despesaId));
    for (const linha of linhasItensDespesa(dados, despesaId, grupoDespesaIdHeader, colaboradorIdHeader)) {
      await tx.insert(despesasItens).values(linha);
    }
    // Desconto geral e do cabecalho: o R$ resolvido em valor_desconto (alimenta os agregados) e o
    // COMO foi informado em desconto_geral_tipo/valor.
    await tx
      .update(despesas)
      .set({
        descontoGeralTipo: dados.descontoGeralTipo ?? null,
        descontoGeralValor: dados.descontoGeralValor != null ? String(dados.descontoGeralValor) : null,
        valorDesconto: centavosParaDecimalBanco(calculo.descontoGeralCentavos)
      })
      .where(eq(despesas.id, despesaId));
  });
}
