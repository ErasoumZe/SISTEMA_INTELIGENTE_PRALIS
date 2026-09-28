<script setup lang="ts">
import type { CaixaOperacional } from "~/types/padaria";

type IdAtalho = "home" | "caixa" | "notificacoes" | "tema";

const props = defineProps<{
  naHome: boolean;
  caixaAberto: CaixaOperacional | null;
  temCaixa: boolean;
  escuro: boolean;
  notificacoes: number;
}>();

const emit = defineEmits<{
  (event: "abrirPendencias"): void;
  (event: "alternarTema"): void;
}>();

const rota = useRoute();
const ultimoAtalho = ref<IdAtalho>("home");
const atalhos = computed<IdAtalho[]>(() => [
  "home",
  ...(props.temCaixa ? ["caixa" as const] : []),
  "notificacoes",
  "tema"
]);
const quantidadeVisivel = computed(() => Math.min(props.notificacoes, 99));
const atalhoDaRota = computed<IdAtalho | null>(() => {
  if (rota.path === "/") return "home";
  if (props.temCaixa && rota.path.startsWith("/caixa")) return "caixa";
  return null;
});
const atalhoAtivo = computed(() => atalhoDaRota.value ?? ultimoAtalho.value);
const indiceAtivo = computed(() => Math.max(atalhos.value.indexOf(atalhoAtivo.value), 0));
const estiloIndicador = computed(() => ({ "--indice-ativo": `${indiceAtivo.value}` }));

watch(
  atalhoDaRota,
  (atalho) => {
    if (atalho) ultimoAtalho.value = atalho;
  },
  { immediate: true }
);

function selecionar(atalho: IdAtalho) {
  ultimoAtalho.value = atalho;
}

function abrirPendencias() {
  selecionar("notificacoes");
  emit("abrirPendencias");
}

function alternarTema() {
  selecionar("tema");
  emit("alternarTema");
}
</script>

<template>
  <nav
    class="atalhos-mobile"
    :class="{ 'atalhos-mobile--sem-caixa': !temCaixa }"
    :style="estiloIndicador"
    aria-label="Atalhos rápidos"
  >
    <span class="atalhos-mobile__indicador" aria-hidden="true"></span>

    <NuxtLink
      to="/"
      class="atalhos-mobile__item"
      :class="{ 'atalhos-mobile__item--ativo': atalhoAtivo === 'home' }"
      title="Ir para o painel"
      aria-label="Ir para o painel"
      :aria-current="naHome ? 'page' : undefined"
      @click="selecionar('home')"
    >
      <v-icon icon="mdi-home-variant" size="22" />
      <span class="atalhos-mobile__legenda">Painel</span>
    </NuxtLink>

    <NuxtLink
      v-if="temCaixa"
      to="/caixa"
      class="atalhos-mobile__item"
      :class="{ 'atalhos-mobile__item--ativo': atalhoAtivo === 'caixa' }"
      :title="caixaAberto ? 'Ir para o caixa aberto' : 'Caixa fechado'"
      :aria-label="caixaAberto ? 'Ir para o caixa aberto' : 'Ir para o caixa fechado'"
      @click="selecionar('caixa')"
    >
      <v-icon :icon="caixaAberto ? 'mdi-cash-check' : 'mdi-lock-outline'" size="22" />
      <span class="atalhos-mobile__legenda">Caixa</span>
    </NuxtLink>

    <button
      type="button"
      class="atalhos-mobile__item"
      :class="{ 'atalhos-mobile__item--ativo': atalhoAtivo === 'notificacoes' }"
      title="Abrir notificações"
      aria-label="Abrir notificações"
      :aria-pressed="atalhoAtivo === 'notificacoes'"
      @click="abrirPendencias"
    >
      <v-icon icon="mdi-bell-outline" size="22" />
      <span class="atalhos-mobile__legenda">Avisos</span>
      <span v-if="notificacoes" class="atalhos-mobile__badge" :aria-label="`${notificacoes} notificações`">
        {{ quantidadeVisivel }}
      </span>
    </button>

    <button
      type="button"
      class="atalhos-mobile__item"
      :class="{ 'atalhos-mobile__item--ativo': atalhoAtivo === 'tema' }"
      :title="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
      :aria-label="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
      :aria-pressed="atalhoAtivo === 'tema'"
      @click="alternarTema"
    >
      <v-icon :icon="escuro ? 'mdi-weather-sunny' : 'mdi-weather-night'" size="22" />
      <span class="atalhos-mobile__legenda">Tema</span>
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
  grid-template-columns: repeat(4, minmax(54px, 1fr));
  gap: 6px;
  max-width: 480px;
  margin: auto;
  padding: 7px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--cx-line-soft) 78%, white 22%);
  border-radius: var(--cx-r-pill);
  background: color-mix(in srgb, var(--cx-surface) 62%, transparent);
  box-shadow:
    0 16px 42px rgb(0 0 0 / 0.28),
    inset 0 1px rgb(255 255 255 / 0.14);
  backdrop-filter: blur(22px) saturate(152%);
  -webkit-backdrop-filter: blur(22px) saturate(152%);
  animation: atalhos-mobile-entra var(--cx-dur-3) var(--cx-ease-out) both;
}

.atalhos-mobile::before {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    102deg,
    rgb(232 49 100 / 0.18),
    rgb(255 210 36 / 0.14) 33%,
    rgb(58 214 107 / 0.14) 55%,
    rgb(32 200 220 / 0.16) 72%,
    rgb(114 89 255 / 0.2)
  );
  content: "";
}

.atalhos-mobile__indicador {
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 7px;
  z-index: 0;
  width: calc((100% - 32px) / 4);
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: var(--cx-r-pill);
  background: linear-gradient(135deg, rgb(255 255 255 / 0.2), color-mix(in srgb, var(--cx-brand) 32%, transparent));
  box-shadow:
    inset 0 1px rgb(255 255 255 / 0.18),
    0 5px 16px color-mix(in srgb, var(--cx-brand) 24%, transparent);
  transform: translateX(calc(var(--indice-ativo) * (100% + 6px)));
  transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

.atalhos-mobile--sem-caixa {
  grid-template-columns: repeat(3, minmax(54px, 1fr));
}
.atalhos-mobile--sem-caixa .atalhos-mobile__indicador {
  width: calc((100% - 26px) / 3);
}

.atalhos-mobile__item {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 54px;
  min-height: 49px;
  align-content: center;
  justify-items: center;
  gap: 1px;
  border: 0;
  border-radius: var(--cx-r-pill);
  background: transparent;
  color: var(--cx-ink-soft);
  cursor: pointer;
  text-decoration: none;
  transition:
    color 220ms var(--cx-ease),
    transform 330ms cubic-bezier(0.16, 1, 0.3, 1);
}

.atalhos-mobile__item--ativo {
  color: var(--cx-ink);
  transform: scale(1.075);
}
.atalhos-mobile__item:hover {
  color: var(--cx-ink);
}
.atalhos-mobile__item:active {
  transform: scale(0.94);
}
.atalhos-mobile__legenda {
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.01em;
}

.atalhos-mobile__badge {
  position: absolute;
  top: 2px;
  right: 6px;
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
    transform: translateY(14px);
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
  .atalhos-mobile__indicador {
    top: 5px;
    bottom: 5px;
    left: 5px;
    width: calc((100% - 16px) / 4);
    transform: translateX(calc(var(--indice-ativo) * (100% + 2px)));
  }
  .atalhos-mobile--sem-caixa .atalhos-mobile__indicador {
    width: calc((100% - 14px) / 3);
  }
  .atalhos-mobile__item {
    min-width: 44px;
    min-height: 47px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .atalhos-mobile {
    animation: none;
  }
  .atalhos-mobile__indicador,
  .atalhos-mobile__item {
    transition: none;
  }
  .atalhos-mobile__item--ativo,
  .atalhos-mobile__item:active {
    transform: none;
  }
}
</style>
