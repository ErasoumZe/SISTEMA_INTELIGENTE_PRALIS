import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  limitesDaMargem,
  quantidadeDentroDaMargem,
  separacaoPublicaPayloadSchema,
  type PedidoPublicoDto
} from "@padaria/shared/compras";
import type { DadosExternos } from "@padaria/shared/api";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { telefoneParaWhatsapp } from "../whatsapp/whatsapp-provedor.js";
import { enfileirarEnviosRepository } from "./compras-whatsapp.repository.js";
import {
  ajustarQuantidadesRepository,
  itensDoPedidoDaRodadaRepository,
  mudarStatusPedidoRepository,
  pedidoDoConviteRepository,
  travarPedidoRepository,
  ultimaPropostaIdDoConviteRepository
} from "./compras-separacao.repository.js";

// Doc 57 §5 — passo 2. Cotado (o item e dele) -> o fornecedor separa e ajusta a quantidade real dentro da
// margem -> Retornado -> o comprador confirma -> Comprado (confirmado), e o fornecedor recebe o ok pelo
// WhatsApp. O recebimento confere exatamente o que foi confirmado.

const STATUS_PUBLICOS = new Set(["cotado", "retornado", "confirmado", "recebido_parcial", "recebido"]);

/** O que o fornecedor ganhou nesta rodada, para a pagina publica. Injetado pelo controller publico. */
export async function pedidoPublicoDoConvite(conviteId: string): Promise<PedidoPublicoDto | null> {
  const pedido = await pedidoDoConviteRepository(conviteId);
  if (!pedido || !STATUS_PUBLICOS.has(pedido.status)) return null;
  const itens = await itensDoPedidoDaRodadaRepository(pedido.pedidoId);
  return {
    status: pedido.status as PedidoPublicoDto["status"],
    margemVariacaoPercentual: pedido.margemVariacaoPercentual,
    itens: itens.map((item) => {
      const limites =
        pedido.margemVariacaoPercentual === null
          ? null
          : limitesDaMargem(Number(item.quantidadePedida), pedido.margemVariacaoPercentual);
      return {
        pedidoItemId: item.pedidoItemId,
        descricaoProduto: item.descricaoProduto,
        quantidadePedida: item.quantidadePedida,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        minimo: limites ? String(limites.minimo) : null,
        maximo: limites ? String(limites.maximo) : null
      };
    })
  };
}

/** O fornecedor devolve a separacao com a quantidade real de cada item (dentro da margem). */
export async function registrarSeparacao(conviteId: string, body: DadosExternos): Promise<void> {
  const payload = separacaoPublicaPayloadSchema.parse(body ?? {});
  const pedido = await pedidoDoConviteRepository(conviteId);
  if (!pedido) throw naoEncontrado("Nenhum pedido seu nesta cotacao", "PEDIDO_NAO_ENCONTRADO");
  await executarEmTransacao(async (tx) => {
    const travado = await travarPedidoRepository(pedido.pedidoId, tx);
    if (!travado || travado.status !== "cotado")
      throw conflito("Este pedido ja foi devolvido ou confirmado", "PEDIDO_NAO_COTADO");
    const itens = await itensDoPedidoDaRodadaRepository(pedido.pedidoId, tx);
    const porId = new Map(itens.map((item) => [item.pedidoItemId, item]));
    if (new Set(payload.itens.map((item) => item.pedidoItemId)).size !== payload.itens.length)
      throw erroValidacao("Item repetido", "ITEM_DUPLICADO");
    const ajustes = payload.itens.map((informado) => {
      const item = porId.get(informado.pedidoItemId);
      if (!item) throw erroValidacao("Item nao e deste pedido", "ITEM_FORA_DO_PEDIDO");
      if (
        !quantidadeDentroDaMargem(Number(item.quantidadePedida), informado.quantidade, pedido.margemVariacaoPercentual)
      ) {
        const { minimo, maximo } = limitesDaMargem(Number(item.quantidadePedida), pedido.margemVariacaoPercentual);
        throw naoProcessavel(
          `${item.descricaoProduto}: a quantidade precisa ficar entre ${minimo} e ${maximo}`,
          "QUANTIDADE_FORA_DA_MARGEM"
        );
      }
      return { pedidoItemId: item.pedidoItemId, adjudicacaoId: item.adjudicacaoId, quantidade: informado.quantidade };
    });
    await ajustarQuantidadesRepository(ajustes, tx);
    await mudarStatusPedidoRepository(
      {
        pedidoId: pedido.pedidoId,
        empresaId: pedido.empresaId,
        status: "retornado",
        observacao: "Fornecedor separou e devolveu as quantidades reais",
        usuarioId: null,
        propostaId: await ultimaPropostaIdDoConviteRepository(conviteId, tx)
      },
      tx
    );
    await criarNotificacoesRepository(
      {
        empresaId: pedido.empresaId,
        tipo: "compras_decisao_pendente",
        destinatariosUsuarioIds: [pedido.abertaPor],
        referenciaId: pedido.rodadaId,
        titulo: "Fornecedor devolveu o pedido separado: confira e confirme",
        reabrir: true
      },
      tx
    );
  });
}

/** O comprador confirma (Comprado). O fornecedor recebe o "pode entregar" pelo WhatsApp. */
export async function confirmarPedido(pedidoId: string, empresaId: string, perfil: PerfilUsuario): Promise<void> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  await executarEmTransacao(async (tx) => {
    const pedido = await travarPedidoRepository(pedidoId, tx);
    if (!pedido || pedido.empresaId !== empresaId) throw naoEncontrado("Pedido nao encontrado");
    if (pedido.tipo !== "rodada" || (pedido.status !== "cotado" && pedido.status !== "retornado"))
      throw conflito("So se confirma pedido cotado ou retornado", "PEDIDO_NAO_CONFIRMAVEL");
    await mudarStatusPedidoRepository(
      {
        pedidoId,
        empresaId,
        status: "confirmado",
        observacao: "Pedido confirmado pelo comprador",
        usuarioId: perfil.usuarioId,
        propostaId: null
      },
      tx
    );
    if (pedido.fornecedorWhatsapp)
      await enfileirarEnviosRepository(
        [
          {
            empresaId,
            tipo: "pedido_confirmado",
            pedidoId,
            telefone: telefoneParaWhatsapp(pedido.fornecedorWhatsapp)
          }
        ],
        tx
      );
  });
}
