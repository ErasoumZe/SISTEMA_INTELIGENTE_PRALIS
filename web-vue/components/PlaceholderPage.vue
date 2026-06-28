<script setup lang="ts">
import type { ItemMenu } from "~/types/padaria";

defineProps<{
  telaAtual: ItemMenu | null | undefined;
}>();
</script>

<template>
  <v-card>
    <v-card-title>{{ telaAtual?.titulo ?? "Tela" }}</v-card-title>
    <v-card-text class="text-muted">
      Esta tela usa os mesmos contratos de permissao e API do sistema atual. A migracao Vue preserva o acesso e deixa o
      espaco preparado para detalhamento operacional especifico.
    </v-card-text>
  </v-card>
</template>
