<script setup lang="ts">
/* O SIMBOLO ANIMADO DA CICLUZ. Copiado do app da Lumi em 28/08/2026, com a mesma pilha dos dois
   lados (Nuxt 4.4.8 / Vue 3.5.38) — nao e port, e copia com os caminhos ajustados. O miolo (as
   mascaras, os filtros e a geometria) NAO foi tocado.

   O QUE MUDOU, e so isto:
     - os dois `import` de arquivo, que apontavam para a arvore do outro projeto;
     - o respeito a `prefers-reduced-motion`, que o original nao tinha. Ver abaixo.
*/
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import logoSymbolUrl from "~/assets/cicluz-simbolo-animado.png";
import officialSvgRaw from "~/assets/cicluz-simbolo-path.svg?raw";

const props = withDefaults(
  defineProps<{
    duration?: number;
    glowIntensity?: number;
    size?: number | string;
    speed?: number;
  }>(),
  {
    duration: 9.8,
    glowIntensity: 0.42,
    size: 340,
    speed: 1
  }
);

const uid = useId().replace(/:/g, "");

/* MOVIMENTO REDUZIDO — e este bloco e obrigatorio, nao acabamento.

   A animacao daqui e SMIL (`<animate>` nativo do SVG, mais abaixo), e SMIL NAO OBEDECE CSS. O
   reset global do projeto (`main.css`, secao 8) zera `animation-duration` e `transition-duration`,
   e nenhum dos dois alcanca um `<animate>`. Sem o codigo abaixo, quem pede menos movimento
   continuaria vendo o simbolo girando — o 67 §7 nao seria cumprido, e ninguem notaria, porque o
   reset "parece" cobrir tudo.

   `pauseAnimations()` e nao `v-if` no `<animate>`: o elemento animado e a MASCARA do brilho. Sem o
   `<animate>` a mascara ficaria no `stroke-dashoffset` inicial e o brilho pararia num lugar
   arbitrario. Pausando, tudo continua renderizado e simplesmente NAO ANDA — o simbolo fica parado
   e colorido, que foi o pedido, em vez de sumir.

   A preferencia e OUVIDA, nao lida uma vez: quem muda o ajuste do sistema com a tela aberta ve o
   efeito na hora, e nao so depois de recarregar. */
const svgOverlay = ref<SVGSVGElement | null>(null);
let consulta: MediaQueryList | null = null;

const aplicarPreferencia = () => {
  const svg = svgOverlay.value;
  if (!svg) return;
  if (consulta?.matches) svg.pauseAnimations();
  else svg.unpauseAnimations();
};

onMounted(() => {
  if (typeof window === "undefined") return;
  consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
  consulta.addEventListener("change", aplicarPreferencia);
  aplicarPreferencia();
});

onBeforeUnmount(() => {
  consulta?.removeEventListener("change", aplicarPreferencia);
});

const viewBox = "0 0 510 490";
const normalizedPathLength = 1000;
const transform = "translate(49.104264758946634 26.77810729974375) scale(0.10177136061165089 0.1010017393454937)";

const extractOfficialPath = (svgMarkup: string) => {
  const match = svgMarkup.match(/<path[^>]*d="([^"]+)"/i);

  if (!match) {
    throw new Error("Nao foi possivel localizar o path oficial da logo em path.svg.");
  }

  return match[1];
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const formatNumber = (value: number) => value.toFixed(2);

const officialFullPath = extractOfficialPath(officialSvgRaw);

const ids = {
  headMask: `lumi-flow-head-mask-${uid}`,
  coreTone: `lumi-flow-core-tone-${uid}`,
  inkField: `lumi-flow-ink-field-${uid}`,
  headBloom: `lumi-flow-head-bloom-${uid}`,
  headGlow: `lumi-flow-head-glow-${uid}`,
  headAura: `lumi-flow-head-aura-${uid}`
};

const sizeValue = computed(() => {
  return typeof props.size === "number" ? `${props.size}px` : props.size;
});

const glow = computed(() => clamp(props.glowIntensity, 0, 1.4));
const speed = computed(() => Math.max(props.speed, 0.2));
const durationValue = computed(() => props.duration / speed.value);

const headLength = computed(() => 128 + glow.value * 48);
const headGap = computed(() => normalizedPathLength - headLength.value);
const headDasharray = computed(() => {
  return `${formatNumber(headLength.value)} ${formatNumber(headGap.value)}`;
});
const trailTravel = formatNumber(normalizedPathLength);
const headFrom = computed(() => formatNumber(-headLength.value));
const headTo = computed(() => formatNumber(-(normalizedPathLength + headLength.value)));
const headStrokeWidth = computed(() => formatNumber(210 + glow.value * 78));

const inkOpacity = computed(() => formatNumber(0.68 + glow.value * 0.14));
const coreSaturation = computed(() => formatNumber(1.85 + glow.value * 0.55));
const coreSlope = computed(() => 1.02 + glow.value * 0.05);
const headBloomBlur = computed(() => formatNumber(108 + glow.value * 42));
const headGlowBlur = computed(() => formatNumber(34 + glow.value * 16));
const headAuraBlur = computed(() => formatNumber(82 + glow.value * 28));
const headCoreOpacity = computed(() => formatNumber(clamp(0.9 + glow.value * 0.08, 0, 1)));
const headGlowOpacity = computed(() => formatNumber(clamp(0.96 + glow.value * 0.18, 0, 1)));
const headAuraOpacity = computed(() => formatNumber(clamp(0.86 + glow.value * 0.24, 0, 1)));
const headBloomOpacity = computed(() => formatNumber(clamp(0.38 + glow.value * 0.18, 0, 0.72)));
const toIntercept = (slope: number) => formatNumber(0.5 - slope / 2);
const durationText = computed(() => `${durationValue.value.toFixed(2)}s`);

const rootStyle = computed(() => ({
  "--lumi-size": sizeValue.value
}));
</script>

<template>
  <div class="lumi-flow" :style="rootStyle" aria-label="Logo animada da Cicluz" role="img">
    <img :src="logoSymbolUrl" alt="" aria-hidden="true" class="lumi-flow__base-image" />

    <svg
      ref="svgOverlay"
      aria-hidden="true"
      class="lumi-flow__overlay"
      :viewBox="viewBox"
      shape-rendering="geometricPrecision"
    >
      <defs>
        <mask
          :id="ids.headMask"
          x="0"
          y="0"
          width="510"
          height="490"
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
        >
          <path
            :d="officialFullPath"
            :transform="transform"
            fill="none"
            stroke="#ffffff"
            :stroke-width="headStrokeWidth"
            stroke-linecap="round"
            stroke-linejoin="round"
            :pathLength="normalizedPathLength"
            :stroke-dasharray="headDasharray"
            :stroke-dashoffset="headFrom"
          >
            <animate
              attributeName="stroke-dashoffset"
              calcMode="linear"
              begin="0s"
              :dur="durationText"
              :values="`${headFrom}; ${headTo}`"
              keyTimes="0;1"
              repeatCount="indefinite"
            />
          </path>
        </mask>

        <filter :id="ids.coreTone" x="-10%" y="-10%" width="120%" height="120%">
          <feColorMatrix in="SourceGraphic" type="saturate" :values="coreSaturation" result="core-tone" />
          <feComponentTransfer in="core-tone">
            <feFuncR type="linear" :slope="coreSlope" :intercept="toIntercept(coreSlope)" />
            <feFuncG type="linear" :slope="coreSlope" :intercept="toIntercept(coreSlope)" />
            <feFuncB type="linear" :slope="coreSlope" :intercept="toIntercept(coreSlope)" />
          </feComponentTransfer>
        </filter>

        <filter :id="ids.headBloom" x="-170%" y="-170%" width="440%" height="440%">
          <feColorMatrix in="SourceGraphic" type="saturate" values="3.2" result="head-bloom-tone" />
          <feComponentTransfer in="head-bloom-tone" result="head-bloom-contrast">
            <feFuncR type="linear" slope="1.22" intercept="-0.04" />
            <feFuncG type="linear" slope="1.22" intercept="-0.04" />
            <feFuncB type="linear" slope="1.22" intercept="-0.04" />
          </feComponentTransfer>
          <feGaussianBlur in="head-bloom-contrast" :stdDeviation="headBloomBlur" />
        </filter>

        <filter :id="ids.headGlow" x="-95%" y="-95%" width="290%" height="290%">
          <feColorMatrix in="SourceGraphic" type="saturate" values="2.35" result="head-glow-tone" />
          <feComponentTransfer in="head-glow-tone" result="head-glow-contrast">
            <feFuncR type="linear" slope="1.26" intercept="-0.1" />
            <feFuncG type="linear" slope="1.26" intercept="-0.1" />
            <feFuncB type="linear" slope="1.26" intercept="-0.1" />
          </feComponentTransfer>
          <feGaussianBlur in="head-glow-contrast" :stdDeviation="headGlowBlur" />
        </filter>

        <filter :id="ids.headAura" x="-160%" y="-160%" width="420%" height="420%">
          <feColorMatrix in="SourceGraphic" type="saturate" values="2.7" result="head-aura-tone" />
          <feComponentTransfer in="head-aura-tone" result="head-aura-contrast">
            <feFuncR type="linear" slope="1.18" intercept="-0.05" />
            <feFuncG type="linear" slope="1.18" intercept="-0.05" />
            <feFuncB type="linear" slope="1.18" intercept="-0.05" />
          </feComponentTransfer>
          <feGaussianBlur in="head-aura-contrast" :stdDeviation="headAuraBlur" />
        </filter>

        <g :id="ids.inkField">
          <ellipse cx="102" cy="196" rx="112" ry="132" fill="#7A5CFF" />
          <ellipse cx="148" cy="126" rx="98" ry="84" fill="#2A9BFF" />
          <ellipse cx="252" cy="84" rx="98" ry="82" fill="#2ED0C3" />
          <ellipse cx="332" cy="120" rx="88" ry="76" fill="#6ED64A" />
          <ellipse cx="408" cy="196" rx="108" ry="116" fill="#F4D12B" />
          <ellipse cx="338" cy="308" rx="122" ry="108" fill="#F19A2F" />
          <ellipse cx="238" cy="394" rx="132" ry="104" fill="#EF4328" />
          <ellipse cx="122" cy="300" rx="112" ry="116" fill="#D93468" />
        </g>
      </defs>

      <g class="lumi-flow__head-bloom" :filter="`url(#${ids.headBloom})`" :opacity="headBloomOpacity">
        <g :mask="`url(#${ids.headMask})`">
          <use :href="`#${ids.inkField}`" />
        </g>
      </g>

      <g class="lumi-flow__head-aura" :filter="`url(#${ids.headAura})`" :opacity="headAuraOpacity">
        <g :mask="`url(#${ids.headMask})`">
          <use :href="`#${ids.inkField}`" />
        </g>
      </g>

      <g class="lumi-flow__head-glow" :filter="`url(#${ids.headGlow})`" :opacity="headGlowOpacity">
        <g :mask="`url(#${ids.headMask})`">
          <use :href="`#${ids.inkField}`" />
        </g>
      </g>

      <g
        class="lumi-flow__head-core"
        :filter="`url(#${ids.coreTone})`"
        :mask="`url(#${ids.headMask})`"
        :opacity="headCoreOpacity"
      >
        <image :href="logoSymbolUrl" x="0" y="0" width="510" height="490" preserveAspectRatio="xMidYMid meet" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.lumi-flow {
  position: relative;
  width: min(100%, var(--lumi-size));
  aspect-ratio: 510 / 490;
}

.lumi-flow__base-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.lumi-flow__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.lumi-flow__head-bloom,
.lumi-flow__head-aura,
.lumi-flow__head-glow,
.lumi-flow__head-core {
  isolation: isolate;
}

.lumi-flow__head-bloom,
.lumi-flow__head-aura {
  mix-blend-mode: normal;
}

.lumi-flow__head-glow {
  mix-blend-mode: normal;
}

.lumi-flow__head-core {
  mix-blend-mode: normal;
}
</style>
