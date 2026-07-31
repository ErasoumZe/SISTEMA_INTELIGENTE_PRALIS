<script setup lang="ts">
import { chipStatusMalote } from "~/utils/malote";

const props = withDefaults(
  defineProps<{
    titulo: string;
    descricao: string;
    colunas: string[];
    linhas: Array<Record<string, string | undefined>>;
    acao: string;
    acaoCarregando?: boolean;
    editarCarregandoId?: string;
    podeAdicionar?: boolean;
    podeImportar?: boolean;
    podeEditar?: boolean;
    podeExportar?: boolean;
    podeExcluir?: boolean;
    excluindoId?: string;
    modoServidor?: boolean;
    busca?: string;
    tipoPermissaoFiltro?: string;
    alvoFiltro?: string;
    permissaoFiltro?: string;
    alvosFiltro?: Array<{ id: string; nome?: string }>;
    permissoesFiltro?: string[];
    carregandoBusca?: boolean;
    buscou?: boolean;
    totalServidor?: number;
    paginaServidor?: number;
    itensPorPaginaServidor?: number;
    acoesExtras?: Array<{
      label: string;
      event: string;
      condicao?: (linha: Record<string, string | undefined>) => boolean;
    }>;
  }>(),
  {
    acaoCarregando: false,
    editarCarregandoId: "",
    podeAdicionar: true,
    podeImportar: false,
    podeEditar: false,
    podeExportar: false,
    podeExcluir: false,
    excluindoId: "",
    modoServidor: false,
    busca: "",
    tipoPermissaoFiltro: "",
    alvoFiltro: "",
    permissaoFiltro: "",
    alvosFiltro: () => [],
    permissoesFiltro: () => [],
    carregandoBusca: false,
    buscou: false,
    totalServidor: 0,
    paginaServidor: 1,
    itensPorPaginaServidor: 10,
    acoesExtras: () => []
  }
);

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "importar"): void;
  (event: "editar", linha: Record<string, string | undefined>): void;
  (event: "exportar", linha: Record<string, string | undefined>): void;
  (event: "excluir", linha: Record<string, string | undefined>): void;
  (event: "extra", payload: { event: string; linha: Record<string, string | undefined> }): void;
  (event: "buscar"): void;
  (event: "limpar"): void;
  (event: "update:busca", valor: string): void;
  (event: "update:tipoPermissaoFiltro", valor: string): void;
  (event: "update:alvoFiltro", valor: string): void;
  (event: "update:permissaoFiltro", valor: string): void;
  (event: "update:paginaServidor", pagina: number): void;
}>();

const pagina = ref(1);
const itensPorPagina = 10;
const totalItens = computed(() => (props.modoServidor ? props.totalServidor : props.linhas.length));
const paginaAtual = computed(() => (props.modoServidor ? props.paginaServidor : pagina.value));
const itensPagina = computed(() => (props.modoServidor ? props.itensPorPaginaServidor : itensPorPagina));
const totalPaginas = computed(() => Math.max(1, Math.ceil(totalItens.value / itensPagina.value)));
const linhasPaginadas = computed(() =>
  props.modoServidor
    ? props.linhas
    : props.linhas.slice((pagina.value - 1) * itensPorPagina, pagina.value * itensPorPagina)
);
const inicio = computed(() => (totalItens.value ? (paginaAtual.value - 1) * itensPagina.value + 1 : 0));
const fim = computed(() => Math.min(paginaAtual.value * itensPagina.value, totalItens.value));
const temAcoes = computed(
  () => props.podeEditar || props.podeExportar || props.podeExcluir || props.acoesExtras.length
);

watch(totalPaginas, (total) => {
  if (!props.modoServidor && pagina.value > total) pagina.value = total;
});

function chaveColuna(coluna: string) {
  return coluna
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(" ", "_");
}

function valorLinha(linha: Record<string, string | undefined>, coluna: string) {
  return linha[chaveColuna(coluna)] || "-";
}

function paginaAnterior() {
  const proxima = Math.max(1, paginaAtual.value - 1);
  if (props.modoServidor) emit("update:paginaServidor", proxima);
  else pagina.value = proxima;
}

function proximaPagina() {
  const proxima = Math.min(totalPaginas.value, paginaAtual.value + 1);
  if (props.modoServidor) emit("update:paginaServidor", proxima);
  else pagina.value = proxima;
}
</script>

<template>
  <v-card>
    <v-card-title class="cadastro-card-title d-flex align-center justify-space-between ga-3">
      <div>
        <div class="text-h6">{{ titulo }}</div>
        <div class="text-body-2 text-muted">{{ descricao }}</div>
      </div>
      <div class="cadastro-card-actions d-flex ga-2">
        <v-btn v-if="podeImportar" size="small" variant="outlined" :disabled="acaoCarregando" @click="emit('importar')"
          >Importar</v-btn
        >
        <v-btn
          v-if="podeAdicionar"
          size="small"
          color="primary"
          prepend-icon="mdi-plus"
          :loading="acaoCarregando"
          @click="emit('acionar')"
        >
          {{ acao }}
        </v-btn>
      </div>
    </v-card-title>

    <v-card-text>
      <div v-if="modoServidor" class="cadastro-filter-grid mb-4">
        <v-text-field
          :model-value="busca"
          label="Busca"
          density="compact"
          hide-details
          clearable
          @update:model-value="emit('update:busca', String($event || ''))"
        />
        <v-select
          :model-value="tipoPermissaoFiltro"
          :items="[
            { title: 'Cargo', value: 'cargo' },
            { title: 'Setor', value: 'setor' },
            { title: 'Usuário', value: 'usuario' }
          ]"
          label="Tipo"
          density="compact"
          hide-details
          clearable
          @update:model-value="emit('update:tipoPermissaoFiltro', String($event || ''))"
        />
        <v-select
          :model-value="permissaoFiltro"
          :items="permissoesFiltro"
          label="Permissão"
          density="compact"
          hide-details
          clearable
          @update:model-value="emit('update:permissaoFiltro', String($event || ''))"
        />
        <div class="cadastro-filter-actions">
          <v-btn color="primary" prepend-icon="mdi-magnify" :loading="carregandoBusca" @click="emit('buscar')">
            Buscar
          </v-btn>
          <v-btn variant="outlined" :disabled="carregandoBusca" @click="emit('limpar')">Limpar filtros</v-btn>
        </div>
      </div>

      <div class="responsive-table-shell">
        <v-table>
          <thead>
            <tr>
              <th v-for="coluna in colunas" :key="coluna">{{ coluna }}</th>
              <th v-if="temAcoes" class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhasPaginadas" :key="linha.id ?? JSON.stringify(linha)">
              <td v-for="coluna in colunas" :key="coluna">
                <span v-if="chaveColuna(coluna) === 'lacre'" class="malote-lacre-badge">{{
                  valorLinha(linha, coluna)
                }}</span>
                <v-chip
                  v-else-if="chaveColuna(coluna) === 'status' && chipStatusMalote(linha.status)"
                  :color="chipStatusMalote(linha.status)!.cor"
                  size="small"
                  variant="tonal"
                  label
                  >{{ chipStatusMalote(linha.status)!.label }}</v-chip
                >
                <template v-else>{{ valorLinha(linha, coluna) }}</template>
              </td>
              <td v-if="temAcoes" class="text-right">
                <div class="row-actions d-flex justify-end ga-1">
                  <v-btn
                    v-for="acaoExtra in acoesExtras.filter((acao) => !acao.condicao || acao.condicao(linha))"
                    :key="acaoExtra.event"
                    size="small"
                    variant="text"
                    @click="emit('extra', { event: acaoExtra.event, linha })"
                  >
                    {{ acaoExtra.label }}
                  </v-btn>
                  <v-btn v-if="podeExportar" size="small" variant="text" @click="emit('exportar', linha)"
                    >Exportar</v-btn
                  >
                  <v-btn
                    v-if="podeEditar"
                    size="small"
                    variant="text"
                    :loading="editarCarregandoId === linha.id"
                    @click="emit('editar', linha)"
                    >Editar</v-btn
                  >
                  <v-btn
                    v-if="podeExcluir"
                    size="small"
                    variant="text"
                    color="error"
                    :loading="excluindoId === linha.id"
                    @click="emit('excluir', linha)"
                    >Excluir</v-btn
                  >
                </div>
              </td>
            </tr>
            <tr v-if="!linhasPaginadas.length">
              <td :colspan="colunas.length + (temAcoes ? 1 : 0)" class="text-center text-muted py-8">
                {{ modoServidor && !buscou ? "Informe os filtros e clique em Buscar." : "Nenhum registro cadastrado." }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <div
        v-if="totalItens > itensPagina"
        class="mt-4 d-flex flex-column flex-sm-row align-center justify-space-between ga-3 text-body-2 text-muted"
      >
        <span>Mostrando {{ inicio }}-{{ fim }} de {{ totalItens }}</span>
        <div class="pagination-actions d-flex align-center ga-2">
          <v-btn
            size="small"
            variant="outlined"
            prepend-icon="mdi-chevron-left"
            :disabled="paginaAtual === 1 || carregandoBusca"
            @click="paginaAnterior"
            >Anterior</v-btn
          >
          <span class="font-weight-bold">{{ paginaAtual }} / {{ totalPaginas }}</span>
          <v-btn
            size="small"
            variant="outlined"
            append-icon="mdi-chevron-right"
            :disabled="paginaAtual === totalPaginas || carregandoBusca"
            @click="proximaPagina"
            >Próxima</v-btn
          >
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
/* Malote = lacre (D3): numero do lacre em destaque como badge laranja (token de categoria V1). */
.malote-lacre-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-strong, #9a3412);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.2px;
}
</style>
