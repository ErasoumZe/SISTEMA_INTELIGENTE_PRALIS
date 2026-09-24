<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import FuncoesOperacionaisPage from "~/components/funcoes/FuncoesOperacionaisPage.vue";
</script>

<template>
  <!-- Catalogo de CADASTRO: a empresa vem do seletor do workspace, como em Turnos. Diferente das
       telas de Admissao, onde ela e derivada do perfil e nao ha seletor. -->
  <AppWorkspace tela-inicial="funcoes_operacionais" tipo-pagina="funcoes_operacionais" v-slot="ctx">
    <FuncoesOperacionaisPage :empresa-id="ctx.empresaAtiva?.id ?? ''" />
  </AppWorkspace>
</template>
