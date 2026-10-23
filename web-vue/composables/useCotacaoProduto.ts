import type { CotacaoDoProdutoDto, OfertaDoProdutoDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/**
 * A cotacao de um produto (doc 58 §4): cada fornecedor e onde esta. Daqui o comprador aceita o preco (uma vez,
 * referencia intacta), aceita e reajusta a referencia, ou contrapropoe enquanto a cotacao esta aberta.
 */
export function useCotacaoProduto(empresaId: Ref<string>) {
  const { apiGet, apiPost } = useApi();
  const cotacao = ref<CotacaoDoProdutoDto | null>(null);
  const carregando = ref(false);
  const processando = ref(false);
  const erro = ref("");
  let requisicao = 0;

  async function carregar(produtoId: string, manterErro = false) {
    const token = (requisicao += 1);
    carregando.value = true;
    if (!manterErro) erro.value = "";
    try {
      const dto = await apiGet<CotacaoDoProdutoDto>(
        `/api/compras/painel/produtos/${produtoId}?empresaId=${encodeURIComponent(empresaId.value)}`
      );
      if (token === requisicao) cotacao.value = dto;
    } catch (causa) {
      if (token === requisicao) {
        cotacao.value = null;
        erro.value = mensagemErro(causa);
      }
    } finally {
      if (token === requisicao) carregando.value = false;
    }
  }

  async function executar<T>(acao: () => Promise<T>): Promise<boolean> {
    processando.value = true;
    erro.value = "";
    try {
      await acao();
      return true;
    } catch (causa) {
      erro.value = mensagemErro(causa);
      return false;
    } finally {
      processando.value = false;
    }
  }

  /** Comprado na hora (doc 58 §6). `reajustar`: a referencia passa a ser o custo desta oferta. */
  const aceitar = (oferta: OfertaDoProdutoDto, reajustarReferencia: boolean) =>
    executar(() =>
      apiPost(`/api/compras/rodadas/${oferta.rodadaId}/decisoes/aprovar`, {
        empresaId: empresaId.value,
        propostaItemId: oferta.propostaItemId,
        reajustarReferencia
      })
    );

  const contrapropor = (oferta: OfertaDoProdutoDto, valorUnitario: number) =>
    executar(() =>
      apiPost(`/api/compras/rodadas/${oferta.rodadaId}/convites/${oferta.conviteId}/contraproposta`, {
        empresaId: empresaId.value,
        itens: [{ rodadaItemId: oferta.rodadaItemId, valorUnitario }]
      })
    );

  return { cotacao, carregando, processando, erro, carregar, aceitar, contrapropor };
}
