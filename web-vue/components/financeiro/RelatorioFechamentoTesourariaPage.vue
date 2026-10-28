<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";
import { separarPorSituacao, type LinhaRelatorio } from "~/utils/relatorio-fechamento";
import RelatorioFechamentoCartaoCaixa from "./RelatorioFechamentoCartaoCaixa.vue";
import RelatorioFechamentoDossie from "./RelatorioFechamentoDossie.vue";
import RelatorioFechamentoFiltros, { type FiltrosFechamento } from "./RelatorioFechamentoFiltros.vue";

// Fila do Relatorio de fechamento: filtros, abas (Para conferir / Ja conferidos) e um cartao por caixa. Abrir um
// cartao mostra o fechamento inteiro (RelatorioFechamentoDossie), onde a Tesouraria toma a decisao.
const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
  turnos: Opcao[];
  podeConferir: boolean;
  podeConferirTransferencia?: boolean;
  podeVerTransferencias?: boolean;
}>();

const { apiGetPaginado } = useApi();
const filtros = reactive<FiltrosFechamento>({ dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" });
const abaAtiva = ref<"conferir" | "historico">("conferir");
const linhas = ref<LinhaRelatorio[]>([]);
const carregando = ref(false);
const erro = ref("");
const pagina = ref(1);
const itensPorPagina = 20;
const total = ref(0);
const caixaSelecionado = ref<LinhaRelatorio | null>(null);
const dossieAberto = ref(false);

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));
const fila = computed(() => separarPorSituacao(linhas.value));
const linhasDaAba = computed(() => (abaAtiva.value === "conferir" ? fila.value.paraConferir : fila.value.historico));
const periodoInvertido = computed(() =>
  Boolean(filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim)
);

function parametros() {
  const params = new URLSearchParams({
    empresaId: props.empresaId,
    page: String(pagina.value),
    pageSize: String(itensPorPagina)
  });
  for (const [chave, valor] of Object.entries(filtros)) if (valor) params.set(chave, valor);
  return params;
}

async function buscar() {
  if (!props.empresaId || periodoInvertido.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    const resultado = await apiGetPaginado<LinhaRelatorio>(`/api/relatorios/fechamentos?${parametros().toString()}`);
    linhas.value = resultado.itens;
    total.value = resultado.total;
  } catch (error) {
    erro.value = mensagemErro(error);
    linhas.value = [];
    total.value = 0;
  } finally {
    carregando.value = false;
  }
}

function aplicarFiltros() {
  pagina.value = 1;
  void buscar();
}
function limparFiltros() {
  Object.assign(filtros, { dataInicio: "", dataFim: "", pdvId: "", turnoId: "", status: "" });
  aplicarFiltros();
}
function abrirDossie(linha: LinhaRelatorio) {
  caixaSelecionado.value = linha;
  dossieAberto.value = true;
}

watch(pagina, () => void buscar());
watch(
  () => props.empresaId,
  () => {
    pagina.value = 1;
    void buscar();
  },
  { immediate: true }
);
</script>

<template>
  <v-card class="relatorio-fechamento">
    <v-card-text>
      <div class="mb-5">
        <div class="text-overline text-primary">TESOURARIA</div>
        <h2 class="text-h6">Relatório de fechamento</h2>
        <p class="text-body-2 text-medium-emphasis mb-0">Consulte cada fechamento por PDV e turno.</p>
      </div>

      <RelatorioFechamentoFiltros
        v-model="filtros"
        :pdvs="pdvs"
        :turnos="turnos"
        :carregando="carregando"
        @aplicar="aplicarFiltros"
        @limpar="limparFiltros"
      />

      <v-alert v-if="erro" type="error" variant="tonal" class="mt-4" role="alert">{{ erro }}</v-alert>

      <v-progress-linear v-if="carregando" indeterminate color="primary" class="mt-5" />
      <template v-else>
        <v-tabs v-model="abaAtiva" color="primary" class="mt-4" grow>
          <v-tab value="conferir">Para conferir ({{ fila.paraConferir.length }})</v-tab>
          <v-tab value="historico">Já conferidos ({{ fila.historico.length }})</v-tab>
        </v-tabs>
        <p v-if="totalPaginas > 1" class="text-caption text-medium-emphasis mt-2 mb-0">
          Página {{ pagina }} de {{ totalPaginas }} · {{ total }} fechamentos no filtro. As abas contam só esta página.
        </p>
        <v-alert v-if="fila.emOperacao.length" type="info" variant="tonal" density="compact" class="mt-3">
          {{ fila.emOperacao.length }} caixa(s) em abertura ou fechamento operacional não entram na fila da Tesouraria.
        </v-alert>
        <v-alert v-if="!linhasDaAba.length && linhas.length" type="info" variant="tonal" density="compact" class="mt-3">
          {{
            abaAtiva === "conferir"
              ? "Nenhum caixa aguardando conferência da Tesouraria nesta página."
              : "Nenhum caixa já concluído pela Tesouraria nesta página."
          }}
        </v-alert>
        <v-row class="mt-2" dense>
          <v-col v-for="linha in linhasDaAba" :key="linha.id" cols="12" md="6" xl="4">
            <RelatorioFechamentoCartaoCaixa :linha="linha" @abrir="abrirDossie" />
          </v-col>
          <v-col v-if="!linhas.length" cols="12"
            ><v-alert type="info" variant="tonal">Nenhum fechamento para os filtros informados.</v-alert></v-col
          >
        </v-row>
      </template>
      <v-pagination
        v-if="totalPaginas > 1"
        v-model="pagina"
        class="mt-5"
        :length="totalPaginas"
        density="comfortable"
      />
    </v-card-text>
  </v-card>

  <RelatorioFechamentoDossie
    v-model="dossieAberto"
    :caixa="caixaSelecionado"
    :empresa-id="empresaId"
    :pode-conferir="podeConferir"
    :pode-conferir-transferencia="podeConferirTransferencia"
    :pode-ver-transferencias="podeVerTransferencias"
    @alterado="buscar"
  />
</template>
