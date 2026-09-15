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
      :mostrar-filtros-saidas="ctx.mostrarFiltrosSaidas"
      :filtros-saidas="ctx.filtrosSaidas"
      :pdvs="ctx.pdvs"
      :mostrar-filtro-discriminacao="ctx.mostrarFiltroDiscriminacao"
      :pendentes-discriminacao-ativo="ctx.pendentesDiscriminacaoAtivo"
      :pode-discriminar="ctx.podeDiscriminar"
      @editar="ctx.abrirOperacao"
      @discriminar="ctx.abrirDiscriminacao"
      @update:pendentes="ctx.alternarFiltroPendentes"
      @update:filtros-saidas="ctx.atualizarFiltrosSaidas"
      @update:pagina="ctx.atualizarPaginaOperacoes"
    />
  </AppWorkspace>
</template>
