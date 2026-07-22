<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioDre from "~/components/relatorios/RelatorioDre.vue";
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_dre" tipo-pagina="relatorio_dre" v-slot="ctx">
    <RelatorioDre :empresa-id="ctx.empresaId" :pdvs="ctx.opcoesEmpresa.pdvs" :turnos="ctx.opcoesEmpresa.turnos" />
  </AppWorkspace>
</template>
