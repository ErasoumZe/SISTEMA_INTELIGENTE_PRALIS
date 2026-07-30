<script setup lang="ts">
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="usuarios" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="usuarios"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :editar-carregando-id="ctx.maloteEditandoCarregandoId"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="false"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
    />
  </AppWorkspace>
</template>
