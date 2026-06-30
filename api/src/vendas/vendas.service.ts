import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { VendaCriada, VendaDto, VendaPayload, VendasQuery } from "@padaria/shared/vendas";
import { executarEmTransacao } from "../banco/conexao.js";
import { arredondar, exigirPermissaoLancamento, obterCaixaParaLancamento } from "../lancamentos/lancamentos.dominio.js";
import { criarVendaRepository, listarVendasRepository } from "./vendas.repository.js";
import { validarReferenciasVenda } from "../lancamentos/lancamentos.dominio.js";

export function validarVenda(dados: VendaPayload): void {
  if (dados.itensVenda.length) {
    const soma = arredondar(dados.itensVenda.reduce((total, item) => total + item.valorTotal, 0));
    if (soma !== arredondar(dados.valorOriginal)) {
      throw new Error("Soma dos itens da venda deve bater com o valor original");
    }
  }
  if (dados.tiposPagamento.length) {
    const soma = arredondar(dados.tiposPagamento.reduce((total, item) => total + item.totalPago, 0));
    if (soma !== arredondar(dados.valorOriginal)) {
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
