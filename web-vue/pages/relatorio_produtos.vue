<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioProdutos from "~/components/relatorios/RelatorioProdutos.vue";
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_produtos" tipo-pagina="relatorio_produtos" v-slot="ctx">
    <!-- VIS-10: esta tela nunca teve cabecalho proprio — vivia do titulo da topbar, que saiu.
         O nome vem do menu (`telaAtual`), sem texto novo. -->
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <RelatorioProdutos :empresa-id="ctx.empresaId" :caixa-id-filtro="ctx.caixaIdFiltro" />
  </AppWorkspace>
</template>
