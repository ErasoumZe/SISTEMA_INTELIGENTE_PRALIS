import { computed, ref, watch, type Ref } from "vue";
import type { OperacaoForm, Opcoes } from "~/types/padaria";

type DependenciasTransferenciaModal = {
  aberto: Readonly<Ref<boolean>>;
  form: Ref<OperacaoForm>;
  opcoesEmpresa: Readonly<Ref<Opcoes>>;
};

// Modal genérico só cuida de transferência contábil. Retorno/sangria é ato físico e nasce no
// Caixa aberto; não há campo, estado ou payload alternativo nesta tela.
export function useTransferenciaModal({ aberto, form, opcoesEmpresa }: DependenciasTransferenciaModal) {
  const agendamento = computed({
    get: () => Boolean(form.value.agendadaPara),
    set: (ativo: boolean) => {
      form.value.agendadaPara = ativo ? new Date(Date.now() + 3_600_000).toISOString().slice(0, 16) : "";
    }
  });
  const multiploDestino = ref(false);
  const tempoConfirmacaoAberto = ref(false);
  const erroDestino = ref("");

  watch(aberto, (estaAberto) => {
    if (!estaAberto) return;
    multiploDestino.value = form.value.contasDestinoIds.length > 0;
    tempoConfirmacaoAberto.value = !multiploDestino.value && Boolean(form.value.tempoConfirmacao);
  });

  watch(multiploDestino, (ativo) => {
    erroDestino.value = "";
    if (!ativo) {
      form.value.contasDestinoIds = [];
      return;
    }
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
    form.value.tempoConfirmacao ??= "1dia";
  });

  const contasCandidatas = computed(() =>
    opcoesEmpresa.value.contas.filter((conta) => conta.id !== form.value.contaOrigemId)
  );
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
    contasCandidatas,
    destinosSelecionados,
    erroDestino,
    destinoValido
  };
}
