<script setup lang="ts">
import type { EntidadeOperacional } from "~/types/padaria";
import type { ItemCockpit, SecaoCockpit } from "~/utils/cockpit-caixa";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = defineProps<{
  secao: SecaoCockpit;
  aberta: boolean;
  itens: ItemCockpit[];
  carregando: boolean;
  // Caixa fechado ou de outro operador (auditoria): lista apenas leitura, sem acoes.
  somenteLeitura: boolean;
}>();

const emit = defineEmits<{
  (event: "alternar"): void;
  (event: "lancar", entidade: EntidadeOperacional): void;
  (event: "editar", payload: { entidade: EntidadeOperacional; id: string }): void;
  (event: "discriminar", payload: { entidade: EntidadeOperacional; id: string }): void;
}>();

function formatarData(data: string | null) {
  if (!data) return "-";
  return data.includes("T") ? formatarDataHora(data) : formatarDataSomenteDia(data);
}

const mostrarEditar = computed(() => !props.somenteLeitura && props.secao.categoria !== "entradas");
const mostrarDiscriminar = computed(() => !props.somenteLeitura && props.secao.podeDiscriminar);
</script>

<template>
  <v-card variant="outlined" class="cockpit-secao" :style="{ '--cor-secao': secao.cor }">
    <div
      class="cockpit-secao-cabecalho"
      role="button"
      tabindex="0"
      :aria-expanded="aberta"
      @click="emit('alternar')"
      @keydown.enter.prevent="emit('alternar')"
      @keydown.space.prevent="emit('alternar')"
    >
      <v-icon :icon="aberta ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="20" class="text-medium-emphasis" />
      <v-icon :icon="secao.icone" size="20" class="cockpit-secao-icone" />
      <span class="cockpit-secao-titulo">{{ secao.titulo }}</span>
      <span class="cockpit-secao-total">{{ dinheiro(secao.total) }}</span>
      <v-btn
        v-if="secao.podeLancar"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-plus"
        class="ml-2"
        @click.stop="emit('lancar', secao.entidade)"
      >
        Lancar
      </v-btn>
    </div>

    <v-expand-transition>
      <div v-if="aberta" class="cockpit-secao-corpo">
        <div class="responsive-table-shell">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descricao</th>
                <th class="text-right">Valor</th>
                <th v-if="mostrarEditar || mostrarDiscriminar" class="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in itens" :key="item.id">
                <td class="text-no-wrap">{{ formatarData(item.data) }}</td>
                <td>
                  {{ item.descricao }}
                  <v-chip v-if="item.pendenteDiscriminacao" size="x-small" color="warning" class="ml-1"
                    >a discriminar</v-chip
                  >
                </td>
                <td class="text-right text-no-wrap">{{ dinheiro(item.valor) }}</td>
                <td v-if="mostrarEditar || mostrarDiscriminar" class="text-right text-no-wrap">
                  <v-btn
                    v-if="mostrarDiscriminar"
                    size="x-small"
                    variant="text"
                    icon="mdi-format-list-checks"
                    :aria-label="`Discriminar ${item.descricao}`"
                    @click="emit('discriminar', { entidade: secao.entidade, id: item.id })"
                  />
                  <v-btn
                    v-if="mostrarEditar"
                    size="x-small"
                    variant="text"
                    icon="mdi-pencil"
                    :aria-label="`Editar ${item.descricao}`"
                    @click="emit('editar', { entidade: secao.entidade, id: item.id })"
                  />
                </td>
              </tr>
              <tr v-if="!itens.length">
                <td
                  :colspan="mostrarEditar || mostrarDiscriminar ? 4 : 3"
                  class="text-center text-medium-emphasis py-6"
                >
                  {{ carregando ? "Carregando..." : "Nenhum lancamento neste caixa." }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </div>
    </v-expand-transition>
  </v-card>
</template>

<style scoped>
.cockpit-secao {
  border-left: 4px solid var(--cor-secao);
}
.cockpit-secao-cabecalho {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}
.cockpit-secao-cabecalho:hover {
  background: rgba(0, 0, 0, 0.03);
}
.cockpit-secao-icone {
  color: var(--cor-secao);
}
.cockpit-secao-titulo {
  font-weight: 600;
}
.cockpit-secao-total {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.cockpit-secao-corpo {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
</style>
