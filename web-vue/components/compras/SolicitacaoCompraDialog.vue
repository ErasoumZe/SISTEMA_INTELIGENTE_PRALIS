<script setup lang="ts">
/**
 * A conferência do pedido do dia (doc 58 §2): a lista de produtos do agendamento com o estoque e a sugestão; o
 * responsável põe as quantidades e envia. Cada fornecedor do catálogo recebe só os seus produtos. Produto sem
 * fornecedor: escolhe-se aqui, e o vínculo vai para o catálogo. Quantidade vazia = o produto não vai neste pedido.
 */
import { podeConvidar, type EnviarSolicitacaoCompraPayload, type SolicitacaoCompraDetalheDto } from "@padaria/shared";
import BolinhasLegenda from "~/components/compras/BolinhasLegenda.vue";
import ProdutoBolinhas from "~/components/compras/ProdutoBolinhas.vue";
import type { Opcao } from "~/types/padaria";
import { formatarQuantidade } from "~/utils/formatacao";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  detalhe: SolicitacaoCompraDetalheDto | null;
  fornecedores: Opcao[];
  enviando: boolean;
  erro: string;
}>();
const emit = defineEmits<{ enviar: [itens: EnviarSolicitacaoCompraPayload["itens"]] }>();

const quantidades = ref<Record<string, string>>({});
const escolhido = ref<Record<string, string | null>>({});
watch(
  () => props.detalhe,
  (detalhe) => {
    quantidades.value = Object.fromEntries(
      (detalhe?.itens ?? []).map((item) => [
        item.produtoId,
        item.quantidadeSugerida ? String(Number(item.quantidadeSugerida)) : ""
      ])
    );
    escolhido.value = {};
  },
  { immediate: true }
);

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const opcoesFornecedor = computed(() =>
  props.fornecedores.map((fornecedor) => {
    const motivo = podeConvidar({ situacao: fornecedor.situacao ?? null, whatsapp: fornecedor.whatsapp ?? null });
    return {
      value: fornecedor.id,
      title: motivo ? `${fornecedor.nome ?? "Fornecedor"} — ${motivo}` : (fornecedor.nome ?? "Fornecedor"),
      props: { disabled: Boolean(motivo) }
    };
  })
);
const comQuantidade = computed(() =>
  (props.detalhe?.itens ?? []).filter((item) => Number(quantidades.value[item.produtoId]) > 0)
);
const faltaFornecedor = computed(() =>
  comQuantidade.value.filter((item) => !item.fornecedores.length && !escolhido.value[item.produtoId])
);
const impedimento = computed(() => {
  if (!comQuantidade.value.length) return "Ponha a quantidade de ao menos um produto.";
  if (faltaFornecedor.value.length)
    return `Escolha o fornecedor de: ${faltaFornecedor.value.map((item) => item.descricao).join(", ")}.`;
  return "";
});

function enviar() {
  if (impedimento.value) return;
  emit(
    "enviar",
    comQuantidade.value.map((item) => ({
      produtoId: item.produtoId,
      quantidade: Number(quantidades.value[item.produtoId]),
      fornecedorId: item.fornecedores.length ? null : (escolhido.value[item.produtoId] ?? null)
    }))
  );
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="1100" scrollable :fullscreen="$vuetify.display.xs">
    <v-card v-if="detalhe" data-dialogo="solicitacao-compra">
      <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2 text-wrap">
        <span>{{ detalhe.grupoNome }} · {{ DATA_HORA.format(new Date(detalhe.dataAtual)) }}</span>
        <v-chip size="small" label variant="tonal">{{ comQuantidade.length }} produto(s) para enviar</v-chip>
      </v-card-title>
      <v-card-subtitle class="text-wrap">
        Resposta em {{ detalhe.prazoRespostaHoras }} h · variação aceita {{ detalhe.margemVariacaoPercentual }}%
        <template v-if="detalhe.recebimentoInicio">
          · recebemos das {{ detalhe.recebimentoInicio }} às {{ detalhe.recebimentoFim }}</template
        >
      </v-card-subtitle>
      <v-card-text class="d-grid ga-3">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>
        <BolinhasLegenda />
        <div v-for="item in detalhe.itens" :key="item.produtoId" class="linha" :data-produto="item.descricao">
          <div class="linha__produto">
            <span
              ><strong>{{ item.descricao }}</strong>
              <ProdutoBolinhas :mais-vende="item.maisVende" :mais-compra="item.maisCompra" :mais-lucro="item.maisLucro"
            /></span>
            <span class="text-caption text-medium-emphasis"
              >Estoque {{ formatarQuantidade(item.estoqueAtual) }} {{ item.unidade ?? "" }} · máx.
              {{ formatarQuantidade(item.estoqueMax) }}</span
            >
          </div>
          <v-text-field
            v-model="quantidades[item.produtoId]"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.001"
            label="Quantidade"
            :suffix="item.unidade ?? ''"
            density="compact"
            hide-details
            class="linha__quantidade"
          />
          <div class="linha__fornecedores">
            <template v-if="item.fornecedores.length">
              <v-chip v-for="fornecedor in item.fornecedores" :key="fornecedor.fornecedorId" size="x-small" label>{{
                fornecedor.nome
              }}</v-chip>
            </template>
            <v-autocomplete
              v-else
              v-model="escolhido[item.produtoId]"
              :items="opcoesFornecedor"
              label="Sem fornecedor: escolha"
              density="compact"
              hide-details
              :error="Number(quantidades[item.produtoId]) > 0 && !escolhido[item.produtoId]"
              data-campo="fornecedor-escolhido"
            />
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <span v-if="impedimento" class="text-caption text-warning px-2">{{ impedimento }}</span>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-send"
          :loading="enviando"
          :disabled="Boolean(impedimento)"
          @click="enviar"
          >Enviar aos fornecedores</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.linha {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 160px minmax(0, 1.4fr);
  gap: var(--cx-sp-3);
  align-items: center;
  padding: var(--cx-sp-2) 0;
  border-bottom: 1px solid var(--cx-line-soft);
}

.linha__produto {
  display: grid;
}

.linha__fornecedores {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 767px) {
  .linha {
    grid-template-columns: minmax(0, 1fr) 140px;
  }

  .linha__fornecedores {
    grid-column: 1 / -1;
  }
}
</style>
