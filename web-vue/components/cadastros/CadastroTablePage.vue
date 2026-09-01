<script setup lang="ts">
import type { ItemMenu } from "~/types/padaria";
import CadastroTable from "~/components/cadastros/CadastroTable.vue";

const props = defineProps<{
  tela: string;
  telaAtual: ItemMenu | null | undefined;
  descricao: string;
  colunas: string[];
  linhas: Array<Record<string, string | undefined>>;
  editarCarregandoId?: string;
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
  podeExcluir?: boolean;
  // Editar era `true` fixo para toda tela de cadastro. Vira prop porque a partir da ADM-003 V1B
  // existe cargo que CRIA turno e nao edita: sem isto o DP veria o botao, preencheria o formulario
  // e levaria 403 no salvar — a tela oferecendo o que a rota recusa. Default `true` para as demais
  // telas continuarem exatamente como estavam.
  podeEditar?: boolean;
  excluindoId?: string;
}>();

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "importar"): void;
  (event: "exportar", linha: Record<string, string | undefined>): void;
  (event: "editar", linha: Record<string, string | undefined>): void;
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

const acao = "Novo cadastro";
const podeEditar = computed(() => props.podeEditar ?? true);
const podeCopia = computed(() => !["permissoes", "socios_gestores"].includes(props.tela));
const acoesExtras = computed(() => {
  // So faz sentido restaurar o padrao de CARGO (setor/usuario nao tem referencia).
  if (props.tela === "permissoes")
    return [
      {
        label: "Restaurar padrão",
        event: "restaurarPadraoCargo",
        condicao: (linha: Record<string, string | undefined>) => linha.tipo === "cargo"
      }
    ];
  // O vinculo usuario <-> contas era editado tambem por aqui (botao "Contas" na linha do usuario).
  // Removido: o D8 poe fundo e "quem opera" no cadastro da CONTA, num salvar so. Manter os dois
  // lados seria a segunda rota para o mesmo ato (DoD item 2).
  return [];
});
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
    :modo-servidor="modoServidor"
    :busca="busca"
    :tipo-permissao-filtro="tipoPermissaoFiltro"
    :alvo-filtro="alvoFiltro"
    :permissao-filtro="permissaoFiltro"
    :alvos-filtro="alvosFiltro"
    :permissoes-filtro="permissoesFiltro"
    :carregando-busca="carregandoBusca"
    :buscou="buscou"
    :total-servidor="totalServidor"
    :pagina-servidor="paginaServidor"
    :itens-por-pagina-servidor="itensPorPaginaServidor"
    :pode-excluir="podeExcluir"
    :excluindo-id="excluindoId"
    :acoes-extras="acoesExtras"
    @acionar="emit('acionar')"
    @importar="emit('importar')"
    @exportar="emit('exportar', $event)"
    @editar="emit('editar', $event)"
    @extra="emit('extra', $event)"
    @excluir="emit('excluir', $event)"
    @buscar="emit('buscar')"
    @limpar="emit('limpar')"
    @update:busca="emit('update:busca', $event)"
    @update:tipo-permissao-filtro="emit('update:tipoPermissaoFiltro', $event)"
    @update:alvo-filtro="emit('update:alvoFiltro', $event)"
    @update:permissao-filtro="emit('update:permissaoFiltro', $event)"
    @update:pagina-servidor="emit('update:paginaServidor', $event)"
  />
</template>
