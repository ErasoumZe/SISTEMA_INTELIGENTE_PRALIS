<script setup lang="ts">
import PerfilColaboradorPage from "~/components/colaboradores/PerfilColaboradorPage.vue";

const rota = useRoute();
const colaboradorId = computed(() => String(rota.params["id"] ?? ""));
</script>

<template><PerfilColaboradorPage :key="colaboradorId" :colaborador-id="colaboradorId" /></template>
