import { rotuloStatusPedido } from "~/utils/pedido-origem";
import type { PedidoDto, PedidoRecebimentoItem } from "@padaria/shared";
import { useTelaCompras } from "~/composables/useTelaCompras";
import { mensagemErro } from "~/utils/domain";
import { obterTentativaRecebimento, type TentativaRecebimento } from "~/utils/recebimento-idempotencia";

/**
 * Estado e operacoes de Pedidos finalizados (doc 58 §5): o que ja foi comprado (a caminho) e o que ja chegou, o
 * detalhe do pedido e o recebimento. O pedido nasce Comprado na cotacao; criar, editar e enviar na mao eram o
 * segundo caminho de compra e foram removidos.
 */
export function usePedidosFinalizados() {
  const { apiGet, apiPost } = useApi();
  const tela = useTelaCompras("Sem permissão para acessar pedidos.", carregarDados);
  const { empresaId, temPermissao, notificar } = tela;
  const empresaCarregando = ref(false);
  const pedidos = ref<PedidoDto[]>([]);
  const detalhe = ref<PedidoDto | null>(null);
  const dialogDetalhe = ref(false);
  const dialogRecebimento = ref(false);
  const transicionando = ref(false);
  const recebendo = ref(false);
  const tentativaRecebimento = ref<TentativaRecebimento | null>(null);
  const podeEditar = computed(() => temPermissao("pedidos_editar"));
  const podeReceber = computed(() => temPermissao("pedidos_aprovar"));

  async function carregarDados() {
    if (!empresaId.value) return;
    empresaCarregando.value = true;
    try {
      pedidos.value = await apiGet<PedidoDto[]>(`/api/pedidos?empresaId=${encodeURIComponent(empresaId.value)}`);
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    } finally {
      empresaCarregando.value = false;
    }
  }
  async function verPedido(id: string) {
    try {
      detalhe.value = await apiGet<PedidoDto>(`/api/pedidos/${id}`);
      dialogDetalhe.value = true;
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    }
  }
  function abrirRecebimento() {
    dialogDetalhe.value = false;
    dialogRecebimento.value = true;
  }
  async function mudarSituacao(status: "cancelado") {
    if (!detalhe.value) return false;
    transicionando.value = true;
    try {
      await apiPost(`/api/pedidos/${detalhe.value.id}/situacao`, { status });
      notificar(`Pedido marcado como ${rotuloStatusPedido(status)}.`);
      await carregarDados();
      await verPedido(detalhe.value.id);
      return true;
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
      return false;
    } finally {
      transicionando.value = false;
    }
  }
  function chaveIdempotencia() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (caractere) => {
      const numero = Math.floor(Math.random() * 16);
      return (caractere === "x" ? numero : (numero & 3) | 8).toString(16);
    });
  }
  async function confirmarRecebimento(itens: PedidoRecebimentoItem[], observacao: string) {
    if (!detalhe.value || !itens.length) return notificar("Informe o que recebeu ou devolveu.", "error");
    tentativaRecebimento.value = obterTentativaRecebimento(
      tentativaRecebimento.value,
      detalhe.value.id,
      itens,
      observacao,
      chaveIdempotencia
    );
    recebendo.value = true;
    try {
      const resposta = await apiPost<{ status: "recebido" | "recebido_parcial" }>(
        `/api/pedidos/${detalhe.value.id}/recebimentos`,
        { idempotenciaChave: tentativaRecebimento.value.chave, observacao: observacao.trim() || null, itens }
      );
      notificar(
        resposta.status === "recebido"
          ? "Recebimento concluido e estoque atualizado."
          : "Recebimento parcial registrado e estoque atualizado."
      );
      dialogRecebimento.value = false;
      tentativaRecebimento.value = null;
      await carregarDados();
      await verPedido(detalhe.value.id);
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    } finally {
      recebendo.value = false;
    }
  }

  return {
    ...tela,
    empresaCarregando,
    pedidos,
    detalhe,
    dialogDetalhe,
    dialogRecebimento,
    transicionando,
    recebendo,
    podeEditar,
    podeReceber,
    carregarDados,
    verPedido,
    abrirRecebimento,
    mudarSituacao,
    confirmarRecebimento
  };
}
