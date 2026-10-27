<script setup lang="ts">
import { computed } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import { situacaoDaLinha } from "~/utils/transferencias-relatorio";

// A situacao UNICA de uma linha do relatorio: do malote (Disponivel, Usado...) ou, nas demais
// transferencias, o status da conferencia. Icone + palavra sempre: a cor nunca e o unico sinal, e so a
// divergencia ganha cor.
const props = defineProps<{ operacao: Pick<OperacaoResumo, "status" | "situacaoMalote"> }>();
const situacao = computed(() => situacaoDaLinha(props.operacao));
</script>

<template>
  <span class="situacao-malote" :data-situacao="situacao.chave" :data-alerta="situacao.alerta ? 'sim' : undefined">
    <v-icon :icon="situacao.icone" size="16" aria-hidden="true" />
    <span>{{ situacao.rotulo }}</span>
  </span>
</template>

<style scoped>
.situacao-malote {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-1) var(--cx-sp-2);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  line-height: 1.25;
}
.situacao-malote[data-alerta="sim"] {
  border-color: var(--cx-negative);
}
.situacao-malote[data-alerta="sim"] :deep(.v-icon) {
  color: var(--cx-negative);
}
</style>
