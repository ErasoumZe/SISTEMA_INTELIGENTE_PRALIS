<script setup lang="ts">
// Bloco Recorrência (data-pendente="regra"): número de repetições, frequência e dias da semana —
// estado LOCAL, nunca enviado nesta rodada. Estado vem do modal via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { recorrenciaAberta, recorrenciaNumero, recorrenciaFrequencia, FREQUENCIAS, DIAS, recorrenciaDias } =
  useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Bloco Recorrência (data-pendente) -->
  <button type="button" class="lc-linha lc-linha-top" @click="recorrenciaAberta = !recorrenciaAberta">
    <v-icon size="17">mdi-repeat</v-icon> Recorrência
    <span class="lc-flex" />
    <v-icon size="16">{{ recorrenciaAberta ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
  </button>
  <div v-if="recorrenciaAberta" class="lc-recorrencia" data-pendente="regra">
    <div class="lc-dois">
      <label class="lc-campo">
        <span class="lc-campo-lbl">Número de repetições</span>
        <input v-model="recorrenciaNumero" type="number" min="1" data-pendente="regra" class="lc-input" />
      </label>
      <label class="lc-campo">
        <span class="lc-campo-lbl">Frequência</span>
        <select v-model="recorrenciaFrequencia" data-pendente="regra" class="lc-input">
          <option v-for="f in FREQUENCIAS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
    </div>
    <span class="lc-campo-lbl">Dias</span>
    <div class="lc-dias">
      <button
        v-for="(dia, i) in DIAS"
        :key="dia"
        type="button"
        class="lc-dia"
        :class="{ ativo: recorrenciaDias[i] }"
        data-pendente="regra"
        @click="recorrenciaDias[i] = !recorrenciaDias[i]"
      >
        {{ dia }}
      </button>
    </div>
  </div>
</template>
