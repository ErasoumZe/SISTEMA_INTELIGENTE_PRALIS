<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import ClinicasOcupacionaisPage from "~/components/clinicas/ClinicasOcupacionaisPage.vue";
</script>

<template>
  <AppWorkspace tela-inicial="departamento_pessoal" tipo-pagina="departamento_pessoal" v-slot="ctx">
    <ClinicasOcupacionaisPage :empresa-id="ctx.empresaId" />
  </AppWorkspace>
</template>
