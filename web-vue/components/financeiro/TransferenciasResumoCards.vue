<script setup lang="ts">
import { dinheiro } from "~/utils/domain";

defineProps<{
  saida: number;
  entrada: number;
  saldo: number;
}>();

const cartoes = [
  { chave: "saida", titulo: "Saídas", icone: "mdi-arrow-up-right", tom: "saida" },
  { chave: "entrada", titulo: "Entradas", icone: "mdi-arrow-down-left", tom: "entrada" },
  { chave: "saldo", titulo: "Saldo", icone: "mdi-scale-balance", tom: "saldo" }
] as const;
</script>

<template>
  <section class="resumo-transferencias" aria-label="Resumo das transferências desta página">
    <article v-for="cartao in cartoes" :key="cartao.chave" class="resumo-transferencias__card" :data-tom="cartao.tom">
      <span class="resumo-transferencias__icone"><v-icon :icon="cartao.icone" size="20" /></span>
      <span>
        <span class="resumo-transferencias__titulo">{{ cartao.titulo }}</span>
        <strong>{{ dinheiro($props[cartao.chave]) }}</strong>
        <small>Nesta página</small>
      </span>
    </article>
  </section>
</template>

<style scoped>
.resumo-transferencias {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.resumo-transferencias__card {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--cx-line);
  border-radius: 14px;
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}

.resumo-transferencias__icone {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
}

.resumo-transferencias__card[data-tom="saida"] .resumo-transferencias__icone {
  background: color-mix(in srgb, #ef4444 16%, var(--cx-surface-raised));
  color: #dc2626;
}

.resumo-transferencias__card[data-tom="entrada"] .resumo-transferencias__icone {
  background: color-mix(in srgb, #22c55e 16%, var(--cx-surface-raised));
  color: #16a34a;
}

.resumo-transferencias__card[data-tom="saldo"] .resumo-transferencias__icone {
  background: var(--cat-transferencias-soft);
  color: var(--cat-transferencias-tinta);
}

.resumo-transferencias__titulo,
.resumo-transferencias__card small {
  display: block;
  color: var(--cx-ink-soft);
}

.resumo-transferencias__titulo {
  font-size: 12px;
  font-weight: 700;
}

.resumo-transferencias__card strong {
  display: block;
  margin-top: 2px;
  color: var(--cx-ink);
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.resumo-transferencias__card small {
  margin-top: 3px;
  font-size: 11px;
}

@media (width <= 768px) {
  .resumo-transferencias {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .resumo-transferencias__card {
    padding: 13px 14px;
  }
}
</style>
