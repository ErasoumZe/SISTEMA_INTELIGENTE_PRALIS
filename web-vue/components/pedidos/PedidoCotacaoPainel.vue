<script setup lang="ts">
/**
 * R-216 — a cotacao vista pelo Comprador dentro do detalhe do pedido.
 *
 * Dois momentos:
 * - aguardando: prazo do link, o link recem-gerado para copiar e o botao de gerar outro;
 * - respondida: proposta do fornecedor lado a lado com o ultimo valor pago, para decidir.
 *
 * Os numeros saem do mesmo `calcularCotacao` que o servidor usou no envio. O total exibido aqui e
 * o gravado na resposta, recalculado a partir dos mesmos valores — nao uma conta paralela.
 */
import { calcularCotacao, entradaDoCalculo, type CotacaoResumoDto, type PedidoStatus } from "@padaria/shared";
import { formatarQuantidade } from "~/utils/formatacao";

const props = defineProps<{
  cotacao: CotacaoResumoDto;
  status: PedidoStatus;
  /** Link gerado nesta sessao. O token sai uma vez so; depois de recarregar, so gerando outro. */
  link: string | null;
  podeEditar: boolean;
  transicionando: boolean;
}>();
const emit = defineEmits<{ novoLink: []; copiar: [link: string] }>();

const calculo = computed(() => {
  const entrada = entradaDoCalculo(props.cotacao);
  return calcularCotacao(entrada.itens, entrada.descontoGeral);
});
const calculoPorId = computed(() => new Map(calculo.value.itens.map((item) => [item.id, item])));

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moedaTexto = (valor: string | null) =>
  valor === null
    ? "—"
    : Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      });
const dataHora = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const prazo = computed(() => dataHora(new Date(new Date(props.cotacao.expiraEm).getTime() - 60_000).toISOString()));

/** Variacao do preco efetivo contra o ultimo valor pago. Sem historico, sem comparacao. */
function variacao(ultimo: string | null, finalDezMilesimos: number): { texto: string; cor: string } | null {
  if (ultimo === null || Number(ultimo) <= 0) return null;
  const percentual = ((finalDezMilesimos / 10_000 - Number(ultimo)) / Number(ultimo)) * 100;
  if (Math.abs(percentual) < 0.05) return { texto: "igual", cor: "secondary" };
  const texto = `${percentual > 0 ? "+" : ""}${percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return { texto, cor: percentual > 0 ? "error" : "success" };
}

const descontoDoItem = (item: CotacaoResumoDto["itens"][number]) => {
  if (!item.descontoValor || !item.descontoTipo) return "—";
  return item.descontoTipo === "percentual"
    ? `${Number(item.descontoValor).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`
    : `${moedaTexto(item.descontoValor)}/un`;
};

/** Uma linha pronta por item: o template so le, nao calcula. */
const linhas = computed(() =>
  props.cotacao.itens.map((item) => {
    const calculado = calculoPorId.value.get(item.pedidoItemId);
    const finalDezMilesimos = calculado?.unitarioFinalDezMilesimos ?? 0;
    return {
      ...item,
      desconto: descontoDoItem(item),
      finalUnitario: moedaTexto(String(finalDezMilesimos / 10_000)),
      total: moeda(calculado?.totalFinalCentavos ?? 0),
      variacao: variacao(item.ultimoValor, finalDezMilesimos)
    };
  })
);
</script>

<template>
  <section class="cotacao-painel" data-secao="cotacao-pedido">
    <template v-if="cotacao.situacao !== 'respondida'">
      <div class="cotacao-painel__aguardando">
        <v-icon
          :icon="cotacao.situacao === 'aberta' ? 'mdi-timer-sand' : 'mdi-timer-off-outline'"
          :color="cotacao.situacao === 'aberta' ? 'primary' : 'warning'"
        />
        <div>
          <strong v-if="cotacao.situacao === 'aberta'">Aguardando o fornecedor responder</strong>
          <strong v-else-if="cotacao.situacao === 'expirada'">O link venceu sem resposta</strong>
          <strong v-else>O último link não vale mais</strong>
          <p v-if="cotacao.situacao === 'aberta'">O link vale até {{ prazo }}.</p>
          <p v-else-if="status === 'enviado'">Gere um novo link e envie de novo ao fornecedor.</p>
        </div>
      </div>
      <div v-if="link && cotacao.situacao === 'aberta'" class="cotacao-painel__link">
        <v-text-field
          :model-value="link"
          label="Link da cotação"
          readonly
          density="compact"
          hide-details
          data-campo="link-cotacao"
        />
        <v-btn variant="tonal" prepend-icon="mdi-content-copy" @click="emit('copiar', link)">Copiar</v-btn>
      </div>
      <v-btn
        v-if="podeEditar && status === 'enviado'"
        variant="text"
        prepend-icon="mdi-link-variant-plus"
        :loading="transicionando"
        class="cotacao-painel__novo"
        @click="emit('novoLink')"
        >Gerar novo link e reenviar</v-btn
      >
    </template>

    <template v-else>
      <header class="cotacao-painel__cabecalho">
        <div>
          <h3>Cotação do fornecedor</h3>
          <p>Respondida em {{ cotacao.respondidaEm ? dataHora(cotacao.respondidaEm) : "—" }}</p>
        </div>
        <div class="cotacao-painel__total">
          <span>Total final</span>
          <strong data-campo="cotacao-total-final">{{ moeda(calculo.totalFinalCentavos) }}</strong>
        </div>
      </header>

      <div class="cotacao-painel__tabela d-none d-md-block">
        <v-table density="compact">
          <thead>
            <tr>
              <th>Produto</th>
              <th class="text-right">Qtd</th>
              <th class="text-right">Último pago</th>
              <th class="text-right">Cotado</th>
              <th class="text-right">Desconto</th>
              <th class="text-right">Final/un</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="linha in linhas"
              :key="linha.pedidoItemId"
              :class="{ 'cotacao-painel__fora': linha.indisponivel }"
            >
              <td>{{ linha.descricao }}</td>
              <td class="text-right">{{ formatarQuantidade(linha.quantidade) }}</td>
              <td class="text-right">{{ moedaTexto(linha.ultimoValor) }}</td>
              <template v-if="linha.indisponivel">
                <td colspan="4" class="text-right text-medium-emphasis">Fornecedor não tem</td>
              </template>
              <template v-else>
                <td class="text-right">{{ moedaTexto(linha.valorUnitario) }}</td>
                <td class="text-right">{{ linha.desconto }}</td>
                <td class="text-right">
                  {{ linha.finalUnitario }}
                  <v-chip
                    v-if="linha.variacao"
                    :color="linha.variacao.cor"
                    size="x-small"
                    variant="tonal"
                    label
                    class="ml-1"
                    >{{ linha.variacao.texto }}</v-chip
                  >
                </td>
                <td class="text-right font-weight-medium">{{ linha.total }}</td>
              </template>
            </tr>
          </tbody>
        </v-table>
      </div>

      <div class="d-md-none cotacao-painel__cartoes">
        <article v-for="linha in linhas" :key="linha.pedidoItemId" class="cotacao-painel__cartao">
          <div class="d-flex justify-space-between ga-2">
            <strong>{{ linha.descricao }}</strong>
            <span>{{ formatarQuantidade(linha.quantidade) }}</span>
          </div>
          <p v-if="linha.indisponivel" class="text-medium-emphasis mb-0">Fornecedor não tem</p>
          <template v-else>
            <div class="d-flex justify-space-between text-body-2">
              <span>Último {{ moedaTexto(linha.ultimoValor) }}</span>
              <span>Cotado {{ moedaTexto(linha.valorUnitario) }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span>Desconto {{ linha.desconto }}</span>
              <strong>{{ linha.total }}</strong>
            </div>
          </template>
        </article>
      </div>

      <dl class="cotacao-painel__totais">
        <div>
          <dt>Total dos produtos</dt>
          <dd>{{ moeda(calculo.totalBrutoCentavos) }}</dd>
        </div>
        <div v-if="calculo.descontoItensCentavos">
          <dt>Descontos nos produtos</dt>
          <dd>− {{ moeda(calculo.descontoItensCentavos) }}</dd>
        </div>
        <div v-if="calculo.descontoGeralCentavos">
          <dt>Desconto no pedido</dt>
          <dd>− {{ moeda(calculo.descontoGeralCentavos) }}</dd>
        </div>
      </dl>

      <dl
        v-if="cotacao.prazoEntrega || cotacao.condicaoPagamento || cotacao.observacao"
        class="cotacao-painel__condicoes"
      >
        <div v-if="cotacao.prazoEntrega">
          <dt>Previsão de entrega</dt>
          <dd>{{ cotacao.prazoEntrega.split("-").reverse().join("/") }}</dd>
        </div>
        <div v-if="cotacao.condicaoPagamento">
          <dt>Pagamento</dt>
          <dd>{{ cotacao.condicaoPagamento }}</dd>
        </div>
        <div v-if="cotacao.observacao" class="cotacao-painel__observacao">
          <dt>Observação do fornecedor</dt>
          <dd>{{ cotacao.observacao }}</dd>
        </div>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.cotacao-painel {
  display: grid;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-4, 16px);
  border: 1px solid var(--cx-line-soft, #eef1f6);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface-sunken, #f4f6fa);
}

.cotacao-painel__aguardando {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3, 12px);
}

.cotacao-painel__aguardando p {
  margin: var(--cx-sp-1, 4px) 0 0;
  font-size: 0.875rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-painel__link {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2, 8px);
}

.cotacao-painel__link :deep(.v-input) {
  min-width: 0;
}

.cotacao-painel__novo {
  justify-self: start;
}

.cotacao-painel__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
}

.cotacao-painel__cabecalho h3 {
  font-size: 1rem;
  font-weight: 600;
}

.cotacao-painel__cabecalho p {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-painel__total {
  display: grid;
  justify-items: end;
}

.cotacao-painel__total span {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-painel__total strong {
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
}

.cotacao-painel__tabela :deep(td),
.cotacao-painel__totais dd {
  font-variant-numeric: tabular-nums;
}

.cotacao-painel__fora td {
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-painel__cartoes {
  display: grid;
  gap: var(--cx-sp-2, 8px);
}

.cotacao-painel__cartao {
  display: grid;
  gap: var(--cx-sp-1, 4px);
  padding: var(--cx-sp-3, 12px);
  border-radius: var(--cx-r-md, 12px);
  background: var(--cx-surface, #fff);
}

.cotacao-painel__totais,
.cotacao-painel__condicoes {
  display: grid;
  gap: var(--cx-sp-1, 4px);
  margin: 0;
}

.cotacao-painel__totais > div,
.cotacao-painel__condicoes > div {
  display: flex;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
  font-size: 0.875rem;
}

.cotacao-painel__totais dt,
.cotacao-painel__condicoes dt {
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-painel__totais dd,
.cotacao-painel__condicoes dd {
  margin: 0;
  text-align: right;
}

.cotacao-painel__condicoes {
  padding-top: var(--cx-sp-2, 8px);
  border-top: 1px solid var(--cx-line, #e4e8ef);
}

.cotacao-painel__observacao {
  flex-direction: column;
}

.cotacao-painel__observacao dd {
  text-align: left;
}
</style>
