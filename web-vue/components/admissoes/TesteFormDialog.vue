<script setup lang="ts">
import type { CargoOpcaoDto, TesteDetalheDto } from "@padaria/shared";
import { cpfValido } from "@padaria/shared";
import { apenasDigitos, dataHoraLocal, dataHoraParaUtc, mascararCpf } from "~/utils/formatacao";

const props = defineProps<{
  aberto: boolean;
  teste: TesteDetalheDto | null;
  cargos: CargoOpcaoDto[];
  salvando: boolean;
  erro: string;
}>();

const emit = defineEmits<{
  (event: "salvar", payload: Record<string, unknown>): void;
  (event: "fechar"): void;
  (event: "verificarCpf", cpf: string): void;
}>();

const editando = computed(() => Boolean(props.teste));

const form = reactive({
  nomeCompleto: "",
  cpf: "",
  cargoId: "",
  jornadaHorario: "",
  inicioEm: "",
  fimCombinadoEm: ""
});

// Na EDICAO o CPF nasce fechado: o formulario nao tem o valor (o detalhe devolve mascarado) e nao
// vai buscar sozinho — revelar sem alguem pedir geraria um evento de auditoria falso. Quem quer
// trocar abre este campo e digita o novo; enquanto ele estiver fechado, o CPF nao viaja e o
// servidor preserva o gravado.
const alterandoCpf = ref(false);
const cpfEmUso = computed(() => !editando.value || alterandoCpf.value);

watch(
  () => [props.aberto, props.teste] as const,
  ([aberto, teste]) => {
    if (!aberto) return;
    alterandoCpf.value = false;
    form.nomeCompleto = teste?.nomeCompleto ?? "";
    form.cpf = "";
    form.cargoId = teste?.cargoId ?? "";
    form.jornadaHorario = teste?.jornadaHorario ?? "";
    form.inicioEm = teste ? dataHoraLocal(teste.inicioEm) : "";
    form.fimCombinadoEm = teste ? dataHoraLocal(teste.fimCombinadoEm) : "";
  },
  { immediate: true }
);

function aoDigitarCpf(valor: string) {
  form.cpf = mascararCpf(valor);
  const digitos = apenasDigitos(form.cpf);
  if (digitos.length === 11 && cpfValido(digitos)) emit("verificarCpf", digitos);
}

const erroNome = computed(() => (form.nomeCompleto.trim() ? "" : "Informe o nome completo."));
const erroCpf = computed(() => {
  if (!cpfEmUso.value) return "";
  const digitos = apenasDigitos(form.cpf);
  if (!digitos) return "Informe o CPF.";
  if (digitos.length !== 11) return "O CPF precisa ter 11 dígitos.";
  return cpfValido(digitos) ? "" : "CPF inválido.";
});
const erroCargo = computed(() => (form.cargoId ? "" : "Escolha o cargo."));
const erroJornada = computed(() => (form.jornadaHorario.trim() ? "" : "Informe a jornada ou o horário combinado."));
const erroInicio = computed(() => (form.inicioEm ? "" : "Informe a data e hora de início."));
const erroFim = computed(() => {
  if (!form.fimCombinadoEm) return "Informe a data e hora do fim combinado.";
  if (!form.inicioEm) return "";
  return new Date(form.fimCombinadoEm) > new Date(form.inicioEm)
    ? ""
    : "O fim combinado precisa ser depois do início.";
});

const invalido = computed(() =>
  Boolean(
    erroNome.value || erroCpf.value || erroCargo.value || erroJornada.value || erroInicio.value || erroFim.value
  )
);

function salvar() {
  if (invalido.value) return;
  const payload: Record<string, unknown> = {
    nomeCompleto: form.nomeCompleto.trim(),
    cargoId: form.cargoId,
    jornadaHorario: form.jornadaHorario.trim(),
    inicioEm: dataHoraParaUtc(form.inicioEm),
    fimCombinadoEm: dataHoraParaUtc(form.fimCombinadoEm)
  };
  // CPF so viaja quando esta realmente em uso. Na edicao com o campo fechado, omitir e o que faz o
  // servidor preservar o valor gravado.
  if (cpfEmUso.value) payload["cpf"] = apenasDigitos(form.cpf);
  if (props.teste) payload["versao"] = props.teste.versao;
  emit("salvar", payload);
}
</script>

<template>
  <v-dialog
    :model-value="aberto"
    max-width="820"
    scrollable
    persistent
    @update:model-value="(valor) => !valor && emit('fechar')"
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between ga-3">
        <span>{{ editando ? "Editar período de teste" : "Novo período de teste" }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
      </v-card-title>

      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="comfortable" class="mb-4">{{ erro }}</v-alert>

        <div class="bloco-form">
          <h3 class="bloco-titulo">Identificação</h3>
          <v-row dense>
            <v-col cols="12" md="7">
              <v-text-field
                v-model="form.nomeCompleto"
                label="Nome completo *"
                :error-messages="erroNome"
                density="comfortable"
                maxlength="180"
                autofocus
              />
            </v-col>
            <v-col cols="12" md="5">
              <v-text-field
                v-if="cpfEmUso"
                :model-value="form.cpf"
                label="CPF *"
                placeholder="000.000.000-00"
                inputmode="numeric"
                :error-messages="erroCpf"
                density="comfortable"
                maxlength="14"
                @update:model-value="aoDigitarCpf"
              />
              <div v-else class="cpf-preservado">
                <v-text-field
                  :model-value="teste?.cpfMascarado ?? ''"
                  label="CPF"
                  density="comfortable"
                  readonly
                  hide-details
                />
                <v-btn variant="text" size="small" class="mt-1" @click="alterandoCpf = true">Alterar CPF</v-btn>
              </div>
            </v-col>
          </v-row>
        </div>

        <div class="bloco-form">
          <h3 class="bloco-titulo">Combinado</h3>
          <v-row dense>
            <v-col cols="12" md="5">
              <v-select
                v-model="form.cargoId"
                :items="cargos"
                item-title="nome"
                item-value="id"
                label="Cargo *"
                :error-messages="erroCargo"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" md="7">
              <v-text-field
                v-model="form.jornadaHorario"
                label="Jornada / horário combinado *"
                placeholder="ex.: seg a sex, 08:00 às 17:00"
                :error-messages="erroJornada"
                density="comfortable"
                maxlength="120"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.inicioEm"
                type="datetime-local"
                label="Início *"
                :error-messages="erroInicio"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.fimCombinadoEm"
                type="datetime-local"
                label="Fim combinado *"
                :error-messages="erroFim"
                density="comfortable"
              />
            </v-col>
          </v-row>
          <p class="bloco-nota">
            O sistema avisa quando o prazo vence, mas não encerra nem efetiva nada sozinho.
          </p>
        </div>
      </v-card-text>

      <v-card-actions class="acoes-form">
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="emit('fechar')">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :loading="salvando" :disabled="invalido" @click="salvar">
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.bloco-form + .bloco-form {
  margin-top: var(--cx-sp-6);
}

.bloco-titulo {
  font-size: var(--cx-fs-caption);
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
  color: var(--cx-ink-soft);
  margin-bottom: var(--cx-sp-3);
}

.bloco-nota {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  margin-top: var(--cx-sp-2);
}

.cpf-preservado {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* <=768: o rodape do modal fica colado embaixo, com Salvar e Cancelar sempre visiveis. E a regra
   que separa formulario usavel de inutilizavel no celular (PROJECT_BRAIN/67 secao 13.3). */
@media (max-width: 768px) {
  .acoes-form {
    position: sticky;
    bottom: 0;
    background: var(--cx-surface);
    border-top: 1px solid var(--cx-line-soft);
  }
}
</style>
