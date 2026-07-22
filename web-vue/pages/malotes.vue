<script setup lang="ts">
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="malotes" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="malotes"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :editar-carregando-id="ctx.maloteEditandoCarregandoId"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="ctx.podeExcluirMalote"
      :excluindo-id="ctx.maloteExcluindoId"
      @acionar="ctx.abrirCadastroNovo"
      @editar="ctx.abrirCadastroEditar"
      @excluir="ctx.excluirMalote"
      @extra="ctx.lidarExtraCadastro"
    />
  </AppWorkspace>
</template>
