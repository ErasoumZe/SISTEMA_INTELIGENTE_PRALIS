<script setup lang="ts">
import { computed } from "vue";
import type { ProcessoDetalheDto } from "@padaria/shared";
import { etapasDoProcesso } from "~/utils/admissao-etapas";

const props = defineProps<{
  processo: ProcessoDetalheDto;
  podeRevisarFicha: boolean;
  efetivavel: boolean;
}>();

const etapas = computed(() =>
  etapasDoProcesso({
    efetivado: props.processo.efetivado,
    fichaSituacao: props.processo.fichaSituacao,
    internos: props.processo.internos,
    podeRevisarFicha: props.podeRevisarFicha,
    efetivavel: props.efetivavel
  })
);
</script>

<template>
  <nav class="admissao-etapas" aria-label="Etapas do processo de admissão">
    <ol class="admissao-etapas__lista">
      <li
        v-for="(etapa, indice) in etapas"
        :key="etapa.id"
        class="admissao-etapas__item"
        :class="`admissao-etapas__item--${etapa.estado}`"
      >
        <span class="admissao-etapas__numero" aria-hidden="true">
          <v-icon v-if="etapa.estado === 'concluida'" icon="mdi-check" size="16" />
          <span v-else>{{ indice + 1 }}</span>
        </span>
        <span class="admissao-etapas__texto">
          <strong>{{ etapa.titulo }}</strong>
          <small>{{ etapa.descricao }}</small>
        </span>
        <span class="admissao-etapas__estado">
          {{ etapa.estado === "concluida" ? "Concluída" : etapa.estado === "atual" ? "Atual" : "Pendente" }}
        </span>
      </li>
    </ol>
    <p class="admissao-etapas__nota">
      A sequência orienta o trabalho do DP. As permissões e validações continuam sendo aplicadas pelo servidor.
    </p>
  </nav>
</template>

<style scoped>
.admissao-etapas {
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}

.admissao-etapas__lista {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--cx-sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.admissao-etapas__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-raised);
}

.admissao-etapas__item--atual {
  border-color: var(--cx-brand);
  background: color-mix(in srgb, var(--cx-brand) 10%, var(--cx-surface-raised));
}

.admissao-etapas__numero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--cx-line);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}

.admissao-etapas__item--concluida .admissao-etapas__numero {
  background: var(--cx-positive);
  color: #ffffff;
}

.admissao-etapas__item--atual .admissao-etapas__numero {
  background: var(--cx-brand);
  color: var(--cx-brand-on);
}

.admissao-etapas__texto {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.admissao-etapas__texto strong,
.admissao-etapas__texto small {
  overflow-wrap: anywhere;
}

.admissao-etapas__texto strong {
  font-size: var(--cx-fs-caption);
}

.admissao-etapas__texto small,
.admissao-etapas__estado,
.admissao-etapas__nota {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
}

.admissao-etapas__estado {
  grid-column: 2;
  justify-self: start;
  font-weight: 600;
}

.admissao-etapas__item--atual .admissao-etapas__estado {
  color: var(--cx-brand-text);
}

.admissao-etapas__item--concluida .admissao-etapas__estado {
  color: var(--cx-positive);
}

.admissao-etapas__nota {
  margin: var(--cx-sp-3) 0 0;
}

@media (max-width: 900px) {
  .admissao-etapas__lista {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .admissao-etapas__lista {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
