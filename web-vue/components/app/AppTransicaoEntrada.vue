<script setup lang="ts">
const emit = defineEmits<{ terminou: [] }>();

let temporizador: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  // A transição só é montada para quem não pediu menos movimento. O tempo acompanha a última
  // fase do CSS, quando o painel volta a ficar nítido.
  temporizador = setTimeout(() => emit("terminou"), 1450);
});

onBeforeUnmount(() => {
  if (temporizador) clearTimeout(temporizador);
});
</script>

<template>
  <div class="transicao-entrada" role="status" aria-label="Abrindo painel">
    <div class="transicao-entrada__trilhas" aria-hidden="true">
      <span class="trilha trilha--a" />
      <span class="trilha trilha--b" />
      <span class="trilha trilha--c" />
    </div>

    <div class="transicao-entrada__marca" aria-hidden="true">
      <AppLogoAnimada size="clamp(156px, 31vw, 340px)" :glow-intensity="0.82" :speed="1.7" />
    </div>
  </div>
</template>

<style scoped>
.transicao-entrada {
  position: fixed;
  z-index: 5000;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  background: rgb(8 12 20 / 0.62);
  backdrop-filter: blur(12px) saturate(125%);
  -webkit-backdrop-filter: blur(12px) saturate(125%);
  animation: transicao-saida 1450ms var(--cx-ease-out) both;
}

.transicao-entrada__marca {
  position: relative;
  z-index: 1;
  width: clamp(156px, 31vw, 340px);
  animation: marca-surge 1450ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.transicao-entrada__trilhas {
  position: absolute;
  inset: 50%;
  width: min(118vmax, 1080px);
  aspect-ratio: 1;
  translate: -50% -50%;
}

.trilha {
  position: absolute;
  inset: 10%;
  border: clamp(3px, 0.55vw, 8px) solid transparent;
  border-radius: 48% 52% 46% 54% / 56% 44% 55% 45%;
  opacity: 0;
  filter: blur(0.2px) drop-shadow(0 0 14px rgb(255 255 255 / 0.45));
  animation: trilha-surto 1180ms cubic-bezier(0.14, 0.76, 0.24, 1) both;
}

.trilha--a {
  background: linear-gradient(115deg, #28c6ff, transparent 26%, transparent 66%, #ff355f) border-box;
  mask:
    linear-gradient(#000 0 0) padding-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation-delay: 70ms;
}

.trilha--b {
  inset: 16%;
  background: linear-gradient(35deg, #ffcc25, transparent 28%, transparent 65%, #8b5cff) border-box;
  mask:
    linear-gradient(#000 0 0) padding-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  rotate: 72deg;
  animation-delay: 130ms;
}

.trilha--c {
  inset: 4%;
  background: linear-gradient(210deg, #ed366e, transparent 31%, transparent 61%, #55d65a) border-box;
  mask:
    linear-gradient(#000 0 0) padding-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  rotate: -45deg;
  animation-delay: 190ms;
}

@keyframes marca-surge {
  0% {
    opacity: 0;
    scale: 0.24;
    filter: blur(10px);
  }
  42% {
    opacity: 1;
    scale: 1.08;
    filter: blur(0);
  }
  78% {
    opacity: 1;
    scale: 0.94;
  }
  100% {
    opacity: 0;
    scale: 1.18;
  }
}

@keyframes trilha-surto {
  0% {
    opacity: 0;
    scale: 0.2;
  }
  35% {
    opacity: 0.92;
  }
  100% {
    opacity: 0;
    scale: 1.08;
  }
}

@keyframes transicao-saida {
  0%,
  67% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .transicao-entrada,
  .transicao-entrada__marca,
  .trilha {
    animation: none;
  }
}
</style>
