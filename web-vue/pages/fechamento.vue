<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import FechamentoCaixaPage from "~/components/caixa/FechamentoCaixaPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="fechamento" tipo-pagina="fechamento" v-slot="ctx">
    <FechamentoCaixaPage
      :resumo="ctx.resumo"
      :status="ctx.caixaStatus"
      :salvando="ctx.caixaSalvando"
      @acertar-saldo="ctx.acertarSaldoOperacional"
      @fechar-caixa="ctx.fecharCaixaOperacional"
    />
  </AppWorkspace>
</template>
