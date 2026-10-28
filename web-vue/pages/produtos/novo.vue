<script setup lang="ts">
import ProdutoFormulario from "~/components/produtos/ProdutoFormulario.vue";
</script>

<template>
  <!-- Produto novo so nasce na BASE (oficial): a loja recebe por importacao. -->
  <ProdutoFormulario :produto-id="null" modo="base" />
</template>
