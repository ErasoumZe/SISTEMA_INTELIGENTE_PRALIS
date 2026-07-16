<script setup lang="ts">
import type { Opcao } from "~/types/padaria";
import type { OperacaoDetalhe } from "~/utils/operacoes";
import VendaDetalheConteudo from "~/components/financeiro/VendaDetalheConteudo.vue";

defineProps<{
  aberto: boolean;
  detalhe: OperacaoDetalhe | null;
  carregando?: boolean;
  formasPagamento?: Opcao[];
}>();

const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();
</script>

<template>
  <v-dialog :model-value="aberto" max-width="720" scrollable @update:model-value="emit('update:aberto', $event)">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-receipt-text-outline" />
        Detalhe da venda
        <span v-if="detalhe" class="text-body-2 text-medium-emphasis">{{ detalhe.descricao }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <VendaDetalheConteudo :detalhe="detalhe" :carregando="carregando" :formas-pagamento="formasPagamento" />
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:aberto', false)">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
