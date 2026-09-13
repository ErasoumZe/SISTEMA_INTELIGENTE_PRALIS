import { computed, ref, watch, type Ref } from "vue";
import { paraCentavos } from "@padaria/shared";
import type { OperacaoForm, Opcoes } from "~/types/padaria";

type DependenciasTransferenciaModal = {
  aberto: Readonly<Ref<boolean>>;
  empresaId: Readonly<Ref<string>>;
  form: Ref<OperacaoForm>;
  opcoesEmpresa: Readonly<Ref<Opcoes>>;
};

// Estado e regras dos modos da transferencia. Fica fora do componente visual para que nenhuma
// checkbox deixe valor escondido no payload e para manter o modal abaixo do limite estrutural.
export function useTransferenciaModal({ aberto, empresaId, form, opcoesEmpresa }: DependenciasTransferenciaModal) {
  const agendamento = computed({
    get: () => Boolean(form.value.agendadaPara),
    set: (ativo: boolean) => {
      form.value.agendadaPara = ativo ? new Date(Date.now() + 3_600_000).toISOString().slice(0, 16) : "";
    }
  });
  const multiploDestino = ref(false);
  const tempoConfirmacaoAberto = ref(false);
  const retornoAtivo = ref(false);
  const retornosEmEspera = ref<OperacaoForm["retornosPlanejados"]>([]);
  const preservarRetornosAoDesativar = ref(false);
  const erroPlanejamento = ref("");
  const erroDestino = ref("");

  function adicionarRetornoPlanejado() {
    if (form.value.retornosPlanejados.length >= 20) return;
    form.value.retornosPlanejados.push({ valor: "", nLacreDoc: "" });
  }

  function removerRetornoPlanejado(indice: number) {
    form.value.retornosPlanejados.splice(indice, 1);
    if (!form.value.retornosPlanejados.length) retornoAtivo.value = false;
  }

  watch(aberto, (estaAberto) => {
    if (!estaAberto) return;
    erroPlanejamento.value = "";
    retornosEmEspera.value = [];
    preservarRetornosAoDesativar.value = false;
    retornoAtivo.value = form.value.retornosPlanejados.length > 0;
    multiploDestino.value = !retornoAtivo.value && form.value.contasDestinoIds.length > 0;
    tempoConfirmacaoAberto.value =
      !retornoAtivo.value && !multiploDestino.value && Boolean(form.value.tempoConfirmacao);
    if (retornoAtivo.value || multiploDestino.value) form.value.tempoConfirmacao = null;
  });

  watch(multiploDestino, (ativo) => {
    erroDestino.value = "";
    if (!ativo) {
      form.value.contasDestinoIds = [];
      return;
    }
    retornoAtivo.value = false;
    form.value.retornosPlanejados = [];
    tempoConfirmacaoAberto.value = false;
    form.value.tempoConfirmacao = null;
  });

  watch(tempoConfirmacaoAberto, (ativo) => {
    erroDestino.value = "";
    if (!ativo) {
      form.value.tempoConfirmacao = null;
      return;
    }
    multiploDestino.value = false;
    form.value.contasDestinoIds = [];
    retornoAtivo.value = false;
    form.value.retornosPlanejados = [];
    form.value.tempoConfirmacao ??= "1dia";
  });

  watch(retornoAtivo, (ativo) => {
    erroPlanejamento.value = "";
    if (!ativo) {
      if (!preservarRetornosAoDesativar.value) retornosEmEspera.value = [];
      preservarRetornosAoDesativar.value = false;
      form.value.retornosPlanejados = [];
      return;
    }
    if (!form.value.retornosPlanejados.length && retornosEmEspera.value.length) {
      form.value.retornosPlanejados = retornosEmEspera.value.map((retorno) => ({ ...retorno }));
      retornosEmEspera.value = [];
    }
    if (!form.value.retornosPlanejados.length) adicionarRetornoPlanejado();
    multiploDestino.value = false;
    form.value.contasDestinoIds = [];
    tempoConfirmacaoAberto.value = false;
    form.value.tempoConfirmacao = null;
  });

  function planejamentosValidos() {
    const planos = form.value.retornosPlanejados;
    if (!planos.length) return true;
    const lacres = new Set<string>();
    const totalPlanejadoCentavos = planos.reduce((total, plano) => total + paraCentavos(plano.valor), 0);
    if (planos.some((plano) => !plano.valor || paraCentavos(plano.valor) <= 0 || !plano.nLacreDoc.trim())) {
      erroPlanejamento.value = "Informe valor e lacre em cada transferencia de retorno.";
      return false;
    }
    for (const plano of planos) {
      const lacre = plano.nLacreDoc.trim().toLowerCase();
      if (lacre === form.value.nLacreDoc.trim().toLowerCase() || lacres.has(lacre)) {
        erroPlanejamento.value = "Cada transferência precisa de um lacre diferente.";
        return false;
      }
      lacres.add(lacre);
    }
    if (totalPlanejadoCentavos > paraCentavos(form.value.valorOriginal)) {
      erroPlanejamento.value = "O total programado não pode ser maior que a transferência inicial.";
      return false;
    }
    erroPlanejamento.value = "";
    return true;
  }

  const contasCandidatas = computed(() =>
    opcoesEmpresa.value.contas.filter((conta) => conta.id !== form.value.contaOrigemId)
  );
  const contasPdvAtivas = computed(
    () => new Set(opcoesEmpresa.value.pdvs.filter((pdv) => pdv.ativo !== false).map((pdv) => pdv.contaId))
  );
  const contaCofreId = computed(
    () => opcoesEmpresa.value.empresas.find((empresa) => empresa.id === empresaId.value)?.contaCofreId ?? ""
  );
  const rotaPlanejamentoElegivel = computed(
    () =>
      Boolean(contaCofreId.value) &&
      form.value.contaOrigemId === contaCofreId.value &&
      contasPdvAtivas.value.has(form.value.contaDestinoId) &&
      !agendamento.value &&
      !multiploDestino.value &&
      !tempoConfirmacaoAberto.value
  );
  const ajudaRetorno = computed(() => {
    if (agendamento.value) return "Transferência de retorno indisponível enquanto Agendamento estiver ativo.";
    if (tempoConfirmacaoAberto.value)
      return "Transferência de retorno indisponível enquanto Tempo de confirmação estiver ativo.";
    if (multiploDestino.value) return "Transferência de retorno indisponível enquanto Múltiplo Destino estiver ativo.";
    if (!rotaPlanejamentoElegivel.value)
      return "Selecione Cofre como origem e uma conta de PDV ativa como destino para preparar o retorno.";
    return "";
  });

  watch(rotaPlanejamentoElegivel, (elegivel) => {
    if (!elegivel && retornoAtivo.value) {
      retornosEmEspera.value = form.value.retornosPlanejados.map((retorno) => ({ ...retorno }));
      preservarRetornosAoDesativar.value = true;
      retornoAtivo.value = false;
    }
  });

  const destinosSelecionados = computed<string[]>({
    get: () => {
      const ancora = form.value.contaDestinoId;
      const demais = form.value.contasDestinoIds;
      return ancora ? [ancora, ...demais.filter((id) => id !== ancora)] : [...demais];
    },
    set: (ids) => {
      const unicos = [...new Set(ids)];
      form.value.contaDestinoId = unicos[0] ?? "";
      form.value.contasDestinoIds = unicos.slice(1);
    }
  });

  watch(
    () => form.value.contaOrigemId,
    (origem) => {
      if (origem && destinosSelecionados.value.includes(origem)) {
        destinosSelecionados.value = destinosSelecionados.value.filter((id) => id !== origem);
      }
    }
  );
  watch(destinosSelecionados, (ids) => {
    if ((multiploDestino.value && ids.length >= 2) || (!multiploDestino.value && ids.length >= 1)) {
      erroDestino.value = "";
    }
  });

  function destinoValido() {
    if (multiploDestino.value && destinosSelecionados.value.length < 2) {
      erroDestino.value = "Selecione ao menos duas contas de destino.";
      return false;
    }
    if (form.value.contaDestinoId) {
      erroDestino.value = "";
      return true;
    }
    erroDestino.value = multiploDestino.value
      ? "Selecione ao menos uma conta de destino."
      : "Escolha a conta de destino.";
    return false;
  }

  return {
    agendamento,
    multiploDestino,
    tempoConfirmacaoAberto,
    retornoAtivo,
    erroPlanejamento,
    adicionarRetornoPlanejado,
    removerRetornoPlanejado,
    planejamentosValidos,
    contasCandidatas,
    rotaPlanejamentoElegivel,
    ajudaRetorno,
    destinosSelecionados,
    erroDestino,
    destinoValido
  };
}
