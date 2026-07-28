<script setup lang="ts">
import { ref } from "vue";
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
import ContasUsuarioDialog from "~/components/cadastros/ContasUsuarioDialog.vue";

type ExtraPayload = { event: string; linha: Record<string, string | undefined> };

const dialogContasAberto = ref(false);
const usuarioAlvo = ref<{ usuarioId: string; nome: string } | null>(null);

// A acao extra "Contas" (linha do usuario) abre o cadastro de vinculo aqui mesmo; qualquer outro
// evento extra segue para o handler generico do workspace.
function lidarExtra(payload: ExtraPayload, fallback: (p: ExtraPayload) => void) {
  if (payload.event === "vincularContas") {
    usuarioAlvo.value = {
      usuarioId: payload.linha.usuarioId ?? payload.linha.id ?? "",
      nome: payload.linha.nome ?? ""
    };
    dialogContasAberto.value = true;
    return;
  }
  fallback(payload);
}
</script>

<template>
  <AppWorkspace tela-inicial="usuarios" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="usuarios"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :editar-carregando-id="ctx.maloteEditandoCarregandoId"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="false"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @extra="(p) => lidarExtra(p, ctx.lidarExtraCadastro)"
    />
    <ContasUsuarioDialog v-model="dialogContasAberto" :usuario="usuarioAlvo" :empresa-id="ctx.empresaId" />
  </AppWorkspace>
</template>
