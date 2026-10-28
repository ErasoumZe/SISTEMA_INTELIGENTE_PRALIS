<script setup lang="ts">
import { computed, watch } from "vue";

// Lacre de fechamento (R-200). Quando a Tesouraria reservou um lacre para este malote o operador SELECIONA esse
// lacre em vez de digitar (so o lacre de abertura continua digitado). Sem reserva nao ha de onde selecionar:
// o campo segue digitado e obrigatorio. O servidor nao mudou: ele continua recusando lacre diferente do reservado.
const lacre = defineModel<string>({ required: true });
const props = defineProps<{ reservado: string | null; pendente: boolean }>();

const itens = computed(() => (props.reservado ? [props.reservado] : []));
const mensagemErro = computed(() =>
  props.pendente
    ? props.reservado
      ? "Selecione o lacre antes de fechar o caixa."
      : "Informe o lacre antes de fechar o caixa."
    : ""
);

// Um valor digitado antes de a reserva aparecer nao serve mais: o unico valido e o reservado.
watch(
  () => props.reservado,
  (reservado) => {
    if (reservado && lacre.value.trim() !== reservado) lacre.value = "";
  },
  { immediate: true }
);
</script>

<template>
  <v-select
    v-if="reservado"
    v-model="lacre"
    :items="itens"
    label="Lacre de fechamento (selecione o reservado)"
    hint="Selecione o lacre reservado pela Tesouraria para este malote."
    persistent-hint
    :color="pendente ? 'error' : 'primary'"
    :base-color="pendente ? 'error' : undefined"
    :error="pendente"
    :error-messages="mensagemErro"
    prepend-inner-icon="mdi-lock-alert-outline"
    clearable
    data-teste="lacre-fechamento"
  />
  <v-text-field
    v-else
    v-model="lacre"
    label="Lacre de fechamento (obrigatório)"
    placeholder="Ex.: FCH-001"
    hint="Identifica o lacre físico colocado ao fechar a gaveta. Obrigatório em todo fechamento."
    persistent-hint
    :color="pendente ? 'error' : 'primary'"
    :base-color="pendente ? 'error' : undefined"
    :error="pendente"
    :error-messages="mensagemErro"
    prepend-inner-icon="mdi-lock-alert-outline"
    required
    data-teste="lacre-fechamento"
  />
</template>
