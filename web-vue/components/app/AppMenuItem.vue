<script setup lang="ts">
// Uma linha do menu lateral (link ou variante desabilitada com tooltip). Extraido do AppShell para
// ser reusado tanto na raiz quanto DENTRO da categoria "Lancamentos" (PROJECT_BRAIN/17, D6) — sem
// duplicar a marcacao do item em dois lugares.
import type { ItemMenu } from "~/types/padaria";
import { rotaTela } from "~/utils/domain";
import { CATEGORIA_POR_TELA, CORES_CATEGORIA } from "~/utils/cores-categoria";

const props = defineProps<{
  tela: ItemMenu;
  telaAtiva: string;
  desabilitada: boolean;
  motivo: string;
}>();

const emit = defineEmits<{ (event: "navegar"): void }>();

const ativa = computed(() => props.tela.id === props.telaAtiva);

// A cor da categoria desce para o CSS como custom property no proprio item. O `:hover` e o `.active`
// coloridos (main.css) leem `--item-cor` / `--item-cor-faixa` — assim a lista de quem tem cor
// continua sendo uma so, a do `CATEGORIA_POR_TELA`, e nao nasce uma copia dentro da folha de estilo.
// `com-cor` existe para o seletor nao depender de casar texto do atributo style.
//
// Sao DUAS cores porque o ATIVO e preenchimento solido com texto branco, e a base reprova em 4,5:1
// para entradas, transferencias e mercadorias. `faixa` e a variante medida para o branco por cima.
const escalaDaTela = computed(() => {
  const categoria = CATEGORIA_POR_TELA[props.tela.id];
  return categoria ? CORES_CATEGORIA[categoria] : null;
});
const temCor = computed(() => escalaDaTela.value !== null);
const estiloCor = computed(() =>
  escalaDaTela.value
    ? { "--item-cor": escalaDaTela.value.base, "--item-cor-faixa": escalaDaTela.value.faixa }
    : undefined
);
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
  <NuxtLink
    v-else
    :to="rotaTela(tela.id)"
    class="sidebar-item"
    :class="{ active: ativa, 'com-cor': temCor }"
    :style="estiloCor"
    @click="emit('navegar')"
  >
    <v-icon :icon="tela.icone" :color="tela.cor" size="21" />
    <span :style="tela.cor && !ativa ? { color: tela.cor } : undefined">{{ tela.titulo }}</span>
  </NuxtLink>
</template>
