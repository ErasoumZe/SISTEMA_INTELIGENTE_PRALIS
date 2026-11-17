<script setup lang="ts">
import { ref, watch } from "vue";
import type { AgendaAuditoria } from "@padaria/shared";

// Auditoria automatica: liga/desliga e escolhe o horario do dia em que o sistema gera a auditoria sozinho.
const props = defineProps<{ modelValue: boolean; agenda: AgendaAuditoria; salvando: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", aberto: boolean): void;
  (e: "salvar", agenda: AgendaAuditoria): void;
}>();

const ativa = ref(props.agenda.ativa);
const horario = ref(props.agenda.horario);
watch(
  () => [props.modelValue, props.agenda] as const,
  () => {
    ativa.value = props.agenda.ativa;
    horario.value = props.agenda.horario;
  }
);
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="440" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>Auditoria automática</v-card-title>
      <v-card-text>
        <p class="mb-4">
          No horário escolhido, o sistema gera a auditoria do dia e avisa a Tesouraria se houver venda fora de caixa.
        </p>
        <v-switch v-model="ativa" color="primary" label="Gerar sozinho todo dia" hide-details inset />
        <v-text-field v-model="horario" class="mt-4" type="time" label="Horário" :disabled="!ativa" hide-details />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Voltar</v-btn>
        <v-btn color="primary" variant="flat" :loading="salvando" @click="emit('salvar', { ativa, horario })"
          >Salvar</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
