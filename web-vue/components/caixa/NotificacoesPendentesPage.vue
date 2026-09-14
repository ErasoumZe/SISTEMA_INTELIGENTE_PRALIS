<script setup lang="ts">
import { computed } from "vue";
import type { Notificacao } from "@padaria/shared/notificacoes";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{ notificacoes: Notificacao[]; notificacoesComHistorico: Notificacao[] }>();
const emit = defineEmits<{ (event: "verificar", id: string): void }>();

const notificacoesVerificadas = computed(() => props.notificacoesComHistorico.filter((item) => item.verificado));
</script>

<template>
  <section class="pendencias-page">
    <header>
      <h1>Pendências operacionais</h1>
      <p>Quebras de caixa e alertas de transferências que ainda precisam de conferência.</p>
    </header>

    <v-alert v-if="!notificacoes.length" type="success" variant="tonal">Nenhuma pendência aberta.</v-alert>
    <div v-else class="pendencias-grid">
      <v-card v-for="item in notificacoes" :key="item.id" variant="outlined">
        <v-card-title class="text-subtitle-1">{{ item.titulo }}</v-card-title>
        <v-card-text>
          <div v-if="item.valor != null" class="pendencia-valor">{{ dinheiro(item.valor) }}</div>
          <div>{{ new Date(item.criadoEm).toLocaleString("pt-BR") }}</div>
        </v-card-text>
        <v-card-actions>
          <v-btn prepend-icon="mdi-check" color="primary" variant="tonal" @click="emit('verificar', item.id)">
            Concluir verificação
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>

    <section v-if="notificacoesVerificadas.length" class="notificacoes-verificadas" aria-labelledby="titulo-verificadas">
      <h2 id="titulo-verificadas">Verificadas recentemente</h2>
      <p>
        Estes registros já saíram do sino porque a verificação foi concluída. Eles permanecem aqui para consulta.
      </p>
      <div class="pendencias-grid">
        <v-card v-for="item in notificacoesVerificadas" :key="item.id" variant="outlined">
          <v-card-title class="text-subtitle-1">{{ item.titulo }}</v-card-title>
          <v-card-text>
            <div v-if="item.valor != null" class="pendencia-valor">{{ dinheiro(item.valor) }}</div>
            <div>Verificada em {{ new Date(item.verificadoEm ?? item.criadoEm).toLocaleString("pt-BR") }}</div>
          </v-card-text>
        </v-card>
      </div>
    </section>
  </section>
</template>

<style scoped>
.pendencias-page {
  display: grid;
  gap: 20px;
}
.pendencias-page h1 {
  margin: 0;
}
.pendencias-page p {
  margin: 4px 0 0;
  color: var(--padaria-muted-foreground, #64748b);
}
.notificacoes-verificadas {
  display: grid;
  gap: 12px;
}
.notificacoes-verificadas h2 {
  margin: 0;
  font-size: 1.1rem;
}
.pendencias-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 12px;
}
.pendencia-valor {
  margin-bottom: 6px;
  color: var(--cat-retiradas-base, #b91c1c);
  font-size: 1.35rem;
  font-weight: 800;
}
</style>
