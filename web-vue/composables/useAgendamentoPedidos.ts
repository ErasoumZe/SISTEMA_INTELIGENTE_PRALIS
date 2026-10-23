import type {
  AgendamentoDto,
  AgendamentoPayload,
  EditarAgendamentoPayload,
  GrupoAgendamentoDto,
  ProdutoAgendamentoDto,
  ProdutosAgendamentoDto
} from "@padaria/shared";

// Agendamento de pedido (PROJECT_BRAIN/56 e 57): dados e acoes do modulo. A tela so organiza; as regras
// moram no servidor (recorrencia, datas, quem recebe o que). Na data, o servidor envia sozinho.
export function useAgendamentoPedidos(empresaId: Ref<string>) {
  const { apiGet, apiPost, apiPut } = useApi();

  const agendamentos = ref<AgendamentoDto[]>([]);
  const produtos = ref<ProdutoAgendamentoDto[]>([]);
  const grupos = ref<GrupoAgendamentoDto[]>([]);
  const carregando = ref(false);

  const base = "/api/compras/agendamentos";
  const query = () => `?empresaId=${encodeURIComponent(empresaId.value)}`;
  let requisicao = 0;

  /** A agenda muda a cada acao; os produtos so na troca de empresa. */
  async function carregarAgenda() {
    const token = requisicao;
    const lista = await apiGet<AgendamentoDto[]>(`${base}${query()}`);
    if (token !== requisicao) return;
    agendamentos.value = lista;
  }

  async function carregarTudo() {
    if (!empresaId.value) return;
    const token = (requisicao += 1);
    carregando.value = true;
    agendamentos.value = [];
    produtos.value = [];
    try {
      const [catalogo] = await Promise.all([
        apiGet<ProdutosAgendamentoDto>(`${base}/produtos${query()}`),
        carregarAgenda()
      ]);
      if (token !== requisicao) return;
      produtos.value = catalogo.produtos;
      grupos.value = catalogo.grupos;
    } finally {
      if (token === requisicao) carregando.value = false;
    }
  }

  async function salvar(payload: AgendamentoPayload, id: string | null, aPartirDe?: string) {
    if (id) {
      const corpo: EditarAgendamentoPayload = aPartirDe ? { ...payload, aPartirDe } : payload;
      await apiPut(`${base}/${id}`, corpo);
    } else await apiPost(base, payload);
    await carregarAgenda();
  }

  async function encerrar(id: string) {
    await apiPost(`${base}/${id}/encerrar`, { empresaId: empresaId.value });
    await carregarAgenda();
  }

  async function cancelarData(id: string, previstoPara: string) {
    await apiPost(`${base}/${id}/ocorrencias/cancelar`, { empresaId: empresaId.value, previstoPara });
    await carregarAgenda();
  }

  async function moverData(id: string, previstoPara: string, novaData: string, novaHora: string) {
    await apiPost(`${base}/${id}/ocorrencias/mover`, { empresaId: empresaId.value, previstoPara, novaData, novaHora });
    await carregarAgenda();
  }

  return {
    agendamentos,
    produtos,
    grupos,
    carregando,
    carregarTudo,
    carregarAgenda,
    salvar,
    encerrar,
    cancelarData,
    moverData
  };
}
