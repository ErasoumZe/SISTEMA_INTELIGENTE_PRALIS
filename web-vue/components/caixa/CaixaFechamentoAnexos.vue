<script setup lang="ts">
const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{ (event: "folha-enviada", valor: boolean): void }>();
const { apiUrl, apiGet } = useApi();
const enviando = ref(false);
const erro = ref("");
type Anexo = {
  id: string;
  tipo: "folha_fechamento" | "comprovante_cartao";
  nomeOriginal: string;
  mimeType: string;
};
type TipoAnexo = Anexo["tipo"];
const anexos = ref<Anexo[]>([]);
const previas = ref<Record<string, string>>({});
const anexoAmpliado = ref<Anexo | null>(null);
const removendoId = ref<string | null>(null);
const folhaArquivo = useTemplateRef<HTMLInputElement>("folhaArquivo");
const cartaoArquivo = useTemplateRef<HTMLInputElement>("cartaoArquivo");
const videoCamera = useTemplateRef<HTMLVideoElement>("videoCamera");
const cameraAberta = ref(false);
const cameraErro = ref("");
const tipoFoto = ref<TipoAnexo>("folha_fechamento");
let transmissaoCamera: MediaStream | null = null;
let versaoPrevia = 0;
const folhas = computed(() => anexos.value.filter((anexo) => anexo.tipo === "folha_fechamento"));
const cartoes = computed(() => anexos.value.filter((anexo) => anexo.tipo === "comprovante_cartao"));
const dialogAnexoAmpliado = computed({
  get: () => Boolean(anexoAmpliado.value),
  set: (aberto: boolean) => {
    if (!aberto) anexoAmpliado.value = null;
  }
});

function ehImagem(anexo: Anexo) {
  return anexo.mimeType.startsWith("image/");
}

function urlPrevia(anexo: Anexo) {
  return previas.value[anexo.id] ?? "";
}

function limparPrevia(anexoId: string) {
  const url = previas.value[anexoId];
  if (url) URL.revokeObjectURL(url);
  const { [anexoId]: _, ...restantes } = previas.value;
  previas.value = restantes;
}

async function carregarPrevias(lista: Anexo[]) {
  const versao = ++versaoPrevia;
  const idsAtuais = new Set(lista.map((anexo) => anexo.id));
  Object.keys(previas.value)
    .filter((anexoId) => !idsAtuais.has(anexoId))
    .forEach(limparPrevia);

  await Promise.all(
    lista
      .filter((anexo) => ehImagem(anexo) && !previas.value[anexo.id])
      .map(async (anexo) => {
        try {
          const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}`, {
            credentials: "include"
          });
          if (!resposta.ok) return;
          const url = URL.createObjectURL(await resposta.blob());
          if (versao !== versaoPrevia || !idsAtuais.has(anexo.id)) {
            URL.revokeObjectURL(url);
            return;
          }
          previas.value = { ...previas.value, [anexo.id]: url };
        } catch {
          // A foto continua registrada; apenas a miniatura fica indisponível nesta sessão.
        }
      })
  );
}

async function carregar() {
  if (!props.caixaId) {
    anexos.value = [];
    emit("folha-enviada", false);
    return;
  }
  try {
    anexos.value = (await apiGet<Anexo[]>(`/api/caixa/${props.caixaId}/anexos`)) ?? [];
    await carregarPrevias(anexos.value);
    emit("folha-enviada", folhas.value.length > 0);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel carregar os anexos.";
  }
}

async function remover(anexo: Anexo) {
  if (!props.caixaId) return;
  removendoId.value = anexo.id;
  erro.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/caixa/${props.caixaId}/anexos/${anexo.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!resposta.ok) {
      const falha = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(falha?.title ?? "Não foi possível remover o anexo.");
    }
    if (anexoAmpliado.value?.id === anexo.id) anexoAmpliado.value = null;
    limparPrevia(anexo.id);
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover o anexo.";
  } finally {
    removendoId.value = null;
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

onBeforeUnmount(() => {
  encerrarCamera();
  Object.keys(previas.value).forEach(limparPrevia);
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
    <div v-if="folhas.length" class="anexos-enviados mt-3">
      <div v-for="anexo in folhas" :key="anexo.id" class="anexo-miniatura">
        <button
          v-if="ehImagem(anexo)"
          type="button"
          class="anexo-miniatura__foto"
          :disabled="!urlPrevia(anexo)"
          :aria-label="`Ver foto ${anexo.nomeOriginal}`"
          @click="anexoAmpliado = anexo"
        >
          <img v-if="urlPrevia(anexo)" :src="urlPrevia(anexo)" :alt="`Prévia de ${anexo.nomeOriginal}`" />
          <v-icon v-else icon="mdi-image-outline" />
        </button>
        <div v-else class="anexo-miniatura__arquivo"><v-icon icon="mdi-file-document-outline" /></div>
        <span class="anexo-miniatura__nome" :title="anexo.nomeOriginal">{{ anexo.nomeOriginal }}</span>
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          :loading="removendoId === anexo.id"
          :aria-label="`Remover ${anexo.nomeOriginal}`"
          @click="remover(anexo)"
        />
      </div>
    </div>
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
    <div v-if="cartoes.length" class="anexos-enviados mt-3">
      <div v-for="anexo in cartoes" :key="anexo.id" class="anexo-miniatura">
        <button
          v-if="ehImagem(anexo)"
          type="button"
          class="anexo-miniatura__foto"
          :disabled="!urlPrevia(anexo)"
          :aria-label="`Ver foto ${anexo.nomeOriginal}`"
          @click="anexoAmpliado = anexo"
        >
          <img v-if="urlPrevia(anexo)" :src="urlPrevia(anexo)" :alt="`Prévia de ${anexo.nomeOriginal}`" />
          <v-icon v-else icon="mdi-image-outline" />
        </button>
        <div v-else class="anexo-miniatura__arquivo"><v-icon icon="mdi-file-document-outline" /></div>
        <span class="anexo-miniatura__nome" :title="anexo.nomeOriginal">{{ anexo.nomeOriginal }}</span>
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          :loading="removendoId === anexo.id"
          :aria-label="`Remover ${anexo.nomeOriginal}`"
          @click="remover(anexo)"
        />
      </div>
    </div>
    <v-alert v-if="erro" type="error" density="compact" class="mt-2">{{ erro }}</v-alert>

    <v-dialog v-model="cameraAberta" max-width="720" persistent no-click-animation @after-leave="encerrarCamera">
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

    <v-dialog v-model="dialogAnexoAmpliado" max-width="960" persistent no-click-animation>
      <v-card v-if="anexoAmpliado">
        <v-card-title class="d-flex align-center justify-space-between">
          Visualizar foto
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar visualização" @click="anexoAmpliado = null" />
        </v-card-title>
        <v-card-text>
          <img
            v-if="urlPrevia(anexoAmpliado)"
            class="anexo-ampliado"
            :src="urlPrevia(anexoAmpliado)"
            :alt="`Foto completa de ${anexoAmpliado.nomeOriginal}`"
          />
        </v-card-text>
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

.anexos-enviados {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.anexo-miniatura {
  display: grid;
  grid-template-columns: 88px minmax(0, 120px) auto;
  align-items: center;
  gap: 6px;
  max-width: 250px;
  padding: 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
}

.anexo-miniatura__foto,
.anexo-miniatura__arquivo {
  display: grid;
  width: 88px;
  height: 64px;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.anexo-miniatura__foto {
  cursor: zoom-in;
}

.anexo-miniatura__foto:disabled {
  cursor: wait;
}

.anexo-miniatura__foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.anexo-miniatura__nome {
  overflow: hidden;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anexo-ampliado {
  display: block;
  width: 100%;
  max-height: 75vh;
  object-fit: contain;
}
</style>
