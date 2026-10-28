<script setup lang="ts">
import { computed } from "vue";
import type { Opcao } from "~/types/padaria";

export type FiltrosFechamento = { dataInicio: string; dataFim: string; pdvId: string; turnoId: string; status: string };

// Filtros do Relatorio de fechamento: periodo, PDV, turno e situacao. Quem filtra e a pagina; aqui so se edita o
// objeto (v-model) e se pede "Filtrar" ou "Limpar".
const filtros = defineModel<FiltrosFechamento>({ required: true });
defineProps<{ pdvs: Opcao[]; turnos: Opcao[]; carregando: boolean }>();
const emit = defineEmits<{ (event: "aplicar"): void; (event: "limpar"): void }>();

const statusOpcoes = [
  { title: "Todos os estados", value: "" },
  { title: "Aberto", value: "aberto" },
  { title: "Em fechamento", value: "em_fechamento" },
  { title: "Fechado", value: "fechado" },
  { title: "Ajustado", value: "ajustado" }
];
const periodoInvertido = computed(() =>
  Boolean(filtros.value.dataInicio && filtros.value.dataFim && filtros.value.dataInicio > filtros.value.dataFim)
);
</script>

<template>
  <form class="filtros" aria-label="Filtros do relatório de fechamento" @submit.prevent="emit('aplicar')">
    <v-row dense>
      <v-col cols="12" sm="6" md="2"
        ><v-text-field v-model="filtros.dataInicio" type="date" label="Data inicial" hide-details="auto"
      /></v-col>
      <v-col cols="12" sm="6" md="2"
        ><v-text-field
          v-model="filtros.dataFim"
          type="date"
          label="Data final"
          :error="periodoInvertido"
          :error-messages="periodoInvertido ? 'A data final é anterior à inicial.' : undefined"
          hide-details="auto"
      /></v-col>
      <v-col cols="12" sm="6" md="3"
        ><v-select
          v-model="filtros.pdvId"
          :items="pdvs"
          item-title="nome"
          item-value="id"
          label="PDV"
          clearable
          hide-details
      /></v-col>
      <v-col cols="12" sm="6" md="3"
        ><v-select
          v-model="filtros.turnoId"
          :items="turnos"
          item-title="nome"
          item-value="id"
          label="Turno"
          clearable
          hide-details
      /></v-col>
      <v-col cols="12" md="2"
        ><v-select v-model="filtros.status" :items="statusOpcoes" label="Situação" hide-details
      /></v-col>
    </v-row>
    <div class="filtros__acoes">
      <v-btn
        type="submit"
        color="primary"
        variant="flat"
        class="filtros__botao"
        prepend-icon="mdi-magnify"
        :loading="carregando"
        :disabled="periodoInvertido"
        >Filtrar</v-btn
      >
      <v-btn
        color="secondary"
        variant="outlined"
        class="filtros__botao"
        prepend-icon="mdi-filter-remove"
        @click="emit('limpar')"
        >Limpar</v-btn
      >
    </div>
  </form>
</template>

<style scoped>
.filtros__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  margin-top: var(--cx-sp-3);
}
.filtros__botao {
  min-height: 44px;
}
@media (width <= 480px) {
  .filtros__acoes,
  .filtros__botao {
    width: 100%;
  }
}
</style>
