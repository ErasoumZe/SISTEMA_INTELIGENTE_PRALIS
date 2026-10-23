import type { DecisoesRodadaDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/**
 * Acoes da cotacao inteira (doc 58 §4): o que ainda nao foi comprado, encerrar a cotacao antes do prazo e
 * encerrar a solicitacao. Aceitar ou contrapropor uma oferta mora na cotacao do produto (useCotacaoProduto).
 */
export function useRodadaDecisoes(empresaId: Ref<string>) {
  const { apiGet, apiPost } = useApi();
  const decisoes = ref<DecisoesRodadaDto | null>(null);
  const carregando = ref(false);
  const processando = ref(false);
  const erro = ref("");
  let requisicao = 0;

  async function carregar(rodadaId: string, manterErro = false) {
    const token = (requisicao += 1);
    carregando.value = true;
    if (!manterErro) erro.value = "";
    decisoes.value = null;
    try {
      const dto = await apiGet<DecisoesRodadaDto>(
        `/api/compras/rodadas/${rodadaId}/decisoes?empresaId=${encodeURIComponent(empresaId.value)}`
      );
      if (token === requisicao) decisoes.value = dto;
    } catch (causa) {
      if (token === requisicao) erro.value = mensagemErro(causa);
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

  // Fecha a cotacao antes do prazo (motivo `comprador`).
  const encerrarRodada = (rodadaId: string) =>
    executar(() => apiPost(`/api/compras/rodadas/${rodadaId}/encerrar`, { empresaId: empresaId.value }));

  const encerrar = (solicitacaoId: string) =>
    executar(() => apiPost(`/api/compras/solicitacoes/${solicitacaoId}/encerrar`, { empresaId: empresaId.value }));

  return { decisoes, carregando, processando, erro, carregar, encerrar, encerrarRodada };
}
