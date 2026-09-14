<script setup lang="ts">
// Bloco Pagamento (S/N) · Data pagamento · Data Vencimento (FOTO 2, linha 4). O toggle deriva de
// form.dataPagamento (campo suportado). Estado vem do modal via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { cat, pago, form, hojeISO } = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 4: Pagamento (S/N) · Data pagamento · Data Vencimento -->
  <div class="lc-tres lc-pagamento" :class="{ 'lc-dois': cat === 'retirada' }">
    <label class="lc-campo lc-toggle">
      <span class="lc-campo-lbl">Pagamento</span>
      <button type="button" class="lc-sn" :class="{ sim: pago }" @click="pago = !pago">
        {{ pago ? "Sim" : "Não" }}
      </button>
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Data pagamento</span>
      <!-- R-129: o navegador ja barra data anterior a hoje, antes do envio. O `min` e conveniencia;
           quem faz valer a regra e o servidor, que recusa com 400. -->
      <input v-model="form.dataPagamento" type="date" class="lc-input" :min="hojeISO" :disabled="!pago" />
    </label>
    <label v-if="cat !== 'retirada'" class="lc-campo">
      <span class="lc-campo-lbl">Data Vencimento</span>
      <input v-model="form.dataVencimento" type="date" class="lc-input" />
    </label>
  </div>
</template>
