<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CaixaResumoPage from "~/components/caixa/CaixaResumoPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="caixa" tipo-pagina="caixa" v-slot="ctx">
    <CaixaResumoPage
      :resumo="ctx.resumo"
      :status="ctx.caixaStatus"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :turnos="ctx.opcoesEmpresa.turnos"
      :maquininhas="ctx.opcoesEmpresa.maquininhas"
      :solicitacoes="ctx.caixaSolicitacoes"
      :empresa-id="ctx.empresaId"
      :permissoes="ctx.sessao?.perfil?.permissoes ?? []"
      :usuario-id="ctx.sessao?.perfil?.usuarioId || ''"
      :usuario-nome="ctx.sessao?.perfil?.nome || ctx.sessao?.user?.name || 'Usuário'"
      :salvando="ctx.caixaSalvando"
      @abrir-caixa="ctx.abrirCaixaOperacional"
      @retornar-saldo="ctx.retornarSaldoOperacional"
      @executar-solicitacao="ctx.executarSolicitacaoCofre"
      @fechar-caixa="ctx.fecharCaixaOperacional"
      @recarregar="ctx.recarregarCaixa"
    />
  </AppWorkspace>
</template>
