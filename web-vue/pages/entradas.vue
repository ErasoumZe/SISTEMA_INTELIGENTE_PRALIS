<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import OperacoesPage from "~/components/financeiro/OperacoesPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="entradas" tipo-pagina="operacoes" v-slot="ctx">
    <OperacoesPage
      :resumo="ctx.resumo"
      :tela-atual="ctx.telaAtual"
      :tela-ativa="ctx.telaAtiva"
      :empresa-ativa="ctx.empresaAtiva"
      :operacoes-paginadas="ctx.operacoesPaginadas"
      :total-operacoes="ctx.totalOperacoes"
      :total-liquido-operacoes="ctx.totalLiquidoOperacoes"
      :dia-entradas="ctx.diaEntradas"
      :pode-consultar-outros-dias-entradas="ctx.podeConsultarOutrosDiasEntradas"
      :pagina="ctx.paginaOperacoes"
      :total-paginas="ctx.totalPaginasOperacoes"
      :descricao="ctx.descricao"
      :pode-editar-entrada="ctx.podeEditarEntrada"
      :formas-pagamento="ctx.opcoesEmpresa.formasPagamento"
      :venda-detalhe="ctx.vendaDetalhe"
      :modal-venda-detalhe-aberto="ctx.modalVendaDetalheAberto"
      :venda-detalhe-carregando="ctx.vendaDetalheCarregando"
      @editar="ctx.abrirOperacao"
      @detalhes="ctx.abrirDetalheVenda"
      @update:venda-detalhe-aberto="ctx.fecharDetalheVenda"
      @update:pagina="ctx.atualizarPaginaOperacoes"
      @update:dia="ctx.atualizarDiaEntradas"
    />
  </AppWorkspace>
</template>
