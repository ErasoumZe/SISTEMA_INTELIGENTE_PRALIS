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
import { formatarDataSomenteDia } from "~/utils/formatacao";
import MercadoriasAprovacaoPanel from "~/components/financeiro/MercadoriasAprovacaoPanel.vue";
import VendaDetalheDialog from "~/components/financeiro/VendaDetalheDialog.vue";
import VendaDetalheConteudo from "~/components/financeiro/VendaDetalheConteudo.vue";

defineProps<{
  resumo: ResumoCaixa | null;
  telaAtual: ItemMenu | null | undefined;
  telaAtiva: string;
  empresaAtiva: Opcao | null;
  operacoesPaginadas: OperacaoResumo[];
  totalOperacoes: number;
  pagina: number;
  totalPaginas: number;
  descricao: string;
  mostrarFiltroDiscriminacao?: boolean;
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
  (event: "discriminar", entidade: EntidadeOperacional, operacao: OperacaoResumo): void;
  (event: "update:pendentes", valor: boolean): void;
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
function alternarDetalhe(operacao: OperacaoResumo) {
  if (linhaExpandidaId.value === operacao.id) {
    linhaExpandidaId.value = "";
    return;
  }
  linhaExpandidaId.value = operacao.id;
  emit("detalhes", operacao);
}
</script>

<template>
  <div class="operacoes-layout">
    <section v-if="resumo" class="summary-grid" aria-label="Resumo do caixa">
      <article class="summary-card card-entradas">
        <div class="summary-label"><v-icon icon="mdi-cash-plus" size="16" /> Entradas</div>
        <div class="summary-value">{{ dinheiro(resumo.totalEntradas) }}</div>
      </article>
      <article class="summary-card card-transferencias">
        <div class="summary-label"><v-icon icon="mdi-swap-horizontal" size="16" /> Transferencias</div>
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
            <h2>{{ telaAtual?.titulo }}</h2>
            <p>{{ descricao || `Lancamentos da empresa ${empresaAtiva?.nome ?? ""}.` }}</p>
          </div>
          <div class="d-flex flex-column align-end">
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
          <div class="responsive-table-shell">
            <v-table class="operacoes-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descricao</th>
                  <th class="text-right">Valor</th>
                  <th class="text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="operacao in operacoesPaginadas" :key="operacao.id">
                  <tr>
                    <td>{{ formatarDataSomenteDia(operacao.dataReferencia) }}</td>
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
                    <td colspan="4" class="pa-0">
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
                  <td colspan="4" class="text-center text-muted py-8">Nenhum lancamento encontrado.</td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <div v-if="totalOperacoes > 10" class="mt-4 d-flex justify-end align-center ga-2">
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
              Proxima
            </v-btn>
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
  </div>
</template>

<style scoped>
/* Bloco de detalhe da venda expandido inline na linha da tabela. Cinza com alpha para ficar
   discreto e legivel tanto no tema claro quanto no escuro. */
.venda-detalhe-inline {
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  background: rgba(128, 128, 128, 0.04);
}
</style>
