<script setup lang="ts">
// Lancamento (Despesa / Mercadoria / Retirada) num UNICO formulario, fiel ao desenho do Rodrigo
// (PROJECT_BRAIN/14, FOTO 2). Container ENXUTO: useOperacaoLancamento concentra TODA a logica/estado
// (chamado UMA vez aqui, sempre montado) e distribui aos blocos coesos via provide — foi assim que o
// componente de 999 linhas ficou dentro do teto de ~400 (R5), sem mudar campo nem regra. VISUAL-FIRST:
// muda de cor por categoria (--cat-*); todos os campos visiveis fazem parte do payload persistido.
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

const {
  aberto,
  cat,
  cfg,
  catVars,
  CATEGORIAS_LANCAMENTO,
  podeTrocarCategoria,
  trocarCategoria,
  discriminando,
  operacaoEditandoId,
  salvandoOperacao,
  salvarOperacao
} = bloco;
</script>

<template>
  <v-dialog v-model="aberto" :max-width="discriminando && cat === 'mercadoria' ? 920 : 560">
    <div class="lc-modal" :style="catVars">
      <!-- FAIXA do cabecalho na cor da categoria (E2). Sangra ate a borda do modal pelos margins
           negativos, do mesmo jeito que .lc-acoes ja fazia no rodape. Repinta sozinha ao trocar de
           categoria porque --cat-faixa vem de catVars, que deriva de `cat`. -->
      <div class="lc-faixa">
        <div class="lc-head">
          <span class="lc-ic"
            ><v-icon size="19">{{ cfg.icone }}</v-icon></span
          >
          <span class="lc-titulo"> {{ operacaoEditandoId ? "Editar" : "Nova" }} {{ cat }} </span>
          <v-icon class="lc-x" size="19" @click="aberto = false">mdi-close</v-icon>
        </div>

        <!-- 3 botoes no TOPO: troca a categoria sem fechar; a cor do modal acompanha (--cat). -->
        <div v-if="podeTrocarCategoria" class="lc-cats" role="group" aria-label="Categoria do lancamento">
          <button
            v-for="opcao in CATEGORIAS_LANCAMENTO"
            :key="opcao.id"
            type="button"
            class="lc-cat"
            :class="{ ativa: cat === opcao.id }"
            :style="{ '--cat-btn-faixa': `var(--cat-${opcao.token}-faixa)` }"
            :aria-pressed="cat === opcao.id"
            @click="trocarCategoria(opcao.id)"
          >
            <v-icon size="16">{{ opcao.icone }}</v-icon>
            <span>{{ opcao.titulo }}</span>
          </button>
        </div>
      </div>

      <!-- CORPO rolavel. O rodape fica FORA dele (irmao, nao filho): era `position: sticky` dentro do
           mesmo scroller, e ai o conteudo passava por baixo dos botoes por construcao — nenhum
           padding compensa isso, porque o proprio rodape era o ultimo elemento do fluxo. -->
      <div class="lc-corpo">
        <OperacaoLancamentoValores />
        <OperacaoLancamentoDatas />
        <OperacaoLancamentoCredor />
        <OperacaoLancamentoPagamento />
        <OperacaoLancamentoFotos />
        <OperacaoLancamentoDiscriminacao />
        <OperacaoLancamentoRecorrencia />
      </div>

      <div class="lc-acoes">
        <button type="button" class="lc-salvar-nova" :disabled="salvandoOperacao" @click="salvarOperacao(true)">
          Salvar e criar nova
        </button>
        <button type="button" class="lc-salvar" :disabled="salvandoOperacao" @click="salvarOperacao()">Salvar</button>
      </div>
    </div>
  </v-dialog>
</template>
