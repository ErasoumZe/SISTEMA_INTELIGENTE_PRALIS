<script setup lang="ts">
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

type TransferenciaCaixa = {
  id: string;
  tipo: "abertura" | "suprimento" | "retorno";
  valor: number;
  valorEspecie: number | null;
  valorMoedas: number | null;
  sentido: "saida" | "entrada";
  lacre: string | null;
  dataTransferencia: string | null;
};
const props = defineProps<{ aberto: boolean; caixaId: string }>();
const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();
const { apiGet } = useApi();
const carregando = ref(false);
const erro = ref("");
const itens = ref<TransferenciaCaixa[]>([]);

const dialogAberto = computed({
  get: () => props.aberto,
  set: (valor: boolean) => emit("update:aberto", valor)
});
const sangrias = computed(() => itens.value.filter((item) => item.sentido === "entrada"));
const total = computed(() => sangrias.value.reduce((soma, item) => soma + item.valor, 0));

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const resposta = await apiGet<{ itens: TransferenciaCaixa[] }>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/transferencias`
    );
    itens.value = resposta.itens;
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel carregar as sangrias.";
  } finally {
    carregando.value = false;
  }
}

watch(
  () => [props.aberto, props.caixaId] as const,
  ([aberto]) => {
    if (aberto) void carregar();
  },
  { immediate: true }
);
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="680" persistent no-click-animation>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        Sangrias deste caixa
        <v-btn
          icon="mdi-close"
          variant="text"
          aria-label="Fechar histórico de sangrias"
          @click="dialogAberto = false"
        />
      </v-card-title>
      <v-card-text>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
          {{ sangrias.length }} sangria(s) · Total {{ dinheiro(total) }}
        </v-alert>
        <v-progress-linear v-if="carregando" indeterminate color="warning" />
        <v-alert v-else-if="erro" type="error" density="compact">{{ erro }}</v-alert>
        <div v-else-if="!sangrias.length" class="text-body-2 text-medium-emphasis">
          Nenhuma sangria realizada neste caixa.
        </div>
        <v-list v-else lines="two" density="comfortable" class="pa-0">
          <v-list-item v-for="item in sangrias" :key="item.id">
            <v-list-item-title> {{ dinheiro(item.valor) }} · lacre {{ item.lacre ?? "sem lacre" }} </v-list-item-title>
            <v-list-item-subtitle>
              Dinheiro {{ dinheiro(item.valorEspecie ?? 0) }} · moedas {{ dinheiro(item.valorMoedas ?? 0) }}
              <span v-if="item.dataTransferencia"> · {{ formatarDataHora(item.dataTransferencia) }}</span>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions class="px-6 pb-5"
        ><v-spacer /><v-btn color="warning" @click="dialogAberto = false">Fechar</v-btn></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>
