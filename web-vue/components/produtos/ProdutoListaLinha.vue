<script setup lang="ts">
import type { ProdutoResumo } from "@padaria/shared/produtos";

defineProps<{
  produto: ProdutoResumo;
  podeEditar: boolean;
  alterandoStatus?: boolean;
  selecionavel?: boolean;
  selecionado?: boolean;
}>();
defineEmits<{ "alternar-status": []; selecionar: [] }>();
</script>

<template>
  <article class="produto-linha" role="listitem">
    <div class="produto-linha__identidade">
      <v-checkbox-btn
        v-if="selecionavel"
        :model-value="selecionado"
        density="compact"
        :aria-label="`Selecionar ${produto.nomeCatalogo || produto.descricao}`"
        @update:model-value="$emit('selecionar')"
      />
      <div class="produto-linha__avatar" aria-hidden="true">
        {{ (produto.nomeCatalogo || produto.descricao).trim().charAt(0).toLocaleUpperCase("pt-BR") || "•" }}
      </div>
      <div class="produto-linha__texto">
        <h2>{{ produto.nomeCatalogo || produto.descricao }}</h2>
        <p class="cx-num">{{ produto.codigoInterno || produto.codigo || "Sem código" }}</p>
      </div>
    </div>
    <div class="produto-linha__detalhes">
      <span>{{ produto.marca || "Sem marca" }}</span>
      <span>{{ produto.quantidadeIndividual }} {{ produto.unidadeIndividualSigla || "" }}</span>
      <button
        v-if="podeEditar"
        type="button"
        class="produto-linha__status produto-linha__status--acao"
        :class="produto.status === 'ativo' ? 'is-ativo' : 'is-inativo'"
        :disabled="alterandoStatus"
        :aria-label="`${produto.status === 'ativo' ? 'Inativar' : 'Ativar'} ${produto.nomeCatalogo || produto.descricao}`"
        @click="$emit('alternar-status')"
      >
        {{ alterandoStatus ? "..." : produto.status === "ativo" ? "Ativo" : "Inativo" }}
      </button>
      <span v-else class="produto-linha__status" :class="produto.status === 'ativo' ? 'is-ativo' : 'is-inativo'">
        {{ produto.status === "ativo" ? "Ativo" : "Inativo" }}
      </span>
    </div>
    <div class="produto-linha__acao">
      <strong v-if="produto.precoVendaAtual != null" class="cx-num">
        {{ produto.precoVendaAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }}
      </strong>
      <span v-else class="produto-linha__sem-preco">Sem preço</span>
      <v-btn
        size="small"
        variant="text"
        :prepend-icon="podeEditar ? 'mdi-pencil-outline' : 'mdi-eye-outline'"
        :aria-label="`${podeEditar ? 'Editar' : 'Ver'} ${produto.nomeCatalogo || produto.descricao}`"
        :to="`/produtos/${produto.id}`"
      >
        {{ podeEditar ? "Editar" : "Ver" }}
      </v-btn>
    </div>
  </article>
</template>

<style scoped>
.produto-linha {
  display: grid;
  grid-template-columns: minmax(180px, 1.5fr) minmax(160px, 1fr) auto;
  align-items: center;
  gap: var(--cx-sp-3);
  min-width: 0;
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface);
}
.produto-linha__identidade,
.produto-linha__detalhes,
.produto-linha__acao {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  min-width: 0;
}
.produto-linha__avatar {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-weight: 700;
}
.produto-linha__texto {
  min-width: 0;
}
.produto-linha__texto h2,
.produto-linha__texto p {
  margin: 0;
}
.produto-linha__texto h2 {
  overflow: hidden;
  color: var(--cx-ink);
  font-size: var(--cx-fs-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.produto-linha__texto p,
.produto-linha__detalhes,
.produto-linha__sem-preco {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.produto-linha__detalhes {
  flex-wrap: wrap;
}
.produto-linha__status {
  padding: 2px var(--cx-sp-2);
  border-radius: var(--cx-r-pill);
  font-size: var(--cx-fs-micro);
  font-weight: 600;
}
.produto-linha__status.is-ativo {
  color: var(--cx-positive);
}
.produto-linha__status.is-inativo {
  color: var(--cx-ink-soft);
}
.produto-linha__status--acao {
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--cx-dur-1) var(--cx-ease);
}
.produto-linha__status--acao:hover:not(:disabled) {
  border-color: currentColor;
}
.produto-linha__status--acao:focus-visible {
  outline: 2px solid var(--cx-brand);
  outline-offset: 2px;
}
.produto-linha__status--acao:disabled {
  cursor: progress;
  opacity: 0.6;
}
.produto-linha__acao {
  justify-content: flex-end;
}
.produto-linha__acao strong {
  color: var(--cx-ink);
  white-space: nowrap;
}

@media (max-width: 600px) {
  .produto-linha {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--cx-sp-2);
    padding: var(--cx-sp-3);
  }
  .produto-linha__identidade {
    grid-column: 1 / -1;
  }
  .produto-linha__detalhes {
    gap: var(--cx-sp-2);
  }
  .produto-linha__acao {
    gap: var(--cx-sp-1);
  }
}
</style>
