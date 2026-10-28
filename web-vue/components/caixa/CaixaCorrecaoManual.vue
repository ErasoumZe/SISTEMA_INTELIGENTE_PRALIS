<script setup lang="ts">
import { computed } from "vue";

// Correcao manual do que a IA leu (maquininha e folha do CREARE). Os numeros lidos ficam travados; o botao
// destrava e, se algum valor mudar, a justificativa passa a ser obrigatoria (vai gravada com os campos).
const props = defineProps<{
  // Ha numero travado pela IA (sem isso o botao nao faz sentido).
  temTravados: boolean;
  // Rotulos dos campos que ficaram diferentes do que a IA leu.
  alterados: readonly string[];
  // Correcao ja gravada antes (aparece como registro).
  salva?: { justificativa: string; campos: readonly string[] } | null;
}>();
const corrigindo = defineModel<boolean>("corrigindo", { required: true });
const justificativa = defineModel<string>("justificativa", { required: true });

const faltaJustificativa = computed(() => props.alterados.length > 0 && justificativa.value.trim().length < 5);
</script>

<template>
  <section class="correcao" data-teste="correcao-manual">
    <p v-if="salva && !corrigindo" class="correcao__registro" data-teste="correcao-registrada">
      <strong>Corrigido manualmente</strong> ({{ salva.campos.join(", ") }}): {{ salva.justificativa }}
    </p>
    <v-btn
      v-if="temTravados && !corrigindo"
      variant="text"
      size="small"
      prepend-icon="mdi-pencil-outline"
      class="correcao__botao"
      data-teste="botao-corrigir-manualmente"
      @click="corrigindo = true"
      >Corrigir manualmente</v-btn
    >
    <template v-if="corrigindo">
      <p class="correcao__aviso" role="status">
        Campos destravados. Se mudar algum valor lido pela IA, explique o motivo.
        <template v-if="alterados.length"> Alterado: {{ alterados.join(", ") }}.</template>
      </p>
      <v-textarea
        v-model="justificativa"
        label="Justificativa da correção"
        auto-grow
        rows="2"
        counter="300"
        maxlength="300"
        :error="faltaJustificativa"
        :error-messages="faltaJustificativa ? 'Explique por que o valor mudou (mínimo 5 letras).' : ''"
        data-teste="justificativa-correcao"
      />
    </template>
  </section>
</template>

<style scoped>
.correcao {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.correcao__botao {
  justify-self: start;
  min-height: 44px;
}
.correcao__aviso,
.correcao__registro {
  margin: 0;
  font-size: var(--cx-fs-caption);
}
.correcao__registro {
  padding: 8px 10px;
  border-left: 3px solid var(--cx-attention);
  border-radius: 6px;
  background: color-mix(in srgb, var(--cx-attention) 12%, transparent);
}
</style>
