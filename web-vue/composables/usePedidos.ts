import type { AuthSession, PedidoDto, PedidoStatus, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";
import { obterTentativaRecebimento, type TentativaRecebimento } from "~/utils/recebimento-idempotencia";

/**
 * Estado e operacoes da fila de pedidos; os dialogs ficam apenas como apresentacao. Depois do E8
 * (R-221) o pedido nasce da rodada de cotacao: aqui so se le, se cancela e se RECEBE. Criar, editar,
 * sugerir, enviar cotacao e confirmar na mao eram o segundo caminho de compra e foram removidos.
 */
export function usePedidos() {
  const router = useRouter();
  const { apiGet, apiPost, carregarSessao } = useApi();
  const sessao = ref<AuthSession | null>(null);
  const empresas = ref<Opcao[]>([]);
  const fornecedores = ref<Opcao[]>([]);
  const empresaId = ref("");
  const caixaStatus = ref<CaixaStatus | null>(null);
  const carregando = ref(true);
  const empresaCarregando = ref(false);
  const erro = ref("");
  const snackbar = reactive({ show: false, text: "", color: "success" });
  const pedidos = ref<PedidoDto[]>([]);
  const detalhe = ref<PedidoDto | null>(null);
  const dialogDetalhe = ref(false);
  const dialogRecebimento = ref(false);
  const transicionando = ref(false);
  const recebendo = ref(false);
  const tentativaRecebimento = ref<TentativaRecebimento | null>(null);
  const estoquePorProduto = ref<Record<string, ProdutoEstoqueDto>>({});
  const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
  const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
    permissoesUsuario,
    () => Boolean(caixaStatus.value?.caixaAberto)
  );
  const podeCriar = computed(() => temPermissao("pedidos_criar"));
  const podeEditar = computed(() => temPermissao("pedidos_editar"));
  const podeReceber = computed(() => temPermissao("pedidos_aprovar"));
  const rotulosStatus: Record<PedidoStatus, string> = {
    rascunho: "Legado: rascunho",
    aprovado: "Legado: aprovado",
    a_fazer: "A fazer",
    enviado: "Enviado",
    retornado: "Retornado",
    confirmado: "Confirmado",
    recebido_parcial: "Recebido parcialmente",
    recebido: "Recebido",
    cancelado: "Cancelado"
  };

  function notificar(text: string, color = "success") {
    snackbar.text = text;
    snackbar.color = color;
    snackbar.show = true;
  }
  function query() {
    return `?empresaId=${empresaId.value}`;
  }
  async function carregarFornecedores(): Promise<Opcao[]> {
    const todos: Opcao[] = [];
    for (let pagina = 1; pagina <= 20; pagina += 1) {
      const lote = await apiGet<Opcao[]>(`/api/fornecedores${query()}&page=${pagina}&pageSize=100`);
      todos.push(...lote);
      if (lote.length < 100) break;
    }
    return todos;
  }
  async function carregarEstoque(): Promise<Record<string, ProdutoEstoqueDto>> {
    if (!temPermissao("estoque_produtos_visualizar")) return {};
    try {
      const linhas = await apiGet<ProdutoEstoqueDto[]>(`/api/compras/estoque${query()}`);
      return Object.fromEntries(linhas.map((linha) => [linha.id, linha]));
    } catch {
      return {};
    }
  }
  async function carregarDados() {
    if (!empresaId.value) return;
    empresaCarregando.value = true;
    try {
      [pedidos.value, fornecedores.value, estoquePorProduto.value] = await Promise.all([
        apiGet<PedidoDto[]>(`/api/pedidos${query()}`),
        carregarFornecedores(),
        carregarEstoque()
      ]);
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    } finally {
      empresaCarregando.value = false;
    }
  }
  async function trocarEmpresa(id: string) {
    empresaId.value = id;
    await carregarDados();
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
      notificar(`Pedido marcado como ${rotulosStatus[status]}.`);
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
  async function confirmarRecebimento(
    itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>,
    observacao: string
  ) {
    if (!detalhe.value || !itens.length) return notificar("Informe ao menos uma quantidade conferida.", "error");
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

  onMounted(async () => {
    try {
      sessao.value = await carregarSessao();
      if (!sessao.value) return void (await router.push("/login"));
      if (!temPermissao("pedidos_visualizar")) return void (erro.value = "Sem permissao para acessar pedidos.");
      empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
      empresaId.value =
        sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
      await carregarDados();
    } catch (causa) {
      erro.value = mensagemErro(causa);
    } finally {
      carregando.value = false;
    }
  });

  return {
    sessao,
    empresas,
    fornecedores,
    empresaId,
    caixaStatus,
    carregando,
    empresaCarregando,
    erro,
    snackbar,
    pedidos,
    detalhe,
    dialogDetalhe,
    dialogRecebimento,
    transicionando,
    recebendo,
    estoquePorProduto,
    telasPermitidas,
    telasDesabilitadasMenu,
    motivosTelasDesabilitadas,
    podeCriar,
    podeEditar,
    podeReceber,
    trocarEmpresa,
    verPedido,
    abrirRecebimento,
    mudarSituacao,
    confirmarRecebimento
  };
}
