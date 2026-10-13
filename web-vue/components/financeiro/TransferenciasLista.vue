<script setup lang="ts">
import type { OperacaoResumo } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";

const props = withDefaults(
  defineProps<{
    operacoes: OperacaoResumo[];
    totalOperacoes: number;
    pagina: number;
    totalPaginas: number;
    podeEditar?: boolean;
    podeConferir?: boolean;
    podeCancelarPlanejamento?: boolean;
    salvando?: boolean;
  }>(),
  { podeEditar: false, podeConferir: false, podeCancelarPlanejamento: false, salvando: false }
);

const emit = defineEmits<{
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "conferir", operacao: OperacaoResumo): void;
  (event: "cancelar-planejamento", operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
}>();

const rotulosStatus: Record<string, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  agendada: "Agendada",
  cancelada: "Cancelada",
  divergente: "Divergente"
};

function rotuloStatus(status: string): string {
  return rotulosStatus[status] ?? status;
}

function iconeStatus(status: string): string {
  if (status === "recebido") return "mdi-check-circle-outline";
  if (status === "divergente") return "mdi-alert-circle-outline";
  if (status === "cancelada") return "mdi-close-circle-outline";
  if (status === "agendada") return "mdi-calendar-clock-outline";
  return "mdi-clock-outline";
}

function permiteEditar(op: OperacaoResumo): boolean {
  return Boolean(
    props.podeEditar &&
      op.status !== "recebido" &&
      !op.possuiPlanejamentoRetorno &&
      !op.ehPlanejamentoRetorno
  );
}

function permiteConferir(op: OperacaoResumo): boolean {
  return Boolean(op.status === "pendente" && props.podeConferir && !op.possuiPlanejamentoRetorno);
}

function permiteCancelar(op: OperacaoResumo): boolean {
  return Boolean(props.podeCancelarPlanejamento && op.ehPlanejamentoRetorno && op.status === "agendada");
}
</script>

<template>
  <section class="lista-transferencias" aria-label="Transferências">
    <div class="lista-transferencias__cabecalho" role="row">
      <span>Status</span><span>Data</span><span>Origem → destino</span><span>Responsável</span><span>Lacre</span><span>Valor</span><span>Ações</span>
    </div>

    <article v-for="op in operacoes" :key="op.id" class="lista-transferencias__linha" :data-operacao-id="op.id">
      <div class="lista-transferencias__status" data-col="Status">
        <span class="lista-transferencias__chip" :data-status="op.status">
          <v-icon :icon="iconeStatus(op.status)" size="14" />{{ rotuloStatus(op.status) }}
        </span>
        <small v-if="op.dataRecebimento">Recebida em {{ formatarDataHora(op.dataRecebimento) }}</small>
      </div>
      <time :datetime="op.dataReferencia" class="lista-transferencias__data" data-col="Data">{{ formatarDataSomenteDia(op.dataReferencia) }}</time>
      <div class="lista-transferencias__rota" data-col="Origem → destino">
        <span><v-icon icon="mdi-swap-horizontal" size="17" />{{ op.contaOrigemNome || '—' }} → {{ op.contaDestinoNome || '—' }}</span>
        <small>{{ op.descricao || 'Transferência' }}<template v-if="op.pdvNome"> · {{ op.pdvNome }}</template></small>
      </div>
      <span class="lista-transferencias__responsavel" data-col="Responsável">{{ op.criadoPorNome || '—' }}</span>
      <span class="lista-transferencias__lacre" data-col="Lacre">{{ op.nLacreDoc || '—' }}</span>
      <strong class="lista-transferencias__valor" data-col="Valor">{{ dinheiro(op.valorOriginal) }}</strong>
      <div class="lista-transferencias__acoes" data-col="Ações">
        <v-btn
          v-if="permiteEditar(op)"
          size="small"
          variant="text"
          icon="mdi-pencil"
          aria-label="Editar transferência"
          data-teste="botao-editar"
          @click="emit('editar', op)"
        />
        <v-btn
          v-if="permiteConferir(op)"
          size="small"
          variant="tonal"
          data-teste="botao-conferir"
          @click="emit('conferir', op)"
        >
          Conferir
        </v-btn>
        <v-btn
          v-if="permiteCancelar(op)"
          size="small"
          variant="text"
          color="error"
          :disabled="salvando"
          data-teste="cancelar-planejamento-retorno"
          @click="emit('cancelar-planejamento', op)"
        >
          Cancelar
        </v-btn>
      </div>
    </article>

    <div v-if="!operacoes.length" class="lista-transferencias__vazio">
      <v-icon icon="mdi-swap-horizontal-variant" size="34" />
      <strong>Nenhuma transferência encontrada</strong>
      <span>Altere os filtros ou registre uma transferência pelo botão + Novo.</span>
    </div>

    <footer v-if="totalOperacoes > 10" class="lista-transferencias__paginacao">
      <span>Página {{ pagina }} de {{ totalPaginas }}</span>
      <v-btn size="small" variant="text" :disabled="pagina === 1" @click="emit('update:pagina', Math.max(1, pagina - 1))">Anterior</v-btn>
      <v-btn size="small" variant="text" :disabled="pagina === totalPaginas" @click="emit('update:pagina', Math.min(totalPaginas, pagina + 1))">Próxima</v-btn>
    </footer>
  </section>
</template>

<style scoped>
.lista-transferencias { display: grid; background: var(--cx-surface-raised); color: var(--cx-ink); }
.lista-transferencias__cabecalho,
.lista-transferencias__linha {
  display: grid;
  grid-template-columns: 122px 94px minmax(190px, 1.5fr) minmax(100px, .8fr) 76px 112px minmax(72px, auto);
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
}
.lista-transferencias__cabecalho {
  border-bottom: 1px solid var(--cx-line);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}
.lista-transferencias__linha { min-width: 0; border-bottom: 1px solid var(--cx-line); }
.lista-transferencias__linha:last-of-type { border-bottom: 0; }
.lista-transferencias__chip { display: inline-flex; gap: 5px; align-items: center; padding: 4px 8px; border-radius: 999px; color: #172033; background: #e2e8f0; font-size: 12px; font-weight: 700; }
.lista-transferencias__chip[data-status="pendente"] { background: #fde68a; }
.lista-transferencias__chip[data-status="recebido"] { background: #bbf7d0; }
.lista-transferencias__chip[data-status="agendada"] { background: #bfdbfe; }
.lista-transferencias__chip[data-status="cancelada"] { background: #fecaca; }
.lista-transferencias__chip[data-status="divergente"] { background: #fdba74; }
.lista-transferencias__status small,
.lista-transferencias__rota small { display: block; margin-top: 4px; color: var(--cx-ink-soft); font-size: 11px; }
.lista-transferencias__data,
.lista-transferencias__responsavel,
.lista-transferencias__lacre { color: var(--cx-ink-soft); font-size: 13px; font-weight: 600; }
.lista-transferencias__rota { min-width: 0; }
.lista-transferencias__rota > span { display: flex; gap: 7px; align-items: center; overflow: hidden; color: var(--cx-ink); font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.lista-transferencias__rota :deep(.v-icon) { color: var(--cat-transferencias-tinta); flex: 0 0 auto; }
.lista-transferencias__valor { justify-self: end; color: var(--cx-ink); font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lista-transferencias__acoes { display: flex; justify-content: flex-end; gap: 4px; }
.lista-transferencias__vazio { display: grid; justify-items: center; gap: 8px; padding: 52px 16px; color: var(--cx-ink-soft); text-align: center; }
.lista-transferencias__vazio strong { color: var(--cx-ink); }
.lista-transferencias__paginacao { display: flex; justify-content: flex-end; align-items: center; gap: 5px; padding: 10px 16px; border-top: 1px solid var(--cx-line); color: var(--cx-ink-soft); font-size: 12px; }
@media (width <= 1024px) {
  .lista-transferencias__cabecalho,
  .lista-transferencias__linha { grid-template-columns: 122px 94px minmax(180px, 1fr) 92px 105px minmax(72px, auto); }
  .lista-transferencias__cabecalho > :nth-child(5), .lista-transferencias__linha > [data-col="Lacre"] { display: none; }
}
@media (width <= 768px) {
  .lista-transferencias { gap: 8px; padding: 8px; background: transparent; }
  .lista-transferencias__cabecalho { display: none; }
  .lista-transferencias__linha { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "rota valor" "status acoes"; gap: 8px 12px; padding: 14px; border: 1px solid var(--cx-line); border-radius: 12px; background: var(--cx-surface-raised); }
  .lista-transferencias__rota { grid-area: rota; }
  .lista-transferencias__valor { grid-area: valor; align-self: start; }
  .lista-transferencias__status { grid-area: status; }
  .lista-transferencias__acoes { grid-area: acoes; align-self: end; }
  .lista-transferencias__data, .lista-transferencias__responsavel, .lista-transferencias__lacre { display: none; }
  .lista-transferencias__paginacao { justify-content: center; flex-wrap: wrap; border: 0; }
}
@media (width <= 390px) { .lista-transferencias__linha { padding: 12px; } .lista-transferencias__acoes :deep(.v-btn) { min-width: 34px; padding-inline: 7px; } }
</style>
