<script setup lang="ts">
/** Um produto da reconciliacao do codigo de cadastro e as decisoes possiveis para ele (tela oficial). */
import type { ItemCodigoCadastro } from "~/composables/useCodigoCadastro";

defineProps<{ item: ItemCodigoCadastro; tituloDoBalde: string | null; fraseOk: boolean; decidindo: boolean }>();
defineEmits<{ decidir: [corpo: { codigo?: string; cunhar?: boolean }] }>();
</script>

<template>
  <v-list-item>
    <v-list-item-title class="d-flex flex-wrap align-center ga-2">
      <span class="font-weight-medium">{{ item.nome }}</span>
      <v-chip v-if="tituloDoBalde" size="x-small" variant="flat" color="primary">{{ tituloDoBalde }}</v-chip>
      <v-chip size="x-small" variant="tonal">{{ item.loja }}</v-chip>
      <v-chip size="x-small" variant="tonal">atual: {{ item.codigoAtual || "—" }}</v-chip>
      <v-chip v-if="item.codigoBarras" size="x-small" variant="text">{{ item.codigoBarras }}</v-chip>
    </v-list-item-title>
    <v-list-item-subtitle class="mt-1">{{ item.motivo }}</v-list-item-subtitle>

    <div class="d-flex flex-wrap align-center ga-2 mt-2">
      <v-btn
        v-if="item.balde === 'barras-tem-codigo' && item.codigoProposto"
        size="small"
        variant="tonal"
        color="warning"
        :loading="decidindo"
        :disabled="!fraseOk"
        @click="$emit('decidir', { codigo: item.codigoProposto })"
      >
        Adotar {{ item.codigoProposto }}
        <span class="text-medium-emphasis ml-1">· lido do código de barras</span>
      </v-btn>
      <v-btn
        v-for="c in item.candidatos"
        :key="`${c.loja}:${c.coditem}`"
        size="small"
        variant="tonal"
        :color="c.semelhanca === undefined ? 'primary' : 'warning'"
        :loading="decidindo"
        :disabled="!fraseOk || item.balde === 'ja-correto' || item.balde === 'disputado'"
        @click="$emit('decidir', { codigo: c.coditem })"
      >
        Adotar {{ c.coditem }}
        <!-- A semelhanca so aparece quando o candidato veio do NOME: casar por barras e igual, nao parecido. -->
        <span v-if="c.semelhanca !== undefined" class="font-weight-bold ml-1">{{ c.semelhanca }}%</span>
        <span class="text-medium-emphasis ml-1">· {{ c.loja }} · {{ c.descricao }}</span>
      </v-btn>
      <v-btn
        v-if="item.balde === 'novo'"
        size="small"
        variant="flat"
        color="warning"
        :loading="decidindo"
        :disabled="!fraseOk"
        @click="$emit('decidir', { cunhar: true })"
      >
        Cunhar código novo
      </v-btn>
      <v-btn v-if="item.balde === 'disputado'" size="small" variant="text" color="primary" to="/produtos/central">
        Resolver na Central
      </v-btn>
    </div>
  </v-list-item>
</template>
