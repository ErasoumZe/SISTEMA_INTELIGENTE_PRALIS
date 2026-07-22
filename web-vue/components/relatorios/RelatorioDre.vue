<script setup lang="ts">
import type { LinhaHistoricoCaixa, TotaisHistoricoCaixa } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { agruparDre, resultadoDoPeriodo, type DimensaoDre } from "~/utils/dre";
import { CORES_COCKPIT } from "~/utils/cockpit-caixa";

const props = defineProps<{ empresaId: string; pdvs?: Opcao[]; turnos?: Opcao[] }>();
const { apiGetPaginado } = useApi();

const filtros = reactive({ dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" });
const dimensao = ref<DimensaoDre>("pdv");
const carregando = ref(false);
const erro = ref("");
const linhas = ref<LinhaHistoricoCaixa[]>([]);
const totais = ref<TotaisHistoricoCaixa | null>(null);

const dimensoes: Array<{ value: DimensaoDre; title: string }> = [
  { value: "pdv", title: "Por PDV" },
  { value: "turno", title: "Por turno" },
  { value: "dia", title: "Por dia" }
];
const statusItens = [
  { value: "", title: "Todos" },
  { value: "fechado", title: "Fechados" },
  { value: "aberto", title: "Abertos" }
];

const resultado = computed(() => resultadoDoPeriodo(totais.value));
const agrupado = computed(() => agruparDre(linhas.value, dimensao.value));

const cardsResultado = computed(() => [
  { rotulo: "Entradas", valor: resultado.value.entradas, cor: CORES_COCKPIT.entradas },
  { rotulo: "Transferencias", valor: resultado.value.transferencias, cor: CORES_COCKPIT.transferencias },
  { rotulo: "Despesas", valor: resultado.value.despesas, cor: CORES_COCKPIT.despesas },
  { rotulo: "Mercadorias", valor: resultado.value.mercadorias, cor: CORES_COCKPIT.mercadorias },
  { rotulo: "Retiradas", valor: resultado.value.retiradas, cor: CORES_COCKPIT.retiradas },
  { rotulo: "Resultado", valor: resultado.value.saldo, cor: CORES_COCKPIT.resultado }
]);

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({ empresaId: props.empresaId, pageSize: "500" });
    if (filtros.dataInicio) params.set("dataInicio", filtros.dataInicio);
    if (filtros.dataFim) params.set("dataFim", filtros.dataFim);
    if (filtros.pdvId) params.set("pdvId", filtros.pdvId);
    if (filtros.turnoId) params.set("turnoId", filtros.turnoId);
    if (filtros.status) params.set("status", filtros.status);
    const resposta = await apiGetPaginado<LinhaHistoricoCaixa, { totais: TotaisHistoricoCaixa }>(
      `/api/caixa/historico?${params.toString()}`
    );
    linhas.value = resposta.itens ?? [];
    totais.value = resposta.meta?.totais ?? null;
  } catch (error) {
    erro.value = mensagemErro(error);
    linhas.value = [];
    totais.value = null;
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.empresaId,
  () => void carregar(),
  { immediate: true }
);
</script>

<template>
  <v-card>
    <v-card-title class="report-card-head">
      <div class="text-h6">DRE do periodo</div>
      <div class="text-body-2 text-muted">
        Resultado por periodo, PDV e turno a partir dos totais persistidos de cada caixa (sem recalcular).
      </div>
    </v-card-title>
    <v-card-text>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-3">{{ erro }}</v-alert>

      <v-row dense class="mb-2">
        <v-col cols="6" md="2"><v-text-field v-model="filtros.dataInicio" type="date" label="De" hide-details /></v-col>
        <v-col cols="6" md="2"><v-text-field v-model="filtros.dataFim" type="date" label="Ate" hide-details /></v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filtros.pdvId"
            :items="[{ id: '', nome: 'Todos os PDVs' }, ...(pdvs ?? [])]"
            item-title="nome"
            item-value="id"
            label="PDV"
            hide-details
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="filtros.turnoId"
            :items="[{ id: '', nome: 'Todos os turnos' }, ...(turnos ?? [])]"
            item-title="nome"
            item-value="id"
            label="Turno"
            hide-details
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select v-model="filtros.status" :items="statusItens" label="Status" hide-details />
        </v-col>
        <v-col cols="12" md="1">
          <v-btn color="primary" block :loading="carregando" @click="carregar">Filtrar</v-btn>
        </v-col>
      </v-row>

      <div class="dre-cards my-4">
        <v-sheet
          v-for="card in cardsResultado"
          :key="card.rotulo"
          class="pa-3 rounded-lg dre-card"
          :style="{ '--cor-card': card.cor }"
        >
          <div class="text-caption text-medium-emphasis">{{ card.rotulo }}</div>
          <div class="text-h6">{{ dinheiro(card.valor) }}</div>
        </v-sheet>
      </div>

      <div class="d-flex align-center ga-3 mb-2">
        <span class="text-subtitle-2">Detalhamento</span>
        <v-btn-toggle v-model="dimensao" density="compact" variant="outlined" mandatory>
          <v-btn v-for="dim in dimensoes" :key="dim.value" :value="dim.value" size="small">{{ dim.title }}</v-btn>
        </v-btn-toggle>
      </div>

      <div class="responsive-table-shell">
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ dimensao === "pdv" ? "PDV" : dimensao === "turno" ? "Turno" : "Dia" }}</th>
              <th class="text-right">Entradas</th>
              <th class="text-right">Transfer.</th>
              <th class="text-right">Despesas</th>
              <th class="text-right">Mercad.</th>
              <th class="text-right">Retiradas</th>
              <th class="text-right">Resultado</th>
              <th class="text-right">Caixas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in agrupado" :key="linha.chave">
              <td>{{ linha.rotulo }}</td>
              <td class="text-right">{{ dinheiro(linha.entradas) }}</td>
              <td class="text-right">{{ dinheiro(linha.transferencias) }}</td>
              <td class="text-right">{{ dinheiro(linha.despesas) }}</td>
              <td class="text-right">{{ dinheiro(linha.mercadorias) }}</td>
              <td class="text-right">{{ dinheiro(linha.retiradas) }}</td>
              <td class="text-right font-weight-medium">{{ dinheiro(linha.saldo) }}</td>
              <td class="text-right">{{ linha.caixas }}</td>
            </tr>
            <tr v-if="!agrupado.length">
              <td colspan="8" class="text-center text-medium-emphasis py-8">
                {{ carregando ? "Carregando..." : "Nenhum caixa no periodo." }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.dre-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.dre-card {
  border-left: 4px solid var(--cor-card);
  background: rgba(var(--v-theme-surface-variant), 0.35);
}
</style>
