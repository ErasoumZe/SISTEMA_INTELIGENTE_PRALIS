import type {
  ConferenciaAgendaDto,
  ConferenciaAgendaPayload,
  ConferenciaDetalheDto,
  ConferenciaResumoDto,
  OpcoesConferenciaDto
} from "@padaria/shared";

// Conferencia de estoque agendada (doc 57 §1): dados e acoes da tela. As regras (datas, recorte, quem conta)
// moram no servidor. Contar so registra: nenhum saldo muda.
export function useConferenciasEstoque(empresaId: Ref<string>, podeAgendar: Ref<boolean>) {
  const { apiGet, apiPost, apiPut } = useApi();
  const base = "/api/compras/conferencias";
  const query = () => `?empresaId=${encodeURIComponent(empresaId.value)}`;

  const conferencias = ref<ConferenciaResumoDto[]>([]);
  const agendas = ref<ConferenciaAgendaDto[]>([]);
  const opcoes = ref<OpcoesConferenciaDto>({
    grupos: [],
    areas: [],
    locaisEstoque: [],
    locaisVenda: [],
    responsaveis: []
  });
  const carregando = ref(false);
  let requisicao = 0;

  async function carregarListas() {
    const token = requisicao;
    const [lista, listaAgendas] = await Promise.all([
      apiGet<ConferenciaResumoDto[]>(`${base}${query()}`),
      apiGet<ConferenciaAgendaDto[]>(`${base}/agendas${query()}`)
    ]);
    if (token !== requisicao) return;
    conferencias.value = lista;
    agendas.value = listaAgendas;
  }

  async function carregarTudo() {
    if (!empresaId.value) return;
    const token = (requisicao += 1);
    carregando.value = true;
    try {
      const [, dadosOpcoes] = await Promise.all([
        carregarListas(),
        podeAgendar.value ? apiGet<OpcoesConferenciaDto>(`${base}/opcoes${query()}`) : Promise.resolve(null)
      ]);
      if (token === requisicao && dadosOpcoes) opcoes.value = dadosOpcoes;
    } finally {
      if (token === requisicao) carregando.value = false;
    }
  }

  async function salvarAgenda(payload: ConferenciaAgendaPayload, id: string | null) {
    if (id) await apiPut(`${base}/agendas/${id}`, payload);
    else await apiPost(`${base}/agendas`, payload);
    await carregarListas();
  }

  async function encerrarAgenda(id: string) {
    await apiPost(`${base}/agendas/${id}/encerrar`, { empresaId: empresaId.value });
    await carregarListas();
  }

  const detalhar = (id: string) => apiGet<ConferenciaDetalheDto>(`${base}/${id}${query()}`);

  async function salvarContagem(id: string, itens: Array<{ itemId: string; quantidadeContada: number | null }>) {
    await apiPut(`${base}/${id}/contagem`, { empresaId: empresaId.value, itens });
    await carregarListas();
  }

  async function concluir(id: string) {
    await apiPost(`${base}/${id}/concluir`, { empresaId: empresaId.value });
    await carregarListas();
  }

  return {
    conferencias,
    agendas,
    opcoes,
    carregando,
    carregarTudo,
    salvarAgenda,
    encerrarAgenda,
    detalhar,
    salvarContagem,
    concluir
  };
}
