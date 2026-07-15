<script setup lang="ts">
import { reactive, watch } from "vue";
import type { MercadoriaAprovacao } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  itens: MercadoriaAprovacao[];
  carregando?: boolean;
  salvandoId?: string;
}>();

const emit = defineEmits<{
  (event: "aprovar", id: string, computar: boolean): void;
  (event: "recusar", id: string): void;
}>();

// Toggle "computar" por linha. Decisao da reuniao: nota so fiscal nao computa. Default = computar
// (compra real), o revisor desmarca para notas apenas fiscais.
const computarPorId = reactive<Record<string, boolean>>({});
watch(
  () => props.itens,
  (itens) => {
    for (const item of itens) {
      if (!(item.id in computarPorId)) computarPorId[item.id] = true;
    }
  },
  { immediate: true, deep: false }
);
</script>

<template>
  <div class="aprovacao-mercadorias">
    <v-alert
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      text="Compras importadas de NF-e aguardando aprovacao. Confira os itens, defina se computa no financeiro e aprove ou recuse."
    />

    <div v-if="carregando" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert
      v-else-if="!itens.length"
      type="success"
      variant="tonal"
      density="comfortable"
      text="Nenhuma compra de NF-e aguardando aprovacao."
    />

    <v-expansion-panels v-else multiple variant="accordion">
      <v-expansion-panel v-for="item in itens" :key="item.id">
        <v-expansion-panel-title>
          <div class="d-flex flex-wrap align-center ga-3 w-100">
            <span class="font-weight-bold">{{ item.fornecedorNome || "Fornecedor nao identificado" }}</span>
            <v-chip size="x-small" variant="tonal" color="primary">{{ dinheiro(item.valorOriginal) }}</v-chip>
            <span class="text-caption text-medium-emphasis">{{ item.dataReferencia }}</span>
            <span v-if="item.notaFiscalId" class="text-caption text-medium-emphasis">
              NF-e {{ item.notaFiscalId }}
            </span>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="responsive-table-shell mb-3">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="text-right">Qtd</th>
                  <th class="text-right">Valor unit.</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(linha, indice) in item.itens" :key="indice">
                  <td>{{ linha.descricao }}</td>
                  <td class="text-right">{{ linha.quantidade }}</td>
                  <td class="text-right">{{ dinheiro(linha.valorUnitario) }}</td>
                  <td class="text-right">{{ dinheiro(linha.valorTotal) }}</td>
                </tr>
                <tr v-if="!item.itens.length">
                  <td colspan="4" class="text-center text-medium-emphasis">Sem itens no XML.</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <div class="d-flex flex-wrap align-center justify-space-between ga-3">
            <v-switch
              v-model="computarPorId[item.id]"
              label="Computar no financeiro"
              color="primary"
              density="compact"
              hide-details
            />
            <div class="d-flex ga-2">
              <v-btn
                variant="outlined"
                color="error"
                prepend-icon="mdi-close-circle-outline"
                :loading="salvandoId === item.id"
                :disabled="Boolean(salvandoId)"
                @click="emit('recusar', item.id)"
              >
                Recusar
              </v-btn>
              <v-btn
                color="success"
                prepend-icon="mdi-check-circle-outline"
                :loading="salvandoId === item.id"
                :disabled="Boolean(salvandoId)"
                @click="emit('aprovar', item.id, computarPorId[item.id] ?? true)"
              >
                Aprovar
              </v-btn>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>
