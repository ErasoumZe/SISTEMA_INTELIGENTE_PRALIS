<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { GRUPOS_FOLHA_CREARE, numeroDoCampoFolha, type LeituraFolhaCreare } from "~/utils/folha-creare";

// R-225 · o que a leitura tirou da folha do CREARE, compacto e editavel, com os rotulos do cupom. So aparece
// depois que a folha e anexada e lida. A comparacao com o Pralis fica no Relatorio final.
// No celular a lista comeca fechada (abre e fecha no cabecalho); o resumo mostra Periodo e Total.
const leitura = defineModel<LeituraFolhaCreare>({ required: true });
const CAMPOS = GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos);
// Numeros lidos pela IA ficam travados; so o que ela nao leu (ou marcou como duvidoso) e digitado.
const props = defineProps<{ travados?: readonly string[] }>();
const travado = (chave: string) => Boolean(props.travados?.includes(chave));
// Texto digitado que nao vira numero fica marcado (antes ia como "sem valor" em silencio).
const invalido = (chave: (typeof CAMPOS)[number]["chave"]) =>
  Boolean(leitura.value[chave].trim()) &&
  numeroDoCampoFolha(leitura.value[chave], chave === "sangria" || chave === "saldoFinalDinheiro") === null;

const aberto = ref(true);
onMounted(() => {
  aberto.value = !window.matchMedia?.("(max-width: 600px)").matches;
});
function aoAlternar(evento: Event) {
  aberto.value = (evento.target as HTMLDetailsElement).open;
}

const resumo = computed(() =>
  [
    leitura.value.periodoInicio.trim() && `Período ${leitura.value.periodoInicio.trim()}`,
    leitura.value.total.trim() && `Total R$ ${leitura.value.total.trim()}`
  ]
    .filter(Boolean)
    .join(" · ")
);
</script>

<template>
  <details class="folha-leitura" :open="aberto" data-teste="folha-creare" @toggle="aoAlternar">
    <summary class="folha-leitura__cabecalho">
      <span class="folha-leitura__titulo">
        <strong>Valores lidos da folha</strong>
        <small>{{ resumo || "Confira com o cupom." }}</small>
      </span>
      <span class="folha-leitura__alternar" aria-hidden="true">{{ aberto ? "Ocultar" : "Mostrar" }}</span>
    </summary>
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
        :readonly="travado(campo.chave)"
        :error="invalido(campo.chave)"
        :append-inner-icon="travado(campo.chave) ? 'mdi-lock-outline' : undefined"
        :data-teste="`folha-campo-${campo.chave}`"
      />
    </div>
  </details>
</template>

<style scoped>
.folha-leitura {
  padding: 12px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
}
.folha-leitura__cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  cursor: pointer;
  list-style: none;
}
.folha-leitura__cabecalho::-webkit-details-marker {
  display: none;
}
.folha-leitura__cabecalho:focus-visible {
  outline: 2px solid var(--cx-brand);
  outline-offset: 4px;
  border-radius: 8px;
}
.folha-leitura__titulo {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.folha-leitura__titulo small {
  color: var(--cx-ink-soft);
  overflow-wrap: anywhere;
}
.folha-leitura__alternar {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--cx-surface-sunken);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.folha-leitura__grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
</style>
