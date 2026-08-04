<script setup lang="ts">
// Cockpit de TESOURARIA (rota /transferencias). O tesoureiro NAO opera caixa — ele move dinheiro
// entre contas (cofre -> caixas -> banco) por transferencia. Substitui a tabela generica pelo
// cockpit: cards Saida/Entrada/Saldo (cor --cat-transferencias) + lista limpa das transferencias.
// A criacao/edicao REUSA o modal de transferencia do workspace (eventos "nova"/"editar"); o botao
// NAO depende de caixa aberto.
//
// A lista recebe da API o trajeto nominal, lacre, estado e data de recebimento.
import type { ItemMenu, OperacaoResumo, Opcao, ResumoCaixa } from "~/types/padaria";
import { dinheiro } from "~/utils/domain";
import { formatarDataSomenteDia } from "~/utils/formatacao";

const props = withDefaults(
  defineProps<{
    resumo: ResumoCaixa | null;
    telaAtual: ItemMenu | null | undefined;
    empresaAtiva: Opcao | null;
    operacoesPaginadas: OperacaoResumo[];
    operacoesTela: OperacaoResumo[];
    totalOperacoes: number;
    pagina: number;
    totalPaginas: number;
    podeCriar?: boolean;
    podeEditar?: boolean;
  }>(),
  { podeCriar: false, podeEditar: false, operacoesTela: () => [] }
);

const emit = defineEmits<{
  (event: "nova"): void;
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
  (event: "recarregar"): void;
}>();
const { apiPost } = useApi();
const confirmando = ref<OperacaoResumo | null>(null);
const contaConfirmacaoId = ref("");
const lacreConfirmacao = ref("");
const valorRecebido = ref("");
const erroConfirmacao = ref("");
async function confirmarRecebimento() {
  if (!confirmando.value) return;
  erroConfirmacao.value = "";
  try {
    await apiPost(`/api/transferencias/${confirmando.value.id}/confirmar`, {
      contaDestinoId: contaConfirmacaoId.value || confirmando.value.contaDestinoId,
      nLacreDoc: lacreConfirmacao.value,
      ...(valorRecebido.value ? { valorRecebido: Number(valorRecebido.value) } : {})
    });
    confirmando.value = null;
    emit("recarregar");
  } catch (error) {
    erroConfirmacao.value = error instanceof Error ? error.message : "Falha ao confirmar";
  }
}

// Total do periodo (sempre confiavel — soma da lista carregada).
const totalPeriodo = computed(() => props.operacoesTela.reduce((soma, op) => soma + Number(op.valorOriginal || 0), 0));

// Split direcional Saida/Entrada/Saldo: so existe quando ha resumo (contexto de caixa). Para o
// tesoureiro puro (sem caixa) o resumo e nulo -> os cards ficam pendentes de backend.
const saida = computed(() =>
  props.operacoesTela
    .filter((op) => op.status === "pendente" || op.status === "recebido")
    .reduce((total, op) => total + Number(op.valorOriginal), 0)
);
const entrada = computed(() =>
  props.operacoesTela
    .filter((op) => op.status === "recebido")
    .reduce((total, op) => total + Number(op.valorOriginal), 0)
);
const saldo = computed(() => entrada.value - saida.value);
</script>

<template>
  <div class="tesouraria">
    <!-- Cabecalho + acao primaria (independente de caixa) -->
    <header class="tes-head">
      <div class="tes-title">
        <h2>{{ telaAtual?.titulo ?? "Tesouraria" }}</h2>
        <p>
          Movimente dinheiro entre contas (cofre → caixas → banco).
          <span class="tes-count"
            >{{ totalOperacoes }} transferência{{ totalOperacoes === 1 ? "" : "s" }} · total
            {{ dinheiro(totalPeriodo) }}</span
          >
        </p>
      </div>
      <v-btn v-if="podeCriar" class="tes-nova" prepend-icon="mdi-plus" rounded="pill" @click="emit('nova')">
        Nova transferência
      </v-btn>
    </header>

    <!-- Cards de total: Saida · Entrada · Saldo (cor --cat-transferencias) -->
    <section class="tes-cards" aria-label="Totais de transferências">
      <article class="tes-card">
        <span class="tes-cic"><v-icon icon="mdi-arrow-up-right" size="20" /></span>
        <span class="tes-copy">
          <span class="tes-lbl">Saída </span>
          <span class="tes-val neg" :class="{ pend: saida === null }">{{ dinheiro(saida) }}</span>
        </span>
      </article>
      <article class="tes-card">
        <span class="tes-cic"><v-icon icon="mdi-arrow-down-left" size="20" /></span>
        <span class="tes-copy">
          <span class="tes-lbl">Entrada </span>
          <span class="tes-val pos" :class="{ pend: entrada === null }">{{ dinheiro(entrada) }}</span>
        </span>
      </article>
      <article class="tes-card">
        <span class="tes-cic"><v-icon icon="mdi-scale-balance" size="20" /></span>
        <span class="tes-copy">
          <span class="tes-lbl">Saldo </span>
          <span class="tes-val">{{ dinheiro(saldo) }}</span>
        </span>
      </article>
    </section>

    <!-- Lista limpa das transferencias do periodo -->
    <v-card class="tes-list-card" rounded="lg" elevation="1">
      <div class="tes-list" role="table" aria-label="Transferências do período">
        <div class="tes-row tes-row-head" role="row">
          <span>Confirmação</span>
          <span>Data</span>
          <span>Origem → destino</span>
          <span>Lacre</span>
          <span class="tes-num">Valor</span>
          <span>Recebimento</span>
          <span class="tes-acoes-h">Ações</span>
        </div>

        <div v-for="op in operacoesPaginadas" :key="op.id" class="tes-row" role="row">
          <!-- Confirmacao: sem backend de confirmacao nesta branch -> somente leitura + regra. -->
          <span class="tes-conf" data-col="Confirmação">
            <span class="tes-status-chip">
              <v-icon :icon="op.status === 'recebido' ? 'mdi-check-circle-outline' : 'mdi-clock-outline'" size="13" />
              {{ op.status }}
            </span>
          </span>
          <span class="tes-data" data-col="Data">{{ formatarDataSomenteDia(op.dataReferencia) }}</span>
          <span class="tes-desc" data-col="Origem → destino" :title="op.descricao">
            <v-icon icon="mdi-swap-horizontal" size="16" class="tes-desc-ic" />{{ op.contaOrigemNome }} →
            {{ op.contaDestinoNome }}
          </span>
          <span class="tes-lacre" data-col="Lacre">{{ op.nLacreDoc || "—" }}</span>
          <span class="tes-valor tes-num" data-col="Valor">{{ dinheiro(op.valorOriginal) }}</span>
          <span class="tes-receb" data-col="Recebimento">{{
            op.dataRecebimento ? formatarDataSomenteDia(op.dataRecebimento) : "—"
          }}</span>
          <span class="tes-acoes" data-col="Ações">
            <v-btn v-if="podeEditar" size="small" variant="tonal" prepend-icon="mdi-pencil" @click="emit('editar', op)">
              Editar
            </v-btn>
            <v-btn v-if="op.status === 'pendente'" size="small" variant="tonal" @click="confirmando = op">
              Confirmar
            </v-btn>
          </span>
        </div>

        <div v-if="!operacoesPaginadas.length" class="tes-empty">
          <v-icon icon="mdi-swap-horizontal-variant" size="34" />
          <p>Nenhuma transferência no período.</p>
          <v-btn v-if="podeCriar" class="tes-nova" prepend-icon="mdi-plus" rounded="pill" @click="emit('nova')">
            Nova transferência
          </v-btn>
        </div>
      </div>

      <div v-if="totalOperacoes > 10" class="tes-pag">
        <v-btn
          size="small"
          variant="outlined"
          :disabled="pagina === 1"
          @click="emit('update:pagina', Math.max(1, pagina - 1))"
        >
          Anterior
        </v-btn>
        <span>{{ pagina }} / {{ totalPaginas }}</span>
        <v-btn
          size="small"
          variant="outlined"
          :disabled="pagina === totalPaginas"
          @click="emit('update:pagina', Math.min(totalPaginas, pagina + 1))"
        >
          Próxima
        </v-btn>
      </div>
    </v-card>

    <v-dialog
      :model-value="Boolean(confirmando)"
      max-width="430"
      @update:model-value="(v) => !v && (confirmando = null)"
    >
      <v-card title="Confirmar recebimento" class="pa-4">
        <v-text-field v-model="contaConfirmacaoId" label="ID da conta que recebeu" />
        <v-text-field v-model="lacreConfirmacao" label="Nº do lacre/documento" />
        <v-text-field v-model="valorRecebido" type="number" label="Valor recebido" />
        <v-alert v-if="erroConfirmacao" type="error">{{ erroConfirmacao }}</v-alert>
        <v-card-actions
          ><v-spacer /><v-btn @click="confirmando = null">Cancelar</v-btn
          ><v-btn color="primary" @click="confirmarRecebimento">Confirmar</v-btn></v-card-actions
        >
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.tesouraria {
  display: grid;
  gap: 18px;
}

/* ---- Cabecalho ---- */
.tes-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.tes-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: var(--shell-ink, #1f2733);
}
.tes-title p {
  margin: 4px 0 0;
  color: var(--shell-ink-soft, #64748b);
  font-size: 13.5px;
  font-weight: 600;
}
.tes-count {
  display: inline-block;
  margin-left: 4px;
  font-weight: 700;
  color: var(--cat-transferencias-strong, #9a3412);
}
.tes-nova {
  background: var(--cat-transferencias-base, #c2410c) !important;
  color: #fff !important;
  font-weight: 800;
  text-transform: none;
  letter-spacing: 0.2px;
  box-shadow: 0 6px 16px rgb(194 65 12 / 0.26) !important;
}

/* ---- Cards Saida/Entrada/Saldo ---- */
.tes-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.tes-card {
  display: flex;
  align-items: center;
  gap: 13px;
  background: var(--surface, #fff);
  border-radius: 14px;
  padding: 15px 17px;
  box-shadow:
    0 2px 1px -1px rgb(0 0 0 / 0.2),
    0 1px 1px 0 rgb(0 0 0 / 0.14),
    0 1px 3px 0 rgb(0 0 0 / 0.12);
}
.tes-cic {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-base, #c2410c);
}
.tes-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.tes-lbl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  color: var(--shell-ink-soft, #64748b);
}
.tes-regra {
  text-transform: none;
  letter-spacing: 0;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--cat-transferencias-strong, #9a3412);
  background: var(--cat-transferencias-soft, #fff1e8);
  border-radius: 5px;
  padding: 1px 5px;
}
.tes-val {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;
  color: var(--shell-ink, #1f2733);
}
.tes-val.neg {
  color: var(--negative, #dc2626);
}
.tes-val.pos {
  color: var(--positive, #16a34a);
}
.tes-val.pend {
  color: var(--shell-ink-soft, #94a3b8);
}

/* ---- Lista ---- */
.tes-list-card {
  overflow: hidden;
}
.tes-list {
  display: grid;
}
.tes-row {
  display: grid;
  grid-template-columns: 116px 84px minmax(0, 1fr) 70px 116px 116px 104px;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line, #e4e8ef);
}
.tes-row:last-child {
  border-bottom: 0;
}
.tes-row-head {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--shell-ink-soft, #64748b);
  background: color-mix(in srgb, var(--cat-transferencias-base, #c2410c) 5%, #fff);
}
.tes-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--shell-ink-soft, #64748b);
  background: #f1f5f9;
}
.tes-data {
  font-size: 13px;
  font-weight: 600;
  color: var(--shell-ink-soft, #64748b);
  white-space: nowrap;
}
.tes-desc {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  color: var(--shell-ink, #1f2733);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tes-desc-ic {
  color: var(--cat-transferencias-base, #c2410c);
  flex: 0 0 auto;
}
.tes-lacre,
.tes-receb {
  font-size: 13px;
  font-weight: 700;
  color: var(--shell-ink-soft, #94a3b8);
}
.tes-valor {
  font-size: 14.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--cat-transferencias-strong, #9a3412);
}
.tes-num {
  text-align: right;
}
.tes-acoes,
.tes-acoes-h {
  justify-self: end;
}

.tes-empty {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 46px 16px;
  color: var(--shell-ink-soft, #64748b);
}
.tes-empty p {
  margin: 0;
  font-weight: 600;
}

.tes-pag {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--line, #e4e8ef);
}

.tes-nota {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  color: var(--shell-ink-soft, #64748b);
  font-size: 12.5px;
  font-weight: 500;
}
.tes-nota code {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 12px;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-strong, #9a3412);
  border-radius: 5px;
  padding: 1px 5px;
}

/* ---- Responsivo (breakpoints do projeto) ---- */
@media (width <= 1024px) {
  .tes-row {
    grid-template-columns: 108px 76px minmax(0, 1fr) 104px 96px;
  }
  /* Lacre e recebimento ficam compactos para preservar a densidade. */
  .tes-row-head > :nth-child(4),
  .tes-row-head > :nth-child(6),
  .tes-lacre,
  .tes-receb {
    display: none;
  }
}
@media (width <= 768px) {
  .tes-cards {
    grid-template-columns: 1fr;
  }
  .tes-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "desc valor"
      "meta acoes";
    row-gap: 4px;
  }
  .tes-row-head {
    display: none;
  }
  .tes-conf {
    grid-area: meta;
    display: inline-flex;
  }
  .tes-data {
    display: none;
  }
  .tes-desc {
    grid-area: desc;
  }
  .tes-valor {
    grid-area: valor;
    justify-self: end;
    text-align: right;
  }
  .tes-acoes {
    grid-area: acoes;
  }
}
@media (width <= 560px) {
  .tes-head {
    gap: 12px;
  }
  .tes-nova {
    width: 100%;
  }
}
</style>
