/**
 * Estado da cotacao publica do fornecedor (R-216).
 *
 * A pagina fica somente com a composicao visual; aqui ficam token, rascunho automatico,
 * validacao, envio irreversivel e o salvamento ao sair da pagina.
 */
import { calcularCotacao, pendenciasParaEnviar, type CotacaoPublicaDto } from "@padaria/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useApi } from "~/composables/useApi";
import type { CondicoesCotacao, RespostaItemCotacao } from "~/types/cotacao";
import { CABECALHO_DA_COTACAO, tokenDoFragmento } from "~/utils/cotacao-link";

class ErroHttp extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const formatoPrazo = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const decimalParaTela = (valor: string | null, casas: number) =>
  valor === null
    ? ""
    : Number(valor).toLocaleString("pt-BR", {
        maximumFractionDigits: casas,
        minimumFractionDigits: 0,
        useGrouping: false
      });

export function useCotacaoFornecedor() {
  const { apiUrl } = useApi();
  const token = ref("");
  const cotacao = ref<CotacaoPublicaDto | null>(null);
  const carregando = ref(true);
  const salvando = ref(false);
  const enviando = ref(false);
  const erro = ref("");
  const tentouEnviar = ref(false);
  const confirmarEnvio = ref(false);
  const salvoEm = ref<Date | null>(null);
  const pendenteDeSalvar = ref(false);
  const respostas = ref<RespostaItemCotacao[]>([]);
  const condicoes = ref<CondicoesCotacao>({
    descontoGeralTipo: "valor",
    descontoGeralValor: "",
    prazoEntrega: "",
    condicaoPagamento: "",
    observacao: ""
  });

  async function chamar<T>(metodo: string, corpo?: object): Promise<T | null> {
    const rota = metodo === "POST" ? "/api/cotacao/enviar" : "/api/cotacao";
    const resposta = await fetch(`${apiUrl}${rota}`, {
      method: metodo,
      credentials: "omit",
      headers: {
        [CABECALHO_DA_COTACAO]: token.value,
        ...(corpo === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    if (resposta.status === 204) return null;
    const json = (await resposta.json().catch(() => null)) as { data?: T; title?: string; code?: string } | null;
    if (!resposta.ok) {
      const mensagem =
        json?.code === "VALIDATION_ERROR"
          ? "Confira os números digitados: use apenas números, com vírgula para os centavos."
          : (json?.title ?? "Não foi possível falar com o servidor. Tente de novo em instantes.");
      throw new ErroHttp(mensagem, resposta.status);
    }
    return json?.data ?? null;
  }

  function preencher(dados: CotacaoPublicaDto) {
    respostas.value = dados.itens.map((item) => ({
      pedidoItemId: item.pedidoItemId,
      indisponivel: item.indisponivel,
      valorUnitario: item.valorUnitario === null ? "" : Number(item.valorUnitario).toFixed(2).replace(".", ","),
      descontoTipo: item.descontoTipo ?? "valor",
      descontoValor: decimalParaTela(item.descontoValor, 4)
    }));
    condicoes.value = {
      descontoGeralTipo: dados.descontoGeralTipo ?? "valor",
      descontoGeralValor: decimalParaTela(dados.descontoGeralValor, 4),
      prazoEntrega: dados.prazoEntrega ?? "",
      condicaoPagamento: dados.condicaoPagamento ?? "",
      observacao: dados.observacao ?? ""
    };
  }

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      cotacao.value = await chamar<CotacaoPublicaDto>("GET");
      if (cotacao.value) preencher(cotacao.value);
      await nextTick();
      pendenteDeSalvar.value = false;
    } catch (causa) {
      cotacao.value = null;
      erro.value = causa instanceof ErroHttp && causa.status === 404 ? "" : (causa as Error).message;
    } finally {
      carregando.value = false;
    }
  }

  const aberta = computed(() => cotacao.value?.situacao === "aberta");
  const entrada = computed(() => {
    const quantidadePorId = new Map((cotacao.value?.itens ?? []).map((item) => [item.pedidoItemId, item.quantidade]));
    return respostas.value.map((resposta) => ({
      id: resposta.pedidoItemId,
      quantidade: quantidadePorId.get(resposta.pedidoItemId) ?? "0",
      indisponivel: resposta.indisponivel,
      valorUnitario: resposta.valorUnitario || null,
      descontoTipo: resposta.descontoValor ? resposta.descontoTipo : null,
      descontoValor: resposta.descontoValor || null
    }));
  });
  const calculo = computed(() =>
    calcularCotacao(entrada.value, {
      tipo: condicoes.value.descontoGeralValor ? condicoes.value.descontoGeralTipo : null,
      valor: condicoes.value.descontoGeralValor || null
    })
  );
  const calculoPorId = computed(() => new Map(calculo.value.itens.map((item) => [item.id, item])));
  const pendencias = computed(() =>
    pendenciasParaEnviar(
      entrada.value,
      calculo.value,
      Object.fromEntries((cotacao.value?.itens ?? []).map((item) => [item.pedidoItemId, item.descricao]))
    )
  );
  function payload() {
    return {
      itens: entrada.value.map((item) => ({
        pedidoItemId: item.id,
        indisponivel: item.indisponivel,
        valorUnitario: item.valorUnitario,
        descontoTipo: item.descontoTipo,
        descontoValor: item.descontoValor
      })),
      descontoGeralTipo: condicoes.value.descontoGeralValor ? condicoes.value.descontoGeralTipo : null,
      descontoGeralValor: condicoes.value.descontoGeralValor || null,
      prazoEntrega: condicoes.value.prazoEntrega || null,
      condicaoPagamento: condicoes.value.condicaoPagamento.trim() || null,
      observacao: condicoes.value.observacao.trim() || null
    };
  }

  let temporizador: ReturnType<typeof setTimeout> | null = null;
  async function salvar(silencioso = false) {
    if (!aberta.value || enviando.value) return;
    if (temporizador) clearTimeout(temporizador);
    salvando.value = true;
    try {
      await chamar("PUT", payload());
      salvoEm.value = new Date();
      pendenteDeSalvar.value = false;
      if (!silencioso) erro.value = "";
    } catch (causa) {
      if (causa instanceof ErroHttp && causa.status === 410) return void (await carregar());
      if (!silencioso) erro.value = (causa as Error).message;
    } finally {
      salvando.value = false;
    }
  }
  watch(
    [respostas, condicoes],
    () => {
      if (carregando.value || !aberta.value) return;
      pendenteDeSalvar.value = true;
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => void salvar(true), 2_500);
    },
    { deep: true }
  );
  function pedirEnvio() {
    tentouEnviar.value = true;
    if (pendencias.value.length) {
      document.querySelector(".cotacao-item--pendente")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    confirmarEnvio.value = true;
  }
  async function enviar() {
    if (temporizador) clearTimeout(temporizador);
    enviando.value = true;
    erro.value = "";
    try {
      await chamar("POST", payload());
      confirmarEnvio.value = false;
      await carregar();
    } catch (causa) {
      confirmarEnvio.value = false;
      if (causa instanceof ErroHttp && causa.status === 410) return void (await carregar());
      erro.value = (causa as Error).message;
    } finally {
      enviando.value = false;
    }
  }

  const prazo = computed(() =>
    cotacao.value ? formatoPrazo.format(new Date(new Date(cotacao.value.expiraEm).getTime() - 60_000)) : ""
  );
  const respondidaEm = computed(() =>
    cotacao.value?.respondidaEm ? formatoPrazo.format(new Date(cotacao.value.respondidaEm)) : ""
  );
  const estadoDoRascunho = computed(() => {
    if (salvando.value) return "Salvando rascunho…";
    if (pendenteDeSalvar.value) return "Alterações ainda não salvas";
    if (salvoEm.value)
      return `Rascunho salvo às ${salvoEm.value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    return "Você pode salvar e voltar pelo mesmo link";
  });
  function salvarAoSair() {
    if (document.visibilityState !== "hidden" || !pendenteDeSalvar.value || !aberta.value || enviando.value) return;
    if (temporizador) clearTimeout(temporizador);
    pendenteDeSalvar.value = false;
    void fetch(`${apiUrl}/api/cotacao`, {
      method: "PUT",
      credentials: "omit",
      keepalive: true,
      headers: { [CABECALHO_DA_COTACAO]: token.value, "Content-Type": "application/json" },
      body: JSON.stringify(payload())
    }).catch(() => {
      pendenteDeSalvar.value = true;
    });
  }
  onMounted(async () => {
    document.addEventListener("visibilitychange", salvarAoSair);
    token.value = tokenDoFragmento(window.location.hash);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (!token.value) {
      carregando.value = false;
      return;
    }
    await carregar();
  });
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", salvarAoSair);
    if (temporizador) clearTimeout(temporizador);
  });

  return {
    aberta,
    calculo,
    calculoPorId,
    carregando,
    condicoes,
    confirmarEnvio,
    cotacao,
    enviar,
    enviando,
    erro,
    estadoDoRascunho,
    moeda,
    pedirEnvio,
    pendencias,
    pendenteDeSalvar,
    prazo,
    respondidaEm,
    respostas,
    salvando,
    salvar,
    tentouEnviar
  };
}
