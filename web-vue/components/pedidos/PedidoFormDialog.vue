<script setup lang="ts">
/**
 * Compositor do pedido de compra.
 *
 * Tres coisas que a versao anterior nao fazia e custavam caro na operacao:
 *
 * 1. O campo de produto nao resolvia (faltava o import) e a linha aparecia so com "Quantidade".
 * 2. Nao havia resumo: o comprador nao via quantos itens nem quanto estava pedindo.
 * 3. O teto de estoque so era checado no servidor — o pedido inteiro voltava como erro seco.
 *
 * Agora o cabecalho e o rodape ficam fixos, os itens rolam no meio, e salvar fica bloqueado com
 * motivo visivel enquanto houver linha incompleta ou acima do maximo.
 */
import type { PedidoRecorrencia, ProdutoEstoqueDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import type { PedidoFormEdicao } from "~/types/pedidos";
import PedidoItemLinha from "~/components/pedidos/PedidoItemLinha.vue";
import { formatarQuantidade } from "~/utils/formatacao";

const aberto = defineModel<boolean>({ required: true });
const props = defineProps<{
  titulo: string;
  empresaId: string;
  fornecedores: Opcao[];
  form: PedidoFormEdicao;
  salvando: boolean;
  /**
   * Posicao de estoque por id de produto. Vazio quando o ator nao tem `estoque_produtos_visualizar`:
   * nesse caso a tela continua salvando pedido, so nao mostra saldo nem antecipa o teto, que o
   * servidor valida de qualquer jeito.
   */
  estoquePorProduto: Record<string, ProdutoEstoqueDto>;
}>();
const emit = defineEmits<{ salvar: []; adicionar: []; remover: [indice: number] }>();

const recorrencias: Array<{ value: PedidoRecorrencia; label: string }> = [
  { value: "nenhuma", label: "Sem recorrência" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" }
];

const fornecedorSelecionado = computed(() =>
  props.fornecedores.find((fornecedor) => fornecedor.id === props.form.fornecedorId)
);
// `whatsapp` so vem no contrato completo de fornecedores. Quando a chave nem existe no objeto, a
// tela nao sabe e nao deve afirmar que falta cadastro.
const whatsappConhecido = computed(() => fornecedorSelecionado.value && "whatsapp" in fornecedorSelecionado.value);
const semWhatsapp = computed(() => whatsappConhecido.value && !fornecedorSelecionado.value?.whatsapp);

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

const impedimento = computed(() => {
  if (!props.form.fornecedorId) return "Escolha o fornecedor do pedido.";
  if (!linhasValidas.value.length) return "Adicione ao menos um produto com quantidade.";
  if (produtoRepetido.value) return "O mesmo produto aparece duas vezes: junte as quantidades.";
  if (linhasAcimaDoMaximo.value.length) return "Há item acima do estoque máximo configurado.";
  return "";
});
</script>

<template>
  <v-dialog v-model="aberto" max-width="1000" scrollable persistent>
    <v-card class="pedido-form">
      <div class="pedido-form__topo">
        <div class="pedido-form__titulo">
          <h2 class="text-h6">{{ titulo }}</h2>
          <p class="text-caption text-medium-emphasis">
            Um pedido, um fornecedor. O estoque só muda no recebimento físico.
          </p>
        </div>
        <v-chip class="pedido-form__resumo" size="small" variant="tonal" label
          >{{ linhasValidas.length }} item(ns) · {{ formatarQuantidade(totalUnidades) }}</v-chip
        >
      </div>

      <div class="pedido-form__fornecedor">
        <v-select
          v-model="form.fornecedorId"
          :items="fornecedores"
          item-title="nome"
          item-value="id"
          label="Fornecedor *"
          density="comfortable"
          hide-details="auto"
          prepend-inner-icon="mdi-truck-outline"
        />
        <v-alert v-if="semWhatsapp" type="warning" density="compact" variant="tonal" class="pedido-form__aviso">
          Sem WhatsApp cadastrado: dá para salvar, mas não dá para enviar por WhatsApp.
        </v-alert>
      </div>

      <v-card-text class="pedido-form__itens">
        <div class="pedido-form__secao">
          <span class="pedido-form__secao-titulo">Itens do pedido</span>
          <v-btn variant="text" size="small" prepend-icon="mdi-plus" @click="emit('adicionar')">Adicionar item</v-btn>
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
          {{ linhasIncompletas }} linha(s) sem produto ou sem quantidade não entram no pedido.
        </v-alert>

        <v-divider class="my-2" />

        <div class="pedido-form__secao">
          <span class="pedido-form__secao-titulo">Agendamento</span>
        </div>
        <div class="pedido-form__agenda">
          <v-select
            v-model="form.recorrencia"
            :items="recorrencias"
            item-title="label"
            item-value="value"
            label="Agendador"
            density="comfortable"
            hide-details
          />
          <v-text-field
            v-model="form.dataAgendada"
            type="datetime-local"
            label="Revisar em"
            density="comfortable"
            hide-details
          />
          <v-textarea
            v-model="form.observacao"
            rows="1"
            auto-grow
            label="Observação"
            density="comfortable"
            hide-details
          />
        </div>
        <p class="text-caption text-medium-emphasis mt-2">
          O agendador apenas lembra o comprador de revisar a sugestão; não envia pedido sozinho.
        </p>
      </v-card-text>

      <div class="pedido-form__rodape">
        <span v-if="impedimento" class="pedido-form__impedimento" data-campo="impedimento">{{ impedimento }}</span>
        <span v-else class="pedido-form__pronto"
          >Pronto para salvar: {{ linhasValidas.length }} item(ns), {{ formatarQuantidade(totalUnidades) }} no
          total.</span
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="salvando" :disabled="Boolean(impedimento)" @click="emit('salvar')"
          >Salvar pedido</v-btn
        >
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.pedido-form {
  overflow: hidden;
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-xl);
  background: var(--cx-surface-raised);
  box-shadow: var(--cx-e-3);
}

.pedido-form__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-6) var(--cx-sp-6) var(--cx-sp-4);
}

.pedido-form__titulo h2 {
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
  line-height: 1.2;
}

.pedido-form__titulo p {
  margin-top: var(--cx-sp-1);
  color: var(--cx-ink-soft);
  line-height: 1.5;
}

.pedido-form__resumo {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.pedido-form__fornecedor {
  display: grid;
  gap: var(--cx-sp-2);
  padding: 0 var(--cx-sp-6) var(--cx-sp-4);
  border-bottom: 1px solid var(--cx-line-soft);
}

.pedido-form__aviso {
  margin: 0;
}

.pedido-form__itens {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-6);
  background: var(--cx-surface-sunken);
}

.pedido-form__secao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.pedido-form__secao-titulo {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cx-ink-soft);
}

.pedido-form__agenda {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}

.pedido-form__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-4) var(--cx-sp-6) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
  background: var(--cx-surface-raised);
}

.pedido-form__impedimento {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-warning));
}

.pedido-form__pronto {
  font-size: 0.8125rem;
  color: var(--cx-ink-soft);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 959px) {
  .pedido-form__agenda {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 599px) {
  .pedido-form__topo,
  .pedido-form__fornecedor,
  .pedido-form__itens,
  .pedido-form__rodape {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .pedido-form__rodape {
    justify-content: stretch;
  }
}
</style>
