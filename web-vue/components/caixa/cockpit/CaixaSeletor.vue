<script setup lang="ts">
import type { OpcaoCaixaSeletor } from "~/utils/cockpit-caixa";
import { formatarDataHora } from "~/utils/formatacao";

const props = defineProps<{
  opcoes: OpcaoCaixaSeletor[];
  modelValue: string;
  carregando?: boolean;
}>();

const emit = defineEmits<{ (event: "update:modelValue", valor: string): void }>();

const statusRotulo: Record<string, string> = { aberto: "Aberto", fechado: "Fechado", ajustado: "Ajustado" };

const itens = computed(() =>
  props.opcoes.map((opcao) => {
    const partes = [
      opcao.pdvNome || "PDV",
      opcao.operadorNome || "sem operador",
      statusRotulo[opcao.status] ?? opcao.status
    ];
    if (opcao.dataHoraAbertura) partes.push(formatarDataHora(opcao.dataHoraAbertura));
    return {
      value: opcao.id,
      title: partes.join(" · ") + (opcao.ehProprioAberto ? " · (meu caixa)" : "")
    };
  })
);
</script>

<template>
  <v-select
    :model-value="modelValue"
    :items="itens"
    :loading="carregando"
    label="Caixa"
    density="comfortable"
    variant="outlined"
    hide-details
    prepend-inner-icon="mdi-cash-register"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
