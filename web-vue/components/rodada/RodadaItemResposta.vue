<script setup lang="ts">
/**
 * Um produto da cotação, como pergunta de formulário (doc 57 §5): o que pedimos, a referência, e a resposta
 * dele — tenho (valor obrigatório e quanto tem), não tenho agora, ou não trabalho mais com este produto.
 */
import { limitesDaMargem, type RodadaPublicaItemDto, type SituacaoItemPublica } from "@padaria/shared";
import type { Disponibilidade, RespostaItemLocal } from "~/composables/useRodadaFornecedor";
import { formatarQuantidade } from "~/utils/formatacao";

const resposta = defineModel<RespostaItemLocal>({ required: true });
const props = defineProps<{
  item: RodadaPublicaItemDto;
  margem: number | null;
  rotuloSituacao: Record<SituacaoItemPublica, string>;
}>();

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const OPCOES: Array<{ valor: Disponibilidade; rotulo: string }> = [
  { valor: "tenho", rotulo: "Tenho" },
  { valor: "sem_estoque", rotulo: "Não tenho agora" },
  { valor: "nao_trabalha", rotulo: "Não trabalho mais" }
];
const comprado = computed(() => props.item.situacao === "comprado");
const faixa = computed(() => {
  if (props.margem === null) return null;
  const { minimo, maximo } = limitesDaMargem(Number(props.item.quantidade), props.margem);
  return `${formatarQuantidade(minimo)} a ${formatarQuantidade(maximo)}`;
});
const idValor = `valor-${props.item.conviteItemId}`;
</script>

<template>
  <article class="item" :data-item="item.descricaoProduto">
    <header class="item__cabecalho">
      <h3 class="item__nome">{{ item.descricaoProduto }}</h3>
      <v-chip
        v-if="item.situacao !== 'nao_cotado'"
        size="x-small"
        variant="tonal"
        label
        :color="comprado ? 'success' : 'info'"
        >{{ rotuloSituacao[item.situacao] }}</v-chip
      >
    </header>
    <dl class="item__dados">
      <div>
        <dt>Pedimos</dt>
        <dd>{{ formatarQuantidade(item.quantidade) }}</dd>
      </div>
      <div>
        <dt>Referência</dt>
        <dd>{{ item.referencia ? MOEDA.format(Number(item.referencia)) : "Sem histórico" }}</dd>
      </div>
    </dl>
    <p v-if="item.referencia" class="item__dica">
      Quem oferecer até {{ MOEDA.format(Number(item.referencia)) }} primeiro leva este produto.
    </p>

    <v-btn-toggle
      v-model="resposta.disponibilidade"
      mandatory
      divided
      density="comfortable"
      color="primary"
      class="item__opcoes"
      :disabled="comprado"
      :aria-label="`Você tem ${item.descricaoProduto}?`"
    >
      <v-btn v-for="opcao in OPCOES" :key="opcao.valor" :value="opcao.valor" size="small">{{ opcao.rotulo }}</v-btn>
    </v-btn-toggle>

    <div v-if="resposta.disponibilidade === 'tenho'" class="item__campos">
      <v-text-field
        :id="idValor"
        v-model="resposta.valor"
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        prefix="R$"
        label="Valor unitário *"
        density="comfortable"
        hide-details="auto"
        :disabled="comprado"
        :rules="[(valor: string) => Number(valor) > 0 || 'Informe o valor']"
      />
      <v-text-field
        v-model="resposta.quantidade"
        type="number"
        inputmode="decimal"
        min="0"
        step="0.001"
        label="Quanto você tem"
        :placeholder="formatarQuantidade(item.quantidade)"
        persistent-placeholder
        :hint="faixa ? `Aceitamos de ${faixa}` : 'Vazio = a quantidade pedida'"
        persistent-hint
        density="comfortable"
        :disabled="comprado"
      />
    </div>
  </article>
</template>

<style scoped>
.item {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.item__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.item__nome {
  margin: 0;
  color: var(--cx-ink);
  font-size: 1.0625rem;
  font-weight: 650;
}

.item__dados {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2) var(--cx-sp-6);
  margin: 0;
}

.item__dados dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.item__dados dd {
  margin: 0;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.item__dica {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.item__opcoes {
  flex-wrap: wrap;
  height: auto !important;
}

.item__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}

@media (max-width: 599px) {
  .item__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
