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
  position: relative;
  display: grid;
  flex: 0 0 auto;
  isolation: isolate;
  overflow: hidden;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(
    142deg,
    color-mix(in srgb, var(--icone-destaque-cor) 82%, white) 0%,
    var(--icone-destaque-cor) 48%,
    color-mix(in srgb, var(--icone-destaque-cor) 78%, black) 100%
  );
  box-shadow:
    0 12px 26px -11px color-mix(in srgb, var(--icone-destaque-cor) 95%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.28);
  transition:
    transform 160ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 160ms ease;
}
.icone-destaque::before {
  position: absolute;
  z-index: -1;
  top: -58%;
  left: -40%;
  width: 120%;
  height: 120%;
  border-radius: inherit;
  background: radial-gradient(circle, rgb(255 255 255 / 0.52), transparent 62%);
  content: "";
  pointer-events: none;
}
.icone-destaque::after {
  position: absolute;
  z-index: -1;
  inset: 1px;
  border-radius: inherit;
  background: linear-gradient(125deg, rgb(255 255 255 / 0.14), transparent 36%);
  content: "";
  pointer-events: none;
}
.icone-destaque :deep(.v-icon) {
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.18));
}
.icone-destaque:hover {
  transform: translateY(-1px) scale(1.025);
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
@media (prefers-reduced-motion: reduce) {
  .icone-destaque {
    transition: none;
  }
  .icone-destaque:hover {
    transform: none;
  }
}
</style>
