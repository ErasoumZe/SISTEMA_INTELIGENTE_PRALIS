<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import HistoricoCaixasPage from "~/components/caixa/HistoricoCaixasPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="historico_caixas" tipo-pagina="historico_caixas" v-slot="ctx">
    <HistoricoCaixasPage
      :empresa-id="ctx.empresaId"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :turnos="ctx.opcoesEmpresa.turnos"
      :colaboradores="ctx.opcoesEmpresa.colaboradores"
    />
  </AppWorkspace>
</template>
