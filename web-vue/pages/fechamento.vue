<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import NotificacoesPendentesPage from "~/components/caixa/NotificacoesPendentesPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="fechamento" tipo-pagina="fechamento" v-slot="ctx">
    <NotificacoesPendentesPage :notificacoes="ctx.notificacoes" @verificar="ctx.verificarNotificacao" />
  </AppWorkspace>
</template>
