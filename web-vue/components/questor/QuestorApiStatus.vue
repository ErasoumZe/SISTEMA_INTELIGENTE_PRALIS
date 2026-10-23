<script setup lang="ts">
import { ErroApiCliente } from "~/composables/useApi";

const props = defineProps<{ erro: unknown }>();

const mensagem = computed(() => {
  if (props.erro instanceof ErroApiCliente) {
    if (props.erro.status === 403) return "Você não possui a permissão para configurar o Questor.";
    if (props.erro.status === 404 || props.erro.status === 503 || props.erro.codigo === "QUESTOR_MIGRATION_PENDENTE") {
      return "A API Questor ainda não está disponível neste ambiente. As rotas e migrations continuam pendentes.";
    }
    if (props.erro.status === 409)
      return "Outra pessoa alterou estes dados. Recarregue a tela antes de salvar novamente.";
    return "Não foi possível concluir a operação Questor. Verifique a API e tente novamente.";
  }
  return props.erro instanceof Error ? props.erro.message : "Não foi possível concluir a operação Questor.";
});
</script>

<template>
  <v-alert type="warning" variant="tonal" density="comfortable" role="alert">
    {{ mensagem }}
  </v-alert>
</template>
