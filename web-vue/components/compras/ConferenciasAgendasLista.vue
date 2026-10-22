<script setup lang="ts">
import { ROTULO_RANKING_CONFERENCIA, type ConferenciaAgendaDto } from "@padaria/shared";

// Os agendamentos de conferência salvos e as próximas datas (doc 57 §1). Editar vale para as próximas;
// encerrar para a série (o que já nasceu fica).
defineProps<{ agendas: ConferenciaAgendaDto[]; podeAgendar: boolean; carregando: boolean }>();
const emit = defineEmits<{ editar: [agenda: ConferenciaAgendaDto]; encerrar: [agenda: ConferenciaAgendaDto] }>();

const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
const encerrando = ref<ConferenciaAgendaDto | null>(null);

function recorte(agenda: ConferenciaAgendaDto) {
  return (
    [
      agenda.grupo,
      agenda.ranking ? ROTULO_RANKING_CONFERENCIA[agenda.ranking] : null,
      agenda.areaEstoque,
      agenda.localEstoque,
      agenda.localVenda
    ]
      .filter(Boolean)
      .join(" · ") || "Todo o estoque"
  );
}
function confirmarEncerrar() {
  if (encerrando.value) emit("encerrar", encerrando.value);
  encerrando.value = null;
}
</script>

<template>
  <v-card variant="outlined" data-secao="agendas-conferencia">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon icon="mdi-calendar-month-outline" color="primary" />
      Agendamentos de conferência
    </v-card-title>
    <v-card-text class="d-grid ga-3">
      <p v-if="!carregando && !agendas.length" class="text-medium-emphasis mb-0">Nenhuma conferência agendada.</p>
      <article v-for="agenda in agendas" :key="agenda.id" class="agenda" :data-agenda="agenda.id">
        <header class="agenda__topo">
          <div class="d-grid">
            <strong>{{ recorte(agenda) }}</strong>
            <span class="text-body-2">{{ agenda.resumo }} · às {{ agenda.inicioHora }}</span>
            <span class="text-caption text-medium-emphasis">Quem conta: {{ agenda.responsavelNome }}</span>
          </div>
          <div v-if="podeAgendar" class="d-flex ga-1 flex-wrap">
            <v-btn size="small" variant="tonal" prepend-icon="mdi-pencil" @click="emit('editar', agenda)">Editar</v-btn>
            <v-btn size="small" variant="text" color="error" @click="encerrando = agenda">Encerrar</v-btn>
          </div>
        </header>
        <div class="d-flex flex-wrap ga-2">
          <span v-if="!agenda.proximas.length" class="text-caption text-medium-emphasis">Sem próximas datas.</span>
          <v-chip v-for="data in agenda.proximas" :key="data" size="small" variant="outlined">{{
            FORMATO.format(new Date(data))
          }}</v-chip>
        </div>
      </article>
    </v-card-text>
    <v-dialog
      :model-value="encerrando !== null"
      max-width="420"
      @update:model-value="(valor) => !valor && (encerrando = null)"
    >
      <v-card>
        <v-card-title>Encerrar este agendamento?</v-card-title>
        <v-card-text
          >As próximas datas deixam de existir. As conferências que já nasceram continuam na lista.</v-card-text
        >
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="encerrando = null">Voltar</v-btn>
          <v-btn color="error" variant="flat" @click="confirmarEncerrar">Encerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.agenda {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.agenda__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}
</style>
