<script setup lang="ts">
/**
 * Painel retratil de filtros da listagem. Todos os valores viram query da API — nada e filtrado
 * no navegador, porque a tela so tem a pagina corrente na mao.
 */
import type { FiltrosDeProduto, OrdenacaoProdutos } from "@padaria/shared";
import { ORDENACOES } from "~/composables/useListagemProdutos";

defineProps<{ opcoes: FiltrosDeProduto; temFiltroOuBusca: boolean }>();
const emit = defineEmits<{ limpar: [] }>();

const status = defineModel<string | null>("status", { default: null });
const tipo = defineModel<string | null>("tipo", { default: null });
const grupo = defineModel<string | null>("grupo", { default: null });
const setor = defineModel<string | null>("setor", { default: null });
const ordenar = defineModel<OrdenacaoProdutos>("ordenar", { default: "recentes" });

const STATUS = [
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" }
];
const TIPOS = [
  { value: "revenda", label: "Revenda" },
  { value: "transformacao", label: "Transformação" }
];

/** Clicar na pilula ja marcada LIMPA o filtro — e o gesto que o app antigo tinha e funciona. */
function alternarStatus(valor: string) {
  status.value = status.value === valor ? null : valor;
}
function alternarTipo(valor: string) {
  tipo.value = tipo.value === valor ? null : valor;
}
</script>

<template>
  <div class="produto-filtros">
    <div class="produto-filtros__grupo">
      <span class="produto-filtros__rotulo">Status</span>
      <v-btn
        v-for="opcao in STATUS"
        :key="opcao.value"
        size="small"
        :variant="status === opcao.value ? 'flat' : 'outlined'"
        :color="status === opcao.value ? 'primary' : undefined"
        :aria-pressed="status === opcao.value"
        @click="alternarStatus(opcao.value)"
      >
        {{ opcao.label }}
      </v-btn>
    </div>

    <div class="produto-filtros__grupo">
      <span class="produto-filtros__rotulo">Tipo</span>
      <v-btn
        v-for="opcao in TIPOS"
        :key="opcao.value"
        size="small"
        :variant="tipo === opcao.value ? 'flat' : 'outlined'"
        :color="tipo === opcao.value ? 'primary' : undefined"
        :aria-pressed="tipo === opcao.value"
        @click="alternarTipo(opcao.value)"
      >
        {{ opcao.label }}
      </v-btn>
    </div>

    <div class="produto-filtros__selects">
      <v-select
        v-model="grupo"
        :items="opcoes.grupos"
        item-title="nome"
        item-value="id"
        label="Grupo"
        density="compact"
        hide-details
        clearable
        prepend-inner-icon="mdi-tag-outline"
      />
      <v-select
        v-model="setor"
        :items="opcoes.setores"
        label="Setor de estoque"
        density="compact"
        hide-details
        clearable
        prepend-inner-icon="mdi-warehouse"
      />
      <v-select
        v-model="ordenar"
        :items="ORDENACOES"
        item-title="label"
        item-value="value"
        label="Ordenar"
        density="compact"
        hide-details
        prepend-inner-icon="mdi-sort"
      />
      <v-btn
        v-if="temFiltroOuBusca"
        size="small"
        variant="text"
        prepend-icon="mdi-close"
        class="produto-filtros__limpar"
        @click="emit('limpar')"
      >
        Limpar
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.produto-filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-4);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.produto-filtros__grupo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}
.produto-filtros__rotulo {
  font-size: var(--cx-fs-micro);
  letter-spacing: var(--cx-tracking-wide);
  color: var(--cx-ink-soft);
  text-transform: uppercase;
}
.produto-filtros__selects {
  display: grid;
  flex: 1 1 320px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--cx-sp-3);
  align-items: center;
  min-width: 0;
}
.produto-filtros__limpar {
  justify-self: start;
}

@media (max-width: 600px) {
  .produto-filtros {
    gap: var(--cx-sp-3);
  }
  .produto-filtros__selects {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
