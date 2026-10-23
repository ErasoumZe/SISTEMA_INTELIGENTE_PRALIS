<script setup lang="ts">
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";

// A legenda das bolinhas (doc 56 §2.1), igual em todas as listas de produto de Compras.
</script>

<template>
  <span class="legendas">
    <span class="legenda"><ProdutoBolinhas mais-vende :mais-compra="false" :mais-lucro="false" />Mais vende</span>
    <span class="legenda"><ProdutoBolinhas :mais-vende="false" mais-compra :mais-lucro="false" />Mais compramos</span>
    <span class="legenda"><ProdutoBolinhas :mais-vende="false" :mais-compra="false" mais-lucro />Mais lucro</span>
    <span class="text-caption text-medium-emphasis">Top 20% dos últimos 3 meses</span>
  </span>
</template>

<style scoped>
.legendas {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  font-size: var(--cx-fs-caption);
}

.legenda {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
