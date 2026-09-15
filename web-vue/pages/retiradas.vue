<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import OperacoesPage from "~/components/financeiro/OperacoesPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="retiradas" tipo-pagina="operacoes" v-slot="ctx">
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
      :mostrar-filtros-saidas="ctx.mostrarFiltrosSaidas"
      :filtros-saidas="ctx.filtrosSaidas"
      :pdvs="ctx.pdvs"
      @editar="ctx.abrirOperacao"
      @update:filtros-saidas="ctx.atualizarFiltrosSaidas"
      @update:pagina="ctx.atualizarPaginaOperacoes"
    />
  </AppWorkspace>
</template>
