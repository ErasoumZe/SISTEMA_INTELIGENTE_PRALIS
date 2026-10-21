// MODULO PUBLICO do fornecedor (Fase 2). Isolamento comercial: nao importa o modulo do comprador
// nem toca preco-base/adjudicacao (scripts/verificar-arquitetura.mjs quebra o build se tocar). O
// tipo `ConviteAutenticado` so e cunhado por `autenticarConvitePorToken`: quem tem so um uuid nao
// consegue construir o tipo e nao compila a chamada.
import { createHash } from "node:crypto";
import type { DadosExternos } from "@padaria/shared/api";
import type { RespostaItemPublica, ResponderRodadaPayload, RodadaPublicaDto } from "@padaria/shared/compras";
import { responderRodadaPayloadSchema } from "@padaria/shared/compras";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { executarEmTransacao } from "../banco/conexao.js";
import { erroValidacao, foiEmbora, naoEncontrado } from "../erros.js";
import {
  buscarConvitePorHashRepository,
  conviteItemIdsRepository,
  criarPropostaFornecedorRepository,
  itensDoConviteRepository,
  marcarConviteRespondidoRepository,
  proximaVersaoRepository,
  travarConvitePorHashRepository,
  ultimaPropostaDoConviteRepository,
  type ConvitePublicoLinha
} from "./rodada-publica.repository.js";

declare const marcaConvite: unique symbol;
/** Convite ja autenticado por token. So `autenticarConvitePorToken` cunha; o `[marcaConvite]` e privado. */
export type ConviteAutenticado = ConvitePublicoLinha & { readonly [marcaConvite]: true };

function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function exigirToken(token: string | undefined): string {
  if (!token) throw naoEncontrado("Convite nao encontrado", "RODADA_TOKEN_AUSENTE");
  return token;
}

/**
 * Unica porta de entrada do token: devolve o convite marcado ou 404. Nao decide se esta no prazo —
 * quem le (obter) mostra "encerrada"; quem escreve (responder) recusa com 410.
 */
export async function autenticarConvitePorToken(token: string | undefined): Promise<ConviteAutenticado> {
  const linha = await buscarConvitePorHashRepository(hashToken(exigirToken(token)));
  if (!linha) throw naoEncontrado("Convite nao encontrado", "RODADA_CONVITE_INVALIDO");
  return linha as ConviteAutenticado;
}

function rodadaViva(convite: ConviteAutenticado): boolean {
  return (
    convite.rodadaStatus === "aberta" &&
    convite.expiraEm.getTime() > Date.now() &&
    (convite.conviteStatus === "aberto" || convite.conviteStatus === "aguardando_comprador")
  );
}

export async function obterRodadaPublica(token: string | undefined): Promise<RodadaPublicaDto> {
  const convite = await autenticarConvitePorToken(token);
  const [itens, ultima] = await Promise.all([
    itensDoConviteRepository(convite.conviteId),
    ultimaPropostaDoConviteRepository(convite.conviteId)
  ]);
  return {
    fornecedorNome: convite.fornecedorNome,
    empresaNome: convite.empresaNome,
    expiraEm: convite.expiraEm.toISOString(),
    situacao: rodadaViva(convite) ? "aberta" : "encerrada",
    itens: itens.map((item) => ({
      conviteItemId: item.conviteItemId,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade
    })),
    ultimaProposta: ultima
      ? {
          versao: ultima.versao,
          frete: ultima.frete,
          observacao: ultima.observacao,
          prazoEntrega: ultima.prazoEntrega,
          condicaoPagamento: ultima.condicaoPagamento,
          itens: ultima.itens.map((item) => ({
            conviteItemId: item.conviteItemId,
            indisponivel: item.indisponivel,
            valorUnitario: item.valorUnitario
          }))
        }
      : null
  };
}

export async function responderRodadaPublica(
  token: string | undefined,
  body: DadosExternos
): Promise<{ versao: number }> {
  const payload: ResponderRodadaPayload = responderRodadaPayloadSchema.parse(body ?? {});
  // Autentica FORA da transacao so para obter a solicitacao (chave do advisory) e falhar cedo.
  const convite = await autenticarConvitePorToken(token);
  if (!rodadaViva(convite)) throw foiEmbora("A rodada nao esta mais aberta para respostas", "RODADA_ENCERRADA");

  return executarEmTransacao(async (tx) => {
    // Ordem canonica: advisory por solicitacao -> convite FOR UPDATE.
    await tx.execute(sqlTravarRodadaDeCompras(convite.solicitacaoId));
    const travado = await travarConvitePorHashRepository(hashToken(exigirToken(token)), tx);
    if (!travado) throw naoEncontrado("Convite nao encontrado", "RODADA_CONVITE_INVALIDO");
    // Reconfere o estado ja com a trava (o prazo/fechamento pode ter corrido entre a leitura e a trava).
    const atual = await autenticarConvitePorToken(token);
    if (!rodadaViva(atual)) throw foiEmbora("A rodada nao esta mais aberta para respostas", "RODADA_ENCERRADA");

    const itensValidos = await conviteItemIdsRepository(travado.id, tx);
    for (const item of payload.itens) {
      if (!itensValidos.has(item.conviteItemId)) {
        throw erroValidacao("Item nao pertence a este convite", "ITEM_FORA_DO_CONVITE");
      }
    }
    if (new Set(payload.itens.map((item) => item.conviteItemId)).size !== payload.itens.length) {
      throw erroValidacao("Item repetido na mesma resposta", "ITEM_DUPLICADO");
    }

    const versao = await proximaVersaoRepository(travado.id, tx);
    await criarPropostaFornecedorRepository(
      {
        empresaId: travado.empresaId,
        conviteId: travado.id,
        versao,
        frete: payload.frete ?? null,
        observacao: payload.observacao ?? null,
        prazoEntrega: payload.prazoEntrega ?? null,
        condicaoPagamento: payload.condicaoPagamento ?? null,
        itens: payload.itens.map((item: RespostaItemPublica) => ({
          conviteItemId: item.conviteItemId,
          indisponivel: item.indisponivel,
          valorUnitario: item.indisponivel ? null : (item.valorUnitario ?? null)
        }))
      },
      tx
    );
    await marcarConviteRespondidoRepository(travado.id, travado.empresaId, tx);
    return { versao };
  });
}
