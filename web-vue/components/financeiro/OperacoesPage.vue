<script setup lang="ts">
import type {
  EntidadeOperacional,
  ItemMenu,
  MercadoriaAprovacao,
  OperacaoResumo,
  Opcao,
  ResumoCaixa
} from "~/types/padaria";
import type { OperacaoDetalhe } from "~/utils/operacoes";
import { ref } from "vue";
import { dinheiro } from "~/utils/domain";
import { formatarDataHora, formatarDataSomenteDia } from "~/utils/formatacao";
import MercadoriasAprovacaoPanel from "~/components/financeiro/MercadoriasAprovacaoPanel.vue";
import VendaDetalheDialog from "~/components/financeiro/VendaDetalheDialog.vue";
import VendaDetalheConteudo from "~/components/financeiro/VendaDetalheConteudo.vue";

const props = defineProps<{
  resumo: ResumoCaixa | null;
  telaAtual: ItemMenu | null | undefined;
  telaAtiva: string;
  empresaAtiva: Opcao | null;
  operacoesPaginadas: OperacaoResumo[];
  totalOperacoes: number;
  // Soma em dinheiro do filtro INTEIRO (S6). null quando a listagem nao manda (so Entradas manda).
  totalLiquidoOperacoes?: number | null;
  // Dia listado pela tela de Entradas ("yyyy-MM-dd"). Vazio nas demais telas, que nao recortam por dia.
  diaEntradas?: string;
  // Falso para o perfil preso ao caixa aberto: o servidor forca o dia do caixa, entao o campo fica
  // visivel (para ele saber QUAL dia esta vendo) mas desabilitado.
  podeConsultarOutrosDiasEntradas?: boolean;
  pagina: number;
  totalPaginas: number;
  descricao: string;
  mostrarFiltroDiscriminacao?: boolean;
  mostrarFiltrosSaidas?: boolean;
  filtrosSaidas?: { dataInicio: string; dataFim: string; pdvId: string; status: string };
  pdvs?: Opcao[];
  pendentesDiscriminacaoAtivo?: boolean;
  podeDiscriminar?: boolean;
  mostrarAprovacaoMercadorias?: boolean;
  aprovacaoMercadoriasAtiva?: boolean;
  mercadoriasAguardando?: MercadoriaAprovacao[];
  aprovacaoMercadoriasCarregando?: boolean;
  aprovacaoMercadoriaSalvandoId?: string;
  podeEditarEntrada?: boolean;
  formasPagamento?: Opcao[];
  vendaDetalhe?: OperacaoDetalhe | null;
  modalVendaDetalheAberto?: boolean;
  vendaDetalheCarregando?: boolean;
}>();

const emit = defineEmits<{
  (event: "editar", entidade: EntidadeOperacional, operacao: OperacaoResumo): void;
  (event: "update:pagina", pagina: number): void;
  (event: "update:dia", dia: string): void;
  (event: "discriminar", entidade: EntidadeOperacional, operacao: OperacaoResumo): void;
  (event: "update:pendentes", valor: boolean): void;
  (
    event: "update:filtrosSaidas",
    filtros: { dataInicio: string; dataFim: string; pdvId: string; status: string }
  ): void;
  (event: "update:aprovacao", valor: boolean): void;
  (event: "aprovar", id: string, computar: boolean): void;
  (event: "recusar", id: string): void;
  (event: "detalhes", operacao: OperacaoResumo): void;
  (event: "update:vendaDetalheAberto", valor: boolean): void;
}>();

function entidadeDaTela(tela: string): EntidadeOperacional {
  if (tela === "despesas") return "despesa";
  if (tela === "mercadorias") return "mercadoria";
  if (tela === "retiradas") return "retirada";
  if (tela === "transferencias") return "transferencia";
  return "venda";
}

// Detalhe da venda exibido INLINE (expandir/colapsar a linha), no lugar de um botao "Detalhes".
// Reusa o GET de detalhe ja existente via o evento "detalhes"; uma linha aberta por vez (o pai
// mantem um unico vendaDetalhe carregado).
const linhaExpandidaId = ref("");
const observacaoAberta = ref<OperacaoResumo | null>(null);
function alternarDetalhe(operacao: OperacaoResumo) {
  if (linhaExpandidaId.value === operacao.id) {
    linhaExpandidaId.value = "";
    return;
  }
  linhaExpandidaId.value = operacao.id;
  emit("detalhes", operacao);
}

function rotuloStatus(status: string) {
  if (status === "aprovado") return "Aprovado";
  if (status === "aguardando_aprovacao") return "Aguardando aprovacao";
  if (status === "cancelado") return "Cancelado";
  return status || "Nao informado";
}

function corStatus(status: string) {
  if (status === "aprovado") return "success";
  if (status === "aguardando_aprovacao") return "warning";
  if (status === "cancelado") return "error";
  return "default";
}

function atualizarFiltroSaidas(campo: "dataInicio" | "dataFim" | "pdvId" | "status", valor: unknown) {
  emit("update:filtrosSaidas", { ...props.filtrosSaidas, [campo]: String(valor ?? "") });
}

function limparFiltrosSaidas() {
  emit("update:filtrosSaidas", { dataInicio: "", dataFim: "", pdvId: "", status: "" });
}
</script>

<template>
  <div class="operacoes-layout">
    <!-- Titulo da tela sobe para o topo da pagina (VIS-10, D-04): antes ele vivia dentro do card
         da tabela, abaixo dos cards de resumo, e a tela abria sem dizer onde voce esta. O texto e
         o mesmo que estava la. O totalizador do dia CONTINUA no cabecalho da tabela, porque ele
         descreve a listagem, nao a tela. -->
    <AppCabecalhoTela
      :titulo="telaAtual?.titulo ?? ''"
      :subtitulo="descricao || `Lançamentos da empresa ${empresaAtiva?.nome ?? ''}.`"
    />

    <section v-if="resumo" class="summary-grid" aria-label="Resumo do caixa">
      <article class="summary-card card-entradas">
        <div class="summary-label"><v-icon icon="mdi-cash-plus" size="16" /> Entradas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalEntradas) }}</div>
      </article>
      <article class="summary-card card-transferencias">
        <div class="summary-label"><v-icon icon="mdi-swap-horizontal" size="16" /> Transferências</div>
        <div class="summary-value">{{ dinheiro(resumo.totalTransferencias) }}</div>
      </article>
      <article class="summary-card card-despesas">
        <div class="summary-label"><v-icon icon="mdi-receipt-text" size="16" /> Despesas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalDespesas) }}</div>
      </article>
      <article class="summary-card card-retiradas">
        <div class="summary-label"><v-icon icon="mdi-wallet" size="16" /> Retiradas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalRetiradas) }}</div>
      </article>
      <article class="summary-card card-saldo">
        <div class="summary-label"><v-icon icon="mdi-currency-usd" size="16" /> Saldo</div>
        <div class="summary-value">{{ dinheiro(resumo.saldo) }}</div>
      </article>
    </section>

    <v-card class="svelte-table-card">
      <v-card-text>
        <div class="table-heading d-flex align-start justify-space-between ga-4 flex-wrap">
          <div>
            <!-- Titulo e descricao subiram para o AppCabecalhoTela, no topo da pagina (VIS-10).
                 Aqui fica so o que descreve a LISTAGEM. -->
            <!-- Totalizador do DIA (S6): soma do filtro inteiro, nao da pagina. Quem confere o dia
                 precisa do total do dia — a pagina e so um recorte. -->
            <p v-if="totalLiquidoOperacoes !== null && totalLiquidoOperacoes !== undefined" class="op-totalizador">
              <strong>{{ totalOperacoes }}</strong>
              {{ totalOperacoes === 1 ? "entrada" : "entradas" }} em {{ formatarDataSomenteDia(diaEntradas) }} ·
              <strong>R$ {{ dinheiro(totalLiquidoOperacoes) }}</strong>
            </p>
          </div>
          <div class="d-flex flex-column align-end ga-2">
            <!-- Filtro de data (S6): consulta outros dias. Para o perfil preso ao caixa aberto o
                 servidor forca o dia do caixa, entao o campo aparece so para ele saber QUAL dia
                 esta vendo — desabilitado, com o motivo escrito. -->
            <v-text-field
              v-if="diaEntradas"
              :model-value="diaEntradas"
              type="date"
              label="Dia"
              density="compact"
              variant="outlined"
              hide-details
              class="op-filtro-dia"
              :disabled="!podeConsultarOutrosDiasEntradas"
              :title="
                podeConsultarOutrosDiasEntradas
                  ? 'Consultar as entradas de outro dia'
                  : 'Seu perfil ve somente o dia do caixa aberto.'
              "
              @update:model-value="emit('update:dia', String($event ?? ''))"
            />
            <v-switch
              v-if="mostrarAprovacaoMercadorias"
              :model-value="aprovacaoMercadoriasAtiva"
              label="Aguardando aprovacao (NF-e)"
              color="primary"
              density="compact"
              hide-details
              @update:model-value="emit('update:aprovacao', Boolean($event))"
            />
            <v-switch
              v-if="mostrarFiltroDiscriminacao && !aprovacaoMercadoriasAtiva"
              :model-value="pendentesDiscriminacaoAtivo"
              label="Somente pendentes de discriminacao"
              color="warning"
              density="compact"
              hide-details
              @update:model-value="emit('update:pendentes', Boolean($event))"
            />
          </div>
        </div>

        <MercadoriasAprovacaoPanel
          v-if="aprovacaoMercadoriasAtiva"
          :itens="mercadoriasAguardando ?? []"
          :carregando="aprovacaoMercadoriasCarregando"
          :salvando-id="aprovacaoMercadoriaSalvandoId"
          @aprovar="(id, computar) => emit('aprovar', id, computar)"
          @recusar="(id) => emit('recusar', id)"
        />

        <template v-else>
          <v-row v-if="mostrarFiltrosSaidas" dense class="mb-3">
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                :model-value="filtrosSaidas?.dataInicio ?? ''"
                type="date"
                label="Data inicial"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="atualizarFiltroSaidas('dataInicio', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                :model-value="filtrosSaidas?.dataFim ?? ''"
                type="date"
                label="Data final"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="atualizarFiltroSaidas('dataFim', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                :model-value="filtrosSaidas?.pdvId ?? ''"
                :items="pdvs ?? []"
                item-title="nome"
                item-value="id"
                label="PDV"
                density="compact"
                variant="outlined"
                clearable
                hide-details
                @update:model-value="atualizarFiltroSaidas('pdvId', $event)"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3" class="d-flex ga-2">
              <v-select
                :model-value="filtrosSaidas?.status ?? ''"
                :items="[
                  { title: 'Todos os status', value: '' },
                  { title: 'Aprovado', value: 'aprovado' },
                  { title: 'Aguardando aprovação', value: 'aguardando_aprovacao' },
                  { title: 'Cancelado', value: 'cancelado' }
                ]"
                label="Status"
                density="compact"
                variant="outlined"
                hide-details
                class="flex-grow-1"
                @update:model-value="atualizarFiltroSaidas('status', $event)"
              />
              <v-btn variant="text" size="small" @click="limparFiltrosSaidas">Limpar</v-btn>
            </v-col>
          </v-row>
          <div class="responsive-table-shell">
            <v-table class="operacoes-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>PDV</th>
                  <th>Para o que / observação</th>
                  <th>Registrado por</th>
                  <th>Status</th>
                  <th class="text-right">Valor</th>
                  <th class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="operacao in operacoesPaginadas" :key="operacao.id">
                  <tr>
                    <td>
                      <div>{{ formatarDataSomenteDia(operacao.dataReferencia) }}</div>
                      <div v-if="operacao.criadoEm" class="text-caption text-medium-emphasis">
                        {{ formatarDataHora(operacao.criadoEm) }}
                      </div>
                    </td>
                    <td>{{ operacao.pdvNome || "Retaguarda" }}</td>
                    <td class="font-weight-bold">
                      {{ operacao.descricao }}
                      <v-chip
                        v-if="operacao.pendenteDiscriminacao"
                        size="x-small"
                        color="warning"
                        variant="tonal"
                        class="ml-2"
                      >
                        Pendente de discriminacao
                      </v-chip>
                      <v-icon
                        v-if="operacao.fotoDocumentoUrl"
                        icon="mdi-paperclip"
                        size="small"
                        class="ml-1 text-medium-emphasis"
                        title="Documento anexado"
                      />
                      <v-btn
                        v-if="
                          ['despesas', 'mercadorias', 'retiradas'].includes(telaAtiva) &&
                          operacao.observacao &&
                          operacao.observacao !== operacao.descricao
                        "
                        size="x-small"
                        variant="text"
                        prepend-icon="mdi-note-text-outline"
                        class="mt-1 px-0"
                        @click="observacaoAberta = operacao"
                      >
                        Ver observação
                      </v-btn>
                    </td>
                    <td>{{ operacao.criadoPorNome || "Não informado" }}</td>
                    <td>
                      <v-chip :color="corStatus(operacao.status)" size="x-small" variant="tonal">
                        {{ rotuloStatus(operacao.status) }}
                      </v-chip>
                    </td>
                    <td class="text-right font-weight-bold">{{ dinheiro(operacao.valorOriginal) }}</td>
                    <td class="text-right">
                      <div class="d-inline-flex ga-2 justify-end align-center">
                        <v-btn
                          v-if="operacao.pendenteDiscriminacao && podeDiscriminar"
                          size="small"
                          variant="tonal"
                          color="warning"
                          prepend-icon="mdi-format-list-checks"
                          @click="emit('discriminar', entidadeDaTela(telaAtiva), operacao)"
                        >
                          Discriminar
                        </v-btn>
                        <v-btn
                          v-if="telaAtiva !== 'entradas' || podeEditarEntrada"
                          size="small"
                          variant="tonal"
                          prepend-icon="mdi-pencil"
                          @click="emit('editar', entidadeDaTela(telaAtiva), operacao)"
                        >
                          Editar
                        </v-btn>
                        <v-btn
                          v-if="telaAtiva === 'entradas'"
                          size="small"
                          variant="text"
                          :icon="linhaExpandidaId === operacao.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                          :title="linhaExpandidaId === operacao.id ? 'Ocultar detalhes' : 'Ver detalhes'"
                          @click="alternarDetalhe(operacao)"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr v-if="telaAtiva === 'entradas' && linhaExpandidaId === operacao.id">
                    <td colspan="7" class="pa-0">
                      <div class="venda-detalhe-inline pa-4">
                        <VendaDetalheConteudo
                          :detalhe="vendaDetalhe ?? null"
                          :carregando="vendaDetalheCarregando"
                          :formas-pagamento="formasPagamento"
                        />
                      </div>
                    </td>
                  </tr>
                </template>
                <tr v-if="!operacoesPaginadas.length">
                  <td colspan="7" class="text-center text-muted py-8">
                    <span class="tabela-vazio">Nenhum lancamento encontrado.</span>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <!-- Mostra o controle quando ha mais de uma pagina — comparar com um 10 fixo escondia a
               paginacao desde que o tamanho da pagina virou 50. -->
          <div v-if="totalPaginas > 1" class="mt-4 d-flex justify-space-between align-center ga-2">
            <span class="text-caption text-medium-emphasis">
              Mostrando {{ operacoesPaginadas.length }} de {{ totalOperacoes }}
            </span>
            <div class="d-flex align-center ga-2">
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
          </div>
        </template>
      </v-card-text>
    </v-card>

    <VendaDetalheDialog
      :aberto="Boolean(modalVendaDetalheAberto)"
      :detalhe="vendaDetalhe ?? null"
      :carregando="vendaDetalheCarregando"
      :formas-pagamento="formasPagamento"
      @update:aberto="emit('update:vendaDetalheAberto', $event)"
    />

    <v-dialog
      :model-value="Boolean(observacaoAberta)"
      max-width="560"
      @update:model-value="(aberto) => !aberto && (observacaoAberta = null)"
    >
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-note-text-outline" />
          Observação
        </v-card-title>
        <v-card-text class="text-pre-wrap">{{ observacaoAberta?.observacao }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="observacaoAberta = null">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
/* Bloco de detalhe da venda expandido inline na linha da tabela. Cinza com alpha para ficar
   discreto e legivel tanto no tema claro quanto no escuro. */
.venda-detalhe-inline {
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  background: rgba(128, 128, 128, 0.04);
}
/* Totalizador do dia: destaque discreto, logo abaixo da descricao da tela. */
.op-totalizador {
  margin-top: 4px;
  font-size: 13px;
}
/* Filtro de data: estreito o bastante para nao competir com o titulo da tela. */
.op-filtro-dia {
  min-width: 170px;
  max-width: 190px;
}
</style>
