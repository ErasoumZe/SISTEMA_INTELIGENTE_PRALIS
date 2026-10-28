<script setup lang="ts">
import { computed, ref } from "vue";
import { formatarDataHora } from "~/utils/formatacao";

type Registro = Record<string, unknown>;

// Botao do Relatorio final: mostra quantas vendas foram canceladas e abre um popup com cada uma
// (hora, produtos, pagamento e a justificativa). So le o dossie; os cancelamentos continuam FORA dos totais.
const props = defineProps<{
  vendas: Registro[];
  dinheiro: (valor: number) => string;
  numero: (valor: unknown) => number;
  texto: (valor: unknown) => string;
}>();

const aberto = ref(false);
const total = computed(() => props.vendas.reduce((soma, venda) => soma + props.numero(venda.valorOriginal), 0));

function lista(valor: unknown): Registro[] {
  return Array.isArray(valor) ? (valor as Registro[]) : [];
}
function quando(valor: unknown) {
  return valor ? formatarDataHora(String(valor)) : "--";
}
</script>

<template>
  <div class="vc" data-teste="vendas-canceladas">
    <v-btn
      block
      variant="tonal"
      color="pink-lighten-1"
      class="vc__botao"
      prepend-icon="mdi-receipt-text-remove-outline"
      data-teste="botao-vendas-canceladas"
      @click="aberto = true"
    >
      Vendas canceladas
      <span class="vc__contagem">{{ vendas.length }}</span>
      <span v-if="vendas.length" class="vc__valor cx-num">{{ dinheiro(total) }}</span>
    </v-btn>

    <v-dialog v-model="aberto" max-width="720" scrollable>
      <v-card class="vc__card">
        <v-toolbar color="pink-darken-3" density="compact">
          <v-toolbar-title>Vendas canceladas · {{ vendas.length }}</v-toolbar-title>
          <v-btn icon="mdi-close" size="large" aria-label="Fechar vendas canceladas" @click="aberto = false" />
        </v-toolbar>
        <v-card-text class="vc__corpo">
          <p v-if="vendas.length" class="vc__nota">
            {{ dinheiro(total) }} em vendas canceladas, fora dos totais do caixa.
          </p>
          <p v-else class="vc__vazio" data-teste="sem-vendas-canceladas">Nenhuma venda cancelada neste caixa.</p>
          <article v-for="venda in vendas" :key="String(venda.id)" class="vc__venda">
            <header>
              <strong>{{ texto(venda.descricao) }}</strong>
              <span class="cx-num">{{ dinheiro(numero(venda.valorOriginal)) }}</span>
            </header>
            <small>
              {{ quando(venda.dataHora ?? venda.data) }}
              <template v-if="venda.identificadorExterno"> · venda {{ texto(venda.identificadorExterno) }}</template>
            </small>
            <p class="vc__motivo">
              <b>Justificativa:</b>
              <template v-if="venda.cancelamentoJustificativa || venda.cancelamentoMotivo">{{
                texto(venda.cancelamentoJustificativa || venda.cancelamentoMotivo)
              }}</template>
              <em v-else>Sem justificativa registrada</em>
              <template v-if="venda.cancelamentoJustificativa && venda.cancelamentoMotivo">
                · motivo: {{ texto(venda.cancelamentoMotivo) }}</template
              >
              <template v-if="venda.cancelamentoAutorizadoPorAutomacao">
                · autorizado por {{ texto(venda.cancelamentoAutorizadoPorAutomacao) }}</template
              >
            </p>
            <h4 v-if="lista(venda.produtos).length" class="vc__sub">Produtos</h4>
            <ul v-if="lista(venda.produtos).length" class="vc__itens" aria-label="Produtos da venda">
              <li v-for="produto in lista(venda.produtos)" :key="String(produto.id ?? produto.descricao)">
                <span>{{ produto.quantidade ?? "?" }} × {{ texto(produto.descricao) }}</span>
                <span class="cx-num">{{ dinheiro(numero(produto.valorTotal)) }}</span>
              </li>
            </ul>
            <h4 v-if="lista(venda.pagamentos).length" class="vc__sub">Pagamento</h4>
            <ul v-if="lista(venda.pagamentos).length" class="vc__itens vc__itens--pag" aria-label="Pagamentos da venda">
              <li v-for="pagamento in lista(venda.pagamentos)" :key="String(pagamento.id ?? pagamento.formaPagamento)">
                <span>{{ texto(pagamento.formaPagamento || pagamento.tipoPagamentoAutomacao) }}</span>
                <span class="cx-num">{{ dinheiro(numero(pagamento.valor)) }}</span>
              </li>
            </ul>
          </article>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.vc {
  --sec: #db2777;
  display: grid;
  gap: var(--cx-sp-1);
}
.vc__botao {
  min-height: 44px;
  justify-content: flex-start;
  text-transform: none;
}
.vc__botao :deep(.v-btn__content) {
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  white-space: normal;
}
.vc__contagem {
  padding: 0 var(--cx-sp-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sec) 28%, transparent);
  font-weight: 800;
}
.vc__valor {
  margin-left: auto;
  font-weight: 700;
}
@media (width <= 480px) {
  .vc__valor {
    width: 100%;
    margin-left: 0;
  }
}
.vc__vazio {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.vc__card {
  max-height: min(88dvh, 820px);
}
.vc__corpo {
  display: grid;
  gap: var(--cx-sp-3);
}
.vc__nota {
  margin: 0;
  font-size: var(--cx-fs-body);
  font-weight: 600;
}
.vc__sub {
  margin: var(--cx-sp-1) 0 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
  text-transform: uppercase;
}
.vc__venda {
  display: grid;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-3);
  border: 1px solid color-mix(in srgb, var(--sec) 40%, var(--cx-line));
  border-left: 4px solid var(--sec);
  border-radius: var(--cx-r-md);
  background: color-mix(in srgb, var(--sec) 6%, transparent);
}
.vc__venda header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  overflow-wrap: anywhere;
}
.vc__venda small {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.vc__motivo {
  margin: 0;
  overflow-wrap: anywhere;
}
.vc__itens {
  display: grid;
  gap: var(--cx-sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.vc__itens li {
  display: flex;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  overflow-wrap: anywhere;
}
.vc__itens--pag {
  padding-top: var(--cx-sp-1);
  border-top: 1px dashed var(--cx-line);
}
</style>
