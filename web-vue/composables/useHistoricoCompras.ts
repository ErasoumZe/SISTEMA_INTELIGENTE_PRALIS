import type { HistoricoImportacaoDto, HistoricoResumoDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

// R-222 (PROJECT_BRAIN/55): estado e chamadas da aba "Histórico de compras". Dona do proprio
// carregamento, como as demais abas da fundacao. O dialogo de uma importacao tem a sua propria carga.
export function useHistoricoCompras(empresaId: Ref<string>) {
  const { apiUrl, apiGet } = useApi();

  const meses = ref(3);
  const busca = ref("");
  const resumo = ref<HistoricoResumoDto | null>(null);
  const importacoes = ref<HistoricoImportacaoDto[]>([]);
  const carregando = ref(false);
  const enviando = ref(false);
  const erro = ref("");
  const sucesso = ref("");

  // Guarda de sequencia: trocar empresa ou digitar rapido nao pode deixar a resposta velha na tela.
  let requisicao = 0;

  async function carregar() {
    if (!empresaId.value) return;
    const token = (requisicao += 1);
    carregando.value = true;
    erro.value = "";
    const empresa = encodeURIComponent(empresaId.value);
    const filtro = busca.value.trim() ? `&busca=${encodeURIComponent(busca.value.trim())}` : "";
    try {
      const [novoResumo, novasImportacoes] = await Promise.all([
        apiGet<HistoricoResumoDto>(`/api/compras/historico/resumo?empresaId=${empresa}&meses=${meses.value}${filtro}`),
        apiGet<HistoricoImportacaoDto[]>(`/api/compras/historico/importacoes?empresaId=${empresa}`)
      ]);
      if (token !== requisicao) return;
      resumo.value = novoResumo;
      importacoes.value = novasImportacoes;
    } catch (causa) {
      if (token !== requisicao) return;
      resumo.value = null;
      importacoes.value = [];
      erro.value = mensagemErro(causa);
    } finally {
      if (token === requisicao) carregando.value = false;
    }
  }

  /** Envia a planilha para ANALISE (nada vira historico ate aplicar). Devolve o id da importacao. */
  async function enviarPlanilha(arquivo: File): Promise<string | null> {
    enviando.value = true;
    erro.value = "";
    sucesso.value = "";
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const resposta = await fetch(
        `${apiUrl}/api/compras/historico/importacoes/analisar-arquivo?empresaId=${encodeURIComponent(empresaId.value)}`,
        { method: "POST", credentials: "include", body: corpo }
      );
      // 502 de proxy responde HTML: `json()` cru viraria "Unexpected token '<'" e esconderia a rede.
      type Resposta = { title?: string; data?: { id?: string } };
      const vazio: Resposta = {};
      const payload = await resposta
        .json()
        .then((json) => json as Resposta)
        .catch(() => vazio);
      if (!resposta.ok)
        throw new Error(payload.title || `Não foi possível analisar a planilha (HTTP ${resposta.status}).`);
      await carregar();
      return payload.data?.id ?? null;
    } catch (causa) {
      erro.value = mensagemErro(causa);
      return null;
    } finally {
      enviando.value = false;
    }
  }

  watch(empresaId, carregar, { immediate: true });
  watch(meses, carregar);
  // Busca com atraso: uma requisicao por tecla travaria a agregacao no banco a toa.
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  watch(busca, () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void carregar(), 350);
  });
  onBeforeUnmount(() => clearTimeout(temporizador));

  return { meses, busca, resumo, importacoes, carregando, enviando, erro, sucesso, carregar, enviarPlanilha };
}
