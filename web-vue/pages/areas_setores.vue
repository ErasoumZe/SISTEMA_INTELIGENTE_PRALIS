<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import TreeCadastroPage from "~/components/cadastros/TreeCadastroPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="areas_setores" tipo-pagina="tree" v-slot="ctx">
    <TreeCadastroPage
      tela="areas_setores"
      :descricao="ctx.descricao"
      :itens="ctx.treeItens"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @criar-filho="ctx.abrirCadastroFilho"
    />
  </AppWorkspace>
</template>
