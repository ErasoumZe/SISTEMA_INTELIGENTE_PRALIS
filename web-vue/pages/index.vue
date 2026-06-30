<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
</script>

<template>
  <AppWorkspace tipo-pagina="inicio">
    <section class="inicio-vazio">
      <div class="inicio-vazio-icon">
        <v-icon icon="mdi-view-dashboard-outline" size="34" />
      </div>
      <h1>Painel</h1>
      <p>Escolha uma tela no menu lateral para comecar.</p>
    </section>
  </AppWorkspace>
</template>
