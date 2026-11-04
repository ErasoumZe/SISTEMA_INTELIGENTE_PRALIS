<script setup lang="ts">
import { permissoes } from "~/utils/domain";
import { filtrarFornecedores, fornecedorPendente } from "~/utils/fornecedores-pendentes";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";

// Doc 59: sem WhatsApp o pedido não vai sozinho; a lista de pendentes é o ponto de partida de quem compra.
const busca = ref("");
const filtroWhatsapp = ref<"todos" | "com" | "sem">("todos");
const filtroSituacao = ref<"todos" | "ativos" | "inativos">("todos");
</script>

<template>
  <AppWorkspace tela-inicial="fornecedores" tipo-pagina="cadastro" v-slot="ctx">
    <div class="fornecedores__filtro">
      <v-text-field
        v-model="busca"
        label="Buscar fornecedor"
        placeholder="Nome, documento, WhatsApp ou categoria"
        prepend-inner-icon="mdi-magnify"
        clearable
        density="compact"
        hide-details
        class="fornecedores__busca"
      />
      <v-select
        v-model="filtroWhatsapp"
        label="WhatsApp"
        :items="[
          { title: 'Todos', value: 'todos' },
          { title: 'Com WhatsApp', value: 'com' },
          { title: `Sem WhatsApp (${ctx.linhasCadastro.filter(fornecedorPendente).length})`, value: 'sem' }
        ]"
        density="compact"
        hide-details
        class="fornecedores__seletor"
      />
      <v-select
        v-model="filtroSituacao"
        label="Situação"
        :items="[
          { title: 'Todos', value: 'todos' },
          { title: 'Ativos', value: 'ativos' },
          { title: 'Inativos', value: 'inativos' }
        ]"
        density="compact"
        hide-details
        class="fornecedores__seletor"
      />
    </div>
    <CadastroTablePage
      tela="fornecedores"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="filtrarFornecedores(ctx.linhasCadastro, { busca, whatsapp: filtroWhatsapp, situacao: filtroSituacao })"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="false"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
    />
  </AppWorkspace>
</template>

<style scoped>
.fornecedores__filtro {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-2) var(--cx-sp-3) 0;
}
.fornecedores__busca {
  flex: 1 1 280px;
}
.fornecedores__seletor {
  flex: 1 1 170px;
  max-width: 240px;
}
@media (max-width: 600px) {
  .fornecedores__seletor {
    max-width: none;
  }
}
</style>
