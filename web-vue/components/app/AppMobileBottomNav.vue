<script setup lang="ts">
import type { ItemMenu } from "~/types/padaria";
import { atalhosDaNavegacaoMobile } from "~/utils/navegacao-mobile";

const props = defineProps<{
  telas: ItemMenu[];
  telaAtiva: string;
  telasDesabilitadas?: string[];
  acoesNovoIds?: string[];
}>();

const emit = defineEmits<{
  (event: "abrirSaidas"): void;
  (event: "abrirTransferencias"): void;
}>();

const rota = useRoute();
const atalhos = computed(() => atalhosDaNavegacaoMobile(props.telas, props.telasDesabilitadas, props.acoesNovoIds));

// Painel e Treinamento nao sao telas do menu (`telaAtiva` fica vazia neles): quem diz se o atalho
// esta ativo e a propria rota.
const ATALHOS_POR_ROTA = new Set(["painel", "treinamento"]);
function estaAtivo(atalho: { id: string; rota?: string }) {
  return ATALHOS_POR_ROTA.has(atalho.id) ? rota.path === atalho.rota : props.telaAtiva === atalho.id;
}
</script>

<template>
  <nav
    class="navegacao-mobile"
    aria-label="Atalhos principais"
    :style="{ '--quantidade-atalhos': String(atalhos.length) }"
  >
    <template v-for="atalho in atalhos" :key="atalho.id">
      <button
        v-if="atalho.acao"
        type="button"
        class="navegacao-mobile-item"
        @click="atalho.acao === 'saidas' ? emit('abrirSaidas') : emit('abrirTransferencias')"
      >
        <v-icon :icon="atalho.icone" size="21" aria-hidden="true" />
        <span>{{ atalho.titulo }}</span>
      </button>
      <NuxtLink
        v-else
        :to="atalho.rota ?? '/'"
        class="navegacao-mobile-item"
        :class="{ ativa: estaAtivo(atalho) }"
        :aria-current="estaAtivo(atalho) ? 'page' : undefined"
      >
        <v-icon :icon="atalho.icone" size="21" aria-hidden="true" />
        <span>{{ atalho.titulo }}</span>
      </NuxtLink>
    </template>
  </nav>
</template>

<style scoped>
.navegacao-mobile {
  position: fixed;
  z-index: 1006;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  /* Com 5 atalhos (Treinamento no meio, R-242), colunas iguais cortavam "Transferências" a 390px.
     Cada coluna tem no minimo a largura do proprio rotulo e o resto da barra e dividido igual. */
  grid-template-columns: repeat(var(--quantidade-atalhos), minmax(min-content, 1fr));
  min-height: calc(64px + env(safe-area-inset-bottom));
  gap: 4px;
  padding: 8px 18px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--cx-line) 75%, transparent);
  background: color-mix(in srgb, var(--cx-surface) 82%, transparent);
  box-shadow: 0 -8px 24px color-mix(in srgb, var(--cx-canvas) 52%, transparent);
  backdrop-filter: var(--cx-chrome-blur);
  -webkit-backdrop-filter: var(--cx-chrome-blur);
}

.navegacao-mobile-item {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  min-height: 48px;
  padding: 4px;
  border: 0;
  border-radius: var(--cx-r-sm);
  background: transparent;
  color: var(--cx-ink-soft);
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

/* Sem reticencias: o rotulo inteiro define a largura minima da coluna (ver `grid-template-columns`).
   Com corte, a coluna encolhia ate o "Transferências" virar "Transferên...". Os 5 rotulos somam
   ~270px com o respiro e cabem ate em 320px. */
.navegacao-mobile-item span {
  white-space: nowrap;
}

.navegacao-mobile-item.ativa {
  background: color-mix(in srgb, var(--cx-brand) 12%, transparent);
  color: var(--cx-brand-text);
}

.navegacao-mobile-item.ativa :deep(.v-icon) {
  color: var(--cx-brand);
}

.navegacao-mobile-item:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: -2px;
}

.navegacao-mobile-item:active {
  background: var(--cx-pressed);
}

@media (width <= 420px) {
  .navegacao-mobile {
    gap: 2px;
    padding-inline: 10px;
  }
}

:global(.padaria-main.com-navegacao-mobile) {
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .navegacao-mobile {
    background: var(--cx-surface);
  }
}
</style>
