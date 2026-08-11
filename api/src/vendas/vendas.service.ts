import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  TotaisVendas,
  VendaCriada,
  VendaDetalheDto,
  VendaDto,
  VendaPayload,
  VendasQuery
} from "@padaria/shared/vendas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarVendaRepository,
  buscarVendaDetalheRepository,
  travarVendaRepository,
  criarVendaRepository,
  listarVendasRepository,
  totaisVendasRepository
} from "./vendas.repository.js";
import {
  resolverComputarLancamento,
  resolverDataPagamentoLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasVenda
} from "../lancamentos/lancamentos.dominio.js";

export function validarVenda(dados: VendaPayload): void {
  if (dados.itensVenda.length) {
    const valores = dados.itensVenda.map((item) => item.valorTotal);
    if (!somaConfereCentavos(valores, dados.valorOriginal)) {
      throw new Error("Soma dos itens da venda deve bater com o valor original");
    }
  }
  if (dados.tiposPagamento.length) {
    const valores = dados.tiposPagamento.map((item) => item.totalPago);
    if (!somaConfereCentavos(valores, dados.valorOriginal)) {
      throw new Error("Soma dos pagamentos da venda deve bater com o valor original");
    }
  }
}

export async function listarVendas(query: VendasQuery, empresasPermitidasIds: string[] | null): Promise<VendaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarVendasRepository(query, empresasPermitidasIds);
}

export async function totaisVendas(query: VendasQuery, empresasPermitidasIds: string[] | null): Promise<TotaisVendas> {
  if (empresasPermitidasIds?.length === 0) return { totalGeral: 0, quantidade: 0, porFormaPagamento: [] };
  return totaisVendasRepository(query, empresasPermitidasIds);
}

export async function criarVenda(dados: VendaPayload, perfil: PerfilUsuario): Promise<VendaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "entradas_criar");
  validarVenda(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const venda = await criarVendaRepository(normalizados, computar, perfil.usuarioId, caixa.id, tx);
    return { id: venda.id, computar };
  });
}

export async function obterVenda(vendaId: string, perfil: PerfilUsuario): Promise<VendaDetalheDto> {
  const venda = await buscarVendaDetalheRepository(vendaId);
  if (!venda || !podeAcessarEmpresa(perfil, venda.empresaId)) throw new Error("Registro nao encontrado");
  return venda;
}

export async function atualizarVenda(
  vendaId: string,
  dados: VendaPayload,
  perfil: PerfilUsuario
): Promise<VendaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "entradas_editar");
  validarVenda(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    // Leitura sem lock so para o 404/empresa vir antes dos erros de caixa, como sempre foi.
    const previa = await buscarVendaDetalheRepository(vendaId, tx);
    // P0 — ordem unica: caixa (FOR SHARE, dentro da validacao) ANTES da linha da venda.
    const caixa = await validarEdicaoNoCaixaAberto(previa, dados, perfil, tx);
    if (!(await travarVendaRepository(vendaId, dados.empresaId, tx))) throw new Error("Registro nao encontrado");
    // Retrato SOB a trava: a venda integrada pode ter mudado de caixa entre a leitura e o lock
    // (revinculacao/CREARE) — revalida contra o que esta gravado agora, sem retomar o lock do caixa.
    const existente = await buscarVendaDetalheRepository(vendaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx, caixa);
    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    await atualizarVendaRepository(vendaId, normalizados, computar, tx);
    return { id: vendaId, computar };
  });
}
