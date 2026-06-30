<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioProdutos from "~/components/relatorios/RelatorioProdutos.vue";
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_produtos" tipo-pagina="relatorio_produtos" v-slot="ctx">
    <RelatorioProdutos :empresa-id="ctx.empresaId" :caixa-id-filtro="ctx.caixaIdFiltro" />
  </AppWorkspace>
</template>
