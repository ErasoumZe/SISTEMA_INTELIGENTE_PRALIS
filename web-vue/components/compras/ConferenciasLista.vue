<script setup lang="ts">
import { ROTULO_RANKING_CONFERENCIA, type ConferenciaResumoDto } from "@padaria/shared";

// Conferências a fazer e feitas (doc 57 §1). Cada uma abre a contagem.
const props = defineProps<{ conferencias: ConferenciaResumoDto[]; carregando: boolean }>();
const emit = defineEmits<{ abrir: [conferencia: ConferenciaResumoDto] }>();

const aba = ref<"fazer" | "feitas">("fazer");
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const aFazer = computed(() =>
  props.conferencias.filter((item) => item.status === "agendada").sort((a, b) => a.data.localeCompare(b.data))
);
const feitas = computed(() => props.conferencias.filter((item) => item.status !== "agendada"));
const lista = computed(() => (aba.value === "fazer" ? aFazer.value : feitas.value));

function recorte(item: ConferenciaResumoDto) {
  return (
    [
      item.grupo,
      item.ranking ? ROTULO_RANKING_CONFERENCIA[item.ranking] : null,
      item.areaEstoque,
      item.localEstoque,
      item.localVenda
    ]
      .filter(Boolean)
      .join(" · ") || "Todo o estoque"
  );
}
</script>

<template>
  <v-card data-secao="conferencias">
    <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2">
      <span>Conferências</span>
      <v-btn-toggle v-model="aba" mandatory density="compact" color="primary" divided>
        <v-btn value="fazer" size="small">A fazer ({{ aFazer.length }})</v-btn>
        <v-btn value="feitas" size="small">Feitas ({{ feitas.length }})</v-btn>
      </v-btn-toggle>
    </v-card-title>
    <v-progress-linear v-if="carregando" indeterminate />
    <v-card-text class="d-grid ga-2">
      <p v-if="!carregando && !lista.length" class="text-medium-emphasis mb-0">
        {{ aba === "fazer" ? "Nenhuma conferência para fazer." : "Nenhuma conferência concluída ainda." }}
      </p>
      <button
        v-for="item in lista"
        :key="item.id"
        type="button"
        class="conferencia"
        :data-conferencia="item.id"
        @click="emit('abrir', item)"
      >
        <div class="conferencia__texto">
          <strong>{{ recorte(item) }}</strong>
          <span class="text-caption text-medium-emphasis"
            >{{ DATA_HORA.format(new Date(item.data)) }} · {{ item.responsavelNome ?? "Sem responsável" }}</span
          >
        </div>
        <v-chip size="small" label :color="item.status === 'concluida' ? 'success' : item.contados ? 'info' : undefined"
          >{{ item.contados }}/{{ item.totalItens }} contados</v-chip
        >
      </button>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.conferencia {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  width: 100%;
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.conferencia:hover {
  background: var(--cx-hover);
}

.conferencia:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: 2px;
}

.conferencia__texto {
  display: grid;
}
</style>
