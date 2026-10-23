<script setup lang="ts">
import { ROTULO_RANKING_CONFERENCIA, type ConferenciaResumoDto } from "@padaria/shared";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import ComprasSituacao from "~/components/compras/base/ComprasSituacao.vue";
import ComprasVazio from "~/components/compras/base/ComprasVazio.vue";
import type { TomSituacao } from "~/utils/compras-visual";

// Conferências a fazer e feitas (doc 57 §1). Cada uma abre a contagem.
const props = defineProps<{ conferencias: ConferenciaResumoDto[]; carregando: boolean }>();
const emit = defineEmits<{ abrir: [conferencia: ConferenciaResumoDto] }>();

const aba = ref<"fazer" | "feitas">("fazer");
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const aFazer = computed(() =>
  props.conferencias.filter((item) => item.status === "agendada").sort((a, b) => a.data.localeCompare(b.data))
);
const feitas = computed(() => props.conferencias.filter((item) => item.status !== "agendada"));
const lista = computed(() => (aba.value === "fazer" ? aFazer.value : feitas.value));

function tom(item: ConferenciaResumoDto): TomSituacao {
  if (item.status === "concluida") return "positivo";
  return item.contados ? "info" : "neutro";
}

function recorte(item: ConferenciaResumoDto) {
  return (
    [
      item.grupo,
      item.ranking ? ROTULO_RANKING_CONFERENCIA[item.ranking] : null,
      item.areaEstoque,
      item.localEstoque,
      item.localVenda
    ]
      .filter(Boolean)
      .join(" · ") || "Todo o estoque"
  );
}
</script>

<template>
  <ComprasSecao titulo="Conferências" rente data-secao="conferencias">
    <template #acoes>
      <v-btn-toggle v-model="aba" mandatory density="compact" color="primary" variant="outlined" divided>
        <v-btn value="fazer" size="small">A fazer ({{ aFazer.length }})</v-btn>
        <v-btn value="feitas" size="small">Feitas ({{ feitas.length }})</v-btn>
      </v-btn-toggle>
    </template>
    <v-progress-linear v-if="carregando" indeterminate height="2" />
    <ComprasVazio
      v-if="!carregando && !lista.length"
      icone="mdi-clipboard-check-outline"
      :titulo="aba === 'fazer' ? 'Nenhuma conferência para fazer.' : 'Nenhuma conferência concluída ainda.'"
      :texto="
        aba === 'fazer' ? 'As conferências agendadas aparecem aqui na data, e o sino avisa quem conta.' : undefined
      "
    />
    <ul v-else class="lista">
      <li v-for="item in lista" :key="item.id">
        <button type="button" class="conferencia" :data-conferencia="item.id" @click="emit('abrir', item)">
          <span class="conferencia__texto">
            <strong>{{ recorte(item) }}</strong>
            <span class="conferencia__sub"
              >{{ DATA_HORA.format(new Date(item.data)) }} · {{ item.responsavelNome ?? "Sem responsável" }}</span
            >
          </span>
          <ComprasSituacao :rotulo="`${item.contados}/${item.totalItens} contados`" :tom="tom(item)" />
          <v-icon icon="mdi-chevron-right" size="18" class="conferencia__seta" />
        </button>
      </li>
    </ul>
  </ComprasSecao>
</template>

<style scoped>
.lista {
  margin: 0;
  padding: 0;
  list-style: none;
}

.conferencia {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--cx-sp-3);
  width: 100%;
  padding: var(--cx-sp-3) var(--cx-sp-4) var(--cx-sp-3) var(--cx-sp-5);
  border: 0;
  border-top: 1px solid var(--cx-line-soft);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--cx-dur-1) var(--cx-ease);
}

.conferencia:hover {
  background: var(--cx-hover);
}

.conferencia:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: -2px;
}

.conferencia__texto {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.conferencia__sub {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.conferencia__seta {
  color: var(--cx-ink-soft);
}

@media (max-width: 599px) {
  .conferencia {
    grid-template-columns: minmax(0, 1fr) auto;
    padding-left: var(--cx-sp-4);
  }

  .conferencia__seta {
    display: none;
  }
}
</style>
