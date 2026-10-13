<script setup lang="ts">
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

type Categoria = "despesas" | "mercadorias" | "retiradas";
const props = defineProps<{ aberto: boolean; caixaId: string; empresaId: string; categoria: Categoria }>();
const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();
const { apiGetPaginado } = useApi();
const itens = ref<OperacaoResumo[]>([]);
const carregando = ref(false);
const erro = ref("");
let consultaAtual = 0;

const dialogAberto = computed({
  get: () => props.aberto,
  set: (aberto: boolean) => emit("update:aberto", aberto)
});
const titulo = computed(
  () => ({ despesas: "Despesas", mercadorias: "Mercadorias", retiradas: "Retiradas" })[props.categoria]
);

function dataItem(item: OperacaoResumo) {
  return item.criadoEm ? formatarDataHora(item.criadoEm) : item.dataReferencia;
}

async function carregar() {
  const consulta = ++consultaAtual;
  carregando.value = true;
  erro.value = "";
  try {
    const query = new URLSearchParams({
      empresaId: props.empresaId,
      caixaId: props.caixaId,
      page: "1",
      pageSize: "5"
    });
    const resultado = await apiGetPaginado<OperacaoResumo>(`/api/${props.categoria}?${query.toString()}`);
    if (consulta !== consultaAtual) return;
    itens.value = resultado.itens;
  } catch (falha) {
    if (consulta !== consultaAtual) return;
    erro.value = falha instanceof Error ? falha.message : "Não foi possível carregar os lançamentos.";
  } finally {
    if (consulta === consultaAtual) carregando.value = false;
  }
}

watch(
  () => [props.aberto, props.categoria, props.caixaId] as const,
  ([aberto]) => {
    if (aberto) void carregar();
  },
  { immediate: true }
);
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="680" persistent no-click-animation>
    <v-card class="caixa-lancamentos-dialog" :class="`caixa-lancamentos-dialog--${categoria}`">
      <v-card-title class="caixa-lancamentos-dialog__titulo d-flex align-center justify-space-between">
        Últimas {{ titulo.toLocaleLowerCase("pt-BR") }} deste caixa
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar últimos lançamentos" @click="dialogAberto = false" />
      </v-card-title>
      <v-card-text>
        <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-4" />
        <v-alert v-else-if="erro" type="error" density="compact">{{ erro }}</v-alert>
        <div v-else-if="!itens.length" class="text-body-2 text-medium-emphasis">Nenhum lançamento neste caixa.</div>
        <v-list v-else density="comfortable" lines="two" class="pa-0">
          <v-list-item v-for="item in itens" :key="item.id">
            <v-list-item-title>{{ item.descricao }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ dataItem(item) }}<span v-if="item.criadoPorNome"> · {{ item.criadoPorNome }}</span>
              <span v-if="item.status"> · {{ item.status }}</span>
            </v-list-item-subtitle>
            <template #append
              ><strong>{{ dinheiro(Number(item.valorOriginal)) }}</strong></template
            >
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions class="px-6 pb-5"
        ><v-spacer /><v-btn class="caixa-lancamentos-dialog__acao" variant="text" @click="dialogAberto = false"
          >Fechar</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>

<style scoped>
.caixa-lancamentos-dialog {
  border-top: 4px solid var(--categoria-cor);
}
.caixa-lancamentos-dialog__titulo,
.caixa-lancamentos-dialog__acao {
  color: var(--categoria-cor);
}
.caixa-lancamentos-dialog--despesas {
  --categoria-cor: var(--cat-despesas-faixa);
}
.caixa-lancamentos-dialog--mercadorias {
  --categoria-cor: var(--cat-mercadorias-faixa);
}
.caixa-lancamentos-dialog--retiradas {
  --categoria-cor: var(--cat-retiradas-faixa);
}
</style>
