<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import ContasPage from "~/components/contas/ContasPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="contas" tipo-pagina="cadastro" v-slot="ctx">
    <ContasPage
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :empresa-id="ctx.empresaId"
      :abrir-novo="ctx.abrirCadastroNovo"
      :abrir-importacao="ctx.abrirImportacao"
      :abrir-exportacao="ctx.abrirExportacao"
      :abrir-edicao="ctx.abrirCadastroEditar"
      :recarregar="ctx.recarregarDadosCadastro"
      :notificar="ctx.notificar"
    />
  </AppWorkspace>
</template>
