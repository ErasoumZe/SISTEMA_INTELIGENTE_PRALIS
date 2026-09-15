<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { LinhaHistoricoCaixa, TotaisHistoricoCaixa } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";
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
const caixasAbertos = ref<LinhaHistoricoCaixa[]>([]);
const monitorAtualizadoEm = ref<string | null>(null);
let monitorIntervalo: ReturnType<typeof setInterval> | null = null;
let sincronizandoAoVivo = false;

const periodoInvertido = computed(
  () => Boolean(filtros.dataInicio && filtros.dataFim) && filtros.dataInicio > filtros.dataFim
);

// sortable: false de proposito — a pagina vem pronta do servidor (ordenada por data de movimento).
// Ordenar no cliente reordenaria SO as 25 linhas visiveis, dando a impressao de ordenar o filtro
// inteiro. Se precisar de ordenacao por coluna, ela tem de ir para a query.
const colunas = [
  { title: "Data", key: "dataMovimento", sortable: false },
  { title: "PDV", key: "pdvNome", sortable: false },
  { title: "Operador", key: "operador", sortable: false },
  { title: "Turno", key: "turnoNome", sortable: false },
  { title: "Abertura -> Fechamento", key: "periodo", sortable: false },
  { title: "Fechado por", key: "fechadoPorNome", sortable: false },
  { title: "Pós-fechamento", key: "alteradoAposFechamento", sortable: false },
  { title: "Entradas", key: "totalEntradas", align: "end" as const, sortable: false },
  { title: "Despesas", key: "totalDespesas", align: "end" as const, sortable: false },
  { title: "Retiradas", key: "totalRetiradas", align: "end" as const, sortable: false },
  { title: "Mercadorias", key: "totalMercadorias", align: "end" as const, sortable: false },
  { title: "Transf. entrada", key: "totalTransferenciasEntrada", align: "end" as const, sortable: false },
  { title: "Transf. saida", key: "totalTransferenciasSaida", align: "end" as const, sortable: false },
  { title: "Saldo", key: "saldo", align: "end" as const, sortable: false },
  { title: "Status", key: "status", sortable: false }
];

function paramsFiltro() {
  const params = new URLSearchParams({ empresaId: props.empresaId });
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }
  return params;
}

async function buscar(opcoes: { preservarExpandido?: boolean; silencioso?: boolean } = {}) {
  if (!props.empresaId || periodoInvertido.value) return;
  if (!opcoes.silencioso) carregando.value = true;
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
    if (!opcoes.preservarExpandido) expandido.value = [];
  } catch (error) {
    erro.value = mensagemErro(error);
    linhas.value = [];
    totais.value = null;
    total.value = 0;
  } finally {
    if (!opcoes.silencioso) carregando.value = false;
  }
}

// O monitor reutiliza a consulta autorizada do historico com status=aberto. Nao calcula saldo
// parcial nem cria uma segunda rota: os detalhes continuam na trilha auditavel ja existente.
async function buscarCaixasAbertos() {
  if (!props.empresaId) return;
  try {
    const params = new URLSearchParams({
      empresaId: props.empresaId,
      status: "aberto",
      page: "1",
      pageSize: "100"
    });
    const resultado = await apiGetPaginado<LinhaHistoricoCaixa>(`/api/caixa/historico?${params.toString()}`);
    caixasAbertos.value = resultado.itens;
    monitorAtualizadoEm.value = new Date().toISOString();
  } catch {
    // A tabela principal continua sendo a fonte de erro. Uma falha temporaria de atualizacao nao
    // pode limpar a ultima leitura valida do monitor nem interromper a consulta historica.
  }
}

function verCaixaAberto(caixa: LinhaHistoricoCaixa) {
  Object.assign(filtros, { status: "aberto", pdvId: caixa.pdvId ?? "" });
  pagina.value = 1;
  void buscar();
}

async function aplicarFiltros() {
  pagina.value = 1;
  await buscar();
}

function limparFiltros() {
  Object.assign(filtros, { dataInicio: "", dataFim: "", pdvId: "", colaboradorId: "", turnoId: "", status: "" });
  void aplicarFiltros();
}

async function sincronizarAoVivo() {
  if (sincronizandoAoVivo || document.visibilityState !== "visible") return;
  sincronizandoAoVivo = true;
  try {
    await Promise.all([buscar({ preservarExpandido: true, silencioso: true }), buscarCaixasAbertos()]);
  } finally {
    sincronizandoAoVivo = false;
  }
}

function aoVoltarParaPagina() {
  void sincronizarAoVivo();
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
watch(
  () => props.empresaId,
  () => {
    void aplicarFiltros();
    void buscarCaixasAbertos();
  },
  { immediate: true }
);

onMounted(() => {
  // Sem websocket no ambiente local, a pagina faz polling somente quando esta visivel e atualiza
  // tanto o monitor quanto a grade. O foco/retorno da aba busca imediatamente, sem esperar o ciclo.
  monitorIntervalo = setInterval(() => void sincronizarAoVivo(), 15_000);
  window.addEventListener("focus", aoVoltarParaPagina);
  document.addEventListener("visibilitychange", aoVoltarParaPagina);
});

onBeforeUnmount(() => {
  if (monitorIntervalo) clearInterval(monitorIntervalo);
  window.removeEventListener("focus", aoVoltarParaPagina);
  document.removeEventListener("visibilitychange", aoVoltarParaPagina);
});
</script>

<template>
  <v-card>
    <!-- Titulo removido: o nome da tela ja e o cabecalho da pagina (VIS-10). -->
    <v-card-text>
      <v-sheet class="pa-4 mb-5 rounded-lg soft-bg" data-teste="monitor-caixas-abertos">
        <div class="d-flex flex-wrap align-center ga-3">
          <div>
            <div class="text-subtitle-1 font-weight-bold">Monitor de caixas abertos</div>
            <div class="text-caption text-medium-emphasis">
              Sincroniza a cada 15 segundos enquanto esta pagina esta aberta.
              <template v-if="monitorAtualizadoEm">
                Ultima atualizacao: {{ formatarDataHora(monitorAtualizadoEm) }}.</template
              >
            </div>
          </div>
          <v-spacer />
          <v-chip color="info" variant="tonal" prepend-icon="mdi-cash-register">
            {{ caixasAbertos.length }} {{ caixasAbertos.length === 1 ? "caixa aberto" : "caixas abertos" }}
          </v-chip>
        </div>
        <div v-if="caixasAbertos.length" class="d-flex flex-wrap ga-2 mt-3">
          <v-btn
            v-for="caixa in caixasAbertos"
            :key="caixa.id"
            size="small"
            variant="outlined"
            prepend-icon="mdi-eye-outline"
            @click="verCaixaAberto(caixa)"
          >
            {{ caixa.pdvNome }} - {{ caixa.colaboradorNome || caixa.usuarioCaixaNome || "Operador nao informado" }}
            <template v-if="caixa.dataHoraAbertura"> (desde {{ formatarDataHora(caixa.dataHoraAbertura) }})</template>
          </v-btn>
        </div>
        <div v-else class="text-body-2 text-medium-emphasis mt-3">Nenhum caixa aberto neste momento.</div>
      </v-sheet>

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
            :error-messages="periodoInvertido ? 'A data final é anterior à inicial.' : undefined"
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
        <template #[`item.dataMovimento`]="{ item }">{{ formatarDataSomenteDia(item.dataMovimento) }}</template>
        <template #[`item.operador`]="{ item }">{{ item.colaboradorNome || item.usuarioCaixaNome || "--" }}</template>
        <template #[`item.turnoNome`]="{ item }">{{ item.turnoNome || "--" }}</template>
        <template #[`item.periodo`]="{ item }">
          {{ item.dataHoraAbertura ? formatarDataHora(item.dataHoraAbertura) : "--" }} ->
          {{ item.dataHoraFechamento ? formatarDataHora(item.dataHoraFechamento) : "em aberto" }}
        </template>
        <template #[`item.fechadoPorNome`]="{ item }">{{ item.fechadoPorNome || "--" }}</template>
        <template #[`item.alteradoAposFechamento`]="{ item }">
          <v-chip v-if="item.alteradoAposFechamento" color="warning" size="small" variant="tonal">
            Alterado após fechamento
          </v-chip>
          <span v-else>--</span>
        </template>
        <template #[`item.totalEntradas`]="{ item }">{{ dinheiro(item.totalEntradas) }}</template>
        <template #[`item.totalDespesas`]="{ item }">{{ dinheiro(item.totalDespesas) }}</template>
        <template #[`item.totalRetiradas`]="{ item }">{{ dinheiro(item.totalRetiradas) }}</template>
        <template #[`item.totalMercadorias`]="{ item }">{{ dinheiro(item.totalMercadorias) }}</template>
        <template #[`item.totalTransferenciasEntrada`]="{ item }">
          {{ dinheiro(item.totalTransferenciasEntrada) }}
        </template>
        <template #[`item.totalTransferenciasSaida`]="{ item }">
          {{ dinheiro(item.totalTransferenciasSaida) }}
        </template>
        <template #[`item.saldo`]="{ item }">
          <strong>{{ dinheiro(item.saldo) }}</strong>
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

      <!-- Rodape: totais do filtro inteiro. Fechados usam o snapshot; abertos, o retrato ao vivo. -->
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
          Caixa fechado usa o snapshot do fechamento; caixa aberto mostra o retrato operacional ao vivo.
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
