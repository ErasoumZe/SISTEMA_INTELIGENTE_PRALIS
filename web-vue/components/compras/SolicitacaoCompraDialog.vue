<script setup lang="ts">
/**
 * A conferência do pedido do dia (doc 58 §2): os produtos do agendamento com estoque e máximo como referência; o
 * responsável põe as quantidades (o agendamento não traz quantidade) e envia. Cada fornecedor do catálogo recebe só
 * os seus produtos. Produto sem fornecedor: escolhe-se aqui, e o vínculo vai para o catálogo. Quantidade vazia = o
 * produto não vai neste pedido.
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
const busca = ref("");
watch(
  () => props.detalhe,
  (detalhe) => {
    quantidades.value = Object.fromEntries((detalhe?.itens ?? []).map((item) => [item.produtoId, ""]));
    escolhido.value = {};
    busca.value = "";
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
const itens = computed(() => {
  const termo = (busca.value ?? "").trim().toLocaleLowerCase("pt-BR");
  const todos = props.detalhe?.itens ?? [];
  return termo ? todos.filter((item) => item.descricao.toLocaleLowerCase("pt-BR").includes(termo)) : todos;
});
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
  <v-dialog v-model="aberto" max-width="1000" scrollable :fullscreen="$vuetify.display.xs">
    <v-card v-if="detalhe" class="solicitacao" data-dialogo="solicitacao-compra">
      <header class="solicitacao__topo">
        <div class="solicitacao__titulos">
          <h2 class="solicitacao__titulo">{{ detalhe.grupoNome }}</h2>
          <p class="solicitacao__meta">
            <span>Pedido de {{ DATA_HORA.format(new Date(detalhe.dataAtual)) }}</span>
            <span>Resposta em {{ detalhe.prazoRespostaHoras }} h</span>
            <span>Variação aceita {{ detalhe.margemVariacaoPercentual }}%</span>
            <span v-if="detalhe.recebimentoInicio"
              >Recebemos das {{ detalhe.recebimentoInicio }} às {{ detalhe.recebimentoFim }}</span
            >
          </p>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="aberto = false" />
      </header>

      <div class="solicitacao__ferramentas">
        <v-text-field
          v-model="busca"
          placeholder="Buscar produto"
          prepend-inner-icon="mdi-magnify"
          clearable
          density="compact"
          hide-details
          aria-label="Buscar produto"
          class="solicitacao__busca"
        />
        <BolinhasLegenda />
      </div>

      <v-card-text class="solicitacao__corpo">
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mx-5 mb-3">{{ erro }}</v-alert>
        <div class="cabecalho" aria-hidden="true">
          <span>Produto</span>
          <span>Quantidade</span>
          <span>Vai para</span>
        </div>
        <div
          v-for="item in itens"
          :key="item.produtoId"
          class="linha"
          :class="{ 'linha--marcada': Number(quantidades[item.produtoId]) > 0 }"
          :data-produto="item.descricao"
        >
          <div class="linha__produto">
            <span class="linha__nome"
              >{{ item.descricao }}
              <ProdutoBolinhas :mais-vende="item.maisVende" :mais-compra="item.maisCompra" :mais-lucro="item.maisLucro"
            /></span>
            <span class="linha__estoque"
              >Estoque {{ formatarQuantidade(item.estoqueAtual) }} · máx. {{ formatarQuantidade(item.estoqueMax) }}
              {{ item.unidade ?? "" }}</span
            >
          </div>
          <v-text-field
            v-model="quantidades[item.produtoId]"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.001"
            placeholder="0"
            :suffix="item.unidade ?? ''"
            density="compact"
            hide-details
            :aria-label="`Quantidade de ${item.descricao}`"
            class="linha__quantidade"
          />
          <div class="linha__fornecedores">
            <span v-if="item.fornecedores.length" class="linha__destino">{{
              item.fornecedores.map((fornecedor) => fornecedor.nome).join(", ")
            }}</span>
            <v-autocomplete
              v-else
              v-model="escolhido[item.produtoId]"
              :items="opcoesFornecedor"
              placeholder="Sem fornecedor: escolha"
              density="compact"
              hide-details
              :error="Number(quantidades[item.produtoId]) > 0 && !escolhido[item.produtoId]"
              :aria-label="`Fornecedor de ${item.descricao}`"
              data-campo="fornecedor-escolhido"
            />
          </div>
        </div>
        <p v-if="!itens.length" class="solicitacao__vazio">Nenhum produto com este nome.</p>
      </v-card-text>

      <footer class="solicitacao__rodape">
        <span v-if="impedimento" class="solicitacao__aviso">{{ impedimento }}</span>
        <span v-else class="solicitacao__resumo"
          >{{ comQuantidade.length }} produto(s) vão para os fornecedores pelo WhatsApp.</span
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          append-icon="mdi-send"
          :loading="enviando"
          :disabled="Boolean(impedimento)"
          @click="enviar"
          >Enviar aos fornecedores</v-btn
        >
      </footer>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.solicitacao {
  border-radius: var(--cx-r-lg) !important;
}

.solicitacao__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-5) var(--cx-sp-4) var(--cx-sp-2) var(--cx-sp-5);
}

.solicitacao__titulos {
  display: grid;
  gap: var(--cx-sp-2);
  min-width: 0;
}

.solicitacao__titulo {
  margin: 0;
  color: var(--cx-ink);
  font-size: var(--cx-fs-title);
  font-weight: 650;
  letter-spacing: var(--cx-tracking-tight);
}

.solicitacao__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1) var(--cx-sp-2);
  margin: 0;
}

.solicitacao__meta span {
  padding: 2px 10px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.solicitacao__ferramentas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-bottom: 1px solid var(--cx-line-soft);
}

.solicitacao__busca {
  flex: 0 1 300px;
}

.solicitacao__corpo {
  padding: 0 !important;
}

.cabecalho,
.linha {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 150px minmax(0, 1.4fr);
  align-items: center;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-2) var(--cx-sp-5);
}

.cabecalho {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 600;
}

.linha {
  border-top: 1px solid var(--cx-line-soft);
  transition: background-color var(--cx-dur-1) var(--cx-ease);
}

.linha--marcada {
  background: color-mix(in srgb, var(--cx-brand) 4%, var(--cx-surface));
}

.linha__produto {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.linha__nome {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  color: var(--cx-ink);
  font-weight: 600;
}

.linha__estoque {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-variant-numeric: tabular-nums;
}

.linha__destino {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.solicitacao__vazio {
  padding: var(--cx-sp-6);
  color: var(--cx-ink-soft);
  text-align: center;
}

.solicitacao__rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

.solicitacao__aviso {
  color: var(--cx-attention);
  font-size: var(--cx-fs-caption);
}

.solicitacao__resumo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

@media (max-width: 767px) {
  .cabecalho {
    display: none;
  }

  .linha {
    grid-template-columns: minmax(0, 1fr) 130px;
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .linha__fornecedores {
    grid-column: 1 / -1;
  }

  .solicitacao__topo,
  .solicitacao__ferramentas,
  .solicitacao__rodape {
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }
}
</style>
