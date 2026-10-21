import type {
  AgendamentoDto,
  AgendamentoPayload,
  EditarAgendamentoPayload,
  GrupoAgendamentoDto,
  OcorrenciaParaConferirDto,
  ProdutoAgendamentoDto,
  ProdutosAgendamentoDto
} from "@padaria/shared";
import type { Opcao } from "~/types/padaria";

// Agendamento de pedido (PROJECT_BRAIN/56): dados e acoes do modulo. A tela so organiza; as regras moram no
// servidor (recorrencia, datas, quem recebe o que).
export function useAgendamentoPedidos(empresaId: Ref<string>) {
  const { apiGet, apiPost, apiPut } = useApi();

  const agendamentos = ref<AgendamentoDto[]>([]);
  const paraConferir = ref<OcorrenciaParaConferirDto[]>([]);
  const produtos = ref<ProdutoAgendamentoDto[]>([]);
  const grupos = ref<GrupoAgendamentoDto[]>([]);
  const fornecedores = ref<Opcao[]>([]);
  const carregando = ref(false);

  const base = "/api/compras/agendamentos";
  const query = () => `?empresaId=${encodeURIComponent(empresaId.value)}`;
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

  /** A agenda e o "para conferir" mudam a cada acao; produtos e fornecedores so na troca de empresa. */
  async function carregarAgenda() {
    const token = requisicao;
    const [lista, conferir] = await Promise.all([
      apiGet<AgendamentoDto[]>(`${base}${query()}`),
      apiGet<OcorrenciaParaConferirDto[]>(`${base}/para-conferir${query()}`)
    ]);
    if (token !== requisicao) return;
    agendamentos.value = lista;
    paraConferir.value = conferir;
  }

  async function carregarTudo() {
    if (!empresaId.value) return;
    const token = (requisicao += 1);
    carregando.value = true;
    agendamentos.value = [];
    paraConferir.value = [];
    produtos.value = [];
    try {
      const [catalogo, listaFornecedores] = await Promise.all([
        apiGet<ProdutosAgendamentoDto>(`${base}/produtos${query()}`),
        carregarFornecedores(),
        carregarAgenda()
      ]);
      if (token !== requisicao) return;
      produtos.value = catalogo.produtos;
      grupos.value = catalogo.grupos;
      fornecedores.value = listaFornecedores;
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
    paraConferir,
    produtos,
    grupos,
    fornecedores,
    carregando,
    carregarTudo,
    carregarAgenda,
    salvar,
    encerrar,
    cancelarData,
    moverData
  };
}
