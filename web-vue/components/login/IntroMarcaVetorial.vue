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
  </div>
</template>

<style scoped>
.intro-marca-vetorial {
  position: relative;
  width: clamp(156px, 31vmin, 380px);
  aspect-ratio: 3986 / 4387;
  isolation: isolate;
}

.intro-marca-vetorial__aura,
.intro-marca-vetorial__traco {
  position: absolute;
  inset: 0;
  display: block;
  background-size: 220% 100%;
  -webkit-mask: var(--intro-marca-vetor) center / contain no-repeat;
  mask: var(--intro-marca-vetor) center / contain no-repeat;
}

.intro-marca-vetorial__aura {
  z-index: 0;
  opacity: 0.18;
  background: linear-gradient(90deg, #e83164, #ff9b28 22%, #ffe053 38%, #20c8dc 62%, #7259ff 80%, #d932b7);
  background-position: 0% 50%;
  filter: blur(5px) saturate(1.1);
  animation: intro-vetor-cor 2.1s linear infinite;
}

.intro-marca-vetorial__traco {
  z-index: 1;
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
  animation: intro-vetor-cor 2.1s linear infinite;
}

@keyframes intro-vetor-cor {
  to {
    background-position: 220% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .intro-marca-vetorial__aura,
  .intro-marca-vetorial__traco {
    animation: none;
  }
}
</style>
