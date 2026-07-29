<script setup lang="ts">
// Cadastro de patrimonio (PROJECT_BRAIN/17, D2): grupos com sigla + itens. Uma tabela so, com a
// coluna Tipo separando os dois — o grupo e quem classifica maquinario/manutencao na discriminacao.
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="patrimonio" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="patrimonio"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :editar-carregando-id="ctx.maloteEditandoCarregandoId"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="false"
      @acionar="ctx.abrirCadastroNovo"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
    />
  </AppWorkspace>
</template>
