import type { FiltrosDeProduto, OrdenacaoProdutos, ProdutoResumo } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/**
 * Estado da listagem de produtos. Busca, filtros, ordenacao e paginacao sao TODOS resolvidos no
 * servidor — a tela nunca filtra em memoria, porque a pagina que ela recebe e um recorte.
 */

export interface PaginacaoDaLista {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const ORDENACOES: Array<{ value: OrdenacaoProdutos; label: string }> = [
  { value: "recentes", label: "Mais recentes" },
  { value: "antigos", label: "Mais antigos" },
  { value: "az", label: "Nome (A–Z)" },
  { value: "za", label: "Nome (Z–A)" },
  { value: "codigo_asc", label: "Código (00001 →)" },
  { value: "codigo_desc", label: "Código (→ 00001)" }
];

const ATRASO_DA_BUSCA = 350;

export function useListagemProdutos(empresaId: Ref<string>) {
  const { apiGetPaginado, apiGet } = useApi();

  const produtos = ref<ProdutoResumo[]>([]);
  const opcoesDeFiltro = ref<FiltrosDeProduto>({ setores: [], grupos: [] });
  const carregando = ref(false);
  const erro = ref("");

  const busca = ref("");
  const status = ref<string | null>(null);
  const tipo = ref<string | null>(null);
  const grupoMercadoriaId = ref<string | null>(null);
  const setorEstoque = ref<string | null>(null);
  const ordenar = ref<OrdenacaoProdutos>("recentes");

  const paginacao = reactive<PaginacaoDaLista>({ page: 1, pageSize: 12, total: 0, totalPages: 1 });

  /** Quantos filtros estao ativos — vira o contador no botao "Filtros". */
  const quantidadeDeFiltros = computed(
    () =>
      [status.value, tipo.value, grupoMercadoriaId.value, setorEstoque.value].filter(Boolean).length +
      (ordenar.value === "recentes" ? 0 : 1)
  );
  const temFiltroOuBusca = computed(() => quantidadeDeFiltros.value > 0 || Boolean(busca.value));

  function limparFiltros() {
    status.value = null;
    tipo.value = null;
    grupoMercadoriaId.value = null;
    setorEstoque.value = null;
    ordenar.value = "recentes";
    busca.value = "";
  }

  function consulta() {
    const parametros = new URLSearchParams({
      empresaId: empresaId.value,
      page: String(paginacao.page),
      pageSize: String(paginacao.pageSize),
      ordenar: ordenar.value
    });
    if (busca.value.trim()) parametros.set("busca", busca.value.trim());
    if (status.value) parametros.set("status", status.value);
    if (tipo.value) parametros.set("tipo", tipo.value);
    if (grupoMercadoriaId.value) parametros.set("grupoMercadoriaId", grupoMercadoriaId.value);
    if (setorEstoque.value) parametros.set("setorEstoque", setorEstoque.value);
    return parametros.toString();
  }

  async function carregar() {
    if (!empresaId.value) return;
    carregando.value = true;
    erro.value = "";
    try {
      const resposta = await apiGetPaginado<ProdutoResumo>(`/api/produtos?${consulta()}`);
      produtos.value = resposta.itens;
      paginacao.total = resposta.total;
      paginacao.page = resposta.page;
      paginacao.pageSize = resposta.pageSize;
      paginacao.totalPages = Math.max(1, Math.ceil(resposta.total / (resposta.pageSize || 1)));
    } catch (error) {
      produtos.value = [];
      erro.value = mensagemErro(error);
    } finally {
      carregando.value = false;
    }
  }

  async function carregarOpcoesDeFiltro() {
    if (!empresaId.value) return;
    try {
      opcoesDeFiltro.value = await apiGet<FiltrosDeProduto>(`/api/produtos/filtros?empresaId=${empresaId.value}`);
    } catch {
      opcoesDeFiltro.value = { setores: [], grupos: [] };
    }
  }

  /** Trocar filtro, ordem ou busca sempre volta para a pagina 1 — senao a pagina 3 de outro recorte. */
  let debounce: ReturnType<typeof setTimeout> | null = null;
  watch(busca, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      paginacao.page = 1;
      void carregar();
    }, ATRASO_DA_BUSCA);
  });
  watch([status, tipo, grupoMercadoriaId, setorEstoque, ordenar], () => {
    paginacao.page = 1;
    void carregar();
  });
  watch(
    () => paginacao.page,
    () => void carregar()
  );
  watch(empresaId, async () => {
    paginacao.page = 1;
    await Promise.all([carregar(), carregarOpcoesDeFiltro()]);
  });

  onBeforeUnmount(() => {
    if (debounce) clearTimeout(debounce);
  });

  return {
    produtos,
    opcoesDeFiltro,
    carregando,
    erro,
    busca,
    status,
    tipo,
    grupoMercadoriaId,
    setorEstoque,
    ordenar,
    paginacao,
    quantidadeDeFiltros,
    temFiltroOuBusca,
    limparFiltros,
    carregar,
    carregarOpcoesDeFiltro
  };
}
