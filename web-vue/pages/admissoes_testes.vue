<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AdmissoesTestesPage from "~/components/admissoes/AdmissoesTestesPage.vue";
</script>

<template>
  <!-- Sem `ctx.empresaId`: esta e a unica tela do sistema em que a empresa nao vem do cliente. O
       servidor deriva do perfil autorizado, e o AppWorkspace esconde o seletor global aqui. -->
  <AppWorkspace tela-inicial="admissoes_testes" tipo-pagina="admissoes_testes">
    <AdmissoesTestesPage />
  </AppWorkspace>
</template>
