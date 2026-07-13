<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import NotasFiscaisPage from "~/components/notas-fiscais/NotasFiscaisPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="notas_fiscais" tipo-pagina="notas_fiscais" v-slot="ctx">
    <NotasFiscaisPage :empresa-id="ctx.empresaId" />
  </AppWorkspace>
</template>
