<script setup lang="ts">
import PerfilColaboradorPage from "~/components/colaboradores/PerfilColaboradorPage.vue";
const route = useRoute();
const colaboradorId = computed(() => String(route.params["id"] ?? ""));
</script>
<template><PerfilColaboradorPage :key="colaboradorId" :colaborador-id="colaboradorId" /></template>
