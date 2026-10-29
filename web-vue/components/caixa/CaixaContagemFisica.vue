<script setup lang="ts">
// R-232 · contagem fisica cega: primeiro passo de Vendas. O operador conta cedulas e moedas SEM ver o esperado (assim
// nao sabe se sobra ou falta antes de contar). Depois de gerar o relatorio, a contagem trava e aparece a comparacao;
// corrigir exige justificativa, e original, corrigido e motivo vao para a Tesouraria.
import { computed } from "vue";
import type { ContagemFisicaRelatorio } from "@padaria/shared";
import CampoDinheiro from "~/components/comum/CampoDinheiro.vue";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

export type ContagemEmEdicao = { valorEspecie: string; valorMoedas: string; justificativa: string; corrigindo: boolean };

const props = defineProps<{ registrada: ContagemFisicaRelatorio | null }>();
const contagem = defineModel<ContagemEmEdicao>({ required: true });

const editando = computed(() => !props.registrada || contagem.value.corrigindo);
const totalDigitado = computed(
  () => (Math.round(Number(contagem.value.valorEspecie || 0) * 100) + Math.round(Number(contagem.value.valorMoedas || 0) * 100)) / 100
);
const situacao = computed(() => {
  const diferenca = props.registrada?.diferenca ?? 0;
  if (diferenca === 0) return { cor: "success", texto: "Confere com o sistema", icone: "mdi-check-circle" };
  if (diferenca < 0) return { cor: "error", texto: `Falta ${dinheiro(Math.abs(diferenca))}`, icone: "mdi-alert-circle" };
  return { cor: "warning", texto: `Sobra ${dinheiro(diferenca)}`, icone: "mdi-alert" };
});

function corrigir() {
  if (!props.registrada) return;
  contagem.value = {
    valorEspecie: String(props.registrada.valorEspecie),
    valorMoedas: String(props.registrada.valorMoedas),
    justificativa: "",
    corrigindo: true
  };
}
function cancelarCorrecao() {
  contagem.value = { ...contagem.value, justificativa: "", corrigindo: false };
}
</script>

<template>
  <section class="contagem" aria-labelledby="contagem-titulo" data-teste="contagem-fisica">
    <header class="contagem__topo">
      <span class="contagem__passo">1</span>
      <div>
        <h4 id="contagem-titulo">Dinheiro na gaveta</h4>
        <p v-if="editando && !registrada">
          Conte as cédulas e as moedas <strong>antes de qualquer outra coisa</strong>. O sistema não mostra o valor
          esperado: ele só compara depois que você gerar o relatório.
        </p>
        <p v-else-if="!editando">Contagem registrada. Para mudar, use “Corrigir contagem” e explique o motivo.</p>
        <p v-else>Corrigindo a contagem. A correção e o motivo vão para a Tesouraria.</p>
      </div>
    </header>

    <template v-if="editando">
      <div class="contagem__campos">
        <CampoDinheiro
          v-model="contagem.valorEspecie"
          label="Cédulas"
          icone="mdi-cash"
          data-teste="contagem-cedulas"
        />
        <CampoDinheiro
          v-model="contagem.valorMoedas"
          label="Moedas"
          icone="mdi-circle-multiple-outline"
          data-teste="contagem-moedas"
        />
        <div class="contagem__total" aria-live="polite">
          <span>Total contado</span>
          <strong>{{ dinheiro(totalDigitado) }}</strong>
        </div>
      </div>
      <template v-if="contagem.corrigindo">
        <v-textarea
          v-model="contagem.justificativa"
          label="Por que a contagem mudou? (obrigatório)"
          rows="2"
          auto-grow
          counter="300"
          maxlength="300"
          class="mt-3"
          :error="contagem.justificativa.trim().length > 0 && contagem.justificativa.trim().length < 5"
          data-teste="contagem-justificativa"
        />
        <v-btn variant="text" size="small" class="mt-1" @click="cancelarCorrecao">Cancelar correção</v-btn>
      </template>
    </template>

    <template v-else-if="registrada">
      <div class="contagem__comparacao" data-teste="contagem-comparacao">
        <div>
          <span>Contado</span>
          <strong>{{ dinheiro(registrada.total) }}</strong>
          <small>Cédulas {{ dinheiro(registrada.valorEspecie) }} · Moedas {{ dinheiro(registrada.valorMoedas) }}</small>
        </div>
        <div>
          <span>Esperado pelo sistema</span>
          <strong>{{ dinheiro(registrada.esperado) }}</strong>
          <small>Calculado com as movimentações do turno</small>
        </div>
        <div :class="`contagem__situacao contagem__situacao--${situacao.cor}`">
          <v-icon :icon="situacao.icone" size="20" />
          <strong>{{ situacao.texto }}</strong>
        </div>
      </div>
      <ul v-if="registrada.correcoes.length" class="contagem__correcoes" aria-label="Correções da contagem">
        <li v-for="(correcao, indice) in registrada.correcoes" :key="indice">
          {{ formatarDataHora(correcao.em) }}: de
          {{ dinheiro(correcao.de.valorEspecie + correcao.de.valorMoedas) }} para
          {{ dinheiro(correcao.para.valorEspecie + correcao.para.valorMoedas) }} — “{{ correcao.justificativa }}”
        </li>
      </ul>
      <v-btn
        variant="outlined"
        color="warning"
        prepend-icon="mdi-pencil"
        class="mt-3"
        data-teste="contagem-corrigir"
        @click="corrigir"
        >Corrigir contagem</v-btn
      >
    </template>
  </section>
</template>

<style scoped>
.contagem {
  margin-top: 16px;
  padding: 16px;
  border: 2px solid var(--cat-entradas-base);
  border-radius: 14px;
  background: var(--cx-surface);
}
.contagem__topo {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.contagem__passo {
  display: grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: var(--cat-entradas-base);
  color: var(--cx-canvas);
  font-weight: 800;
}
.contagem h4 {
  margin: 0;
  font-size: 1.02rem;
}
.contagem p {
  margin: 4px 0 0;
  color: var(--cx-ink-soft);
  font-size: 0.86rem;
}
.contagem__campos {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: center;
  margin-top: 14px;
}
.contagem__total,
.contagem__comparacao > div {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--cx-surface-sunken);
}
.contagem__total span,
.contagem__comparacao span,
.contagem__comparacao small {
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
}
.contagem__total strong,
.contagem__comparacao strong {
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}
.contagem__comparacao {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.contagem__situacao {
  display: flex !important;
  align-items: center;
  gap: 8px;
}
.contagem__situacao--success {
  color: var(--cx-positive);
}
.contagem__situacao--error {
  color: var(--cx-negative, #b42318);
}
.contagem__situacao--warning {
  color: var(--cx-attention);
}
.contagem__correcoes {
  margin: 10px 0 0;
  padding-left: 18px;
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
}
@media (max-width: 720px) {
  .contagem__campos,
  .contagem__comparacao {
    grid-template-columns: 1fr;
  }
  .contagem :deep(.v-btn) {
    width: 100%;
    min-height: 48px;
  }
}
</style>
