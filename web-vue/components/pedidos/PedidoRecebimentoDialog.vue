<script setup lang="ts">
import type { PedidoDto } from "@padaria/shared";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{ pedido: PedidoDto | null; salvando: boolean }>();
const emit = defineEmits<{ confirmar: [itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>, observacao: string] }>();
const observacao = ref("");
const quantidades = reactive<Record<string, string>>({});

watch(
  () => [aberto.value, props.pedido?.id],
  () => {
    observacao.value = "";
    for (const chave of Object.keys(quantidades)) delete quantidades[chave];
    for (const item of props.pedido?.itens ?? []) quantidades[item.id] = item.quantidadePendente;
  },
  { immediate: true }
);
function confirmar() {
  const itens = (props.pedido?.itens ?? [])
    .map((item) => ({ pedidoItemId: item.id, quantidadeConferida: Number(quantidades[item.id]) }))
    .filter((item) => Number.isFinite(item.quantidadeConferida) && item.quantidadeConferida > 0);
  emit("confirmar", itens, observacao.value);
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="760" persistent>
    <v-card v-if="pedido">
      <v-card-title>Conferir recebimento</v-card-title>
      <v-card-text class="d-grid ga-2">
        <v-alert type="info" density="compact" variant="tonal">Somente estas quantidades conferidas entrarão no estoque.</v-alert>
        <v-row v-for="item in pedido.itens ?? []" :key="item.id" dense align="center"><v-col cols="12" sm="6">{{ item.descricaoProduto }}<div class="text-caption">Pendente: {{ item.quantidadePendente }}</div></v-col><v-col cols="12" sm="6"><v-text-field v-model="quantidades[item.id]" type="number" min="0" :max="item.quantidadePendente" step="0.001" label="Quantidade conferida" /></v-col></v-row>
        <v-textarea v-model="observacao" rows="2" label="Observação da conferência" auto-grow />
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn variant="text" @click="aberto = false">Cancelar</v-btn><v-btn color="success" :loading="salvando" @click="confirmar">Confirmar recebimento</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>
