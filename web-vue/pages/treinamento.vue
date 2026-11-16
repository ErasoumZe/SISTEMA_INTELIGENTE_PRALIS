<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AppCabecalhoTela from "~/components/app/AppCabecalhoTela.vue";
import TreinamentoBiblioteca from "~/components/treinamento/TreinamentoBiblioteca.vue";
</script>

<template>
  <!-- Pagina neutra como o painel (`tipo-pagina="inicio"`): nao e uma tela do menu, nao carrega dados
       de tela e nao pede permissao propria. Quem ve cada grupo de video sai da mesma lista do menu
       que o workspace entrega (`ctx.telasMenu`), igual a home fazia (R-242). -->
  <AppWorkspace v-slot="ctx" tipo-pagina="inicio">
    <section class="treinamento-pagina">
      <AppCabecalhoTela titulo="Treinamento" subtitulo="Vídeos curtos, um por dúvida. Toque para assistir." />
      <TreinamentoBiblioteca :telas="ctx.telasMenu" />
    </section>
  </AppWorkspace>
</template>

<style scoped>
.treinamento-pagina {
  display: grid;
  gap: var(--cx-sp-5);
  min-width: 0;
}
</style>
