<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import PlaceholderPage from "~/components/comum/PlaceholderPage.vue";

const route = useRoute();
const tela = computed(() => String(route.params.tela || ""));
</script>

<template>
  <AppWorkspace :tela-inicial="tela" tipo-pagina="placeholder" v-slot="ctx">
    <PlaceholderPage :tela-atual="ctx.telaAtual" />
  </AppWorkspace>
</template>
