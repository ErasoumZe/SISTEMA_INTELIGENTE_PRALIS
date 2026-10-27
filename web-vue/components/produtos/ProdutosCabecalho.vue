<script setup lang="ts">
/** Titulo e acoes da listagem de Produtos. A loja importa da BASE; o administrador cuida do catalogo. */
defineProps<{ total: number; ehAdmin: boolean; podeCriar: boolean }>();
</script>

<template>
  <header class="produtos-cabecalho">
    <div>
      <h1>Produtos</h1>
      <p>{{ total }} produto(s) nesta loja</p>
    </div>
    <div class="produtos-cabecalho__acoes">
      <v-btn v-if="ehAdmin" variant="outlined" prepend-icon="mdi-wrench-outline" to="/produtos/manutencao">
        Manutenção
      </v-btn>
      <!-- Oficial: a loja recebe produto por importacao da BASE; o admin administra o catalogo. -->
      <v-btn
        v-if="ehAdmin || podeCriar"
        variant="outlined"
        prepend-icon="mdi-database-import-outline"
        to="/produtos/base"
      >
        {{ ehAdmin ? "Catálogo BASE" : "Importar da base" }}
      </v-btn>
      <v-btn v-if="ehAdmin" variant="outlined" prepend-icon="mdi-merge" to="/produtos/central">
        Central de produtos
      </v-btn>
      <v-btn v-if="podeCriar" color="primary" prepend-icon="mdi-plus" to="/produtos/novo">Novo produto</v-btn>
    </div>
  </header>
</template>

<style scoped>
.produtos-cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}
.produtos-cabecalho__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.produtos-cabecalho h1 {
  font-size: var(--cx-fs-h2);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
}
.produtos-cabecalho p {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
</style>
