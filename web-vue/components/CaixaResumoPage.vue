<script setup lang="ts">
import type { ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";

defineProps<{ resumo: ResumoCaixa | null }>();

const emit = defineEmits<{
  (event: "acertarSaldo"): void;
}>();
</script>

<template>
  <v-card>
    <v-card-title>Caixa</v-card-title>
    <v-card-text>
      <v-row v-if="resumo" dense>
        <v-col cols="12" md="3"
          ><v-sheet class="pa-4 rounded-lg soft-bg"
            ><div class="text-caption">Entradas</div>
            <div class="text-h6">{{ dinheiro(resumo.totalEntradas) }}</div></v-sheet
          ></v-col
        >
        <v-col cols="12" md="3"
          ><v-sheet class="pa-4 rounded-lg soft-bg"
            ><div class="text-caption">Despesas</div>
            <div class="text-h6">{{ dinheiro(resumo.totalDespesas) }}</div></v-sheet
          ></v-col
        >
        <v-col cols="12" md="3"
          ><v-sheet class="pa-4 rounded-lg soft-bg"
            ><div class="text-caption">Retiradas</div>
            <div class="text-h6">{{ dinheiro(resumo.totalRetiradas) }}</div></v-sheet
          ></v-col
        >
        <v-col cols="12" md="3"
          ><v-sheet class="pa-4 rounded-lg soft-bg"
            ><div class="text-caption">Saldo</div>
            <div class="text-h6">{{ dinheiro(resumo.saldo) }}</div></v-sheet
          ></v-col
        >
      </v-row>
      <v-btn class="mt-4" color="primary" prepend-icon="mdi-cash-sync" @click="emit('acertarSaldo')"
        >Acertar saldo</v-btn
      >
    </v-card-text>
  </v-card>
</template>
