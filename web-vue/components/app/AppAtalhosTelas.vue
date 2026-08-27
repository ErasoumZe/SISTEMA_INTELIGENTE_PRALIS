<script setup lang="ts">
// Atalhos do painel inicial (P-03a). Componente PROPRIO, e nao marcacao nova dentro do
// AppWorkspace: aquele arquivo esta com ~2.100 linhas contra o limite de ~400 do 16 R5, que o cita
// nominalmente. Do AppWorkspace saem so as tres chaves que este componente consome.
//
// A regra de quem aparece vive em `utils/atalhos-home.ts` e e testada la. Aqui e so desenho.
import type { ItemMenu } from "~/types/padaria";
import { rotaTela } from "~/utils/domain";
import { montarAtalhosHome } from "~/utils/atalhos-home";

const props = defineProps<{
  telas: ItemMenu[];
  desabilitadas?: string[];
  motivos?: Record<string, string>;
}>();

const grupos = computed(() => montarAtalhosHome(props.telas, props.desabilitadas ?? [], props.motivos ?? {}));
</script>

<template>
  <nav v-if="grupos.length" class="atalhos-home" aria-label="Atalhos das telas">
    <section v-for="grupo in grupos" :key="grupo.titulo" class="atalhos-grupo">
      <h2 class="atalhos-grupo-titulo">{{ grupo.titulo }}</h2>
      <div class="atalhos-grade">
        <template v-for="tela in grupo.telas" :key="tela.id">
          <!-- Desabilitada CONTINUA visivel, com o mesmo motivo do menu. Marcacao espelhada do
               AppMenuItem de proposito: o painel nao pode ensinar uma coisa e o menu outra. -->
          <v-tooltip v-if="tela.desabilitada" :text="tela.motivo">
            <template #activator="{ props: tooltipProps }">
              <span
                v-bind="tooltipProps"
                class="atalho-card disabled"
                tabindex="0"
                role="button"
                aria-disabled="true"
                :aria-label="`${tela.titulo} — ${tela.motivo}`"
              >
                <v-icon :icon="tela.icone" :color="tela.cor" size="22" />
                <span class="atalho-rotulo">{{ tela.titulo }}</span>
              </span>
            </template>
          </v-tooltip>
          <!-- Navegacao por ROTA, e nao @click com push: preserva clique do meio, abrir em nova
               aba e teclado. Mesmo `rotaTela` que o menu usa — uma fonte so para o destino. -->
          <NuxtLink v-else :to="rotaTela(tela.id)" class="atalho-card">
            <v-icon :icon="tela.icone" :color="tela.cor" size="22" />
            <span class="atalho-rotulo">{{ tela.titulo }}</span>
          </NuxtLink>
        </template>
      </div>
    </section>
  </nav>
</template>
