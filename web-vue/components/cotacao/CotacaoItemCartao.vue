<script setup lang="ts">
/**
 * Um produto da cotacao, do jeito que o fornecedor ve no celular.
 *
 * O cartao so edita e mostra: a conta vem pronta do `calcularCotacao` da pagina, a mesma funcao que
 * o servidor usa no envio. Assim o numero que o fornecedor ve e o numero que fica gravado.
 */
import type { CotacaoItemDto, ItemCotacaoCalculado, TipoDescontoCotacao } from "@padaria/shared";
import { formatarQuantidade } from "~/utils/formatacao";

export type RespostaItemCotacao = {
  pedidoItemId: string;
  indisponivel: boolean;
  valorUnitario: string;
  descontoTipo: TipoDescontoCotacao;
  descontoValor: string;
};

const props = defineProps<{
  item: CotacaoItemDto;
  calculo: ItemCotacaoCalculado | null;
  somenteLeitura?: boolean;
  /** Mostra a pendencia "falta o valor" so depois da primeira tentativa de envio. */
  cobrarValor?: boolean;
}>();
const resposta = defineModel<RespostaItemCotacao>({ required: true });

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ultimoValor = computed(() =>
  props.item.ultimoValor === null
    ? null
    : Number(props.item.ultimoValor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      })
);
const unidade = computed(() => props.item.unidade ?? "un");
const temDesconto = computed(() => (props.calculo?.descontoItemCentavos ?? 0) > 0);
const faltaValor = computed(
  () => props.cobrarValor && !resposta.value.indisponivel && !Number(resposta.value.valorUnitario.replace(",", "."))
);
const erroDoValor = computed(() => (faltaValor.value ? "Informe o valor." : undefined));

function alternarTipoDesconto(tipo: TipoDescontoCotacao | null) {
  if (!tipo) return;
  resposta.value = { ...resposta.value, descontoTipo: tipo };
}
</script>

<template>
  <article
    class="cotacao-item"
    :class="{ 'cotacao-item--fora': resposta.indisponivel, 'cotacao-item--pendente': faltaValor }"
    :data-item="item.pedidoItemId"
  >
    <header class="cotacao-item__cabecalho">
      <div class="cotacao-item__produto">
        <h3 class="cotacao-item__nome">{{ item.descricao }}</h3>
        <p class="cotacao-item__referencia">
          Último valor pago:
          <strong v-if="ultimoValor">{{ ultimoValor }}/{{ unidade }}</strong>
          <span v-else>sem histórico</span>
        </p>
      </div>
      <div class="cotacao-item__quantidade" aria-label="Quantidade pedida">
        <span class="cotacao-item__quantidade-numero">{{ formatarQuantidade(item.quantidade) }}</span>
        <span class="cotacao-item__quantidade-unidade">{{ unidade }}</span>
      </div>
    </header>

    <div v-if="!resposta.indisponivel" class="cotacao-item__campos">
      <v-text-field
        v-model="resposta.valorUnitario"
        label="Valor atual"
        :suffix="`/${unidade}`"
        prefix="R$"
        inputmode="decimal"
        placeholder="0,00"
        density="comfortable"
        hide-details="auto"
        :readonly="somenteLeitura"
        :error-messages="erroDoValor"
        data-campo="valor-unitario"
      />
      <div class="cotacao-item__desconto">
        <v-btn-toggle
          :model-value="resposta.descontoTipo"
          density="comfortable"
          mandatory
          divided
          variant="outlined"
          class="cotacao-item__tipo"
          :disabled="somenteLeitura"
          aria-label="Tipo de desconto"
          @update:model-value="alternarTipoDesconto"
        >
          <v-btn value="valor" size="small">R$</v-btn>
          <v-btn value="percentual" size="small">%</v-btn>
        </v-btn-toggle>
        <v-text-field
          v-model="resposta.descontoValor"
          :label="resposta.descontoTipo === 'valor' ? 'Desconto por unidade' : 'Desconto em %'"
          inputmode="decimal"
          placeholder="0"
          density="comfortable"
          hide-details="auto"
          :readonly="somenteLeitura"
          :error-messages="calculo?.erro ?? undefined"
          data-campo="desconto-item"
        />
      </div>
    </div>

    <dl v-if="!resposta.indisponivel && calculo" class="cotacao-item__valores">
      <div>
        <dt>Valor com desconto</dt>
        <dd :class="{ 'cotacao-item__realce': temDesconto }">
          {{ moeda(calculo.unitarioComDescontoCentavos) }}/{{ unidade }}
        </dd>
      </div>
      <div>
        <dt>Total do item</dt>
        <dd class="cotacao-item__total" data-campo="total-item">{{ moeda(calculo.totalItemCentavos) }}</dd>
      </div>
    </dl>

    <p v-else-if="resposta.indisponivel" class="cotacao-item__fora-texto">
      Marcado como indisponível: este produto não entra no total.
    </p>

    <v-switch
      v-model="resposta.indisponivel"
      label="Não tenho este produto"
      color="primary"
      density="compact"
      hide-details
      inset
      :disabled="somenteLeitura"
      class="cotacao-item__indisponivel"
    />
  </article>
</template>

<style scoped>
.cotacao-item {
  display: grid;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-4, 16px);
  border: 1px solid var(--cx-line-soft, #eef1f6);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface, #fff);
  box-shadow: var(--cx-e-1, none);
  transition:
    border-color var(--cx-dur-1, 120ms) var(--cx-ease, ease),
    opacity var(--cx-dur-2, 180ms) var(--cx-ease, ease);
}

.cotacao-item--pendente {
  border-color: rgb(var(--v-theme-error));
}

.cotacao-item--fora {
  opacity: 0.72;
}

.cotacao-item__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
}

.cotacao-item__produto {
  min-width: 0;
}

.cotacao-item__nome {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--cx-ink, #1f2733);
  overflow-wrap: anywhere;
}

.cotacao-item__referencia {
  margin: var(--cx-sp-1, 4px) 0 0;
  font-size: 0.8125rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-item__quantidade {
  display: grid;
  justify-items: end;
  flex-shrink: 0;
  padding: var(--cx-sp-1, 4px) var(--cx-sp-3, 12px);
  border-radius: var(--cx-r-md, 12px);
  background: var(--cx-surface-sunken, #f4f6fa);
}

.cotacao-item__quantidade-numero {
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--cx-ink, #1f2733);
}

.cotacao-item__quantidade-unidade {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-item__campos {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--cx-sp-3, 12px);
}

.cotacao-item__desconto {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-2, 8px);
  min-width: 0;
}

.cotacao-item__tipo {
  flex-shrink: 0;
  height: 48px;
}

.cotacao-item__desconto :deep(.v-input) {
  min-width: 0;
}

.cotacao-item__valores {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--cx-sp-2, 8px) var(--cx-sp-4, 16px);
  margin: 0;
  padding-top: var(--cx-sp-3, 12px);
  border-top: 1px dashed var(--cx-line, #e4e8ef);
}

.cotacao-item__valores dt {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-item__valores dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.cotacao-item__realce {
  color: var(--cx-positive, #15803d);
}

.cotacao-item__total {
  font-size: 1.0625rem;
  text-align: right;
}

.cotacao-item__fora-texto {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-item__indisponivel {
  justify-self: start;
}

@media (max-width: 599px) {
  .cotacao-item__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
