<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import TesourariaCockpit from "~/components/financeiro/TesourariaCockpit.vue";
</script>

<template>
  <AppWorkspace tela-inicial="transferencias" tipo-pagina="operacoes" v-slot="ctx">
    <!-- R-179/Fatia 3: o painel "Programar entrega ao cofre" nao existe mais. Sangria e retorno
         tem UM caminho, e ele e o do proprio Caixa — quem faz a entrega e o operador, de dentro do
         turno dele, nao a Tesouraria daqui. Recriar o painel recriaria o segundo caminho. -->
    <!-- Cockpit de tesouraria: nova/editar REUSAM o modal de transferencia do workspace
         (abrirOperacao('transferencia') nao depende de caixa aberto). -->
    <TesourariaCockpit
      :resumo="ctx.resumo"
      :tela-atual="ctx.telaAtual"
      :empresa-ativa="ctx.empresaAtiva"
      :operacoes-paginadas="ctx.operacoesPaginadas"
      :operacoes-tela="ctx.operacoesTela"
      :total-operacoes="ctx.totalOperacoes"
      :pagina="ctx.paginaOperacoes"
      :total-paginas="ctx.totalPaginasOperacoes"
      :pode-criar="ctx.podeCriarTransferencia"
      :pode-editar="ctx.podeEditarTransferencia"
      :pode-conferir="ctx.podeConferirTransferencia"
      @nova="ctx.abrirOperacao('transferencia')"
      @editar="(op) => ctx.abrirOperacao('transferencia', op)"
      @update:pagina="ctx.atualizarPaginaOperacoes"
      @recarregar="ctx.recarregarOperacoes"
    />
  </AppWorkspace>
</template>
