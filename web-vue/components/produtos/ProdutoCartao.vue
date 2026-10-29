<script setup lang="ts">
/** Cartao de uma secao do formulario de produto (Produto, Revenda ou transformacao, Fiscal, Promocao). */
defineProps<{ titulo: string; subtitulo?: string; icone?: string }>();
</script>

<template>
  <section class="cartao">
    <header class="cartao__cabecalho">
      <span v-if="icone" class="cartao__icone"><v-icon :icon="icone" size="20" /></span>
      <span class="cartao__textos">
        <strong>{{ titulo }}</strong>
        <small v-if="subtitulo">{{ subtitulo }}</small>
      </span>
      <slot name="cabecalho" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.cartao {
  display: grid;
  gap: var(--cx-sp-3);
  min-width: 0;
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.cartao__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}
.cartao__icone {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink);
}
.cartao__textos {
  display: grid;
  flex: 1;
  min-width: 0;
}
.cartao__textos strong {
  font-size: var(--cx-fs-title);
  font-weight: 700;
  color: var(--cx-ink);
}
.cartao__textos small {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
:deep(.cartao__subtitulo) {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--cx-sp-2);
  padding-top: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line-soft);
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
:deep(.cartao__subtitulo strong) {
  font-size: var(--cx-fs-lead);
  font-weight: 600;
  color: var(--cx-ink);
}
:deep(.cartao__previa .v-field) {
  background: var(--cx-surface-sunken);
}
</style>
