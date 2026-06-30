<script setup lang="ts">
import type { TreeItem } from "~/types/padaria";
import TreeCadastro from "~/components/cadastros/TreeCadastro.vue";

const props = defineProps<{
  tela: "grupos" | "areas_setores";
  descricao: string;
  itens: TreeItem[];
}>();

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "importar"): void;
  (event: "exportar", linha: Record<string, string | undefined>): void;
  (event: "editar", linha: Record<string, string | undefined>): void;
  (event: "criarFilho", linha: Record<string, string | undefined>): void;
}>();

const titulo = computed(() => (props.tela === "grupos" ? "Grupos" : "Areas e setores"));
const acao = computed(() => (props.tela === "grupos" ? "Novo grupo" : "Novo item"));
</script>

<template>
  <TreeCadastro
    :titulo="titulo"
    :descricao="descricao"
    :itens="itens"
    :acao="acao"
    pode-importar
    pode-exportar
    @acionar="emit('acionar')"
    @importar="emit('importar')"
    @exportar="emit('exportar', $event)"
    @editar="emit('editar', $event)"
    @criar-filho="emit('criarFilho', $event)"
  />
</template>
