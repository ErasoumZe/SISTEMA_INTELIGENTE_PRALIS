<script setup lang="ts">
const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{ (event: "folha-enviada", valor: boolean): void }>();
const { apiUrl, apiGet } = useApi();
const enviando = ref(false);
const erro = ref("");
type Anexo = { id: string; tipo: "folha_fechamento" | "comprovante_cartao"; nomeOriginal: string };
type TipoAnexo = Anexo["tipo"];
const anexos = ref<Anexo[]>([]);
const folhaArquivo = useTemplateRef<HTMLInputElement>("folhaArquivo");
const cartaoArquivo = useTemplateRef<HTMLInputElement>("cartaoArquivo");
const videoCamera = useTemplateRef<HTMLVideoElement>("videoCamera");
const cameraAberta = ref(false);
const cameraErro = ref("");
const tipoFoto = ref<TipoAnexo>("folha_fechamento");
let transmissaoCamera: MediaStream | null = null;
const folhas = computed(() => anexos.value.filter((anexo) => anexo.tipo === "folha_fechamento"));
const cartoes = computed(() => anexos.value.filter((anexo) => anexo.tipo === "comprovante_cartao"));

async function carregar() {
  if (!props.caixaId) {
    anexos.value = [];
    emit("folha-enviada", false);
    return;
  }
  try {
    anexos.value = (await apiGet<Anexo[]>(`/api/caixa/${props.caixaId}/anexos`)) ?? [];
    emit("folha-enviada", folhas.value.length > 0);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel carregar os anexos.";
  }
}

watch(
  () => props.caixaId,
  () => void carregar(),
  { immediate: true }
);

async function enviarArquivo(arquivo: File, tipo: TipoAnexo): Promise<boolean> {
  if (!props.caixaId) return false;
  enviando.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", tipo);
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    if (!resposta.ok) {
      const falha = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(falha?.title ?? "Nao foi possivel enviar o anexo.");
    }
    await carregar();
    return true;
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel enviar o anexo.";
    return false;
  } finally {
    enviando.value = false;
  }
}

async function enviar(evento: Event, tipo: TipoAnexo) {
  const entrada = evento.target as HTMLInputElement;
  const arquivo = entrada.files?.[0];
  if (!arquivo) return;
  await enviarArquivo(arquivo, tipo);
  entrada.value = "";
}

function encerrarCamera() {
  transmissaoCamera?.getTracks().forEach((trilha) => trilha.stop());
  transmissaoCamera = null;
  if (videoCamera.value) videoCamera.value.srcObject = null;
  cameraAberta.value = false;
}

async function abrirCamera(tipo: TipoAnexo) {
  cameraErro.value = "";
  if (!globalThis.navigator.mediaDevices?.getUserMedia) {
    cameraErro.value = "A câmera não está disponível neste navegador. Use Anexar arquivo.";
    return;
  }

  try {
    transmissaoCamera = await globalThis.navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    tipoFoto.value = tipo;
    cameraAberta.value = true;
    await nextTick();
    if (videoCamera.value) {
      videoCamera.value.srcObject = transmissaoCamera;
      await videoCamera.value.play();
    }
  } catch {
    encerrarCamera();
    cameraErro.value = "Não foi possível acessar a câmera. Autorize o navegador ou use Anexar arquivo.";
  }
}

async function tirarFoto() {
  const video = videoCamera.value;
  if (!video || !video.videoWidth || !video.videoHeight) {
    cameraErro.value = "A câmera ainda não está pronta. Aguarde um instante e tente novamente.";
    return;
  }

  const quadro = document.createElement("canvas");
  quadro.width = video.videoWidth;
  quadro.height = video.videoHeight;
  quadro.getContext("2d")?.drawImage(video, 0, 0, quadro.width, quadro.height);
  const foto = await new Promise<Blob | null>((resolver) => quadro.toBlob(resolver, "image/jpeg", 0.9));
  if (!foto) {
    cameraErro.value = "Não foi possível registrar a foto. Tente novamente.";
    return;
  }

  const nome = tipoFoto.value === "folha_fechamento" ? "folha-fechamento" : "comprovante-cartao";
  const enviada = await enviarArquivo(
    new File([foto], `${nome}-${Date.now()}.jpg`, { type: "image/jpeg" }),
    tipoFoto.value
  );
  if (enviada) encerrarCamera();
}

watch(cameraAberta, (aberta) => {
  if (!aberta && transmissaoCamera) encerrarCamera();
});
</script>

<template>
  <section class="mt-4" aria-label="Anexos do fechamento">
    <div class="text-subtitle-2">Folha de fechamento <span class="text-error">(obrigatoria)</span></div>
    <div class="d-flex flex-wrap ga-2 mt-2">
      <v-btn
        variant="outlined"
        prepend-icon="mdi-camera"
        :loading="enviando"
        :disabled="!caixaId"
        @click="abrirCamera('folha_fechamento')"
      >
        Tirar foto
      </v-btn>
      <v-btn
        variant="outlined"
        prepend-icon="mdi-paperclip"
        :loading="enviando"
        :disabled="!caixaId"
        @click="folhaArquivo?.click()"
      >
        Anexar arquivo
      </v-btn>
    </div>
    <input
      ref="folhaArquivo"
      class="d-none"
      type="file"
      accept="image/*,application/pdf"
      @change="enviar($event, 'folha_fechamento')"
    />
    <div v-for="anexo in folhas" :key="anexo.id" class="text-caption mt-1">✓ {{ anexo.nomeOriginal }}</div>
    <div class="text-subtitle-2 mt-4">Comprovantes de cartao <span class="text-medium-emphasis">(opcional)</span></div>
    <div class="d-flex flex-wrap ga-2 mt-2">
      <v-btn
        variant="outlined"
        prepend-icon="mdi-camera"
        :loading="enviando"
        :disabled="!caixaId"
        @click="abrirCamera('comprovante_cartao')"
      >
        Tirar foto
      </v-btn>
      <v-btn
        variant="outlined"
        prepend-icon="mdi-paperclip"
        :loading="enviando"
        :disabled="!caixaId"
        @click="cartaoArquivo?.click()"
      >
        Anexar comprovante
      </v-btn>
    </div>
    <input
      ref="cartaoArquivo"
      class="d-none"
      type="file"
      accept="image/*,application/pdf"
      @change="enviar($event, 'comprovante_cartao')"
    />
    <div v-for="anexo in cartoes" :key="anexo.id" class="text-caption mt-1">✓ {{ anexo.nomeOriginal }}</div>
    <v-alert v-if="erro" type="error" density="compact" class="mt-2">{{ erro }}</v-alert>

    <v-dialog v-model="cameraAberta" max-width="720" @after-leave="encerrarCamera">
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          Tirar foto
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar câmera" @click="encerrarCamera" />
        </v-card-title>
        <v-card-text>
          <video ref="videoCamera" class="camera-preview" autoplay playsinline muted aria-label="Prévia da câmera" />
          <v-alert v-if="cameraErro" type="error" density="compact" class="mt-3">{{ cameraErro }}</v-alert>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="encerrarCamera">Cancelar</v-btn>
          <v-btn color="primary" prepend-icon="mdi-camera" :loading="enviando" @click="tirarFoto">Usar foto</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.camera-preview {
  display: block;
  width: 100%;
  max-height: min(64vh, 520px);
  background: rgb(var(--v-theme-surface-variant));
  border-radius: 8px;
  object-fit: contain;
}
</style>
