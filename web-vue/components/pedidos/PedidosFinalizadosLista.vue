<script setup lang="ts">
/**
 * Pedidos finalizados (doc 58 §5): o que já foi comprado. "A caminho" espera a entrega (e o recebimento parcial
 * continua aqui até fechar); "Recebidos" já entraram no estoque. Cada linha abre o pedido.
 */
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import { corStatusPedido, rotuloDoTipoDePedido, rotuloStatusPedido } from "~/utils/pedido-origem";

const props = defineProps<{ pedidos: PedidoDto[]; carregando: boolean }>();
const emit = defineEmits<{ abrir: [id: string] }>();

type Aba = "a_caminho" | "recebidos" | "cancelados";
const FECHADOS: PedidoStatus[] = ["recebido", "cancelado"];
const aba = ref<Aba>("a_caminho");
const fornecedorFiltro = ref<string | null>(null);
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const daAba = (pedido: PedidoDto, qual: Aba) =>
  qual === "recebidos"
    ? pedido.status === "recebido"
    : qual === "cancelados"
      ? pedido.status === "cancelado"
      : !FECHADOS.includes(pedido.status);
const contagem = computed(() => ({
  a_caminho: props.pedidos.filter((pedido) => daAba(pedido, "a_caminho")).length,
  recebidos: props.pedidos.filter((pedido) => daAba(pedido, "recebidos")).length,
  cancelados: props.pedidos.filter((pedido) => daAba(pedido, "cancelados")).length
}));
const opcoes = computed(() => {
  const nomes = new Map<string, string>();
  for (const pedido of props.pedidos)
    if (pedido.fornecedorId) nomes.set(pedido.fornecedorId, pedido.fornecedorNome ?? "Fornecedor");
  return [...nomes].map(([value, title]) => ({ value, title })).sort((a, b) => a.title.localeCompare(b.title));
});
const linhas = computed(() =>
  props.pedidos.filter(
    (pedido) =>
      daAba(pedido, aba.value) && (fornecedorFiltro.value === null || pedido.fornecedorId === fornecedorFiltro.value)
  )
);
const VAZIO: Record<Aba, string> = {
  a_caminho: "Nenhum pedido a caminho. O que for comprado na cotação aparece aqui.",
  recebidos: "Nenhum pedido recebido ainda.",
  cancelados: "Nenhum pedido cancelado."
};
</script>

<template>
  <v-card class="finalizados" data-secao="pedidos-finalizados">
    <div class="finalizados__topo">
      <v-tabs v-model="aba" density="compact" color="primary">
        <v-tab value="a_caminho" data-aba="a_caminho">A caminho ({{ contagem.a_caminho }})</v-tab>
        <v-tab value="recebidos" data-aba="recebidos">Recebidos ({{ contagem.recebidos }})</v-tab>
        <v-tab value="cancelados" data-aba="cancelados">Cancelados ({{ contagem.cancelados }})</v-tab>
      </v-tabs>
      <v-autocomplete
        v-model="fornecedorFiltro"
        :items="opcoes"
        label="Fornecedor"
        placeholder="Todos"
        clearable
        density="compact"
        hide-details
        class="finalizados__filtro"
        data-campo="filtro-fornecedor"
      />
    </div>
    <v-progress-linear v-if="carregando" indeterminate />
    <div v-if="!linhas.length && !carregando" class="finalizados__vazio">
      <v-icon icon="mdi-truck-outline" size="32" />
      <p>{{ VAZIO[aba] }}</p>
    </div>
    <ul v-else class="finalizados__lista">
      <li v-for="pedido in linhas" :key="pedido.id">
        <button
          type="button"
          class="finalizados__linha"
          :data-pedido="pedido.fornecedorNome ?? ''"
          @click="emit('abrir', pedido.id)"
        >
          <span class="finalizados__dados">
            <strong>{{ pedido.fornecedorNome ?? "Pedido histórico" }}</strong>
            <span class="text-caption text-medium-emphasis"
              >{{ pedido.totalItens }} item(ns) · {{ rotuloDoTipoDePedido(pedido.tipo) }} · comprado em
              {{ DATA_HORA.format(new Date(pedido.aprovadoEm ?? pedido.criadoEm)) }}</span
            >
          </span>
          <v-chip size="small" variant="tonal" :color="corStatusPedido(pedido.status)">{{
            rotuloStatusPedido(pedido.status)
          }}</v-chip>
        </button>
      </li>
    </ul>
  </v-card>
</template>

<style scoped>
.finalizados {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
}

.finalizados__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-bottom: 1px solid var(--cx-line-soft);
}

.finalizados__filtro {
  flex: 0 1 280px;
  min-width: 200px;
}

.finalizados__lista {
  margin: 0;
  padding: 0;
  list-style: none;
}

.finalizados__linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  width: 100%;
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border: 0;
  border-bottom: 1px solid var(--cx-line-soft);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.finalizados__linha:hover,
.finalizados__linha:focus-visible {
  background: var(--cx-surface-sunken);
}

.finalizados__dados {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.finalizados__vazio {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-8) var(--cx-sp-6);
  color: var(--cx-ink-soft);
  text-align: center;
}
</style>
