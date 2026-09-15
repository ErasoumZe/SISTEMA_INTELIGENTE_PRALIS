<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import OperacoesPage from "~/components/financeiro/OperacoesPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="mercadorias" tipo-pagina="operacoes" v-slot="ctx">
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
      :mostrar-aprovacao-mercadorias="ctx.mostrarAprovacaoMercadorias"
      :aprovacao-mercadorias-ativa="ctx.aprovacaoMercadoriasAtiva"
      :mercadorias-aguardando="ctx.mercadoriasAguardando"
      :aprovacao-mercadorias-carregando="ctx.aprovacaoMercadoriasCarregando"
      :aprovacao-mercadoria-salvando-id="ctx.aprovacaoMercadoriaSalvandoId"
      @editar="ctx.abrirOperacao"
      @discriminar="ctx.abrirDiscriminacao"
      @update:pendentes="ctx.alternarFiltroPendentes"
      @update:filtros-saidas="ctx.atualizarFiltrosSaidas"
      @update:aprovacao="ctx.alternarAprovacaoMercadorias"
      @aprovar="ctx.aprovarMercadoriaAguardando"
      @recusar="ctx.recusarMercadoriaAguardando"
      @update:pagina="ctx.atualizarPaginaOperacoes"
    />
  </AppWorkspace>
</template>
