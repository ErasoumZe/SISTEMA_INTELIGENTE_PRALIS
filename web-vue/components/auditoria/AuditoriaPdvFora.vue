<script setup lang="ts">
import { computed, useId } from "vue";
import type { VendaForaAuditoria } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";
import { horaAuditoria, listaFormasAuditoria } from "./auditoria-formato";

// Vendas da CREARE que nao cairam em nenhum caixa (Marco, 17/11/2026): enquanto o sistema nao e usado em todo
// caixa, a lista e enorme. Fica recolhida, com a contagem e o total sempre a vista; abre e fecha quando quiser.
const props = defineProps<{ vendas: VendaForaAuditoria[]; aberta: boolean }>();
const emit = defineEmits<{ (e: "update:aberta", aberta: boolean): void }>();

const lista = useId();
const total = computed(() => props.vendas.reduce((soma, v) => soma + Math.round(v.valor * 100), 0) / 100);
</script>

<template>
  <div class="fora" data-teste="vendas-fora">
    <div class="fora__topo">
      <strong>{{ vendas.length }} venda(s) sem caixa aberto · {{ dinheiro(total) }}</strong>
      <v-btn
        size="small"
        variant="text"
        color="error"
        :prepend-icon="aberta ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        :aria-expanded="aberta"
        :aria-controls="lista"
        data-teste="alternar-fora"
        @click="emit('update:aberta', !aberta)"
        >{{ aberta ? "Ocultar vendas" : "Ver vendas" }}</v-btn
      >
    </div>
    <table v-if="aberta" :id="lista">
      <thead>
        <tr>
          <th>Hora</th>
          <th>Valor</th>
          <th>Forma</th>
          <th>Produtos</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="venda in vendas" :key="venda.vendaId">
          <td>{{ horaAuditoria(venda.hora) }}</td>
          <td>{{ dinheiro(venda.valor) }}</td>
          <td>{{ listaFormasAuditoria(venda.formas) || "—" }}</td>
          <td>{{ venda.produtos.map((p) => `${p.quantidade}× ${p.descricao}`).join(", ") || "—" }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.fora {
  margin-top: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--cx-negative) 9%, var(--cx-surface));
}
.fora__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
}
.fora__topo strong {
  color: var(--cx-negative);
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}
table {
  width: 100%;
  margin: 4px 0 6px;
  border-collapse: collapse;
  font-size: 0.84rem;
}
th {
  color: var(--cx-ink-soft);
  font-weight: 600;
  text-align: left;
}
th,
td {
  padding: 4px 8px 4px 0;
  vertical-align: top;
}
@media (max-width: 760px) {
  table,
  tbody,
  tr,
  td {
    display: block;
  }
  thead {
    display: none;
  }
  tr {
    padding: 6px 0;
    border-top: 1px solid var(--cx-line);
  }
}
</style>
