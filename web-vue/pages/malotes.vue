<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import MalotesList from "~/components/malotes/MalotesList.vue";
</script>

<template>
  <AppWorkspace tela-inicial="malotes" tipo-pagina="cadastro" v-slot="ctx">
    <MalotesList
      :linhas="ctx.linhasCadastro"
      :editar-carregando-id="ctx.maloteEditandoCarregandoId"
      @acionar="ctx.abrirCadastroNovo"
      @editar="ctx.abrirCadastroEditar"
    />
  </AppWorkspace>
</template>
