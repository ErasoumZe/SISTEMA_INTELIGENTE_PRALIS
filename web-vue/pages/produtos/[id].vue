<script setup lang="ts">
import ProdutoFormulario from "~/components/produtos/ProdutoFormulario.vue";

const rota = useRoute();
const produtoId = computed(() => String(rota.params["id"] ?? ""));
</script>

<template>
  <ProdutoFormulario :key="produtoId" :produto-id="produtoId" modo="loja" />
</template>
