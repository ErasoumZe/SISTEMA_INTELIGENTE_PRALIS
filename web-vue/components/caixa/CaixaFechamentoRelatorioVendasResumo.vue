<script setup lang="ts">
import type { normalizarTotaisRelatorioVendas } from "~/utils/caixa-fechamento";
import { dinheiro } from "~/utils/domain";

// Resumo do relatorio de vendas gerado: indicadores e pagamentos aprovados por forma.
const props = defineProps<{
  totais: ReturnType<typeof normalizarTotaisRelatorioVendas>;
  quantidadeCanceladas: number;
}>();
const totaisPorForma = computed(() => props.totais.porFormaPagamento ?? []);
</script>

<template>
  <div>
    <div class="relatorio-vendas__indicadores mt-4">
      <article class="relatorio-vendas__indicador--quantidade">
        <span>Aprovadas</span>
        <strong>{{ totais.quantidade }}</strong>
      </article>
      <article class="relatorio-vendas__indicador--total">
        <span>Total aprovado</span>
        <strong>{{ dinheiro(totais.totalGeral) }}</strong>
      </article>
      <article class="relatorio-vendas__indicador--canceladas">
        <span>Canceladas</span>
        <strong>{{ quantidadeCanceladas }}</strong>
        <small>Ficam fora do total.</small>
      </article>
    </div>

    <details class="relatorio-vendas__formas mt-4" aria-label="Totais por tipo de recebimento">
      <summary>
        <strong>Pagamentos aprovados</strong>
        <span>Toque para mostrar ou ocultar</span>
      </summary>
      <div v-if="totaisPorForma.length" class="relatorio-vendas__formas-lista">
        <div
          v-for="forma in totaisPorForma"
          :key="forma.formaPagamento"
          class="relatorio-vendas__forma"
          :class="`relatorio-vendas__forma--${forma.categoriaFechamentoCaixa ?? 'outros'}`"
        >
          <span>{{ forma.formaPagamento }}</span>
          <strong>{{ dinheiro(forma.total) }}</strong>
          <small>{{ forma.quantidade }} venda{{ forma.quantidade === 1 ? "" : "s" }}</small>
        </div>
      </div>
      <p v-else class="text-body-2 text-medium-emphasis mb-0">Nenhuma forma de pagamento foi informada.</p>
    </details>
  </div>
</template>

<style scoped>
.relatorio-vendas__indicadores,
.relatorio-vendas__formas-lista {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.relatorio-vendas__indicadores article,
.relatorio-vendas__forma {
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}
.relatorio-vendas__indicadores span,
.relatorio-vendas__forma span {
  display: block;
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
  font-weight: 700;
}
.relatorio-vendas__indicadores strong,
.relatorio-vendas__forma strong {
  display: block;
  margin-top: 4px;
  font-size: 1.1rem;
}
.relatorio-vendas__indicadores small,
.relatorio-vendas__forma small {
  color: var(--cx-ink-soft);
}
.relatorio-vendas__indicador--canceladas {
  border-color: color-mix(in srgb, var(--cx-attention) 52%, var(--cx-line)) !important;
}
.relatorio-vendas__indicador--total {
  border-color: color-mix(in srgb, var(--cx-positive) 46%, var(--cx-line));
  background: color-mix(in srgb, var(--cx-positive) 16%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__indicador--quantidade {
  border-color: color-mix(in srgb, var(--cat-entradas-base) 46%, var(--cx-line));
}
.relatorio-vendas__formas {
  padding: 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--cx-brand) 15%, var(--cx-surface));
}
.relatorio-vendas__formas summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  list-style: none;
}
.relatorio-vendas__formas summary::-webkit-details-marker {
  display: none;
}
.relatorio-vendas__formas summary span {
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
}
.relatorio-vendas__formas-lista {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.relatorio-vendas__forma--dinheiro {
  border-color: color-mix(in srgb, var(--cx-positive) 42%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-positive) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--credito,
.relatorio-vendas__forma--voucher {
  border-color: color-mix(in srgb, var(--cx-brand) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-brand) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--debito {
  border-color: color-mix(in srgb, var(--cat-retiradas-base) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cat-retiradas-base) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--pix {
  border-color: color-mix(in srgb, var(--cat-mercadorias-base) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cat-mercadorias-base) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--crediario,
.relatorio-vendas__forma--outros {
  border-color: color-mix(in srgb, var(--cx-attention) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-attention) 24%, var(--cx-surface-sunken)) !important;
}
@media (max-width: 720px) {
  .relatorio-vendas__indicadores {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .relatorio-vendas__formas-lista {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .relatorio-vendas__forma {
    padding: 10px;
  }
}
@media (max-width: 340px) {
  .relatorio-vendas__indicadores {
    grid-template-columns: 1fr;
  }
}
</style>
