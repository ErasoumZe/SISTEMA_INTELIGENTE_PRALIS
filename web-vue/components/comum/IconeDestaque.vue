<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    icone: string;
    cor?: string;
    tamanho?: "sm" | "md" | "lg";
  }>(),
  { cor: "var(--cx-brand)", tamanho: "md" }
);

const estilo = computed(() => ({ "--icone-destaque-cor": props.cor }));
</script>

<template>
  <span class="icone-destaque" :class="`icone-destaque--${tamanho}`" :style="estilo" aria-hidden="true">
    <v-icon :icon="icone" />
  </span>
</template>

<style scoped>
.icone-destaque {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--icone-destaque-cor) 72%, white),
    var(--icone-destaque-cor)
  );
  box-shadow: 0 10px 24px -10px color-mix(in srgb, var(--icone-destaque-cor) 84%, transparent);
}
.icone-destaque--sm {
  width: 34px;
  height: 34px;
  border-radius: 11px;
}
.icone-destaque--sm :deep(.v-icon) {
  font-size: 18px;
}
.icone-destaque--md {
  width: 40px;
  height: 40px;
}
.icone-destaque--md :deep(.v-icon) {
  font-size: 22px;
}
.icone-destaque--lg {
  width: 48px;
  height: 48px;
  border-radius: 15px;
}
.icone-destaque--lg :deep(.v-icon) {
  font-size: 24px;
}
</style>
