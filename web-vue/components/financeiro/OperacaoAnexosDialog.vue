<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { OperacaoResumo } from "~/types/padaria";

const props = defineProps<{
  aberto: boolean;
  operacao: OperacaoResumo | null;
  endpoint: "despesas" | "mercadorias" | null;
}>();
const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();
const { apiUrl } = useApi();

const carregando = ref(false);
const erro = ref("");
const urlVisualizacao = ref("");
const mimeVisualizacao = ref("");
const tituloVisualizacao = ref("");

function limparVisualizacao() {
  if (urlVisualizacao.value) URL.revokeObjectURL(urlVisualizacao.value);
  urlVisualizacao.value = "";
  mimeVisualizacao.value = "";
  tituloVisualizacao.value = "";
}

async function abrirAnexo(rota: "foto" | "foto-nota", titulo: string) {
  if (!props.operacao || !props.endpoint) return;
  carregando.value = true;
  erro.value = "";
  limparVisualizacao();
  try {
    const resposta = await fetch(`${apiUrl}/api/${props.endpoint}/${props.operacao.id}/${rota}`, {
      credentials: "include"
    });
    if (!resposta.ok) throw new Error("Não foi possível abrir o anexo.");
    const arquivo = await resposta.blob();
    urlVisualizacao.value = URL.createObjectURL(arquivo);
    mimeVisualizacao.value = arquivo.type;
    tituloVisualizacao.value = titulo;
  } catch (causa) {
    erro.value = causa instanceof Error ? causa.message : "Não foi possível abrir o anexo.";
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) limparVisualizacao();
  }
);
onBeforeUnmount(limparVisualizacao);
</script>

<template>
  <v-dialog
    :model-value="aberto"
    max-width="860"
    persistent
    no-click-animation
    @update:model-value="emit('update:aberto', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-paperclip" />
        Anexos do lançamento
      </v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap ga-2 mb-4">
          <v-btn
            v-if="operacao?.fotoDocumentoUrl"
            variant="tonal"
            prepend-icon="mdi-receipt-text-outline"
            :loading="carregando"
            @click="abrirAnexo('foto', 'Recibo, boleto ou documento')"
          >
            Recibo / boleto
          </v-btn>
          <v-btn
            v-if="operacao?.fotoNotaUrl"
            variant="tonal"
            prepend-icon="mdi-file-document-outline"
            :loading="carregando"
            @click="abrirAnexo('foto-nota', 'Nota ou documento interno')"
          >
            Nota / interno
          </v-btn>
        </div>
        <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
        <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-4" />
        <template v-if="urlVisualizacao">
          <p class="text-body-2 mb-2">{{ tituloVisualizacao }}</p>
          <img v-if="mimeVisualizacao.startsWith('image/')" :src="urlVisualizacao" class="anexo-imagem" alt="Anexo" />
          <iframe v-else :src="urlVisualizacao" class="anexo-arquivo" :title="tituloVisualizacao" />
        </template>
        <v-alert v-else-if="!carregando && !erro" type="info" variant="tonal">
          Selecione um anexo para visualizar.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:aberto', false)">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.anexo-imagem {
  display: block;
  width: 100%;
  max-height: 62vh;
  object-fit: contain;
  border-radius: 8px;
}
.anexo-arquivo {
  display: block;
  width: 100%;
  height: min(62vh, 620px);
  border: 0;
  border-radius: 8px;
}
</style>
