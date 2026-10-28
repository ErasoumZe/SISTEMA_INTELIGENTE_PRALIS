<script setup lang="ts">
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";
import { corDaSituacao, textoDaSituacao, type LinhaRelatorio } from "~/utils/relatorio-fechamento";

// Um caixa na fila do Relatorio de fechamento: quando, onde, situacao, saldo e o botao que abre o fechamento.
defineProps<{ linha: LinhaRelatorio }>();
const emit = defineEmits<{ (event: "abrir", linha: LinhaRelatorio): void }>();
</script>

<template>
  <v-card variant="outlined" class="h-100 cartao-caixa">
    <v-card-text>
      <div class="cartao-caixa__topo">
        <div>
          <div class="text-overline">{{ formatarDataSomenteDia(linha.dataMovimento) }}</div>
          <div class="text-h6">{{ linha.pdvNome }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ linha.turnoNome || "Turno não informado" }} ·
            {{ linha.colaboradorNome || linha.usuarioCaixaNome || "--" }}
          </div>
        </div>
        <v-chip
          :color="corDaSituacao(linha.situacaoTesouraria)"
          size="small"
          variant="tonal"
          class="cartao-caixa__status"
          >{{ textoDaSituacao(linha.situacaoTesouraria) }}</v-chip
        >
      </div>
      <v-divider class="my-3" />
      <div class="d-flex justify-space-between ga-3">
        <span class="text-medium-emphasis">Abertura</span
        ><span>{{ linha.dataHoraAbertura ? formatarDataHora(linha.dataHoraAbertura) : "--" }}</span>
      </div>
      <div class="d-flex justify-space-between ga-3 mt-1">
        <span class="text-medium-emphasis">Fechamento</span
        ><span>{{ linha.dataHoraFechamento ? formatarDataHora(linha.dataHoraFechamento) : "Em curso" }}</span>
      </div>
      <div class="d-flex justify-space-between ga-3 mt-3 text-subtitle-1">
        <span>Saldo físico</span><strong class="cx-num">{{ dinheiro(linha.saldo) }}</strong>
      </div>
      <v-chip v-if="linha.temAjuste" color="error" size="small" class="mt-3" variant="tonal"
        >Ajuste / diferença registrado</v-chip
      >
    </v-card-text>
    <v-card-actions>
      <v-btn
        block
        color="primary"
        variant="flat"
        class="cartao-caixa__acao"
        prepend-icon="mdi-clipboard-text-search-outline"
        @click="emit('abrir', linha)"
        >Conferir caixa</v-btn
      >
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.cartao-caixa {
  border-top: 3px solid rgb(var(--v-theme-primary));
}
.cartao-caixa__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}
.cartao-caixa__status {
  max-width: 100%;
  white-space: normal;
}
.cartao-caixa__acao {
  min-height: 44px;
}
</style>
