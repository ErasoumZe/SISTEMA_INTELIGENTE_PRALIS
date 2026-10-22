<script setup lang="ts">
/**
 * Página pública da cotação (doc 57 §5), limpa como um formulário: o que pedimos e a referência, a resposta
 * dele produto a produto, as condições opcionais. Se ele ganhou, o passo 2 (separação) aparece em cima. No
 * fim, a lista do que a padaria compra para ele marcar o que também vende. Lógica em useRodadaFornecedor.
 */
import RodadaItemResposta from "~/components/rodada/RodadaItemResposta.vue";
import RodadaProdutosQueVendo from "~/components/rodada/RodadaProdutosQueVendo.vue";
import RodadaSeparacao from "~/components/rodada/RodadaSeparacao.vue";

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
  requisitar,
  carregar,
  aceitar,
  enviar
} = useRodadaFornecedor();
const respondendo = computed(() => Boolean(rodada.value) && aberta.value && !enviado.value);
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

      <v-alert v-if="erro" type="error" variant="tonal" density="compact">{{ erro }}</v-alert>

      <div v-if="carregando" class="rodada__estado" aria-busy="true">
        <v-progress-circular indeterminate color="primary" />
        <p>Abrindo a cotação…</p>
      </div>
      <div v-else-if="!rodada" class="rodada__estado" data-estado="invalido">
        <v-icon icon="mdi-link-variant-off" size="48" color="error" />
        <h2>Link inválido</h2>
        <p>Este link não abre nenhuma cotação. Confira se ele chegou inteiro ou peça um novo ao comprador.</p>
      </div>
      <template v-else>
        <RodadaSeparacao v-if="rodada.pedido" :pedido="rodada.pedido" :requisitar="requisitar" @devolvido="carregar" />

        <template v-if="respondendo">
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
            Para cada produto, diga se tem, o <strong>valor unitário</strong> e quanto tem. Os campos com * são
            obrigatórios.
          </p>
          <section class="rodada__itens" aria-label="Produtos da cotação">
            <RodadaItemResposta
              v-for="(item, indice) in rodada.itens"
              :key="item.conviteItemId"
              v-model="respostas[indice]!"
              :item="item"
              :margem="rodada.margemVariacaoPercentual"
              :rotulo-situacao="ROTULO_SITUACAO"
            />
          </section>
          <section class="rodada__condicoes" aria-label="Condições (opcionais)">
            <h2 class="rodada__subtitulo">Condições (opcional)</h2>
            <div class="rodada__grade">
              <v-text-field
                v-model="frete"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                prefix="R$"
                label="Frete"
                density="comfortable"
                hide-details="auto"
              />
              <v-text-field
                v-model="prazoEntrega"
                type="date"
                label="Prazo de entrega"
                density="comfortable"
                hide-details="auto"
              />
              <v-text-field
                v-model="condicaoPagamento"
                label="Pagamento"
                placeholder="Ex.: boleto 28 dias"
                density="comfortable"
                hide-details="auto"
              />
            </div>
            <v-textarea
              v-model="observacao"
              rows="2"
              auto-grow
              label="Observação"
              density="comfortable"
              hide-details="auto"
            />
          </section>
        </template>
        <div v-else-if="enviado" class="rodada__estado" data-estado="enviada">
          <v-icon icon="mdi-check-circle" size="56" color="success" />
          <h2>Resposta enviada</h2>
          <p>Recebemos seus valores. Se você ganhar algum produto, ele aparece aqui para separar.</p>
        </div>
        <div v-else-if="!rodada.pedido" class="rodada__estado" data-estado="encerrada">
          <v-icon icon="mdi-timer-off-outline" size="56" color="warning" />
          <h2>A cotação está encerrada</h2>
          <p>Esta cotação podia ser respondida até {{ prazo }}.</p>
        </div>

        <RodadaProdutosQueVendo :requisitar="requisitar" />
      </template>
    </div>

    <footer v-if="respondendo && !carregando" class="rodada__barra">
      <div class="rodada__barra-conteudo">
        <div class="rodada__barra-total">
          <span>Total estimado (sem frete)</span>
          <strong>{{ totalFormatado }}</strong>
          <small v-if="pendencias">{{ pendencias }} produto(s) sem valor</small>
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
.rodada__subtitulo {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 650;
}
.rodada__grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--cx-sp-3, 12px);
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
  .rodada__barra-conteudo {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
