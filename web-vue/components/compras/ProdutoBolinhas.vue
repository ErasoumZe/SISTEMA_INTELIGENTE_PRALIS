<script setup lang="ts">
// As bolinhas do produto (doc 56 §2.1): mais vende (verde), mais compramos (amarela), mais lucro (azul). Top 20% dos
// últimos 3 meses. O title/aria-label acompanha para não depender só da cor.
defineProps<{ maisVende: boolean; maisCompra: boolean; maisLucro: boolean }>();
</script>

<template>
  <span class="bolinhas">
    <span v-if="maisVende" class="bolinha bolinha--vende" title="Mais vende" aria-label="Mais vende" />
    <span v-if="maisCompra" class="bolinha bolinha--compra" title="Mais compramos" aria-label="Mais compramos" />
    <span v-if="maisLucro" class="bolinha bolinha--lucro" title="Mais lucro" aria-label="Mais lucro" />
  </span>
</template>

<style scoped>
.bolinhas {
  display: inline-flex;
  gap: 4px;
  vertical-align: middle;
}

.bolinha {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
}

.bolinha--vende {
  background: var(--cx-positive);
}

.bolinha--compra {
  background: var(--cx-attention);
}

.bolinha--lucro {
  background: rgb(var(--v-theme-info));
}
</style>
