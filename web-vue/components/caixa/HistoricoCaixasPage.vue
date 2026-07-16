<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { LinhaHistoricoCaixa, TotaisHistoricoCaixa } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataIso } from "~/utils/formatacao";
import CaixaDetalhe from "~/components/caixa/CaixaDetalhe.vue";

const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
  turnos: Opcao[];
  colaboradores: Opcao[];
}>();

type MetaHistorico = { totais: TotaisHistoricoCaixa };

const { apiGetPaginado } = useApi();

// Os filtros espelham o historicoCaixaQuerySchema: o servidor e quem filtra, pagina e soma.
// Filtrar no cliente daria numero errado — a pagina nao e o conjunto.
const filtros = reactive({
  dataInicio: "",
  dataFim: "",
  pdvId: "",
  colaboradorId: "",
  turnoId: "",
  status: ""
});

const statusOpcoes = [
  { title: "Todos", value: "" },
  { title: "Aberto", value: "aberto" },
  { title: "Fechado", value: "fechado" }
];

const linhas = ref<LinhaHistoricoCaixa[]>([]);
const totais = ref<TotaisHistoricoCaixa | null>(null);
const expandido = ref<string[]>([]);
const pagina = ref(1);
const itensPorPagina = 25;
const total = ref(0);
const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));
const carregando = ref(false);
const erro = ref("");

const periodoInvertido = computed(
  () => Boolean(filtros.dataInicio && filtros.dataFim) && filtros.dataInicio > filtros.dataFim
);

const colunas = [
  { title: "Data", key: "dataMovimento" },
  { title: "PDV", key: "pdvNome" },
  { title: "Operador", key: "operador" },
  { title: "Turno", key: "turnoNome" },
  { title: "Abertura -> Fechamento", key: "periodo" },
  { title: "Entradas", key: "totalEntradas", align: "end" as const },
  { title: "Despesas", key: "totalDespesas", align: "end" as const },
  { title: "Retiradas", key: "totalRetiradas", align: "end" as const },
  { title: "Mercadorias", key: "totalMercadorias", align: "end" as const },
  { title: "Transf. entrada", key: "totalTransferenciasEntrada", align: "end" as const },
  { title: "Transf. saida", key: "totalTransferenciasSaida", align: "end" as const },
  { title: "Saldo", key: "saldo", align: "end" as const },
  { title: "Status", key: "status" }
];

function paramsFiltro() {
  const params = new URLSearchParams({ empresaId: props.empresaId });
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }
  return params;
}

async function buscar() {
  if (!props.empresaId || periodoInvertido.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = paramsFiltro();
    params.set("page", String(pagina.value));
    params.set("pageSize", String(itensPorPagina));
    const resultado = await apiGetPaginado<LinhaHistoricoCaixa, MetaHistorico>(
      `/api/caixa/historico?${params.toString()}`
    );
    linhas.value = resultado.itens;
    total.value = resultado.total;
    // Totais do FILTRO inteiro, nao da pagina: vem do meta junto da paginacao.
    totais.value = resultado.meta?.totais ?? null;
    expandido.value = [];
  } catch (error) {
    erro.value = mensagemErro(error);
    linhas.value = [];
    totais.value = null;
    total.value = 0;
  } finally {
    carregando.value = false;
  }
}

async function aplicarFiltros() {
  pagina.value = 1;
  await buscar();
}

function limparFiltros() {
  Object.assign(filtros, { dataInicio: "", dataFim: "", pdvId: "", colaboradorId: "", turnoId: "", status: "" });
  void aplicarFiltros();
}

// Caixa aberto ainda nao teve os totais gravados pelo fechamento: mostrar "42,00" ali seria mentira.
function caixaEmAberto(linha: LinhaHistoricoCaixa) {
  return linha.status === "aberto";
}

function valorColuna(linha: LinhaHistoricoCaixa, valor: number) {
  return caixaEmAberto(linha) ? "--" : dinheiro(valor);
}

function corStatus(linha: LinhaHistoricoCaixa) {
  if (linha.status === "aberto") return "info";
  return linha.temAjuste ? "warning" : "success";
}

function rotuloStatus(linha: LinhaHistoricoCaixa) {
  if (linha.status === "aberto") return "Aberto";
  return linha.temAjuste ? "Fechado com acerto" : "Fechado";
}

watch(pagina, () => void buscar());
watch(() => props.empresaId, aplicarFiltros, { immediate: true });
</script>

<template>
  <v-card>
    <v-card-title>Historico de caixas</v-card-title>
    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="2">
          <v-text-field
            v-model="filtros.dataInicio"
            type="date"
            label="Data inicial"
            :error="periodoInvertido"
            hide-details="auto"
          />
        </v-col>
        <v-col cols="12" md="2">
          <v-text-field
            v-model="filtros.dataFim"
            type="date"
            label="Data final"
            :error="periodoInvertido"
            :error-messages="periodoInvertido ? 'A data final e anterior a inicial.' : undefined"
            hide-details="auto"
          />
        </v-col>
        <v-col cols="12" md="2">
          <v-select
            v-model="filtros.pdvId"
            :items="pdvs"
            item-title="nome"
            item-value="id"
            label="PDV"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="12" md="2">
          <v-select
            v-model="filtros.colaboradorId"
            :items="colaboradores"
            item-title="nome"
            item-value="id"
            label="Operador"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="12" md="2">
          <v-select
            v-model="filtros.turnoId"
            :items="turnos"
            item-title="nome"
            item-value="id"
            label="Turno"
            clearable
            hide-details
          />
        </v-col>
        <v-col cols="12" md="2">
          <v-select v-model="filtros.status" :items="statusOpcoes" label="Status" hide-details />
        </v-col>
      </v-row>

      <div class="d-flex ga-2 mt-4">
        <v-btn
          color="primary"
          prepend-icon="mdi-magnify"
          :loading="carregando"
          :disabled="periodoInvertido"
          @click="aplicarFiltros"
        >
          Filtrar
        </v-btn>
        <v-btn variant="text" prepend-icon="mdi-filter-remove" @click="limparFiltros">Limpar</v-btn>
      </div>

      <v-alert v-if="erro" type="error" variant="tonal" class="mt-4">{{ erro }}</v-alert>

      <v-data-table
        v-model:expanded="expandido"
        class="mt-4"
        :headers="colunas"
        :items="linhas"
        :loading="carregando"
        item-value="id"
        show-expand
        hide-default-footer
        :items-per-page="itensPorPagina"
        no-data-text="Nenhum caixa no filtro."
      >
        <template #[`item.dataMovimento`]="{ item }">{{ formatarDataIso(item.dataMovimento) }}</template>
        <template #[`item.operador`]="{ item }">{{ item.colaboradorNome || item.usuarioCaixaNome || "--" }}</template>
        <template #[`item.turnoNome`]="{ item }">{{ item.turnoNome || "--" }}</template>
        <template #[`item.periodo`]="{ item }">
          {{ item.dataHoraAbertura ? formatarDataHora(item.dataHoraAbertura) : "--" }} ->
          {{ item.dataHoraFechamento ? formatarDataHora(item.dataHoraFechamento) : "em aberto" }}
        </template>
        <template #[`item.totalEntradas`]="{ item }">{{ valorColuna(item, item.totalEntradas) }}</template>
        <template #[`item.totalDespesas`]="{ item }">{{ valorColuna(item, item.totalDespesas) }}</template>
        <template #[`item.totalRetiradas`]="{ item }">{{ valorColuna(item, item.totalRetiradas) }}</template>
        <template #[`item.totalMercadorias`]="{ item }">{{ valorColuna(item, item.totalMercadorias) }}</template>
        <template #[`item.totalTransferenciasEntrada`]="{ item }">
          {{ valorColuna(item, item.totalTransferenciasEntrada) }}
        </template>
        <template #[`item.totalTransferenciasSaida`]="{ item }">
          {{ valorColuna(item, item.totalTransferenciasSaida) }}
        </template>
        <template #[`item.saldo`]="{ item }">
          <strong>{{ valorColuna(item, item.saldo) }}</strong>
        </template>
        <template #[`item.status`]="{ item }">
          <v-chip :color="corStatus(item)" size="small" variant="tonal">{{ rotuloStatus(item) }}</v-chip>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-4 soft-bg">
              <CaixaDetalhe :caixa="item" :empresa-id="empresaId" />
            </td>
          </tr>
        </template>
      </v-data-table>

      <!-- Rodape: totais do FILTRO inteiro (todas as paginas). Caixa aberto entra com 0 nas somas
           porque o fechamento ainda nao gravou os totais dele — por isso o aviso. -->
      <v-sheet v-if="totais" class="pa-4 mt-4 rounded-lg soft-bg">
        <div class="d-flex flex-wrap ga-6 align-center">
          <div>
            <div class="text-caption">Caixas no filtro</div>
            <div class="text-h6">{{ totais.caixas }}</div>
          </div>
          <div>
            <div class="text-caption">Entradas</div>
            <div class="text-h6">{{ dinheiro(totais.totalEntradas) }}</div>
          </div>
          <div>
            <div class="text-caption">Despesas</div>
            <div class="text-h6">{{ dinheiro(totais.totalDespesas) }}</div>
          </div>
          <div>
            <div class="text-caption">Retiradas</div>
            <div class="text-h6">{{ dinheiro(totais.totalRetiradas) }}</div>
          </div>
          <div>
            <div class="text-caption">Mercadorias</div>
            <div class="text-h6">{{ dinheiro(totais.totalMercadorias) }}</div>
          </div>
          <div>
            <div class="text-caption">Transf. entrada</div>
            <div class="text-h6">{{ dinheiro(totais.totalTransferenciasEntrada) }}</div>
          </div>
          <div>
            <div class="text-caption">Transf. saida</div>
            <div class="text-h6">{{ dinheiro(totais.totalTransferenciasSaida) }}</div>
          </div>
          <div>
            <div class="text-caption">Saldo</div>
            <div class="text-h6">{{ dinheiro(totais.saldo) }}</div>
          </div>
        </div>
        <div class="text-caption mt-2 text-medium-emphasis">
          Os totais somam os valores gravados no fechamento. Caixa ainda aberto entra como zero.
        </div>
      </v-sheet>

      <v-pagination
        v-if="totalPaginas > 1"
        v-model="pagina"
        class="mt-4"
        :length="totalPaginas"
        density="comfortable"
      />
    </v-card-text>
  </v-card>
</template>
