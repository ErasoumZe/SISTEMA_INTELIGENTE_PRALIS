<script setup lang="ts">
type EtapaAjuda = {
  id: number;
  titulo: string;
  passos: readonly string[];
  quandoAvancar: string;
};

defineProps<{
  etapa: EtapaAjuda;
}>();
</script>

<template>
  <v-menu location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        aria-label="Como funciona o fechamento do caixa"
        class="fechamento-ajuda__ativador"
        icon="mdi-help-circle-outline"
        size="small"
        variant="text"
      />
    </template>

    <v-card class="fechamento-ajuda" elevation="8">
      <v-card-title class="fechamento-ajuda__titulo">Como fazer: {{ etapa.titulo }}</v-card-title>
      <v-card-text class="fechamento-ajuda__conteudo">
        <ol>
          <li v-for="passo in etapa.passos" :key="passo">{{ passo }}</li>
        </ol>
        <p class="fechamento-ajuda__avancar"><strong>Antes de avançar:</strong> {{ etapa.quandoAvancar }}</p>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<style scoped>
.fechamento-ajuda {
  width: min(336px, calc(100vw - 32px));
  max-height: min(560px, calc(100dvh - 32px));
  overflow-y: auto;
}

.fechamento-ajuda__titulo {
  min-height: auto;
  padding: 14px 16px 4px;
  color: var(--cx-ink);
  font-size: 1rem;
  font-weight: 800;
}

.fechamento-ajuda__conteudo {
  padding: 8px 16px 16px;
}

.fechamento-ajuda ol {
  display: grid;
  gap: 10px;
  margin: 0;
  padding-left: 20px;
}

.fechamento-ajuda li {
  color: var(--cx-ink-soft);
  font-size: 0.82rem;
  line-height: 1.35;
}

.fechamento-ajuda__avancar {
  margin: 14px 0 0;
  color: var(--cx-ink-soft);
  font-size: 0.82rem;
  line-height: 1.35;
}

.fechamento-ajuda__avancar strong {
  color: var(--cx-ink);
}

.fechamento-ajuda__ativador {
  flex: 0 0 auto;
  min-width: 40px;
  min-height: 40px;
  border: 1px solid var(--cx-negative);
  border-radius: 10px;
  background: var(--cx-canvas);
  color: var(--cx-attention);
}
</style>
