<script setup lang="ts">
import FichaDpPage from "~/components/admissoes/FichaDpPage.vue";

const rota = useRoute();
const processoId = computed(() => String(rota.params["id"] ?? ""));
</script>

<template>
  <!-- A ficha pertence ao processo e e preenchida pelo DP; nao e uma tela do candidato. -->
  <FichaDpPage :key="processoId" :processo-id="processoId" />
</template>
