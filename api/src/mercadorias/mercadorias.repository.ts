import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { mercadorias, mercadoriasItens } from "@padaria/db/schema/mercadoria";
import { fornecedores, pdvs, perfisUsuarios } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import type {
  MercadoriaAprovacaoDto,
  MercadoriaDetalheDto,
  MercadoriaDto,
  MercadoriaItemPayload,
  MercadoriaPayload,
  MercadoriasAprovacaoQuery,
  MercadoriasQuery
} from "@padaria/shared/mercadorias";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import type { TipoDesconto } from "@padaria/shared/discriminacao";
import { banco, executarComTransacaoOpcional, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import {
  calcularDiscriminacaoMercadoria,
  filtrosEmpresa,
  numeroDecimal,
  valoresBase,
  valoresBaseEdicao,
  valoresJuros
} from "../lancamentos/lancamentos.dominio.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";

// Linhas de item de UMA mercadoria. O calculo e da LISTA inteira porque o desconto geral (nivel 3)
// rateia entre os itens (§5/D4) — nao da para resolver item a item. O servidor decide todo o
// dinheiro: valor_total (liquido dos niveis 1 e 2) e os dois campos *_com_desconto.
function linhasItensMercadoria(
  dados: {
    itensMercadoria: MercadoriaItemPayload[];
    descontoGeralTipo?: TipoDesconto | null | undefined;
    descontoGeralValor?: number | null | undefined;
    grupoMercadoriaId?: string | null | undefined;
  },
  mercadoriaId: string
) {
  const calculo = calcularDiscriminacaoMercadoria(dados);
  return dados.itensMercadoria.map((item, indice) => {
    const calculado = calculo.itens[indice];
    // Ver a nota em linhasItensDespesa: grupo de patrimonio no item DESLIGA a heranca do grupo do
    // cabecalho, senao o item nasceria com duas origens e violaria o CHECK.
    const grupoPatrimonioId = item.grupoPatrimonioId ?? null;
    return {
      mercadoriaId,
      produtoId: item.produtoId ?? null,
      grupoMercadoriaId: grupoPatrimonioId ? null : (item.grupoMercadoriaId ?? dados.grupoMercadoriaId ?? null),
      grupoPatrimonioId,
      unidadeMedidaId: item.unidadeMedidaId ?? null,
      descricao: item.descricao,
      quantidade: String(item.quantidade),
      valorUnitario: String(item.valorUnitario),
      descontoTipo: item.descontoTipo ?? null,
      descontoValor: item.descontoValor != null ? String(item.descontoValor) : null,
      descontoTotalTipo: item.descontoTotalTipo ?? null,
      descontoTotalValor: item.descontoTotalValor != null ? String(item.descontoTotalValor) : null,
      valorTotal: centavosParaDecimalBanco(calculado?.valorTotalCentavos ?? 0),
      valorUnitarioComDesconto: centavosParaDecimalBanco(calculado?.valorUnitarioComDescontoCentavos ?? 0),
      valorTotalComDesconto: centavosParaDecimalBanco(calculado?.valorTotalComDescontoCentavos ?? 0)
    };
  });
}

export async function listarMercadoriasRepository(
  query: MercadoriasQuery,
  empresasPermitidasIds: string[] | null,
  esconderPagos = false
): Promise<MercadoriaDto[]> {
  const filtros = filtrosEmpresa(mercadorias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(mercadorias.caixaId, query.caixaId));
  if (query.pdvId) filtros.push(eq(fechamentosCaixa.pdvId, query.pdvId));
  if (query.dataInicio) filtros.push(gte(mercadorias.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(mercadorias.dataReferencia, query.dataFim));
  if (query.status) filtros.push(eq(mercadorias.status, query.status));
  // visualizar_dpago: sem a permissao (esconderPagos), so mercadorias NAO pagas saem da listagem.
  if (esconderPagos) filtros.push(isNull(mercadorias.dataPagamento));
  const linhas = await banco
    .select({
      id: mercadorias.id,
      empresaId: mercadorias.empresaId,
      dataReferencia: mercadorias.dataReferencia,
      descricao: textoDoMovimento(mercadorias),
      valorOriginal: mercadorias.valorOriginal,
      computar: mercadorias.computar,
      status: mercadorias.status,
      fotoDocumentoUrl: mercadorias.fotoDocumentoUrl,
      caixaId: mercadorias.caixaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      criadoEm: mercadorias.criadoEm,
      criadoPorNome: perfisUsuarios.nome,
      observacao: mercadorias.observacao
    })
    .from(mercadorias)
    .leftJoin(fechamentosCaixa, eq(fechamentosCaixa.id, mercadorias.caixaId))
    .leftJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, mercadorias.criadoPor))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(mercadorias.criadoEm));

  // pendenteDiscriminacao = cabecalho sem nenhum item (derivado, sem coluna). Um so SELECT para
  // saber quais tem itens; o resto e em memoria (a paginacao ja e feita em memoria no controller).
  const ids = linhas.map((linha) => linha.id);
  const comItens = ids.length
    ? await banco
        .select({ mercadoriaId: mercadoriasItens.mercadoriaId })
        .from(mercadoriasItens)
        .where(inArray(mercadoriasItens.mercadoriaId, ids))
    : [];
  const idsComItens = new Set(comItens.map((linha) => linha.mercadoriaId));
  const resultado = linhas.map((linha) => ({
    ...linha,
    criadoEm: linha.criadoEm.toISOString(),
    pendenteDiscriminacao: !idsComItens.has(linha.id)
  }));
  return query.pendenteDiscriminacao ? resultado.filter((linha) => linha.pendenteDiscriminacao) : resultado;
}

export async function atualizarFotoMercadoriaRepository(
  id: string,
  empresaId: string,
  fotoDocumentoUrl: string | null,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(mercadorias)
    .set({ fotoDocumentoUrl })
    .where(and(eq(mercadorias.id, id), eq(mercadorias.empresaId, empresaId)));
}

export async function atualizarFotoNotaMercadoriaRepository(
  id: string,
  empresaId: string,
  fotoNotaUrl: string,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(mercadorias)
    .set({ fotoNotaUrl })
    .where(and(eq(mercadorias.id, id), eq(mercadorias.empresaId, empresaId)));
}

export async function criarMercadoriaRepository(
  dados: MercadoriaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco,
  recorrencia?: { id: string; ordem: number } | null
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [mercadoria] = await tx
      .insert(mercadorias)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId, recorrencia),
        // R-041: DEPOIS do valoresBase de proposito — sobrescreve o valorAcrescimo do cliente.
        ...valoresJuros(dados),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId,
        credorTipo: dados.credorTipo ?? "fornecedor",
        dataDocumentoFiscal: dados.dataDocumentoFiscal ?? null,
        numeroDocumentoFiscal: dados.numeroDocumentoFiscal ?? null,
        grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
        notaFiscalId: dados.notaFiscalId ?? null,
        temNotaFiscal: dados.temNotaFiscal,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        fotoNotaUrl: dados.fotoNotaUrl ?? null
      })
      .returning({ id: mercadorias.id });
    if (!mercadoria) throw new Error("Mercadoria nao criada");

    for (const linha of linhasItensMercadoria(dados, mercadoria.id)) {
      await tx.insert(mercadoriasItens).values(linha);
    }

    return mercadoria;
  });
}

/**
 * Trava a linha da mercadoria para a EDICAO — ver a nota em `travarDespesaRepository`.
 *
 * A mercadoria nao tem excecao de credor legado (so oferta fornecedor), mas tem a MESMA janela para
 * `dataPagamento` e para a conta do caixa: le sem lock, valida contra o retrato e escreve depois.
 * Fica travada junto para as tres saidas terem o mesmo contrato de edicao — deixar uma fora e como o
 * caminho antigo continuar existindo.
 * Escopo de empresa no `where` e `TransacaoBanco` no tipo — ver a nota em `travarDespesaRepository`.
 */
export async function travarMercadoriaRepository(mercadoriaId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: mercadorias.id })
    .from(mercadorias)
    .where(and(eq(mercadorias.id, mercadoriaId), eq(mercadorias.empresaId, empresaId)))
    .for("no key update");
  return linha ?? null;
}

export async function buscarMercadoriaDetalheRepository(
  mercadoriaId: string,
  db: ExecutorBanco = banco
): Promise<MercadoriaDetalheDto | null> {
  const [mercadoria] = await db
    .select({
      id: mercadorias.id,
      empresaId: mercadorias.empresaId,
      caixaId: mercadorias.caixaId,
      recorrenciaId: mercadorias.recorrenciaId,
      status: mercadorias.status,
      dataReferencia: mercadorias.dataReferencia,
      dataVencimento: mercadorias.dataVencimento,
      dataPagamento: mercadorias.dataPagamento,
      descricao: textoDoMovimento(mercadorias),
      observacao: mercadorias.observacao,
      valorOriginal: mercadorias.valorOriginal,
      valorAcrescimo: mercadorias.valorAcrescimo,
      descricaoAcrescimo: mercadorias.descricaoAcrescimo,
      valorDesconto: mercadorias.valorDesconto,
      descricaoDesconto: mercadorias.descricaoDesconto,
      descontoGeralTipo: mercadorias.descontoGeralTipo,
      descontoGeralValor: mercadorias.descontoGeralValor,
      contaOrigemId: mercadorias.contaOrigemId,
      fornecedorId: mercadorias.fornecedorId,
      credorTipo: mercadorias.credorTipo,
      dataDocumentoFiscal: mercadorias.dataDocumentoFiscal,
      numeroDocumentoFiscal: mercadorias.numeroDocumentoFiscal,
      grupoMercadoriaId: mercadorias.grupoMercadoriaId,
      notaFiscalId: mercadorias.notaFiscalId,
      temNotaFiscal: mercadorias.temNotaFiscal,
      fotoDocumentoUrl: mercadorias.fotoDocumentoUrl,
      fotoNotaUrl: mercadorias.fotoNotaUrl,
      jurosTipo: mercadorias.jurosTipo,
      jurosValorInformado: mercadorias.jurosValorInformado,
      computar: mercadorias.computar
    })
    .from(mercadorias)
    .where(eq(mercadorias.id, mercadoriaId))
    .limit(1);
  if (!mercadoria) return null;
  if (!mercadoria.fornecedorId) return null;

  const itens = await db
    .select({
      produtoId: mercadoriasItens.produtoId,
      grupoMercadoriaId: mercadoriasItens.grupoMercadoriaId,
      grupoPatrimonioId: mercadoriasItens.grupoPatrimonioId,
      unidadeMedidaId: mercadoriasItens.unidadeMedidaId,
      descricao: mercadoriasItens.descricao,
      quantidade: mercadoriasItens.quantidade,
      valorUnitario: mercadoriasItens.valorUnitario,
      descontoTipo: mercadoriasItens.descontoTipo,
      descontoValor: mercadoriasItens.descontoValor,
      descontoTotalTipo: mercadoriasItens.descontoTotalTipo,
      descontoTotalValor: mercadoriasItens.descontoTotalValor,
      valorTotal: mercadoriasItens.valorTotal
    })
    .from(mercadoriasItens)
    .where(eq(mercadoriasItens.mercadoriaId, mercadoriaId));

  return {
    ...mercadoria,
    fornecedorId: mercadoria.fornecedorId,
    valorOriginal: numeroDecimal(mercadoria.valorOriginal),
    valorAcrescimo: numeroDecimal(mercadoria.valorAcrescimo),
    jurosValorInformado: mercadoria.jurosValorInformado == null ? null : numeroDecimal(mercadoria.jurosValorInformado),
    valorDesconto: numeroDecimal(mercadoria.valorDesconto),
    descontoGeralTipo: mercadoria.descontoGeralTipo as MercadoriaDetalheDto["descontoGeralTipo"],
    descontoGeralValor: mercadoria.descontoGeralValor == null ? null : numeroDecimal(mercadoria.descontoGeralValor),
    itensMercadoria: itens.map((item) => ({
      ...item,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valorUnitario),
      descontoTipo: item.descontoTipo as MercadoriaItemPayload["descontoTipo"],
      descontoValor: item.descontoValor != null ? Number(item.descontoValor) : null,
      descontoTotalTipo: item.descontoTotalTipo as MercadoriaItemPayload["descontoTotalTipo"],
      descontoTotalValor: item.descontoTotalValor != null ? Number(item.descontoTotalValor) : null,
      valorTotal: numeroDecimal(item.valorTotal)
    }))
  };
}

// `caixaId` entrou na A-4: ate aqui o UPDATE de mercadoria simplesmente nao tocava a coluna, o que
// era equivalente a preservar o valor gravado — e preservar deixou de ser correto quando a conta
// passou a decidir a quem o lancamento pertence. Despesa e retirada ja recebiam o parametro; agora
// as tres saidas escrevem a coluna pelo mesmo criterio, em vez de duas escreverem e uma omitir.
export async function atualizarMercadoriaRepository(
  mercadoriaId: string,
  dados: MercadoriaPayload,
  computar: boolean,
  caixaId: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(mercadorias)
      .set({
        ...valoresBaseEdicao(dados, computar),
        caixaId,
        ...valoresJuros(dados),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId,
        credorTipo: dados.credorTipo ?? "fornecedor",
        dataDocumentoFiscal: dados.dataDocumentoFiscal ?? null,
        numeroDocumentoFiscal: dados.numeroDocumentoFiscal ?? null,
        grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
        notaFiscalId: dados.notaFiscalId ?? null,
        temNotaFiscal: dados.temNotaFiscal,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        fotoNotaUrl: dados.fotoNotaUrl ?? null
      })
      .where(eq(mercadorias.id, mercadoriaId));

    await tx.delete(mercadoriasItens).where(eq(mercadoriasItens.mercadoriaId, mercadoriaId));
    for (const linha of linhasItensMercadoria(dados, mercadoriaId)) {
      await tx.insert(mercadoriasItens).values(linha);
    }
  });
}

// Fila de aprovacao (NF-e): cabecalhos "aguardando_aprovacao" com fornecedor e itens do XML,
// ignorando o filtro de caixa (nascem com caixa_id NULL).
export async function listarMercadoriasAguardandoAprovacaoRepository(
  query: MercadoriasAprovacaoQuery,
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaAprovacaoDto[]> {
  const filtros = filtrosEmpresa(mercadorias, query, empresasPermitidasIds);
  filtros.push(eq(mercadorias.status, "aguardando_aprovacao"));
  const linhas = await banco
    .select({
      id: mercadorias.id,
      empresaId: mercadorias.empresaId,
      dataReferencia: mercadorias.dataReferencia,
      dataVencimento: mercadorias.dataVencimento,
      descricao: textoDoMovimento(mercadorias),
      valorOriginal: mercadorias.valorOriginal,
      computar: mercadorias.computar,
      fornecedorId: mercadorias.fornecedorId,
      fornecedorNome: fornecedores.nome,
      notaFiscalId: mercadorias.notaFiscalId
    })
    .from(mercadorias)
    .leftJoin(fornecedores, eq(fornecedores.id, mercadorias.fornecedorId))
    .where(and(...filtros))
    .orderBy(desc(mercadorias.dataReferencia));

  const ids = linhas.map((linha) => linha.id);
  const itensLinhas = ids.length
    ? await banco
        .select({
          mercadoriaId: mercadoriasItens.mercadoriaId,
          descricao: mercadoriasItens.descricao,
          quantidade: mercadoriasItens.quantidade,
          valorUnitario: mercadoriasItens.valorUnitario,
          valorTotal: mercadoriasItens.valorTotal
        })
        .from(mercadoriasItens)
        .where(inArray(mercadoriasItens.mercadoriaId, ids))
    : [];
  const itensPorMercadoria = new Map<string, MercadoriaAprovacaoDto["itens"]>();
  for (const item of itensLinhas) {
    const lista = itensPorMercadoria.get(item.mercadoriaId) ?? [];
    lista.push({
      descricao: item.descricao,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorTotal
    });
    itensPorMercadoria.set(item.mercadoriaId, lista);
  }
  return linhas.map((linha) => ({ ...linha, itens: itensPorMercadoria.get(linha.id) ?? [] }));
}

// Aprova (aguardando_aprovacao -> aprovado) definindo se computa. Guardado por status para nao
// reaprovar/alterar algo ja decidido. Devolve quantas linhas mudaram (0 = nao aplicavel).
export async function aprovarMercadoriaRepository(
  mercadoriaId: string,
  empresaId: string,
  computar: boolean,
  // S5 (R-164): a aprovacao roda em transacao, sob a porta do caixa — TransacaoBanco obrigatorio.
  db: TransacaoBanco
): Promise<number> {
  const atualizadas = await db
    .update(mercadorias)
    .set({ status: "aprovado", computar })
    .where(
      and(
        eq(mercadorias.id, mercadoriaId),
        eq(mercadorias.empresaId, empresaId),
        eq(mercadorias.status, "aguardando_aprovacao")
      )
    )
    .returning({ id: mercadorias.id });
  return atualizadas.length;
}

// Recusa (aguardando_aprovacao -> cancelado; "cancelado" e o status ja permitido pelo CHECK da
// tabela para lancamentos descartados). Mesma trava por status.
export async function recusarMercadoriaRepository(
  mercadoriaId: string,
  empresaId: string,
  db: TransacaoBanco
): Promise<number> {
  const atualizadas = await db
    .update(mercadorias)
    .set({ status: "cancelado" })
    .where(
      and(
        eq(mercadorias.id, mercadoriaId),
        eq(mercadorias.empresaId, empresaId),
        eq(mercadorias.status, "aguardando_aprovacao")
      )
    )
    .returning({ id: mercadorias.id });
  return atualizadas.length;
}

// Discriminacao: substitui SO os itens (valorOriginal do cabecalho fica intacto). O desconto geral
// e do cabecalho: grava o R$ resolvido em valor_desconto (que alimenta os agregados) e o COMO em
// desconto_geral_tipo/valor.
export async function discriminarMercadoriaRepository(
  mercadoriaId: string,
  dados: {
    itensMercadoria: MercadoriaItemPayload[];
    descontoGeralTipo?: TipoDesconto | null | undefined;
    descontoGeralValor?: number | null | undefined;
  },
  grupoMercadoriaIdHeader: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    const calculo = calcularDiscriminacaoMercadoria(dados);
    await tx.delete(mercadoriasItens).where(eq(mercadoriasItens.mercadoriaId, mercadoriaId));
    for (const linha of linhasItensMercadoria({ ...dados, grupoMercadoriaId: grupoMercadoriaIdHeader }, mercadoriaId)) {
      await tx.insert(mercadoriasItens).values(linha);
    }
    await tx
      .update(mercadorias)
      .set({
        descontoGeralTipo: dados.descontoGeralTipo ?? null,
        descontoGeralValor: dados.descontoGeralValor != null ? String(dados.descontoGeralValor) : null,
        valorDesconto: centavosParaDecimalBanco(calculo.descontoGeralCentavos)
      })
      .where(eq(mercadorias.id, mercadoriaId));
  });
}
