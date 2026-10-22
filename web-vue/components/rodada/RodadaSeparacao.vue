<script setup lang="ts">
/**
 * Passo 2 da cotação (doc 57 §5): o fornecedor ganhou estes produtos; depois de separar, informa a
 * quantidade real de cada um (dentro da faixa combinada) e devolve. O comprador confirma e ele recebe o
 * "pode entregar" pelo WhatsApp.
 */
import type { PedidoPublicoDto } from "@padaria/shared";
import type { RequisitarRodada } from "~/composables/useRodadaFornecedor";
import { formatarQuantidade } from "~/utils/formatacao";

const props = defineProps<{ pedido: PedidoPublicoDto; requisitar: RequisitarRodada }>();
const emit = defineEmits<{ devolvido: [] }>();

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantidades = ref<Record<string, string>>({});
const enviando = ref(false);
const erro = ref("");

watch(
  () => props.pedido,
  (pedido) => {
    quantidades.value = Object.fromEntries(
      pedido.itens.map((item) => [item.pedidoItemId, String(Number(item.quantidade))])
    );
  },
  { immediate: true }
);

const separando = computed(() => props.pedido.status === "cotado");
const foraDaFaixa = (item: PedidoPublicoDto["itens"][number]) => {
  const valor = Number(quantidades.value[item.pedidoItemId]);
  if (!(valor > 0)) return true;
  if (item.minimo === null || item.maximo === null) return false;
  return valor < Number(item.minimo) - 0.0005 || valor > Number(item.maximo) + 0.0005;
};
const podeEnviar = computed(() => props.pedido.itens.every((item) => !foraDaFaixa(item)));
const total = computed(() =>
  props.pedido.itens.reduce(
    (soma, item) => soma + (Number(quantidades.value[item.pedidoItemId]) || 0) * Number(item.valorUnitario ?? 0),
    0
  )
);
const MENSAGEM: Record<PedidoPublicoDto["status"], string> = {
  cotado: "Você ganhou estes produtos. Separe e informe a quantidade real de cada um.",
  retornado: "Quantidades enviadas. Agora é só aguardar a confirmação do comprador pelo WhatsApp.",
  confirmado: "Compra confirmada. Pode entregar.",
  recebido_parcial: "Recebemos parte da entrega.",
  recebido: "Entrega recebida. Obrigado!"
};

async function devolver() {
  if (!podeEnviar.value || enviando.value) return;
  enviando.value = true;
  erro.value = "";
  try {
    await props.requisitar("/api/rodada/separacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: props.pedido.itens.map((item) => ({
          pedidoItemId: item.pedidoItemId,
          quantidade: Number(quantidades.value[item.pedidoItemId])
        }))
      })
    });
    emit("devolvido");
  } catch (causa) {
    erro.value = causa instanceof Error ? causa.message : "Não foi possível enviar.";
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <section class="separacao" data-secao="separacao" aria-labelledby="titulo-separacao">
    <header class="separacao__topo">
      <h2 id="titulo-separacao" class="separacao__titulo">Seu pedido</h2>
      <p class="separacao__mensagem">{{ MENSAGEM[pedido.status] }}</p>
    </header>
    <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
    <div v-for="item in pedido.itens" :key="item.pedidoItemId" class="separacao__item">
      <div class="separacao__produto">
        <strong>{{ item.descricaoProduto }}</strong>
        <span class="text-caption text-medium-emphasis"
          >Pedimos {{ formatarQuantidade(item.quantidadePedida) }}
          <template v-if="item.valorUnitario"> · {{ MOEDA.format(Number(item.valorUnitario)) }} cada</template></span
        >
      </div>
      <v-text-field
        v-if="separando"
        v-model="quantidades[item.pedidoItemId]"
        type="number"
        inputmode="decimal"
        min="0"
        step="0.001"
        label="Quantidade separada"
        density="comfortable"
        :hint="
          item.minimo && item.maximo
            ? `Entre ${formatarQuantidade(item.minimo)} e ${formatarQuantidade(item.maximo)}`
            : ''
        "
        persistent-hint
        :error="foraDaFaixa(item)"
        class="separacao__campo"
      />
      <span v-else class="separacao__quantidade">{{ formatarQuantidade(item.quantidade) }}</span>
    </div>
    <footer v-if="separando" class="separacao__rodape">
      <span
        >Total: <strong>{{ MOEDA.format(total) }}</strong></span
      >
      <v-btn color="primary" variant="flat" :loading="enviando" :disabled="!podeEnviar" @click="devolver"
        >Enviar quantidades</v-btn
      >
    </footer>
  </section>
</template>

<style scoped>
.separacao {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 2px solid var(--cx-brand);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.separacao__titulo {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.separacao__mensagem {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
}

.separacao__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px;
  gap: var(--cx-sp-3);
  align-items: center;
  padding-top: var(--cx-sp-3);
  border-top: 1px solid var(--cx-line-soft);
}

.separacao__produto {
  display: grid;
}

.separacao__quantidade {
  justify-self: end;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.separacao__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}

@media (max-width: 599px) {
  .separacao__item {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
