<script setup lang="ts">
import { computed } from "vue";
import type { StatusAuditoria } from "@padaria/shared";

// Filtros da Auditoria de PDVs (Marco, 14/11/2026): periodo, PDV, turno, faixa de hora, forma de pagamento e
// situacao. Cada mudanca refaz a consulta.
export type FiltrosAuditoria = {
  inicio: string;
  fim: string;
  pdvId: string | null;
  turno: "manha" | "tarde" | null;
  horaInicio: string;
  horaFim: string;
  forma: string | null;
  status: StatusAuditoria | null;
};

const props = defineProps<{ modelValue: FiltrosAuditoria; pdvs: Array<{ id: string; nome: string }>; hoje: string }>();
const emit = defineEmits<{ (e: "update:modelValue", filtros: FiltrosAuditoria): void }>();

const deslocar = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const atalhos = computed(() => [
  { rotulo: "Hoje", inicio: props.hoje, fim: props.hoje },
  { rotulo: "Ontem", inicio: deslocar(props.hoje, -1), fim: deslocar(props.hoje, -1) },
  { rotulo: "7 dias", inicio: deslocar(props.hoje, -6), fim: props.hoje },
  { rotulo: "30 dias", inicio: deslocar(props.hoje, -29), fim: props.hoje }
]);
const atalhoAtivo = computed(
  () => atalhos.value.find((a) => a.inicio === props.modelValue.inicio && a.fim === props.modelValue.fim)?.rotulo
);

const turnos = [
  { title: "Manhã", value: "manha" },
  { title: "Tarde", value: "tarde" }
];
const formas = [
  { title: "Dinheiro", value: "dinheiro" },
  { title: "Débito", value: "debito" },
  { title: "Crédito", value: "credito" },
  { title: "PIX", value: "pix" },
  { title: "Voucher", value: "voucher" },
  { title: "Clientes", value: "crediario" },
  { title: "Outros", value: "outros" }
];
const situacoes = [
  { title: "Bateu", value: "ok" },
  { title: "Venda fora de caixa", value: "alerta" },
  { title: "Caixa aberto", value: "andamento" },
  { title: "Sem vendas", value: "sem_vendas" }
];
const pdvsOpcoes = computed(() => props.pdvs.map((pdv) => ({ title: pdv.nome, value: pdv.id })));

const ativos = computed(
  () =>
    [
      props.modelValue.pdvId,
      props.modelValue.turno,
      props.modelValue.horaInicio,
      props.modelValue.horaFim,
      props.modelValue.forma,
      props.modelValue.status
    ].filter(Boolean).length
);

function mudar<K extends keyof FiltrosAuditoria>(campo: K, valor: FiltrosAuditoria[K]) {
  emit("update:modelValue", { ...props.modelValue, [campo]: valor ?? null });
}
function periodo(inicio: string, fim: string) {
  emit("update:modelValue", { ...props.modelValue, inicio, fim });
}
function limpar() {
  emit("update:modelValue", {
    ...props.modelValue,
    pdvId: null,
    turno: null,
    horaInicio: "",
    horaFim: "",
    forma: null,
    status: null
  });
}
</script>

<template>
  <section class="filtros" aria-label="Filtros da auditoria">
    <div class="filtros__periodo">
      <div class="filtros__atalhos" role="group" aria-label="Período rápido">
        <v-btn
          v-for="atalho in atalhos"
          :key="atalho.rotulo"
          size="small"
          :variant="atalhoAtivo === atalho.rotulo ? 'flat' : 'tonal'"
          :color="atalhoAtivo === atalho.rotulo ? 'primary' : undefined"
          :aria-pressed="atalhoAtivo === atalho.rotulo"
          @click="periodo(atalho.inicio, atalho.fim)"
          >{{ atalho.rotulo }}</v-btn
        >
      </div>
      <v-text-field
        :model-value="modelValue.inicio"
        type="date"
        label="De"
        density="compact"
        hide-details
        :max="modelValue.fim"
        data-teste="filtro-inicio"
        @update:model-value="mudar('inicio', $event)"
      />
      <v-text-field
        :model-value="modelValue.fim"
        type="date"
        label="Até"
        density="compact"
        hide-details
        :min="modelValue.inicio"
        :max="hoje"
        data-teste="filtro-fim"
        @update:model-value="mudar('fim', $event)"
      />
    </div>

    <div class="filtros__grade">
      <v-select
        :model-value="modelValue.pdvId"
        :items="pdvsOpcoes"
        label="PDV"
        placeholder="Todos"
        persistent-placeholder
        density="compact"
        hide-details
        clearable
        data-teste="filtro-pdv"
        @update:model-value="mudar('pdvId', $event)"
      />
      <v-select
        :model-value="modelValue.turno"
        :items="turnos"
        label="Turno"
        placeholder="Todos"
        persistent-placeholder
        density="compact"
        hide-details
        clearable
        @update:model-value="mudar('turno', $event)"
      />
      <v-text-field
        :model-value="modelValue.horaInicio"
        type="time"
        label="Hora de"
        density="compact"
        hide-details
        clearable
        @update:model-value="mudar('horaInicio', $event ?? '')"
      />
      <v-text-field
        :model-value="modelValue.horaFim"
        type="time"
        label="Hora até"
        density="compact"
        hide-details
        clearable
        @update:model-value="mudar('horaFim', $event ?? '')"
      />
      <v-select
        :model-value="modelValue.forma"
        :items="formas"
        label="Forma de pagamento"
        placeholder="Todas"
        persistent-placeholder
        density="compact"
        hide-details
        clearable
        @update:model-value="mudar('forma', $event)"
      />
      <v-select
        :model-value="modelValue.status"
        :items="situacoes"
        label="Situação"
        placeholder="Todas"
        persistent-placeholder
        density="compact"
        hide-details
        clearable
        data-teste="filtro-situacao"
        @update:model-value="mudar('status', $event)"
      />
    </div>

    <div v-if="ativos" class="filtros__limpar">
      <span>{{ ativos }} filtro(s) ativo(s)</span>
      <v-btn size="small" variant="text" prepend-icon="mdi-filter-off-outline" @click="limpar">Limpar filtros</v-btn>
    </div>
  </section>
</template>

<style scoped>
.filtros {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface);
}
.filtros__periodo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px 170px;
  gap: 10px;
  align-items: center;
}
.filtros__atalhos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filtros__grade {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}
.filtros__limpar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  color: var(--cx-ink-soft);
  font-size: 0.84rem;
}
@media (max-width: 1100px) {
  .filtros__grade {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .filtros__periodo {
    grid-template-columns: 1fr 1fr;
  }
  .filtros__atalhos {
    grid-column: 1 / -1;
  }
  .filtros__grade {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
