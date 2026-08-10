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
  valoresBaseEdicao,
  valoresJuros
} from "../lancamentos/lancamentos.dominio.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";

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
    // Grupo de PATRIMONIO no item (§5, item 6) DESLIGA a heranca do grupo do cabecalho: herdar por
    // cima dele deixaria o item com as duas origens e o banco recusaria (despesas_itens_grupo_
    // unico_check). O cabecalho so preenche quem esta sem grupo nenhum.
    const grupoPatrimonioId = item.grupoPatrimonioId ?? null;
    return {
      despesaId,
      grupoDespesaId: grupoPatrimonioId ? null : (item.grupoDespesaId ?? grupoDespesaIdHeader ?? null),
      grupoPatrimonioId,
      colaboradorId: item.colaboradorId ?? colaboradorIdHeader ?? null,
      // E6: de qual item de patrimonio veio a linha. Sem isto o vinculo escolhido na tela nao
      // chegaria ao banco e a descricao voltaria a ser texto solto.
      patrimonioItemId: item.patrimonioItemId ?? null,
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
      descricao: textoDoMovimento(despesas),
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

export async function atualizarFotoNotaDespesaRepository(
  id: string,
  empresaId: string,
  fotoNotaUrl: string,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(despesas)
    .set({ fotoNotaUrl })
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId)));
}

export async function criarDespesaRepository(
  dados: DespesaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco,
  recorrencia?: { id: string; ordem: number } | null
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [despesa] = await tx
      .insert(despesas)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId, recorrencia),
        // R-041: DEPOIS do valoresBase de proposito — sobrescreve o valorAcrescimo do cliente.
        ...valoresJuros(dados),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        credorTipo: dados.credorTipo ?? null,
        dataDocumentoFiscal: dados.dataDocumentoFiscal ?? null,
        numeroDocumentoFiscal: dados.numeroDocumentoFiscal ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        fotoNotaUrl: dados.fotoNotaUrl ?? null
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

/**
 * Trava a linha da despesa para a EDICAO, dentro da transacao de quem chama.
 *
 * A excecao de legado (par de credores intacto) e decidida comparando o payload com o registro
 * GRAVADO. Sem lock, duas edicoes liam o mesmo retrato: a primeira modernizava e commitava, e a
 * segunda validava contra o retrato velho e reintroduzia o par incoerente por cima do registro ja
 * saneado — com `debitos_colaboradores` recriado junto.
 *
 * `NO KEY UPDATE`, e nao `UPDATE`: o `UPDATE` desta rota nao toca a chave primaria, e `FOR UPDATE`
 * conflitaria com o `FOR KEY SHARE` que o Postgres toma sozinho ao validar as FKs de
 * `despesas_itens`, `debitos_colaboradores` e `ajustes_fechamento_caixa` — a discriminacao e o
 * fechamento passariam a esperar por uma edicao em curso, sem necessidade. Mesma matriz do lock da
 * raiz de colaboradores (commit 3ccb268).
 *
 * Fica numa consulta propria em vez de `.for(...)` no detalhe porque o mesmo repositorio de detalhe
 * serve o GET, e leitura pura nao pode travar linha.
 */
export async function travarDespesaRepository(despesaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: despesas.id })
    .from(despesas)
    .where(eq(despesas.id, despesaId))
    .for("no key update");
  return linha ?? null;
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
      recorrenciaId: despesas.recorrenciaId,
      status: despesas.status,
      dataReferencia: despesas.dataReferencia,
      dataVencimento: despesas.dataVencimento,
      dataPagamento: despesas.dataPagamento,
      descricao: textoDoMovimento(despesas),
      observacao: despesas.observacao,
      valorOriginal: despesas.valorOriginal,
      valorAcrescimo: despesas.valorAcrescimo,
      descricaoAcrescimo: despesas.descricaoAcrescimo,
      valorDesconto: despesas.valorDesconto,
      descricaoDesconto: despesas.descricaoDesconto,
      descontoGeralTipo: despesas.descontoGeralTipo,
      descontoGeralValor: despesas.descontoGeralValor,
      contaOrigemId: despesas.contaOrigemId,
      fornecedorId: despesas.fornecedorId,
      colaboradorId: despesas.colaboradorId,
      credorTipo: despesas.credorTipo,
      dataDocumentoFiscal: despesas.dataDocumentoFiscal,
      numeroDocumentoFiscal: despesas.numeroDocumentoFiscal,
      grupoDespesaId: despesas.grupoDespesaId,
      fotoDocumentoUrl: despesas.fotoDocumentoUrl,
      fotoNotaUrl: despesas.fotoNotaUrl,
      jurosTipo: despesas.jurosTipo,
      jurosValorInformado: despesas.jurosValorInformado,
      computar: despesas.computar
    })
    .from(despesas)
    .where(eq(despesas.id, despesaId))
    .limit(1);
  if (!despesa) return null;

  const itens = await db
    .select({
      grupoDespesaId: despesasItens.grupoDespesaId,
      grupoPatrimonioId: despesasItens.grupoPatrimonioId,
      colaboradorId: despesasItens.colaboradorId,
      // Sem isto o item reabriria SEM o vinculo e a tela cairia no "sem item escolhido" — o mesmo
      // erro que a retirada antiga teve com o credor (R-128).
      patrimonioItemId: despesasItens.patrimonioItemId,
      descricao: despesasItens.descricao,
      quantidade: despesasItens.quantidade,
      valorUnitario: despesasItens.valorUnitario,
      descontoTipo: despesasItens.descontoTipo,
      descontoValor: despesasItens.descontoValor,
      descontoTotalTipo: despesasItens.descontoTotalTipo,
      descontoTotalValor: despesasItens.descontoTotalValor,
      valor: despesasItens.valor
    })
    .from(despesasItens)
    .where(eq(despesasItens.despesaId, despesaId));

  return {
    ...despesa,
    valorOriginal: numeroDecimal(despesa.valorOriginal),
    valorAcrescimo: numeroDecimal(despesa.valorAcrescimo),
    jurosValorInformado: despesa.jurosValorInformado == null ? null : numeroDecimal(despesa.jurosValorInformado),
    valorDesconto: numeroDecimal(despesa.valorDesconto),
    descontoGeralTipo: despesa.descontoGeralTipo as DespesaDetalheDto["descontoGeralTipo"],
    descontoGeralValor: despesa.descontoGeralValor == null ? null : numeroDecimal(despesa.descontoGeralValor),
    itensDespesa: itens.map((item) => ({
      ...item,
      quantidade: item.quantidade == null ? undefined : Number(item.quantidade),
      valorUnitario: item.valorUnitario == null ? undefined : Number(item.valorUnitario),
      descontoTipo: item.descontoTipo as DespesaItemPayload["descontoTipo"],
      descontoValor: item.descontoValor == null ? null : Number(item.descontoValor),
      descontoTotalTipo: item.descontoTotalTipo as DespesaItemPayload["descontoTotalTipo"],
      descontoTotalValor: item.descontoTotalValor == null ? null : Number(item.descontoTotalValor),
      valor: numeroDecimal(item.valor)
    }))
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
        ...valoresJuros(dados),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        credorTipo: dados.credorTipo ?? null,
        dataDocumentoFiscal: dados.dataDocumentoFiscal ?? null,
        numeroDocumentoFiscal: dados.numeroDocumentoFiscal ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        fotoNotaUrl: dados.fotoNotaUrl ?? null
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
