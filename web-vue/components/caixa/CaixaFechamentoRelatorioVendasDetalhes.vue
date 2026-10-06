<script setup lang="ts">
import type { VendaCanceladaCaixa } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

defineProps<{ canceladas: VendaCanceladaCaixa[] }>();

const painelAberto = ref<number[]>([]);

function dataCancelamento(venda: VendaCanceladaCaixa) {
  return venda.dataHora ? formatarDataHora(venda.dataHora) : formatarDataSomenteDia(venda.data);
}
</script>

<template>
  <section class="canceladas mt-4" aria-label="Vendas canceladas e motivos">
    <v-expansion-panels v-model="painelAberto" multiple variant="accordion">
      <v-expansion-panel :value="0">
        <v-expansion-panel-title>
          <div class="canceladas__titulo">
            <div>
              <strong>Vendas canceladas e motivos</strong>
              <span>Auditoria do CREARE; estes valores não entram no saldo do caixa.</span>
            </div>
            <v-chip size="small" color="warning" variant="tonal">{{ canceladas.length }} canceladas</v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-alert v-if="!canceladas.length" type="success" variant="tonal" density="compact">
            Não houve vendas canceladas neste período.
          </v-alert>
          <div v-else class="canceladas__lista">
            <article v-for="venda in canceladas" :key="venda.id" class="canceladas__linha">
              <div>
                <strong>{{ venda.descricao }}</strong>
                <span>
                  {{ dataCancelamento(venda) }}
                  <template v-if="venda.identificadorExterno"> · {{ venda.identificadorExterno }}</template>
                </span>
                <p><b>Motivo:</b> {{ venda.motivoCancelamento ?? "Não informado" }}</p>
                <small v-if="venda.canceladoPor">Autorizado por: {{ venda.canceladoPor }}</small>
              </div>
              <strong class="canceladas__valor">{{ dinheiro(venda.valor) }}</strong>
            </article>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </section>
</template>

<style scoped>
.canceladas__titulo,
.canceladas__linha {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
}
.canceladas__titulo > div,
.canceladas__linha > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.canceladas__titulo span,
.canceladas__linha span,
.canceladas__linha small {
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
}
.canceladas__lista {
  display: grid;
}
.canceladas__linha {
  padding: 14px 0;
  border-bottom: 1px solid var(--cx-line);
}
.canceladas__linha:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.canceladas__linha p {
  margin: 4px 0 0;
  color: var(--cx-attention);
  font-size: 0.86rem;
}
.canceladas__valor {
  flex: 0 0 auto;
  white-space: nowrap;
}
@media (max-width: 600px) {
  .canceladas__titulo,
  .canceladas__linha {
    gap: 8px;
  }
}
</style>
