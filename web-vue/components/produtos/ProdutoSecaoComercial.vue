<script setup lang="ts">
/**
 * Comercial + estoque parametrizado + ficha de transformacao.
 *
 * O estoque ATUAL e somente leitura: ele so muda por movimentacao. Esta entrega nao cria
 * movimentacao nenhuma — o campo existe para conferencia, nao para digitacao.
 */
import type { ProdutoForm } from "~/composables/produto-formulario-mapa";

defineProps<{
  form: ProdutoForm;
  unidades: Array<{ id: string; sigla: string; nome: string }>;
  setores: string[];
  erros: Record<string, string>;
  precoPreview: number;
  validacaoQtdPreview: string;
  somenteLeitura: boolean;
  dica: (campo: string) => string | undefined;
}>();

const dinheiro = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
</script>

<template>
  <section class="secao">
    <h2 class="secao__titulo">Comercial e estoque</h2>

    <div class="secao__grade">
      <v-text-field
        v-model="form.custo"
        type="number"
        min="0"
        label="Custo da embalagem (R$)"
        :hint="dica('custo')"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.margemPercentual"
        type="number"
        min="0"
        label="Margem do produto"
        suffix="%"
        placeholder="vazio = usa a do grupo"
        :hint="dica('margem')"
        :disabled="somenteLeitura"
      />
      <div class="secao__interruptor">
        <v-switch
          v-model="form.auto"
          color="primary"
          inset
          hide-details
          label="Calcular o preço automaticamente"
          :disabled="somenteLeitura"
        />
      </div>
      <v-text-field
        v-model="form.precoVenda"
        type="number"
        min="0"
        label="Preço de venda (manual)"
        :disabled="form.auto || somenteLeitura"
        :hint="dica('precoVenda')"
      />
      <v-text-field
        :model-value="dinheiro(precoPreview)"
        label="Preço de referência (prévia)"
        readonly
        class="secao__campo-largo secao__previa cx-num"
        hint="O servidor recalcula e manda no salvamento — prévia e valor gravado nunca divergem."
        persistent-hint
      />

      <v-text-field
        :model-value="form.quantidadeEstoque"
        label="Estoque atual"
        readonly
        class="cx-num secao__previa"
        :hint="dica('quantidadeEstoque')"
      />
      <v-select
        v-model="form.setorEstoque"
        :items="setores"
        label="Setor de estoque"
        clearable
        :hint="dica('setorEstoque')"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.estoqueMin"
        type="number"
        min="0"
        label="Estoque mínimo"
        :hint="dica('estoqueMin')"
        :disabled="somenteLeitura"
      />
      <v-text-field
        v-model="form.estoqueMax"
        type="number"
        min="0"
        label="Estoque máximo"
        data-campo="estoqueMax"
        :error-messages="erros['estoqueMax']"
        :hint="dica('estoqueMax')"
        :disabled="somenteLeitura"
      />
    </div>

    <template v-if="form.tipo === 'transformacao'">
      <h3 class="secao__subtitulo">Transformação</h3>
      <div class="secao__grade">
        <v-select
          v-model="form.precisao"
          :items="['EXATOS', 'APROXIMADOS']"
          label="Precisão"
          :hint="dica('precisao')"
          :disabled="somenteLeitura"
        />
        <v-text-field
          v-model="form.quantidadeTransformacao"
          type="number"
          min="0"
          label="Quantidade"
          :hint="dica('quantidadeTransformacao')"
          :disabled="somenteLeitura"
        />
        <v-select
          v-model="form.unidadeTransformacao"
          :items="unidades.map((unidade) => unidade.sigla)"
          label="Unidade"
          clearable
          :hint="dica('unidadeTransformacao')"
          :disabled="somenteLeitura"
        />
        <v-text-field
          v-model="form.produtoReceituario"
          label="Produto de receituário"
          :hint="dica('produtoReceituario')"
          :disabled="somenteLeitura"
        />
        <v-text-field
          :model-value="validacaoQtdPreview"
          label="Validação de quantidade (prévia)"
          readonly
          class="secao__campo-largo secao__previa"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.secao {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.secao__titulo {
  font-size: var(--cx-fs-title);
  font-weight: 700;
  color: var(--cx-ink);
}
.secao__subtitulo {
  padding-top: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line-soft);
  font-size: var(--cx-fs-lead);
  font-weight: 600;
  color: var(--cx-ink);
}
.secao__grade {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}
.secao__campo-largo {
  grid-column: 1 / -1;
}
.secao__interruptor {
  display: flex;
  align-items: center;
}
.secao__previa :deep(.v-field) {
  background: var(--cx-surface-sunken);
}

@media (max-width: 600px) {
  .secao__grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
