<script setup lang="ts">
/**
 * Uma linha de item do pedido de compra.
 *
 * Existe separada porque a linha carrega decisao, nao so dois campos: ela mostra o saldo atual
 * contra minimo e maximo e avisa que a quantidade estourou o teto ANTES de salvar. Antes disso o
 * comprador digitava as cegas e descobria o limite no erro do servidor, com o pedido inteiro perdido.
 */
import type { ProdutoEstoqueDto } from "@padaria/shared";
import ProdutoAutocomplete from "~/components/produtos/ProdutoAutocomplete.vue";
import { formatarQuantidade, normalizarQuantidadeEditavel } from "~/utils/formatacao";

const props = defineProps<{
  empresaId: string;
  indice: number;
  podeRemover: boolean;
  /**
   * Posicao de estoque do produto escolhido, quando o ator tem permissao para ler estoque. Vem de
   * `/api/compras/estoque`, nao do seletor de produto: a projecao do seletor e compartilhada com
   * quem so lanca mercadoria e tem lista de campos fechada por teste.
   */
  estoque: ProdutoEstoqueDto | null;
}>();
const produtoId = defineModel<string>("produtoId", { required: true });
const quantidade = defineModel<string>("quantidade", { required: true });
const emit = defineEmits<{ remover: [] }>();

const produto = computed(() => props.estoque);

const numero = (valor: string | null | undefined) => (valor === null || valor === undefined ? null : Number(valor));
const saldo = computed(() => numero(produto.value?.quantidadeEstoque) ?? 0);
const minimo = computed(() => numero(produto.value?.estoqueMin));
const maximo = computed(() => numero(produto.value?.estoqueMax));
const pedida = computed(() => {
  const valor = Number(quantidade.value);
  return Number.isFinite(valor) ? valor : 0;
});
const unidade = computed(() => produto.value?.unidade ?? "un");

/** Mesmo calculo do servidor (`resolverItens`): saldo atual + pedido nao pode passar do maximo. */
const estouraMaximo = computed(() => maximo.value !== null && saldo.value + pedida.value > maximo.value);
const sobraAteOMaximo = computed(() => (maximo.value === null ? null : Math.max(maximo.value - saldo.value, 0)));
const abaixoDoMinimo = computed(() => minimo.value !== null && saldo.value <= minimo.value);

const mensagemDaQuantidade = computed(() => {
  if (!produto.value) return undefined;
  if (pedida.value <= 0) return "Informe uma quantidade maior que zero.";
  if (estouraMaximo.value) return `Cabe no máximo ${formatarQuantidade(sobraAteOMaximo.value ?? 0)} ${unidade.value}.`;
  return undefined;
});

function somar(passo: number) {
  const proxima = Math.max(pedida.value + passo, 0);
  quantidade.value = normalizarQuantidadeEditavel(proxima);
}

/** Completa exatamente o que falta para o maximo — o atalho que o comprador mais usa. */
function completarAteOMaximo() {
  if (sobraAteOMaximo.value === null) return;
  quantidade.value = normalizarQuantidadeEditavel(sobraAteOMaximo.value);
}
</script>

<template>
  <div class="item-linha" :class="{ 'item-linha--alerta': estouraMaximo }" :data-item="indice">
    <div class="item-linha__produto">
      <ProdutoAutocomplete
        v-model="produtoId"
        :empresa-id="empresaId"
        densidade="comfortable"
        so-liberados-para-compra
      />
      <div v-if="produto" class="item-linha__contexto">
        <v-chip size="x-small" variant="tonal" :color="abaixoDoMinimo ? 'warning' : undefined" label>
          Em estoque {{ formatarQuantidade(saldo) }} {{ unidade }}
        </v-chip>
        <v-chip v-if="minimo !== null" size="x-small" variant="text" label>mín {{ formatarQuantidade(minimo) }}</v-chip>
        <v-chip v-if="maximo !== null" size="x-small" variant="text" label>máx {{ formatarQuantidade(maximo) }}</v-chip>
        <v-btn
          v-if="sobraAteOMaximo !== null && sobraAteOMaximo > 0"
          size="x-small"
          variant="text"
          class="item-linha__atalho"
          @click="completarAteOMaximo"
        >
          Completar {{ formatarQuantidade(sobraAteOMaximo) }}
        </v-btn>
      </div>
      <div v-else class="item-linha__contexto item-linha__contexto--vazio">
        Escolha o produto para ver saldo, mínimo e máximo.
      </div>
    </div>

    <div class="item-linha__quantidade">
      <v-btn
        icon="mdi-minus"
        size="small"
        variant="tonal"
        aria-label="Diminuir quantidade"
        :disabled="pedida <= 0"
        @click="somar(-1)"
      />
      <v-text-field
        v-model="quantidade"
        type="number"
        min="0"
        step="0.001"
        label="Quantidade"
        density="comfortable"
        hide-details="auto"
        :suffix="unidade"
        :error="Boolean(mensagemDaQuantidade)"
        :error-messages="mensagemDaQuantidade"
      />
      <v-btn icon="mdi-plus" size="small" variant="tonal" aria-label="Aumentar quantidade" @click="somar(1)" />
      <v-btn
        icon="mdi-delete-outline"
        size="small"
        variant="text"
        aria-label="Remover item"
        :disabled="!podeRemover"
        @click="emit('remover')"
      />
    </div>
  </div>
</template>

<style scoped>
.item-linha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-4);
  align-items: start;
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-1);
  transition:
    border-color var(--cx-dur-1) var(--cx-ease),
    box-shadow var(--cx-dur-1) var(--cx-ease);
}

.item-linha:focus-within {
  border-color: var(--cx-focus);
  box-shadow:
    var(--cx-e-2),
    0 0 0 3px var(--cx-brand-ring);
}

.item-linha--alerta {
  border-color: rgb(var(--v-theme-warning));
}

.item-linha__produto {
  min-width: 0;
}

.item-linha__contexto {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-1);
  margin-top: var(--cx-sp-2);
  min-height: 24px;
}

.item-linha__contexto--vazio {
  font-size: 0.75rem;
  color: var(--cx-ink-soft);
}

.item-linha__atalho {
  text-transform: none;
}

.item-linha__quantidade {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-1);
  font-variant-numeric: tabular-nums;
}

.item-linha__quantidade :deep(.v-input) {
  width: 132px;
}

/* No celular a linha vira duas faixas: produto em cima, quantidade embaixo, sem rolagem lateral. */
@media (max-width: 599px) {
  .item-linha {
    grid-template-columns: minmax(0, 1fr);
  }

  .item-linha__quantidade {
    justify-content: space-between;
  }

  .item-linha__quantidade :deep(.v-input) {
    width: auto;
    flex: 1 1 auto;
  }
}
</style>
