<script setup lang="ts">
import type { Notificacao } from "@padaria/shared/notificacoes";
import { dinheiro } from "~/utils/domain";
import { filtrarNotificacoes, paginaNotificacoes, type FiltroNotificacoes } from "~/utils/notificacoes";

const props = defineProps<{ notificacoes: Notificacao[] }>();
const emit = defineEmits<{ (event: "verificar", id: string): void }>();

const filtro = reactive<FiltroNotificacoes>({ tipo: "", dataInicio: "", dataFim: "" });
const pagina = ref(1);
const porPagina = 12;
const opcoesTipo: Array<{ title: string; value: FiltroNotificacoes["tipo"] }> = [
  { title: "Quebra de caixa", value: "quebra_caixa" },
  { title: "Divergência de transferência", value: "transferencia_divergencia" },
  { title: "Prazo de transferência", value: "transferencia_prazo_confirmacao" }
];
const notificacoesFiltradas = computed(() => filtrarNotificacoes(props.notificacoes, filtro));
const paginaCalculada = computed(() => paginaNotificacoes(notificacoesFiltradas.value, pagina.value, porPagina));

watch([() => filtro.tipo, () => filtro.dataInicio, () => filtro.dataFim, () => props.notificacoes.length], () => {
  pagina.value = 1;
});
watch(
  () => paginaCalculada.value.totalPaginas,
  (total) => {
    if (pagina.value > total) pagina.value = total;
  }
);
function limparFiltros() {
  filtro.tipo = "";
  filtro.dataInicio = "";
  filtro.dataFim = "";
}
</script>

<template>
  <section class="pendencias-page">
    <header>
      <h1>Pendências operacionais</h1>
      <p>Quebras de caixa e alertas de transferências que ainda precisam de conferência.</p>
    </header>

    <v-card variant="outlined" class="filtros-pendencias">
      <v-card-text class="filtros-pendencias-linha">
        <v-select
          v-model="filtro.tipo"
          :items="opcoesTipo"
          label="Categoria da pendência"
          variant="outlined"
          density="comfortable"
          clearable
          hide-details
        />
        <v-text-field
          v-model="filtro.dataInicio"
          type="date"
          label="Data inicial"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-text-field
          v-model="filtro.dataFim"
          type="date"
          label="Data final"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-btn variant="text" prepend-icon="mdi-filter-off" @click="limparFiltros">Limpar</v-btn>
      </v-card-text>
    </v-card>
    <div class="pendencias-resumo">{{ notificacoesFiltradas.length }} pendência(s) encontrada(s)</div>

    <v-alert v-if="!notificacoesFiltradas.length" type="success" variant="tonal"
      >Nenhuma pendência aberta para os filtros.</v-alert
    >
    <div v-else class="pendencias-grid">
      <v-card v-for="item in paginaCalculada.itens" :key="item.id" variant="outlined">
        <v-card-title class="text-subtitle-1">{{ item.titulo }}</v-card-title>
        <v-card-text>
          <div v-if="item.valor != null" class="pendencia-valor">{{ dinheiro(item.valor) }}</div>
          <div>{{ new Date(item.criadoEm).toLocaleString("pt-BR") }}</div>
        </v-card-text>
        <v-card-actions>
          <v-btn prepend-icon="mdi-check" color="primary" variant="tonal" @click="emit('verificar', item.id)">
            Marcar como verificada
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
    <v-pagination
      v-if="paginaCalculada.totalPaginas > 1"
      v-model="pagina"
      :length="paginaCalculada.totalPaginas"
      :total-visible="5"
      density="comfortable"
      aria-label="Páginas de pendências"
    />
  </section>
</template>

<style scoped>
.pendencias-page {
  display: grid;
  gap: 20px;
}
.pendencias-page h1 {
  margin: 0;
}
.pendencias-page p {
  margin: 4px 0 0;
  color: var(--padaria-muted-foreground, #64748b);
}
.pendencias-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 12px;
}
.filtros-pendencias-linha {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) repeat(2, minmax(170px, 1fr)) auto;
  align-items: center;
  gap: 12px;
}
.pendencias-resumo {
  color: var(--padaria-muted-foreground, #64748b);
  font-size: 0.9rem;
}
.pendencia-valor {
  margin-bottom: 6px;
  color: var(--cat-retiradas-base, #b91c1c);
  font-size: 1.35rem;
  font-weight: 800;
}
@media (max-width: 768px) {
  .filtros-pendencias-linha {
    grid-template-columns: 1fr;
  }
}
</style>
