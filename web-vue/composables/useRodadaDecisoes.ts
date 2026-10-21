import type { DecisoesRodadaDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

/**
 * Fila de decisao do Comprador (E6): carrega o que ficou sem vencedor, aprova excecao e encerra a
 * solicitacao. Dono do proprio estado e do proprio erro; quem usa decide quando recarregar.
 */
export function useRodadaDecisoes(empresaId: Ref<string>) {
  const { apiGet, apiPost } = useApi();
  const decisoes = ref<DecisoesRodadaDto | null>(null);
  const carregando = ref(false);
  const processando = ref(false);
  const erro = ref("");
  let requisicao = 0;

  /** A fila da rodada MAIS RECENTE da solicitacao (a lista de rodadas vem da mais nova para a mais antiga). */
  async function carregar(solicitacaoId: string) {
    const token = (requisicao += 1);
    carregando.value = true;
    erro.value = "";
    decisoes.value = null;
    try {
      const empresa = encodeURIComponent(empresaId.value);
      const rodadas = await apiGet<Array<{ id: string }>>(
        `/api/compras/rodadas?empresaId=${empresa}&solicitacaoId=${encodeURIComponent(solicitacaoId)}`
      );
      const maisRecente = rodadas[0];
      if (!maisRecente) {
        if (token === requisicao) erro.value = "Nenhuma rodada encontrada para esta solicitação.";
        return;
      }
      const dto = await apiGet<DecisoesRodadaDto>(
        `/api/compras/rodadas/${maisRecente.id}/decisoes?empresaId=${empresa}`
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

  const aprovar = (rodadaId: string, propostaItemId: string) =>
    executar(() =>
      apiPost(`/api/compras/rodadas/${rodadaId}/decisoes/aprovar`, {
        empresaId: empresaId.value,
        propostaItemId
      })
    );

  const encerrar = (solicitacaoId: string) =>
    executar(() => apiPost(`/api/compras/solicitacoes/${solicitacaoId}/encerrar`, { empresaId: empresaId.value }));

  return { decisoes, carregando, processando, erro, carregar, aprovar, encerrar };
}
