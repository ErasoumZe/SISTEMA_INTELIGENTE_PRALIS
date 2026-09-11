<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CaixaResumoPage from "~/components/caixa/CaixaResumoPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="caixa" tipo-pagina="caixa" v-slot="ctx">
    <!-- VIS-10: esta tela nunca teve cabecalho proprio — vivia do titulo da topbar, que saiu.
         O nome vem do menu (`telaAtual`), sem texto novo. -->
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? ''" />

    <CaixaResumoPage
      :resumo="ctx.resumo"
      :status="ctx.caixaStatus"
      :pdvs="ctx.opcoesEmpresa.pdvs"
      :turnos="ctx.opcoesEmpresa.turnos"
      :maquininhas="ctx.opcoesEmpresa.maquininhas"
      :empresa-id="ctx.empresaId"
      :permissoes="ctx.sessao?.perfil?.permissoes ?? []"
      :usuario-id="ctx.sessao?.perfil?.usuarioId || ''"
      :usuario-nome="ctx.sessao?.perfil?.nome || ctx.sessao?.user?.name || 'Usuário'"
      :salvando="ctx.caixaSalvando"
      @abrir-caixa="ctx.abrirCaixaOperacional"
      @retornar-saldo="ctx.retornarSaldoOperacional"
      @executar-planejamento="ctx.executarPlanejamentoRetorno"
      @fechar-caixa="ctx.fecharCaixaOperacional"
      @recarregar="ctx.recarregarCaixa"
    />
  </AppWorkspace>
</template>
