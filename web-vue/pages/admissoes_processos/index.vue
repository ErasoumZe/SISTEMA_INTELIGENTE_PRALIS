<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AdmissoesProcessosPage from "~/components/admissoes/AdmissoesProcessosPage.vue";
</script>

<template>
  <!-- Sem `ctx.empresaId`, como a tela de Períodos de teste: a empresa vem do perfil autorizado no
       servidor, e o AppWorkspace estreita o seletor global para ela. -->
  <AppWorkspace tela-inicial="admissoes_processos" tipo-pagina="admissoes_processos">
    <AdmissoesProcessosPage />
  </AppWorkspace>
</template>
