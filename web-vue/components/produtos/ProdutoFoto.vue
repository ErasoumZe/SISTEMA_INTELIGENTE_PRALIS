<script setup lang="ts">
/**
 * Foto do produto, igual ao paralelo: "Tirar foto" (camera traseira), "Galeria" e arrastar.
 *
 * O componente NAO envia nada: escolher ou remover so muda o formulario, e a foto vai para o servidor
 * ao SALVAR (`useProdutoFotoPendente`). Assim "Cancelar" desfaz a troca. No Android, um seletor sem
 * `capture` pode oferecer so a galeria: os dois inputs deixam a escolha explicita.
 */
const props = defineProps<{
  /** De onde mostrar a foto gravada: rota ("/api/produtos" ou "/api/produtos/base") e id. */
  rota: string;
  produtoId: string | null;
  fotoUrl: string | null;
  /** Arquivo escolhido e ainda nao salvo (preview local). */
  arquivoPendente: File | null;
  somenteLeitura?: boolean;
}>();
const emit = defineEmits<{ escolher: [arquivo: File]; remover: [] }>();

const { apiUrl } = useApi();

const camera = ref<HTMLInputElement | null>(null);
const galeria = ref<HTMLInputElement | null>(null);
const arrastando = ref(false);
const erro = ref("");

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const TETO = 8 * 1024 * 1024;

// A foto NAO pode ser um `<img src>` apontando para a API: outra origem + CORP do helmet = imagem
// bloqueada pelo navegador. O composable baixa com credenciais e devolve um object URL.
const { endereco, carregar: carregarFoto, mostrarArquivoLocal } = useFotoDeProduto();

watch(
  () => [props.arquivoPendente, props.rota, props.produtoId, props.fotoUrl] as const,
  ([arquivo, rota, produtoId, fotoUrl]) => {
    if (arquivo) mostrarArquivoLocal(arquivo);
    else void carregarFoto(apiUrl, produtoId, Boolean(fotoUrl), rota);
  },
  { immediate: true }
);

function usar(arquivo: File) {
  erro.value = !TIPOS.includes(arquivo.type)
    ? "Formato não aceito. Envie JPEG, PNG ou WebP."
    : arquivo.size > TETO
      ? "Foto acima de 8 MB."
      : "";
  if (!erro.value) emit("escolher", arquivo);
}

function aoEscolher(evento: Event) {
  const entrada = evento.target as HTMLInputElement;
  const arquivo = entrada.files?.[0];
  if (arquivo) usar(arquivo);
  // Permite escolher/tirar de novo a mesma foto depois de uma tentativa.
  entrada.value = "";
}

function aoSoltar(evento: DragEvent) {
  arrastando.value = false;
  const arquivo = evento.dataTransfer?.files?.[0];
  if (arquivo) usar(arquivo);
}
</script>

<template>
  <div class="produto-foto">
    <div
      class="produto-foto__area"
      :class="{ 'is-arrastando': arrastando, 'is-cheia': Boolean(endereco) }"
      @dragover.prevent="arrastando = !somenteLeitura"
      @dragleave.prevent="arrastando = false"
      @drop.prevent="!somenteLeitura && aoSoltar($event)"
    >
      <input ref="camera" type="file" accept="image/*" capture="environment" hidden @change="aoEscolher" />
      <input ref="galeria" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="aoEscolher" />

      <img v-if="endereco" :src="endereco" alt="Foto do produto" class="produto-foto__imagem" />
      <template v-else>
        <v-icon icon="mdi-cloud-upload-outline" size="32" />
        <span class="produto-foto__titulo">Adicione uma foto do produto</span>
        <span class="produto-foto__legenda">JPEG, PNG ou WebP · até 8 MB</span>
      </template>

      <div v-if="!somenteLeitura" class="produto-foto__acoes">
        <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-camera" @click="camera?.click()">
          Tirar foto
        </v-btn>
        <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-image-multiple" @click="galeria?.click()">
          Galeria
        </v-btn>
        <v-btn
          v-if="endereco"
          size="small"
          variant="text"
          color="error"
          prepend-icon="mdi-delete-outline"
          @click="emit('remover')"
        >
          Remover
        </v-btn>
      </div>
    </div>
    <p v-if="arquivoPendente" class="produto-foto__legenda">A foto nova é gravada ao salvar o produto.</p>
    <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
  </div>
</template>

<style scoped>
.produto-foto {
  display: grid;
  gap: var(--cx-sp-2);
}
.produto-foto__area {
  display: grid;
  place-items: center;
  gap: var(--cx-sp-2);
  min-height: 148px;
  padding: var(--cx-sp-4);
  border: 2px dashed var(--cx-line);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  transition:
    border-color var(--cx-dur-1) var(--cx-ease),
    background var(--cx-dur-1) var(--cx-ease);
}
.produto-foto__area.is-arrastando {
  border-color: var(--cx-focus);
  background: var(--cx-hover);
}
.produto-foto__area.is-cheia {
  padding: var(--cx-sp-2);
}
.produto-foto__imagem {
  width: 100%;
  max-height: 160px;
  border-radius: var(--cx-r-sm);
  object-fit: contain;
}
.produto-foto__titulo {
  font-size: var(--cx-fs-body);
  font-weight: 600;
  color: var(--cx-ink);
}
.produto-foto__legenda {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
.produto-foto__acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--cx-sp-2);
}
</style>
