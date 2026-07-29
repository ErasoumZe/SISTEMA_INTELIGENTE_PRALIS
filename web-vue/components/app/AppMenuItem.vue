<script setup lang="ts">
// Uma linha do menu lateral (link ou variante desabilitada com tooltip). Extraido do AppShell para
// ser reusado tanto na raiz quanto DENTRO da categoria "Lancamentos" (PROJECT_BRAIN/17, D6) — sem
// duplicar a marcacao do item em dois lugares.
import type { ItemMenu } from "~/types/padaria";
import { rotaTela } from "~/utils/domain";

const props = defineProps<{
  tela: ItemMenu;
  telaAtiva: string;
  desabilitada: boolean;
  motivo: string;
}>();

const emit = defineEmits<{ (event: "navegar"): void }>();

const ativa = computed(() => props.tela.id === props.telaAtiva);
</script>

<template>
  <v-tooltip v-if="desabilitada" :text="motivo">
    <template #activator="{ props: tooltipProps }">
      <span
        v-bind="tooltipProps"
        class="sidebar-disabled-wrapper"
        tabindex="0"
        role="button"
        aria-disabled="true"
        :aria-label="`${tela.titulo} — ${motivo}`"
      >
        <span class="sidebar-item disabled">
          <v-icon :icon="tela.icone" :color="tela.cor" size="21" />
          <span :style="tela.cor ? { color: tela.cor } : undefined">{{ tela.titulo }}</span>
        </span>
      </span>
    </template>
  </v-tooltip>
  <NuxtLink v-else :to="rotaTela(tela.id)" class="sidebar-item" :class="{ active: ativa }" @click="emit('navegar')">
    <v-icon :icon="tela.icone" :color="tela.cor" size="21" />
    <span :style="tela.cor && !ativa ? { color: tela.cor } : undefined">{{ tela.titulo }}</span>
  </NuxtLink>
</template>
