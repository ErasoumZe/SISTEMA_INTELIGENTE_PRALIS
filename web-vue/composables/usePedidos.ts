import type { AuthSession, CotacaoGeradaDto, PedidoDto, PedidoStatus, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import { usePermissoes } from "~/composables/usePermissoes";
import type { PedidoFormEdicao } from "~/types/pedidos";
import { linkDaCotacao, mensagemDaCotacao } from "~/utils/cotacao-link";
import { mensagemErro } from "~/utils/domain";
import { normalizarQuantidadeEditavel, normalizarWhatsappParaLink } from "~/utils/formatacao";
import { obterTentativaRecebimento, type TentativaRecebimento } from "~/utils/recebimento-idempotencia";

function formVazio(): PedidoFormEdicao {
  return {
    fornecedorId: "",
    recorrencia: "nenhuma",
    dataAgendada: "",
    observacao: "",
    itens: [{ produtoId: "", quantidade: "1" }]
  };
}

/** Estado e operacoes da tela unica de pedidos; os dialogs ficam apenas como apresentacao. */
export function usePedidos() {
  const router = useRouter();
  const { apiGet, apiPost, apiPut, carregarSessao } = useApi();
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
  const dialogForm = ref(false);
  const dialogRecebimento = ref(false);
  const pedidoEditandoId = ref("");
  const salvando = ref(false);
  const gerando = ref(false);
  const transicionando = ref(false);
  const recebendo = ref(false);
  const tentativaRecebimento = ref<TentativaRecebimento | null>(null);
  const sugestaoFornecedorId = ref("");
  const estoquePorProduto = ref<Record<string, ProdutoEstoqueDto>>({});
  /** Ultimo link de cotacao gerado nesta sessao. O token sai uma vez so: recarregou, so gerando outro. */
  const linkCotacao = ref<{ pedidoId: string; link: string } | null>(null);
  const linkCotacaoDoDetalhe = computed(() =>
    linkCotacao.value && linkCotacao.value.pedidoId === detalhe.value?.id ? linkCotacao.value.link : null
  );
  const form = reactive<PedidoFormEdicao>(formVazio());
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
  function limparForm() {
    Object.assign(form, formVazio());
    pedidoEditandoId.value = "";
  }
  function payloadDoForm() {
    return {
      fornecedorId: form.fornecedorId,
      recorrencia: form.recorrencia,
      dataAgendada: form.dataAgendada || null,
      observacao: form.observacao || null,
      itens: form.itens
        .filter((item) => item.produtoId && Number(item.quantidade) > 0)
        .map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade) }))
    };
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
  function abrirNovo() {
    limparForm();
    dialogForm.value = true;
  }
  function adicionarItem() {
    form.itens.push({ produtoId: "", quantidade: "1" });
  }
  function removerItem(indice: number) {
    form.itens.splice(indice, 1);
    if (!form.itens.length) adicionarItem();
  }
  async function salvarPedido() {
    const payload = payloadDoForm();
    if (!payload.fornecedorId || !payload.itens.length)
      return notificar("Informe fornecedor e ao menos um item valido.", "error");
    salvando.value = true;
    try {
      if (pedidoEditandoId.value) await apiPut(`/api/pedidos/${pedidoEditandoId.value}`, payload);
      else await apiPost("/api/pedidos", { empresaId: empresaId.value, ...payload });
      notificar(pedidoEditandoId.value ? "Pedido atualizado." : "Pedido criado em A fazer.");
      dialogForm.value = false;
      await carregarDados();
      if (detalhe.value?.id === pedidoEditandoId.value) await verPedido(detalhe.value.id);
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    } finally {
      salvando.value = false;
    }
  }
  async function gerarSugestao() {
    if (!sugestaoFornecedorId.value) return notificar("Selecione o fornecedor da sugestao.", "error");
    gerando.value = true;
    try {
      const resposta = await apiPost<{ id: string; totalItens: number }>("/api/pedidos/gerar-sugestao", {
        empresaId: empresaId.value,
        fornecedorId: sugestaoFornecedorId.value,
        recorrencia: "nenhuma",
        dataAgendada: null
      });
      notificar(`Sugestao criada com ${resposta.totalItens} item(ns), em A fazer.`);
      await carregarDados();
      await verPedido(resposta.id);
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    } finally {
      gerando.value = false;
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
  function editarPedido(pedido: PedidoDto) {
    pedidoEditandoId.value = pedido.id;
    Object.assign(form, {
      fornecedorId: pedido.fornecedorId ?? "",
      recorrencia: pedido.recorrencia,
      dataAgendada: pedido.dataAgendada ? pedido.dataAgendada.slice(0, 16) : "",
      observacao: pedido.observacao ?? "",
      itens: (pedido.itens ?? []).map((item) => ({
        produtoId: item.produtoId ?? "",
        quantidade: normalizarQuantidadeEditavel(item.quantidade)
      }))
    });
    dialogDetalhe.value = false;
    dialogForm.value = true;
  }
  function abrirRecebimento() {
    dialogDetalhe.value = false;
    dialogRecebimento.value = true;
  }
  async function mudarSituacao(status: "confirmado" | "cancelado") {
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
  async function copiarLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      notificar("Link copiado.");
    } catch {
      notificar("Nao foi possivel copiar. Selecione o link e copie manualmente.", "error");
    }
  }
  /**
   * R-216: gera o link da cotacao e abre o WhatsApp do fornecedor com ele.
   *
   * A janela abre ANTES da chamada a API, dentro do clique: aberta depois de um `await`, o
   * navegador a trataria como pop-up nao solicitado e bloquearia. Fornecedor sem WhatsApp valido
   * nao trava o fluxo: o link vai para a area de transferencia para seguir por outro canal.
   */
  async function enviarCotacao() {
    const pedido = detalhe.value;
    if (!pedido) return;
    const numero = pedido.fornecedorWhatsapp ? normalizarWhatsappParaLink(pedido.fornecedorWhatsapp) : "";
    const temWhatsapp = numero.length >= 12 && numero.length <= 15;
    const janela = temWhatsapp ? window.open("about:blank", "_blank") : null;
    if (temWhatsapp && !janela)
      return notificar("O navegador bloqueou o WhatsApp. Libere pop-ups e tente novamente.", "error");
    if (janela) janela.opener = null;
    transicionando.value = true;
    try {
      const gerada = await apiPost<CotacaoGeradaDto>(`/api/pedidos/${pedido.id}/cotacoes`, {});
      const link = linkDaCotacao(window.location.origin, gerada.token);
      linkCotacao.value = { pedidoId: pedido.id, link };
      const prazo = new Date(new Date(gerada.expiraEm).getTime() - 60_000).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      const empresaNome = empresas.value.find((empresa) => empresa.id === empresaId.value)?.nome ?? "Pralis";
      const mensagem = mensagemDaCotacao({
        fornecedorNome: pedido.fornecedorNome ?? "fornecedor",
        empresaNome,
        totalItens: pedido.totalItens,
        link,
        prazo
      });
      if (janela) {
        janela.location.replace(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`);
        notificar("Cotação gerada e WhatsApp aberto com o link.");
      } else {
        await copiarLink(link);
        notificar("Fornecedor sem WhatsApp válido: link copiado para enviar por outro canal.", "warning");
      }
      await carregarDados();
      await verPedido(pedido.id);
    } catch (causa) {
      janela?.close();
      notificar(mensagemErro(causa), "error");
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
    dialogForm,
    dialogRecebimento,
    pedidoEditandoId,
    salvando,
    gerando,
    transicionando,
    recebendo,
    sugestaoFornecedorId,
    estoquePorProduto,
    form,
    telasPermitidas,
    telasDesabilitadasMenu,
    motivosTelasDesabilitadas,
    podeCriar,
    podeEditar,
    podeReceber,
    trocarEmpresa,
    abrirNovo,
    adicionarItem,
    removerItem,
    salvarPedido,
    gerarSugestao,
    verPedido,
    editarPedido,
    abrirRecebimento,
    mudarSituacao,
    enviarCotacao,
    copiarLink,
    linkCotacaoDoDetalhe,
    confirmarRecebimento
  };
}
