// MODULO DO COMPRADOR — fila de decisao, aprovacao de excecao e encerramento da solicitacao (Fase 2,
// R-221 decisoes 1, 6 e 10). NAO e importado pelo modulo publico do fornecedor (isolamento).
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  AprovarExcecaoPayload,
  DecisaoItemDto,
  DecisoesRodadaDto,
  EncerrarSolicitacaoPayload
} from "@padaria/shared/compras";
import { motivoDecisao, statusSolicitacaoAposFechamento } from "@padaria/shared/compras";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import {
  criarPedidoConfirmadoRepository,
  inserirAdjudicacaoRepository,
  inserirItemPedidoRepository,
  pedidoConfirmadoDaRodadaRepository,
  rodadaItensAdjudicadosRepository
} from "./compras-adjudicacao.repository.js";
import {
  buscarPropostaItemParaAprovarRepository,
  carregarFilaDaRodadaRepository,
  solicitacaoDaRodadaRepository,
  travarSolicitacaoRepository,
  ultimaVersaoEnviadaDoConviteRepository
} from "./compras-decisao.repository.js";
import { atualizarStatusSolicitacaoRepository, totalItensDaRodadaRepository } from "./compras-fechamento.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

const numeroOuNulo = (valor: string | null): number | null => (valor === null ? null : Number(valor));

/** A fila: o que ficou sem vencedor no envelope da rodada, com o motivo e o que cada fornecedor ofereceu. */
export async function obterDecisoesDaRodada(
  rodadaId: string,
  empresaId: string,
  perfil: PerfilUsuario
): Promise<DecisoesRodadaDto> {
  validarEmpresa(perfil, empresaId);
  const dados = await carregarFilaDaRodadaRepository(rodadaId, empresaId);
  if (!dados) throw naoEncontrado("Rodada nao encontrada");

  const itens: DecisaoItemDto[] = dados.itens
    .filter((item) => !dados.adjudicados.has(item.rodadaItemId))
    .map((item) => {
      const propostas = dados.propostas.filter((proposta) => proposta.rodadaItemId === item.rodadaItemId);
      return {
        rodadaItemId: item.rodadaItemId,
        solicitacaoItemId: item.solicitacaoItemId,
        produtoId: item.produtoId,
        descricaoProduto: item.descricaoProduto,
        quantidade: item.quantidade,
        precoBaseValor: item.precoBaseValor,
        motivo: motivoDecisao(
          propostas.map((proposta) => ({
            indisponivel: proposta.indisponivel,
            custoFinalUnitario: numeroOuNulo(proposta.custoFinalUnitario)
          })),
          numeroOuNulo(item.precoBaseValor)
        ),
        propostas: propostas.map((proposta) => ({
          propostaItemId: proposta.propostaItemId,
          fornecedorId: proposta.fornecedorId,
          fornecedorNome: proposta.fornecedorNome,
          versao: proposta.versao,
          indisponivel: proposta.indisponivel,
          valorUnitario: proposta.valorUnitario,
          freteRateado: proposta.freteRateado,
          custoFinalUnitario: proposta.custoFinalUnitario
        }))
      };
    });

  return {
    rodadaId: dados.cabecalho.id,
    solicitacaoId: dados.cabecalho.solicitacaoId,
    status: dados.cabecalho.status,
    totalItens: dados.itens.length,
    itensComprados: dados.adjudicados.size,
    itens
  };
}

/**
 * O Comprador aprova UMA proposta fora do envelope pre-autorizado (acima da base, sem base ou barrada
 * pelo teto). Cria/reusa o pedido consolidado (rodada, fornecedor) e grava a adjudicacao
 * `modo='comprador'`. O `UNIQUE (rodada_item_id)` e a ultima palavra: item ja vendido -> 409.
 *
 * Vale com a rodada aberta ou ja fechada (a decisao 6 manda a proposta acima da base para a fila
 * DEPOIS do vencimento). NAO altera a base de preco: compra por excecao nao vira envelope.
 */
export async function aprovarExcecao(
  rodadaId: string,
  payload: AprovarExcecaoPayload,
  perfil: PerfilUsuario
): Promise<{ pedidoId: string }> {
  validarEmpresa(perfil, payload.empresaId);
  const solicitacaoId = await solicitacaoDaRodadaRepository(rodadaId, payload.empresaId);
  if (!solicitacaoId) throw naoEncontrado("Rodada nao encontrada");

  return executarEmTransacao(async (tx) => {
    // Ordem canonica de travas (doc 54): advisory da solicitacao primeiro, e so entao le o que decide.
    await tx.execute(sqlTravarRodadaDeCompras(solicitacaoId));
    const alvo = await buscarPropostaItemParaAprovarRepository(payload.propostaItemId, payload.empresaId, tx);
    if (!alvo || alvo.rodadaId !== rodadaId) throw naoEncontrado("Proposta nao encontrada");
    if (alvo.rodadaStatus === "cancelada") {
      throw naoProcessavel("A rodada foi cancelada", "RODADA_CANCELADA");
    }
    const solicitacao = await travarSolicitacaoRepository(solicitacaoId, payload.empresaId, tx);
    if (!solicitacao || solicitacao.status === "encerrada" || solicitacao.status === "cancelada") {
      throw naoProcessavel("A solicitacao ja foi encerrada", "SOLICITACAO_ENCERRADA");
    }
    if (alvo.indisponivel || alvo.valorUnitario === null) {
      throw naoProcessavel("O fornecedor informou que nao tem este item", "ITEM_INDISPONIVEL");
    }
    if (alvo.custoFinalUnitario === null) {
      // Nao inventamos o rateio do frete (decisao 5): sem custo gravado, nao ha o que aprovar.
      throw naoProcessavel("Esta proposta nao tem custo calculado", "CUSTO_NAO_CALCULADO");
    }
    if (alvo.versao !== (await ultimaVersaoEnviadaDoConviteRepository(alvo.conviteId, tx))) {
      throw conflito("O fornecedor enviou uma resposta mais recente", "PROPOSTA_SUPERADA");
    }
    const adjudicados = await rodadaItensAdjudicadosRepository(alvo.rodadaId, tx);
    if (adjudicados.has(alvo.rodadaItemId)) throw conflito("Este item ja tem vencedor", "ITEM_JA_ADJUDICADO");

    const pedidoId =
      (await pedidoConfirmadoDaRodadaRepository(alvo.rodadaId, alvo.fornecedorId, tx)) ??
      (await criarPedidoConfirmadoRepository(
        {
          empresaId: payload.empresaId,
          solicitacaoId: alvo.solicitacaoId,
          rodadaId: alvo.rodadaId,
          fornecedorId: alvo.fornecedorId,
          propostaId: alvo.propostaId,
          abertaPor: alvo.abertaPor,
          aprovadoPor: perfil.usuarioId
        },
        tx
      ));
    const pedidoItemId = await inserirItemPedidoRepository(
      {
        pedidoId,
        fornecedorId: alvo.fornecedorId,
        produtoId: alvo.produtoId,
        descricaoProduto: alvo.descricaoProduto,
        quantidade: alvo.quantidade,
        estoqueAtual: alvo.estoqueAtual,
        estoqueMin: alvo.estoqueMin,
        estoqueMax: alvo.estoqueMax
      },
      tx
    );
    const venceu = await inserirAdjudicacaoRepository(
      {
        empresaId: payload.empresaId,
        rodadaItemId: alvo.rodadaItemId,
        propostaItemId: alvo.propostaItemId,
        fornecedorId: alvo.fornecedorId,
        pedidoId,
        pedidoItemId,
        quantidade: alvo.quantidade,
        custoFinalUnitario: Number(alvo.custoFinalUnitario),
        precoBaseValor: alvo.precoBaseValor,
        modo: "comprador",
        aprovadoPor: perfil.usuarioId
      },
      tx
    );
    // Quebra de invariante, nunca caminho normal: a trava ja garantiu a exclusividade. O throw
    // desfaz o pedido e o item recem-criados.
    if (!venceu) throw conflito("Este item ja tem vencedor", "ITEM_JA_ADJUDICADO");

    // Rodada ja fechada e este era o ultimo item sem vencedor: a solicitacao passa a comprada.
    if (alvo.rodadaStatus === "fechada") {
      const total = await totalItensDaRodadaRepository(alvo.rodadaId, tx);
      const novoStatus = statusSolicitacaoAposFechamento(total, adjudicados.size + 1);
      if (novoStatus !== solicitacao.status) {
        await atualizarStatusSolicitacaoRepository(
          { solicitacaoId, empresaId: payload.empresaId, status: novoStatus, agora: new Date() },
          tx
        );
      }
    }
    return { pedidoId };
  });
}

/**
 * "Encerrar solicitacao": o Comprador desiste dos itens que sobraram na fila. So vale depois do
 * fechamento (parcialmente_comprada): enquanto a rodada esta aberta ainda ha resposta por vir.
 * Quem quiser comprar o resto cria uma NOVA solicitacao (nao ha segundo caminho de compra).
 */
export async function encerrarSolicitacao(
  solicitacaoId: string,
  payload: EncerrarSolicitacaoPayload,
  perfil: PerfilUsuario
): Promise<void> {
  validarEmpresa(perfil, payload.empresaId);
  await executarEmTransacao(async (tx) => {
    await tx.execute(sqlTravarRodadaDeCompras(solicitacaoId));
    const solicitacao = await travarSolicitacaoRepository(solicitacaoId, payload.empresaId, tx);
    if (!solicitacao) throw naoEncontrado("Solicitacao nao encontrada");
    if (solicitacao.status !== "parcialmente_comprada") {
      throw naoProcessavel(
        "So e possivel encerrar uma solicitacao parcialmente comprada (rodada ja fechada)",
        "SOLICITACAO_NAO_ENCERRAVEL"
      );
    }
    await atualizarStatusSolicitacaoRepository(
      { solicitacaoId, empresaId: payload.empresaId, status: "encerrada", agora: new Date() },
      tx
    );
  });
}
