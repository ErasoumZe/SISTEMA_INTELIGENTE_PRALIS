<script setup lang="ts">
/**
 * Agendamento de conferência de estoque (doc 57 §1): o recorte (grupo/subgrupo, ranking, área e locais),
 * quem conta, quando começa e a repetição — a mesma do agendamento de pedido. Na data, quem conta recebe o
 * aviso no sino e a lista de produtos com o saldo do sistema.
 */
import {
  ROTULO_RANKING_CONFERENCIA,
  rankingsConferencia,
  type ConferenciaAgendaDto,
  type ConferenciaAgendaPayload,
  type OpcoesConferenciaDto,
  type RankingConferencia,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "@padaria/shared";
import RecorrenciaCampo from "~/components/compras/RecorrenciaCampo.vue";

const props = defineProps<{
  empresaId: string;
  opcoes: OpcoesConferenciaDto;
  editando: ConferenciaAgendaDto | null;
  salvando: boolean;
}>();
const emit = defineEmits<{ salvar: [payload: ConferenciaAgendaPayload]; cancelar: [] }>();

const DIA_LOCAL = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const hoje = () => DIA_LOCAL.format(new Date());
const amanha = () => DIA_LOCAL.format(new Date(Date.now() + 86_400_000));

// Vazio e null: com "" o Vuetify trata o campo como preenchido e mostra o "x" de limpar.
const form = reactive({
  grupo: null as string | null,
  subgrupo: null as string | null,
  ranking: null as RankingConferencia | null,
  areaEstoque: null as string | null,
  localEstoque: null as string | null,
  localVenda: null as string | null,
  responsavelId: null as string | null,
  inicioData: amanha(),
  inicioHora: "07:00",
  observacao: ""
});
const regra = ref<RegraRecorrencia>({ tipo: "padrao", frequencia: "semanal", intervalo: 1 });
const termino = ref<TerminoRecorrencia>({ tipo: "nunca" });
const erro = ref("");

const gruposPai = computed(() => props.opcoes.grupos.filter((grupo) => !grupo.grupoPaiId));
const subgrupos = computed(() =>
  props.opcoes.grupos.filter((grupo) => grupo.grupoPaiId && grupo.grupoPaiId === form.grupo)
);

function limpar() {
  Object.assign(form, {
    grupo: null,
    subgrupo: null,
    ranking: null,
    areaEstoque: null,
    localEstoque: null,
    localVenda: null,
    responsavelId: null,
    inicioData: amanha(),
    inicioHora: "07:00",
    observacao: ""
  });
  regra.value = { tipo: "padrao", frequencia: "semanal", intervalo: 1 };
  termino.value = { tipo: "nunca" };
  erro.value = "";
}

watch(
  () => props.editando,
  (agenda) => {
    if (!agenda) return limpar();
    const grupo = props.opcoes.grupos.find((item) => item.id === agenda.grupoMercadoriaId);
    Object.assign(form, {
      grupo: grupo?.grupoPaiId ?? agenda.grupoMercadoriaId,
      subgrupo: grupo?.grupoPaiId ? agenda.grupoMercadoriaId : null,
      ranking: agenda.ranking,
      areaEstoque: agenda.areaEstoque,
      localEstoque: agenda.localEstoque,
      localVenda: agenda.localVenda,
      responsavelId: agenda.responsavelId,
      inicioData: agenda.inicioData,
      inicioHora: agenda.inicioHora,
      observacao: agenda.observacao ?? ""
    });
    regra.value = agenda.regra;
    termino.value = agenda.termino;
  },
  { immediate: true }
);
watch(
  () => form.grupo,
  () => {
    if (!subgrupos.value.some((item) => item.id === form.subgrupo)) form.subgrupo = null;
  }
);

function alternarRanking(ranking: RankingConferencia) {
  form.ranking = form.ranking === ranking ? null : ranking;
}

function salvar() {
  erro.value = "";
  if (!form.responsavelId) return void (erro.value = "Escolha quem vai contar.");
  if (!form.inicioData || !form.inicioHora)
    return void (erro.value = "Informe a data e a hora da primeira conferência.");
  emit("salvar", {
    empresaId: props.empresaId,
    responsavelId: form.responsavelId,
    grupoMercadoriaId: form.subgrupo || form.grupo || null,
    ranking: form.ranking,
    areaEstoque: form.areaEstoque || null,
    localEstoque: form.localEstoque || null,
    localVenda: form.localVenda || null,
    inicioData: form.inicioData,
    inicioHora: form.inicioHora,
    regra: regra.value,
    termino: termino.value,
    observacao: form.observacao || null
  });
}

defineExpose({ limpar });
</script>

<template>
  <v-card variant="outlined" data-secao="agenda-conferencia">
    <v-card-title class="d-flex align-center ga-2 text-wrap">
      <v-icon icon="mdi-calendar-sync-outline" color="primary" />
      {{ editando ? "Editar agendamento de conferência" : "Agendar conferência de estoque" }}
    </v-card-title>
    <v-card-subtitle class="text-wrap">
      Sem filtro, a conferência cobre todo o estoque. Na data, quem conta recebe o aviso no sino.
    </v-card-subtitle>
    <v-card-text class="d-grid ga-4">
      <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
      <div class="campos">
        <v-select
          v-model="form.grupo"
          :items="gruposPai"
          item-title="nome"
          item-value="id"
          label="Grupo"
          clearable
          hide-details="auto"
        />
        <v-select
          v-model="form.subgrupo"
          :items="subgrupos"
          item-title="nome"
          item-value="id"
          label="Subgrupo"
          clearable
          :disabled="!subgrupos.length"
          hide-details="auto"
        />
        <v-select v-model="form.areaEstoque" :items="opcoes.areas" label="Área" clearable hide-details="auto" />
        <v-select
          v-model="form.localEstoque"
          :items="opcoes.locaisEstoque"
          label="Setor / local de estoque"
          clearable
          hide-details="auto"
        />
        <v-select
          v-model="form.localVenda"
          :items="opcoes.locaisVenda"
          label="Local de venda"
          clearable
          hide-details="auto"
        />
        <v-select
          v-model="form.responsavelId"
          :items="opcoes.responsaveis"
          item-title="nome"
          item-value="usuarioId"
          label="Quem conta *"
          hint="Só aparece quem pode ver conferências."
          persistent-hint
        />
      </div>
      <div class="d-grid ga-1">
        <span class="text-body-2">Só os produtos que mais…</span>
        <div class="d-flex flex-wrap ga-2" role="group" aria-label="Recorte por ranking">
          <v-chip
            v-for="ranking in rankingsConferencia"
            :key="ranking"
            size="small"
            :color="form.ranking === ranking ? 'primary' : undefined"
            :variant="form.ranking === ranking ? 'flat' : 'outlined'"
            :aria-pressed="form.ranking === ranking"
            @click="alternarRanking(ranking)"
            >{{ ROTULO_RANKING_CONFERENCIA[ranking] }}</v-chip
          >
        </div>
        <span class="text-caption text-medium-emphasis">Top 20% dos últimos 3 meses. Nenhum marcado = todos.</span>
      </div>
      <div class="campos">
        <v-text-field
          v-model="form.inicioData"
          type="date"
          label="Primeira conferência em *"
          :min="hoje()"
          hide-details="auto"
        />
        <v-text-field v-model="form.inicioHora" type="time" label="Hora *" hide-details="auto" />
        <RecorrenciaCampo v-model:regra="regra" v-model:termino="termino" :inicio-data="form.inicioData" />
      </div>
      <v-textarea v-model="form.observacao" label="Orientação para quem conta" rows="2" auto-grow counter="1000" />
    </v-card-text>
    <v-card-actions class="px-4 pb-4">
      <v-spacer />
      <v-btn variant="text" @click="emit('cancelar')">Cancelar</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save" :loading="salvando" @click="salvar">Salvar</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.campos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  align-items: start;
}
</style>
