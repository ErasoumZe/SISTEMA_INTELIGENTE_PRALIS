<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import ContasPagarPage from "~/components/financeiro/ContasPagarPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="contas_pagar" tipo-pagina="contas_pagar" v-slot="ctx">
    <ContasPagarPage :empresa-id="ctx.empresaId" :pdvs="ctx.opcoesEmpresa.pdvs" />
  </AppWorkspace>
</template>
