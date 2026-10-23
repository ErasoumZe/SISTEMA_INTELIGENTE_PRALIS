// MODULO DO COMPRADOR — contraproposta versionada (Fase 2, R-221 decisao 7). NAO e importado pelo
// modulo publico do fornecedor (isolamento).
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { ContrapropostaPayload } from "@padaria/shared/compras";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { rodadaItensAdjudicadosRepository } from "./compras-adjudicacao.repository.js";
import {
  criarContrapropostaRepository,
  itensDoConviteRepository,
  marcarConviteAbertoRepository,
  proximaVersaoDoConviteRepository
} from "./compras-contraproposta.repository.js";
import { solicitacaoDaRodadaRepository, ultimaVersaoEnviadaDoConviteRepository } from "./compras-decisao.repository.js";
import { travarRodadaRepository } from "./compras-fechamento.repository.js";
import { travarConviteRepository } from "./compras-rodadas.repository.js";

/**
 * O Comprador contrapropoe valor a um fornecedor que ja respondeu, enquanto a rodada esta ABERTA
 * (depois do fechamento o caminho e a excecao). Grava uma versao `autor_tipo='comprador'` no livro do
 * convite e devolve o convite a `aberto`, com o mesmo token. Nada sobrescreve: cada volta e uma versao
 * com autor, hora e valor. Sem limite de voltas alem do prazo da rodada.
 */
export async function contraproporAoFornecedor(
  rodadaId: string,
  conviteId: string,
  payload: ContrapropostaPayload,
  perfil: PerfilUsuario
): Promise<{ versao: number }> {
  if (!podeAcessarEmpresa(perfil, payload.empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  const solicitacaoId = await solicitacaoDaRodadaRepository(rodadaId, payload.empresaId);
  if (!solicitacaoId) throw naoEncontrado("Rodada nao encontrada");

  return executarEmTransacao(async (tx) => {
    // Ordem canonica de travas (doc 54): advisory da solicitacao -> rodada -> convite.
    await tx.execute(sqlTravarRodadaDeCompras(solicitacaoId));
    const rodada = await travarRodadaRepository(rodadaId, tx);
    if (!rodada || rodada.empresaId !== payload.empresaId) throw naoEncontrado("Rodada nao encontrada");
    // Entre o vencimento e o tick do fechamento (ate 60 s) o fornecedor ja leva 410: nao ha o que contrapor.
    if (rodada.status !== "aberta" || rodada.expiraEm.getTime() <= Date.now()) {
      throw naoProcessavel("So se contrapropoe com a rodada aberta", "RODADA_NAO_ABERTA");
    }
    const convite = await travarConviteRepository(conviteId, payload.empresaId, tx);
    if (!convite || convite.rodadaId !== rodadaId) throw naoEncontrado("Convite nao encontrado");
    if (convite.status !== "aberto" && convite.status !== "aguardando_comprador") {
      throw naoProcessavel("O convite nao esta mais aberto", "CONVITE_NAO_ABERTO");
    }
    // Contraproposta responde a uma proposta: sem resposta do fornecedor nao ha o que contrapor.
    if (!(await ultimaVersaoEnviadaDoConviteRepository(conviteId, tx))) {
      throw naoProcessavel("O fornecedor ainda nao respondeu", "SEM_RESPOSTA_DO_FORNECEDOR");
    }

    const itensDoConvite = await itensDoConviteRepository(conviteId, tx);
    const conviteItemPorRodadaItem = new Map(itensDoConvite.map((item) => [item.rodadaItemId, item.conviteItemId]));
    const adjudicados = await rodadaItensAdjudicadosRepository(rodadaId, tx);
    const itens = payload.itens.map((item) => {
      const conviteItemId = conviteItemPorRodadaItem.get(item.rodadaItemId);
      if (!conviteItemId) throw erroValidacao("Item nao pertence a este convite", "ITEM_FORA_DO_CONVITE");
      if (adjudicados.has(item.rodadaItemId)) throw conflito("Este item ja tem vencedor", "ITEM_JA_ADJUDICADO");
      return { conviteItemId, valorUnitario: item.valorUnitario };
    });

    const versao = await proximaVersaoDoConviteRepository(conviteId, tx);
    await criarContrapropostaRepository(
      { empresaId: payload.empresaId, conviteId, versao, autorUsuarioId: perfil.usuarioId, itens },
      tx
    );
    await marcarConviteAbertoRepository(conviteId, tx);
    return { versao };
  });
}
