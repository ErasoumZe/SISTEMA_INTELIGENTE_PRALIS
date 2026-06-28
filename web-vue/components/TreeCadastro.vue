<script setup lang="ts">
import type { TreeItem } from "~/types/padaria";

defineProps<{
  titulo: string;
  descricao: string;
  itens: TreeItem[];
  acao: string;
  podeImportar?: boolean;
  podeExportar?: boolean;
}>();

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "importar"): void;
  (event: "exportar", item: Record<string, string | undefined>): void;
  (event: "editar", item: Record<string, string | undefined>): void;
  (event: "criarFilho", item: Record<string, string | undefined>): void;
}>();
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between ga-3">
      <div>
        <div class="text-h6">{{ titulo }}</div>
        <div class="text-body-2 text-muted">{{ descricao }}</div>
      </div>
      <div class="d-flex ga-2">
        <v-btn v-if="podeImportar" size="small" variant="outlined" @click="emit('importar')">Importar</v-btn>
        <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="emit('acionar')">{{ acao }}</v-btn>
      </div>
    </v-card-title>

    <v-card-text>
      <div class="d-grid ga-2">
        <div
          v-for="item in itens"
          :key="item.id"
          class="bordered rounded-lg pa-3 mb-2 d-flex align-center justify-space-between ga-3"
          :style="{ marginLeft: `${Math.min(item.nivel, 8) * 1.25}rem` }"
        >
          <div class="d-flex align-center ga-2 min-w-0">
            <v-icon icon="mdi-folder-tree" color="primary" />
            <div class="min-w-0">
              <div class="text-body-2 font-weight-bold truncate-line">{{ item.nome }}</div>
              <div v-if="item.detalhe" class="text-caption text-muted truncate-line">{{ item.detalhe }}</div>
            </div>
          </div>
          <div class="d-flex ga-1">
            <v-btn v-if="podeExportar" size="small" variant="text" @click="emit('exportar', item.item)">Exportar</v-btn>
            <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="emit('criarFilho', item.item)"
              >Subitem</v-btn
            >
            <v-btn size="small" variant="text" prepend-icon="mdi-pencil" @click="emit('editar', item.item)"
              >Editar</v-btn
            >
          </div>
        </div>
        <div v-if="!itens.length" class="soft-bg rounded-lg pa-8 text-center text-muted">
          Nenhum registro cadastrado.
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
