<script setup lang="ts">
// Lancamento (Despesa / Mercadoria / Retirada) num UNICO formulario, fiel ao desenho do Rodrigo
// (PROJECT_BRAIN/14, FOTO 2). Container ENXUTO: useOperacaoLancamento concentra TODA a logica/estado
// (chamado UMA vez aqui, sempre montado) e distribui aos blocos coesos via provide — foi assim que o
// componente de 999 linhas ficou dentro do teto de ~400 (R5), sem mudar campo nem regra. VISUAL-FIRST:
// muda de cor por categoria (--cat-*); campos NOVOS sao data-pendente="regra" (local, nunca vao a API).
import { provide } from "vue";
import { OPERACAO_LANCAMENTO_KEY, useOperacaoLancamento } from "~/components/operacoes/useOperacaoLancamento";
import OperacaoLancamentoValores from "~/components/operacoes/OperacaoLancamentoValores.vue";
import OperacaoLancamentoDatas from "~/components/operacoes/OperacaoLancamentoDatas.vue";
import OperacaoLancamentoCredor from "~/components/operacoes/OperacaoLancamentoCredor.vue";
import OperacaoLancamentoPagamento from "~/components/operacoes/OperacaoLancamentoPagamento.vue";
import OperacaoLancamentoFotos from "~/components/operacoes/OperacaoLancamentoFotos.vue";
import OperacaoLancamentoDiscriminacao from "~/components/operacoes/OperacaoLancamentoDiscriminacao.vue";
import OperacaoLancamentoRecorrencia from "~/components/operacoes/OperacaoLancamentoRecorrencia.vue";
import "~/components/operacoes/operacao-lancamento.css";

const bloco = useOperacaoLancamento();
provide(OPERACAO_LANCAMENTO_KEY, bloco);

const { aberto, cat, cfg, catVars, discriminando, operacaoEditandoId, salvandoOperacao, salvarOperacao } = bloco;
</script>

<template>
  <v-dialog v-model="aberto" :max-width="discriminando && cat === 'mercadoria' ? 920 : 560">
    <div class="lc-modal" :style="catVars">
      <div class="lc-head">
        <span class="lc-ic"
          ><v-icon size="19">{{ cfg.icone }}</v-icon></span
        >
        <span class="lc-titulo"> {{ operacaoEditandoId ? "Editar" : "Nova" }} {{ cat }} </span>
        <v-icon class="lc-x" size="19" @click="aberto = false">mdi-close</v-icon>
      </div>

      <OperacaoLancamentoValores />
      <OperacaoLancamentoDatas />
      <OperacaoLancamentoCredor />
      <OperacaoLancamentoPagamento />
      <OperacaoLancamentoFotos />
      <OperacaoLancamentoDiscriminacao />
      <OperacaoLancamentoRecorrencia />

      <div class="lc-acoes">
        <button type="button" class="lc-salvar-nova" :disabled="salvandoOperacao" @click="salvarOperacao">
          Salvar e criar nova
        </button>
        <button type="button" class="lc-salvar" :disabled="salvandoOperacao" @click="salvarOperacao">Salvar</button>
      </div>
    </div>
  </v-dialog>
</template>
