<script setup lang="ts">
const props = defineProps<{ caixaId: string | null }>();
const emit = defineEmits<{ (event: "folha-enviada", valor: boolean): void }>();
const { apiUrl } = useApi();
const enviando = ref(false);
const erro = ref("");
const folhas = ref<string[]>([]);
const cartoes = ref<string[]>([]);

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
    (tipo === "folha_fechamento" ? folhas : cartoes).value.push(arquivo.name);
    emit("folha-enviada", folhas.value.length > 0);
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
    <v-btn
      class="mt-2"
      variant="outlined"
      prepend-icon="mdi-camera"
      :loading="enviando"
      :disabled="!caixaId"
      @click="($refs.folha as HTMLInputElement)?.click()"
    >
      Tirar foto ou anexar folha
    </v-btn>
    <input
      ref="folha"
      class="d-none"
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      @change="enviar($event, 'folha_fechamento')"
    />
    <div v-for="nome in folhas" :key="nome" class="text-caption mt-1">✓ {{ nome }}</div>
    <div class="text-subtitle-2 mt-4">Comprovantes de cartao <span class="text-medium-emphasis">(opcional)</span></div>
    <v-btn
      class="mt-2"
      variant="outlined"
      prepend-icon="mdi-paperclip"
      :loading="enviando"
      :disabled="!caixaId"
      @click="($refs.cartao as HTMLInputElement)?.click()"
    >
      Anexar comprovante
    </v-btn>
    <input
      ref="cartao"
      class="d-none"
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      @change="enviar($event, 'comprovante_cartao')"
    />
    <div v-for="nome in cartoes" :key="nome" class="text-caption mt-1">✓ {{ nome }}</div>
    <v-alert v-if="erro" type="error" density="compact" class="mt-2">{{ erro }}</v-alert>
  </section>
</template>
