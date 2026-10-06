<script setup lang="ts">
type Anexo = { id: string; tipo: "folha_fechamento" | "comprovante_cartao"; nomeOriginal: string; mimeType: string };
const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{
  (event: "folha-enviada", valor: boolean): void;
  (
    event: "anexos-atualizados",
    anexos: Array<{ id: string; tipo: Anexo["tipo"]; nomeOriginal: string; relatorio: null }>
  ): void;
}>();
const { apiUrl, apiGet } = useApi();
const arquivo = useTemplateRef<HTMLInputElement>("arquivo");
const camera = useTemplateRef<HTMLInputElement>("camera");
const anexos = ref<Anexo[]>([]);
const enviando = ref(false);
const removendo = ref<string | null>(null);
const erro = ref("");
const folhas = computed(() => anexos.value.filter((anexo) => anexo.tipo === "folha_fechamento"));
function atualizar() {
  emit("folha-enviada", folhas.value.length > 0);
  emit(
    "anexos-atualizados",
    anexos.value.map((anexo) => ({ ...anexo, relatorio: null }))
  );
}
async function carregar() {
  if (!props.caixaId) {
    anexos.value = [];
    atualizar();
    return;
  }
  try {
    anexos.value = (await apiGet<Anexo[]>(`/api/caixa/${encodeURIComponent(props.caixaId)}/anexos`)) ?? [];
    atualizar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível carregar a folha de fechamento.";
  }
}
async function enviar(evento: Event) {
  const entrada = evento.target as HTMLInputElement;
  const selecionado = entrada.files?.[0];
  entrada.value = "";
  if (!selecionado || !props.caixaId) return;
  enviando.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", "folha_fechamento");
    corpo.append("arquivo", selecionado);
    const resposta = await fetch(`${apiUrl}/api/caixa/${encodeURIComponent(props.caixaId)}/anexos`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    if (!resposta.ok) throw new Error("Não foi possível anexar a folha.");
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível anexar a folha.";
  } finally {
    enviando.value = false;
  }
}
async function remover(anexo: Anexo) {
  if (!props.caixaId) return;
  removendo.value = anexo.id;
  try {
    const resposta = await fetch(`${apiUrl}/api/caixa/${encodeURIComponent(props.caixaId)}/anexos/${anexo.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!resposta.ok) throw new Error("Não foi possível remover a folha.");
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover a folha.";
  } finally {
    removendo.value = null;
  }
}
watch(
  () => props.caixaId,
  () => void carregar(),
  { immediate: true }
);
</script>

<template>
  <section class="folha" aria-labelledby="folha-fechamento-titulo">
    <div class="folha__cabecalho">
      <div>
        <span>Documento obrigatório</span>
        <h3 id="folha-fechamento-titulo">Folha de fechamento <em>(obrigatória)</em></h3>
      </div>
      <v-icon icon="mdi-file-document-check-outline" />
    </div>
    <p>Envie a folha preenchida que seguirá no malote.</p>
    <div class="folha__acoes">
      <v-btn
        color="warning"
        variant="tonal"
        prepend-icon="mdi-camera"
        :loading="enviando"
        :disabled="!caixaId"
        @click="camera?.click()"
        >Abrir câmera</v-btn
      >
      <v-btn
        color="warning"
        variant="text"
        prepend-icon="mdi-paperclip"
        :disabled="!caixaId || enviando"
        @click="arquivo?.click()"
        >Anexar folha</v-btn
      >
    </div>
    <input ref="camera" class="d-none" type="file" accept="image/*" capture="environment" @change="enviar" />
    <input ref="arquivo" class="d-none" type="file" accept="image/*,application/pdf" @change="enviar" />
    <div v-if="folhas.length" class="folha__lista mt-4">
      <div v-for="anexo in folhas" :key="anexo.id">
        <v-icon :icon="anexo.mimeType.startsWith('image/') ? 'mdi-image-outline' : 'mdi-file-pdf-box'" /><span>{{
          anexo.nomeOriginal
        }}</span
        ><v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          :aria-label="`Remover ${anexo.nomeOriginal}`"
          :loading="removendo === anexo.id"
          @click="remover(anexo)"
        />
      </div>
    </div>
    <v-alert v-if="erro" type="error" density="compact" class="mt-3">{{ erro }}</v-alert>
  </section>
</template>

<style scoped>
.folha {
  padding: clamp(16px, 3vw, 28px);
  border: 1px solid color-mix(in srgb, var(--cx-attention) 55%, var(--cx-line));
  border-radius: 16px;
  background: color-mix(in srgb, var(--cx-attention) 6%, var(--cx-surface));
}
.folha__cabecalho {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.folha__cabecalho span {
  color: var(--cx-brand-text);
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
}
.folha h3,
.folha p {
  margin: 0;
}
.folha__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.folha h3 em {
  color: var(--cx-negative);
  font-size: 0.85rem;
  font-style: normal;
}
.folha p {
  margin: 8px 0 16px;
  color: var(--cx-ink-soft);
}
.folha__lista {
  display: grid;
  gap: 8px;
}
.folha__lista div {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--cx-line);
  border-radius: 8px;
  background: var(--cx-surface);
}
.folha__lista span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 420px) {
  .folha__acoes :deep(.v-btn) {
    width: 100%;
    min-height: 46px;
  }
}
</style>
