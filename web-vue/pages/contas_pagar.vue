<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import ContasPagarPage from "~/components/financeiro/ContasPagarPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="contas_pagar" tipo-pagina="contas_pagar" v-slot="ctx">
    <!-- VIS-10: esta tela nunca teve cabecalho proprio — vivia do titulo da topbar, que saiu.
         O nome vem do menu (`telaAtual`), sem texto novo. -->
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <ContasPagarPage :empresa-id="ctx.empresaId" :pdvs="ctx.opcoesEmpresa.pdvs" />
  </AppWorkspace>
</template>
