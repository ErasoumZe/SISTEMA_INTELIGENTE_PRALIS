import type { RodadaPublicaDto, SituacaoItemPublica } from "@padaria/shared";
import { CABECALHO_DA_RODADA } from "~/utils/rodada-link";
import { tokenDoFragmento } from "~/utils/convite-token";

/**
 * Fase 2 — pagina publica do fornecedor na rodada. Mesma mecanica da cotacao: o token vem do
 * FRAGMENTO (`#t=`), e removido da barra logo apos ler, e vai no cabecalho `x-rodada-token`. Sem
 * sessao, sem cookies (`credentials: "omit"`).
 */
export type RespostaItemLocal = { conviteItemId: string; indisponivel: boolean; valor: string };

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
  // O que o fornecedor ve de cada item (decisao 8): nunca quem comprou, por quanto, nem a base.
  const ROTULO_SITUACAO: Record<SituacaoItemPublica, string> = {
    comprado: "Já comprado",
    em_analise: "Em análise",
    nao_cotado: "Sem valor seu"
  };
  const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const prazo = computed(() => (rodada.value ? DATA_HORA.format(new Date(rodada.value.expiraEm)) : ""));
  const aberta = computed(() => rodada.value?.situacao === "aberta");

  const totalEstimado = computed(() =>
    respostas.value.reduce((soma, item) => (item.indisponivel ? soma : soma + (Number(item.valor) || 0)), 0)
  );
  const totalFormatado = computed(() => MOEDA.format(totalEstimado.value));

  const pendencias = computed(
    () => respostas.value.filter((item) => !item.indisponivel && !(Number(item.valor) > 0)).length
  );

  async function requisitar<T>(rota: string, init?: RequestInit): Promise<T> {
    const resposta = await fetch(`${apiUrl}${rota}`, {
      ...init,
      credentials: "omit",
      headers: { ...(init?.headers ?? {}), [CABECALHO_DA_RODADA]: token.value }
    });
    const corpo = (await resposta.json().catch(() => null)) as { data?: T; title?: string } | null;
    if (!resposta.ok) throw new Error(corpo?.title || `Falha (HTTP ${resposta.status}).`);
    return corpo?.data as T;
  }

  function prefill(dto: RodadaPublicaDto) {
    const anterior = new Map((dto.ultimaProposta?.itens ?? []).map((item) => [item.conviteItemId, item]));
    respostas.value = dto.itens.map((item) => {
      const feito = anterior.get(item.conviteItemId);
      return {
        conviteItemId: item.conviteItemId,
        indisponivel: feito?.indisponivel ?? false,
        valor: feito?.valorUnitario ?? ""
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
      erro.value = causa instanceof Error ? causa.message : "Não foi possível abrir a rodada.";
      rodada.value = null;
    } finally {
      carregando.value = false;
    }
  }

  // Contraproposta do comprador PARA ELE (E7): itens com descricao e o valor proposto, ja formatados.
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

  // Aceitar vira a versao N+1 DELE; o comprador nao precisa fazer mais nada para a compra sair.
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
    // Campo em branco nao e R$ 0,00: item sem valor precisa de preco ou de "indisponivel".
    if (pendencias.value) {
      erro.value = "Informe o valor de cada item ou marque como indisponível.";
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
          itens: respostas.value.map((item) => ({
            conviteItemId: item.conviteItemId,
            indisponivel: item.indisponivel,
            valorUnitario: item.indisponivel ? null : Number(item.valor)
          }))
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
    aceitar,
    enviar
  };
}
