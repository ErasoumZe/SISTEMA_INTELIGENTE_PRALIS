<script setup lang="ts">
import type { normalizarTotaisRelatorioVendas } from "~/utils/caixa-fechamento";

// Resumo do relatorio de vendas gerado, como o CAIXA ve (fechamento cego, Marco 11/11/2026): so a QUANTIDADE de
// vendas. Nenhum valor em R$: com o total ou os valores por forma o caixa calcularia o dinheiro esperado na gaveta.
// Os valores continuam no relatorio e a Tesouraria ve tudo no dossie do fechamento.
defineProps<{
  totais: Pick<ReturnType<typeof normalizarTotaisRelatorioVendas>, "quantidade">;
  quantidadeCanceladas: number;
}>();
</script>

<template>
  <div class="relatorio-vendas__indicadores mt-4" data-teste="relatorio-vendas-resumo">
    <article class="relatorio-vendas__indicador--quantidade">
      <span>Vendas aprovadas</span>
      <strong>{{ totais.quantidade }}</strong>
    </article>
    <article class="relatorio-vendas__indicador--canceladas">
      <span>Canceladas</span>
      <strong>{{ quantidadeCanceladas }}</strong>
      <small>Ficam fora do relatório.</small>
    </article>
  </div>
</template>

<style scoped>
.relatorio-vendas__indicadores {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.relatorio-vendas__indicadores article {
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}
.relatorio-vendas__indicadores span {
  display: block;
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
  font-weight: 700;
}
.relatorio-vendas__indicadores strong {
  display: block;
  margin-top: 4px;
  font-size: 1.1rem;
}
.relatorio-vendas__indicadores small {
  color: var(--cx-ink-soft);
}
.relatorio-vendas__indicador--canceladas {
  border-color: color-mix(in srgb, var(--cx-attention) 52%, var(--cx-line)) !important;
}
.relatorio-vendas__indicador--quantidade {
  border-color: color-mix(in srgb, var(--cat-entradas-base) 46%, var(--cx-line));
}
@media (max-width: 340px) {
  .relatorio-vendas__indicadores {
    grid-template-columns: 1fr;
  }
}
</style>
