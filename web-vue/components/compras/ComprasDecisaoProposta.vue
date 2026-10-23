<script setup lang="ts">
/**
 * Uma proposta de fornecedor dentro da fila de decisão. Com a rodada ABERTA o comprador contrapropõe
 * (E7); com ela FECHADA aprova a exceção (E6) — nunca os dois ao mesmo tempo, porque a exceção trava
 * o item contra uma oferta melhor que ainda poderia chegar.
 */
import type { DecisaoPropostaDto } from "@padaria/shared";
import { formatarValorDecisao, lerValorDigitado, podeAprovarProposta, totalDaProposta } from "~/utils/decisao-compras";

const props = defineProps<{
  proposta: DecisaoPropostaDto;
  quantidade: string;
  rodadaItemId: string;
  rodadaAberta: boolean;
  rodadaFechada: boolean;
  podeEditar: boolean;
  podeExcecao: boolean;
  processando: boolean;
}>();
const emit = defineEmits<{
  aprovar: [propostaItemId: string];
  contrapropor: [conviteId: string, rodadaItemId: string, valor: number];
}>();

const confirmando = ref(false);
const valorDigitado = ref("");
const valor = computed(() => lerValorDigitado(valorDigitado.value));
const podeContrapropor = computed(() => props.rodadaAberta && props.podeEditar && !props.proposta.indisponivel);
const podeAprovar = computed(() => props.rodadaFechada && props.podeExcecao && podeAprovarProposta(props.proposta));

function enviarContraproposta() {
  if (valor.value === null) return;
  emit("contrapropor", props.proposta.conviteId, props.rodadaItemId, valor.value);
  valorDigitado.value = "";
}

function confirmar() {
  emit("aprovar", props.proposta.propostaItemId);
  confirmando.value = false;
}
</script>

<template>
  <div class="proposta">
    <div class="proposta__dados">
      <span class="font-weight-medium">{{ proposta.fornecedorNome }}</span>
      <span v-if="proposta.indisponivel" class="text-caption text-medium-emphasis">não tem o item</span>
      <template v-else>
        <span class="text-caption"
          >custo {{ formatarValorDecisao(proposta.custoFinalUnitario) }}/un
          <template v-if="totalDaProposta(proposta, quantidade) !== null"
            >· total {{ formatarValorDecisao(totalDaProposta(proposta, quantidade)) }}</template
          ></span
        >
        <span v-if="Number(proposta.freteRateado) > 0" class="text-caption text-medium-emphasis"
          >frete rateado {{ formatarValorDecisao(proposta.freteRateado) }}</span
        >
      </template>
      <v-chip v-if="proposta.contrapropostaUnitario !== null" size="x-small" variant="tonal" color="info" label>
        contraproposta {{ formatarValorDecisao(proposta.contrapropostaUnitario) }}/un · aguardando o fornecedor
      </v-chip>
    </div>

    <div v-if="podeContrapropor" class="proposta__acao">
      <v-text-field
        v-model="valorDigitado"
        label="Contraproposta (R$/un)"
        inputmode="decimal"
        density="compact"
        variant="outlined"
        hide-details
        class="proposta__valor"
        @keyup.enter="enviarContraproposta"
      />
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-swap-horizontal"
        :disabled="valor === null || processando"
        :loading="processando"
        @click="enviarContraproposta"
        >Contrapropor</v-btn
      >
    </div>

    <div v-else-if="podeAprovar" class="proposta__acao">
      <template v-if="confirmando">
        <span class="text-caption">Confirmar compra?</span>
        <v-btn size="small" color="primary" variant="flat" :loading="processando" @click="confirmar">Confirmar</v-btn>
        <v-btn size="small" variant="text" :disabled="processando" @click="confirmando = false">Cancelar</v-btn>
      </template>
      <v-btn v-else size="small" variant="tonal" color="primary" prepend-icon="mdi-check" @click="confirmando = true"
        >Aprovar compra</v-btn
      >
    </div>
  </div>
</template>

<style scoped>
.proposta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding-top: var(--cx-sp-2);
  border-top: 1px dashed var(--cx-line-soft);
}

.proposta__dados {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--cx-sp-2) var(--cx-sp-3);
  min-width: 0;
}

.proposta__acao {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}

.proposta__valor {
  min-width: 11rem;
  max-width: 14rem;
}
</style>
