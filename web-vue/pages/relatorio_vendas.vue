<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import RelatorioVendasPage from "~/components/relatorios/RelatorioVendasPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="relatorio_vendas" tipo-pagina="relatorio_vendas" v-slot="ctx">
    <!-- VIS-10: esta tela nunca teve cabecalho proprio — vivia do titulo da topbar, que saiu.
         O nome vem do menu (`telaAtual`), sem texto novo. -->
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <RelatorioVendasPage
      :empresa-id="ctx.empresaId"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :clientes="ctx.opcoesEmpresa.clientes"
      :colaboradores="ctx.opcoesEmpresa.colaboradores"
      :formas-pagamento="ctx.opcoesEmpresa.formasPagamento"
      :turnos="ctx.opcoesEmpresa.turnos"
    />
  </AppWorkspace>
</template>
