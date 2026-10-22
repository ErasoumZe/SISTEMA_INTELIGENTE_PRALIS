<script setup lang="ts">
/**
 * Matriz de Pedidos (doc 57 §4): uma linha por fornecedor, uma coluna por situação. Cada número abre o que
 * está naquela célula. "Sem fornecedor" junta os itens que ninguém recebeu e as decisões pendentes.
 */
import {
  COLUNAS_PAINEL,
  ROTULO_COLUNA_PAINEL,
  montarMatrizCompras,
  totaisDaMatriz,
  type ColunaPainel,
  type LinhaPainel,
  type PainelComprasDto,
  type PedidoDto
} from "@padaria/shared";

const props = defineProps<{ pedidos: PedidoDto[]; painel: PainelComprasDto; carregando: boolean }>();
const emit = defineEmits<{ abrir: [linha: LinhaPainel, coluna: ColunaPainel] }>();

const fornecedorFiltro = ref<string | null>(null);
const todas = computed(() => montarMatrizCompras(props.painel, props.pedidos));
const opcoes = computed(() =>
  todas.value.map((linha) => ({ value: linha.fornecedorId ?? "", title: linha.fornecedorNome }))
);
const linhas = computed(() =>
  fornecedorFiltro.value === null
    ? todas.value
    : todas.value.filter((linha) => (linha.fornecedorId ?? "") === fornecedorFiltro.value)
);
const totais = computed(() => totaisDaMatriz(linhas.value));
const COR: Record<ColunaPainel, string> = {
  a_fazer: "warning",
  enviado: "secondary",
  cotado: "info",
  retornado: "warning",
  confirmado: "primary",
  recebido_parcial: "info",
  recebido: "success"
};
</script>

<template>
  <v-card class="matriz" data-secao="matriz-pedidos">
    <v-card-title class="matriz__topo">
      <div>
        <h2 class="matriz__titulo">Pedidos por fornecedor</h2>
        <p class="matriz__subtitulo">Toque num número para ver os pedidos daquela situação.</p>
      </div>
      <v-autocomplete
        v-model="fornecedorFiltro"
        :items="opcoes"
        label="Fornecedor"
        placeholder="Todos"
        clearable
        density="compact"
        hide-details
        class="matriz__filtro"
        data-campo="filtro-fornecedor"
      />
    </v-card-title>
    <v-progress-linear v-if="carregando" indeterminate />
    <div v-if="!linhas.length && !carregando" class="matriz__vazio">
      <v-icon icon="mdi-inbox-outline" size="32" />
      <p>Nenhum pedido em andamento. O agendamento e o Pedido rápido abrem as cotações.</p>
    </div>
    <div v-else class="matriz__rolagem">
      <table class="matriz__tabela">
        <thead>
          <tr>
            <th scope="col" class="matriz__fornecedor">Fornecedor</th>
            <th v-for="coluna in COLUNAS_PAINEL" :key="coluna" scope="col">{{ ROTULO_COLUNA_PAINEL[coluna] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in linhas" :key="linha.fornecedorId ?? 'sem'" :data-fornecedor="linha.fornecedorNome">
            <th scope="row" class="matriz__fornecedor" :class="{ 'matriz__fornecedor--sem': !linha.fornecedorId }">
              {{ linha.fornecedorNome }}
            </th>
            <td v-for="coluna in COLUNAS_PAINEL" :key="coluna">
              <v-btn
                v-if="linha.celulas[coluna]"
                size="small"
                variant="tonal"
                :color="COR[coluna]"
                class="matriz__numero"
                :aria-label="`${linha.fornecedorNome}: ${linha.celulas[coluna]} em ${ROTULO_COLUNA_PAINEL[coluna]}`"
                :data-celula="coluna"
                @click="emit('abrir', linha, coluna)"
                >{{ linha.celulas[coluna] }}</v-btn
              >
              <span v-else class="matriz__zero" aria-hidden="true">·</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="matriz__fornecedor">Total</th>
            <td v-for="coluna in COLUNAS_PAINEL" :key="coluna" class="matriz__total">{{ totais[coluna] }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </v-card>
</template>

<style scoped>
.matriz {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
}

.matriz__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-6);
  white-space: normal;
}

.matriz__titulo {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
}

.matriz__subtitulo {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.matriz__filtro {
  flex: 0 1 280px;
  min-width: 200px;
}

/* A tabela rola dentro do cartão no celular; a página nunca rola na horizontal. */
.matriz__rolagem {
  overflow-x: auto;
  border-top: 1px solid var(--cx-line-soft);
}

.matriz__tabela {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.matriz__tabela th,
.matriz__tabela td {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-bottom: 1px solid var(--cx-line-soft);
  text-align: center;
}

.matriz__tabela thead th {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.matriz__fornecedor {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 160px;
  background: var(--cx-surface-raised);
  text-align: left !important;
  font-weight: 600;
}

.matriz__fornecedor--sem {
  color: rgb(var(--v-theme-warning));
}

.matriz__numero {
  min-width: 44px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.matriz__zero {
  color: var(--cx-line);
}

.matriz__total {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.matriz__vazio {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-8) var(--cx-sp-6);
  color: var(--cx-ink-soft);
  text-align: center;
}
</style>
