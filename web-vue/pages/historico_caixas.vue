<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import HistoricoCaixasPage from "~/components/caixa/HistoricoCaixasPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="historico_caixas" tipo-pagina="historico_caixas" v-slot="ctx">
    <!-- VIS-10: esta tela nunca teve cabecalho proprio — vivia do titulo da topbar, que saiu.
         O nome vem do menu (`telaAtual`), sem texto novo. -->
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <HistoricoCaixasPage
      :empresa-id="ctx.empresaId"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :turnos="ctx.opcoesEmpresa.turnos"
      :colaboradores="ctx.opcoesEmpresa.colaboradores"
    />
  </AppWorkspace>
</template>
