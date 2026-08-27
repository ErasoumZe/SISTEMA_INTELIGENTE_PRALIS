<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import NotasFiscaisPage from "~/components/notas-fiscais/NotasFiscaisPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="notas_fiscais" tipo-pagina="notas_fiscais" v-slot="ctx">
    <!-- VIS-10: esta tela nunca teve cabecalho proprio — vivia do titulo da topbar, que saiu.
         O nome vem do menu (`telaAtual`), sem texto novo. -->
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <NotasFiscaisPage :empresa-id="ctx.empresaId" />
  </AppWorkspace>
</template>
