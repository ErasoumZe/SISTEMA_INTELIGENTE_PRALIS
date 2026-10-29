<script setup lang="ts">
/** Snackbar unico do aviso que atravessa a navegacao (ver `useAvisoAoNavegar`). */
import { useAvisoAoNavegar } from "~/composables/useAvisoAoNavegar";

const { aviso, limpar } = useAvisoAoNavegar();

const aberto = computed({
  get: () => Boolean(aviso.value),
  set: (valor: boolean) => {
    if (!valor) limpar();
  }
});
</script>

<template>
  <v-snackbar v-model="aberto" :color="aviso?.tipo ?? 'success'" timeout="4000">{{ aviso?.texto }}</v-snackbar>
</template>
