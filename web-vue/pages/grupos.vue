<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import TreeCadastroPage from "~/components/cadastros/TreeCadastroPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="grupos" tipo-pagina="tree" v-slot="ctx">
    <TreeCadastroPage
      tela="grupos"
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
