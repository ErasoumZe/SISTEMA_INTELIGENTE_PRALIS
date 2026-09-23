<script setup lang="ts">
// Bloco Recorrência (D3) — SUPORTADO: ao salvar, o servidor cria a série inteira de lançamentos
// futuros (não-pagos, vencendo na data), com teto por frequência. Estado vem do modal via
// provide/inject. Só Admin/Gerência/Financeiro podem usar — sem a permissão o bloco nem aparece,
// e o servidor devolve 403 de qualquer forma.
import { useOperacaoLancamentoBloco } from "~/components/operacoes/useOperacaoLancamento";

const {
  recorrenciaAberta,
  recorrenciaNumero,
  recorrenciaFrequencia,
  FREQUENCIAS,
  DIAS,
  recorrenciaDias,
  recorrenciaSemanal,
  form,
  operacaoEditandoId,
  confirmarCancelamentoSerie,
  cancelandoSerie,
  cancelarSerie,
  alternarDiaRecorrencia,
  podeUsarRecorrencia
} = useOperacaoLancamentoBloco();
</script>

<template>
  <template v-if="podeUsarRecorrencia">
    <button type="button" class="lc-linha lc-linha-top" @click="recorrenciaAberta = !recorrenciaAberta">
      <v-icon size="17">mdi-repeat</v-icon> Recorrência
      <span class="lc-flex" />
      <v-icon size="16">{{ recorrenciaAberta ? "mdi-chevron-down" : "mdi-chevron-right" }}</v-icon>
    </button>
    <div v-if="recorrenciaAberta" class="lc-recorrencia">
      <div class="lc-dois">
        <label class="lc-campo">
          <span class="lc-campo-lbl">Número de repetições</span>
          <input v-model="recorrenciaNumero" type="number" min="1" max="366" class="lc-input" />
        </label>
        <label class="lc-campo">
          <span class="lc-campo-lbl">Frequência</span>
          <select v-model="recorrenciaFrequencia" class="lc-input">
            <option v-for="f in FREQUENCIAS" :key="f.valor" :value="f.valor">{{ f.rotulo }}</option>
          </select>
        </label>
      </div>
      <!-- Dias só na semanal: em "mês" ou "3 em 3" eles não significariam nada. -->
      <template v-if="recorrenciaSemanal">
        <span class="lc-campo-lbl">Dias</span>
        <div class="lc-dias">
          <button
            v-for="(dia, i) in DIAS"
            :key="dia.iso"
            type="button"
            class="lc-dia"
            :class="{ ativo: recorrenciaDias[i] }"
            @click="alternarDiaRecorrencia(i)"
          >
            {{ dia.rotulo }}
          </button>
        </div>
      </template>
      <p class="lc-recorrencia-nota">
        O lançamento que você está criando conta como o 1º da série. Os seguintes nascem
        <strong>não pagos</strong>, vencendo na data. Frequências curtas não passam de 12 meses; anual e trimestral
        seguem o número de repetições.
      </p>
    </div>
    <button
      v-if="operacaoEditandoId && form.recorrenciaId"
      type="button"
      class="lc-add"
      @click="confirmarCancelamentoSerie = true"
    >
      Cancelar lançamentos futuros da série
    </button>
    <v-dialog v-model="confirmarCancelamentoSerie" max-width="420" persistent no-click-animation>
      <v-card title="Cancelar série" text="Somente lançamentos futuros e ainda não pagos serão removidos.">
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmarCancelamentoSerie = false">Voltar</v-btn>
          <v-btn color="error" :loading="cancelandoSerie" @click="cancelarSerie">Cancelar futuros</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </template>
</template>
