import type { RodadaPublicaDto, SituacaoItemPublica } from "@padaria/shared";
import { CABECALHO_DA_RODADA } from "~/utils/rodada-link";
import { tokenDoFragmento } from "~/utils/convite-token";

/**
 * Página pública do fornecedor na cotação (doc 57 §5). O token vem do FRAGMENTO (`#t=`), sai da barra logo
 * após ler e vai no cabeçalho `x-rodada-token`. Sem sessão, sem cookies (`credentials: "omit"`).
 */
export type Disponibilidade = "tenho" | "sem_estoque" | "nao_trabalha";
export type RespostaItemLocal = {
  conviteItemId: string;
  disponibilidade: Disponibilidade;
  valor: string;
  /** Quanto ele tem; vazio = a quantidade pedida. */
  quantidade: string;
};
export type RequisitarRodada = <T>(rota: string, init?: RequestInit) => Promise<T>;

export function useRodadaFornecedor() {
  const { apiUrl } = useApi();
  const token = ref("");
  const rodada = ref<RodadaPublicaDto | null>(null);
  const respostas = ref<RespostaItemLocal[]>([]);
  const frete = ref("");
  const observacao = ref("");
  const prazoEntrega = ref("");
  const condicaoPagamento = ref("");
  const carregando = ref(true);
  const enviando = ref(false);
  const aceitando = ref(false);
  const enviado = ref(false);
  const erro = ref("");

  const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  // O que o fornecedor vê de cada item: nunca quem comprou nem por quanto.
  const ROTULO_SITUACAO: Record<SituacaoItemPublica, string> = {
    comprado: "Já comprado",
    em_analise: "Em análise",
    nao_cotado: "Sem valor seu"
  };
  const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const prazo = computed(() => (rodada.value ? DATA_HORA.format(new Date(rodada.value.expiraEm)) : ""));
  const aberta = computed(() => rodada.value?.situacao === "aberta");

  const totalEstimado = computed(() =>
    respostas.value.reduce((soma, resposta, indice) => {
      if (resposta.disponibilidade !== "tenho") return soma;
      const pedida = Number(rodada.value?.itens[indice]?.quantidade ?? 0);
      const quantidade = Number(resposta.quantidade) > 0 ? Number(resposta.quantidade) : pedida;
      return soma + (Number(resposta.valor) || 0) * quantidade;
    }, 0)
  );
  const totalFormatado = computed(() => MOEDA.format(totalEstimado.value));
  const pendencias = computed(
    () => respostas.value.filter((item) => item.disponibilidade === "tenho" && !(Number(item.valor) > 0)).length
  );

  const requisitar: RequisitarRodada = async <T>(rota: string, init?: RequestInit) => {
    const resposta = await fetch(`${apiUrl}${rota}`, {
      ...init,
      credentials: "omit",
      headers: { ...(init?.headers ?? {}), [CABECALHO_DA_RODADA]: token.value }
    });
    const corpo = (await resposta.json().catch(() => null)) as { data?: T; title?: string } | null;
    if (!resposta.ok) throw new Error(corpo?.title || `Falha (HTTP ${resposta.status}).`);
    return corpo?.data as T;
  };

  function prefill(dto: RodadaPublicaDto) {
    const anterior = new Map((dto.ultimaProposta?.itens ?? []).map((item) => [item.conviteItemId, item]));
    respostas.value = dto.itens.map((item) => {
      const feito = anterior.get(item.conviteItemId);
      const disponibilidade: Disponibilidade = feito?.indisponivel
        ? (feito.motivoIndisponivel ?? "sem_estoque")
        : "tenho";
      return {
        conviteItemId: item.conviteItemId,
        disponibilidade,
        valor: feito?.valorUnitario ?? "",
        quantidade: feito?.quantidadeDisponivel ?? ""
      };
    });
    frete.value = dto.ultimaProposta?.frete ?? "";
    observacao.value = dto.ultimaProposta?.observacao ?? "";
    prazoEntrega.value = dto.ultimaProposta?.prazoEntrega ?? "";
    condicaoPagamento.value = dto.ultimaProposta?.condicaoPagamento ?? "";
  }

  async function carregar() {
    carregando.value = true;
    erro.value = "";
    try {
      const dto = await requisitar<RodadaPublicaDto>("/api/rodada");
      rodada.value = dto;
      prefill(dto);
    } catch (causa) {
      erro.value = causa instanceof Error ? causa.message : "Não foi possível abrir a cotação.";
      rodada.value = null;
    } finally {
      carregando.value = false;
    }
  }

  // Contraproposta do comprador PARA ELE (E7): itens com descrição e o valor proposto, já formatados.
  const itensContrapostos = computed(() => {
    const contraproposta = rodada.value?.contraproposta;
    if (!contraproposta || !rodada.value) return [];
    const descricao = new Map(rodada.value.itens.map((item) => [item.conviteItemId, item.descricaoProduto]));
    return contraproposta.itens.map((item) => ({
      conviteItemId: item.conviteItemId,
      descricaoProduto: descricao.get(item.conviteItemId) ?? "Item",
      valor: MOEDA.format(Number(item.valorUnitario))
    }));
  });

  // Aceitar vira a versão N+1 DELE; o comprador não precisa fazer mais nada para a compra sair.
  async function aceitar() {
    if (!aberta.value || !itensContrapostos.value.length || aceitando.value || enviando.value) return;
    aceitando.value = true;
    erro.value = "";
    try {
      await requisitar("/api/rodada/aceitar", { method: "POST" });
      enviado.value = true;
      await carregar();
    } catch (causa) {
      erro.value = causa instanceof Error ? causa.message : "Não foi possível aceitar.";
    } finally {
      aceitando.value = false;
    }
  }

  async function enviar() {
    if (!aberta.value || enviando.value || aceitando.value) return;
    // Campo em branco não é R$ 0,00: item que ele tem precisa de preço.
    if (pendencias.value) {
      erro.value = "Informe o valor de cada produto que você tem, ou marque que não tem.";
      return;
    }
    enviando.value = true;
    erro.value = "";
    try {
      await requisitar("/api/rodada/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frete: frete.value ? Number(frete.value) : null,
          observacao: observacao.value || null,
          prazoEntrega: prazoEntrega.value || null,
          condicaoPagamento: condicaoPagamento.value || null,
          itens: respostas.value.map((item) => {
            const tem = item.disponibilidade === "tenho";
            return {
              conviteItemId: item.conviteItemId,
              indisponivel: !tem,
              motivoIndisponivel: tem ? null : item.disponibilidade,
              valorUnitario: tem ? Number(item.valor) : null,
              quantidadeDisponivel: tem && Number(item.quantidade) > 0 ? Number(item.quantidade) : null
            };
          })
        })
      });
      enviado.value = true;
      await carregar();
    } catch (causa) {
      erro.value = causa instanceof Error ? causa.message : "Não foi possível enviar.";
    } finally {
      enviando.value = false;
    }
  }

  onMounted(() => {
    token.value = tokenDoFragmento(window.location.hash);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (!token.value) {
      carregando.value = false;
      return;
    }
    void carregar();
  });

  return {
    rodada,
    respostas,
    frete,
    observacao,
    prazoEntrega,
    condicaoPagamento,
    carregando,
    enviando,
    aceitando,
    enviado,
    erro,
    prazo,
    aberta,
    totalFormatado,
    pendencias,
    itensContrapostos,
    ROTULO_SITUACAO,
    requisitar,
    carregar,
    aceitar,
    enviar
  };
}
