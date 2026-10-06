<script setup lang="ts">
type EtapaAjuda = {
  id: number;
  titulo: string;
  ajuda: string;
};

defineProps<{
  etapas: readonly EtapaAjuda[];
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
      <v-card-title class="fechamento-ajuda__titulo">Como fechar o caixa</v-card-title>
      <v-card-text class="fechamento-ajuda__conteudo">
        <ol>
          <li v-for="etapa in etapas" :key="etapa.id">
            <strong>{{ etapa.id }}. {{ etapa.titulo }}</strong>
            <span>{{ etapa.ajuda }}</span>
          </li>
        </ol>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<style scoped>
.fechamento-ajuda {
  width: min(336px, calc(100vw - 32px));
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

.fechamento-ajuda strong,
.fechamento-ajuda span {
  display: block;
}

.fechamento-ajuda strong {
  color: var(--cx-ink);
  font-size: 0.86rem;
}

.fechamento-ajuda__ativador {
  flex: 0 0 auto;
  min-width: 40px;
  min-height: 40px;
  color: var(--cx-brand-text);
}
</style>
