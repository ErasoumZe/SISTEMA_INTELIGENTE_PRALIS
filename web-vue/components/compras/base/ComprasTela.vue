<script setup lang="ts">
/**
 * Moldura das telas de Compras: o mesmo ritmo vertical e os mesmos padrões de controle em todos os módulos
 * (Estoque, Conferência, Agendamento, Solicitação, Cotação, Pedidos finalizados). Botão em texto normal — caixa
 * alta e letras espaçadas deixavam as telas pesadas — e campos com contorno. Os padrões valem também nos
 * diálogos abertos dentro da tela (o provider segue a árvore de componentes, não o DOM).
 */
const PADROES = {
  // Diálogos e menus saem da tela (teleport): a classe vai na moldura deles, e o CSS abaixo alcança os botões.
  VDialog: { contentClass: "compras-sobreposto" },
  VMenu: { contentClass: "compras-sobreposto" },
  VTextField: { variant: "outlined", density: "comfortable" },
  VSelect: { variant: "outlined", density: "comfortable" },
  VAutocomplete: { variant: "outlined", density: "comfortable" },
  VTextarea: { variant: "outlined", density: "comfortable" }
};
</script>

<template>
  <v-defaults-provider :defaults="PADROES">
    <div class="compras-tela">
      <slot />
    </div>
  </v-defaults-provider>
</template>

<style scoped>
.compras-tela {
  display: grid;
  gap: var(--cx-sp-5);
  min-width: 0;
}
</style>

<style>
/* Global de propósito: o botão pode estar num diálogo ou menu teleportado para fora da tela. */
.compras-tela .v-btn,
.compras-sobreposto .v-btn {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
}
</style>
