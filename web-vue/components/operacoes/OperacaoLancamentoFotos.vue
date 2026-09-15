<script setup lang="ts">
// Bloco das duas fotos persistidas do lançamento.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const {
  fotoDocumentoPreview,
  fotoDocumentoExistente,
  onFotoDocumento,
  fotoNotaPreview,
  fotoNotaExistente,
  onFotoNota
} = useOperacaoLancamentoBloco();
</script>

<template>
  <!-- Duas fotos -->
  <div class="lc-dois">
    <label class="lc-foto">
      <span class="lc-campo-lbl">Foto (Recibo/Boleto/Nota)</span>
      <input
        type="file"
        accept="image/*,application/pdf,.xml,application/xml,text/xml"
        class="lc-file"
        @change="onFotoDocumento"
      />
      <span v-if="fotoDocumentoPreview || fotoDocumentoExistente" class="lc-foto-ok">
        <v-icon size="14">mdi-paperclip</v-icon> anexado
      </span>
    </label>
    <label class="lc-foto">
      <span class="lc-campo-lbl">Foto (Nota / interno)</span>
      <input
        type="file"
        accept="image/*,application/pdf,.xml,application/xml,text/xml"
        class="lc-file"
        @change="onFotoNota"
      />
      <span v-if="fotoNotaPreview || fotoNotaExistente" class="lc-foto-ok">
        <v-icon size="14">mdi-paperclip</v-icon> anexado
      </span>
    </label>
  </div>
</template>
