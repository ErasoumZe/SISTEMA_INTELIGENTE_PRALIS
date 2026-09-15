<script setup lang="ts">
// Bloco Pagamento (S/N) · Data pagamento · Data Vencimento (FOTO 2, linha 4). O toggle deriva de
// form.dataPagamento (campo suportado). Estado vem do modal via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { cat, pago, form, limiteMinDataPagamento, limiteMaxDataPagamento, restringeDataPagamentoAoHoje } =
  useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 4: Pagamento (S/N) · Data pagamento · Data Vencimento -->
  <div v-if="cat !== 'retirada'" class="lc-tres lc-pagamento">
    <label class="lc-campo lc-toggle">
      <span class="lc-campo-lbl">Pagamento</span>
      <button type="button" class="lc-sn" :class="{ sim: pago }" @click="pago = !pago">
        {{ pago ? "Sim" : "Não" }}
      </button>
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Data pagamento</span>
      <input
        v-model="form.dataPagamento"
        type="date"
        class="lc-input"
        :min="limiteMinDataPagamento"
        :max="limiteMaxDataPagamento"
        :disabled="!pago"
      />
      <small v-if="restringeDataPagamentoAoHoje" class="lc-pagamento-regra">
        Caixa registra pagamento somente na data de hoje.
      </small>
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Data Vencimento</span>
      <input v-model="form.dataVencimento" type="date" class="lc-input" />
    </label>
  </div>
</template>
