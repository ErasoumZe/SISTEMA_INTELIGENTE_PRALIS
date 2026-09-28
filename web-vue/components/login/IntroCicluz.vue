<script setup lang="ts">
import { computed } from "vue";

const emit = defineEmits<{ concluida: [] }>();
const props = withDefaults(defineProps<{ pronta?: boolean }>(), { pronta: true });

const DURACAO_INTRO_MS = 2_950;
const assinaturaFinal = [..."Sistema inteligente"];
const particulasFinais = [
  { x: -88, y: -38, cor: "#e83164", atraso: 2290 },
  { x: -67, y: -76, cor: "#ff9b28", atraso: 2330 },
  { x: -34, y: -92, cor: "#ffd224", atraso: 2270 },
  { x: 6, y: -82, cor: "#66d945", atraso: 2360 },
  { x: 46, y: -76, cor: "#20c8dc", atraso: 2305 },
  { x: 82, y: -43, cor: "#7259ff", atraso: 2350 },
  { x: 98, y: 4, cor: "#d932b7", atraso: 2285 },
  { x: 74, y: 52, cor: "#e83164", atraso: 2380 },
  { x: 38, y: 84, cor: "#ff9b28", atraso: 2320 },
  { x: -4, y: 97, cor: "#ffd224", atraso: 2370 },
  { x: -48, y: 80, cor: "#66d945", atraso: 2310 },
  { x: -82, y: 48, cor: "#20c8dc", atraso: 2390 },
  { x: -104, y: 3, cor: "#7259ff", atraso: 2340 },
  { x: -55, y: -6, cor: "#d932b7", atraso: 2295 },
  { x: 52, y: 12, cor: "#e83164", atraso: 2400 },
  { x: 8, y: 48, cor: "#ffd224", atraso: 2335 }
];
let temporizador: number | undefined;

function iniciarIntro() {
  if (!props.pronta || temporizador) return;
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  temporizador = window.setTimeout(() => emit("concluida"), reduzirMovimento ? 120 : DURACAO_INTRO_MS);
}

onMounted(iniciarIntro);
watch(() => props.pronta, iniciarIntro);

onBeforeUnmount(() => {
  if (temporizador) window.clearTimeout(temporizador);
});

const estiloDuracao = computed(() => ({ "--intro-duracao": `${DURACAO_INTRO_MS}ms` }));
</script>

<template>
  <!-- A marca da intro usa a mesma geometria oficial da Cicluz, em SVG, para o zoom nunca rasterizar. -->
  <section class="intro-cicluz" :class="{ 'intro-cicluz--pronta': pronta }" :style="estiloDuracao" aria-hidden="true">
    <div class="intro-cicluz__base"></div>
    <div class="intro-cicluz__vidro"></div>
    <div class="intro-cicluz__cores"></div>
    <div class="intro-cicluz__luz-central"></div>
    <!-- Arcos SVG com ponta arredondada: diferentes de uma mascara CSS, eles nunca terminam com
         corte reto nem encostam no limite da viewport. O halo esta separado do traco nitido. -->
    <svg class="intro-cicluz__orbitas" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="intro-orbita-cor" x1="4%" y1="92%" x2="92%" y2="8%">
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-0.35 0; 0.35 0; -0.35 0"
            dur="2.4s"
            repeatCount="indefinite"
          />
          <stop offset="0%" stop-color="#e83164" />
          <stop offset="24%" stop-color="#ff9b28" />
          <stop offset="43%" stop-color="#ffd224" />
          <stop offset="61%" stop-color="#20c8dc" />
          <stop offset="79%" stop-color="#7259ff" />
          <stop offset="100%" stop-color="#d932b7" />
        </linearGradient>
        <filter id="intro-orbita-brilho" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.25" />
        </filter>
      </defs>
      <g class="intro-cicluz__orbita-halo" filter="url(#intro-orbita-brilho)">
        <circle
          cx="50"
          cy="50"
          r="43"
          fill="none"
          stroke="url(#intro-orbita-cor)"
          stroke-width="2.8"
          pathLength="100"
          stroke-dasharray="59 41"
          stroke-dashoffset="-5"
        />
        <circle
          cx="50"
          cy="50"
          r="29"
          fill="none"
          stroke="url(#intro-orbita-cor)"
          stroke-width="2.5"
          pathLength="100"
          stroke-dasharray="46 54"
          stroke-dashoffset="18"
        />
      </g>
      <g class="intro-cicluz__orbita-traco">
        <circle
          cx="50"
          cy="50"
          r="43"
          fill="none"
          stroke="url(#intro-orbita-cor)"
          stroke-width="1.34"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="59 41"
          stroke-dashoffset="-5"
        />
        <circle
          cx="50"
          cy="50"
          r="29"
          fill="none"
          stroke="url(#intro-orbita-cor)"
          stroke-width="1.12"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="46 54"
          stroke-dashoffset="18"
        />
      </g>
    </svg>

    <div class="intro-cicluz__marca">
      <LoginIntroMarcaVetorial />
    </div>

    <div class="intro-cicluz__mensagem-final">
      <span class="intro-cicluz__nome-final" role="img" aria-label="Cicluz"></span>
      <p class="intro-cicluz__assinatura-final" aria-label="Sistema inteligente">
        <span
          v-for="(letra, indice) in assinaturaFinal"
          :key="`assinatura-${indice}`"
          class="intro-cicluz__letra intro-cicluz__letra--assinatura"
          :style="{ animationDelay: `${1750 + indice * 17}ms` }"
          >{{ letra === " " ? "\u00A0" : letra }}</span
        >
      </p>
    </div>

    <div class="intro-cicluz__particulas" aria-hidden="true">
      <i
        v-for="(particula, indice) in particulasFinais"
        :key="`particula-${indice}`"
        :style="`--particula-x:${particula.x}px;--particula-y:${particula.y}px;--particula-cor:${particula.cor};--particula-atraso:${particula.atraso}ms`"
      ></i>
    </div>

    <div class="intro-cicluz__carregamento">
      <div class="intro-cicluz__trilho">
        <span class="intro-cicluz__preenchimento"></span>
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
  background: #080c14;
  pointer-events: auto;
  will-change: opacity;
  animation: intro-palco var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-play-state: paused;
}
.intro-cicluz--pronta {
  animation-play-state: running;
}
.intro-cicluz__base,
.intro-cicluz__vidro,
.intro-cicluz__cores,
.intro-cicluz__luz-central,
.intro-cicluz__orbitas {
  position: absolute;
  inset: -6%;
  pointer-events: none;
}
/* Esta base so abre no final. Assim, se a API atrasar, aparece preto — nunca o fallback branco. */
.intro-cicluz__base {
  background: #080c14;
  animation: intro-base var(--intro-duracao) cubic-bezier(0.7, 0, 0.84, 0) both;
}
.intro-cicluz__vidro {
  background:
    linear-gradient(128deg, rgb(3 7 14 / 0.93), rgb(13 13 29 / 0.78) 49%, rgb(8 12 20 / 0.91)), rgb(5 9 16 / 0.78);
  backdrop-filter: blur(22px) saturate(0.16) grayscale(0.9) brightness(0.5);
  -webkit-backdrop-filter: blur(22px) saturate(0.16) grayscale(0.9) brightness(0.5);
  animation: intro-vidro var(--intro-duracao) cubic-bezier(0.7, 0, 0.84, 0) both;
}
.intro-cicluz__cores {
  background:
    radial-gradient(64% 68% at 6% 91%, rgb(16 184 207 / 0.38), transparent 69%),
    radial-gradient(64% 60% at 95% 14%, rgb(224 52 81 / 0.32), transparent 70%),
    radial-gradient(44% 52% at 48% -5%, rgb(104 82 255 / 0.34), transparent 70%),
    radial-gradient(38% 44% at 48% 55%, rgb(255 205 34 / 0.18), transparent 71%);
  filter: saturate(1.25);
  animation: intro-cores var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__luz-central {
  inset: 24%;
  z-index: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 20% 72%, rgb(232 49 100 / 0.52), transparent 22%),
    radial-gradient(circle at 78% 25%, rgb(38 207 222 / 0.48), transparent 25%),
    radial-gradient(circle at 49% 45%, rgb(255 211 38 / 0.28), transparent 48%);
  filter: blur(28px) saturate(1.25);
  animation: intro-luz-central var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__orbitas {
  z-index: 0;
  inset: 0;
  width: min(90vw, 90vh);
  height: min(90vw, 90vh);
  margin: auto;
  overflow: visible;
  filter: saturate(1.2);
  animation: intro-orbitas var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__orbita-halo {
  opacity: 0.6;
}
.intro-cicluz__orbita-traco {
  opacity: 0.98;
}
.intro-cicluz__marca {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  will-change: transform, opacity;
  animation: intro-marca var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__mensagem-final {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: grid;
  justify-items: center;
  transform: translate(-50%, -50%);
  color: #fff;
  pointer-events: none;
  animation: intro-mensagem var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz__nome-final,
.intro-cicluz__assinatura-final {
  margin: 0;
  white-space: pre;
}
.intro-cicluz__nome-final {
  display: block;
  width: clamp(142px, 23vmin, 270px);
  height: clamp(32px, 5.1vmin, 60px);
  background: linear-gradient(90deg, #e83164, #ff9b28 21%, #ffe34b 38%, #20c8dc 63%, #7259ff 80%, #d932b7);
  background-size: 230% 100%;
  background-position: 0% 50%;
  -webkit-mask: url("/cicluz/cicluz-palavra.svg") center / contain no-repeat;
  mask: url("/cicluz/cicluz-palavra.svg") center / contain no-repeat;
  filter: drop-shadow(0 0 13px rgb(108 124 255 / 0.46));
  animation:
    intro-nome-final var(--intro-duracao) cubic-bezier(0.16, 1, 0.3, 1) both,
    intro-nome-fluxo 1.8s linear infinite;
}
.intro-cicluz__assinatura-final {
  display: flex;
  margin-top: 4px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(11px, 1.35vmin, 15px);
  font-weight: 600;
  letter-spacing: 0.13em;
  color: rgb(225 231 255 / 0.86);
}
.intro-cicluz__letra {
  display: inline-block;
  opacity: 0;
  transform: translateY(7px) scale(0.92);
  animation-name: intro-letra;
  animation-duration: 220ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-fill-mode: both;
}
.intro-cicluz__letra--assinatura {
  animation-duration: 170ms;
}
.intro-cicluz__particulas {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
.intro-cicluz__particulas i {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--particula-cor);
  box-shadow:
    0 0 8px var(--particula-cor),
    0 0 17px color-mix(in srgb, var(--particula-cor) 70%, transparent);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.3);
  animation: intro-particula 520ms var(--particula-atraso) cubic-bezier(0.16, 1, 0.3, 1) both;
}
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__base,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__vidro,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__cores,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__luz-central,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__orbitas,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__marca,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__mensagem-final,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__nome-final,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__letra,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__particulas i,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__carregamento,
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__preenchimento {
  animation-play-state: paused;
}
.intro-cicluz:not(.intro-cicluz--pronta) .intro-cicluz__carregamento {
  opacity: 0;
}
.intro-cicluz__carregamento {
  position: absolute;
  right: max(24px, env(safe-area-inset-right));
  bottom: max(26px, env(safe-area-inset-bottom));
  left: max(24px, env(safe-area-inset-left));
  z-index: 2;
  max-width: clamp(88px, 18vw, 180px);
  margin: auto;
  animation: intro-carregamento var(--intro-duracao) cubic-bezier(0.7, 0, 0.84, 0) both;
}
.intro-cicluz__trilho {
  position: relative;
  height: 3px;
  overflow: hidden;
  border-radius: var(--cx-r-pill);
  background: rgb(255 255 255 / 0.16);
  box-shadow: inset 0 1px rgb(255 255 255 / 0.12);
}
.intro-cicluz__preenchimento {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #e83164, #ff5b22 24%, #ffd224 43%, #66d945 59%, #20c8dc 75%, #7259ff 100%);
  box-shadow:
    0 0 9px rgb(255 213 43 / 0.98),
    0 0 20px rgb(32 200 220 / 0.84),
    0 0 28px rgb(114 89 255 / 0.64);
  animation: intro-progresso 2.55s 110ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes intro-palco {
  0%,
  92% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes intro-base {
  0%,
  35% {
    opacity: 1;
  }
  48% {
    opacity: 0.62;
  }
  72% {
    opacity: 0.16;
  }
  100% {
    opacity: 0;
  }
}
@keyframes intro-vidro {
  0%,
  35% {
    opacity: 0.93;
    transform: scale(1.018);
  }
  50% {
    opacity: 0.66;
    transform: scale(1.01);
  }
  74% {
    opacity: 0.26;
    transform: scale(1.006);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
@keyframes intro-cores {
  0% {
    opacity: 0.46;
    transform: scale(0.96) rotate(-3deg);
  }
  42% {
    opacity: 0.86;
    transform: scale(1.07) rotate(1deg);
  }
  66% {
    opacity: 0.34;
    transform: scale(1.16) rotate(3deg);
  }
  100% {
    opacity: 0;
    transform: scale(1.22) rotate(5deg);
  }
}
@keyframes intro-luz-central {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  20% {
    opacity: 0.72;
    transform: scale(0.86);
  }
  58% {
    opacity: 0.86;
    transform: scale(1.2);
  }
  82% {
    opacity: 0.32;
    transform: scale(1.62);
  }
  100% {
    opacity: 0;
    transform: scale(2);
  }
}
@keyframes intro-orbitas {
  0% {
    opacity: 0;
    transform: scale(0.72) rotate(-26deg);
  }
  18% {
    opacity: 0.74;
    transform: scale(0.88) rotate(-8deg);
  }
  58% {
    opacity: 1;
    transform: scale(1) rotate(15deg);
  }
  82% {
    opacity: 0.42;
    transform: scale(1.04) rotate(30deg);
  }
  100% {
    opacity: 0;
    transform: scale(1.08) rotate(40deg);
  }
}
@keyframes intro-marca {
  0% {
    opacity: 0;
    transform: scale(0.82);
  }
  14% {
    opacity: 1;
    transform: scale(1);
  }
  59% {
    opacity: 1;
    transform: scale(1.04);
  }
  74% {
    opacity: 0.18;
    transform: scale(1.18);
  }
  86% {
    opacity: 0;
    transform: scale(1.26);
  }
  100% {
    opacity: 0;
    transform: scale(1.045);
  }
}
@keyframes intro-letra {
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes intro-nome-final {
  0%,
  46% {
    opacity: 0;
    transform: translateY(8px) scale(0.94);
  }
  57%,
  82% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  94%,
  100% {
    opacity: 0;
    transform: translateY(-3px) scale(1.045);
    filter: blur(4px) drop-shadow(0 0 13px rgb(108 124 255 / 0.46));
  }
}
@keyframes intro-nome-fluxo {
  to {
    background-position: 230% 50%;
  }
}
@keyframes intro-mensagem {
  0%,
  76% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    filter: blur(0);
  }
  86% {
    opacity: 0.94;
    transform: translate(-50%, -50%) scale(1.035);
    filter: blur(0.6px);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.08);
    filter: blur(5px);
  }
}
@keyframes intro-particula {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.25);
  }
  18% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--particula-x)), calc(-50% + var(--particula-y))) scale(0.45);
  }
}
@keyframes intro-carregamento {
  0%,
  84% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(6px);
  }
}
@keyframes intro-progresso {
  to {
    width: 100%;
  }
}
@media (max-width: 560px) {
  .intro-cicluz__carregamento {
    right: max(20px, env(safe-area-inset-right));
    bottom: max(20px, env(safe-area-inset-bottom));
    left: max(20px, env(safe-area-inset-left));
  }
}
@media (prefers-reduced-motion: reduce) {
  .intro-cicluz {
    animation-duration: 120ms;
  }
  .intro-cicluz__base,
  .intro-cicluz__vidro,
  .intro-cicluz__cores,
  .intro-cicluz__luz-central,
  .intro-cicluz__orbitas,
  .intro-cicluz__marca,
  .intro-cicluz__mensagem-final,
  .intro-cicluz__nome-final,
  .intro-cicluz__letra,
  .intro-cicluz__particulas i,
  .intro-cicluz__carregamento,
  .intro-cicluz__preenchimento {
    animation: none;
  }
  .intro-cicluz__base,
  .intro-cicluz__vidro,
  .intro-cicluz__cores,
  .intro-cicluz__marca,
  .intro-cicluz__carregamento {
    opacity: 0;
  }
  .intro-cicluz__preenchimento {
    width: 100%;
  }
}
</style>
