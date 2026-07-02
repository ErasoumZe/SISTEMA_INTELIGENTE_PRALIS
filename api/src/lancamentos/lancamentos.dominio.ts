import type { DadosExternos } from "@padaria/shared/api";
import { temPermissao, type Permissao, type PerfilUsuario } from "@padaria/shared";
import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { obterCaixaAbertoParaLancamento } from "../caixa/caixa.service.js";
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
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type QueryEmpresa = { empresaId?: string | undefined };
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

async function existeNaEmpresa<Tabela extends { id: DadosExternos; empresaId: DadosExternos }>(
  tabela: Tabela,
  id: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: tabela.id as never })
    .from(tabela as never)
    .where(and(eq(tabela.id as never, id), eq(tabela.empresaId as never, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export function filtrosEmpresa<T extends { empresaId: DadosExternos }>(
  tabela: T,
  query: QueryEmpresa,
  empresasPermitidasIds: string[] | null
): SQL[] {
  const filtros: SQL[] = [];
  if (query.empresaId) filtros.push(eq(tabela.empresaId as never, query.empresaId));
  else if (empresasPermitidasIds !== null) filtros.push(inArray(tabela.empresaId as never, empresasPermitidasIds));
  return filtros;
}

// Campos editaveis comuns aos lancamentos. Na edicao, empresa, caixa e criadoPor NUNCA mudam.
export function valoresBaseEdicao(dados: BasePayload, computar: boolean) {
  return {
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
    computar
  };
}

export function valoresBase(dados: BasePayload, computar: boolean, criadoPor: string, caixaId?: string | null) {
  return {
    empresaId: dados.empresaId,
    caixaId: caixaId ?? null,
    criadoPor,
    ...valoresBaseEdicao(dados, computar)
  };
}

// Converte o decimal do banco (string) para o numero em reais do contrato wire.
export function numeroDecimal(valor: string | number | null | undefined): number {
  return deCentavos(paraCentavos(valor));
}

// Regras de edicao de lancamento: o registro precisa existir na empresa acessivel,
// nao pode trocar de empresa e precisa pertencer ao caixa aberto do usuario.
export async function validarEdicaoNoCaixaAberto(
  existente: { empresaId: string; caixaId: string | null } | null,
  dados: { empresaId: string },
  perfil: PerfilUsuario,
  tx?: ExecutorBanco
) {
  if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
  if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
  if (existente.caixaId !== caixa.id) throw new Error("Lancamento nao pertence ao seu caixa aberto");
  return caixa;
}

export async function obterLacrePorId(lacreId: string, db: ExecutorBanco = banco): Promise<{ status: string } | null> {
  const [lacre] = await db
    .select({ status: lacresMalotes.status })
    .from(lacresMalotes)
    .where(eq(lacresMalotes.id, lacreId))
    .limit(1);

  return lacre ?? null;
}

export async function marcarLacreComoUsado(lacreId: string, db: ExecutorBanco = banco): Promise<void> {
  await db.update(lacresMalotes).set({ status: "usado", usadoEm: new Date() }).where(eq(lacresMalotes.id, lacreId));
}

async function validarConta(
  dados: { empresaId: string; contaOrigemId?: string | null | undefined },
  db: ExecutorBanco = banco
) {
  if (dados.contaOrigemId && !(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId, db))) {
    return "Conta de origem";
  }
  return null;
}

export async function validarReferenciasVenda(dados: VendaPayload, db: ExecutorBanco = banco): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (dados.pdvId && !(await existeNaEmpresa(pdvs, dados.pdvId, dados.empresaId, db))) return "PDV";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db)))
    return "Colaborador";

  const produtosIds = [...new Set(dados.itensVenda.map((item) => item.produtoId).filter(Boolean))];
  for (const produtoId of produtosIds) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId, db))) return "Produto";
  }

  const formasPagamentoIds = [...new Set(dados.tiposPagamento.map((item) => item.formaPagamentoId).filter(Boolean))];
  for (const formaPagamentoId of formasPagamentoIds) {
    if (formaPagamentoId && !(await existeNaEmpresa(formasPagamento, formaPagamentoId, dados.empresaId, db))) {
      return "Forma de pagamento";
    }
  }

  return null;
}

export async function validarReferenciasDespesa(
  dados: DespesaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (dados.fornecedorId && !(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db)))
    return "Fornecedor";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db)))
    return "Colaborador";
  if (dados.grupoDespesaId && !(await existeNaEmpresa(gruposDespesas, dados.grupoDespesaId, dados.empresaId, db))) {
    return "Grupo de despesa";
  }

  for (const grupoId of [...new Set(dados.itensDespesa.map((item) => item.grupoDespesaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposDespesas, grupoId, dados.empresaId, db))) return "Grupo de despesa";
  }

  for (const colaboradorId of [...new Set(dados.itensDespesa.map((item) => item.colaboradorId).filter(Boolean))]) {
    if (colaboradorId && !(await existeNaEmpresa(colaboradores, colaboradorId, dados.empresaId, db)))
      return "Colaborador";
  }

  return null;
}

export async function validarReferenciasMercadoria(
  dados: MercadoriaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (!(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db))) return "Fornecedor";
  if (
    dados.grupoMercadoriaId &&
    !(await existeNaEmpresa(gruposMercadorias, dados.grupoMercadoriaId, dados.empresaId, db))
  ) {
    return "Grupo de mercadoria";
  }

  for (const grupoId of [...new Set(dados.itensMercadoria.map((item) => item.grupoMercadoriaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposMercadorias, grupoId, dados.empresaId, db)))
      return "Grupo de mercadoria";
  }

  for (const produtoId of [...new Set(dados.itensMercadoria.map((item) => item.produtoId).filter(Boolean))]) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId, db))) return "Produto";
  }

  for (const unidadeId of [...new Set(dados.itensMercadoria.map((item) => item.unidadeMedidaId).filter(Boolean))]) {
    if (unidadeId && !(await existeNaEmpresa(unidadesMedida, unidadeId, dados.empresaId, db)))
      return "Unidade de medida";
  }

  return null;
}

export async function validarReferenciasRetirada(
  dados: RetiradaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (!(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db))) return "Colaborador";
  if (dados.grupoRetiradaId && !(await existeNaEmpresa(gruposRetiradas, dados.grupoRetiradaId, dados.empresaId, db))) {
    return "Grupo de retirada";
  }
  return null;
}

export async function validarReferenciasTransferencia(
  dados: TransferenciaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  if (!(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId, db))) return "Conta de origem";
  if (!(await existeNaEmpresa(contas, dados.contaDestinoId, dados.empresaId, db))) return "Conta de destino";
  if (dados.maloteId && !(await existeNaEmpresa(malotes, dados.maloteId, dados.empresaId, db))) return "Malote";
  if (dados.lacreMaloteId && !(await existeNaEmpresa(lacresMalotes, dados.lacreMaloteId, dados.empresaId, db))) {
    return "Lacre";
  }
  return null;
}

export class PermissaoLancamentoInsuficienteError extends Error {
  constructor(readonly permissao: Permissao) {
    super("Permissao insuficiente");
  }
}

export function exigirPermissaoLancamento(permissoes: readonly Permissao[], permissao: Permissao) {
  if (!temPermissao(permissoes, permissao)) throw new PermissaoLancamentoInsuficienteError(permissao);
}

// Confere soma de itens contra o total em centavos inteiros (sem float).
// Cada valor e convertido individualmente, espelhando como cada linha e gravada no banco.
export function somaConfereCentavos(valores: number[], total: number): boolean {
  const soma = valores.reduce((acumulado, valor) => acumulado + paraCentavos(valor), 0);
  return soma === paraCentavos(total);
}

export async function usarLacreSeInformado(
  lacreId: string | null | undefined,
  db: ExecutorBanco = banco
): Promise<void> {
  if (!lacreId) return;

  const lacre = await obterLacrePorId(lacreId, db);
  if (!lacre) throw new Error("Lacre inexistente");
  if (lacre.status !== "disponivel") throw new Error("Lacre indisponivel");

  await marcarLacreComoUsado(lacreId, db);
}

export async function obterCaixaParaLancamento(empresaId: string, usuarioId: string, db?: ExecutorBanco) {
  return obterCaixaAbertoParaLancamento(empresaId, usuarioId, db);
}
