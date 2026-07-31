<script setup lang="ts">
// Bloco Data Lanç · Data Doc. Fiscal · N° Doc. Fiscal (FOTO 2, linha 2).
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { form, hojeISO, dataDocFiscal, numeroDocFiscal } = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Linha 2: Data Lanç · Data Doc. Fiscal · N° Doc. Fiscal -->
  <div class="lc-tres">
    <label class="lc-campo">
      <span class="lc-campo-lbl">Data Lanç</span>
      <div class="lc-data-row">
        <button
          type="button"
          class="lc-pill"
          :class="{ ativo: form.dataReferencia === hojeISO }"
          @click="form.dataReferencia = hojeISO"
        >
          Hoje
        </button>
        <input v-model="form.dataReferencia" type="date" class="lc-input" />
      </div>
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">Data Doc. Fiscal</span>
      <input v-model="dataDocFiscal" type="date" class="lc-input" />
    </label>
    <label class="lc-campo">
      <span class="lc-campo-lbl">N° Doc. Fiscal</span>
      <input v-model="numeroDocFiscal" class="lc-input" placeholder="000000" />
    </label>
  </div>
</template>
