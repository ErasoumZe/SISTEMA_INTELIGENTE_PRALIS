<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";

// Webcam do computador para fotografar a folha/comprovante. Pede a camera ao abrir, mostra a imagem ao vivo e,
// ao tocar em "Tirar foto", devolve um arquivo JPEG. Se a camera nao existir ou a permissao for negada, avisa o
// pai (`indisponivel`) para voltar ao seletor de arquivos.
const aberto = defineModel<boolean>({ required: true });
const emit = defineEmits<{
  (event: "capturada", arquivo: File): void;
  (event: "indisponivel", motivo: string): void;
}>();

const video = useTemplateRef<HTMLVideoElement>("video");
const pronto = ref(false);
const erro = ref("");
let fluxo: MediaStream | null = null;

function parar() {
  fluxo?.getTracks().forEach((faixa) => faixa.stop());
  fluxo = null;
  pronto.value = false;
}

function motivoDoErro(falha: unknown) {
  const nome = falha instanceof DOMException ? falha.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") return "permissao-negada";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "sem-camera";
  return "indisponivel";
}

async function iniciar() {
  erro.value = "";
  pronto.value = false;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    await nextTick();
    // A pessoa pode ter fechado enquanto o navegador pedia a permissao.
    if (!aberto.value || !video.value) {
      parar();
      return;
    }
    video.value.srcObject = fluxo;
    await video.value.play().catch(() => undefined);
    pronto.value = true;
  } catch (falha) {
    parar();
    aberto.value = false;
    emit("indisponivel", motivoDoErro(falha));
  }
}

function tirarFoto() {
  const elemento = video.value;
  if (!elemento || !pronto.value) return;
  const quadro = document.createElement("canvas");
  quadro.width = elemento.videoWidth;
  quadro.height = elemento.videoHeight;
  quadro.getContext("2d")?.drawImage(elemento, 0, 0);
  quadro.toBlob(
    (blob) => {
      if (!blob) {
        erro.value = "Não foi possível gerar a foto. Tente de novo.";
        return;
      }
      const arquivo = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      aberto.value = false;
      emit("capturada", arquivo);
    },
    "image/jpeg",
    0.92
  );
}

watch(aberto, (visivel) => {
  if (!visivel) parar();
});
onBeforeUnmount(parar);
</script>

<template>
  <v-dialog v-model="aberto" max-width="720" @after-enter="iniciar">
    <v-card data-teste="camera-dialogo">
      <v-card-title>Tirar foto</v-card-title>
      <v-card-text>
        <p class="camera__dica">Aponte a câmera para o papel, deixe-o inteiro na imagem e toque em Tirar foto.</p>
        <div class="camera__moldura">
          <video ref="video" class="camera__video" autoplay playsinline muted aria-label="Imagem da câmera" />
          <p v-if="!pronto && !erro" class="camera__aviso" role="status">Abrindo a câmera…</p>
        </div>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mt-3" role="alert">{{
          erro
        }}</v-alert>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" class="camera__botao" data-teste="camera-cancelar" @click="aberto = false"
          >Cancelar</v-btn
        >
        <v-btn
          color="primary"
          variant="flat"
          class="camera__botao"
          prepend-icon="mdi-camera"
          :disabled="!pronto"
          data-teste="camera-tirar-foto"
          @click="tirarFoto"
          >Tirar foto</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.camera__dica {
  margin: 0 0 var(--cx-sp-2);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.camera__moldura {
  position: relative;
  min-height: 200px;
  overflow: hidden;
  border-radius: var(--cx-r-md);
  background: #000;
}
.camera__video {
  display: block;
  width: 100%;
  max-height: 60dvh;
  object-fit: contain;
}
.camera__aviso {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: #fff;
}
.camera__botao {
  min-height: 44px;
}
</style>
