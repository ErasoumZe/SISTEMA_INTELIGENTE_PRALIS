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
  totaisVendasRepository,
  vendaEhIntegradaRepository
} from "./vendas.repository.js";
import { paraCentavos } from "@padaria/shared/dinheiro";
import { proibido } from "../erros.js";
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

// Assinatura de comparacao dos pagamentos: forma + valor, em ordem estavel. Compara o que a venda
// E, nao os campos que vieram no corpo — uma tela que devolve o mesmo conteudo continua salvando os
// campos permitidos (observacao, descricao de desconto...) sem esbarrar na recusa.
function assinaturaPagamentos(
  pagamentos: ReadonlyArray<{ formaPagamentoId?: string | null | undefined; totalPago: number | string }>
): string {
  return pagamentos
    .map((pagamento) => `${pagamento.formaPagamentoId ?? "-"}|${paraCentavos(pagamento.totalPago)}`)
    .sort()
    .join(";");
}

function recusarEdicaoFinanceiraDeVendaIntegrada(existente: VendaDetalheDto, dados: VendaPayload): void {
  if ((dados.contaOrigemId ?? null) !== (existente.contaOrigemId ?? null)) {
    throw proibido(
      "Venda integrada nao tem a conta de origem alterada pela retaguarda: o destino do dinheiro vem do roteamento da forma de pagamento",
      "VENDA_INTEGRADA_CONTA_ORIGEM"
    );
  }
  if (assinaturaPagamentos(dados.tiposPagamento) !== assinaturaPagamentos(existente.tiposPagamento)) {
    throw proibido(
      "Venda integrada nao tem os pagamentos alterados pela retaguarda: o proximo reenvio do CREARE sobrescreveria a alteracao",
      "VENDA_INTEGRADA_PAGAMENTOS"
    );
  }
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
    // R-177 ANTES da validacao de caixa, e a ordem e de MENSAGEM, nao de seguranca: "venda integrada
    // nao tem pagamento editado pela retaguarda" e a razao verdadeira da recusa. Deixar a validacao
    // de caixa responder primeiro devolveria "nao pertence ao seu caixa aberto", que manda o operador
    // procurar o problema no lugar errado.
    //
    // Nao mexe na ordem de LOCKS (P0 lancamento x fechamento): esta checagem nao trava nada — le a
    // previa que ja foi buscada e compara com o payload. E uma venda integrada nao deixa de ser
    // integrada por concorrencia.
    //
    // Nao e funcao sendo retirada: o proximo reenvio do CREARE ja sobrescreve a venda e reinsere os
    // pagamentos, entao essa edicao NUNCA sobreviveu — hoje, antes do roteamento. Com roteamento ela
    // passaria a apagar o credito em silencio.
    if (previa && (await vendaEhIntegradaRepository(vendaId, tx))) {
      recusarEdicaoFinanceiraDeVendaIntegrada(previa, dados);
    }
    // P0 — ordem unica: caixa (FOR SHARE, dentro da validacao) ANTES da linha da venda.
    const caixa = await validarEdicaoNoCaixaAberto(previa, dados, perfil, tx);
    if (!(await travarVendaRepository(vendaId, dados.empresaId, tx))) throw new Error("Registro nao encontrado");
    // Retrato SOB a trava: a venda integrada pode ter mudado de CAIXA entre a leitura e o lock
    // (revinculacao/CREARE) — a revalidacao compara empresa e caixa_id do retrato atual, sem
    // retomar o lock do caixa.
    const existente = await buscarVendaDetalheRepository(vendaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx, caixa);
    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    await atualizarVendaRepository(vendaId, normalizados, computar, tx);
    return { id: vendaId, computar };
  });
}
