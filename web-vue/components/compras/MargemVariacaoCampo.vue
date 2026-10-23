<script setup lang="ts">
import { MARGENS_VARIACAO, type MargemVariacao } from "@padaria/shared";

// Doc 57 §6.3: quanto a quantidade entregue pode variar do pedido, para menos e para mais. O fornecedor
// ajusta a quantidade real dentro dessa faixa quando separa o pedido.
const margem = defineModel<MargemVariacao>({ required: true });
</script>

<template>
  <div class="d-grid ga-1" data-campo="margem-variacao">
    <span class="text-body-2">Variação aceita na quantidade</span>
    <div class="d-flex flex-wrap ga-2" role="radiogroup" aria-label="Variação aceita na quantidade">
      <v-chip
        v-for="opcao in MARGENS_VARIACAO"
        :key="opcao"
        size="small"
        role="radio"
        :aria-checked="margem === opcao"
        :color="margem === opcao ? 'primary' : undefined"
        :variant="margem === opcao ? 'flat' : 'outlined'"
        @click="margem = opcao"
        >{{ opcao }}%</v-chip
      >
    </div>
    <span class="text-caption text-medium-emphasis"
      >Ex.: pedido de 10 kg com {{ margem }}% aceita de {{ (10 * (1 - margem / 100)).toLocaleString("pt-BR") }} a
      {{ (10 * (1 + margem / 100)).toLocaleString("pt-BR") }} kg.</span
    >
  </div>
</template>
