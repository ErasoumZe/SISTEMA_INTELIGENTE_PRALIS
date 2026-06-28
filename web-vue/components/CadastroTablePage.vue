<script setup lang="ts">
import type { ItemMenu } from "~/types/padaria";

const props = defineProps<{
  tela: string;
  telaAtual: ItemMenu | null | undefined;
  descricao: string;
  colunas: string[];
  linhas: Array<Record<string, string | undefined>>;
  editarCarregandoId: string;
}>();

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "importar"): void;
  (event: "exportar", linha: Record<string, string | undefined>): void;
  (event: "editar", linha: Record<string, string | undefined>): void;
  (event: "extra", payload: { event: string; linha: Record<string, string | undefined> }): void;
}>();

const acao = computed(() => (props.tela === "malotes" ? "Novo malote" : "Novo cadastro"));
const podeEditar = computed(() => props.tela !== "permissoes");
const podeCopia = computed(() => !["permissoes", "malotes"].includes(props.tela));
const acoesExtras = computed(() => (props.tela === "malotes" ? [{ label: "Editar", event: "maloteEditar" }] : []));
</script>

<template>
  <CadastroTable
    :titulo="telaAtual?.titulo ?? 'Cadastro'"
    :descricao="descricao"
    :colunas="colunas"
    :linhas="linhas"
    :acao="acao"
    :pode-editar="podeEditar"
    :pode-exportar="podeCopia"
    :pode-importar="podeCopia"
    :editar-carregando-id="editarCarregandoId"
    :acoes-extras="acoesExtras"
    @acionar="emit('acionar')"
    @importar="emit('importar')"
    @exportar="emit('exportar', $event)"
    @editar="emit('editar', $event)"
    @extra="emit('extra', $event)"
  />
</template>
