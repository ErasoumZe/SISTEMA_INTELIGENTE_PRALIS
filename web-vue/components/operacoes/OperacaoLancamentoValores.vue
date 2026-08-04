<script setup lang="ts">
// Bloco Valor · Juros · Valor Total (FOTO 2, linha 1). Estado vem do modal via provide/inject.
import { dinheiro } from "~/utils/domain";
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";
// Import EXPLICITO: com pathPrefix, o auto-import chamaria este componente de `ComumCampoDinheiro`,
// e usar <CampoDinheiro> sem importar deixaria o campo NAO RESOLVIDO — some da tela sem erro.
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";

const { form, valorTotalOperacao } = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 1: Valor · Juros · Valor Total -->
  <div class="lc-hero">
    <span class="lc-cifra">R$</span>
    <CampoDinheiro v-model="form.valorOriginal" class="lc-valor" />
  </div>
  <div class="lc-tres">
    <label class="lc-campo">
      <span class="lc-campo-lbl">Juros</span>
      <!-- Juros e `scale 4` no banco e pode ser R$ OU percentual (R-041): `casas="4"` preserva o que
           a pessoa digitou; o minimo de 2 casas continua valendo. -->
      <CampoDinheiro v-model="form.valorAcrescimo" :casas="4" class="lc-input" />
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Valor Total</span>
      <input :value="dinheiro(valorTotalOperacao)" class="lc-input lc-input-ro" readonly />
    </label>
  </div>
</template>
