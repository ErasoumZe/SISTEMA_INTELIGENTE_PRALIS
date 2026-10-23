<script setup lang="ts">
import { resumoRecorrencia, type RegraRecorrencia, type TerminoRecorrencia } from "@padaria/shared";
import RecorrenciaPersonalizadaDialog from "~/components/compras/RecorrenciaPersonalizadaDialog.vue";

// "Repetir" e "Terminar repetição" como no Calendário do iPhone (doc 56 §3): atalhos no menu e o editor
// personalizado num diálogo. Sem fim, na data ou depois de N vezes (a última vem do Mac).
const regra = defineModel<RegraRecorrencia>("regra", { required: true });
const termino = defineModel<TerminoRecorrencia>("termino", { required: true });
const props = defineProps<{ inicioData: string }>();

type Atalho = "nunca" | "dia" | "semana" | "duas_semanas" | "mes" | "ano" | "personalizado";
const ATALHOS: Array<{ value: Atalho; title: string }> = [
  { value: "nunca", title: "Nunca" },
  { value: "dia", title: "Todo dia" },
  { value: "semana", title: "Toda semana" },
  { value: "duas_semanas", title: "A cada 2 semanas" },
  { value: "mes", title: "Todo mês" },
  { value: "ano", title: "Todo ano" },
  { value: "personalizado", title: "Personalizado…" }
];
const TERMINOS = [
  { value: "nunca", title: "Nunca" },
  { value: "data", title: "Na data" },
  { value: "quantidade", title: "Depois de N vezes" }
];

const dialogo = ref(false);

/** O atalho que a regra atual representa; qualquer outra regra e "Personalizado". */
const atalho = computed<Atalho>(() => {
  const atual = regra.value;
  if (atual.tipo === "nunca") return "nunca";
  if (atual.tipo === "datas") return "personalizado";
  const simples = !atual.diasSemana && !atual.diasMes && !atual.posicao && !atual.meses;
  if (!simples) return "personalizado";
  if (atual.frequencia === "diaria" && atual.intervalo === 1) return "dia";
  if (atual.frequencia === "semanal" && atual.intervalo === 1) return "semana";
  if (atual.frequencia === "semanal" && atual.intervalo === 2) return "duas_semanas";
  if (atual.frequencia === "mensal" && atual.intervalo === 1) return "mes";
  if (atual.frequencia === "anual" && atual.intervalo === 1) return "ano";
  return "personalizado";
});

function escolherAtalho(valor: Atalho) {
  if (valor === "personalizado") {
    dialogo.value = true;
    return;
  }
  const mapa: Record<Exclude<Atalho, "personalizado">, RegraRecorrencia> = {
    nunca: { tipo: "nunca" },
    dia: { tipo: "padrao", frequencia: "diaria", intervalo: 1 },
    semana: { tipo: "padrao", frequencia: "semanal", intervalo: 1 },
    duas_semanas: { tipo: "padrao", frequencia: "semanal", intervalo: 2 },
    mes: { tipo: "padrao", frequencia: "mensal", intervalo: 1 },
    ano: { tipo: "padrao", frequencia: "anual", intervalo: 1 }
  };
  regra.value = mapa[valor];
  if (valor === "nunca") termino.value = { tipo: "nunca" };
}

const tipoTermino = computed({
  get: () => termino.value.tipo,
  set: (tipo: TerminoRecorrencia["tipo"]) => {
    termino.value =
      tipo === "data"
        ? { tipo: "data", data: props.inicioData }
        : tipo === "quantidade"
          ? { tipo: "quantidade", quantidade: 10 }
          : { tipo: "nunca" };
  }
});
const dataTermino = computed({
  get: () => (termino.value.tipo === "data" ? termino.value.data : ""),
  set: (data: string) => (termino.value = { tipo: "data", data })
});
const vezes = computed({
  get: () => (termino.value.tipo === "quantidade" ? termino.value.quantidade : 1),
  set: (quantidade: number | string) =>
    (termino.value = { tipo: "quantidade", quantidade: Math.min(999, Math.max(1, Number(quantidade) || 1)) })
});

const resumo = computed(() =>
  props.inicioData ? resumoRecorrencia(regra.value, props.inicioData, termino.value) : ""
);
</script>

<template>
  <div class="recorrencia">
    <v-select
      :model-value="atalho"
      :items="ATALHOS"
      label="Repetir"
      prepend-inner-icon="mdi-repeat"
      hide-details="auto"
      @update:model-value="escolherAtalho"
    />
    <v-btn
      v-if="atalho === 'personalizado'"
      variant="text"
      size="small"
      class="align-self-start"
      prepend-icon="mdi-pencil"
      @click="dialogo = true"
      >Editar repetição</v-btn
    >
    <template v-if="regra.tipo === 'padrao'">
      <v-select v-model="tipoTermino" :items="TERMINOS" label="Terminar repetição" hide-details="auto" />
      <v-text-field
        v-if="tipoTermino === 'data'"
        v-model="dataTermino"
        type="date"
        label="Termina em"
        :min="inicioData"
        hide-details="auto"
      />
      <v-text-field
        v-if="tipoTermino === 'quantidade'"
        v-model.number="vezes"
        type="number"
        min="1"
        max="999"
        label="Quantas vezes"
        hide-details="auto"
      />
    </template>
    <p v-if="resumo" class="text-body-2 text-medium-emphasis mb-0" data-campo="resumo-recorrencia">{{ resumo }}</p>

    <RecorrenciaPersonalizadaDialog v-model="dialogo" v-model:regra="regra" :inicio-data="inicioData" />
  </div>
</template>

<style scoped>
.recorrencia {
  display: grid;
  gap: 12px;
  min-width: 0;
}
</style>
