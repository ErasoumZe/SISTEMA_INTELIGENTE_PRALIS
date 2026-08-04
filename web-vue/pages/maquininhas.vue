<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="maquininhas" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="maquininhas"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :pode-excluir="false"
      @acionar="ctx.abrirCadastroNovo"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
    />
  </AppWorkspace>
</template>
