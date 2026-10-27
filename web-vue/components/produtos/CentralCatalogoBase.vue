<script setup lang="ts">
import type { PreviaCatalogoBase } from "~/types/produtos-central";

defineProps<{
  previa: PreviaCatalogoBase | null;
  processando: boolean;
  cargaValidada: boolean;
}>();
defineEmits<{ gerarPrevia: []; importar: [] }>();
</script>

<template>
  <v-card rounded="lg">
    <v-card-title>Prévia de carga do catálogo mestre BASE</v-card-title>
    <v-card-text>
      <p>Compare a fonte BASE com o catálogo mestre antes de iniciar a gravação explícita.</p>
      <v-btn
        color="primary"
        variant="tonal"
        :loading="processando"
        :disabled="processando || !cargaValidada"
        @click="$emit('gerarPrevia')"
        >Gerar prévia da BASE</v-btn
      >
      <v-alert v-if="previa?.estado === 'sem_base'" type="warning" variant="tonal" class="mt-4">
        O backup validado não contém produtos da loja BASE.
      </v-alert>
      <template v-else-if="previa?.estado === 'ok'">
        <div class="central-produtos__resumo mt-4">
          <v-card
            v-for="[rotulo, valor] in Object.entries({
              total: previa.total,
              novos: previa.novos,
              existentes: previa.existentes,
              'códigos internos repetidos': previa.codigosInternosDuplicados,
              'EANs repetidos': previa.eansDuplicados,
              'códigos em lojas': previa.codigosInternosEmProdutos,
              'EANs já em lojas': previa.eansEmProdutos,
              'sem NCM': previa.semNcm,
              'sem CST': previa.semCst
            })"
            :key="rotulo"
            variant="tonal"
            rounded="lg"
          >
            <v-card-text
              ><strong>{{ valor }}</strong
              ><span>{{ rotulo }}</span></v-card-text
            >
          </v-card>
        </div>
        <v-alert
          v-if="
            previa.idsDuplicados ||
            previa.codigosInternosDuplicados ||
            previa.eansDuplicados ||
            previa.codigosInternosEmProdutos ||
            previa.eansEmProdutos
          "
          type="warning"
          variant="tonal"
          class="mb-4"
        >
          Há identificadores repetidos na fonte ou em produtos das lojas. Revise os conflitos antes de copiar itens para
          uma loja.
        </v-alert>
        <v-table v-if="previa.amostra?.length" density="compact">
          <thead>
            <tr>
              <th>Ação</th>
              <th>Nome</th>
              <th>Código</th>
              <th>EAN</th>
              <th>NCM</th>
              <th>CST</th>
              <th>Conflitos</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, indice) in previa.amostra" :key="item.idOrigem ?? `${item.acao}-${indice}`">
              <td>{{ item.acao }}</td>
              <td>{{ item.nome }}</td>
              <td>{{ item.codigoInterno || "—" }}</td>
              <td>{{ item.codigoBarras || "—" }}</td>
              <td>{{ item.ncm || "—" }}</td>
              <td>{{ item.cstPisCofins || "—" }}</td>
              <td>
                {{
                  [item.conflitoCodigoInterno ? "código" : "", item.conflitoEan ? "EAN" : ""]
                    .filter(Boolean)
                    .join(", ") || "—"
                }}
              </td>
            </tr>
          </tbody>
        </v-table>
        <v-btn
          class="mt-4"
          color="primary"
          prepend-icon="mdi-database-import-outline"
          :loading="processando"
          :disabled="processando || !previa.total"
          @click="$emit('importar')"
          >Importar {{ previa.total }} produtos BASE</v-btn
        >
        <p class="text-body-2 mt-2">
          A importação atualiza pelo ID oficial e não remove registros ausentes. Ela não altera produtos das lojas nem
          saldos de estoque.
        </p>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.central-produtos__resumo {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.central-produtos__resumo strong,
.central-produtos__resumo span {
  display: block;
}
.central-produtos__resumo strong {
  font-size: 1.4rem;
}
.central-produtos__resumo span {
  text-transform: capitalize;
}
@media (max-width: 768px) {
  .central-produtos__resumo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
