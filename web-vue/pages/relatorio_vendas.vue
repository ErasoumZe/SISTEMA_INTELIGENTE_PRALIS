<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioVendasPage from "~/components/relatorios/RelatorioVendasPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_vendas" tipo-pagina="relatorio_vendas" v-slot="ctx">
    <RelatorioVendasPage
      :empresa-id="ctx.empresaId"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :clientes="ctx.opcoesEmpresa.clientes"
      :colaboradores="ctx.opcoesEmpresa.colaboradores"
      :formas-pagamento="ctx.opcoesEmpresa.formasPagamento"
    />
  </AppWorkspace>
</template>
