import { computed, onMounted, ref, watch } from "vue";
import { diaNegocio, paraCentavos } from "@padaria/shared";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { useTransferenciaModal } from "~/composables/useTransferenciaModal";
import { useApi } from "~/composables/useApi";

// Formulário contábil existente; não executa retorno/sangria manual.
export function useTransferenciaFormulario() {
  const {
    modalOperacaoAberto,
    entidadeNova,
    empresaId,
    operacaoEditandoId,
    form,
    opcoesEmpresa,
    salvandoOperacao,
    salvarOperacao,
    abrirOperacao
  } = useWorkspaceContext();
  const { apiGet } = useApi();

  const aberto = computed({
    get: () => modalOperacaoAberto.value && entidadeNova.value === "transferencia",
    set: (v: boolean) => {
      if (!v) modalOperacaoAberto.value = false;
    }
  });

  const {
    agendamento,
    multiploDestino,
    tempoConfirmacaoAberto,
    contasCandidatas,
    destinosSelecionados,
    erroDestino,
    destinoValido
  } = useTransferenciaModal({ aberto, form, opcoesEmpresa });

  // --- Resumo da Saida: calculado no FRONT a partir do campo visivel (nao persistido). ---
  const totalSaida = computed(() => Number(form.value.valorOriginal || 0));
  const erroComposicao = ref("");
  const erroLacre = ref("");
  const novoLacreRetorno = ref("");
  const lacresRetornoAtivos = ref(false);
  const confirmacaoAberta = ref(false);
  const criarNovaAposConfirmacao = ref(false);
  const contaOrigemSelecionada = computed(() =>
    opcoesEmpresa.value.contas.find((conta) => conta.id === form.value.contaOrigemId)
  );
  const contaDestinoSelecionada = computed(() =>
    opcoesEmpresa.value.contas.find((conta) => conta.id === form.value.contaDestinoId)
  );
  const preparandoMaloteParaCaixa = computed(() => {
    return Boolean(contaOrigemSelecionada.value?.ehCofre && contaDestinoSelecionada.value?.ehContaPdv);
  });
  const destinoSemPdv = computed(() => {
    return Boolean(
      contaOrigemSelecionada.value?.ehCofre &&
      contaDestinoSelecionada.value &&
      !contaDestinoSelecionada.value.ehContaPdv
    );
  });
  const composicaoMaloteInformada = computed(
    () => form.value.valorEspecieDeclarado.trim() !== "" && form.value.valorMoedasDeclarado.trim() !== ""
  );
  const composicaoMaloteBate = computed(
    () =>
      composicaoMaloteInformada.value &&
      paraCentavos(form.value.valorEspecieDeclarado) + paraCentavos(form.value.valorMoedasDeclarado) ===
        paraCentavos(form.value.valorOriginal)
  );
  const valorEspecieDeclarado = computed(() => paraCentavos(form.value.valorEspecieDeclarado) / 100);
  const valorMoedasDeclarado = computed(() => paraCentavos(form.value.valorMoedasDeclarado) / 100);
  const saldoOrigem = computed(() => contaOrigemSelecionada.value?.saldoAtual ?? null);
  const destinosConfirmacao = computed(() =>
    destinosSelecionados.value
      .map((id) => opcoesEmpresa.value.contas.find((conta) => conta.id === id)?.nome)
      .filter((nome): nome is string => Boolean(nome))
  );

  watch(
    () => form.value.nLacreDoc,
    () => {
      erroLacre.value = "";
    }
  );

  async function verificarLacreDisponivel(): Promise<boolean> {
    const numero = form.value.nLacreDoc.trim();
    erroLacre.value = "";
    if (!numero || !empresaId.value) return true;

    try {
      const movimentos = await apiGet<Array<{ id: string; nLacreDoc?: string | null }>>(
        `/api/transferencias?empresaId=${encodeURIComponent(empresaId.value)}&lacre=${encodeURIComponent(numero)}&page=1&pageSize=100`
      );
      const usado = movimentos.some(
        (movimento) =>
          movimento.id !== operacaoEditandoId.value &&
          movimento.nLacreDoc?.trim().toLocaleLowerCase() === numero.toLocaleLowerCase()
      );
      if (!usado || form.value.nLacreDoc.trim() !== numero) return !usado;
      erroLacre.value = `O lacre ${numero} ja foi utilizado em outra transferencia.`;
      return false;
    } catch {
      // A API continua sendo a autoridade final e devolve a mesma mensagem no salvamento. O
      // preflight e apenas um aviso antecipado, portanto uma falha de leitura nao bloqueia o fluxo.
      return true;
    }
  }

  watch(preparandoMaloteParaCaixa, (preparando) => {
    erroComposicao.value = "";
    if (!preparando) {
      form.value.valorEspecieDeclarado = "";
      form.value.valorMoedasDeclarado = "";
      form.value.lacresRetorno = [];
      form.value.lacreFechamentoPlanejado = "";
      novoLacreRetorno.value = "";
      lacresRetornoAtivos.value = false;
    }
  });
  watch(lacresRetornoAtivos, (ativo) => {
    if (!ativo) {
      form.value.lacresRetorno = [];
      novoLacreRetorno.value = "";
    }
  });
  watch(aberto, (estaAberto) => {
    if (!estaAberto) lacresRetornoAtivos.value = false;
  });
  // Ao reabrir uma transferência que já possui bolsas, revela a mesma área para edição.
  watch(
    () => form.value.lacresRetorno.length,
    (quantidade) => {
      if (quantidade) lacresRetornoAtivos.value = true;
    },
    { immediate: true }
  );
  const lacresRetornoDuplicados = computed(
    () => new Set(form.value.lacresRetorno.map((lacre) => lacre.trim())).size !== form.value.lacresRetorno.length
  );
  const lacreFechamentoConflita = computed(() => {
    const lacre = form.value.lacreFechamentoPlanejado.trim();
    return Boolean(
      lacre &&
      (lacre === form.value.nLacreDoc.trim() || form.value.lacresRetorno.map((item) => item.trim()).includes(lacre))
    );
  });
  function adicionarLacreRetorno() {
    const numero = novoLacreRetorno.value.trim();
    if (!numero || form.value.lacresRetorno.includes(numero)) return;
    form.value.lacresRetorno.push(numero);
    novoLacreRetorno.value = "";
  }
  function removerLacreRetorno(indice: number) {
    form.value.lacresRetorno.splice(indice, 1);
  }
  function br(n: number) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Olho do resumo: mesma ideia de app de banco. A escolha e do USUARIO, entao sobrevive a fechar e
  // reabrir o modal. Default visivel; le no onMounted para nao tocar em localStorage durante o SSR.
  const CHAVE_RESUMO_VISIVEL = "cicluz:transferencia:resumo-visivel";
  const resumoVisivel = ref(true);
  onMounted(() => {
    resumoVisivel.value = localStorage.getItem(CHAVE_RESUMO_VISIVEL) !== "0";
  });
  watch(resumoVisivel, (visivel) => localStorage.setItem(CHAVE_RESUMO_VISIVEL, visivel ? "1" : "0"));
  // Oculto, o NUMERO some e o rotulo fica. A largura do card e do flex, nao do texto — nao pula.
  function valorResumo(n: number) {
    return resumoVisivel.value ? `R$ ${br(n)}` : "R$ ••••";
  }

  async function revisarTransferencia(criarNova = false) {
    if (!destinoValido()) return;
    // A transferência imediata sempre pertence ao dia real do ato. Hora exata já é registrada
    // pelo banco em `criadoEm`; se for agendada, a data/hora escolhida fica em `agendadaPara`.
    if (!form.value.agendadaPara) form.value.dataReferencia = diaNegocio(new Date());
    if (preparandoMaloteParaCaixa.value && !composicaoMaloteInformada.value) {
      erroComposicao.value = "Informe dinheiro físico e moedas do malote.";
      return;
    }
    if (preparandoMaloteParaCaixa.value && !composicaoMaloteBate.value) {
      erroComposicao.value = "Dinheiro físico + moedas deve ser igual ao valor total.";
      return;
    }
    if (preparandoMaloteParaCaixa.value && lacresRetornoDuplicados.value) {
      erroComposicao.value = "Cada lacre de retorno / sangria deve ser informado uma unica vez.";
      return;
    }
    if (preparandoMaloteParaCaixa.value && !form.value.lacreFechamentoPlanejado.trim()) {
      erroComposicao.value = "Informe o lacre aberto reservado para o fechamento do Caixa.";
      return;
    }
    if (preparandoMaloteParaCaixa.value && lacreFechamentoConflita.value) {
      erroComposicao.value = "O lacre de fechamento deve ser diferente do lacre principal e dos lacres de sangria.";
      return;
    }
    if (!(await verificarLacreDisponivel())) return;
    erroComposicao.value = "";
    criarNovaAposConfirmacao.value = criarNova;
    confirmacaoAberta.value = true;
  }

  async function confirmarTransferencia() {
    const resultado = await salvarOperacao();
    if (!resultado) return;
    confirmacaoAberta.value = false;
    if (criarNovaAposConfirmacao.value) await abrirOperacao("transferencia");
  }

  return {
    aberto,
    operacaoEditandoId,
    form,
    opcoesEmpresa,
    salvandoOperacao,
    agendamento,
    multiploDestino,
    tempoConfirmacaoAberto,
    contasCandidatas,
    destinosSelecionados,
    erroDestino,
    totalSaida,
    erroComposicao,
    erroLacre,
    novoLacreRetorno,
    lacresRetornoAtivos,
    confirmacaoAberta,
    contaOrigemSelecionada,
    destinoSemPdv,
    preparandoMaloteParaCaixa,
    composicaoMaloteInformada,
    composicaoMaloteBate,
    valorEspecieDeclarado,
    valorMoedasDeclarado,
    saldoOrigem,
    destinosConfirmacao,
    verificarLacreDisponivel,
    adicionarLacreRetorno,
    removerLacreRetorno,
    resumoVisivel,
    valorResumo,
    revisarTransferencia,
    confirmarTransferencia
  };
}
