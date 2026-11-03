import type { PainelComprasDto, ProdutoEstoqueDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { useTelaCompras } from "~/composables/useTelaCompras";
import { mensagemErro } from "~/utils/domain";

/**
 * Estado da tela Cotacao por fornecedor (doc 58 §4): a matriz de produtos em cotacao e o que o Pedido urgente
 * precisa (fornecedores e produtos). O que ja foi comprado mora em Pedidos a receber.
 */
export function useCotacaoPorFornecedor() {
  const { apiGet } = useApi();
  const tela = useTelaCompras("Sem permissão para acessar a cotação.", carregarDados);
  const { empresaId, temPermissao, notificar } = tela;
  const empresaCarregando = ref(false);
  const painel = ref<PainelComprasDto>({ produtos: [] });
  const fornecedores = ref<Opcao[]>([]);
  const estoquePorProduto = ref<Record<string, ProdutoEstoqueDto>>({});
  const podeCriar = computed(() => temPermissao("pedidos_criar"));
  const podeEditar = computed(() => temPermissao("pedidos_editar"));
  const podeExcecao = computed(() => temPermissao("compras_excecao_aprovar"));

  function query() {
    return `?empresaId=${encodeURIComponent(empresaId.value)}`;
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
  async function carregarPainel() {
    painel.value = await apiGet<PainelComprasDto>(`/api/compras/painel${query()}`);
  }
  async function carregarDados() {
    if (!empresaId.value) return;
    empresaCarregando.value = true;
    try {
      [, fornecedores.value, estoquePorProduto.value] = await Promise.all([
        carregarPainel(),
        carregarFornecedores(),
        carregarEstoque()
      ]);
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    } finally {
      empresaCarregando.value = false;
    }
  }
  /** Depois de aceitar, contrapropor ou encerrar: so a matriz muda. */
  async function recarregarPainel() {
    try {
      await carregarPainel();
    } catch (causa) {
      notificar(mensagemErro(causa), "error");
    }
  }

  return {
    ...tela,
    empresaCarregando,
    painel,
    fornecedores,
    estoquePorProduto,
    podeCriar,
    podeEditar,
    podeExcecao,
    carregarDados,
    recarregarPainel
  };
}
