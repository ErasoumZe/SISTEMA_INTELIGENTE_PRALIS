<script setup lang="ts">
// Bloco das duas fotos: Recibo/Boleto/Nota (SUPORTADO — salva) e Nota/interno (data-pendente,
// sem upload nesta rodada). Estado vem do modal via provide/inject.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const { fotoDocumentoPreview, fotoDocumentoExistente, onFotoDocumento, fotoInternaNome, selecionarFotoInterna } =
  useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Duas fotos -->
  <div class="lc-dois">
    <label class="lc-foto">
      <span class="lc-campo-lbl">Foto (Recibo/Boleto/Nota)</span>
      <input type="file" accept="image/*,application/pdf" class="lc-file" @change="onFotoDocumento" />
      <span v-if="fotoDocumentoPreview || fotoDocumentoExistente" class="lc-foto-ok">
        <v-icon size="14">mdi-paperclip</v-icon> anexado
      </span>
    </label>
    <label class="lc-foto">
      <span class="lc-campo-lbl">Foto (Nota / interno)</span>
      <input
        type="file"
        accept="image/*,application/pdf"
        data-pendente="regra"
        class="lc-file"
        @change="selecionarFotoInterna"
      />
      <span v-if="fotoInternaNome" class="lc-foto-ok"
        ><v-icon size="14">mdi-paperclip</v-icon> {{ fotoInternaNome }}</span
      >
    </label>
  </div>
</template>
