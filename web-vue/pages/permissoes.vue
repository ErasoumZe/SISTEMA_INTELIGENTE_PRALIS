<script setup lang="ts">
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="permissoes" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="permissoes"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :editar-carregando-id="ctx.maloteEditandoCarregandoId"
      modo-servidor
      :busca="ctx.permissoesFiltros.q"
      :tipo-permissao-filtro="ctx.permissoesFiltros.tipoPermissao"
      :alvo-filtro="ctx.permissoesFiltros.alvoId"
      :permissao-filtro="ctx.permissoesFiltros.permissao"
      :alvos-filtro="ctx.alvosFiltroPermissoes"
      :permissoes-filtro="[...permissoes]"
      :carregando-busca="ctx.permissoesCarregandoBusca"
      :buscou="ctx.permissoesBuscou"
      :total-servidor="ctx.permissoesPagina.total"
      :pagina-servidor="ctx.permissoesPagina.page"
      :itens-por-pagina-servidor="ctx.permissoesPagina.pageSize"
      :pode-excluir="false"
      :excluindo-id="ctx.permissaoExcluindoId"
      @acionar="ctx.abrirCadastroNovo"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
      @update:busca="ctx.atualizarBuscaPermissoes"
      @update:tipo-permissao-filtro="ctx.atualizarTipoPermissaoFiltro"
      @update:alvo-filtro="ctx.atualizarAlvoFiltro"
      @update:permissao-filtro="ctx.atualizarPermissaoFiltro"
      @buscar="ctx.buscarPermissoes"
      @limpar="ctx.limparFiltrosPermissoes"
      @excluir="ctx.excluirPermissao"
      @update:pagina-servidor="ctx.atualizarPaginaPermissoes"
    />
  </AppWorkspace>
</template>
