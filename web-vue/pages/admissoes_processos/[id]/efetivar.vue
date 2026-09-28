<script setup lang="ts">
import EfetivacaoProcessoPage from "~/components/admissoes/EfetivacaoProcessoPage.vue";

const rota = useRoute();
const processoId = computed(() => String(rota.params["id"] ?? ""));
</script>

<template>
  <EfetivacaoProcessoPage :key="processoId" :processo-id="processoId" />
</template>
