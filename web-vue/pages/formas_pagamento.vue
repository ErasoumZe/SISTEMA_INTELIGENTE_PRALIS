<script setup lang="ts">
import { permissoes } from "~/utils/domain";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";
import RoteamentoFinanceiroDialog from "~/components/financeiro/RoteamentoFinanceiroDialog.vue";
</script>

<template>
  <AppWorkspace tela-inicial="formas_pagamento" tipo-pagina="cadastro" v-slot="ctx">
    <CadastroTablePage
      tela="formas_pagamento"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="ctx.linhasCadastro"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="false"
      :pode-configurar-roteamento="ctx.podeConfigurarRoteamento"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
    />

    <!-- R-176: decidir o destino do dinheiro e outro ato, com outra permissao. Fica num dialogo
         proprio em vez de virar mais campos no formulario generico de cadastro — e continua sendo
         UM caminho, porque e a unica rota para rotear. -->
    <RoteamentoFinanceiroDialog
      :aberto="Boolean(ctx.formaRoteamentoSelecionada)"
      :empresa-id="ctx.empresaIdAtiva"
      :forma="ctx.formaRoteamentoSelecionada"
      :contas="ctx.contasDaEmpresa"
      :pode-configurar="ctx.podeConfigurarRoteamento"
      @fechar="ctx.fecharRoteamentoDaForma"
    />
  </AppWorkspace>
</template>
