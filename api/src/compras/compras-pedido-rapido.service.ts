// MODULO DO COMPRADOR — pedido rapido (Fase 2, R-221 decisao 2). Nao e um segundo caminho de compra:
// cria uma solicitacao `origem='rapida'` e abre uma rodada de UM fornecedor, que atravessa o mesmo
// portao de qualquer rodada (preco-base, teto, adjudicacao atomica).
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { PedidoRapidoPayload, RodadaDto } from "@padaria/shared/compras";
import { podeConvidar } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { erroValidacao, naoProcessavel, proibido } from "../erros.js";
import { buscarFornecedoresParaConviteRepository } from "./compras-rodadas.repository.js";
import { abrirRodada } from "./compras-rodadas.service.js";
import { criarSolicitacao, obterSolicitacao } from "./compras-solicitacoes.service.js";

/**
 * O fornecedor e validado ANTES de criar a solicitacao: um fornecedor inativo ou sem WhatsApp nao pode
 * deixar uma solicitacao em rascunho para tras. Se a abertura da rodada ainda falhar depois disso, a
 * solicitacao fica em rascunho e visivel na aba de Solicitacoes: nada se perde, e e so abrir a rodada.
 */
export async function criarPedidoRapido(payload: PedidoRapidoPayload, perfil: PerfilUsuario): Promise<RodadaDto> {
  if (!podeAcessarEmpresa(perfil, payload.empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");

  const [fornecedor] = await buscarFornecedoresParaConviteRepository(payload.empresaId, [payload.fornecedorId]);
  if (!fornecedor) throw erroValidacao("Fornecedor nao pertence a empresa informada", "INVALID_SUPPLIER");
  const motivo = podeConvidar({
    situacao: fornecedor.situacao as "ativo" | "inativo",
    whatsapp: fornecedor.whatsapp
  });
  if (motivo) throw naoProcessavel(`${fornecedor.nome}: ${motivo}`, "FORNECEDOR_NAO_CONVIDAVEL");

  const { id: solicitacaoId } = await criarSolicitacao(
    {
      empresaId: payload.empresaId,
      origem: "rapida",
      observacao: payload.observacao ?? null,
      itens: payload.itens
    },
    perfil
  );
  const solicitacao = await obterSolicitacao(solicitacaoId, perfil);
  return abrirRodada(
    {
      empresaId: payload.empresaId,
      solicitacaoId,
      prazoRespostaHoras: payload.prazoRespostaHoras ?? null,
      tetoValor: payload.tetoValor ?? null,
      margemVariacaoPercentual: payload.margemVariacaoPercentual ?? 10,
      convites: [
        { fornecedorId: payload.fornecedorId, solicitacaoItemIds: (solicitacao.itens ?? []).map((item) => item.id) }
      ]
    },
    perfil
  );
}
