<script setup lang="ts">
import simboloVetorUrl from "~/assets/cicluz-simbolo-path.svg?url";

const emit = defineEmits<{ concluida: [] }>();

let temporizador: number | undefined;

onMounted(() => {
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  temporizador = window.setTimeout(() => emit("concluida"), reduzirMovimento ? 80 : 1160);
});

onBeforeUnmount(() => {
  if (temporizador) window.clearTimeout(temporizador);
});

const estiloMarca = { "--intro-mascara": `url("${simboloVetorUrl}")` };
</script>

<template>
  <!-- Camada visual breve: nao representa percentual real de rede e, por isso, nao se anuncia como progresso. -->
  <section class="intro-cicluz" aria-hidden="true">
    <div class="intro-cicluz__vidro"></div>

    <div class="intro-cicluz__marca">
      <div class="intro-cicluz__simbolo" :style="estiloMarca"></div>
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
  pointer-events: auto;
}

.intro-cicluz__vidro {
  position: absolute;
  inset: 0;
  background-color: rgb(9 11 20 / 0.86);
  background:
    radial-gradient(
      55% 46% at 15% 84%,
      color-mix(in srgb, var(--cat-retiradas-base) 32%, transparent),
      transparent 72%
    ),
    radial-gradient(54% 44% at 84% 18%, color-mix(in srgb, var(--cat-despesas-base) 28%, transparent), transparent 72%),
    radial-gradient(46% 46% at 50% 0%, color-mix(in srgb, var(--cat-entradas-base) 22%, transparent), transparent 72%),
    rgb(9 11 20 / 0.86);
  backdrop-filter: blur(26px) saturate(135%);
  -webkit-backdrop-filter: blur(26px) saturate(135%);
  animation: intro-vidro 1.36s var(--cx-ease-out) both;
}

.intro-cicluz__marca {
  position: relative;
  z-index: 1;
  width: clamp(148px, 27vmin, 264px);
  aspect-ratio: 3986 / 4387;
  filter: drop-shadow(0 0 30px rgb(255 255 255 / 0.22));
  animation: intro-marca 1.34s cubic-bezier(0.2, 0.76, 0.08, 1) both;
  will-change: transform, opacity;
}

.intro-cicluz__simbolo {
  width: 100%;
  height: 100%;
  background: conic-gradient(
    from 215deg,
    var(--cat-despesas-base),
    var(--cat-retiradas-base),
    var(--cx-brand),
    var(--cat-entradas-base),
    var(--cat-despesas-base)
  );
  mask: var(--intro-mascara) center / contain no-repeat;
  -webkit-mask: var(--intro-mascara) center / contain no-repeat;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--cx-brand) 54%, transparent));
}

.intro-cicluz__carregamento {
  position: absolute;
  right: max(24px, env(safe-area-inset-right));
  bottom: max(26px, env(safe-area-inset-bottom));
  left: max(24px, env(safe-area-inset-left));
  z-index: 2;
  max-width: 440px;
  margin: auto;
}

.intro-cicluz__trilho {
  position: relative;
  height: 5px;
  border: 1px solid rgb(255 255 255 / 0.28);
  border-radius: var(--cx-r-pill);
  background: rgb(255 255 255 / 0.1);
  box-shadow:
    inset 0 1px 1px rgb(0 0 0 / 0.2),
    0 4px 20px rgb(0 0 0 / 0.22);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.intro-cicluz__preenchimento {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--cat-despesas-base) 0%,
    var(--cat-entradas-base) 49%,
    var(--cat-retiradas-base) 100%
  );
  box-shadow: 0 0 14px color-mix(in srgb, var(--cat-retiradas-base) 70%, transparent);
  animation: intro-progresso 1.12s 80ms cubic-bezier(0.2, 0.8, 0.16, 1) both;
}

.intro-cicluz__marcador {
  position: absolute;
  top: 50%;
  left: 0;
  width: 14px;
  height: 14px;
  border: 1px solid rgb(255 255 255 / 0.58);
  border-radius: 5px;
  background: rgb(255 255 255 / 0.28);
  box-shadow:
    0 2px 10px rgb(0 0 0 / 0.3),
    inset 0 1px rgb(255 255 255 / 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transform: translate(-50%, -50%);
  animation: intro-marcador 1.12s 80ms cubic-bezier(0.2, 0.8, 0.16, 1) both;
}

@keyframes intro-marca {
  0% {
    opacity: 0;
    transform: scale(0.56);
  }
  13% {
    opacity: 1;
    transform: scale(1);
  }
  57% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 0;
    transform: scale(9.2);
  }
}

@keyframes intro-vidro {
  from {
    opacity: 1;
    transform: scale(1.03);
  }
  to {
    opacity: 0;
    transform: scale(1);
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
  .intro-cicluz__marca {
    transform-origin: center;
  }

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
    13% {
      opacity: 1;
      transform: scale(1);
    }
    57% {
      opacity: 1;
      transform: scale(1.1);
    }
    100% {
      opacity: 0;
      transform: scale(6.1);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .intro-cicluz {
    opacity: 0;
    transition: opacity 80ms linear;
  }

  .intro-cicluz__vidro,
  .intro-cicluz__marca,
  .intro-cicluz__preenchimento,
  .intro-cicluz__marcador {
    animation: none;
  }

  .intro-cicluz__preenchimento {
    width: 100%;
  }

  .intro-cicluz__marcador {
    left: 100%;
  }
}
</style>
