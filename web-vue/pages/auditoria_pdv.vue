<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AuditoriaPdvPage from "~/components/auditoria/AuditoriaPdvPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="auditoria_pdv" tipo-pagina="auditoria_pdv" v-slot="ctx">
    <AuditoriaPdvPage :empresa-id="ctx.empresaId" />
  </AppWorkspace>
</template>
