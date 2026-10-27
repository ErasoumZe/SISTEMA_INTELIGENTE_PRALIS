<script setup lang="ts">
import { computed } from "vue";
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia, formatarDiaDeTimestamp } from "~/utils/formatacao";
import { composicaoDoMalote, horaCurta, rotuloMovimento } from "~/utils/transferencias-relatorio";
import SituacaoMalote from "./SituacaoMalote.vue";
import TransferenciasRelatorioDetalhe from "./TransferenciasRelatorioDetalhe.vue";
import TrilhaLacres from "./TrilhaLacres.vue";

// Uma linha do relatorio de Transferencias = uma transferencia. As regras de quem pode editar, conferir
// ou cancelar sao AS MESMAS da lista anterior (movidas, nao alteradas); o que e novo e so a apresentacao
// e o botao de expandir, que nao grava nada.
const props = withDefaults(
  defineProps<{
    operacao: OperacaoResumo;
    aberta?: boolean;
    podeEditar?: boolean;
    podeConferir?: boolean;
    podeCancelarPlanejamento?: boolean;
    salvando?: boolean;
  }>(),
  { aberta: false, podeEditar: false, podeConferir: false, podeCancelarPlanejamento: false, salvando: false }
);

const emit = defineEmits<{
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "conferir", operacao: OperacaoResumo): void;
  (event: "cancelar-planejamento", operacao: OperacaoResumo): void;
  (event: "alternar", id: string): void;
}>();

const permiteEditar = computed(() =>
  Boolean(
    props.podeEditar &&
    props.operacao.status !== "recebido" &&
    !props.operacao.possuiPlanejamentoRetorno &&
    !props.operacao.ehPlanejamentoRetorno
  )
);
const permiteConferir = computed(() =>
  Boolean(props.operacao.status === "pendente" && props.podeConferir && !props.operacao.possuiPlanejamentoRetorno)
);
const permiteCancelar = computed(() =>
  Boolean(
    props.podeCancelarPlanejamento && props.operacao.ehPlanejamentoRetorno && props.operacao.status === "agendada"
  )
);

const ehMalote = computed(() => Boolean(props.operacao.situacaoMalote));
const composicao = computed(() => composicaoDoMalote(props.operacao));
const idPainel = computed(() => `detalhe-${props.operacao.id}`);
const idTitulo = computed(() => `linha-${props.operacao.id}`);
const cancelada = computed(() => props.operacao.status === "cancelada");

const diaLancamento = computed(() =>
  props.operacao.criadoEm
    ? formatarDiaDeTimestamp(props.operacao.criadoEm)
    : formatarDataSomenteDia(props.operacao.dataReferencia)
);
const refDiferente = computed(() => {
  if (!props.operacao.criadoEm) return false;
  return formatarDataSomenteDia(props.operacao.dataReferencia) !== formatarDiaDeTimestamp(props.operacao.criadoEm);
});

// Linha de contexto sob a situacao: quem usou, quem era o previsto, ou quando foi recebida.
const contexto = computed(() => {
  const op = props.operacao;
  if (op.situacaoMalote === "usado" && op.caixa) {
    return [op.caixa.pdvNome, op.caixa.turnoNome].filter(Boolean).join(" · ");
  }
  if (op.situacaoMalote === "disponivel" && op.pdvsDestino?.length) return `Previsto: ${op.pdvsDestino.join(", ")}`;
  if (op.dataRecebimento) return `Recebida em ${formatarDataHora(op.dataRecebimento)}`;
  return "";
});

const rota = computed(() => `${props.operacao.contaOrigemNome || "—"} → ${props.operacao.contaDestinoNome || "—"}`);
const rotuloExpandir = computed(
  () =>
    `${props.aberta ? "Ocultar" : "Ver"} detalhes da transferência de ${dinheiro(props.operacao.valorOriginal)}, ${rota.value}`
);
</script>

<template>
  <div class="trl" role="rowgroup" :data-operacao-id="operacao.id" :data-aberta="aberta ? 'sim' : undefined">
    <div class="trl__linha" role="row" :class="{ 'trl__linha--cancelada': cancelada }" :aria-labelledby="idTitulo">
      <div class="trl__lanc" role="cell" data-col="Lançamento">
        <time :id="idTitulo" :datetime="operacao.criadoEm ?? operacao.dataReferencia">
          <strong>{{ diaLancamento }}</strong>
          <span v-if="operacao.criadoEm" class="trl__hora">{{ horaCurta(operacao.criadoEm) }}</span>
        </time>
        <small v-if="operacao.criadoPorNome">por {{ operacao.criadoPorNome }}</small>
        <small v-if="refDiferente">ref. {{ formatarDataSomenteDia(operacao.dataReferencia) }}</small>
      </div>

      <div class="trl__mov" role="cell" data-col="Movimento">
        <span class="trl__tipo">
          <v-icon icon="mdi-swap-horizontal" size="17" aria-hidden="true" />{{ rotuloMovimento(operacao) }}
        </span>
        <span class="trl__rota">{{ rota }}</span>
        <small class="trl__obs">{{ operacao.descricao || "Transferência" }}</small>
      </div>

      <div class="trl__valor" role="cell" data-col="Valor total">
        <strong class="trl__total cx-num" :data-cancelada="cancelada ? 'sim' : undefined">{{
          dinheiro(operacao.valorOriginal)
        }}</strong>
        <small v-if="composicao" class="cx-num"
          >Dinheiro {{ dinheiro(composicao.especie) }} · Moedas {{ dinheiro(composicao.moedas) }}</small
        >
        <small v-else-if="ehMalote">Composição não informada</small>
        <small v-if="operacao.valorRecebido != null" class="cx-num"
          >Contado {{ dinheiro(operacao.valorRecebido) }}</small
        >
      </div>

      <div class="trl__lacres" role="cell" data-col="Lacres">
        <TrilhaLacres :lacres="operacao.lacres ?? []" :n-lacre-doc="operacao.nLacreDoc ?? null" :malote="ehMalote" />
      </div>

      <div class="trl__situacao" role="cell" data-col="Situação">
        <SituacaoMalote :operacao="operacao" />
        <small v-if="contexto">{{ contexto }}</small>
      </div>

      <div class="trl__acoes" role="cell" data-col="Ações">
        <v-btn
          v-if="permiteEditar"
          size="small"
          variant="text"
          icon="mdi-pencil"
          aria-label="Editar transferência"
          data-teste="botao-editar"
          @click="emit('editar', operacao)"
        />
        <v-btn
          v-if="permiteConferir"
          size="small"
          variant="tonal"
          data-teste="botao-conferir"
          @click="emit('conferir', operacao)"
          >Conferir</v-btn
        >
        <v-btn
          v-if="permiteCancelar"
          size="small"
          variant="text"
          color="error"
          :disabled="salvando"
          data-teste="cancelar-planejamento-retorno"
          @click="emit('cancelar-planejamento', operacao)"
          >Cancelar</v-btn
        >
        <v-btn
          size="small"
          variant="text"
          :icon="aberta ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          :aria-expanded="aberta"
          :aria-controls="idPainel"
          :aria-label="rotuloExpandir"
          data-teste="botao-expandir"
          @click="emit('alternar', operacao.id)"
        />
      </div>
    </div>

    <div v-if="aberta" role="row" class="trl__detalhe">
      <div role="cell" aria-colspan="6">
        <TransferenciasRelatorioDetalhe :operacao="operacao" :id-painel="idPainel" :id-titulo="idTitulo" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.trl {
  border-bottom: 1px solid var(--cx-line);
}
.trl:last-of-type {
  border-bottom: 0;
}
.trl__linha {
  position: relative;
  display: grid;
  grid-template-columns: 138px minmax(170px, 1.3fr) 168px minmax(210px, 1.7fr) minmax(150px, 1.1fr) auto;
  gap: var(--cx-sp-3);
  align-items: start;
  padding: var(--cx-sp-3) var(--cx-sp-4) var(--cx-sp-3) calc(var(--cx-sp-4) + 3px);
  min-width: 0;
}
/* Barra da categoria Transferencias: a unica cor da linha; o sinal do dinheiro fica no valor. */
.trl__linha::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--cat-transferencias-base);
}
.trl__linha--cancelada {
  color: var(--cx-ink-soft);
}
.trl__lanc,
.trl__mov,
.trl__valor,
.trl__situacao {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.trl__hora {
  display: block;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.trl__lanc small,
.trl__valor small,
.trl__situacao small,
.trl__obs {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.trl__tipo {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1);
  font-weight: 800;
}
.trl__tipo :deep(.v-icon) {
  color: var(--cat-transferencias-tinta);
}
.trl__rota {
  overflow-wrap: anywhere;
  font-size: var(--cx-fs-body);
  font-weight: 600;
}
.trl__obs {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.trl__valor {
  justify-items: end;
  text-align: right;
}
.trl__total {
  font-size: var(--cx-fs-lead);
  font-weight: 700;
  white-space: nowrap;
}
.trl__total[data-cancelada="sim"] {
  text-decoration: line-through;
}
.trl__situacao {
  justify-items: start;
  gap: var(--cx-sp-1);
}
.trl__acoes {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cx-sp-1);
}
.trl__acoes :deep(.v-btn) {
  min-width: 44px;
  min-height: 44px;
}
.trl__acoes :deep(.v-btn:focus-visible) {
  outline: 2px solid var(--cx-focus);
  outline-offset: 2px;
}

@container lista (width <= 1160px) {
  .trl__linha {
    grid-template-columns: 138px minmax(0, 1fr) 160px minmax(150px, 0.8fr);
    grid-template-areas:
      "lanc mov valor situ"
      "lacres lacres lacres acoes";
  }
  .trl__lanc {
    grid-area: lanc;
  }
  .trl__mov {
    grid-area: mov;
  }
  .trl__valor {
    grid-area: valor;
  }
  .trl__situacao {
    grid-area: situ;
  }
  .trl__lacres {
    grid-area: lacres;
  }
  .trl__acoes {
    grid-area: acoes;
    align-self: end;
  }
}

@container lista (width <= 780px) {
  .trl {
    margin: var(--cx-sp-2);
    border: 1px solid var(--cx-line);
    border-radius: var(--cx-r-lg);
    background: var(--cx-surface-raised);
    overflow: hidden;
  }
  .trl__linha {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "situ valor"
      "mov mov"
      "lacres lacres"
      "lanc lanc"
      "acoes acoes";
    gap: var(--cx-sp-3);
    padding: var(--cx-sp-3) var(--cx-sp-3) var(--cx-sp-3) calc(var(--cx-sp-3) + 3px);
  }
  .trl__lanc {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cx-sp-1) var(--cx-sp-2);
  }
  .trl__acoes {
    justify-content: stretch;
    flex-wrap: wrap;
  }
  .trl__acoes :deep(.v-btn) {
    flex: 1 1 auto;
  }
  .trl__lacres :deep(.trilha) {
    flex-direction: column;
    flex-wrap: nowrap;
  }
}

@container lista (width <= 420px) {
  .trl__total {
    font-size: var(--cx-fs-body);
  }
}

@media (prefers-reduced-motion: reduce) {
  .trl,
  .trl * {
    transition: none !important;
    animation: none !important;
  }
}
</style>
