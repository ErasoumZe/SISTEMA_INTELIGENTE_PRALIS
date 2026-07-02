import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { VendaCriada, VendaDetalheDto, VendaDto, VendaPayload, VendasQuery } from "@padaria/shared/vendas";
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
  criarVendaRepository,
  listarVendasRepository
} from "./vendas.repository.js";
import { validarEdicaoNoCaixaAberto, validarReferenciasVenda } from "../lancamentos/lancamentos.dominio.js";

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

export async function criarVenda(dados: VendaPayload, perfil: PerfilUsuario): Promise<VendaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "entradas_criar");
  validarVenda(dados);
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const venda = await criarVendaRepository(dados, dados.computar, perfil.usuarioId, caixa.id, tx);
    return { id: venda.id, computar: dados.computar };
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
  return executarEmTransacao(async (tx) => {
    const existente = await buscarVendaDetalheRepository(vendaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx);
    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    await atualizarVendaRepository(vendaId, dados, dados.computar, tx);
    return { id: vendaId, computar: dados.computar };
  });
}
