/**
 * Importacao do de-para do SIA (igual a tela `depara-sia` do app oficial): conferir sem gravar e,
 * sem problema nenhum, substituir o de-para da loja inteiro com a frase de confirmacao.
 */
export interface ResumoDeParaSia {
  loja: string;
  arquivo: string;
  linhas: number;
  semBarras: number;
  semDadosBalanca: number;
  teclaAssumida: number;
  atuais: number;
  ultimaImportacao: string | null;
  barrasAmbiguas: Array<{ chave: string; coditens: string[] }>;
  coditensRepetidos: string[];
  faixa: { min: number; max: number } | null;
  entrega: number;
  confirmacao: string;
}

export function useDeParaSia(empresaId: Ref<string>) {
  const { apiUrl } = useApi();
  const arquivo = ref<File | null>(null);
  const resumo = ref<ResumoDeParaSia | null>(null);
  const confirmacao = ref("");
  const conferindo = ref(false);
  const gravando = ref(false);
  const erro = ref("");
  const sucesso = ref("");

  // Trocar arquivo ou loja invalida a conferencia: gravar tem de ser sobre o que foi conferido.
  watch([arquivo, empresaId], () => {
    resumo.value = null;
    confirmacao.value = "";
  });

  const problemas = computed(() => {
    const atual = resumo.value;
    if (!atual) return 0;
    return atual.barrasAmbiguas.length + atual.coditensRepetidos.length + (atual.semDadosBalanca ? 1 : 0);
  });
  const podeGravar = computed(
    () =>
      Boolean(resumo.value) &&
      problemas.value === 0 &&
      (resumo.value?.linhas ?? 0) > 0 &&
      confirmacao.value.trim().toUpperCase() === resumo.value?.confirmacao
  );

  async function enviar<T>(rota: string): Promise<T> {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo.value as File);
    const resposta = await fetch(`${apiUrl}${rota}`, { method: "POST", credentials: "include", body: corpo });
    const conteudo = (await resposta.json().catch(() => null)) as { data?: T; title?: string } | null;
    if (!resposta.ok) throw new Error(conteudo?.title ?? "Não foi possível processar o arquivo.");
    return conteudo?.data as T;
  }

  async function conferir() {
    if (!arquivo.value || !empresaId.value) return;
    conferindo.value = true;
    erro.value = "";
    sucesso.value = "";
    try {
      resumo.value = await enviar<ResumoDeParaSia>(
        `/api/produtos/sia-depara/previa?empresaId=${encodeURIComponent(empresaId.value)}`
      );
    } catch (falha) {
      erro.value = falha instanceof Error ? falha.message : "Não consegui conferir o arquivo.";
    } finally {
      conferindo.value = false;
    }
  }

  async function gravar() {
    if (!podeGravar.value) return;
    gravando.value = true;
    erro.value = "";
    try {
      const consulta = new URLSearchParams({ empresaId: empresaId.value, confirmacao: confirmacao.value });
      const feito = await enviar<{ loja: string; gravadas: number; substituidas: number }>(
        `/api/produtos/sia-depara?${consulta}`
      );
      sucesso.value = `De-para de ${feito.loja} substituído: ${feito.gravadas} linha(s) no lugar de ${feito.substituidas}.`;
      resumo.value = null;
      confirmacao.value = "";
      arquivo.value = null;
    } catch (falha) {
      erro.value = falha instanceof Error ? falha.message : "Não consegui gravar.";
    } finally {
      gravando.value = false;
    }
  }

  return { arquivo, resumo, confirmacao, conferindo, gravando, erro, sucesso, problemas, podeGravar, conferir, gravar };
}
