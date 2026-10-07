<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioFechamentoTesourariaPage from "~/components/financeiro/RelatorioFechamentoTesourariaPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_fechamento" tipo-pagina="relatorio_fechamento" v-slot="ctx">
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? 'Relatório de fechamento'" />
  <RelatorioFechamentoTesourariaPage
      :empresa-id="ctx.empresaId"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :turnos="ctx.opcoesEmpresa.turnos"
  />
  </AppWorkspace>
</template>
