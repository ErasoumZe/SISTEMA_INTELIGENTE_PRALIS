<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import TesourariaCockpit from "~/components/financeiro/TesourariaCockpit.vue";
</script>

<template>
  <AppWorkspace tela-inicial="transferencias" tipo-pagina="operacoes" v-slot="ctx">
    <!-- R-185/R-187: o painel paralelo "Programar entrega ao cofre" continua removido. O modal
         generico apenas prepara Transferencias de retorno; a execucao financeira acontece no Caixa. -->
    <!-- Cockpit de tesouraria: nova/editar REUSAM o modal de transferencia do workspace
         (abrirOperacao('transferencia') nao depende de caixa aberto). -->
    <TesourariaCockpit
      :resumo="ctx.resumo"
      :tela-atual="ctx.telaAtual"
      :empresa-ativa="ctx.empresaAtiva"
      :operacoes-paginadas="ctx.operacoesPaginadas"
      :operacoes-tela="ctx.operacoesTela"
      :total-operacoes="ctx.totalOperacoes"
      :status-filtro="ctx.filtroStatusTransferencia"
      :filtros-transferencias="ctx.filtrosTransferencias"
      :pdvs="ctx.pdvs"
      :contas="ctx.contas"
      :pagina="ctx.paginaOperacoes"
      :total-paginas="ctx.totalPaginasOperacoes"
      :pode-criar="ctx.podeCriarTransferencia"
      :pode-transferir-sem-lacre="ctx.podeTransferirSemLacre"
      :empresa-id="ctx.empresaIdAtual"
      :pode-editar="ctx.podeEditarTransferencia"
      :pode-cancelar-planejamento="ctx.podeCancelarPlanejamentoRetorno"
      :salvando="ctx.caixaSalvando"
      @nova="ctx.abrirOperacao('transferencia')"
      @sem-lacre-criada="ctx.recarregarOperacoes"
      @editar="(op) => ctx.abrirOperacao('transferencia', op)"
      @update:pagina="ctx.atualizarPaginaOperacoes"
      @update:status-filtro="ctx.atualizarFiltroStatusTransferencia"
      @update:filtros-transferencias="ctx.atualizarFiltrosTransferencias"
      @cancelar-planejamento="ctx.cancelarPlanejamentoRetorno"
    />
  </AppWorkspace>
</template>
