<script setup lang="ts">
import { GRUPOS_FOLHA_CREARE, type LeituraFolhaCreare } from "~/utils/folha-creare";

// R-225 · o que a leitura tirou da folha do CREARE, compacto e editavel, com os rotulos do cupom. So aparece
// depois que a folha e anexada e lida. A comparacao com o Pralis fica no Relatorio final.
const leitura = defineModel<LeituraFolhaCreare>({ required: true });
const CAMPOS = GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos);
</script>

<template>
  <section class="folha-leitura" aria-labelledby="folha-leitura-titulo" data-teste="folha-creare">
    <header>
      <strong id="folha-leitura-titulo">Valores lidos da folha</strong>
      <small>Confira com o cupom e corrija se precisar.</small>
    </header>
    <div class="folha-leitura__grade">
      <v-text-field
        v-model="leitura.periodoInicio"
        label="Período de"
        placeholder="26/10/2026 06:14:58"
        density="compact"
        hide-details
        data-teste="folha-campo-periodoInicio"
      />
      <v-text-field
        v-model="leitura.dataEmissao"
        label="Data da emissão"
        placeholder="26/10/2026 13:58:46"
        density="compact"
        hide-details
        data-teste="folha-campo-dataEmissao"
      />
      <v-text-field
        v-for="campo in CAMPOS"
        :key="campo.chave"
        v-model="leitura[campo.chave]"
        :label="campo.rotulo"
        :prefix="campo.negativo ? '-R$' : 'R$'"
        inputmode="decimal"
        density="compact"
        hide-details
        :data-teste="`folha-campo-${campo.chave}`"
      />
    </div>
  </section>
</template>

<style scoped>
.folha-leitura {
  display: grid;
  gap: var(--cx-sp-2);
  padding: 12px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
}
.folha-leitura header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.folha-leitura header small {
  color: var(--cx-ink-soft);
}
.folha-leitura__grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
}
</style>
