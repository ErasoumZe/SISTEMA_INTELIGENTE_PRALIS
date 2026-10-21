<script setup lang="ts">
import { computed } from "vue";
import { dinheiro } from "~/utils/domain";

const props = defineProps<{
  aberto: boolean;
  salvando: boolean;
  pdvNome: string;
  turnoNome: string;
  lacre: string;
  caixaResponsavel: string;
  supervisor: string;
  maquininha: string;
  valorEspecie: number;
  valorMoedas: number;
  divergente: boolean;
  motivoDivergencia: string;
}>();
const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void; (event: "confirmar"): void }>();
const total = computed(() => props.valorEspecie + props.valorMoedas);
</script>

<template>
  <v-dialog :model-value="aberto" max-width="560" persistent>
    <v-card class="abertura-confirmacao">
      <v-card-title class="abertura-confirmacao__cabecalho">
        <v-icon icon="mdi-cash-register" />
        <span>Confirmar abertura do caixa</span>
      </v-card-title>
      <v-card-text>
        <p class="abertura-confirmacao__intro">Revise o turno e o malote antes de iniciar as vendas.</p>
        <div class="abertura-confirmacao__aviso" role="note">
          <v-icon icon="mdi-storefront-check-outline" />
          <span>Confirme somente quando estiver no PDV: a primeira venda já será contabilizada neste caixa.</span>
        </div>
        <dl class="abertura-confirmacao__dados">
          <div>
            <dt>PDV</dt>
            <dd>{{ pdvNome }}</dd>
          </div>
          <div>
            <dt>Turno</dt>
            <dd>{{ turnoNome || "Não informado" }}</dd>
          </div>
          <div>
            <dt>Lacre do malote</dt>
            <dd>{{ lacre }}</dd>
          </div>
          <div>
            <dt>Maquininha</dt>
            <dd>{{ maquininha || "Não selecionada" }}</dd>
          </div>
          <div>
            <dt>Responsável do caixa</dt>
            <dd>{{ caixaResponsavel }}</dd>
          </div>
          <div>
            <dt>Supervisor</dt>
            <dd>{{ supervisor }}</dd>
          </div>
        </dl>
        <section :class="['abertura-confirmacao__malote', { 'abertura-confirmacao__malote--divergente': divergente }]">
          <span>{{ divergente ? "Contagem informada pelo Caixa" : "Composição confirmada da Tesouraria" }}</span>
          <div>
            <strong>{{ dinheiro(total) }}</strong>
            <small>Notas {{ dinheiro(valorEspecie) }} · moedas {{ dinheiro(valorMoedas) }}</small>
          </div>
          <p v-if="divergente" class="abertura-confirmacao__motivo">
            <strong>Abertura com divergência.</strong> Motivo: {{ motivoDivergencia }}
          </p>
        </section>
      </v-card-text>
      <v-card-actions class="abertura-confirmacao__acoes px-6 pb-5">
        <v-btn color="error" :disabled="salvando" variant="outlined" @click="emit('update:aberto', false)">
          Voltar e revisar
        </v-btn>
        <v-btn color="success" :loading="salvando" variant="flat" @click="emit('confirmar')"> Confirmar e abrir </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.abertura-confirmacao__cabecalho {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 16px 24px;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  font-size: 1.05rem;
  font-weight: 750;
}
.abertura-confirmacao__cabecalho :deep(.v-icon) {
  color: inherit;
}
.abertura-confirmacao__intro {
  margin: 0 0 14px;
  color: var(--cx-ink-soft);
}
.abertura-confirmacao__dados {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.abertura-confirmacao__dados > div {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--cx-line);
  border-radius: 8px;
  background: var(--cx-surface-raised);
}
.abertura-confirmacao__dados dt {
  color: var(--cx-ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
}
.abertura-confirmacao__dados dd {
  overflow-wrap: anywhere;
  margin: 2px 0 0;
  color: var(--cx-ink);
  font-size: 0.82rem;
  font-weight: 700;
}
.abertura-confirmacao__malote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-success)) 34%, var(--cx-line));
  border-radius: 9px;
  background: color-mix(in srgb, rgb(var(--v-theme-success)) 11%, var(--cx-surface));
}
.abertura-confirmacao__malote > span {
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
  font-weight: 700;
}
.abertura-confirmacao__malote > div {
  display: grid;
  justify-items: end;
}
.abertura-confirmacao__malote strong {
  color: var(--cx-ink);
  font-size: 1rem;
}
.abertura-confirmacao__malote small {
  color: var(--cx-ink-soft);
  font-size: 0.71rem;
}
.abertura-confirmacao__malote--divergente {
  border-color: color-mix(in srgb, rgb(var(--v-theme-error)) 52%, var(--cx-line));
  background: color-mix(in srgb, rgb(var(--v-theme-error)) 12%, var(--cx-surface));
}
.abertura-confirmacao__malote--divergente > span,
.abertura-confirmacao__malote--divergente strong {
  color: rgb(var(--v-theme-error));
}
.abertura-confirmacao__motivo {
  width: 100%;
  margin: 2px 0 0;
  color: var(--cx-ink);
  font-size: 0.78rem;
  line-height: 1.35;
}
.abertura-confirmacao__aviso {
  display: flex;
  gap: 9px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, rgb(var(--v-theme-warning)) 46%, var(--cx-line));
  border-radius: 9px;
  color: var(--cx-ink);
  background: color-mix(in srgb, rgb(var(--v-theme-warning)) 16%, var(--cx-surface));
  font-size: 0.81rem;
  font-weight: 700;
  line-height: 1.35;
}
.abertura-confirmacao__aviso :deep(.v-icon) {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-warning));
}
.abertura-confirmacao__acoes {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
@media (max-width: 560px) {
  .abertura-confirmacao__dados {
    grid-template-columns: 1fr;
  }
  .abertura-confirmacao__malote {
    align-items: flex-start;
    flex-direction: column;
  }
  .abertura-confirmacao__malote > div {
    justify-items: start;
  }
  .abertura-confirmacao__acoes {
    display: grid;
    grid-template-columns: 1fr;
    padding: 16px !important;
    border-top: 1px solid var(--cx-line);
  }
  .abertura-confirmacao__acoes :deep(.v-btn) {
    min-height: 48px;
    font-size: 0.84rem;
    font-weight: 800;
  }
}
</style>
