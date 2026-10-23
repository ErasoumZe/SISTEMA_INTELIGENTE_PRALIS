<script setup lang="ts">
/**
 * Uma oferta de fornecedor na cotação do produto (doc 58 §4). "Aceitar este preço" compra na hora e não mexe na
 * referência; "Aceitar e reajustar" compra e a referência passa a ser este custo. Os dois pedem confirmação na linha
 * (comprar é irreversível). Com a cotação aberta também dá para contrapropor.
 */
import type { OfertaDoProdutoDto } from "@padaria/shared";
import { formatarValorDecisao, lerValorDigitado, totalDaProposta } from "~/utils/decisao-compras";

const props = defineProps<{
  oferta: OfertaDoProdutoDto;
  unidade: string | null;
  podeAceitar: boolean;
  podeContrapropor: boolean;
  processando: boolean;
}>();
const emit = defineEmits<{
  aceitar: [oferta: OfertaDoProdutoDto, reajustarReferencia: boolean];
  contrapropor: [oferta: OfertaDoProdutoDto, valor: number];
}>();

const confirmando = ref<"so_agora" | "reajustar" | null>(null);
const valorDigitado = ref("");
const valor = computed(() => lerValorDigitado(valorDigitado.value));
const unidade = computed(() => props.unidade ?? "un");
const quantidade = computed(() => props.oferta.quantidadeDisponivel ?? props.oferta.quantidadePedida);
const total = computed(() => totalDaProposta(props.oferta, quantidade.value));

function confirmar() {
  emit("aceitar", props.oferta, confirmando.value === "reajustar");
  confirmando.value = null;
}
function enviarContraproposta() {
  if (valor.value === null) return;
  emit("contrapropor", props.oferta, valor.value);
  valorDigitado.value = "";
}
</script>

<template>
  <div class="oferta" :data-fornecedor="oferta.fornecedorNome" :data-situacao="oferta.situacao">
    <div class="oferta__dados">
      <span class="font-weight-medium">{{ oferta.fornecedorNome }}</span>
      <span v-if="oferta.indisponivel" class="text-caption text-medium-emphasis">não tem o produto</span>
      <template v-else-if="oferta.propostaItemId">
        <span class="text-caption"
          >custo {{ formatarValorDecisao(oferta.custoFinalUnitario) }}/{{ unidade }} · {{ Number(quantidade) }}
          {{ unidade }}<template v-if="total !== null"> · total {{ formatarValorDecisao(total) }}</template></span
        >
      </template>
      <span v-else class="text-caption text-medium-emphasis"
        >pedimos {{ Number(oferta.quantidadePedida) }} {{ unidade }}</span
      >
      <v-chip v-if="oferta.contrapropostaUnitario !== null" size="x-small" variant="tonal" color="info" label>
        contraproposta {{ formatarValorDecisao(oferta.contrapropostaUnitario) }}/{{ unidade }} · aguardando o fornecedor
      </v-chip>
    </div>

    <div v-if="podeAceitar" class="oferta__acao">
      <template v-if="confirmando">
        <span class="text-caption">{{
          confirmando === "reajustar"
            ? `Comprar e a referência passa a ser ${formatarValorDecisao(oferta.custoFinalUnitario)}?`
            : "Comprar por este preço só desta vez?"
        }}</span>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :loading="processando"
          data-acao="confirmar-aceite"
          @click="confirmar"
          >Confirmar</v-btn
        >
        <v-btn size="small" variant="text" :disabled="processando" @click="confirmando = null">Cancelar</v-btn>
      </template>
      <template v-else>
        <v-btn size="small" variant="tonal" color="primary" data-acao="aceitar-preco" @click="confirmando = 'so_agora'"
          >Aceitar este preço</v-btn
        >
        <v-btn
          v-if="oferta.situacao === 'com_aumento'"
          size="small"
          variant="text"
          color="primary"
          data-acao="aceitar-reajustar"
          @click="confirmando = 'reajustar'"
          >Aceitar e reajustar a referência</v-btn
        >
      </template>
    </div>

    <div v-if="podeContrapropor && !confirmando" class="oferta__acao">
      <v-text-field
        v-model="valorDigitado"
        :label="`Contraproposta (R$/${unidade})`"
        inputmode="decimal"
        density="compact"
        variant="outlined"
        hide-details
        class="oferta__valor"
        @keyup.enter="enviarContraproposta"
      />
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-swap-horizontal"
        :disabled="valor === null || processando"
        @click="enviarContraproposta"
        >Contrapropor</v-btn
      >
    </div>
  </div>
</template>

<style scoped>
.oferta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-2) 0;
  border-top: 1px dashed var(--cx-line-soft);
}

.oferta__dados {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--cx-sp-2) var(--cx-sp-3);
  min-width: 0;
}

.oferta__acao {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

.oferta__valor {
  min-width: 11rem;
  max-width: 14rem;
}
</style>
