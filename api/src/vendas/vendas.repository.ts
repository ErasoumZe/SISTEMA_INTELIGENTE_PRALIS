import { and, asc, count, desc, eq, gte, ilike, inArray, lte, sum } from "drizzle-orm";
import { clientes, colaboradores, formasPagamento, pdvs } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import { vendas, vendasComprovantes, vendasPagamentos, vendasProdutos } from "@padaria/db/schema/venda";
import type { ResultadoPaginado } from "@padaria/shared/api";
import type { TotaisVendas, VendaDetalheDto, VendaDto, VendaPayload, VendasQuery } from "@padaria/shared/vendas";
import {
  centavosParaDecimalBanco,
  deCentavos,
  liquidoCentavos,
  liquidoDeSomasCentavos
} from "@padaria/shared/dinheiro";
import { paraCentavos } from "@padaria/shared/dinheiro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
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

// O relatorio e paginado no BANCO. Carregar o historico inteiro e paginar depois em memoria fazia
// as consultas das filhas receberem um `IN (...)` com uma chave por venda. Em producao, 72 mil
// vendas ultrapassaram o limite de parametros do Postgres e a tabela falhou, embora os totais
// (outra consulta) continuassem corretos.
async function filtrosDasVendas(query: VendasQuery, empresasPermitidasIds: string[] | null) {
  const filtros = filtrosEmpresa(vendas, query, empresasPermitidasIds);
  if (query.dataInicio) filtros.push(gte(vendas.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(vendas.dataReferencia, query.dataFim));
  if (query.dataHoraInicio) filtros.push(gte(vendas.dataVenda, new Date(query.dataHoraInicio)));
  if (query.dataHoraFim) filtros.push(lte(vendas.dataVenda, new Date(query.dataHoraFim)));
  if (query.idVenda) filtros.push(ilike(vendas.identificadorExterno, `%${query.idVenda}%`));
  if (query.produto) {
    const vendaIdsDoProduto = banco
      .select({ vendaId: vendasProdutos.vendaId })
      .from(vendasProdutos)
      .where(ilike(vendasProdutos.descricaoProduto, `%${query.produto}%`));
    filtros.push(inArray(vendas.id, vendaIdsDoProduto));
  }
  if (query.caixaId) filtros.push(eq(vendas.caixaId, query.caixaId));
  if (query.pdvId) filtros.push(eq(vendas.pdvId, query.pdvId));
  if (query.clienteId) filtros.push(eq(vendas.clienteId, query.clienteId));
  if (query.colaboradorId) filtros.push(eq(vendas.colaboradorId, query.colaboradorId));
  if (query.status) filtros.push(eq(vendas.status, query.status));
  if (query.turnoId) {
    const caixaIds = await caixaIdsPorTurno(query.turnoId);
    if (!caixaIds.length) return null;
    filtros.push(inArray(vendas.caixaId, caixaIds));
  }

  // A subconsulta fica no banco: materializar todos os IDs de uma forma de pagamento em JavaScript
  // recriaria o mesmo limite de parametros que derrubou o relatorio.
  if (query.formaPagamentoId) {
    const vendaIdsDaForma = banco
      .select({ vendaId: vendasPagamentos.vendaId })
      .from(vendasPagamentos)
      .where(eq(vendasPagamentos.formaPagamentoId, query.formaPagamentoId));
    filtros.push(inArray(vendas.id, vendaIdsDaForma));
  }
  return filtros;
}

const colunasResumoVenda = {
  id: vendas.id,
  empresaId: vendas.empresaId,
  dataReferencia: vendas.dataReferencia,
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
};

type LinhaResumoVenda = {
  id: string;
  empresaId: string;
  dataReferencia: string;
  dataVenda: Date | null;
  dataPagamento: string | null;
  descricao: string;
  valorOriginal: string;
  valorAcrescimo: string;
  valorDesconto: string;
  computar: boolean;
  status: string;
  pdvId: string | null;
  pdvNome: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  colaboradorId: string | null;
  colaboradorNome: string | null;
};

function consultaLinhasVendas(filtros: ReturnType<typeof filtrosEmpresa>, ordem: VendasQuery["ordem"]) {
  return banco
    .select(colunasResumoVenda)
    .from(vendas)
    .leftJoin(pdvs, eq(pdvs.id, vendas.pdvId))
    .leftJoin(clientes, eq(clientes.id, vendas.clienteId))
    .leftJoin(colaboradores, eq(colaboradores.id, vendas.colaboradorId))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(...ordenacaoVendas(ordem));
}

async function montarResumoDasVendas(linhas: LinhaResumoVenda[]): Promise<VendaDto[]> {
  const ids = linhas.map((linha) => linha.id);
  if (!ids.length) return [];

  const [pagamentos, comprovantes, itens] = await Promise.all([
    banco
      .select({
        id: vendasPagamentos.id,
        vendaId: vendasPagamentos.vendaId,
        formaPagamentoId: vendasPagamentos.formaPagamentoId,
        formaPagamentoNome: formasPagamento.nome,
        tipoPagamentoAutomacaoId: vendasPagamentos.tipoPagamentoAutomacaoId,
        tipoPagamentoAutomacao: vendasPagamentos.tipoPagamentoAutomacao,
        totalPago: vendasPagamentos.totalPago
      })
      .from(vendasPagamentos)
      .leftJoin(formasPagamento, eq(formasPagamento.id, vendasPagamentos.formaPagamentoId))
      .where(inArray(vendasPagamentos.vendaId, ids)),
    banco
      .select({ id: vendasComprovantes.id, vendaId: vendasComprovantes.vendaId })
      .from(vendasComprovantes)
      .where(inArray(vendasComprovantes.vendaId, ids)),
    banco
      .select({
        vendaId: vendasProdutos.vendaId,
        produtoId: vendasProdutos.produtoId,
        produtoAutomacaoId: vendasProdutos.produtoAutomacaoId,
        produtoAutomacaoCodigo: vendasProdutos.produtoAutomacaoCodigo,
        descricaoProduto: vendasProdutos.descricaoProduto,
        quantidade: vendasProdutos.quantidade,
        valorUnitario: vendasProdutos.valorUnitario,
        valorTotal: vendasProdutos.valorTotal
      })
      .from(vendasProdutos)
      .where(inArray(vendasProdutos.vendaId, ids))
  ]);

  return linhas.map((linha) => ({
    ...linha,
    dataVenda: linha.dataVenda ? new Date(linha.dataVenda).toISOString() : null,
    valorLiquido: centavosParaDecimalBanco(liquidoCentavos(linha)),
    pagamentos: pagamentos
      .filter((pagamento) => pagamento.vendaId === linha.id)
      .map(({ vendaId: _vendaId, ...pagamento }) => pagamento),
    itensVenda: itens
      .filter((item) => item.vendaId === linha.id)
      .map(({ vendaId: _vendaId, ...item }) => ({
        ...item,
        quantidade: Number(item.quantidade),
        valorUnitario: Number(item.valorUnitario),
        valorTotal: numeroDecimal(item.valorTotal)
      })),
    totalComprovantes: comprovantes.filter((comprovante) => comprovante.vendaId === linha.id).length
  }));
}

export async function listarVendasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<VendaDto[]> {
  const filtros = await filtrosDasVendas(query, empresasPermitidasIds);
  if (!filtros) return [];
  return montarResumoDasVendas(await consultaLinhasVendas(filtros, query.ordem));
}

export async function listarVendasPaginadasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<ResultadoPaginado<VendaDto>> {
  // O schema coage os valores da query HTTP; a inferencia compartilhada os expoe como unknown.
  // Normalizamos aqui, antes de chegar ao driver do banco e ao contrato paginado.
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  const filtros = await filtrosDasVendas(query, empresasPermitidasIds);
  if (!filtros) return { itens: [], total: 0, page, pageSize };
  const where = filtros.length ? and(...filtros) : undefined;
  const [linhas, [contagem]] = await Promise.all([
    consultaLinhasVendas(filtros, query.ordem)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    banco.select({ total: count() }).from(vendas).where(where)
  ]);
  return {
    itens: await montarResumoDasVendas(linhas),
    total: Number(contagem?.total ?? 0),
    page,
    pageSize
  };
}

// Totais do relatorio sobre TODO o conjunto filtrado (mesmos filtros da listagem): total geral
// (soma de valor_original das vendas) + subtotais por forma de pagamento (soma de total_pago).
export async function totaisVendasRepository(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TotaisVendas> {
  // Totais e tabela compartilham os mesmos filtros, inclusive a janela de hora.
  const filtros = await filtrosDasVendas(query, empresasPermitidasIds);
  if (!filtros) return { totalGeral: 0, quantidade: 0, porFormaPagamento: [] };
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
      formaPagamentoAutomacao: vendasPagamentos.tipoPagamentoAutomacao,
      total: sum(vendasPagamentos.totalPago),
      quantidade: count()
    })
    .from(vendasPagamentos)
    .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
    .leftJoin(formasPagamento, eq(formasPagamento.id, vendasPagamentos.formaPagamentoId))
    .where(where)
    .groupBy(vendasPagamentos.formaPagamentoId, formasPagamento.nome, vendasPagamentos.tipoPagamentoAutomacao);

  const porFormaAgrupada = new Map<
    string,
    { formaPagamentoId: string | null; formaPagamento: string; total: number; quantidade: number }
  >();
  for (const linha of porForma) {
    const formaPagamento = linha.formaPagamento?.trim() || linha.formaPagamentoAutomacao?.trim() || "Sem forma";
    const chave = linha.formaPagamentoId ?? `automacao:${formaPagamento.toLocaleLowerCase("pt-BR")}`;
    const atual = porFormaAgrupada.get(chave) ?? {
      formaPagamentoId: linha.formaPagamentoId,
      formaPagamento,
      total: 0,
      quantidade: 0
    };
    atual.total += Number(linha.total ?? 0);
    atual.quantidade += Number(linha.quantidade ?? 0);
    porFormaAgrupada.set(chave, atual);
  }

  return {
    // Sem filtro de forma: liquido das vendas (cada venda conta UMA vez, sem join com pagamentos).
    // Com filtro: so a parcela daquela forma. quantidade continua sendo "vendas com a forma".
    totalGeral: query.formaPagamentoId
      ? numeroDecimal(parcelaDaForma?.total ?? "0")
      : deCentavos(liquidoDeSomasCentavos(resumo ?? { somaOriginal: 0, somaDesconto: 0, somaAcrescimo: 0 })),
    quantidade: Number(resumo?.quantidade ?? 0),
    porFormaPagamento: [...porFormaAgrupada.values()].map((linha) => ({
      formaPagamentoId: linha.formaPagamentoId,
      formaPagamento: linha.formaPagamento,
      total: numeroDecimal(linha.total),
      quantidade: linha.quantidade
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
        // VENDA fica FORA da R-127: a descricao dela e GERADA pela integracao (R-062), nao digitada,
        // e a coluna segue NOT NULL. Reafirma o campo depois do spread, que agora aceita nulo.
        descricao: dados.descricao,
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

// P0 (CX-M06 estendida): a linha da venda sob `FOR NO KEY UPDATE` durante a edicao — a venda era a
// unica saida sem trava nenhuma, e o PUT concorria ate consigo mesmo. Espelho de
// `travarDespesaRepository`: escopo de empresa DENTRO do where (nao travar linha alheia; sem
// oraculo de existencia por latencia) e `TransacaoBanco` para o lock nao evaporar fora de
// transacao. Ordem unica do P0: o chamador ja segurou o caixa (FOR SHARE) ANTES desta trava.
export async function travarVendaRepository(vendaId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId)))
    .for("no key update");
  return linha ?? null;
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

// A assinatura de um pagamento: forma + valor em centavos. E a MESMA chave que a R-177 usa para
// decidir se os pagamentos mudaram — de proposito, para o guard e a preservacao do snapshot nunca
// discordarem sobre o que e "o mesmo pagamento".
export function assinaturaDoPagamento(formaPagamentoId: string | null, totalPago: number | string): string {
  return `${formaPagamentoId ?? "-"}|${paraCentavos(totalPago)}`;
}

// R-177 (#152): a venda veio da integracao? Leitura minima e proposital — nao entra no
// `VendaDetalheDto`, porque `integracao_chave_id` e id interno e a tela nao precisa dele.
export async function vendaEhIntegradaRepository(vendaId: string, db: ExecutorBanco = banco): Promise<boolean> {
  const [linha] = await db
    .select({ integracaoChaveId: vendas.integracaoChaveId })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1);
  return Boolean(linha?.integracaoChaveId);
}

export async function atualizarVendaRepository(
  vendaId: string,
  dados: VendaPayload,
  computar: boolean,
  db?: ExecutorBanco,
  // Venda integrada: os pagamentos ficam como estao, com o snapshot de roteamento intacto.
  opcoes: { preservarPagamentos?: boolean } = {}
): Promise<void> {
  const preservarPagamentos = opcoes.preservarPagamentos ?? false;
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(vendas)
      .set({
        ...valoresBaseEdicao(dados, computar),
        // Venda fora da R-127 (ver a nota no insert): descricao NOT NULL, gerada pela integracao.
        descricao: dados.descricao,
        pdvId: dados.pdvId ?? null,
        colaboradorId: dados.colaboradorId ?? null
      })
      .where(eq(vendas.id, vendaId));

    await tx.delete(vendasProdutos).where(eq(vendasProdutos.vendaId, vendaId));
    // #152 — P0: em venda INTEGRADA os pagamentos ficam INTOCADOS.
    //
    // O delete+insert fazia as linhas renascerem no DEFAULT (`nao_aplicavel`, contas nulas): o credito
    // sumia do saldo e a venda passava a ser lida como historica, entao nenhum reenvio do CREARE a
    // rotearia de novo. Perda permanente e silenciosa, disparada por um PUT que a R-177 PERMITE.
    //
    // Quem chama com `preservarPagamentos` ja provou, sob a trava, que os pagamentos do payload sao
    // identicos aos gravados (R-177). Nao ha o que reescrever.
    if (!preservarPagamentos) {
      await tx.delete(vendasPagamentos).where(eq(vendasPagamentos.vendaId, vendaId));
    }

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
    if (!preservarPagamentos) {
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
    }
  });
}
