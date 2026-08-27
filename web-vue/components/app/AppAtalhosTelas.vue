<script setup lang="ts">
/* anchor: springboard do iPhone — bloco quadrado, icone grande em cima, rotulo curto embaixo,
   alvo inteiro clicavel. diverge: sem brilho, sem sombra colorida e sem etiqueta de contagem;
   a cor vem das seis categorias que o sistema ja usa, nao de uma paleta de app.

   Atalhos do painel inicial (D-HOME, Etapa 2). Componente PROPRIO: o AppWorkspace esta com
   ~2.100 linhas contra o limite de ~400 do 16 R5.

   A regra de quem aparece vive em `utils/atalhos-home.ts` e e testada la. Aqui e so desenho.

   A COR: `--bloco-cor` e `--bloco-cor-soft` descem como custom property, exatamente como o
   AppMenuItem ja faz com `--item-cor`. Assim a lista de quem tem cor continua sendo uma so — o
   `CATEGORIA_POR_TELA` — e nao nasce uma copia dentro da folha de estilo. Tela sem categoria
   fica NEUTRA, que e decisao registrada no 67 §3 e nao esquecimento. */
import type { ItemMenu } from "~/types/padaria";
import { rotaTela } from "~/utils/domain";
import { montarAtalhosHome } from "~/utils/atalhos-home";
import { CATEGORIA_POR_SECAO, CATEGORIA_POR_TELA } from "~/utils/cores-categoria";

const props = defineProps<{
  telas: ItemMenu[];
  desabilitadas?: string[];
  motivos?: Record<string, string>;
}>();

const grupos = computed(() => montarAtalhosHome(props.telas, props.desabilitadas ?? [], props.motivos ?? {}));

function estiloCor(id: string) {
  const categoria = CATEGORIA_POR_TELA[id];
  if (!categoria) return undefined;
  // Aponta para os TOKENS, nao para os hex do modulo. Medido: com o hex do `soft` a pastilha
  // ficava #fbf6eb — quase branca — TAMBEM no escuro, virando ilha acesa sobre #191f26. E o
  // defeito que o proprio `cores-categoria.test.ts` documenta. O token `--cat-*-soft` e
  // redefinido no bloco escuro como tinta translucida, e `--cat-*-tinta` vira a `tintaEscura`,
  // que a suite ja mede em 4,5:1 sobre esse fundo. Assim a inversao de tema vem de graca.
  return {
    "--bloco-cor": `var(--cat-${categoria}-tinta)`,
    "--bloco-cor-soft": `var(--cat-${categoria}-soft)`,
    // A `base` e a cor CHEIA, e e ela que faz o brilho — a `tinta` ja e escurecida para servir de
    // texto e daria um brilho apagado. O brilho fica atras do conteudo, entao nao precisa passar
    // em contraste; quem precisa e o texto POR CIMA dele, medido no bloco VIS-E5b.
    "--bloco-cor-base": `var(--cat-${categoria}-base)`
  };
}
function temCor(id: string) {
  return Boolean(CATEGORIA_POR_TELA[id]);
}

// A cor da SECAO, no mesmo mapa que o menu lateral usa (VIS-E6g). A home repete as cinco secoes do
// menu, entao repetir a identidade e o que faz os dois lugares serem o MESMO sistema e nao dois
// desenhos parecidos. Secao sem cor devolve `undefined` e o CSS cai no neutro.
function estiloGrupo(titulo: string) {
  const categoria = CATEGORIA_POR_SECAO[titulo];
  return categoria ? { "--grupo-cor": `var(--cat-${categoria}-tinta)` } : undefined;
}
</script>

<template>
  <nav v-if="grupos.length" class="atalhos-home" aria-label="Atalhos das telas">
    <section v-for="grupo in grupos" :key="grupo.titulo" class="atalhos-grupo" :style="estiloGrupo(grupo.titulo)">
      <h2 class="atalhos-grupo-titulo">{{ grupo.titulo }}</h2>
      <div class="atalhos-grade">
        <template v-for="tela in grupo.telas" :key="tela.id">
          <!-- Desabilitada CONTINUA visivel, com o mesmo motivo do menu. O painel nao pode
               ensinar uma coisa e o menu outra. -->
          <v-tooltip v-if="tela.desabilitada" :text="tela.motivo">
            <template #activator="{ props: tooltipProps }">
              <span
                v-bind="tooltipProps"
                class="atalho-bloco disabled"
                :class="{ 'com-cor': temCor(tela.id) }"
                :style="estiloCor(tela.id)"
                tabindex="0"
                role="button"
                aria-disabled="true"
                :aria-label="`${tela.titulo} — ${tela.motivo}`"
              >
                <span class="atalho-bloco-icone"><v-icon :icon="tela.icone" size="22" /></span>
                <span class="atalho-bloco-rotulo">{{ tela.titulo }}</span>
              </span>
            </template>
          </v-tooltip>
          <!-- Navegacao por ROTA, e nao @click com push: preserva clique do meio, abrir em nova
               aba e teclado. Mesmo `rotaTela` que o menu usa — uma fonte so para o destino. -->
          <NuxtLink
            v-else
            :to="rotaTela(tela.id)"
            class="atalho-bloco"
            :class="{ 'com-cor': temCor(tela.id) }"
            :style="estiloCor(tela.id)"
          >
            <span class="atalho-bloco-icone"><v-icon :icon="tela.icone" size="22" /></span>
            <span class="atalho-bloco-rotulo">{{ tela.titulo }}</span>
          </NuxtLink>
        </template>
      </div>
    </section>
  </nav>
</template>
