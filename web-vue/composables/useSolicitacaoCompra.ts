import type {
  EnviarSolicitacaoCompraPayload,
  RodadaDto,
  SolicitacaoCompraCardDto,
  SolicitacaoCompraDetalheDto
} from "@padaria/shared";
import type { Opcao } from "~/types/padaria";

// Solicitacao de compra (doc 58 §2): os cards do responsavel, a conferencia do pedido do dia e o envio.
export function useSolicitacaoCompra(empresaId: Ref<string>) {
  const { apiGet, apiPost } = useApi();
  const base = "/api/compras/solicitacoes-compra";
  const query = () => `?empresaId=${encodeURIComponent(empresaId.value)}`;

  const cards = ref<SolicitacaoCompraCardDto[]>([]);
  const fornecedores = ref<Opcao[]>([]);
  const carregando = ref(false);
  let requisicao = 0;

  async function carregarFornecedores(): Promise<Opcao[]> {
    const todos: Opcao[] = [];
    for (let pagina = 1; pagina <= 20; pagina += 1) {
      const lote = await apiGet<Opcao[]>(`/api/fornecedores${query()}&page=${pagina}&pageSize=100`);
      todos.push(...lote);
      if (lote.length < 100) break;
    }
    return todos;
  }

  async function carregarCards() {
    const token = requisicao;
    const lista = await apiGet<SolicitacaoCompraCardDto[]>(`${base}${query()}`);
    if (token === requisicao) cards.value = lista;
  }

  async function carregarTudo() {
    if (!empresaId.value) return;
    const token = (requisicao += 1);
    carregando.value = true;
    try {
      const [, lista] = await Promise.all([carregarCards(), carregarFornecedores()]);
      if (token === requisicao) fornecedores.value = lista;
    } finally {
      if (token === requisicao) carregando.value = false;
    }
  }

  const detalhar = (ocorrenciaId: string) => apiGet<SolicitacaoCompraDetalheDto>(`${base}/${ocorrenciaId}${query()}`);

  async function enviar(ocorrenciaId: string, itens: EnviarSolicitacaoCompraPayload["itens"]) {
    const rodada = await apiPost<RodadaDto>(`${base}/${ocorrenciaId}/enviar`, { empresaId: empresaId.value, itens });
    await carregarCards();
    return rodada;
  }

  return { cards, fornecedores, carregando, carregarTudo, detalhar, enviar };
}
