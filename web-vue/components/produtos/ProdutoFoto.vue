<script setup lang="ts">
/**
 * Foto do produto: dropzone com clique E arrastar, preview, trocar e remover.
 *
 * O upload SO existe depois que o produto tem id — por isso o componente aceita `produtoId` nulo e,
 * nesse caso, guarda o arquivo escolhido para quem salvar enviar depois. Falha de upload NUNCA
 * finge que deu certo: o erro fica na tela com botao de tentar de novo, e o produto ja salvo nao e
 * duplicado por causa disso.
 */
const props = defineProps<{
  produtoId: string | null;
  fotoUrl: string | null;
  somenteLeitura?: boolean;
}>();
const emit = defineEmits<{ "arquivo-escolhido": [arquivo: File | null]; alterada: [fotoUrl: string | null] }>();

const { apiUrl } = useApi();

const entrada = ref<HTMLInputElement | null>(null);
const arrastando = ref(false);
const enviando = ref(false);
const erro = ref("");
/** Preview local do arquivo ainda nao enviado. Revogado sempre que troca ou o componente morre. */
const previewLocal = ref("");

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const TETO = 8 * 1024 * 1024;

const endereco = computed(() => {
  if (previewLocal.value) return previewLocal.value;
  return props.produtoId && props.fotoUrl ? `${apiUrl}/api/produtos/${props.produtoId}/foto` : "";
});

function revogarPreview() {
  if (previewLocal.value) {
    URL.revokeObjectURL(previewLocal.value);
    previewLocal.value = "";
  }
}

function validar(arquivo: File): string {
  if (!TIPOS.includes(arquivo.type)) return "Formato não aceito. Envie JPEG, PNG ou WebP.";
  if (arquivo.size > TETO) return "Foto acima de 8 MB.";
  return "";
}

async function usar(arquivo: File) {
  erro.value = validar(arquivo);
  if (erro.value) return;

  revogarPreview();
  previewLocal.value = URL.createObjectURL(arquivo);

  // Sem id ainda (cadastro novo): o arquivo sobe depois que o produto nascer.
  if (!props.produtoId) {
    emit("arquivo-escolhido", arquivo);
    return;
  }
  await enviar(arquivo);
}

async function enviar(arquivo: File) {
  enviando.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/produtos/${props.produtoId}/foto`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    if (!resposta.ok) {
      const problema = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(problema?.title ?? "Não foi possível enviar a foto.");
    }
    const payload = (await resposta.json()) as { data: { fotoUrl: string } };
    revogarPreview();
    emit("alterada", payload.data.fotoUrl);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível enviar a foto.";
  } finally {
    enviando.value = false;
  }
}

async function remover() {
  revogarPreview();
  emit("arquivo-escolhido", null);
  if (!props.produtoId || !props.fotoUrl) {
    emit("alterada", null);
    return;
  }
  enviando.value = true;
  erro.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/produtos/${props.produtoId}/foto`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!resposta.ok) throw new Error("Não foi possível remover a foto.");
    emit("alterada", null);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover a foto.";
  } finally {
    enviando.value = false;
  }
}

function aoEscolher(evento: Event) {
  const arquivo = (evento.target as HTMLInputElement).files?.[0];
  if (arquivo) void usar(arquivo);
}

function aoSoltar(evento: DragEvent) {
  arrastando.value = false;
  const arquivo = evento.dataTransfer?.files?.[0];
  if (arquivo) void usar(arquivo);
}

onBeforeUnmount(revogarPreview);
</script>

<template>
  <div class="produto-foto">
    <div
      class="produto-foto__area"
      :class="{ 'is-arrastando': arrastando, 'is-cheia': Boolean(endereco) }"
      role="button"
      tabindex="0"
      :aria-disabled="somenteLeitura"
      aria-label="Selecionar foto do produto"
      @click="!somenteLeitura && !endereco && entrada?.click()"
      @keydown.enter.prevent="!somenteLeitura && entrada?.click()"
      @keydown.space.prevent="!somenteLeitura && entrada?.click()"
      @dragover.prevent="arrastando = true"
      @dragleave.prevent="arrastando = false"
      @drop.prevent="!somenteLeitura && aoSoltar($event)"
    >
      <input ref="entrada" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="aoEscolher" />

      <template v-if="endereco">
        <img :src="endereco" alt="Foto do produto" class="produto-foto__imagem" />
      </template>
      <template v-else>
        <v-progress-circular v-if="enviando" indeterminate size="28" />
        <template v-else>
          <v-icon icon="mdi-cloud-upload-outline" size="32" />
          <span class="produto-foto__titulo">Selecione ou arraste a foto</span>
          <span class="produto-foto__legenda">JPEG, PNG ou WebP · até 8 MB</span>
        </template>
      </template>
    </div>

    <div v-if="!somenteLeitura" class="produto-foto__acoes">
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-image-edit-outline"
        :loading="enviando"
        @click="entrada?.click()"
      >
        {{ endereco ? "Trocar" : "Selecionar" }}
      </v-btn>
      <v-btn
        v-if="endereco"
        size="small"
        variant="text"
        prepend-icon="mdi-delete-outline"
        :loading="enviando"
        @click="remover"
      >
        Remover
      </v-btn>
    </div>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mt-2">{{ erro }}</v-alert>
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
  gap: var(--cx-sp-1);
  min-height: 148px;
  padding: var(--cx-sp-4);
  border: 2px dashed var(--cx-line);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  cursor: pointer;
  transition:
    border-color var(--cx-dur-1) var(--cx-ease),
    background var(--cx-dur-1) var(--cx-ease);
}
.produto-foto__area:hover,
.produto-foto__area.is-arrastando {
  border-color: var(--cx-focus);
  background: var(--cx-hover);
}
.produto-foto__area:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: 2px;
}
.produto-foto__area.is-cheia {
  padding: var(--cx-sp-2);
  cursor: default;
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
  font-size: var(--cx-fs-caption);
}
.produto-foto__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
}
</style>
