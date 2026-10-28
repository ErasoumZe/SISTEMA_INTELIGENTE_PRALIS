<script setup lang="ts">
/**
 * A faixa de números do Estoque: quantos produtos estão na tela, quantos estão no mínimo, quantos dá para completar
 * até o máximo e quantos não têm faixa. "No mínimo" e "Sem faixa" também filtram a lista (tocar de novo desfaz).
 */
import type { ProdutoEstoqueDto } from "@padaria/shared";
import type { FiltroSituacaoEstoque } from "~/utils/compras-visual";

const props = defineProps<{ produtos: ProdutoEstoqueDto[] }>();
const filtro = defineModel<FiltroSituacaoEstoque>("filtro", { default: null });

function numero(valor: string | null) {
  return Number(valor ?? 0);
}

const abaixoDoMinimo = computed(() =>
  props.produtos.filter(
    (produto) => produto.estoqueMin !== null && numero(produto.quantidadeEstoque) <= numero(produto.estoqueMin)
  )
);
const semFaixa = computed(
  () => props.produtos.filter((produto) => produto.estoqueMin === null || produto.estoqueMax === null).length
);
const sugestoesPossiveis = computed(
  () =>
    abaixoDoMinimo.value.filter(
      (produto) => produto.estoqueMax !== null && numero(produto.estoqueMax) > numero(produto.quantidadeEstoque)
    ).length
);

function alternar(qual: Exclude<FiltroSituacaoEstoque, null>) {
  filtro.value = filtro.value === qual ? null : qual;
}
</script>

<template>
  <div class="faixa" data-secao="indicadores-estoque">
    <div class="faixa__item">
      <span class="faixa__valor">{{ produtos.length }}</span>
      <span class="faixa__rotulo">Produtos na lista</span>
    </div>
    <button
      type="button"
      class="faixa__item faixa__item--botao"
      :class="{ 'faixa__item--ativo': filtro === 'minimo' }"
      :aria-pressed="filtro === 'minimo'"
      @click="alternar('minimo')"
    >
      <span class="faixa__valor faixa__valor--atencao">{{ abaixoDoMinimo.length }}</span>
      <span class="faixa__rotulo">No mínimo</span>
    </button>
    <div class="faixa__item">
      <span class="faixa__valor">{{ sugestoesPossiveis }}</span>
      <span class="faixa__rotulo">Dá para completar até o máximo</span>
    </div>
    <button
      type="button"
      class="faixa__item faixa__item--botao"
      :class="{ 'faixa__item--ativo': filtro === 'sem_faixa' }"
      :aria-pressed="filtro === 'sem_faixa'"
      @click="alternar('sem_faixa')"
    >
      <span class="faixa__valor">{{ semFaixa }}</span>
      <span class="faixa__rotulo">Sem mínimo e máximo</span>
    </button>
  </div>
</template>

<style scoped>
.faixa {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.faixa__item {
  display: grid;
  gap: 2px;
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border: 0;
  border-left: 1px solid var(--cx-line-soft);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.faixa__item:first-child {
  border-left: 0;
}

.faixa__item--botao {
  cursor: pointer;
  transition: background-color var(--cx-dur-1) var(--cx-ease);
}

.faixa__item--botao:hover {
  background: var(--cx-hover);
}

.faixa__item--botao:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: -2px;
}

.faixa__item--ativo {
  background: var(--cx-brand-wash);
  box-shadow: inset 0 -2px 0 var(--cx-brand);
}

.faixa__valor {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.faixa__valor--atencao {
  color: var(--cx-attention);
}

.faixa__rotulo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

@media (max-width: 767px) {
  .faixa {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .faixa__item:nth-child(3) {
    border-left: 0;
  }

  .faixa__item:nth-child(n + 3) {
    border-top: 1px solid var(--cx-line-soft);
  }
}
</style>
