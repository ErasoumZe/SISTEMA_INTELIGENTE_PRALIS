<script setup lang="ts">
/**
 * Tabela do catalogo BASE. Cada linha diz se o produto ja esta na loja de destino ("Importado") ou
 * nao ("Novo"), como no "Importar da base" do paralelo. A selecao vem de fora (atravessa paginas).
 */
import type { ProdutoBase } from "~/composables/useImportacaoDaBase";

defineProps<{
  itens: ProdutoBase[];
  selecionados: Record<string, string>;
  paginaToda: boolean;
  paginaEmParte: boolean;
  podeImportar: boolean;
  ehAdmin: boolean;
  ocupado: boolean;
  copiandoId: string | null;
}>();
const emit = defineEmits<{
  selecionar: [produto: ProdutoBase, marcado: boolean | null];
  "selecionar-pagina": [marcado: boolean | null];
  ver: [produto: ProdutoBase];
  copiar: [produto: ProdutoBase];
}>();

function grupoProduto(produto: ProdutoBase) {
  const grupo = produto.dadosOficiais["grupo"];
  return typeof grupo === "string" && grupo.trim() ? grupo : produto.grupoIdOrigem || "—";
}
</script>

<template>
  <v-table class="catalogo-tabela">
    <thead>
      <tr>
        <th v-if="podeImportar">
          <v-checkbox-btn
            :model-value="paginaToda"
            :indeterminate="paginaEmParte"
            aria-label="Selecionar todos os produtos desta página"
            @update:model-value="emit('selecionar-pagina', $event)"
          />
        </th>
        <th>Nome oficial</th>
        <th>Código interno</th>
        <th>EAN</th>
        <th>Grupo oficial</th>
        <th>Situação</th>
        <th>Ações</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="produto in itens" :key="produto.id">
        <td v-if="podeImportar">
          <v-checkbox-btn
            :model-value="produto.id in selecionados"
            :disabled="ocupado"
            :aria-label="`Selecionar ${produto.nome}`"
            @update:model-value="emit('selecionar', produto, $event)"
          />
        </td>
        <td>
          <div class="catalogo-tabela__nome">
            <span>{{ produto.nome }}</span>
            <v-chip v-if="produto.jaImportado === false" size="x-small" color="primary" variant="tonal" label>
              Novo
            </v-chip>
            <v-chip v-else-if="produto.jaImportado === true" size="x-small" color="secondary" label>Importado</v-chip>
          </div>
        </td>
        <td class="cx-num">{{ produto.codigoInterno || "—" }}</td>
        <td class="cx-num">{{ produto.codigoBarras || "—" }}</td>
        <td>{{ grupoProduto(produto) }}</td>
        <td>
          <v-chip size="small" :color="produto.status === 'ativo' ? 'success' : 'default'">{{ produto.status }}</v-chip>
        </td>
        <td class="catalogo-tabela__acoes">
          <v-btn size="small" variant="text" @click="emit('ver', produto)">Ver cadastro</v-btn>
          <v-btn v-if="ehAdmin" size="small" variant="text" :to="`/produtos/base/${produto.id}`">Editar</v-btn>
          <v-btn
            v-if="podeImportar"
            size="small"
            color="primary"
            variant="tonal"
            :loading="copiandoId === produto.id"
            :disabled="ocupado"
            @click="emit('copiar', produto)"
          >
            Copiar para loja
          </v-btn>
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<style scoped>
.catalogo-tabela {
  overflow-x: auto;
}
.catalogo-tabela__nome {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}
.catalogo-tabela__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1);
}
</style>
