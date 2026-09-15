<script setup lang="ts">
import { computed } from "vue";
import type { CampanhaComProgresso } from "@padaria/shared/campanhas";
import { dinheiro } from "~/utils/domain";

// Um so lugar desenha o progresso: a tela de Campanhas e o bloco do Fechamento usam este componente.
// Duas barras diferentes para o mesmo numero seria a duplicidade que o AGENTS.md proibe — e, pior,
// com dinheiro na tela, duas leituras do mesmo valor viram desconfianca do operador.
const props = defineProps<{ campanha: CampanhaComProgresso; compacto?: boolean }>();

// A barra para em 100 para nao estourar o desenho, mas o NUMERO ao lado mostra o real. Truncar o
// texto tambem esconderia exatamente o resultado que a campanha existe para comemorar.
const larguraDaBarra = computed(() => Math.min(100, Math.max(0, props.campanha.percentualDaMeta)));
const bateu = computed(() => props.campanha.percentualDaMeta >= 100);
</script>

<template>
  <div class="campanha-progresso" :class="{ 'campanha-progresso--compacto': compacto }">
    <div class="campanha-progresso__numeros">
      <strong>{{ dinheiro(campanha.totalVendido) }}</strong>
      <span>de {{ dinheiro(campanha.metaValor) }}</span>
      <span class="campanha-progresso__percentual" :class="{ bateu }">
        {{ campanha.percentualDaMeta.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) }}%
      </span>
    </div>

    <div
      class="campanha-progresso__trilho"
      role="progressbar"
      :aria-valuenow="larguraDaBarra"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`Progresso da campanha ${campanha.titulo}`"
    >
      <div class="campanha-progresso__barra" :class="{ bateu }" :style="{ width: `${larguraDaBarra}%` }" />
    </div>

    <p v-if="campanha.naoAtribuido > 0" class="campanha-progresso__orfas">
      {{ dinheiro(campanha.naoAtribuido) }} em vendas sem PDV identificado no período. Aparecem aqui para conferência e
      <strong>não entram</strong> na meta.
    </p>
  </div>
</template>

<style scoped>
.campanha-progresso {
  display: grid;
  gap: 6px;
  margin: 12px 0 0;
}

.campanha-progresso__numeros {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.campanha-progresso__numeros strong {
  font-size: 1.15rem;
}

.campanha-progresso__numeros span {
  font-size: 0.85rem;
  color: var(--cx-ink-soft);
}

.campanha-progresso__percentual {
  margin-left: auto;
  font-weight: 700;
}

.campanha-progresso__percentual.bateu {
  color: var(--cx-positive);
}

.campanha-progresso__trilho {
  height: 8px;
  border-radius: 999px;
  background: var(--cx-line);
  overflow: hidden;
}

.campanha-progresso__barra {
  height: 100%;
  border-radius: 999px;
  background: var(--cx-brand);
  transition: width 320ms cubic-bezier(0.2, 0, 0, 1);
}

.campanha-progresso__barra.bateu {
  background: var(--cx-positive);
}

.campanha-progresso__orfas {
  margin: 4px 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--cx-ink-soft);
}

.campanha-progresso--compacto .campanha-progresso__numeros strong {
  font-size: 1rem;
}

@media (prefers-reduced-motion: reduce) {
  .campanha-progresso__barra {
    transition: none;
  }
}
</style>
