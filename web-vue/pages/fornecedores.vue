<script setup lang="ts">
import { permissoes } from "~/utils/domain";
import { fornecedorPendente, soPendentes } from "~/utils/fornecedores-pendentes";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";

// Doc 59: sem WhatsApp o pedido não vai sozinho; a lista de pendentes é o ponto de partida de quem compra.
const pendentes = ref(false);
</script>

<template>
  <AppWorkspace tela-inicial="fornecedores" tipo-pagina="cadastro" v-slot="ctx">
    <div class="fornecedores__filtro">
      <v-chip
        :color="pendentes ? 'warning' : undefined"
        :variant="pendentes ? 'flat' : 'outlined'"
        prepend-icon="mdi-whatsapp"
        data-filtro="pendentes"
        @click="pendentes = !pendentes"
      >
        Sem WhatsApp: {{ ctx.linhasCadastro.filter(fornecedorPendente).length }}
      </v-chip>
    </div>
    <CadastroTablePage
      tela="fornecedores"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="soPendentes(ctx.linhasCadastro, pendentes)"
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
  justify-content: flex-end;
  padding: var(--cx-sp-2) var(--cx-sp-3) 0;
}
</style>
