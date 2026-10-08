<script setup lang="ts">
import type { ConferenciaEstoqueDto } from "@padaria/shared";

const props = defineProps<{ conferencias: ConferenciaEstoqueDto[] }>();

const agora = new Date();
const agendadas = computed(() => props.conferencias.filter((conferencia) => conferencia.status === "agendada"));
const atrasadas = computed(
  () => agendadas.value.filter((conferencia) => new Date(conferencia.agendadaPara).getTime() < agora.getTime()).length
);
const proxima = computed(
  () =>
    [...agendadas.value]
      .filter((conferencia) => new Date(conferencia.agendadaPara).getTime() >= agora.getTime())
      .sort((a, b) => new Date(a.agendadaPara).getTime() - new Date(b.agendadaPara).getTime())[0]
);
const indicadores = computed(() => [
  { titulo: "Agendadas", valor: agendadas.value.length, icone: "mdi-calendar-clock", cor: "primary" },
  {
    titulo: "Atrasadas",
    valor: atrasadas.value,
    icone: "mdi-calendar-alert",
    cor: atrasadas.value ? "warning" : "success"
  },
  {
    titulo: "Próxima",
    valor: proxima.value ? dataCurta(proxima.value.agendadaPara) : "—",
    icone: "mdi-calendar-arrow-right",
    cor: "info"
  }
]);

function dataCompleta(valor: string) {
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function dataCurta(valor: string) {
  return new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function escopo(conferencia: ConferenciaEstoqueDto) {
  return [
    conferencia.grupo ?? "Todos os grupos",
    conferencia.areaEstoque ?? "Todas as áreas",
    conferencia.localVenda ?? "Todos os locais de venda",
    conferencia.localEstoque ?? "Todos os locais de estoque"
  ].join(" · ");
}
</script>

<template>
  <v-row dense>
    <v-col v-for="indicador in indicadores" :key="indicador.titulo" cols="4">
      <v-card variant="tonal" :color="indicador.cor" class="h-100"
        ><v-card-text class="px-3 py-2"
          ><div class="text-caption">{{ indicador.titulo }}</div>
          <div class="text-subtitle-1 font-weight-bold text-truncate">{{ indicador.valor }}</div>
          <v-icon :icon="indicador.icone" size="18" /></v-card-text
      ></v-card>
    </v-col>
  </v-row>
  <div class="d-none d-md-block mt-4">
    <v-table density="comfortable"
      ><thead>
        <tr>
          <th>Quando</th>
          <th>Escopo da contagem</th>
          <th>ABC</th>
          <th>Orientação</th>
          <th>Situação</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!conferencias.length">
          <td colspan="5" class="text-center text-medium-emphasis py-8">Nenhuma conferência agendada.</td>
        </tr>
        <tr v-for="conferencia in conferencias" :key="conferencia.id">
          <td class="font-weight-medium">{{ dataCompleta(conferencia.agendadaPara) }}</td>
          <td>{{ escopo(conferencia) }}</td>
          <td>{{ conferencia.curvaAbc ?? "Todas" }}</td>
          <td>{{ conferencia.observacao ?? "Sem orientação" }}</td>
          <td>
            <v-chip :color="conferencia.status === 'agendada' ? 'primary' : 'secondary'" size="small" label>{{
              conferencia.status
            }}</v-chip>
          </td>
        </tr>
      </tbody></v-table
    >
  </div>
  <div class="d-md-none d-grid ga-3 mt-4">
    <v-card v-if="!conferencias.length" variant="tonal"
      ><v-card-text class="text-center text-medium-emphasis">Nenhuma conferência agendada.</v-card-text></v-card
    >
    <v-card v-for="conferencia in conferencias" :key="conferencia.id" variant="outlined"
      ><v-card-text class="d-grid ga-2"
        ><div class="d-flex justify-space-between ga-2">
          <strong>{{ dataCompleta(conferencia.agendadaPara) }}</strong
          ><v-chip :color="conferencia.status === 'agendada' ? 'primary' : 'secondary'" size="small" label>{{
            conferencia.status
          }}</v-chip>
        </div>
        <div class="text-body-2">{{ escopo(conferencia) }}</div>
        <div class="text-caption text-medium-emphasis">ABC: {{ conferencia.curvaAbc ?? "Todas" }}</div>
        <div v-if="conferencia.observacao" class="text-body-2">{{ conferencia.observacao }}</div></v-card-text
      ></v-card
    >
  </div>
</template>
