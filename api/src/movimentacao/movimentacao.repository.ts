import { and, eq, inArray, type SQL } from "drizzle-orm";
import {
  colaboradores,
  contas,
  fornecedores,
  formasPagamento,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  lacresMalotes,
  malotes,
  pdvs,
  produtos,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { debitosColaboradores } from "@padaria/db/schema/caixa";
import {
  despesas,
  despesasItens,
  mercadorias,
  mercadoriasItens,
  retiradas,
  transferencias
} from "@padaria/db/schema/movimentacao";
import { vendas, vendasItens, vendasTipoPagamento } from "@padaria/db/schema/venda";
import type { MovimentacaoPayload, MovimentacaoQuery, MovimentoDto, TipoMovimentacao } from "@padaria/shared/movimentacao";
import { banco } from "../banco/conexao.js";

type LacreLinha = {
  status: string;
};

type MovimentoCompatRow = Omit<MovimentoDto, "tipo">;

async function existeContaNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: contas.id })
    .from(contas)
    .where(and(eq(contas.id, id), eq(contas.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeFornecedorNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: fornecedores.id })
    .from(fornecedores)
    .where(and(eq(fornecedores.id, id), eq(fornecedores.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeColaboradorNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(and(eq(colaboradores.id, id), eq(colaboradores.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existePdvNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: pdvs.id })
    .from(pdvs)
    .where(and(eq(pdvs.id, id), eq(pdvs.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeFormaPagamentoNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: formasPagamento.id })
    .from(formasPagamento)
    .where(and(eq(formasPagamento.id, id), eq(formasPagamento.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeGrupoDespesaNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: gruposDespesas.id })
    .from(gruposDespesas)
    .where(and(eq(gruposDespesas.id, id), eq(gruposDespesas.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeGrupoMercadoriaNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: gruposMercadorias.id })
    .from(gruposMercadorias)
    .where(and(eq(gruposMercadorias.id, id), eq(gruposMercadorias.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeGrupoRetiradaNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: gruposRetiradas.id })
    .from(gruposRetiradas)
    .where(and(eq(gruposRetiradas.id, id), eq(gruposRetiradas.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeMaloteNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: malotes.id })
    .from(malotes)
    .where(and(eq(malotes.id, id), eq(malotes.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeLacreNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: lacresMalotes.id })
    .from(lacresMalotes)
    .where(and(eq(lacresMalotes.id, id), eq(lacresMalotes.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeProdutoNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.id, id), eq(produtos.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

async function existeUnidadeNaEmpresa(id: string, empresaId: string) {
  const [linha] = await banco
    .select({ id: unidadesMedida.id })
    .from(unidadesMedida)
    .where(and(eq(unidadesMedida.id, id), eq(unidadesMedida.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

function filtrosEmpresa<T extends { empresaId: unknown }>(
  tabela: T,
  query: MovimentacaoQuery,
  empresasPermitidasIds: string[] | null
): SQL[] {
  const filtros: SQL[] = [];
  if (query.empresaId) filtros.push(eq(tabela.empresaId as never, query.empresaId));
  else if (empresasPermitidasIds !== null) filtros.push(inArray(tabela.empresaId as never, empresasPermitidasIds));
  return filtros;
}

function withTipo(tipo: TipoMovimentacao, rows: MovimentoCompatRow[]): MovimentoDto[] {
  return rows.map((row) => ({ ...row, tipo }));
}

async function listarVendas(query: MovimentacaoQuery, empresasPermitidasIds: string[] | null) {
  const filtros = filtrosEmpresa(vendas, query, empresasPermitidasIds);
  const rows = await banco
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
  return withTipo("entrada", rows);
}

async function listarDespesas(query: MovimentacaoQuery, empresasPermitidasIds: string[] | null) {
  const filtros = filtrosEmpresa(despesas, query, empresasPermitidasIds);
  const rows = await banco
    .select({
      id: despesas.id,
      empresaId: despesas.empresaId,
      dataReferencia: despesas.dataReferencia,
      descricao: despesas.descricao,
      valorOriginal: despesas.valorOriginal,
      computar: despesas.computar,
      status: despesas.status
    })
    .from(despesas)
    .where(filtros.length ? and(...filtros) : undefined);
  return withTipo("despesa", rows);
}

async function listarMercadorias(query: MovimentacaoQuery, empresasPermitidasIds: string[] | null) {
  const filtros = filtrosEmpresa(mercadorias, query, empresasPermitidasIds);
  const rows = await banco
    .select({
      id: mercadorias.id,
      empresaId: mercadorias.empresaId,
      dataReferencia: mercadorias.dataReferencia,
      descricao: mercadorias.descricao,
      valorOriginal: mercadorias.valorOriginal,
      computar: mercadorias.computar,
      status: mercadorias.status
    })
    .from(mercadorias)
    .where(filtros.length ? and(...filtros) : undefined);
  return withTipo("mercadoria", rows);
}

async function listarRetiradas(query: MovimentacaoQuery, empresasPermitidasIds: string[] | null) {
  const filtros = filtrosEmpresa(retiradas, query, empresasPermitidasIds);
  const rows = await banco
    .select({
      id: retiradas.id,
      empresaId: retiradas.empresaId,
      dataReferencia: retiradas.dataReferencia,
      descricao: retiradas.descricao,
      valorOriginal: retiradas.valorOriginal,
      computar: retiradas.computar,
      status: retiradas.status
    })
    .from(retiradas)
    .where(filtros.length ? and(...filtros) : undefined);
  return withTipo("retirada", rows);
}

async function listarTransferencias(query: MovimentacaoQuery, empresasPermitidasIds: string[] | null) {
  const filtros = filtrosEmpresa(transferencias, query, empresasPermitidasIds);
  const rows = await banco
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      dataReferencia: transferencias.dataReferencia,
      descricao: transferencias.descricao,
      valorOriginal: transferencias.valorOriginal,
      computar: transferencias.computar,
      status: transferencias.status
    })
    .from(transferencias)
    .where(filtros.length ? and(...filtros) : undefined);
  return withTipo("transferencia", rows);
}

export async function listarMovimentacoesFinanceiras(
  query: MovimentacaoQuery,
  empresasPermitidasIds: string[] | null
): Promise<MovimentoDto[]> {
  const consultas: Array<Promise<MovimentoDto[]>> = [];
  if (!query.tipo || query.tipo === "entrada") consultas.push(listarVendas(query, empresasPermitidasIds));
  if (!query.tipo || query.tipo === "despesa") consultas.push(listarDespesas(query, empresasPermitidasIds));
  if (!query.tipo || query.tipo === "mercadoria") consultas.push(listarMercadorias(query, empresasPermitidasIds));
  if (!query.tipo || query.tipo === "retirada") consultas.push(listarRetiradas(query, empresasPermitidasIds));
  if (!query.tipo || query.tipo === "transferencia") consultas.push(listarTransferencias(query, empresasPermitidasIds));

  return (await Promise.all(consultas))
    .flat()
    .sort((a, b) => b.dataReferencia.localeCompare(a.dataReferencia))
    .slice(0, 200);
}

export async function obterLacrePorId(lacreId: string): Promise<LacreLinha | null> {
  const [lacre] = await banco
    .select({ status: lacresMalotes.status })
    .from(lacresMalotes)
    .where(eq(lacresMalotes.id, lacreId))
    .limit(1);

  return lacre ?? null;
}

export async function validarReferenciasMovimentacaoEmpresa(dados: MovimentacaoPayload): Promise<string | null> {
  const empresaId = dados.empresaId;
  if (dados.contaOrigemId && !(await existeContaNaEmpresa(dados.contaOrigemId, empresaId))) return "Conta de origem";
  if (dados.contaDestinoId && !(await existeContaNaEmpresa(dados.contaDestinoId, empresaId))) return "Conta de destino";
  if (dados.fornecedorId && !(await existeFornecedorNaEmpresa(dados.fornecedorId, empresaId))) return "Fornecedor";
  if (dados.colaboradorId && !(await existeColaboradorNaEmpresa(dados.colaboradorId, empresaId))) return "Colaborador";
  if (dados.pdvId && !(await existePdvNaEmpresa(dados.pdvId, empresaId))) return "PDV";
  if (dados.grupoDespesaId && !(await existeGrupoDespesaNaEmpresa(dados.grupoDespesaId, empresaId)))
    return "Grupo de despesa";
  if (dados.grupoMercadoriaId && !(await existeGrupoMercadoriaNaEmpresa(dados.grupoMercadoriaId, empresaId)))
    return "Grupo de mercadoria";
  if (dados.grupoRetiradaId && !(await existeGrupoRetiradaNaEmpresa(dados.grupoRetiradaId, empresaId)))
    return "Grupo de retirada";
  if (dados.maloteId && !(await existeMaloteNaEmpresa(dados.maloteId, empresaId))) return "Malote";
  if (dados.lacreMaloteId && !(await existeLacreNaEmpresa(dados.lacreMaloteId, empresaId))) return "Lacre";

  const gruposDespesa = [...new Set(dados.itensDespesa.map((item) => item.grupoDespesaId).filter(Boolean))];
  for (const grupoId of gruposDespesa) {
    if (grupoId && !(await existeGrupoDespesaNaEmpresa(grupoId, empresaId))) return "Grupo de despesa";
  }

  const colaboradoresItensDespesa = [...new Set(dados.itensDespesa.map((item) => item.colaboradorId).filter(Boolean))];
  for (const colaboradorId of colaboradoresItensDespesa) {
    if (colaboradorId && !(await existeColaboradorNaEmpresa(colaboradorId, empresaId))) return "Colaborador";
  }

  const gruposMercadoria = [...new Set(dados.itensMercadoria.map((item) => item.grupoMercadoriaId).filter(Boolean))];
  for (const grupoId of gruposMercadoria) {
    if (grupoId && !(await existeGrupoMercadoriaNaEmpresa(grupoId, empresaId))) return "Grupo de mercadoria";
  }

  const produtosIds = [
    ...new Set([
      ...dados.itensMercadoria.map((item) => item.produtoId).filter(Boolean),
      ...dados.itensVenda.map((item) => item.produtoId).filter(Boolean)
    ])
  ];
  for (const produtoId of produtosIds) {
    if (produtoId && !(await existeProdutoNaEmpresa(produtoId, empresaId))) return "Produto";
  }

  const unidadesIds = [...new Set(dados.itensMercadoria.map((item) => item.unidadeMedidaId).filter(Boolean))];
  for (const unidadeId of unidadesIds) {
    if (unidadeId && !(await existeUnidadeNaEmpresa(unidadeId, empresaId))) return "Unidade de medida";
  }

  const formasPagamentoIds = [...new Set(dados.tiposPagamento.map((item) => item.formaPagamentoId).filter(Boolean))];
  for (const formaPagamentoId of formasPagamentoIds) {
    if (formaPagamentoId && !(await existeFormaPagamentoNaEmpresa(formaPagamentoId, empresaId)))
      return "Forma de pagamento";
  }

  return null;
}

export async function marcarLacreComoUsado(lacreId: string): Promise<void> {
  await banco.update(lacresMalotes).set({ status: "usado", usadoEm: new Date() }).where(eq(lacresMalotes.id, lacreId));
}

function valoresBase(dados: MovimentacaoPayload, computar: boolean, criadoPor: string, caixaId?: string | null) {
  return {
    empresaId: dados.empresaId,
    caixaId: caixaId ?? null,
    dataReferencia: dados.dataReferencia,
    dataPagamento: dados.dataPagamento ?? null,
    descricao: dados.descricao,
    observacao: dados.observacao ?? null,
    valorOriginal: String(dados.valorOriginal),
    valorAcrescimo: String(dados.valorAcrescimo),
    descricaoAcrescimo: dados.descricaoAcrescimo ?? null,
    valorDesconto: String(dados.valorDesconto),
    descricaoDesconto: dados.descricaoDesconto ?? null,
    contaOrigemId: dados.contaOrigemId ?? null,
    computar,
    criadoPor
  };
}

export async function criarMovimentacaoFinanceira(
  dados: MovimentacaoPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null
): Promise<{ id: string }> {
  return banco.transaction(async (tx) => {
    if (dados.tipo === "entrada") {
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
        await tx.insert(vendasItens).values({
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
        await tx.insert(vendasTipoPagamento).values({
          vendaId: venda.id,
          formaPagamentoId: pagamento.formaPagamentoId ?? null,
          tipoPagamentoAutomacaoId: pagamento.tipoPagamentoAutomacaoId ?? null,
          tipoPagamentoAutomacao: pagamento.tipoPagamentoAutomacao ?? null,
          numeroVendas: pagamento.numeroVendas,
          totalPago: String(pagamento.totalPago)
        });
      }

      return venda;
    }

    if (dados.tipo === "despesa") {
      const [despesa] = await tx
        .insert(despesas)
        .values({
          ...valoresBase(dados, computar, criadoPor, caixaId),
          dataVencimento: dados.dataVencimento ?? dados.dataReferencia,
          fornecedorId: dados.fornecedorId ?? null,
          colaboradorId: dados.colaboradorId ?? null,
          grupoDespesaId: dados.grupoDespesaId ?? null,
          fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
        })
        .returning({ id: despesas.id });
      if (!despesa) throw new Error("Despesa nao criada");

      for (const item of dados.itensDespesa) {
        await tx.insert(despesasItens).values({
          despesaId: despesa.id,
          grupoDespesaId: item.grupoDespesaId ?? dados.grupoDespesaId ?? null,
          colaboradorId: item.colaboradorId ?? dados.colaboradorId ?? null,
          descricao: item.descricao,
          valor: String(item.valor)
        });
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
    }

    if (dados.tipo === "mercadoria") {
      const [mercadoria] = await tx
        .insert(mercadorias)
        .values({
          ...valoresBase(dados, computar, criadoPor, caixaId),
          dataVencimento: dados.dataVencimento ?? dados.dataReferencia,
          fornecedorId: dados.fornecedorId ?? null,
          grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
          notaFiscalId: dados.notaFiscalId ?? null,
          temNotaFiscal: dados.temNotaFiscal,
          fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
        })
        .returning({ id: mercadorias.id });
      if (!mercadoria) throw new Error("Mercadoria nao criada");

      for (const item of dados.itensMercadoria) {
        await tx.insert(mercadoriasItens).values({
          mercadoriaId: mercadoria.id,
          produtoId: item.produtoId ?? null,
          grupoMercadoriaId: item.grupoMercadoriaId ?? dados.grupoMercadoriaId ?? null,
          unidadeMedidaId: item.unidadeMedidaId ?? null,
          descricao: item.descricao,
          quantidade: String(item.quantidade),
          valorUnitario: String(item.valorUnitario),
          valorTotal: String(item.valorTotal)
        });
      }

      return mercadoria;
    }

    if (dados.tipo === "retirada") {
      if (!dados.colaboradorId) throw new Error("Colaborador obrigatorio");
      const [retirada] = await tx
        .insert(retiradas)
        .values({
          ...valoresBase(dados, computar, criadoPor, caixaId),
          dataVencimento: dados.dataVencimento ?? dados.dataReferencia,
          grupoRetiradaId: dados.grupoRetiradaId ?? null,
          colaboradorId: dados.colaboradorId
        })
        .returning({ id: retiradas.id });
      if (!retirada) throw new Error("Retirada nao criada");

      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "RETIRADA",
        retiradaId: retirada.id,
        caixaId: caixaId ?? null,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });

      return retirada;
    }

    const [transferencia] = await tx
      .insert(transferencias)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId),
        contaOrigemId: dados.contaOrigemId ?? "",
        contaDestinoId: dados.contaDestinoId ?? "",
        maloteId: dados.maloteId ?? null,
        lacreMaloteId: dados.lacreMaloteId ?? null
      })
      .returning({ id: transferencias.id });
    if (!transferencia) throw new Error("Transferencia nao criada");
    return transferencia;
  });
}
