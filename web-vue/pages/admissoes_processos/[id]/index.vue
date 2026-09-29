<script setup lang="ts">
import ProcessoDetalhePage from "~/components/admissoes/ProcessoDetalhePage.vue";

const rota = useRoute();
const processoId = computed(() => String(rota.params["id"] ?? ""));
</script>

<template>
  <ProcessoDetalhePage :key="processoId" :processo-id="processoId" />
</template>
