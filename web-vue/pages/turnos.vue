<script setup lang="ts">
import { computed } from "vue";
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
import QuestorParametrosOperacionais from "~/components/questor/QuestorParametrosOperacionais.vue";

const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const podeConfigurarQuestor = computed(() =>
  temPermissao(sessao.value?.perfil?.permissoes ?? [], "conplus_questor_configurar")
);
</script>

<template>
  <AppWorkspace tela-inicial="turnos" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="turnos"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="false"
      :pode-editar="ctx.podeEditarTurno"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
    />
    <QuestorParametrosOperacionais v-if="podeConfigurarQuestor" modo="turnos" />
  </AppWorkspace>
</template>
