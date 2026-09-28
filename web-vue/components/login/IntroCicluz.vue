<script setup lang="ts">
import { computed, useId } from "vue";
import officialSvgRaw from "~/assets/cicluz-simbolo-path.svg?raw";

const emit = defineEmits<{ concluida: [] }>();

const DURACAO_INTRO_MS = 2_600;
const uid = useId().replace(/:/g, "");
const pathDaMarca = officialSvgRaw.match(/<path[^>]*d="([^"]+)"/i)?.[1] ?? "";
const ids = {
  brilho: `intro-cicluz-brilho-${uid}`,
  aura: `intro-cicluz-aura-${uid}`,
  gradiente: `intro-cicluz-gradiente-${uid}`
};

let temporizador: number | undefined;

onMounted(() => {
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  temporizador = window.setTimeout(() => emit("concluida"), reduzirMovimento ? 120 : DURACAO_INTRO_MS);
});

onBeforeUnmount(() => {
  if (temporizador) window.clearTimeout(temporizador);
});

const estiloDuracao = computed(() => ({ "--intro-duracao": `${DURACAO_INTRO_MS}ms` }));
</script>

<template>
  <!-- O painel real ja existe por tras desta camada. O vidro so se abre no ultimo trecho, evitando
       que a pintura clara de montagem apareca como flash branco. A marca e SVG puro em todas as escalas. -->
  <section class="intro-cicluz" :style="estiloDuracao" aria-hidden="true">
    <div class="intro-cicluz__base"></div>
    <div class="intro-cicluz__vidro"></div>
    <div class="intro-cicluz__luzes"></div>
    <div class="intro-cicluz__radiancia"></div>

    <div class="intro-cicluz__marca">
      <svg class="intro-cicluz__svg" viewBox="0 0 3986 4387" shape-rendering="geometricPrecision" focusable="false">
        <defs>
          <linearGradient :id="ids.gradiente" x1="6%" y1="88%" x2="91%" y2="12%">
            <!-- A cor viaja pelo traco; nao e uma troca abrupta de cor no CSS. -->
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-0.85 0; 0.65 0; -0.85 0"
              dur="1.9s"
              repeatCount="indefinite"
            />
            <stop offset="0%" stop-color="#e83164" />
            <stop offset="17%" stop-color="#ff5b22" />
            <stop offset="34%" stop-color="#ffd224" />
            <stop offset="51%" stop-color="#66d945" />
            <stop offset="69%" stop-color="#20c8dc" />
            <stop offset="85%" stop-color="#7259ff" />
            <stop offset="100%" stop-color="#d932b7" />
          </linearGradient>
          <filter :id="ids.aura" x="-42%" y="-42%" width="184%" height="184%">
            <feGaussianBlur stdDeviation="48" />
          </filter>
          <filter :id="ids.brilho" x="-28%" y="-28%" width="156%" height="156%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>
        <path
          class="intro-cicluz__aura"
          :d="pathDaMarca"
          :filter="`url(#${ids.aura})`"
          fill="none"
          :stroke="`url(#${ids.gradiente})`"
          stroke-width="230"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          class="intro-cicluz__brilho"
          :d="pathDaMarca"
          :filter="`url(#${ids.brilho})`"
          fill="none"
          :stroke="`url(#${ids.gradiente})`"
          stroke-width="216"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <!-- Um ponto de luz percorre a marca, como uma energia passando pelo circuito da Cicluz. -->
        <path
          class="intro-cicluz__fagulha"
          :d="pathDaMarca"
          :filter="`url(#${ids.brilho})`"
          fill="none"
          stroke="#ffffff"
          stroke-width="216"
          stroke-linecap="round"
          stroke-linejoin="round"
          pathLength="1000"
          stroke-dasharray="88 912"
          stroke-dashoffset="-88"
        >
          <animate attributeName="stroke-dashoffset" values="-88; -1088" dur="1.55s" repeatCount="indefinite" />
        </path>
        <path
          class="intro-cicluz__traco"
          :d="pathDaMarca"
          fill="none"
          :stroke="`url(#${ids.gradiente})`"
          stroke-width="200"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <div class="intro-cicluz__carregamento">
      <div class="intro-cicluz__trilho">
        <span class="intro-cicluz__preenchimento"></span>
        <span class="intro-cicluz__marcador"></span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.intro-cicluz {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #0b1018;
  pointer-events: auto;
  will-change: opacity;
  animation: intro-palco var(--intro-duracao) linear both;
}
.intro-cicluz__base,
.intro-cicluz__vidro,
.intro-cicluz__luzes,
.intro-cicluz__radiancia {
  position: absolute;
  inset: -5%;
  pointer-events: none;
}
.intro-cicluz__base {
  background: #0b1018;
  animation: intro-base var(--intro-duracao) linear both;
}
.intro-cicluz__vidro {
  background:
    linear-gradient(120deg, rgb(9 14 24 / 0.66), rgb(15 12 34 / 0.38) 48%, rgb(12 18 27 / 0.62)), rgb(9 14 24 / 0.54);
  backdrop-filter: blur(28px) saturate(150%);
  -webkit-backdrop-filter: blur(28px) saturate(150%);
  animation: intro-vidro var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__luzes {
  background:
    radial-gradient(58% 58% at 13% 88%, rgb(35 205 219 / 0.52), transparent 70%),
    radial-gradient(58% 56% at 87% 19%, rgb(255 72 56 / 0.48), transparent 70%),
    radial-gradient(46% 50% at 50% -2%, rgb(255 215 42 / 0.36), transparent 68%),
    radial-gradient(46% 50% at 50% 56%, rgb(117 78 255 / 0.24), transparent 72%);
  filter: saturate(1.24);
  mix-blend-mode: screen;
  animation: intro-luzes var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__radiancia {
  inset: 12%;
  z-index: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 28% 72%, rgb(255 94 37 / 0.48), transparent 27%),
    radial-gradient(circle at 72% 24%, rgb(110 89 255 / 0.44), transparent 30%),
    radial-gradient(circle at 48% 48%, rgb(38 205 215 / 0.4), transparent 52%);
  filter: blur(42px) saturate(1.35);
  animation: intro-radiancia var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__marca {
  position: relative;
  z-index: 1;
  width: clamp(152px, 27vmin, 282px);
  aspect-ratio: 3986 / 4387;
  will-change: transform, opacity;
  animation: intro-marca var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.intro-cicluz__aura,
.intro-cicluz__brilho,
.intro-cicluz__traco {
  transform-box: fill-box;
  transform-origin: center;
}
.intro-cicluz__aura {
  opacity: 0.38;
  animation: intro-pulso 1.15s ease-in-out infinite alternate;
}
.intro-cicluz__brilho {
  opacity: 0.5;
  animation: intro-pulso 0.82s 120ms ease-in-out infinite alternate-reverse;
}
.intro-cicluz__traco {
  /* O traco principal nunca recebe blur: e ele que mantem a marca nitida no zoom. */
  filter: drop-shadow(0 0 2px rgb(255 255 255 / 0.34));
}
.intro-cicluz__fagulha {
  opacity: 0.86;
  mix-blend-mode: screen;
}
.intro-cicluz__carregamento {
  position: absolute;
  right: max(24px, env(safe-area-inset-right));
  bottom: max(26px, env(safe-area-inset-bottom));
  left: max(24px, env(safe-area-inset-left));
  z-index: 2;
  max-width: 440px;
  margin: auto;
  animation: intro-carregamento var(--intro-duracao) linear both;
}
.intro-cicluz__trilho {
  position: relative;
  height: 5px;
  overflow: visible;
  border: 1px solid rgb(255 255 255 / 0.32);
  border-radius: var(--cx-r-pill);
  background: rgb(255 255 255 / 0.12);
  box-shadow:
    inset 0 1px 1px rgb(0 0 0 / 0.26),
    0 4px 20px rgb(0 0 0 / 0.26);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.intro-cicluz__preenchimento {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #e83164, #ff5b22 24%, #ffd224 43%, #66d945 59%, #20c8dc 75%, #7259ff 100%);
  box-shadow: 0 0 16px rgb(114 89 255 / 0.78);
  animation: intro-progresso 1.66s 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__marcador {
  position: absolute;
  top: 50%;
  left: 0;
  width: 14px;
  height: 14px;
  border: 1px solid rgb(255 255 255 / 0.66);
  border-radius: 5px;
  background: rgb(255 255 255 / 0.34);
  box-shadow:
    0 2px 11px rgb(0 0 0 / 0.34),
    inset 0 1px rgb(255 255 255 / 0.52);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transform: translate(-50%, -50%);
  animation: intro-marcador 1.66s 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes intro-palco {
  0%,
  76% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes intro-base {
  0% {
    opacity: 1;
  }
  38% {
    opacity: 0.52;
  }
  100% {
    opacity: 0;
  }
}
@keyframes intro-vidro {
  0% {
    opacity: 1;
    transform: scale(1.025);
  }
  44% {
    opacity: 0.86;
    transform: scale(1.016);
  }
  76% {
    opacity: 0.72;
    transform: scale(1.008);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
@keyframes intro-luzes {
  0% {
    opacity: 0.64;
    transform: scale(0.96) rotate(-3deg);
  }
  42% {
    opacity: 1;
    transform: scale(1.08) rotate(1deg);
  }
  72% {
    opacity: 0.82;
    transform: scale(1.16) rotate(3deg);
  }
  100% {
    opacity: 0;
    transform: scale(1.24) rotate(5deg);
  }
}
@keyframes intro-radiancia {
  0% {
    opacity: 0;
    transform: scale(0.54) rotate(-18deg);
  }
  18% {
    opacity: 0.88;
    transform: scale(0.9) rotate(-7deg);
  }
  56% {
    opacity: 1;
    transform: scale(1.2) rotate(8deg);
  }
  82% {
    opacity: 0.58;
    transform: scale(1.8) rotate(15deg);
  }
  100% {
    opacity: 0;
    transform: scale(2.3) rotate(22deg);
  }
}
@keyframes intro-marca {
  0% {
    opacity: 0;
    transform: scale(0.56);
  }
  18% {
    opacity: 1;
    transform: scale(0.92);
  }
  56% {
    opacity: 1;
    transform: scale(1.04);
  }
  80% {
    opacity: 0.94;
    transform: scale(3.25);
  }
  100% {
    opacity: 0;
    transform: scale(7.8);
  }
}
@keyframes intro-pulso {
  from {
    opacity: 0.58;
  }
  to {
    opacity: 1;
  }
}
@keyframes intro-carregamento {
  0%,
  78% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes intro-progresso {
  to {
    width: 100%;
  }
}
@keyframes intro-marcador {
  to {
    left: 100%;
  }
}
@media (max-width: 560px) {
  .intro-cicluz__carregamento {
    right: max(20px, env(safe-area-inset-right));
    bottom: max(20px, env(safe-area-inset-bottom));
    left: max(20px, env(safe-area-inset-left));
  }
  @keyframes intro-marca {
    0% {
      opacity: 0;
      transform: scale(0.56);
    }
    18% {
      opacity: 1;
      transform: scale(0.92);
    }
    56% {
      opacity: 1;
      transform: scale(1.04);
    }
    80% {
      opacity: 0.94;
      transform: scale(2.42);
    }
    100% {
      opacity: 0;
      transform: scale(6.2);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .intro-cicluz {
    animation-duration: 120ms;
  }
  .intro-cicluz__base,
  .intro-cicluz__vidro,
  .intro-cicluz__luzes,
  .intro-cicluz__radiancia,
  .intro-cicluz__marca,
  .intro-cicluz__aura,
  .intro-cicluz__brilho,
  .intro-cicluz__fagulha,
  .intro-cicluz__carregamento,
  .intro-cicluz__preenchimento,
  .intro-cicluz__marcador {
    animation: none;
  }
  .intro-cicluz__base,
  .intro-cicluz__vidro,
  .intro-cicluz__luzes,
  .intro-cicluz__marca,
  .intro-cicluz__carregamento {
    opacity: 0;
  }
  .intro-cicluz__preenchimento {
    width: 100%;
  }
  .intro-cicluz__marcador {
    left: 100%;
  }
}
</style>
