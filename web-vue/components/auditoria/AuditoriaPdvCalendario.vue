<script setup lang="ts">
import { computed } from "vue";
import type { AuditoriaDiaResumo, StatusAuditoria } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";

// Auditoria de PDVs: grade do mes (ou faixa da semana). Cada dia mostra o total da CREARE e o resultado;
// a cor fica so na barra da esquerda, para o numero continuar legivel.
const props = defineProps<{
  dias: AuditoriaDiaResumo[];
  modo: "semana" | "mes";
  referencia: string;
  selecionado: string;
}>();
const emit = defineEmits<{ (e: "selecionar", data: string): void }>();

const rotulos: Record<StatusAuditoria, string> = {
  ok: "Bateu",
  alerta: "Venda fora de caixa",
  andamento: "Caixa aberto",
  sem_vendas: "Sem vendas"
};
const semana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// No mes, a grade comeca no domingo da primeira semana: as celulas antes do dia 1 ficam vazias.
const vazias = computed(() => {
  if (props.modo !== "mes" || !props.dias[0]) return 0;
  return new Date(`${props.dias[0].data}T12:00:00Z`).getUTCDay();
});
const numeroDia = (data: string) => Number(data.slice(8, 10));
const diaSemana = (data: string) => semana[new Date(`${data}T12:00:00Z`).getUTCDay()];
</script>

<template>
  <div class="calendario" :class="`calendario--${modo}`" role="grid" aria-label="Calendário da auditoria">
    <template v-if="modo === 'mes'">
      <span v-for="nome in semana" :key="nome" class="calendario__semana" role="columnheader">{{ nome }}</span>
      <span v-for="n in vazias" :key="`vazia-${n}`" class="calendario__vazia" aria-hidden="true" />
    </template>
    <button
      v-for="dia in dias"
      :key="dia.data"
      type="button"
      role="gridcell"
      class="calendario__dia"
      :class="[
        `calendario__dia--${dia.status}`,
        { 'calendario__dia--selecionado': dia.data === selecionado, 'calendario__dia--hoje': dia.data === hoje }
      ]"
      :aria-label="`${dia.data}: ${rotulos[dia.status]}`"
      :aria-pressed="dia.data === selecionado"
      data-teste="auditoria-dia"
      @click="emit('selecionar', dia.data)"
    >
      <span class="calendario__numero">
        <small v-if="modo === 'semana'">{{ diaSemana(dia.data) }}</small>
        {{ numeroDia(dia.data) }}
      </span>
      <template v-if="dia.vendas">
        <strong class="calendario__total">{{ dinheiro(dia.total) }}</strong>
        <span class="calendario__qtd">{{ dia.vendas }} vendas</span>
      </template>
      <span class="calendario__status">
        {{ rotulos[dia.status] }}
        <template v-if="dia.vendasFora"> · {{ dia.vendasFora }}</template>
      </span>
      <v-icon
        v-if="dia.gerada"
        class="calendario__gerada"
        size="14"
        icon="mdi-check-decagram-outline"
        title="Auditoria gerada"
      />
    </button>
  </div>
</template>

<style scoped>
.calendario {
  display: grid;
  gap: 8px;
}
.calendario--mes {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.calendario--semana {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.calendario__semana {
  padding: 0 4px;
  color: var(--cx-ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.calendario__dia {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 96px;
  padding: 10px 10px 10px 14px;
  border: 1px solid var(--cx-line);
  border-radius: 10px;
  background: var(--cx-surface);
  color: var(--cx-ink);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}
.calendario__dia::before {
  content: "";
  position: absolute;
  inset: 8px auto 8px 0;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--cx-line);
}
.calendario__dia:hover {
  border-color: var(--cx-brand);
}
.calendario__dia:focus-visible {
  outline: 2px solid var(--cx-brand);
  outline-offset: 2px;
}
.calendario__dia--selecionado {
  border-color: var(--cx-brand);
  box-shadow: 0 0 0 1px var(--cx-brand);
}
.calendario__dia--ok::before {
  background: var(--cx-positive);
}
.calendario__dia--alerta::before {
  background: var(--cx-negative);
}
.calendario__dia--alerta {
  background: color-mix(in srgb, var(--cx-negative) 8%, var(--cx-surface));
}
.calendario__dia--andamento::before {
  background: var(--cx-brand);
}
.calendario__dia--sem_vendas {
  color: var(--cx-ink-soft);
}
.calendario__numero {
  font-weight: 700;
  font-size: 0.95rem;
}
.calendario__numero small {
  margin-right: 4px;
  color: var(--cx-ink-soft);
  font-weight: 600;
}
.calendario__dia--hoje .calendario__numero {
  color: var(--cx-brand-text);
}
.calendario__total {
  font-size: 0.86rem;
}
.calendario__qtd,
.calendario__status {
  color: var(--cx-ink-soft);
  font-size: 0.74rem;
}
.calendario__dia--alerta .calendario__status {
  color: var(--cx-negative);
  font-weight: 700;
}
.calendario__gerada {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--cx-ink-soft);
}
@media (prefers-reduced-motion: reduce) {
  .calendario__dia {
    transition: none;
  }
}
@media (max-width: 760px) {
  .calendario--semana {
    grid-template-columns: 1fr;
  }
  .calendario--mes {
    gap: 4px;
  }
  .calendario--mes .calendario__dia {
    min-height: 58px;
    padding: 6px 4px 6px 8px;
  }
  .calendario--mes .calendario__total,
  .calendario--mes .calendario__qtd,
  .calendario--mes .calendario__status {
    display: none;
  }
}
</style>
