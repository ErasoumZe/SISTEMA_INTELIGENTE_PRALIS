<script setup lang="ts">
// Estado vazio de Compras: diz o que falta e, quando houver, o próximo passo (slot).
defineProps<{ icone?: string; titulo: string; texto?: string }>();
</script>

<template>
  <div class="vazio">
    <v-icon :icon="icone ?? 'mdi-inbox-outline'" size="28" class="vazio__icone" />
    <p class="vazio__titulo">{{ titulo }}</p>
    <p v-if="texto" class="vazio__texto">{{ texto }}</p>
    <slot />
  </div>
</template>

<style scoped>
.vazio {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-7) var(--cx-sp-5);
  text-align: center;
}

.vazio__icone {
  color: var(--cx-ink-soft);
  margin-bottom: var(--cx-sp-1);
}

.vazio__titulo {
  margin: 0;
  color: var(--cx-ink);
  font-weight: 600;
}

.vazio__texto {
  max-width: 46ch;
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
</style>
