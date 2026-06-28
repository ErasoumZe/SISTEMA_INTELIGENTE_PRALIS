<script setup lang="ts">
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
    acoesExtras?: Array<{ label: string; event: string }>;
  }>(),
  {
    acaoCarregando: false,
    editarCarregandoId: "",
    podeAdicionar: true,
    podeImportar: false,
    podeEditar: false,
    podeExportar: false,
    acoesExtras: () => []
  }
);

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "importar"): void;
  (event: "editar", linha: Record<string, string | undefined>): void;
  (event: "exportar", linha: Record<string, string | undefined>): void;
  (event: "extra", payload: { event: string; linha: Record<string, string | undefined> }): void;
}>();

const pagina = ref(1);
const itensPorPagina = 10;
const totalPaginas = computed(() => Math.max(1, Math.ceil(props.linhas.length / itensPorPagina)));
const linhasPaginadas = computed(() =>
  props.linhas.slice((pagina.value - 1) * itensPorPagina, pagina.value * itensPorPagina)
);
const inicio = computed(() => (props.linhas.length ? (pagina.value - 1) * itensPorPagina + 1 : 0));
const fim = computed(() => Math.min(pagina.value * itensPorPagina, props.linhas.length));

watch(totalPaginas, (total) => {
  if (pagina.value > total) pagina.value = total;
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
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between ga-3">
      <div>
        <div class="text-h6">{{ titulo }}</div>
        <div class="text-body-2 text-muted">{{ descricao }}</div>
      </div>
      <div class="d-flex ga-2">
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
      <v-table>
        <thead>
          <tr>
            <th v-for="coluna in colunas" :key="coluna">{{ coluna }}</th>
            <th v-if="podeEditar || podeExportar || acoesExtras.length" class="text-right">Acoes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in linhasPaginadas" :key="linha.id ?? JSON.stringify(linha)">
            <td v-for="coluna in colunas" :key="coluna">{{ valorLinha(linha, coluna) }}</td>
            <td v-if="podeEditar || podeExportar || acoesExtras.length" class="text-right">
              <div class="d-flex justify-end ga-1">
                <v-btn
                  v-for="acaoExtra in acoesExtras"
                  :key="acaoExtra.event"
                  size="small"
                  variant="text"
                  @click="emit('extra', { event: acaoExtra.event, linha })"
                >
                  {{ acaoExtra.label }}
                </v-btn>
                <v-btn v-if="podeExportar" size="small" variant="text" @click="emit('exportar', linha)">Exportar</v-btn>
                <v-btn
                  v-if="podeEditar"
                  size="small"
                  variant="text"
                  :loading="editarCarregandoId === linha.id"
                  @click="emit('editar', linha)"
                  >Editar</v-btn
                >
              </div>
            </td>
          </tr>
          <tr v-if="!linhasPaginadas.length">
            <td
              :colspan="colunas.length + (podeEditar || podeExportar || acoesExtras.length ? 1 : 0)"
              class="text-center text-muted py-8"
            >
              Nenhum registro cadastrado.
            </td>
          </tr>
        </tbody>
      </v-table>

      <div
        v-if="linhas.length > itensPorPagina"
        class="mt-4 d-flex flex-column flex-sm-row align-center justify-space-between ga-3 text-body-2 text-muted"
      >
        <span>Mostrando {{ inicio }}-{{ fim }} de {{ linhas.length }}</span>
        <div class="d-flex align-center ga-2">
          <v-btn
            size="small"
            variant="outlined"
            prepend-icon="mdi-chevron-left"
            :disabled="pagina === 1"
            @click="pagina = Math.max(1, pagina - 1)"
            >Anterior</v-btn
          >
          <span class="font-weight-bold">{{ pagina }} / {{ totalPaginas }}</span>
          <v-btn
            size="small"
            variant="outlined"
            append-icon="mdi-chevron-right"
            :disabled="pagina === totalPaginas"
            @click="pagina = Math.min(totalPaginas, pagina + 1)"
            >Proxima</v-btn
          >
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
