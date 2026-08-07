<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import TesourariaCockpit from "~/components/financeiro/TesourariaCockpit.vue";
import SolicitacoesCofrePainel from "~/components/financeiro/SolicitacoesCofrePainel.vue";
</script>

<template>
  <AppWorkspace tela-inicial="transferencias" tipo-pagina="operacoes" v-slot="ctx">
    <!-- D4: painel da retaguarda para PROGRAMAR entrega ao cofre. Fica acima do cockpit porque e
         uma ordem que ainda nao virou movimento — o cockpit lista o que ja e dinheiro andando.
         Nao usa o modal generico de transferencia: retorno/sangria tem caminho unico. -->
    <SolicitacoesCofrePainel
      v-if="ctx.podeProgramarEntregaCofre"
      :caixas-abertos="ctx.caixasAbertos"
      :solicitacoes="ctx.solicitacoesCofreRetaguarda"
      :caixa-selecionado-id="ctx.caixaSolicitacaoId"
      :salvando="ctx.caixaSalvando"
      :pode-programar="ctx.podeProgramarEntregaCofre"
      @selecionar-caixa="ctx.selecionarCaixaSolicitacao"
      @programar="ctx.programarSolicitacaoCofre"
      @cancelar="ctx.cancelarSolicitacaoCofre"
    />

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
