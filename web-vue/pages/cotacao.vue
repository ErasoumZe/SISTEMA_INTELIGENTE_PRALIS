<script setup lang="ts">
/** Página pública: a lógica de token, rascunho e envio mora em useCotacaoFornecedor. */
import CotacaoItemCartao from "~/components/cotacao/CotacaoItemCartao.vue";
import CotacaoResumo from "~/components/cotacao/CotacaoResumo.vue";

definePageMeta({ scrollToTop: false });

const {
  aberta,
  calculo,
  calculoPorId,
  carregando,
  condicoes,
  confirmarEnvio,
  cotacao,
  enviar,
  enviando,
  erro,
  estadoDoRascunho,
  moeda,
  pedirEnvio,
  pendencias,
  pendenteDeSalvar,
  prazo,
  respondidaEm,
  respostas,
  salvando,
  salvar,
  tentouEnviar
} = useCotacaoFornecedor();
</script>

<template>
  <v-main class="cotacao-pagina">
    <div class="cotacao">
      <header class="cotacao__topo">
        <p class="cotacao__selo">
          <v-icon icon="mdi-clipboard-text-outline" size="16" />
          Cotação de compra<span v-if="cotacao"> · Ref. {{ cotacao.referencia }}</span>
        </p>
        <h1 class="cotacao__empresa">{{ cotacao?.empresaNome || "Cotação" }}</h1>
        <p v-if="cotacao" class="cotacao__para">
          Para <strong>{{ cotacao.fornecedorNome }}</strong>
        </p>
        <p v-if="aberta" class="cotacao__prazo">
          <v-icon icon="mdi-clock-outline" size="16" /> Responda até <strong>{{ prazo }}</strong>
        </p>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>

      <div v-if="carregando" class="cotacao__estado" aria-busy="true">
        <v-progress-circular indeterminate color="primary" />
        <p>Abrindo a cotação…</p>
      </div>
      <div v-else-if="!cotacao" class="cotacao__estado" data-estado="invalido">
        <v-icon icon="mdi-link-variant-off" size="48" color="error" />
        <h2>Link inválido</h2>
        <p>Este link não abre nenhuma cotação. Confira se ele chegou inteiro ou peça um novo ao comprador.</p>
      </div>
      <div v-else-if="cotacao.situacao === 'respondida'" class="cotacao__estado" data-estado="respondida">
        <v-icon icon="mdi-check-circle" size="56" color="success" />
        <h2>Cotação enviada</h2>
        <p>Recebemos seus valores em {{ respondidaEm }}. O comprador vai analisar e entrar em contato.</p>
        <p class="cotacao__estado-nota">Por segurança, este link não abre mais o formulário.</p>
      </div>
      <div v-else-if="cotacao.situacao === 'expirada'" class="cotacao__estado" data-estado="expirada">
        <v-icon icon="mdi-timer-off-outline" size="48" color="warning" />
        <h2>O prazo terminou</h2>
        <p>Esta cotação podia ser respondida até {{ prazo }}. Peça um novo link ao comprador.</p>
      </div>
      <div v-else-if="cotacao.situacao === 'revogada'" class="cotacao__estado" data-estado="revogada">
        <v-icon icon="mdi-link-variant-off" size="48" color="warning" />
        <h2>Este link não vale mais</h2>
        <p>O comprador gerou um link novo ou encerrou o pedido. Use o link mais recente que você recebeu.</p>
      </div>
      <template v-else>
        <p class="cotacao__instrucao">
          Informe o <strong>valor atual</strong> de cada produto. Se quiser, dê desconto por produto ou no pedido todo.
          Não tem algum item? Marque <strong>Não tenho este produto</strong>.
        </p>
        <section class="cotacao__itens" aria-label="Produtos da cotação">
          <CotacaoItemCartao
            v-for="(item, indice) in cotacao.itens"
            :key="item.pedidoItemId"
            v-model="respostas[indice]!"
            :item="item"
            :calculo="calculoPorId.get(item.pedidoItemId) ?? null"
            :cobrar-valor="tentouEnviar"
          />
        </section>
        <CotacaoResumo v-model="condicoes" :calculo="calculo" />
        <v-alert
          v-if="tentouEnviar && pendencias.length"
          type="warning"
          variant="tonal"
          density="compact"
          title="Falta pouco para enviar"
          data-campo="pendencias"
        >
          <ul class="cotacao__pendencias">
            <li v-for="pendencia in pendencias" :key="pendencia">{{ pendencia }}</li>
          </ul>
        </v-alert>
      </template>
    </div>

    <footer v-if="aberta && !carregando" class="cotacao__barra">
      <div class="cotacao__barra-conteudo">
        <div class="cotacao__barra-total">
          <span>Total final</span>
          <strong data-campo="barra-total">{{ moeda(calculo.totalFinalCentavos) }}</strong>
          <small :class="{ 'cotacao__barra-pendente': pendenteDeSalvar }">{{ estadoDoRascunho }}</small>
        </div>
        <div class="cotacao__barra-acoes">
          <v-btn variant="text" :loading="salvando" :disabled="enviando" @click="salvar()"
            >Salvar e continuar depois</v-btn
          >
          <v-btn color="primary" variant="flat" size="large" :disabled="salvando" @click="pedirEnvio"
            >Enviar cotação</v-btn
          >
        </div>
      </div>
    </footer>

    <v-dialog v-model="confirmarEnvio" max-width="440" persistent>
      <v-card class="cotacao__confirmacao">
        <v-card-title>Enviar a cotação?</v-card-title>
        <v-card-text>
          <p>
            Total final de <strong>{{ moeda(calculo.totalFinalCentavos) }}</strong
            >.
          </p>
          <p>Depois de enviar, este link fecha e não será possível editar os valores.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="enviando" @click="confirmarEnvio = false">Revisar</v-btn>
          <v-btn color="primary" variant="flat" :loading="enviando" @click="enviar">Enviar agora</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-main>
</template>

<style scoped>
.cotacao-pagina {
  min-height: 100vh;
  background: var(--cx-canvas, #f4f6fa);
}
.cotacao {
  display: grid;
  gap: var(--cx-sp-4, 16px);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: var(--cx-sp-6, 24px) var(--cx-sp-4, 16px) 168px;
}
.cotacao__topo {
  display: grid;
  gap: var(--cx-sp-1, 4px);
  padding-bottom: var(--cx-sp-2, 8px);
}
.cotacao__selo {
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
.cotacao__empresa {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--cx-ink, #1f2733);
}
.cotacao__para,
.cotacao__prazo,
.cotacao__instrucao {
  margin: 0;
  color: var(--cx-ink-soft, #5b6675);
}
.cotacao__prazo {
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
.cotacao__itens {
  display: grid;
  gap: var(--cx-sp-3, 12px);
}
.cotacao__estado {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-8, 48px) var(--cx-sp-4, 16px);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface, #fff);
  text-align: center;
}
.cotacao__estado h2 {
  font-size: 1.25rem;
  font-weight: 600;
}
.cotacao__estado p {
  max-width: 420px;
  margin: 0;
  color: var(--cx-ink-soft, #5b6675);
}
.cotacao__estado-nota {
  font-size: 0.8125rem;
}
.cotacao__pendencias {
  margin: 0;
  padding-left: var(--cx-sp-5, 20px);
}
.cotacao__barra {
  position: fixed;
  inset: auto 0 0;
  z-index: 5;
  border-top: 1px solid var(--cx-line, #e4e8ef);
  background: var(--cx-surface, #fff);
  box-shadow: var(--cx-e-2, 0 -4px 16px rgba(0, 0, 0, 0.06));
  padding-bottom: env(safe-area-inset-bottom);
}
.cotacao__barra-conteudo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
  max-width: 760px;
  margin: 0 auto;
  padding: var(--cx-sp-3, 12px) var(--cx-sp-4, 16px);
}
.cotacao__barra-total {
  display: grid;
  min-width: 0;
}
.cotacao__barra-total span,
.cotacao__barra-total small {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}
.cotacao__barra-total strong {
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.cotacao__barra-pendente {
  color: rgb(var(--v-theme-warning)) !important;
}
.cotacao__barra-acoes {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2, 8px);
}
@media (max-width: 599px) {
  .cotacao__empresa {
    font-size: 1.375rem;
  }
  .cotacao {
    padding-bottom: 220px;
  }
  .cotacao__barra-conteudo,
  .cotacao__barra-acoes {
    flex-direction: column;
    align-items: stretch;
  }
  .cotacao__barra-acoes {
    flex-direction: column-reverse;
  }
}
</style>
