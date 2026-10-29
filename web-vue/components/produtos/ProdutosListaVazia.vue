<script setup lang="ts">
/**
 * Lista vazia da loja (paralelo `index.vue`). "Cadastrado" e o verbo do administrador; a loja nao
 * cadastra, ela IMPORTA da base. Oferecer "Cadastrar o primeiro" a quem nao e admin levava a uma tela
 * que o servidor recusa — e no primeiro acesso da loja era o unico botao a vista.
 */
defineProps<{ temFiltro: boolean; ehAdmin: boolean; podeImportar: boolean }>();
const emit = defineEmits<{ limpar: [] }>();
</script>

<template>
  <div class="lista-vazia">
    <v-icon icon="mdi-basket-off-outline" size="44" />
    <p class="lista-vazia__titulo">
      {{
        temFiltro
          ? "Nenhum produto com esses filtros."
          : ehAdmin
            ? "Nenhum produto cadastrado ainda."
            : "Nenhum produto importado ainda."
      }}
    </p>
    <v-btn v-if="temFiltro" variant="tonal" @click="emit('limpar')">Limpar filtros</v-btn>
    <v-btn v-else-if="ehAdmin" color="primary" variant="tonal" to="/produtos/novo">Cadastrar o primeiro</v-btn>
    <v-btn v-else-if="podeImportar" color="primary" variant="tonal" prepend-icon="mdi-download" to="/produtos/base">
      Importar da base
    </v-btn>
    <!-- Sem permissao de importar, a lista vazia nao fica sem saida e sem explicacao. -->
    <p v-else>Sua loja ainda não tem produtos. Quem libera a importação da base é o administrador.</p>
  </div>
</template>

<style scoped>
.lista-vazia {
  display: grid;
  gap: var(--cx-sp-3);
  justify-items: center;
  padding: var(--cx-sp-8) var(--cx-sp-4);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  color: var(--cx-ink-soft);
  text-align: center;
}
.lista-vazia p {
  margin: 0;
}
.lista-vazia__titulo {
  font-weight: 600;
  color: var(--cx-ink);
}
</style>
