<script setup lang="ts">
import { temPermissao as possuiPermissao, type AuthSession } from "@padaria/shared";
import type { ItemMenu } from "~/types/padaria";
import CadastroTable from "~/components/cadastros/CadastroTable.vue";
import { podeExecutarAcaoCadastro } from "~/utils/domain";

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
  excluindoId?: string;
  // #152: so o Admin com a permissao dedicada (R-176) enxerga a acao de roteamento.
  podeConfigurarRoteamento?: boolean;
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
const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeAdicionar = computed(() =>
  props.telaAtual ? podeExecutarAcaoCadastro(permissoesUsuario.value, props.telaAtual, "criar") : false
);
const podeEditar = computed(() =>
  props.telaAtual ? podeExecutarAcaoCadastro(permissoesUsuario.value, props.telaAtual, "editar") : false
);
const podeCopia = computed(() => !["permissoes", "socios_gestores"].includes(props.tela));
const acoesExtras = computed(() => {
  // So faz sentido restaurar o padrao de CARGO (setor/usuario nao tem referencia).
  if (props.tela === "permissoes" && podeEditar.value)
    return [
      {
        label: "Restaurar padrão",
        event: "restaurarPadraoCargo",
        condicao: (linha: Record<string, string | undefined>) => linha.tipo === "cargo"
      }
    ];
  if (
    props.tela === "usuarios" &&
    possuiPermissao(permissoesUsuario.value, "cadastro_permissoes_visualizar") &&
    possuiPermissao(permissoesUsuario.value, "cadastro_permissoes_editar")
  ) {
    return [{ label: "Acessos", event: "gerenciarAcessosUsuario", condicao: () => true }];
  }
  // #152: decidir PARA ONDE vai o dinheiro de uma forma e outro ato, com outra permissao — por isso
  // e uma acao propria na linha, e nao mais um campo no formulario generico de cadastro. Continua
  // sendo UM caminho: e a unica rota para rotear.
  if (props.tela === "formas_pagamento" && props.podeConfigurarRoteamento)
    return [{ label: "Roteamento", event: "roteamentoFinanceiro", condicao: () => true }];
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
    :pode-adicionar="podeAdicionar"
    :pode-editar="podeEditar"
    :pode-exportar="podeCopia"
    :pode-importar="podeCopia && podeAdicionar"
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
