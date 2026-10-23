<script setup lang="ts">
import { DIAS_SEMANA, MESES, resumoRecorrencia, type PosicaoRecorrencia, type RegraRecorrencia } from "@padaria/shared";

// Editor "Personalizado" do Calendário da Apple (iPhone + Mac) e as datas avulsas (doc 56 §3). A frase do
// topo mostra a regra enquanto ela é montada. Nada é salvo aqui: "Pronto" devolve a regra ao cartão.
const aberto = defineModel<boolean>({ required: true });
const regra = defineModel<RegraRecorrencia>("regra", { required: true });
const props = defineProps<{ inicioData: string }>();

type Frequencia = "diaria" | "semanal" | "mensal" | "anual" | "datas";
const FREQUENCIAS: Array<{ value: Frequencia; title: string; unidade: string }> = [
  { value: "diaria", title: "Diariamente", unidade: "dia(s)" },
  { value: "semanal", title: "Semanalmente", unidade: "semana(s)" },
  { value: "mensal", title: "Mensalmente", unidade: "mês(es)" },
  { value: "anual", title: "Anualmente", unidade: "ano(s)" },
  { value: "datas", title: "Datas avulsas", unidade: "" }
];
const ORDINAIS = [
  { value: 1, title: "1º" },
  { value: 2, title: "2º" },
  { value: 3, title: "3º" },
  { value: 4, title: "4º" },
  { value: 5, title: "5º" },
  { value: -1, title: "último" }
];
const DIAS_POSICAO = [
  ...DIAS_SEMANA.map((nome, indice) => ({ value: indice as PosicaoRecorrencia["dia"], title: nome })),
  { value: "dia" as const, title: "dia" },
  { value: "dia_util" as const, title: "dia útil" },
  { value: "fim_de_semana" as const, title: "dia de fim de semana" }
];
const ABREVIADOS = ["D", "S", "T", "Q", "Q", "S", "S"];

const frequencia = ref<Frequencia>("semanal");
const intervalo = ref(1);
const diasSemana = ref<number[]>([]);
const modoMensal = ref<"cada" | "posicao">("cada");
const diasMes = ref<number[]>([]);
const meses = ref<number[]>([]);
const usarPosicaoAnual = ref(false);
const posicao = reactive<PosicaoRecorrencia>({ ordinal: 1, dia: 1 });
const datas = ref<string[]>([]);
const novaData = ref("");

const inicio = computed(() => {
  const [ano, mes, dia] = props.inicioData.split("-").map(Number) as [number, number, number];
  return { ano, mes, dia, semana: new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() };
});

function carregar() {
  const atual = regra.value;
  datas.value = atual.tipo === "datas" ? [...atual.datas] : [];
  if (atual.tipo !== "padrao") {
    frequencia.value = atual.tipo === "datas" ? "datas" : "semanal";
    intervalo.value = 1;
    diasSemana.value = [inicio.value.semana];
    diasMes.value = [inicio.value.dia];
    meses.value = [inicio.value.mes];
    return;
  }
  frequencia.value = atual.frequencia;
  intervalo.value = atual.intervalo;
  diasSemana.value = atual.diasSemana ?? [inicio.value.semana];
  diasMes.value = atual.diasMes ?? [inicio.value.dia];
  meses.value = atual.meses ?? [inicio.value.mes];
  modoMensal.value = atual.frequencia === "mensal" && atual.posicao ? "posicao" : "cada";
  usarPosicaoAnual.value = atual.frequencia === "anual" && Boolean(atual.posicao);
  Object.assign(posicao, atual.posicao ?? { ordinal: 1, dia: inicio.value.semana });
}
watch(aberto, (valor) => valor && carregar());

const alternado = (lista: number[], valor: number) =>
  lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
const alternarDiaSemana = (dia: number) => (diasSemana.value = alternado(diasSemana.value, dia));
const alternarDiaMes = (dia: number) => (diasMes.value = alternado(diasMes.value, dia));
const alternarMes = (mes: number) => (meses.value = alternado(meses.value, mes));

const montada = computed<RegraRecorrencia | null>(() => {
  if (frequencia.value === "datas")
    return datas.value.length ? { tipo: "datas", datas: [...datas.value].sort() } : null;
  const comum = {
    tipo: "padrao" as const,
    frequencia: frequencia.value,
    intervalo: Math.min(999, Math.max(1, intervalo.value))
  };
  if (frequencia.value === "diaria") return comum;
  if (frequencia.value === "semanal")
    return diasSemana.value.length ? { ...comum, diasSemana: [...diasSemana.value] } : null;
  if (frequencia.value === "mensal")
    return modoMensal.value === "posicao"
      ? { ...comum, posicao: { ...posicao } }
      : diasMes.value.length
        ? { ...comum, diasMes: [...diasMes.value] }
        : null;
  if (!meses.value.length) return null;
  return usarPosicaoAnual.value
    ? { ...comum, meses: [...meses.value], posicao: { ...posicao } }
    : { ...comum, meses: [...meses.value] };
});
const resumo = computed(() =>
  montada.value ? resumoRecorrencia(montada.value, props.inicioData, { tipo: "nunca" }) : "Escolha ao menos uma opção."
);

function adicionarData() {
  if (!novaData.value || datas.value.includes(novaData.value)) return;
  if (novaData.value <= props.inicioData) return;
  datas.value = [...datas.value, novaData.value].sort();
  novaData.value = "";
}
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function pronto() {
  if (!montada.value) return;
  regra.value = montada.value;
  aberto.value = false;
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="560" scrollable>
    <v-card>
      <v-card-title>Repetição personalizada</v-card-title>
      <v-card-subtitle class="text-wrap" data-campo="resumo-personalizado">{{ resumo }}</v-card-subtitle>
      <v-card-text class="d-grid ga-4">
        <v-select v-model="frequencia" :items="FREQUENCIAS" label="Frequência" hide-details />
        <v-text-field
          v-if="frequencia !== 'datas'"
          v-model.number="intervalo"
          type="number"
          min="1"
          max="999"
          label="A cada"
          :suffix="FREQUENCIAS.find((item) => item.value === frequencia)?.unidade"
          hide-details
        />

        <div v-if="frequencia === 'semanal'" class="grade grade--semana" role="group" aria-label="Dias da semana">
          <v-btn
            v-for="(nome, indice) in DIAS_SEMANA"
            :key="nome"
            :aria-label="nome"
            :aria-pressed="diasSemana.includes(indice)"
            :color="diasSemana.includes(indice) ? 'primary' : undefined"
            :variant="diasSemana.includes(indice) ? 'flat' : 'outlined'"
            @click="alternarDiaSemana(indice)"
            >{{ ABREVIADOS[indice] }}</v-btn
          >
        </div>

        <template v-if="frequencia === 'mensal'">
          <v-btn-toggle v-model="modoMensal" mandatory density="comfortable" color="primary" variant="outlined">
            <v-btn value="cada">Cada</v-btn>
            <v-btn value="posicao">No(a)</v-btn>
          </v-btn-toggle>
          <div v-if="modoMensal === 'cada'" class="grade grade--mes" role="group" aria-label="Dias do mês">
            <v-btn
              v-for="dia in 31"
              :key="dia"
              size="small"
              :aria-pressed="diasMes.includes(dia)"
              :color="diasMes.includes(dia) ? 'primary' : undefined"
              :variant="diasMes.includes(dia) ? 'flat' : 'text'"
              @click="alternarDiaMes(dia)"
              >{{ dia }}</v-btn
            >
          </div>
        </template>

        <template v-if="frequencia === 'anual'">
          <div class="grade grade--ano" role="group" aria-label="Meses">
            <v-btn
              v-for="(nome, indice) in MESES"
              :key="nome"
              size="small"
              :aria-pressed="meses.includes(indice + 1)"
              :color="meses.includes(indice + 1) ? 'primary' : undefined"
              :variant="meses.includes(indice + 1) ? 'flat' : 'outlined'"
              @click="alternarMes(indice + 1)"
              >{{ nome.slice(0, 3) }}</v-btn
            >
          </div>
          <v-switch v-model="usarPosicaoAnual" label="Dias da semana" color="primary" hide-details />
        </template>

        <div
          v-if="(frequencia === 'mensal' && modoMensal === 'posicao') || (frequencia === 'anual' && usarPosicaoAnual)"
          class="d-flex ga-3 flex-wrap"
        >
          <v-select v-model="posicao.ordinal" :items="ORDINAIS" label="No(a)" hide-details class="campo-curto" />
          <v-select v-model="posicao.dia" :items="DIAS_POSICAO" label="Dia" hide-details class="campo-medio" />
        </div>

        <template v-if="frequencia === 'datas'">
          <div class="d-flex ga-3 flex-wrap align-center">
            <v-text-field
              v-model="novaData"
              type="date"
              label="Data"
              :min="inicioData"
              hide-details
              class="campo-medio"
              @keyup.enter="adicionarData"
            />
            <v-btn variant="tonal" prepend-icon="mdi-plus" @click="adicionarData">Adicionar</v-btn>
          </div>
          <p class="text-caption text-medium-emphasis mb-0">
            A data de início ({{ dataBr(inicioData) }}) já conta; acrescente as demais, sem padrão.
          </p>
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="data in datas"
              :key="data"
              closable
              @click:close="datas = datas.filter((item) => item !== data)"
              >{{ dataBr(data) }}</v-chip
            >
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Cancelar</v-btn>
        <v-btn color="primary" :disabled="!montada" @click="pronto">Pronto</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.grade {
  display: grid;
  gap: 6px;
}
.grade--semana {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.grade--mes {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.grade--ano {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.grade :deep(.v-btn) {
  min-width: 0;
}
.campo-curto {
  flex: 0 1 120px;
  min-width: 0;
}
.campo-medio {
  flex: 1 1 200px;
  min-width: 0;
}
</style>
