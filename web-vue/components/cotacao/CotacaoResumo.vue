<script setup lang="ts">
/**
 * Totais da cotacao e o que vale para o pedido inteiro: desconto geral e condicoes comerciais.
 *
 * O desconto geral e rateado entre os itens pelo calculo compartilhado — aqui so aparece o efeito
 * no total. A frase sob o campo diz isso ao fornecedor, porque "desconto no pedido" e "desconto em
 * cada item" sao decisoes diferentes para quem vende.
 */
import type { CotacaoCalculada, TipoDescontoCotacao } from "@padaria/shared";

export type CondicoesCotacao = {
  descontoGeralTipo: TipoDescontoCotacao;
  descontoGeralValor: string;
  prazoEntrega: string;
  condicaoPagamento: string;
  observacao: string;
};

defineProps<{ calculo: CotacaoCalculada; somenteLeitura?: boolean }>();
const condicoes = defineModel<CondicoesCotacao>({ required: true });

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function alternarTipo(tipo: TipoDescontoCotacao | null) {
  if (tipo) condicoes.value = { ...condicoes.value, descontoGeralTipo: tipo };
}
</script>

<template>
  <section class="cotacao-resumo" aria-labelledby="cotacao-resumo-titulo">
    <h2 id="cotacao-resumo-titulo" class="cotacao-resumo__titulo">Resumo do pedido</h2>

    <dl class="cotacao-resumo__linhas">
      <div>
        <dt>Total dos produtos</dt>
        <dd data-campo="total-bruto">{{ moeda(calculo.totalBrutoCentavos) }}</dd>
      </div>
      <div v-if="calculo.descontoItensCentavos > 0">
        <dt>Descontos nos produtos</dt>
        <dd class="cotacao-resumo__desconto">− {{ moeda(calculo.descontoItensCentavos) }}</dd>
      </div>
      <div>
        <dt>Total com desconto</dt>
        <dd data-campo="total-itens">{{ moeda(calculo.totalItensCentavos) }}</dd>
      </div>
    </dl>

    <div class="cotacao-resumo__geral">
      <span class="cotacao-resumo__rotulo">Desconto no pedido todo</span>
      <div class="cotacao-resumo__geral-campos">
        <v-btn-toggle
          :model-value="condicoes.descontoGeralTipo"
          density="comfortable"
          mandatory
          divided
          variant="outlined"
          :disabled="somenteLeitura"
          aria-label="Tipo do desconto no pedido"
          @update:model-value="alternarTipo"
        >
          <v-btn value="valor" size="small">R$</v-btn>
          <v-btn value="percentual" size="small">%</v-btn>
        </v-btn-toggle>
        <v-text-field
          v-model="condicoes.descontoGeralValor"
          :label="condicoes.descontoGeralTipo === 'valor' ? 'Valor do desconto' : 'Percentual'"
          inputmode="decimal"
          placeholder="0"
          density="comfortable"
          hide-details="auto"
          :readonly="somenteLeitura"
          :error-messages="calculo.erroGeral ?? undefined"
          data-campo="desconto-geral"
        />
      </div>
      <p class="cotacao-resumo__ajuda">Opcional. É dividido entre os produtos, proporcional ao valor de cada um.</p>
    </div>

    <div class="cotacao-resumo__final">
      <div v-if="calculo.descontoGeralCentavos > 0" class="cotacao-resumo__final-desconto">
        <span>Desconto no pedido</span>
        <span>− {{ moeda(calculo.descontoGeralCentavos) }}</span>
      </div>
      <div class="cotacao-resumo__final-total">
        <span>Total final</span>
        <strong data-campo="total-final">{{ moeda(calculo.totalFinalCentavos) }}</strong>
      </div>
    </div>

    <div class="cotacao-resumo__condicoes">
      <v-text-field
        v-model="condicoes.prazoEntrega"
        type="date"
        label="Previsão de entrega"
        density="comfortable"
        hide-details
        :readonly="somenteLeitura"
      />
      <v-text-field
        v-model="condicoes.condicaoPagamento"
        label="Condição de pagamento"
        placeholder="Ex.: 28 dias, à vista, boleto 30/60"
        density="comfortable"
        hide-details
        maxlength="200"
        :readonly="somenteLeitura"
      />
      <v-textarea
        v-model="condicoes.observacao"
        label="Observação para o comprador"
        rows="2"
        auto-grow
        density="comfortable"
        hide-details
        maxlength="1000"
        :readonly="somenteLeitura"
        class="cotacao-resumo__observacao"
      />
    </div>
  </section>
</template>

<style scoped>
.cotacao-resumo {
  display: grid;
  gap: var(--cx-sp-4, 16px);
  padding: var(--cx-sp-5, 20px);
  border: 1px solid var(--cx-line-soft, #eef1f6);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface, #fff);
  box-shadow: var(--cx-e-1, none);
}

.cotacao-resumo__titulo {
  font-size: 1rem;
  font-weight: 600;
  color: var(--cx-ink, #1f2733);
}

.cotacao-resumo__linhas {
  display: grid;
  gap: var(--cx-sp-2, 8px);
  margin: 0;
}

.cotacao-resumo__linhas > div,
.cotacao-resumo__final-desconto,
.cotacao-resumo__final-total {
  display: flex;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
}

.cotacao-resumo__linhas dt {
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-resumo__linhas dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.cotacao-resumo__desconto,
.cotacao-resumo__final-desconto {
  color: var(--cx-positive, #15803d);
}

.cotacao-resumo__geral {
  display: grid;
  gap: var(--cx-sp-2, 8px);
  padding: var(--cx-sp-3, 12px);
  border-radius: var(--cx-r-md, 12px);
  background: var(--cx-surface-sunken, #f4f6fa);
}

.cotacao-resumo__rotulo {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--cx-ink, #1f2733);
}

.cotacao-resumo__geral-campos {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-2, 8px);
}

.cotacao-resumo__geral-campos :deep(.v-btn-group) {
  flex-shrink: 0;
  height: 48px;
}

.cotacao-resumo__geral-campos :deep(.v-input) {
  min-width: 0;
}

.cotacao-resumo__ajuda {
  margin: 0;
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao-resumo__final {
  display: grid;
  gap: var(--cx-sp-1, 4px);
  padding-top: var(--cx-sp-3, 12px);
  border-top: 1px solid var(--cx-line, #e4e8ef);
  font-variant-numeric: tabular-nums;
}

.cotacao-resumo__final-total {
  align-items: baseline;
}

.cotacao-resumo__final-total strong {
  font-size: 1.5rem;
  color: var(--cx-ink, #1f2733);
}

.cotacao-resumo__condicoes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--cx-sp-3, 12px);
}

.cotacao-resumo__observacao {
  grid-column: 1 / -1;
}

@media (max-width: 599px) {
  .cotacao-resumo {
    padding: var(--cx-sp-4, 16px);
  }

  .cotacao-resumo__condicoes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
