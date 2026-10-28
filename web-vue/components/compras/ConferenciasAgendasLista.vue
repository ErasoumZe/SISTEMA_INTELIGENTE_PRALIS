<script setup lang="ts">
import { ROTULO_RANKING_CONFERENCIA, type ConferenciaAgendaDto } from "@padaria/shared";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import ComprasVazio from "~/components/compras/base/ComprasVazio.vue";

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
  <ComprasSecao rente data-secao="agendas-conferencia">
    <template #titulo>
      Agendamentos de conferência <span class="conta">{{ agendas.length }}</span>
    </template>
    <ComprasVazio
      v-if="!carregando && !agendas.length"
      icone="mdi-calendar-blank-outline"
      titulo="Nenhuma conferência agendada."
      texto="Use Agendar conferência para escolher o recorte, quem conta e a repetição."
    />
    <div v-else>
      <article v-for="agenda in agendas" :key="agenda.id" class="agenda" :data-agenda="agenda.id">
        <header class="agenda__topo">
          <div class="agenda__titulo">
            <strong>{{ recorte(agenda) }}</strong>
            <span class="agenda__resumo">{{ agenda.resumo }} · às {{ agenda.inicioHora }}</span>
            <span class="agenda__meta">Quem conta: {{ agenda.responsavelNome }}</span>
          </div>
          <div v-if="podeAgendar" class="agenda__acoes">
            <v-btn size="small" variant="text" color="error" @click="encerrando = agenda">Encerrar</v-btn>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-pencil-outline" @click="emit('editar', agenda)"
              >Editar</v-btn
            >
          </div>
        </header>
        <div class="agenda__datas">
          <span class="agenda__rotulo">Próximas datas</span>
          <span v-if="!agenda.proximas.length" class="agenda__meta">Nenhuma.</span>
          <v-chip v-for="data in agenda.proximas" :key="data" size="small" label variant="tonal">{{
            FORMATO.format(new Date(data))
          }}</v-chip>
        </div>
      </article>
    </div>
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
  </ComprasSecao>
</template>

<style scoped>
.conta {
  min-width: 22px;
  padding: 0 7px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  line-height: 20px;
  text-align: center;
}

.agenda {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

.agenda__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.agenda__titulo {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.agenda__resumo {
  color: var(--cx-ink);
}

.agenda__meta {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.agenda__acoes,
.agenda__datas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}

.agenda__rotulo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
}

@media (max-width: 599px) {
  .agenda {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }
}
</style>
