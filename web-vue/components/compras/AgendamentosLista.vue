<script setup lang="ts">
import type { AgendamentoDto, AgendamentoOcorrenciaDto } from "@padaria/shared";

// Os agendamentos salvos e as próximas datas de cada um (doc 56 §3): como no iPhone, uma data pode ser
// movida ou excluída "só esta"; "Excluir todas as futuras" encerra a série.
defineProps<{ agendamentos: AgendamentoDto[]; podeGerir: boolean; carregando: boolean }>();
const emit = defineEmits<{
  editar: [agenda: AgendamentoDto];
  encerrar: [agenda: AgendamentoDto];
  cancelarData: [agenda: AgendamentoDto, ocorrencia: AgendamentoOcorrenciaDto];
  moverData: [agenda: AgendamentoDto, ocorrencia: AgendamentoOcorrenciaDto, data: string, hora: string];
}>();

const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  hour12: false,
  dateStyle: "short",
  timeStyle: "short"
});
const quando = (iso: string) => FORMATO.format(new Date(iso));
const prazo = (horas: number) => (horas % 24 === 0 ? `${horas / 24} dia(s)` : `${horas} h`);

const movendo = ref<{ agenda: AgendamentoDto; ocorrencia: AgendamentoOcorrenciaDto } | null>(null);
const novaData = ref("");
const novaHora = ref("");
const encerrando = ref<AgendamentoDto | null>(null);

function abrirMover(agenda: AgendamentoDto, ocorrencia: AgendamentoOcorrenciaDto) {
  const [data, hora] = PARTES.format(new Date(ocorrencia.dataAtual)).split(", ");
  novaData.value = data ?? "";
  novaHora.value = (hora ?? "").slice(0, 5);
  movendo.value = { agenda, ocorrencia };
}
function confirmarMover() {
  if (!movendo.value || !novaData.value || !novaHora.value) return;
  emit("moverData", movendo.value.agenda, movendo.value.ocorrencia, novaData.value, novaHora.value);
  movendo.value = null;
}
</script>

<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon icon="mdi-calendar-month-outline" color="primary" />
      Agendamentos
    </v-card-title>
    <v-card-text class="d-grid ga-3">
      <p v-if="!carregando && !agendamentos.length" class="text-medium-emphasis mb-0">Nenhum pedido agendado.</p>
      <article v-for="agenda in agendamentos" :key="agenda.id" class="agenda" :data-agenda="agenda.id">
        <header class="agenda__topo">
          <div class="agenda__titulo">
            <strong>{{
              agenda.grupoPaiNome ? `${agenda.grupoPaiNome} › ${agenda.grupoNome}` : agenda.grupoNome
            }}</strong>
            <span class="text-body-2" data-campo="resumo">{{ agenda.resumo }} · às {{ agenda.inicioHora }}</span>
            <span class="text-caption text-medium-emphasis">
              {{ agenda.produtos.length }} produto(s) · resposta em {{ prazo(agenda.prazoRespostaHoras) }} · variação
              {{ agenda.margemVariacaoPercentual }}% · responsável
              {{ agenda.responsavelNome }}
            </span>
          </div>
          <div v-if="podeGerir" class="d-flex ga-1 flex-wrap">
            <v-btn size="small" variant="tonal" prepend-icon="mdi-pencil" @click="emit('editar', agenda)">Editar</v-btn>
            <v-btn size="small" variant="text" color="error" @click="encerrando = agenda"
              >Excluir todas as futuras</v-btn
            >
          </div>
        </header>
        <div class="d-flex flex-wrap ga-2">
          <span v-if="!agenda.proximas.length" class="text-caption text-medium-emphasis">Sem próximas datas.</span>
          <v-menu v-for="ocorrencia in agenda.proximas" :key="ocorrencia.previstoPara" :disabled="!podeGerir">
            <template #activator="{ props: ativador }">
              <v-chip
                v-bind="ativador"
                size="small"
                label
                :color="
                  ocorrencia.situacao === 'cancelada'
                    ? 'error'
                    : ocorrencia.situacao === 'agendada'
                      ? 'warning'
                      : undefined
                "
                :variant="ocorrencia.situacao === 'cancelada' ? 'outlined' : 'tonal'"
                :class="{ 'text-decoration-line-through': ocorrencia.situacao === 'cancelada' }"
                >{{ quando(ocorrencia.dataAtual) }}</v-chip
              >
            </template>
            <v-list density="compact">
              <v-list-item
                :disabled="ocorrencia.situacao === 'cancelada' || ocorrencia.situacao === 'aguardando_conferencia'"
                prepend-icon="mdi-calendar-edit"
                title="Mudar só esta data"
                @click="abrirMover(agenda, ocorrencia)"
              />
              <v-list-item
                :disabled="ocorrencia.situacao === 'cancelada'"
                prepend-icon="mdi-calendar-remove"
                title="Excluir só esta data"
                @click="emit('cancelarData', agenda, ocorrencia)"
              />
            </v-list>
          </v-menu>
        </div>
      </article>
    </v-card-text>

    <v-dialog :model-value="movendo !== null" max-width="420" @update:model-value="movendo = null">
      <v-card>
        <v-card-title>Mudar só esta data</v-card-title>
        <v-card-text class="d-grid ga-3">
          <v-text-field v-model="novaData" type="date" label="Nova data" hide-details />
          <v-text-field v-model="novaHora" type="time" label="Nova hora" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="movendo = null">Voltar</v-btn>
          <v-btn color="primary" @click="confirmarMover">Salvar só esta</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="encerrando !== null" max-width="460" @update:model-value="encerrando = null">
      <v-card>
        <v-card-title>Excluir todas as futuras</v-card-title>
        <v-card-text>
          O agendamento de <strong>{{ encerrando?.grupoNome }}</strong> para de gerar pedidos. O que já aconteceu fica
          como está.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="encerrando = null">Voltar</v-btn>
          <v-btn
            color="error"
            @click="
              () => {
                if (encerrando) emit('encerrar', encerrando);
                encerrando = null;
              }
            "
            >Excluir</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.agenda {
  display: grid;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--cx-line-soft);
}
.agenda:last-child {
  border-bottom: 0;
}
.agenda__topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}
.agenda__titulo {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
