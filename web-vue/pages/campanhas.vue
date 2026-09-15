<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CampanhasPage from "~/components/campanhas/CampanhasPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="campanhas" tipo-pagina="campanhas" v-slot="ctx">
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <CampanhasPage
      :empresa-id="ctx.empresaId"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :pode-gerenciar="ctx.podeGerenciarCampanhas"
    />
  </AppWorkspace>
</template>
