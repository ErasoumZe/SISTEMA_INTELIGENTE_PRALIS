<script setup lang="ts">
// Cockpit de TESOURARIA (rota /transferencias). O tesoureiro NAO opera caixa — ele move dinheiro
// entre contas (cofre -> caixas -> banco) por transferencia. Substitui a tabela generica pelo
// relatorio: filtros + uma linha por transferencia (so acompanhamento; a conferencia fica no Relatorio de fechamento).
// A criacao/edicao REUSA o modal de transferencia do workspace (eventos "nova"/"editar"); o botao
// NAO depende de caixa aberto.
//
// A lista recebe da API o trajeto nominal, lacre, estado e data de recebimento.
import { statusTransferenciaSchema, type StatusTransferencia } from "@padaria/shared";
import { ref } from "vue";
import type { ItemMenu, OperacaoResumo, Opcao, ResumoCaixa } from "~/types/padaria";
import CancelarPlanejamentoRetornoDialog from "./CancelarPlanejamentoRetornoDialog.vue";
import TransferenciasFiltros from "./TransferenciasFiltros.vue";
import TransferenciasLista from "./TransferenciasLista.vue";

const props = withDefaults(
  defineProps<{
    resumo: ResumoCaixa | null;
    telaAtual: ItemMenu | null | undefined;
    empresaAtiva: Opcao | null;
    operacoesPaginadas: OperacaoResumo[];
    operacoesTela: OperacaoResumo[];
    totalOperacoes: number;
    statusFiltro: StatusTransferencia | "";
    filtrosTransferencias: {
      dataInicio: string;
      dataFim: string;
      pdvId: string;
      usuario: string;
      contaOrigemId: string;
      contaDestinoId: string;
      lacre: string;
    };
    pdvs: Opcao[];
    contas: Opcao[];
    pagina: number;
    totalPaginas: number;
    podeCriar?: boolean;
    podeEditar?: boolean;
    podeCancelarPlanejamento?: boolean;
    salvando?: boolean;
  }>(),
  {
    podeCriar: false,
    podeEditar: false,
    podeCancelarPlanejamento: false,
    salvando: false,
    operacoesTela: () => []
  }
);

const emit = defineEmits<{
  (event: "nova"): void;
  (event: "editar", operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
  (event: "update:status-filtro", status: StatusTransferencia | ""): void;
  (event: "update:filtros-transferencias", filtros: typeof props.filtrosTransferencias): void;
  (
    event: "cancelarPlanejamento",
    payload: { planejamentoId: string; motivo: string; aoConcluir: (sucesso: boolean) => void }
  ): void;
}>();
const cancelandoPlanejamento = ref<OperacaoResumo | null>(null);

const rotulosStatus: Record<StatusTransferencia, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  agendada: "Agendada",
  cancelada: "Cancelada",
  divergente: "Divergente"
};
const opcoesStatus = [
  { title: "Todos os status", value: "" },
  ...statusTransferenciaSchema.options.map((status) => ({ title: rotulosStatus[status], value: status }))
];

function atualizarStatusFiltro(status: unknown) {
  const resultado = statusTransferenciaSchema.safeParse(status);
  emit("update:status-filtro", resultado.success ? resultado.data : "");
}
</script>

<template>
  <div class="tesouraria">
    <AppCabecalhoTela :titulo="telaAtual?.titulo ?? 'Tesouraria'">
      <template #subtitulo>
        Acompanhe o dinheiro em trânsito entre cofre, caixas e banco.
        <span class="tes-count"
          >{{ totalOperacoes }} registro{{ totalOperacoes === 1 ? "" : "s" }} encontrado{{
            totalOperacoes === 1 ? "" : "s"
          }}</span
        >
      </template>
    </AppCabecalhoTela>

    <v-card class="tes-list-card" rounded="lg" elevation="1">
      <TransferenciasFiltros
        :status="statusFiltro"
        :filtros="filtrosTransferencias"
        :opcoes-status="opcoesStatus"
        :pdvs="pdvs"
        :contas="contas"
        @update:status="atualizarStatusFiltro"
        @update:filtros="emit('update:filtros-transferencias', $event)"
      />
      <TransferenciasLista
        :operacoes="operacoesPaginadas"
        :total-operacoes="totalOperacoes"
        :pagina="pagina"
        :total-paginas="totalPaginas"
        :pode-editar="podeEditar"
        :pode-cancelar-planejamento="podeCancelarPlanejamento"
        :salvando="salvando"
        @editar="emit('editar', $event)"
        @cancelar-planejamento="cancelandoPlanejamento = $event"
        @update:pagina="emit('update:pagina', $event)"
      />
    </v-card>

    <CancelarPlanejamentoRetornoDialog
      :model-value="Boolean(cancelandoPlanejamento)"
      :operacao="cancelandoPlanejamento"
      :salvando="salvando"
      @update:model-value="(aberto: boolean) => !aberto && (cancelandoPlanejamento = null)"
      @confirmar="emit('cancelarPlanejamento', $event)"
    />
  </div>
</template>

<style scoped>
.tesouraria {
  display: grid;
  gap: 18px;
}

/* `--cat-transferencias-tinta` e nao `-strong`, e sao as QUATRO ocorrencias do arquivo, nao uma.
   O `-strong` NAO tem contraparte no tema escuro: o bloco `:root[data-theme="dark"]` redefine so
   `-soft` e `-tinta` de cada categoria. Medido, sobre o canvas:
     -strong #bb460a   claro 4,86  ·  escuro 3,54   <- reprovava no escuro
     -tinta            claro 7,05  ·  escuro 8,35
   Trocar so o `.tes-count` consertaria o numero e deixaria as outras tres divergindo dentro do
   mesmo arquivo, entao vao as quatro. O fallback `#9a3412` saiu junto: fallback de hex existe para
   quando o token pode faltar, e este nao pode — se faltar, o defeito e o token, e ele tem de
   aparecer.
   NAO foi criado `--cat-*-strong` no bloco escuro: isso e camada de token (69 §1.1), afeta as seis
   categorias de uma vez, e o guardiao ainda nao alcanca o `:root`. Fica registrado como divida de
   sistema no roteiro. */
.tes-count {
  display: inline-block;
  margin-left: 4px;
  font-weight: 700;
  color: var(--cat-transferencias-tinta);
}
.tes-list-card {
  overflow: hidden;
}

/* ---- Responsivo (breakpoints do projeto) ---- */
@media (width <= 1024px) {
  .tes-row {
    grid-template-columns: 108px 76px 92px minmax(0, 1fr) 104px 96px;
  }
  /* Usuário, lacre e recebimento ficam compactos para preservar a densidade. */
  .tes-row-head > :nth-child(4),
  .tes-row-head > :nth-child(6),
  .tes-row-head > :nth-child(8),
  .tes-usuario,
  .tes-lacre,
  .tes-receb {
    display: none;
  }
}
@media (width <= 768px) {
  .tes-filtros {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 14px 12px 12px;
  }
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
  .tes-row > [data-col="PDV"] {
    display: none;
  }
  .tes-row > [data-col="Criado por"] {
    display: none;
  }
  .tes-fechamento-resumo__grid {
    grid-template-columns: 1fr;
  }
  .tes-fechamento-resumo__observacao {
    grid-column: auto;
  }
  .tes-anexos summary {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .tes-anexos summary small {
    flex-basis: 100%;
    margin-left: 0;
  }
  .tes-conferencia-card {
    padding: 14px !important;
  }
  .tes-conferencia-card__title {
    font-size: 18px;
  }
  .tes-conferencia-card :deep(.v-spacer) {
    display: none;
  }
  .tes-conferencia-card :deep(.v-card-actions) {
    justify-content: flex-end;
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
  .tes-filtros {
    grid-template-columns: 1fr;
  }
  .tes-nova {
    width: 100%;
  }
}
</style>
