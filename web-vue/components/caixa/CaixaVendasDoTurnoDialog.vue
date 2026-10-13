<script setup lang="ts">
import type { OperacaoResumo, Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

type Totais = {
  totalGeral: number;
  quantidade: number;
  porFormaPagamento: Array<{ formaPagamento: string; total: number; quantidade: number }>;
};
type MetaConsulta = {
  totais: Totais;
  abertura: string;
  limiteSuperior: string;
  manuaisSemHorarioForaDoFiltro: boolean;
};

const props = withDefaults(
  defineProps<{
    aberto: boolean;
    caixaId: string;
    formasPagamento: Opcao[];
    relatorioFechamento?: boolean;
  }>(),
  { relatorioFechamento: false }
);
const emit = defineEmits<{ (event: "update:aberto", valor: boolean): void }>();
const { apiGetPaginado } = useApi();

const filtros = reactive({ produto: "", formaPagamentoId: "", dataHoraInicio: "", dataHoraFim: "" });
const linhas = ref<OperacaoResumo[]>([]);
const total = ref(0);
const totais = ref<Totais | null>(null);
const intervalo = ref<{ abertura: string; limiteSuperior: string } | null>(null);
const carregando = ref(false);
const erro = ref("");
const pagina = ref(1);
const porPagina = 20;
let consultaAtual = 0;

const dialogAberto = computed({
  get: () => props.aberto,
  set: (valor: boolean) => emit("update:aberto", valor)
});
const temFiltroHorario = computed(() => Boolean(filtros.dataHoraInicio || filtros.dataHoraFim));
const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / porPagina)));
const formasUsadas = computed(() => totais.value?.porFormaPagamento ?? []);

function horaDaVenda(venda: OperacaoResumo) {
  return venda.dataVenda ? formatarDataHora(venda.dataVenda) : "Sem horário (venda manual)";
}

function nomePagamento(venda: OperacaoResumo) {
  const nomes = venda.pagamentos
    ?.map((pagamento) => pagamento.formaPagamentoNome?.trim() || pagamento.tipoPagamentoAutomacao?.trim())
    .filter((nome): nome is string => Boolean(nome));
  return nomes?.length ? nomes.join(" · ") : "Forma não informada";
}

function paraIso(valor: string) {
  if (!valor) return "";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString();
}

async function buscar() {
  if (!props.caixaId) return;
  const consulta = ++consultaAtual;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({ page: String(pagina.value), pageSize: String(porPagina) });
    if (filtros.produto.trim()) params.set("produto", filtros.produto.trim());
    if (filtros.formaPagamentoId) params.set("formaPagamentoId", filtros.formaPagamentoId);
    const inicio = paraIso(filtros.dataHoraInicio);
    const fim = paraIso(filtros.dataHoraFim);
    if (inicio) params.set("dataHoraInicio", inicio);
    if (fim) params.set("dataHoraFim", fim);
    const resposta = await apiGetPaginado<OperacaoResumo, MetaConsulta>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/vendas?${params.toString()}`
    );
    if (consulta !== consultaAtual) return;
    linhas.value = resposta.itens;
    total.value = resposta.total;
    totais.value = resposta.meta?.totais ?? null;
    intervalo.value = resposta.meta
      ? { abertura: resposta.meta.abertura, limiteSuperior: resposta.meta.limiteSuperior }
      : null;
  } catch (falha) {
    if (consulta !== consultaAtual) return;
    linhas.value = [];
    total.value = 0;
    totais.value = null;
    erro.value = mensagemErro(falha);
  } finally {
    if (consulta === consultaAtual) carregando.value = false;
  }
}

function aplicarFiltros() {
  pagina.value = 1;
  void buscar();
}

function limparFiltros() {
  Object.assign(filtros, { produto: "", formaPagamentoId: "", dataHoraInicio: "", dataHoraFim: "" });
  aplicarFiltros();
}

watch(
  () => [props.aberto, props.caixaId] as const,
  ([aberto]) => {
    if (aberto) {
      pagina.value = 1;
      void buscar();
    }
  }
);
</script>

<template>
  <v-dialog v-model="dialogAberto" max-width="1100" scrollable>
    <v-card class="consulta-turno">
      <v-card-title class="consulta-turno__titulo">
        <div>
          <span class="consulta-turno__sobretitulo">
            {{ relatorioFechamento ? "Relatório do período encerrado" : "Consulta do turno atual" }}
          </span>
          <h2>{{ relatorioFechamento ? "Vendas do fechamento" : "Vendas do caixa" }}</h2>
          <p v-if="intervalo">
            PDV deste caixa · de {{ formatarDataHora(intervalo.abertura) }} até
            {{ formatarDataHora(intervalo.limiteSuperior) }}
          </p>
        </div>
        <v-btn icon="mdi-close" variant="text" aria-label="Fechar consulta de vendas" @click="dialogAberto = false" />
      </v-card-title>

      <v-card-text class="consulta-turno__conteudo">
        <section class="consulta-turno__filtros" aria-label="Filtros das vendas deste caixa">
          <v-text-field
            v-model="filtros.produto"
            label="Produto"
            prepend-inner-icon="mdi-package-variant"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            @keyup.enter="aplicarFiltros"
          />
          <v-select
            v-model="filtros.formaPagamentoId"
            :items="formasPagamento"
            item-title="nome"
            item-value="id"
            label="Forma de pagamento"
            prepend-inner-icon="mdi-credit-card-outline"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
          />
          <v-text-field
            v-if="!relatorioFechamento"
            v-model="filtros.dataHoraInicio"
            type="datetime-local"
            label="A partir de"
            density="comfortable"
            variant="outlined"
            hide-details
          />
          <v-text-field
            v-if="!relatorioFechamento"
            v-model="filtros.dataHoraFim"
            type="datetime-local"
            label="Até"
            density="comfortable"
            variant="outlined"
            hide-details
          />
          <div class="consulta-turno__acoes">
            <v-btn variant="text" :disabled="carregando" @click="limparFiltros">Limpar</v-btn>
            <v-btn
              class="consulta-turno__filtrar"
              prepend-icon="mdi-magnify"
              :loading="carregando"
              @click="aplicarFiltros"
              >Filtrar</v-btn
            >
          </div>
        </section>

        <v-alert v-if="temFiltroHorario" type="info" variant="tonal" density="compact">
          Vendas manuais sem horário registrado não aparecem quando o filtro de horário está ativo.
        </v-alert>
        <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>

        <section class="consulta-turno__resumo" aria-label="Resumo das vendas filtradas">
          <div>
            <span>Vendas encontradas</span><strong>{{ total }}</strong>
          </div>
          <div>
            <span>Total recebido</span><strong>{{ totais ? dinheiro(totais.totalGeral) : "—" }}</strong>
          </div>
          <div>
            <span>Formas usadas</span><strong>{{ formasUsadas.length }}</strong>
          </div>
        </section>

        <v-progress-linear v-if="carregando" indeterminate class="consulta-turno__progresso" />
        <v-alert v-else-if="!linhas.length && !erro" type="info" variant="tonal">
          Nenhuma venda aprovada deste Caixa corresponde aos filtros.
        </v-alert>

        <v-expansion-panels v-else variant="accordion" class="consulta-turno__lista">
          <v-expansion-panel v-for="venda in linhas" :key="venda.id">
            <v-expansion-panel-title>
              <div class="consulta-turno__linha">
                <div>
                  <strong>{{ venda.descricao }}</strong>
                  <span>{{ horaDaVenda(venda) }} · {{ nomePagamento(venda) }}</span>
                </div>
                <strong>{{ dinheiro(Number(venda.valorLiquido ?? venda.valorOriginal)) }}</strong>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div v-if="venda.itensVenda?.length" class="consulta-turno__produtos">
                <span v-for="item in venda.itensVenda" :key="`${venda.id}-${item.descricaoProduto}`">
                  {{ item.quantidade }}× {{ item.descricaoProduto }} · {{ dinheiro(item.valorTotal) }}
                </span>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis mb-0">Sem produtos detalhados nesta venda.</p>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-pagination
          v-if="totalPaginas > 1"
          v-model="pagina"
          :length="totalPaginas"
          :total-visible="5"
          @update:model-value="buscar"
        />
      </v-card-text>
      <v-card-actions class="px-6 pb-5"
        ><v-spacer /><v-btn variant="outlined" @click="dialogAberto = false">Fechar</v-btn></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>

<style scoped>
.consulta-turno {
  --consulta-entradas-cor: #f4ea45;
  color: var(--cx-ink);
  background: var(--cx-surface);
  border-top: 4px solid var(--consulta-entradas-cor);
}
.consulta-turno__titulo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid var(--cx-line);
}
.consulta-turno__titulo h2,
.consulta-turno__titulo p {
  margin: 0;
}
.consulta-turno__titulo h2 {
  margin-top: 3px;
  font-size: 22px;
}
.consulta-turno__titulo p,
.consulta-turno__sobretitulo {
  color: var(--cat-entradas-tinta);
  color: var(--cx-ink-soft);
  font-size: 13px;
}
.consulta-turno__sobretitulo {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.consulta-turno__conteudo {
  display: grid;
  gap: 16px;
  padding: 20px 24px;
}
.consulta-turno__filtros {
  display: grid;
  grid-template-columns: 1.1fr 1.1fr 1fr 1fr auto;
  gap: 10px;
  align-items: start;
}
.consulta-turno__acoes {
  display: flex;
  gap: 6px;
  min-height: 48px;
  align-items: center;
}
.consulta-turno__filtrar {
  background: var(--consulta-entradas-cor) !important;
  color: #241a00 !important;
}
.consulta-turno__progresso :deep(.v-progress-linear__indeterminate) {
  background: var(--consulta-entradas-cor);
}
.consulta-turno__resumo {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.consulta-turno__resumo > div {
  display: grid;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--consulta-entradas-cor) 32%, var(--cx-line));
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-raised);
}
.consulta-turno__resumo span {
  color: var(--cx-ink-soft);
  font-size: 12px;
  font-weight: 700;
}
.consulta-turno__resumo strong {
  font-size: 18px;
}
.consulta-turno__linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
}
.consulta-turno__linha > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.consulta-turno__linha span {
  overflow: hidden;
  color: var(--cx-ink-soft);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.consulta-turno__linha > strong {
  white-space: nowrap;
}
.consulta-turno__produtos {
  display: grid;
  gap: 6px;
  color: var(--cx-ink-soft);
  font-size: 13px;
}
@media (width <= 900px) {
  .consulta-turno__filtros {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .consulta-turno__acoes {
    justify-content: flex-end;
  }
}
@media (width <= 600px) {
  .consulta-turno__titulo {
    padding: 18px 16px 14px;
  }
  .consulta-turno__conteudo {
    padding: 16px;
  }
  .consulta-turno__filtros,
  .consulta-turno__resumo {
    grid-template-columns: 1fr;
  }
  .consulta-turno__acoes {
    justify-content: stretch;
  }
  .consulta-turno__acoes :deep(.v-btn) {
    flex: 1;
  }
  .consulta-turno__linha {
    gap: 8px;
  }
  .consulta-turno__linha > strong {
    font-size: 14px;
  }
}
</style>
