<script setup lang="ts">
const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{ (event: "folha-enviada", valor: boolean): void }>();
const { apiUrl, apiGet } = useApi();
const enviando = ref(false);
const erro = ref("");
type Anexo = { id: string; tipo: "folha_fechamento" | "comprovante_cartao"; nomeOriginal: string };
const anexos = ref<Anexo[]>([]);
const folhaCamera = useTemplateRef<HTMLInputElement>("folhaCamera");
const folhaArquivo = useTemplateRef<HTMLInputElement>("folhaArquivo");
const cartaoCamera = useTemplateRef<HTMLInputElement>("cartaoCamera");
const cartaoArquivo = useTemplateRef<HTMLInputElement>("cartaoArquivo");
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

async function enviar(evento: Event, tipo: "folha_fechamento" | "comprovante_cartao") {
  const arquivo = (evento.target as HTMLInputElement).files?.[0];
  if (!arquivo || !props.caixaId) return;
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
    (evento.target as HTMLInputElement).value = "";
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel enviar o anexo.";
  } finally {
    enviando.value = false;
  }
}
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
        @click="folhaCamera?.click()"
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
      ref="folhaCamera"
      class="d-none"
      type="file"
      accept="image/*"
      capture="environment"
      @change="enviar($event, 'folha_fechamento')"
    />
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
        @click="cartaoCamera?.click()"
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
      ref="cartaoCamera"
      class="d-none"
      type="file"
      accept="image/*"
      capture="environment"
      @change="enviar($event, 'comprovante_cartao')"
    />
    <input
      ref="cartaoArquivo"
      class="d-none"
      type="file"
      accept="image/*,application/pdf"
      @change="enviar($event, 'comprovante_cartao')"
    />
    <div v-for="anexo in cartoes" :key="anexo.id" class="text-caption mt-1">✓ {{ anexo.nomeOriginal }}</div>
    <v-alert v-if="erro" type="error" density="compact" class="mt-2">{{ erro }}</v-alert>
  </section>
</template>
