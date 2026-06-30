<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import OperacoesPage from "~/components/financeiro/OperacoesPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="despesas" tipo-pagina="operacoes" v-slot="ctx">
    <OperacoesPage
      :resumo="ctx.resumo"
      :tela-atual="ctx.telaAtual"
      :tela-ativa="ctx.telaAtiva"
      :empresa-ativa="ctx.empresaAtiva"
      :operacoes-paginadas="ctx.operacoesPaginadas"
      :total-operacoes="ctx.totalOperacoes"
      :pagina="ctx.paginaOperacoes"
      :total-paginas="ctx.totalPaginasOperacoes"
      :descricao="ctx.descricao"
      @editar="ctx.abrirOperacao"
      @update:pagina="ctx.atualizarPaginaOperacoes"
    />
  </AppWorkspace>
</template>
