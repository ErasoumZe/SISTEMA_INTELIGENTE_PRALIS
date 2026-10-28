<script setup lang="ts">
/**
 * Pedidos finalizados (doc 58 §5): o que já foi comprado. "A caminho" espera a entrega (e o recebimento parcial
 * continua aqui até fechar); "Recebidos" já entraram no estoque. Cada linha abre o pedido.
 */
import type { PedidoDto, PedidoStatus } from "@padaria/shared";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import ComprasSituacao from "~/components/compras/base/ComprasSituacao.vue";
import ComprasVazio from "~/components/compras/base/ComprasVazio.vue";
import { rotuloDoTipoDePedido, rotuloStatusPedido, tomStatusPedido } from "~/utils/pedido-origem";

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
const VAZIO: Record<Aba, { titulo: string; texto: string }> = {
  a_caminho: { titulo: "Nada a caminho.", texto: "O que for comprado na Cotação por fornecedor aparece aqui." },
  recebidos: { titulo: "Nenhum pedido recebido ainda.", texto: "Os pedidos conferidos por completo ficam aqui." },
  cancelados: { titulo: "Nenhum pedido cancelado.", texto: "" }
};
</script>

<template>
  <ComprasSecao rente data-secao="pedidos-finalizados">
    <template #filtros>
      <v-tabs v-model="aba" density="compact" color="primary" class="finalizados__abas">
        <v-tab value="a_caminho" data-aba="a_caminho"
          >A caminho <span class="finalizados__conta">{{ contagem.a_caminho }}</span></v-tab
        >
        <v-tab value="recebidos" data-aba="recebidos"
          >Recebidos <span class="finalizados__conta">{{ contagem.recebidos }}</span></v-tab
        >
        <v-tab value="cancelados" data-aba="cancelados"
          >Cancelados <span class="finalizados__conta">{{ contagem.cancelados }}</span></v-tab
        >
      </v-tabs>
      <v-autocomplete
        v-model="fornecedorFiltro"
        :items="opcoes"
        placeholder="Todos os fornecedores"
        prepend-inner-icon="mdi-filter-variant"
        clearable
        density="compact"
        hide-details
        aria-label="Fornecedor"
        class="finalizados__filtro"
        data-campo="filtro-fornecedor"
      />
    </template>

    <v-progress-linear v-if="carregando" indeterminate height="2" />
    <ComprasVazio
      v-if="!linhas.length && !carregando"
      icone="mdi-truck-outline"
      :titulo="VAZIO[aba].titulo"
      :texto="VAZIO[aba].texto || undefined"
    />
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
            <span class="finalizados__sub"
              >{{ pedido.totalItens }} item(ns) · {{ rotuloDoTipoDePedido(pedido.tipo) }} · comprado em
              {{ DATA_HORA.format(new Date(pedido.aprovadoEm ?? pedido.criadoEm)) }}</span
            >
          </span>
          <ComprasSituacao :rotulo="rotuloStatusPedido(pedido.status)" :tom="tomStatusPedido(pedido.status)" />
          <v-icon icon="mdi-chevron-right" size="18" class="finalizados__seta" />
        </button>
      </li>
    </ul>
  </ComprasSecao>
</template>

<style scoped>
.finalizados__abas {
  flex: 1 1 auto;
}

.finalizados__conta {
  margin-left: 6px;
  color: var(--cx-ink-soft);
  font-variant-numeric: tabular-nums;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--cx-sp-3);
  width: 100%;
  padding: var(--cx-sp-3) var(--cx-sp-4) var(--cx-sp-3) var(--cx-sp-5);
  border: 0;
  border-top: 1px solid var(--cx-line-soft);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--cx-dur-1) var(--cx-ease);
}

.finalizados__linha:hover {
  background: var(--cx-hover);
}

.finalizados__linha:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: -2px;
}

.finalizados__dados {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.finalizados__dados strong {
  overflow-wrap: anywhere;
}

.finalizados__sub {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.finalizados__seta {
  color: var(--cx-ink-soft);
}

@media (max-width: 599px) {
  .finalizados__linha {
    grid-template-columns: minmax(0, 1fr) auto;
    padding-left: var(--cx-sp-4);
  }

  .finalizados__seta {
    display: none;
  }
}
</style>
