<script setup lang="ts">
import type { OperacaoResumo, Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
}>();

const { apiGetPaginado } = useApi();
const filtros = reactive({
  pdvId: "",
  dataInicio: "",
  dataFim: ""
});
const linhas = ref<OperacaoResumo[]>([]);
const carregando = ref(false);
const erro = ref("");

async function buscar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({
      empresaId: props.empresaId,
      somentePendentes: "true",
      pageSize: "100"
    });
    if (filtros.pdvId) params.set("pdvId", filtros.pdvId);
    if (filtros.dataInicio) params.set("dataInicio", filtros.dataInicio);
    if (filtros.dataFim) params.set("dataFim", filtros.dataFim);
    const resultado = await apiGetPaginado<OperacaoResumo>(`/api/despesas?${params.toString()}`);
    linhas.value = resultado.itens;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.empresaId,
  () => void buscar(),
  { immediate: true }
);
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between ga-3">
      <div>
        <div class="text-h6">Contas a pagar</div>
        <div class="text-body-2 text-muted">Despesas pendentes de pagamento.</div>
      </div>
      <v-btn color="primary" prepend-icon="mdi-magnify" :loading="carregando" @click="buscar">Buscar</v-btn>
    </v-card-title>
    <v-card-text>
      <v-row dense class="mb-4">
        <v-col cols="12" md="4">
          <v-select v-model="filtros.pdvId" :items="pdvs" item-title="nome" item-value="id" label="PDV" clearable />
        </v-col>
        <v-col cols="12" md="4"><v-text-field v-model="filtros.dataInicio" type="date" label="Data inicial" /></v-col>
        <v-col cols="12" md="4"><v-text-field v-model="filtros.dataFim" type="date" label="Data final" /></v-col>
      </v-row>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
      <div class="responsive-table-shell">
        <v-table>
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Descricao</th>
              <th>Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhas" :key="linha.id">
              <td>{{ formatarDataSomenteDia(linha.dataVencimento ?? linha.dataReferencia) }}</td>
              <td>{{ linha.descricao }}</td>
              <td>{{ dinheiro(linha.valorOriginal) }}</td>
              <td>{{ linha.status }}</td>
            </tr>
            <tr v-if="!linhas.length">
              <td colspan="4" class="text-center text-muted py-8">Nenhuma despesa pendente encontrada.</td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </v-card-text>
  </v-card>
</template>
