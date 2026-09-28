<script setup lang="ts">
const props = defineProps<{
  naHome: boolean;
  caixaAberto: boolean | null;
  escuro: boolean;
  notificacoes: number;
}>();

const emit = defineEmits<{
  (event: "abrirPendencias"): void;
  (event: "alternarTema"): void;
}>();

const quantidadeVisivel = computed(() => Math.min(props.notificacoes, 99));
</script>

<template>
  <nav
    class="atalhos-mobile"
    :class="{ 'atalhos-mobile--sem-caixa': caixaAberto === null }"
    aria-label="Atalhos rÃ¡pidos"
  >
    <NuxtLink
      to="/"
      class="atalhos-mobile__item"
      title="Ir para o painel"
      aria-label="Ir para o painel"
      :aria-current="naHome ? 'page' : undefined"
    >
      <v-icon icon="mdi-home-variant" size="22" />
    </NuxtLink>

    <NuxtLink
      v-if="caixaAberto !== null"
      to="/caixa"
      class="atalhos-mobile__item"
      :title="caixaAberto ? 'Ir para o caixa aberto' : 'Caixa fechado'"
      :aria-label="caixaAberto ? 'Ir para o caixa aberto' : 'Ir para o caixa fechado'"
    >
      <v-icon :icon="caixaAberto ? 'mdi-cash-check' : 'mdi-lock-outline'" size="22" />
    </NuxtLink>

    <button
      type="button"
      class="atalhos-mobile__item"
      title="Abrir notificaÃ§Ãµes"
      aria-label="Abrir notificaÃ§Ãµes"
      @click="emit('abrirPendencias')"
    >
      <v-icon icon="mdi-bell-outline" size="22" />
      <span v-if="notificacoes" class="atalhos-mobile__badge" :aria-label="`${notificacoes} notificaÃ§Ãµes`">
        {{ quantidadeVisivel }}
      </span>
    </button>

    <button
      type="button"
      class="atalhos-mobile__item"
      :title="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
      :aria-label="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
      @click="emit('alternarTema')"
    >
      <v-icon :icon="escuro ? 'mdi-weather-sunny' : 'mdi-weather-night'" size="22" />
    </button>
  </nav>
</template>

<style scoped>
.atalhos-mobile {
  position: fixed;
  z-index: 1005;
  right: max(12px, env(safe-area-inset-right));
  bottom: max(12px, env(safe-area-inset-bottom));
  left: max(12px, env(safe-area-inset-left));
  display: grid;
  grid-template-columns: repeat(4, minmax(44px, 1fr));
  gap: 6px;
  max-width: 440px;
  margin: auto;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-pill);
  background: color-mix(in srgb, var(--cx-surface) 66%, transparent);
  box-shadow: var(--cx-e-2);
  padding: 7px;
  backdrop-filter: var(--cx-chrome-blur);
  -webkit-backdrop-filter: var(--cx-chrome-blur);
  animation: atalhos-mobile-entra var(--cx-dur-3) var(--cx-ease-out) both;
}

.atalhos-mobile::before {
  position: absolute;
  inset: 1px;
  z-index: -1;
  border-radius: inherit;
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--cat-despesas-base) 13%, transparent),
    color-mix(in srgb, var(--cat-entradas-base) 13%, transparent),
    color-mix(in srgb, var(--cat-retiradas-base) 13%, transparent)
  );
  content: "";
}

.atalhos-mobile__item {
  position: relative;
  display: grid;
  min-width: 44px;
  min-height: 44px;
  place-items: center;
  border: 0;
  border-radius: var(--cx-r-pill);
  background: transparent;
  color: var(--cx-ink-soft);
  cursor: pointer;
  text-decoration: none;
  transition:
    background var(--cx-dur-1) var(--cx-ease),
    color var(--cx-dur-1) var(--cx-ease),
    transform var(--cx-dur-1) var(--cx-ease);
}

.atalhos-mobile--sem-caixa {
  grid-template-columns: repeat(3, minmax(44px, 1fr));
}

.atalhos-mobile__item[aria-current="page"] {
  background: var(--cx-brand-wash);
  color: var(--cx-brand-text);
}

.atalhos-mobile__item:hover {
  background: var(--cx-hover);
  color: var(--cx-ink);
}

.atalhos-mobile__item:active {
  background: var(--cx-pressed);
  transform: translateY(1px);
}

.atalhos-mobile__badge {
  position: absolute;
  top: 3px;
  right: 4px;
  display: grid;
  min-width: 17px;
  min-height: 17px;
  place-items: center;
  border: 1px solid var(--cx-surface);
  border-radius: var(--cx-r-pill);
  background: var(--cx-negative);
  color: var(--cx-brand-on);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  padding-inline: 3px;
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .atalhos-mobile {
    background: var(--cx-surface);
  }
}

@keyframes atalhos-mobile-entra {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (width > 768px) {
  .atalhos-mobile {
    display: none;
  }
}

@media (width <= 390px) {
  .atalhos-mobile {
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
    left: max(8px, env(safe-area-inset-left));
    gap: 2px;
    padding: 5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .atalhos-mobile {
    animation: none;
  }

  .atalhos-mobile__item:active {
    transform: none;
  }
}
</style>
