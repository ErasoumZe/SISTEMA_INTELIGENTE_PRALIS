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
import type { DespesaPayload } from "@padaria/shared/despesas";
import type { MercadoriaPayload } from "@padaria/shared/mercadorias";
import type { RetiradaPayload } from "@padaria/shared/retiradas";
import type { TransferenciaPayload } from "@padaria/shared/transferencias";
import type { VendaPayload } from "@padaria/shared/vendas";
import { banco } from "../banco/conexao.js";

type QueryEmpresa = { empresaId?: string | undefined };
type BasePayload = {
  empresaId: string;
  dataReferencia: string;
  dataPagamento?: string | null | undefined;
  descricao: string;
  observacao?: string | null | undefined;
  valorOriginal: number;
  valorAcrescimo: number;
  descricaoAcrescimo?: string | null | undefined;
  valorDesconto: number;
  descricaoDesconto?: string | null | undefined;
  contaOrigemId?: string | null | undefined;
};

async function existeNaEmpresa<Tabela extends { id: unknown; empresaId: unknown }>(
  tabela: Tabela,
  id: string,
  empresaId: string
) {
  const [linha] = await banco
    .select({ id: tabela.id as never })
    .from(tabela as never)
    .where(and(eq(tabela.id as never, id), eq(tabela.empresaId as never, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export function filtrosEmpresa<T extends { empresaId: unknown }>(
  tabela: T,
  query: QueryEmpresa,
  empresasPermitidasIds: string[] | null
): SQL[] {
  const filtros: SQL[] = [];
  if (query.empresaId) filtros.push(eq(tabela.empresaId as never, query.empresaId));
  else if (empresasPermitidasIds !== null) filtros.push(inArray(tabela.empresaId as never, empresasPermitidasIds));
  return filtros;
}

export function valoresBase(dados: BasePayload, computar: boolean, criadoPor: string, caixaId?: string | null) {
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

export async function obterLacrePorId(lacreId: string): Promise<{ status: string } | null> {
  const [lacre] = await banco
    .select({ status: lacresMalotes.status })
    .from(lacresMalotes)
    .where(eq(lacresMalotes.id, lacreId))
    .limit(1);

  return lacre ?? null;
}

export async function marcarLacreComoUsado(lacreId: string): Promise<void> {
  await banco.update(lacresMalotes).set({ status: "usado", usadoEm: new Date() }).where(eq(lacresMalotes.id, lacreId));
}

async function validarConta(dados: { empresaId: string; contaOrigemId?: string | null | undefined }) {
  if (dados.contaOrigemId && !(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId))) {
    return "Conta de origem";
  }
  return null;
}

export async function validarReferenciasVenda(dados: VendaPayload): Promise<string | null> {
  const conta = await validarConta(dados);
  if (conta) return conta;
  if (dados.pdvId && !(await existeNaEmpresa(pdvs, dados.pdvId, dados.empresaId))) return "PDV";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId)))
    return "Colaborador";

  const produtosIds = [...new Set(dados.itensVenda.map((item) => item.produtoId).filter(Boolean))];
  for (const produtoId of produtosIds) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId))) return "Produto";
  }

  const formasPagamentoIds = [...new Set(dados.tiposPagamento.map((item) => item.formaPagamentoId).filter(Boolean))];
  for (const formaPagamentoId of formasPagamentoIds) {
    if (formaPagamentoId && !(await existeNaEmpresa(formasPagamento, formaPagamentoId, dados.empresaId))) {
      return "Forma de pagamento";
    }
  }

  return null;
}

export async function validarReferenciasDespesa(dados: DespesaPayload): Promise<string | null> {
  const conta = await validarConta(dados);
  if (conta) return conta;
  if (dados.fornecedorId && !(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId)))
    return "Fornecedor";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId)))
    return "Colaborador";
  if (dados.grupoDespesaId && !(await existeNaEmpresa(gruposDespesas, dados.grupoDespesaId, dados.empresaId))) {
    return "Grupo de despesa";
  }

  for (const grupoId of [...new Set(dados.itensDespesa.map((item) => item.grupoDespesaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposDespesas, grupoId, dados.empresaId))) return "Grupo de despesa";
  }

  for (const colaboradorId of [...new Set(dados.itensDespesa.map((item) => item.colaboradorId).filter(Boolean))]) {
    if (colaboradorId && !(await existeNaEmpresa(colaboradores, colaboradorId, dados.empresaId))) return "Colaborador";
  }

  return null;
}

export async function validarReferenciasMercadoria(dados: MercadoriaPayload): Promise<string | null> {
  const conta = await validarConta(dados);
  if (conta) return conta;
  if (!(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId))) return "Fornecedor";
  if (dados.grupoMercadoriaId && !(await existeNaEmpresa(gruposMercadorias, dados.grupoMercadoriaId, dados.empresaId))) {
    return "Grupo de mercadoria";
  }

  for (const grupoId of [...new Set(dados.itensMercadoria.map((item) => item.grupoMercadoriaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposMercadorias, grupoId, dados.empresaId))) return "Grupo de mercadoria";
  }

  for (const produtoId of [...new Set(dados.itensMercadoria.map((item) => item.produtoId).filter(Boolean))]) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId))) return "Produto";
  }

  for (const unidadeId of [...new Set(dados.itensMercadoria.map((item) => item.unidadeMedidaId).filter(Boolean))]) {
    if (unidadeId && !(await existeNaEmpresa(unidadesMedida, unidadeId, dados.empresaId))) return "Unidade de medida";
  }

  return null;
}

export async function validarReferenciasRetirada(dados: RetiradaPayload): Promise<string | null> {
  const conta = await validarConta(dados);
  if (conta) return conta;
  if (!(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId))) return "Colaborador";
  if (dados.grupoRetiradaId && !(await existeNaEmpresa(gruposRetiradas, dados.grupoRetiradaId, dados.empresaId))) {
    return "Grupo de retirada";
  }
  return null;
}

export async function validarReferenciasTransferencia(dados: TransferenciaPayload): Promise<string | null> {
  if (!(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId))) return "Conta de origem";
  if (!(await existeNaEmpresa(contas, dados.contaDestinoId, dados.empresaId))) return "Conta de destino";
  if (dados.maloteId && !(await existeNaEmpresa(malotes, dados.maloteId, dados.empresaId))) return "Malote";
  if (dados.lacreMaloteId && !(await existeNaEmpresa(lacresMalotes, dados.lacreMaloteId, dados.empresaId))) {
    return "Lacre";
  }
  return null;
}
