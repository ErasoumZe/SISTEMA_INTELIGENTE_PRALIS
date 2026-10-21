<script setup lang="ts">
/**
 * Compositor da solicitacao de compra (Fase 2, R-221).
 *
 * Diferente do pedido legado: a solicitacao NAO tem fornecedor — e a necessidade crua, que depois
 * vira rodada multi-fornecedor. Por isso aqui so ha itens e observacao. O teto de estoque e
 * antecipado por linha (reuso de `PedidoItemLinha`) e pelo conjunto no rodape, batendo com a funcao
 * pura `pendenciasDeTeto` do servidor: o comprador ve o impedimento antes de salvar, nao no 422.
 */
import { podeConvidar } from "@padaria/shared";
import type { ProdutoEstoqueDto } from "@padaria/shared";
import PedidoItemLinha from "~/components/pedidos/PedidoItemLinha.vue";
import type { Opcao } from "~/types/padaria";
import { formatarQuantidade } from "~/utils/formatacao";

export type SolicitacaoFormItem = { produtoId: string; quantidade: string };
// `fornecedorId` so existe no PEDIDO RAPIDO (R-221 decisao 2): a solicitacao comum nao tem fornecedor.
export type SolicitacaoForm = { itens: SolicitacaoFormItem[]; observacao: string; fornecedorId?: string };

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  titulo: string;
  empresaId: string;
  form: SolicitacaoForm;
  salvando: boolean;
  /** Posicao de estoque por id de produto, para saldo/teto por linha. Vazio = sem leitura de estoque. */
  estoquePorProduto: Record<string, ProdutoEstoqueDto>;
  /** Quando ha produtos no minimo para o atalho "preencher com o que esta no minimo". */
  podeReposicao: boolean;
  /** Presente = PEDIDO RAPIDO: um fornecedor so, que vira uma rodada de um convite (R-221 decisao 2). */
  fornecedores?: Opcao[];
  /** Erro da API ao salvar: precisa aparecer DENTRO do dialogo, que cobre a tela com o scrim. */
  erro?: string;
}>();
const emit = defineEmits<{ salvar: []; adicionar: []; remover: [indice: number]; preencherMinimo: [] }>();

const linhasValidas = computed(() => props.form.itens.filter((item) => item.produtoId && Number(item.quantidade) > 0));
const totalUnidades = computed(() => linhasValidas.value.reduce((soma, item) => soma + Number(item.quantidade), 0));
const linhasIncompletas = computed(() => props.form.itens.length - linhasValidas.value.length);
const produtoRepetido = computed(() => {
  const ids = linhasValidas.value.map((item) => item.produtoId);
  return new Set(ids).size !== ids.length;
});
const linhasAcimaDoMaximo = computed(() =>
  props.form.itens.filter((item) => {
    const produto = props.estoquePorProduto[item.produtoId];
    if (!produto || produto.estoqueMax === null) return false;
    return Number(produto.quantidadeEstoque) + Number(item.quantidade) > Number(produto.estoqueMax);
  })
);

const rapido = computed(() => props.fornecedores !== undefined);
// Inativo ou sem WhatsApp aparece, mas nao pode ser escolhido: o motivo fica a vista (a mesma regra do servidor).
const opcoesDeFornecedor = computed(() =>
  (props.fornecedores ?? []).map((fornecedor) => {
    const motivo = podeConvidar({ situacao: fornecedor.situacao ?? null, whatsapp: fornecedor.whatsapp ?? null });
    return {
      id: fornecedor.id,
      titulo: motivo ? `${fornecedor.nome ?? "Fornecedor"} — ${motivo}` : (fornecedor.nome ?? "Fornecedor"),
      props: { disabled: Boolean(motivo) }
    };
  })
);

const impedimento = computed(() => {
  if (rapido.value && !props.form.fornecedorId) return "Escolha o fornecedor.";
  if (!linhasValidas.value.length) return "Adicione ao menos um produto com quantidade.";
  if (produtoRepetido.value) return "O mesmo produto aparece duas vezes: junte as quantidades.";
  if (linhasAcimaDoMaximo.value.length) return "Há item acima do estoque máximo configurado.";
  return "";
});
</script>

<template>
  <v-dialog v-model="aberto" max-width="1000" scrollable persistent>
    <v-card class="solicitacao-form">
      <div class="solicitacao-form__topo">
        <div class="solicitacao-form__titulo">
          <h2 class="text-h6">{{ titulo }}</h2>
          <p v-if="rapido" class="text-caption text-medium-emphasis">
            Um fornecedor só. O pedido abre uma rodada com ele e a compra sai pelo mesmo caminho das demais (preço-base
            e teto).
          </p>
          <p v-else class="text-caption text-medium-emphasis">
            A necessidade nasce sem fornecedor. Vários fornecedores cotam partes dela na rodada.
          </p>
        </div>
        <v-chip class="solicitacao-form__resumo" size="small" variant="tonal" label
          >{{ linhasValidas.length }} item(ns) · {{ formatarQuantidade(totalUnidades) }}</v-chip
        >
      </div>

      <v-card-text class="solicitacao-form__itens">
        <v-select
          v-if="rapido"
          v-model="form.fornecedorId"
          :items="opcoesDeFornecedor"
          item-title="titulo"
          item-value="id"
          label="Fornecedor"
          density="comfortable"
          hide-details="auto"
          data-campo="fornecedor-rapido"
        />
        <div class="solicitacao-form__secao">
          <span class="solicitacao-form__secao-titulo">Itens da solicitação</span>
          <div class="d-flex ga-2 flex-wrap">
            <v-btn
              v-if="podeReposicao"
              variant="text"
              size="small"
              prepend-icon="mdi-auto-fix"
              @click="emit('preencherMinimo')"
              >Preencher com o que está no mínimo</v-btn
            >
            <v-btn variant="text" size="small" prepend-icon="mdi-plus" @click="emit('adicionar')">Adicionar item</v-btn>
          </div>
        </div>

        <PedidoItemLinha
          v-for="(item, indice) in form.itens"
          :key="`item-${indice}`"
          v-model:produto-id="item.produtoId"
          v-model:quantidade="item.quantidade"
          :empresa-id="empresaId"
          :indice="indice"
          :pode-remover="form.itens.length > 1"
          :estoque="estoquePorProduto[item.produtoId] ?? null"
          @remover="emit('remover', indice)"
        />

        <v-alert
          v-if="linhasIncompletas > 0 && linhasValidas.length"
          type="info"
          density="compact"
          variant="tonal"
          class="mt-1"
        >
          {{ linhasIncompletas }} linha(s) sem produto ou sem quantidade não entram na solicitação.
        </v-alert>

        <v-divider class="my-2" />
        <v-textarea
          v-model="form.observacao"
          rows="2"
          auto-grow
          label="Observação"
          density="comfortable"
          hide-details
        />
      </v-card-text>

      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mx-4 mb-2" data-campo="erro-salvar">{{
        erro
      }}</v-alert>

      <div class="solicitacao-form__rodape">
        <span v-if="impedimento" class="solicitacao-form__impedimento" data-campo="impedimento">{{ impedimento }}</span>
        <span v-else class="solicitacao-form__pronto"
          >Pronto para salvar: {{ linhasValidas.length }} item(ns), {{ formatarQuantidade(totalUnidades) }} no
          total.</span
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="salvando" :disabled="Boolean(impedimento)" @click="emit('salvar')">{{
          rapido ? "Enviar pedido" : "Salvar solicitação"
        }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.solicitacao-form {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-3);
}

.solicitacao-form__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-6) var(--cx-sp-6) var(--cx-sp-4);
}

.solicitacao-form__titulo h2 {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
  line-height: 1.2;
}

.solicitacao-form__titulo p {
  margin-top: var(--cx-sp-1);
  color: var(--cx-ink-soft);
  line-height: 1.5;
}

.solicitacao-form__resumo {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.solicitacao-form__itens {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-6);
  background: var(--cx-surface-sunken);
}

.solicitacao-form__secao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  flex-wrap: wrap;
}

.solicitacao-form__secao-titulo {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cx-ink-soft);
}

.solicitacao-form__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-4) var(--cx-sp-6) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
  background: var(--cx-surface-raised);
}

.solicitacao-form__impedimento {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-warning));
}

.solicitacao-form__pronto {
  font-size: 0.8125rem;
  color: var(--cx-ink-soft);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 599px) {
  .solicitacao-form__topo,
  .solicitacao-form__itens,
  .solicitacao-form__rodape {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .solicitacao-form__rodape {
    justify-content: stretch;
  }
}
</style>
