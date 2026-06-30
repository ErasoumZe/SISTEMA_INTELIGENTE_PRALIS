<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import PlaceholderPage from "~/components/comum/PlaceholderPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="ficha_tecnica" tipo-pagina="placeholder" v-slot="ctx">
    <PlaceholderPage :tela-atual="ctx.telaAtual" />
  </AppWorkspace>
</template>
