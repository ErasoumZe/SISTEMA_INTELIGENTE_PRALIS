import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  MovimentacaoCriada,
  MovimentacaoPayload,
  MovimentacaoQuery,
  MovimentoDto
} from "@padaria/shared/movimentacao";
import { deveComputarMercadoria, permissaoPorTipoMovimentacao } from "../regras.js";
import {
  criarMovimentacaoFinanceira,
  listarMovimentacoesFinanceiras,
  marcarLacreComoUsado,
  obterLacrePorId,
  validarReferenciasMovimentacaoEmpresa
} from "./movimentacao.repository.js";

export class PermissaoMovimentacaoInsuficienteError extends Error {
  constructor(readonly permissao: string) {
    super("Permissao insuficiente");
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function validarMovimentacaoFinanceira(dados: MovimentacaoPayload): void {
  if (dados.tipo !== "transferencia" && !dados.dataVencimento) {
    throw new Error("Data de vencimento obrigatoria");
  }

  if (dados.tipo === "transferencia") {
    if (!dados.contaOrigemId) throw new Error("Conta de origem obrigatoria");
    if (!dados.contaDestinoId) throw new Error("Conta de destino obrigatoria");
    if (dados.contaOrigemId === dados.contaDestinoId) throw new Error("Conta de destino deve ser diferente da origem");
  }

  if (dados.tipo === "despesa") {
    if (!dados.grupoDespesaId && !dados.itensDespesa.length) throw new Error("Grupo ou itens da despesa obrigatorios");
    if (dados.itensDespesa.length) {
      const soma = arredondar(dados.itensDespesa.reduce((total, item) => total + item.valor, 0));
      if (soma !== arredondar(dados.valorOriginal)) {
        throw new Error("Soma dos itens da despesa deve bater com o valor original");
      }
    }
  }

  if (dados.tipo === "mercadoria") {
    if (!dados.fornecedorId) throw new Error("Fornecedor obrigatorio");
    if (!dados.grupoMercadoriaId && !dados.itensMercadoria.length) {
      throw new Error("Grupo ou itens de mercadoria obrigatorios");
    }
    if (dados.itensMercadoria.length) {
      const soma = arredondar(dados.itensMercadoria.reduce((total, item) => total + item.valorTotal, 0));
      if (soma !== arredondar(dados.valorOriginal)) {
        throw new Error("Soma das mercadorias deve bater com o valor original");
      }
    }
  }
}

async function usarLacreSeInformado(lacreId: string | null | undefined): Promise<void> {
  if (!lacreId) return;

  const lacre = await obterLacrePorId(lacreId);
  if (!lacre) throw new Error("Lacre inexistente");
  if (lacre.status !== "disponivel") throw new Error("Lacre indisponivel");

  await marcarLacreComoUsado(lacreId);
}

export async function listarMovimentacoes(
  query: MovimentacaoQuery,
  empresasPermitidasIds: string[] | null
): Promise<MovimentoDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarMovimentacoesFinanceiras(query, empresasPermitidasIds);
}

export async function criarMovimentacao(
  dados: MovimentacaoPayload,
  perfil: PerfilUsuario
): Promise<MovimentacaoCriada> {
  const permissao = permissaoPorTipoMovimentacao[dados.tipo];
  if (!perfil.permissoes.includes(permissao)) {
    throw new PermissaoMovimentacaoInsuficienteError(permissao);
  }

  validarMovimentacaoFinanceira(dados);
  const referenciaInvalida = await validarReferenciasMovimentacaoEmpresa(dados);
  if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
  await usarLacreSeInformado(dados.lacreMaloteId);

  const computar =
    dados.tipo === "mercadoria" ? deveComputarMercadoria(dados.temNotaFiscal, dados.computar) : dados.computar;
  const movimentacao = await criarMovimentacaoFinanceira(dados, computar, perfil.usuarioId);

  return { id: movimentacao.id, computar };
}
