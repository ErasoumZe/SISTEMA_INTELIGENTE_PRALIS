<script setup lang="ts">
// Bloco Valor · Juros · Valor Total (FOTO 2, linha 1). Estado vem do modal via provide/inject.
import { dinheiro } from "~/utils/domain";
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { form, valorTotalOperacao } = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 1: Valor · Juros · Valor Total -->
  <div class="lc-hero">
    <span class="lc-cifra">R$</span>
    <input v-model="form.valorOriginal" class="lc-valor" type="number" inputmode="decimal" placeholder="0,00" />
  </div>
  <div class="lc-tres">
    <label class="lc-campo">
      <span class="lc-campo-lbl">Juros</span>
      <input v-model="form.valorAcrescimo" type="number" class="lc-input" placeholder="R$ 0,00" />
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Valor Total</span>
      <input :value="dinheiro(valorTotalOperacao)" class="lc-input lc-input-ro" readonly />
    </label>
  </div>
</template>
