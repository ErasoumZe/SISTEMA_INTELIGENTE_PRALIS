<script setup lang="ts">
/**
 * Etiqueta de situação de Compras: bolinha colorida + texto, em fundo neutro. A cor ajuda a bater o olho; o texto
 * é que informa (não depende só da cor). Os tons são os mesmos em todos os módulos.
 */
import type { TomSituacao } from "~/utils/compras-visual";

withDefaults(defineProps<{ rotulo: string; tom?: TomSituacao }>(), { tom: "neutro" });
</script>

<template>
  <span class="situacao" :class="`situacao--${tom}`"
    ><span class="situacao__ponto" aria-hidden="true" />{{ rotulo }}</span
  >
</template>

<style scoped>
.situacao {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 2px 8px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}

.situacao__ponto {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cx-ink-soft);
  flex: none;
}

.situacao--info .situacao__ponto {
  background: rgb(var(--v-theme-info));
}

.situacao--marca .situacao__ponto {
  background: var(--cx-brand);
}

.situacao--atencao {
  background: color-mix(in srgb, var(--cx-attention) 12%, var(--cx-surface));
  color: var(--cx-attention);
}

.situacao--atencao .situacao__ponto {
  background: var(--cx-attention);
}

.situacao--positivo .situacao__ponto {
  background: var(--cx-positive);
}

.situacao--negativo .situacao__ponto {
  background: var(--cx-negative);
}
</style>
