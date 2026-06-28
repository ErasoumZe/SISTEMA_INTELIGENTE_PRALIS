import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import {
  colaboradores,
  contas,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  lacresMalotes,
  malotes,
  produtos,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { itensDespesas, itensMercadorias, movimentacoesFinanceiras } from "@padaria/db/schema/movimentacao";
import type { MovimentacaoPayload, MovimentacaoQuery, MovimentoDto } from "@padaria/shared/movimentacao";
import { banco } from "../banco/conexao.js";

type LacreLinha = {
  status: string;
};

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

export async function listarMovimentacoesFinanceiras(
  query: MovimentacaoQuery,
  empresasPermitidasIds: string[] | null
): Promise<MovimentoDto[]> {
  const filtros: SQL[] = [];
  if (query.empresaId) filtros.push(eq(movimentacoesFinanceiras.empresaId, query.empresaId));
  else if (empresasPermitidasIds !== null) {
    filtros.push(inArray(movimentacoesFinanceiras.empresaId, empresasPermitidasIds));
  }
  if (query.tipo) filtros.push(eq(movimentacoesFinanceiras.tipo, query.tipo));

  return banco
    .select({
      id: movimentacoesFinanceiras.id,
      empresaId: movimentacoesFinanceiras.empresaId,
      tipo: movimentacoesFinanceiras.tipo,
      dataReferencia: movimentacoesFinanceiras.dataReferencia,
      descricao: movimentacoesFinanceiras.descricao,
      valorOriginal: movimentacoesFinanceiras.valorOriginal,
      computar: movimentacoesFinanceiras.computar,
      status: movimentacoesFinanceiras.status
    })
    .from(movimentacoesFinanceiras)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(movimentacoesFinanceiras.dataReferencia), desc(movimentacoesFinanceiras.criadoEm))
    .limit(200);
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

  const gruposMercadoria = [...new Set(dados.itensMercadoria.map((item) => item.grupoMercadoriaId).filter(Boolean))];
  for (const grupoId of gruposMercadoria) {
    if (grupoId && !(await existeGrupoMercadoriaNaEmpresa(grupoId, empresaId))) return "Grupo de mercadoria";
  }

  const produtosIds = [...new Set(dados.itensMercadoria.map((item) => item.produtoId).filter(Boolean))];
  for (const produtoId of produtosIds) {
    if (produtoId && !(await existeProdutoNaEmpresa(produtoId, empresaId))) return "Produto";
  }

  const unidadesIds = [...new Set(dados.itensMercadoria.map((item) => item.unidadeMedidaId).filter(Boolean))];
  for (const unidadeId of unidadesIds) {
    if (unidadeId && !(await existeUnidadeNaEmpresa(unidadeId, empresaId))) return "Unidade de medida";
  }

  return null;
}

export async function marcarLacreComoUsado(lacreId: string): Promise<void> {
  await banco.update(lacresMalotes).set({ status: "usado", usadoEm: new Date() }).where(eq(lacresMalotes.id, lacreId));
}

export async function criarMovimentacaoFinanceira(
  dados: MovimentacaoPayload,
  computar: boolean,
  criadoPor: string
): Promise<{ id: string }> {
  return banco.transaction(async (tx) => {
    const [movimentacao] = await tx
      .insert(movimentacoesFinanceiras)
      .values({
        empresaId: dados.empresaId,
        tipo: dados.tipo,
        dataReferencia: dados.dataReferencia,
        dataVencimento: dados.dataVencimento ?? null,
        dataPagamento: dados.dataPagamento ?? null,
        descricao: dados.descricao,
        observacao: dados.observacao ?? null,
        valorOriginal: String(dados.valorOriginal),
        valorAcrescimo: String(dados.valorAcrescimo),
        descricaoAcrescimo: dados.descricaoAcrescimo ?? null,
        valorDesconto: String(dados.valorDesconto),
        descricaoDesconto: dados.descricaoDesconto ?? null,
        contaOrigemId: dados.contaOrigemId ?? null,
        contaDestinoId: dados.contaDestinoId ?? null,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
        grupoRetiradaId: dados.grupoRetiradaId ?? null,
        maloteId: dados.maloteId ?? null,
        lacreMaloteId: dados.lacreMaloteId ?? null,
        notaFiscalId: dados.notaFiscalId ?? null,
        temNotaFiscal: dados.temNotaFiscal,
        computar,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null,
        criadoPor
      })
      .returning({ id: movimentacoesFinanceiras.id });

    if (!movimentacao) throw new Error("Movimentacao nao criada");

    for (const item of dados.itensDespesa) {
      await tx.insert(itensDespesas).values({
        movimentacaoId: movimentacao.id,
        grupoDespesaId: item.grupoDespesaId ?? dados.grupoDespesaId ?? null,
        descricao: item.descricao,
        valor: String(item.valor)
      });
    }

    for (const item of dados.itensMercadoria) {
      await tx.insert(itensMercadorias).values({
        movimentacaoId: movimentacao.id,
        produtoId: item.produtoId ?? null,
        grupoMercadoriaId: item.grupoMercadoriaId ?? dados.grupoMercadoriaId ?? null,
        unidadeMedidaId: item.unidadeMedidaId ?? null,
        descricao: item.descricao,
        quantidade: String(item.quantidade),
        valorUnitario: String(item.valorUnitario),
        valorTotal: String(item.valorTotal)
      });
    }

    return movimentacao;
  });
}
