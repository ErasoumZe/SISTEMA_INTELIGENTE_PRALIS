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
  /** Menu recolhido (769-1024px): so o icone aparece, entao o rotulo vira tooltip. */
  rail?: boolean;
}>();

const emit = defineEmits<{ (event: "navegar"): void }>();

const ativa = computed(() => props.tela.id === props.telaAtiva);

/* TOOLTIP-DO-RAIL
   No rail (769-1024px) o rotulo existe mas fica em `opacity: 0` dentro de uma coluna de 0fr
   (VIS-12): o leitor de tela CONTINUA anunciando "link Entradas" — medido na arvore ARIA —, mas
   quem enxerga ve so o icone. O tooltip cobre exatamente esse buraco, e por isso nao aparece com o
   menu aberto: la o rotulo esta na tela e o tooltip vira ruido.

   `v-if="rail"` e nao `:disabled="!rail"`, e a diferenca foi MEDIDA: com `disabled` o Vuetify ainda
   injeta um `aria-describedby` no link, apontando para um tooltip que ele nunca renderiza. Eram ~30
   referencias ARIA penduradas em TODA largura — um defeito de acessibilidade criado pelo conserto
   de usabilidade. Com `v-if`, fora do rail o componente nao existe e o link volta ao que era.

   `activator="parent"` evita duplicar a marcacao do link so para embrulha-la num
   `<template #activator>` — o AppMenuItem existe justamente para o item nao viver em dois lugares
   (PROJECT_BRAIN/17, D6).

   `:transition="false"` desliga a animacao de entrada para todo mundo, nao so em
   `prefers-reduced-motion`: passar o mouse pela coluna e o gesto mais repetido da casca, e animar a
   entrada de ~30 tooltips em sequencia atrasa a leitura em vez de ajudar. Mesma regra de frequencia
   do VIS-E6i, e ela ja atende o reduced-motion por construcao — nao ha movimento a reduzir.

   O texto e `tela.titulo`, o MESMO que o `<span>` ao lado ja mostra. Nao ha texto novo.

   E POR QUE ISTO ESTA AQUI E NAO NO TEMPLATE: comentario de template o Vue RENDERIZA no DOM. Com a
   explicacao la, o DOM da sidebar em 1440 saltou de 14.615 para 57.152 bytes — a mesma explicacao
   repetida uma vez por item de menu. Medido. Comentario longo mora no script. */

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
          <v-icon :icon="tela.icone" size="21" />
          <span>{{ tela.titulo }}</span>
        </span>
      </span>
    </template>
  </v-tooltip>
  <NuxtLink
    v-else
    :to="rotaTela(tela.id)"
    class="sidebar-item"
    :class="{ active: ativa }"
    @click="emit('navegar')"
  >
    <v-icon :icon="tela.icone" size="21" />
    <span>{{ tela.titulo }}</span>
    <v-tooltip v-if="rail" activator="parent" location="right" :text="tela.titulo" :transition="false" />
  </NuxtLink>
</template>
