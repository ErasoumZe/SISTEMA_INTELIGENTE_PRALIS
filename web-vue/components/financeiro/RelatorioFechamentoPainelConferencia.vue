<script setup lang="ts">
import { computed } from "vue";

type Resultado = "conferido" | "divergente";
type UltimaConferencia = {
  resultado: Resultado;
  observacao: string | null;
  conferidoPor: string;
  conferidoPorNome: string | null;
  conferidoEm: string | null;
};

// Dois botoes para a Tesouraria: "Fechou certo" aceita o retorno como o caixa declarou e registra a conferencia;
// "Teve quebra" registra a quebra com motivo, mesmo quando o caixa fechou sem diferenca. As regras de quem pode e
// quando seguem as do servidor; este painel so reune a acao e explica por que ela esta (ou nao) disponivel.
const props = defineProps<{
  situacao: string;
  podeConferirTransferencia: boolean;
  podeConferirFinal: boolean;
  // Sem permissao para ler transferencias o painel nao sabe se ha retorno pendente: nao finge que esta tudo certo.
  retornoVisivel: boolean;
  // A lista de transferencias do caixa falhou ao carregar: nao da pra afirmar que o retorno foi recebido.
  retornoComErro: boolean;
  pendentes: number;
  lacreDiferente: boolean;
  ultima: UltimaConferencia | null;
  enviando: boolean;
  erro: string;
  dataHora: (valor: unknown) => string;
}>();
const emit = defineEmits<{
  (event: "fechou-certo"): void;
  (event: "registrar-divergencia"): void;
  (event: "revisar-final", resultado: Resultado): void;
}>();

const textoUltima = computed(() => {
  if (!props.ultima) return "";
  const quem = props.ultima.conferidoPorNome || props.ultima.conferidoPor;
  const quando = props.ultima.conferidoEm ? props.dataHora(props.ultima.conferidoEm) : "--";
  const resultado = props.ultima.resultado === "conferido" ? "Conferido sem pendências" : props.ultima.observacao;
  return `${resultado} · ${quem} · ${quando}`;
});
const fechado = computed(() => ["aguardando_tesouraria", "fechado_sem_pendencias"].includes(props.situacao));
const comDiferenca = computed(() => props.situacao === "com_quebra");
// Se ha retorno pendente, quem confirma tambem precisa da permissao de receber transferencia.
const podeFecharCerto = computed(
  () =>
    props.retornoVisivel &&
    !props.retornoComErro &&
    props.podeConferirFinal &&
    fechado.value &&
    !props.lacreDiferente &&
    (props.pendentes === 0 || props.podeConferirTransferencia)
);
// "Teve quebra": a Tesouraria revisa e avisa mesmo quando o caixa fechou sem diferenca na visao do operador.
const podeApontarQuebra = computed(
  () => props.retornoVisivel && props.podeConferirFinal && (fechado.value || comDiferenca.value)
);
const mensagem = computed(() => {
  if (props.ultima) return textoUltima.value;
  if (!props.retornoVisivel) return "Sem permissão para ver as transferências deste caixa.";
  if (props.retornoComErro) return "Não foi possível ler as transferências deste caixa. Tente novamente abaixo.";
  if (!props.podeConferirFinal) return "Você não tem permissão para conferir o fechamento.";
  if (comDiferenca.value) return "O caixa fechou com diferença registrada. Descreva o motivo para registrar a quebra.";
  if (!fechado.value) return "Este caixa ainda não foi fechado.";
  if (props.lacreDiferente)
    return "O lacre de fechamento não bate com o reservado pela Tesouraria. Resolva antes de confirmar.";
  if (props.pendentes > 0) return "O retorno do caixa entra como ele declarou (valor, lacre e conta).";
  return "Retorno já recebido. Escolha uma opção.";
});
</script>

<template>
  <section class="pc" aria-labelledby="pc-titulo" data-teste="painel-conferencia">
    <div class="pc__texto">
      <h3 id="pc-titulo" class="pc__titulo">Conferência do fechamento</h3>
      <p class="pc__mensagem">{{ mensagem }}</p>
      <v-alert v-if="erro" type="error" variant="tonal" density="compact" role="alert" data-teste="erro-fechou-certo">{{
        erro
      }}</v-alert>
    </div>

    <div class="pc__acoes">
      <template v-if="ultima">
        <v-chip :color="ultima.resultado === 'conferido' ? 'success' : 'deep-orange'" variant="tonal">{{
          ultima.resultado === "conferido" ? "Conferido" : "Divergência registrada"
        }}</v-chip>
        <v-btn
          v-if="podeConferirFinal && (ultima.resultado === 'conferido' || pendentes === 0)"
          variant="outlined"
          color="primary"
          :disabled="enviando"
          class="pc__acao"
          prepend-icon="mdi-swap-horizontal"
          data-teste="botao-alterar-status"
          @click="emit('revisar-final', ultima.resultado === 'conferido' ? 'divergente' : 'conferido')"
          >Alterar status da conferência</v-btn
        >
      </template>
      <template v-else>
        <v-btn
          v-if="podeFecharCerto"
          color="success"
          variant="flat"
          class="pc__acao"
          prepend-icon="mdi-check-decagram-outline"
          :loading="enviando"
          data-teste="botao-fechou-certo"
          @click="emit('fechou-certo')"
          >Fechou certo</v-btn
        >
        <v-btn
          v-if="podeApontarQuebra"
          color="deep-orange"
          :variant="comDiferenca ? 'flat' : 'outlined'"
          :disabled="enviando"
          class="pc__acao"
          prepend-icon="mdi-alert-outline"
          data-teste="botao-teve-quebra"
          @click="emit('registrar-divergencia')"
          >Teve quebra</v-btn
        >
      </template>
    </div>
  </section>
</template>

<style scoped>
.pc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-left: 4px solid var(--cx-positive);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.pc__texto {
  display: grid;
  flex: 1 1 280px;
  gap: var(--cx-sp-1);
  min-width: 0;
}
.pc__titulo {
  margin: 0;
  font-size: var(--cx-fs-lead);
  font-weight: 800;
}
.pc__mensagem {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  overflow-wrap: anywhere;
}
.pc__acoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
}
.pc__acao {
  min-width: 44px;
  min-height: 44px;
}
@media (width <= 560px) {
  .pc__acoes {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }
  .pc__acao {
    width: 100%;
  }
}
</style>
