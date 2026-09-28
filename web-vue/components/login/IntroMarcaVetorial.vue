<script setup lang="ts">
import simboloPathUrl from "~/assets/cicluz-simbolo-path.svg?url";

/**
 * Marca exclusiva da intro. A animação geral do app usa um PNG como base para
 * caber no menu, mas a intro amplia a marca — aqui a silhueta é o path oficial
 * em SVG, aplicado como máscara vetorial. Assim não há serrilhado no zoom.
 */
const estiloMarca = { "--intro-marca-vetor": `url("${simboloPathUrl}")` };
</script>

<template>
  <div class="intro-marca-vetorial" :style="estiloMarca" aria-hidden="true">
    <span class="intro-marca-vetorial__aura"></span>
    <span class="intro-marca-vetorial__traco"></span>
    <span class="intro-marca-vetorial__reflexo"></span>
  </div>
</template>

<style scoped>
.intro-marca-vetorial {
  position: relative;
  width: clamp(148px, 27vmin, 320px);
  aspect-ratio: 3986 / 4387;
  isolation: isolate;
}

.intro-marca-vetorial__aura,
.intro-marca-vetorial__traco,
.intro-marca-vetorial__reflexo {
  position: absolute;
  inset: 0;
  display: block;
  background-size: 220% 100%;
  -webkit-mask: var(--intro-marca-vetor) center / contain no-repeat;
  mask: var(--intro-marca-vetor) center / contain no-repeat;
}

.intro-marca-vetorial__aura {
  z-index: -1;
  inset: -8%;
  opacity: 0.68;
  background: linear-gradient(90deg, #e83164, #ff9b28 22%, #ffe053 38%, #20c8dc 62%, #7259ff 80%, #d932b7);
  background-position: 0% 50%;
  filter: blur(16px) saturate(1.25);
  animation: intro-vetor-cor 2.1s linear infinite;
}

.intro-marca-vetorial__traco {
  background-image: linear-gradient(
    90deg,
    #e83164,
    #ff6e28 19%,
    #ffe04b 36%,
    #62dc46 50%,
    #20c8dc 65%,
    #7259ff 81%,
    #d932b7
  );
  background-position: 0% 50%;
  box-shadow: inset 0 0 1px rgb(255 255 255 / 0.9);
  animation: intro-vetor-cor 2.1s linear infinite;
}

.intro-marca-vetorial__reflexo {
  opacity: 0.48;
  background-image: linear-gradient(105deg, transparent 38%, rgb(255 255 255 / 0.92) 50%, transparent 62%);
  background-size: 240% 100%;
  background-position: 130% 50%;
  mix-blend-mode: screen;
  animation: intro-vetor-reflexo 1.8s 180ms cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

@keyframes intro-vetor-cor {
  to {
    background-position: 220% 50%;
  }
}

@keyframes intro-vetor-reflexo {
  to {
    background-position: -130% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .intro-marca-vetorial__aura,
  .intro-marca-vetorial__traco,
  .intro-marca-vetorial__reflexo {
    animation: none;
  }
}
</style>
