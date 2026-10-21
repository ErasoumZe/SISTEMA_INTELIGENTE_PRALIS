<script setup lang="ts">
/** Página pública da rodada (Fase 2). A lógica de token/envio mora em useRodadaFornecedor. */
definePageMeta({ scrollToTop: false });

const {
  rodada,
  respostas,
  frete,
  observacao,
  prazoEntrega,
  condicaoPagamento,
  carregando,
  enviando,
  aceitando,
  enviado,
  erro,
  prazo,
  aberta,
  totalFormatado,
  pendencias,
  itensContrapostos,
  ROTULO_SITUACAO,
  aceitar,
  enviar
} = useRodadaFornecedor();
</script>

<template>
  <v-main class="rodada-pagina">
    <div class="rodada">
      <header class="rodada__topo">
        <p class="rodada__selo"><v-icon icon="mdi-clipboard-text-outline" size="16" /> Cotação de compra</p>
        <h1 class="rodada__empresa">{{ rodada?.empresaNome || "Cotação" }}</h1>
        <p v-if="rodada" class="rodada__para">
          Para <strong>{{ rodada.fornecedorNome }}</strong>
        </p>
        <p v-if="aberta" class="rodada__prazo">
          <v-icon icon="mdi-clock-outline" size="16" /> Responda até <strong>{{ prazo }}</strong>
        </p>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>

      <div v-if="carregando" class="rodada__estado" aria-busy="true">
        <v-progress-circular indeterminate color="primary" />
        <p>Abrindo a cotação…</p>
      </div>
      <div v-else-if="!rodada" class="rodada__estado" data-estado="invalido">
        <v-icon icon="mdi-link-variant-off" size="48" color="error" />
        <h2>Link inválido</h2>
        <p>Este link não abre nenhuma cotação. Confira se ele chegou inteiro ou peça um novo ao comprador.</p>
      </div>
      <div v-else-if="enviado || rodada.situacao === 'encerrada'" class="rodada__estado" data-estado="encerrada">
        <v-icon
          :icon="enviado ? 'mdi-check-circle' : 'mdi-timer-off-outline'"
          size="56"
          :color="enviado ? 'success' : 'warning'"
        />
        <h2>{{ enviado ? "Resposta enviada" : "A rodada está encerrada" }}</h2>
        <p v-if="enviado">Recebemos seus valores. O comprador vai analisar e, se precisar, volta a falar com você.</p>
        <p v-else>Esta cotação podia ser respondida até {{ prazo }}. Peça um novo link ao comprador.</p>
      </div>
      <template v-else>
        <v-alert
          v-if="itensContrapostos.length"
          type="info"
          variant="tonal"
          class="rodada__contra"
          data-estado="contraproposta"
        >
          <strong>O comprador propôs novos valores</strong>
          <ul class="rodada__contra-lista">
            <li v-for="item in itensContrapostos" :key="item.conviteItemId">
              {{ item.descricaoProduto }}: <strong>{{ item.valor }}</strong> por unidade
            </li>
          </ul>
          <div class="rodada__contra-acoes">
            <v-btn color="primary" variant="flat" :loading="aceitando" @click="aceitar">Aceitar contraproposta</v-btn>
            <span class="text-caption">Ou ajuste os valores abaixo e envie a sua resposta.</span>
          </div>
        </v-alert>
        <p class="rodada__instrucao">
          Informe o <strong>valor unitário</strong> de cada produto. Não tem algum item? Marque
          <strong>Não tenho este produto</strong>.
        </p>
        <section class="rodada__itens" aria-label="Produtos da cotação">
          <div v-for="(item, indice) in rodada.itens" :key="item.conviteItemId" class="item">
            <div class="item__cabecalho">
              <strong>{{ item.descricaoProduto }}</strong>
              <span class="text-caption text-medium-emphasis">Quantidade: {{ item.quantidade }}</span>
              <v-chip
                v-if="item.situacao !== 'nao_cotado'"
                size="x-small"
                variant="tonal"
                label
                :color="item.situacao === 'comprado' ? 'success' : 'info'"
                class="item__situacao"
                >{{ ROTULO_SITUACAO[item.situacao] }}</v-chip
              >
            </div>
            <div class="item__campos">
              <v-text-field
                v-model="respostas[indice]!.valor"
                type="number"
                min="0"
                step="0.01"
                prefix="R$"
                label="Valor unitário"
                density="comfortable"
                hide-details="auto"
                :disabled="respostas[indice]!.indisponivel || item.situacao === 'comprado'"
              />
              <v-checkbox
                v-model="respostas[indice]!.indisponivel"
                label="Não tenho este produto"
                hide-details
                :disabled="item.situacao === 'comprado'"
              />
            </div>
          </div>
        </section>

        <section class="rodada__condicoes">
          <v-text-field
            v-model="frete"
            type="number"
            min="0"
            step="0.01"
            prefix="R$"
            label="Frete (opcional)"
            density="comfortable"
            hide-details="auto"
          />
          <v-text-field
            v-model="prazoEntrega"
            type="date"
            label="Prazo de entrega (opcional)"
            density="comfortable"
            hide-details="auto"
          />
          <v-text-field
            v-model="condicaoPagamento"
            label="Condição de pagamento (opcional)"
            density="comfortable"
            hide-details="auto"
          />
          <v-textarea
            v-model="observacao"
            rows="2"
            auto-grow
            label="Observação (opcional)"
            density="comfortable"
            hide-details="auto"
          />
        </section>
      </template>
    </div>

    <footer v-if="aberta && !carregando && !enviado" class="rodada__barra">
      <div class="rodada__barra-conteudo">
        <div class="rodada__barra-total">
          <span>Total estimado (sem frete)</span>
          <strong>{{ totalFormatado }}</strong>
          <small v-if="pendencias">{{ pendencias }} item(ns) sem valor</small>
        </div>
        <v-btn color="primary" variant="flat" size="large" :loading="enviando" @click="enviar">Enviar resposta</v-btn>
      </div>
    </footer>
  </v-main>
</template>

<style scoped>
.rodada-pagina {
  min-height: 100vh;
  background: var(--cx-canvas, #f4f6fa);
}
.rodada {
  display: grid;
  gap: var(--cx-sp-4, 16px);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: var(--cx-sp-6, 24px) var(--cx-sp-4, 16px) 168px;
}
.rodada__topo {
  display: grid;
  gap: var(--cx-sp-1, 4px);
}
.rodada__selo {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1, 4px);
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cx-brand-text, #35128c);
}
.rodada__empresa {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--cx-ink, #1f2733);
}
.rodada__para,
.rodada__instrucao {
  margin: 0;
  color: var(--cx-ink-soft, #5b6675);
}
.rodada__prazo {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1, 4px);
  justify-self: start;
  margin-top: var(--cx-sp-2, 8px);
  padding: var(--cx-sp-1, 4px) var(--cx-sp-3, 12px);
  border-radius: var(--cx-r-pill, 999px);
  background: var(--cx-brand-wash, rgba(101, 21, 221, 0.1));
  color: var(--cx-brand-text, #35128c);
  font-size: 0.875rem;
}
.rodada__itens,
.rodada__condicoes {
  display: grid;
  gap: var(--cx-sp-3, 12px);
}
.item {
  display: grid;
  gap: var(--cx-sp-2, 8px);
  padding: var(--cx-sp-4, 16px);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface, #fff);
  border: 1px solid var(--cx-line, #e4e8ef);
}
.item__cabecalho {
  display: grid;
  gap: 2px;
}
.item__situacao {
  justify-self: start;
}
.rodada__contra-lista {
  margin: var(--cx-sp-2, 8px) 0;
  padding-left: var(--cx-sp-4, 16px);
}
.rodada__contra-acoes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cx-sp-2, 8px) var(--cx-sp-3, 12px);
}
.item__campos {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-3, 12px);
  align-items: center;
}
.rodada__estado {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-8, 48px) var(--cx-sp-4, 16px);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface, #fff);
  text-align: center;
}
.rodada__estado h2 {
  font-size: 1.25rem;
  font-weight: 600;
}
.rodada__estado p {
  max-width: 420px;
  margin: 0;
  color: var(--cx-ink-soft, #5b6675);
}
.rodada__barra {
  position: fixed;
  inset: auto 0 0;
  z-index: 5;
  border-top: 1px solid var(--cx-line, #e4e8ef);
  background: var(--cx-surface, #fff);
  box-shadow: var(--cx-e-2, 0 -4px 16px rgba(0, 0, 0, 0.06));
  padding-bottom: env(safe-area-inset-bottom);
}
.rodada__barra-conteudo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
  max-width: 760px;
  margin: 0 auto;
  padding: var(--cx-sp-3, 12px) var(--cx-sp-4, 16px);
}
.rodada__barra-total {
  display: grid;
  min-width: 0;
}
.rodada__barra-total span,
.rodada__barra-total small {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}
.rodada__barra-total strong {
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
@media (max-width: 599px) {
  .rodada__empresa {
    font-size: 1.375rem;
  }
  .item__campos {
    grid-template-columns: minmax(0, 1fr);
  }
  .rodada__barra-conteudo {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
