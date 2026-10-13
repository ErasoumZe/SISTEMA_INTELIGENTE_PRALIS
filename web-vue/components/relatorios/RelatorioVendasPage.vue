<script setup lang="ts">
import type { OperacaoResumo, Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import RelatorioVendasFiltros from "./RelatorioVendasFiltros.vue";
import RelatorioVendasLista from "./RelatorioVendasLista.vue";
import VendaDetalheDialog from "./VendaDetalheDialog.vue";
import { filtrosVendasVazios } from "./relatorio-vendas";

const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
  clientes: Opcao[];
  colaboradores: Opcao[];
  formasPagamento: Opcao[];
  turnos?: Opcao[];
}>();

type TotaisVendas = {
  totalGeral: number;
  quantidade: number;
  porFormaPagamento: Array<{ formaPagamento: string; total: number; quantidade: number }>;
};

type Comprovante = {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string;
};

const { apiUrl, apiGet, apiGetPaginado } = useApi();
// A ordem continua no servidor. Ordenar a pagina local de 50 vendas daria uma ordem falsa para o dia inteiro.
const ordem = ref<"asc" | "desc">("asc");
const filtros = reactive(filtrosVendasVazios());
const totais = ref<TotaisVendas | null>(null);
const linhas = ref<OperacaoResumo[]>([]);
const pagina = ref(1);
const itensPorPagina = 50;
const total = ref(0);
const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));
const carregando = ref(false);
const erro = ref("");
const modalAberto = ref(false);
const vendaSelecionada = ref<OperacaoResumo | null>(null);
const detalheVendaAberto = ref(false);
const vendaDetalheSelecionada = ref<OperacaoResumo | null>(null);
const comprovantes = ref<Comprovante[]>([]);
const uploadCarregando = ref(false);
const arquivoInput = ref<File | null>(null);

const formasExibidas = computed(() => totais.value?.porFormaPagamento.slice(0, 5) ?? []);
const formasRestantes = computed(() => Math.max(0, (totais.value?.porFormaPagamento.length ?? 0) - formasExibidas.value.length));

function paramsFiltro() {
  const params = new URLSearchParams({ empresaId: props.empresaId });
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor && chave !== "horaInicio" && chave !== "horaFim") params.set(chave, valor);
  }
  if (filtros.dataInicio && filtros.horaInicio) params.set("dataHoraInicio", `${filtros.dataInicio}T${filtros.horaInicio}-03:00`);
  if (filtros.dataFim && filtros.horaFim) params.set("dataHoraFim", `${filtros.dataFim}T${filtros.horaFim}-03:00`);
  return params;
}

async function buscar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = paramsFiltro();
    params.set("page", String(pagina.value));
    params.set("pageSize", String(itensPorPagina));
    params.set("ordem", ordem.value);
    const resultado = await apiGetPaginado<OperacaoResumo>(`/api/relatorios/vendas?${params.toString()}`);
    linhas.value = resultado.itens;
    total.value = resultado.total;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// Totais do conjunto filtrado completo, e não somente das cinquenta linhas apresentadas.
async function buscarTotais() {
  if (!props.empresaId) return;
  try {
    totais.value = await apiGet<TotaisVendas>(`/api/relatorios/vendas/totais?${paramsFiltro().toString()}`);
  } catch {
    totais.value = null;
  }
}

async function aplicarFiltros() {
  pagina.value = 1;
  await Promise.all([buscar(), buscarTotais()]);
}

function limparFiltros() {
  Object.assign(filtros, filtrosVendasVazios());
  void aplicarFiltros();
}

async function alternarOrdem() {
  ordem.value = ordem.value === "asc" ? "desc" : "asc";
  pagina.value = 1;
  await buscar();
}

async function abrirComprovantes(venda: OperacaoResumo) {
  vendaSelecionada.value = venda;
  modalAberto.value = true;
  comprovantes.value = await apiGet<Comprovante[]>(`/api/vendas/${venda.id}/comprovantes`);
}

async function enviarComprovante() {
  if (!vendaSelecionada.value || !arquivoInput.value) return;
  uploadCarregando.value = true;
  erro.value = "";
  try {
    const formData = new FormData();
    formData.append("arquivo", arquivoInput.value);
    const resposta = await fetch(`${apiUrl}/api/vendas/${vendaSelecionada.value.id}/comprovantes`, {
      method: "POST",
      credentials: "include",
      body: formData
    });
    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(body?.title ?? "Não foi possível enviar o comprovante.");
    }
    arquivoInput.value = null;
    await abrirComprovantes(vendaSelecionada.value);
    await buscar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    uploadCarregando.value = false;
  }
}

function abrirDetalhes(venda: OperacaoResumo) {
  vendaDetalheSelecionada.value = venda;
  detalheVendaAberto.value = true;
}

watch(
  () => props.empresaId,
  () => {
    pagina.value = 1;
    void buscar();
    void buscarTotais();
  },
  { immediate: true }
);
</script>

<template>
  <section class="relatorio-vendas">
    <RelatorioVendasFiltros
      :filtros="filtros"
      :pdvs="pdvs"
      :clientes="clientes"
      :colaboradores="colaboradores"
      :formas-pagamento="formasPagamento"
      :turnos="turnos ?? []"
      :carregando="carregando"
      @update:filtros="Object.assign(filtros, $event)"
      @buscar="aplicarFiltros"
      @limpar="limparFiltros"
    />

    <v-alert v-if="erro" type="error" variant="tonal" class="relatorio-vendas__erro">{{ erro }}</v-alert>

    <section class="resumo-vendas" aria-label="Resumo das vendas filtradas">
      <article class="resumo-vendas__item resumo-vendas__item--total">
        <span>Vendas encontradas</span>
        <strong>{{ total }}</strong>
        <small>registros no resultado atual</small>
      </article>
      <article class="resumo-vendas__item resumo-vendas__item--valor">
        <span>Total recebido</span>
        <strong>{{ totais ? dinheiro(totais.totalGeral) : "—" }}</strong>
        <small>sobre todo o período filtrado</small>
      </article>
      <article class="resumo-vendas__item">
        <span>Formas de pagamento</span>
        <strong>{{ totais?.porFormaPagamento.length ?? "—" }}</strong>
        <small>formas usadas no resultado</small>
      </article>
    </section>

    <section class="resultado-vendas">
      <header class="resultado-vendas__cabecalho">
        <div>
          <span class="resultado-vendas__sobretitulo">Movimentações</span>
          <h2>Vendas do período</h2>
          <p>{{ total }} venda{{ total === 1 ? "" : "s" }} encontrada{{ total === 1 ? "" : "s" }}</p>
        </div>
        <span class="resultado-vendas__ordem">Hora: {{ ordem === "asc" ? "mais antiga primeiro" : "mais recente primeiro" }}</span>
      </header>

      <v-progress-linear v-if="carregando" indeterminate color="primary" aria-label="Atualizando vendas" />
      <RelatorioVendasLista
        :linhas="linhas"
        :ordem="ordem"
        @alternar-ordem="alternarOrdem"
        @ver-detalhes="abrirDetalhes"
        @adicionar-comprovantes="abrirComprovantes"
      />

      <footer v-if="totais" class="totais-vendas">
        <div class="totais-vendas__cabecalho">
          <div>
            <span>Composição recebida</span>
            <strong>{{ dinheiro(totais.totalGeral) }}</strong>
          </div>
          <small>{{ totais.quantidade }} vendas no período filtrado</small>
        </div>
        <div v-if="formasExibidas.length" class="totais-vendas__formas">
          <span v-for="forma in formasExibidas" :key="forma.formaPagamento">
            <b>{{ forma.formaPagamento }}</b>
            {{ dinheiro(forma.total) }} · {{ forma.quantidade }} venda{{ forma.quantidade === 1 ? "" : "s" }}
          </span>
          <span v-if="formasRestantes">+{{ formasRestantes }} outra{{ formasRestantes === 1 ? "" : "s" }} forma{{ formasRestantes === 1 ? "" : "s" }}</span>
        </div>
      </footer>

      <div v-if="totalPaginas > 1" class="resultado-vendas__paginacao">
        <v-pagination v-model="pagina" :length="totalPaginas" :total-visible="5" @update:model-value="buscar" />
      </div>
    </section>

    <VendaDetalheDialog v-model="detalheVendaAberto" :venda="vendaDetalheSelecionada" />

    <v-dialog v-model="modalAberto" max-width="680" persistent no-click-animation>
      <v-card>
        <v-card-title>Comprovantes</v-card-title>
        <v-card-subtitle>{{ vendaSelecionada?.descricao }}</v-card-subtitle>
        <v-card-text>
          <v-file-input v-model="arquivoInput" label="Imagem ou PDF" accept="image/*,.pdf,application/pdf" />
          <v-btn color="primary" prepend-icon="mdi-upload" :loading="uploadCarregando" :disabled="!arquivoInput" @click="enviarComprovante">
            Enviar
          </v-btn>
          <v-list class="mt-4" density="compact">
            <v-list-item
              v-for="comprovante in comprovantes"
              :key="comprovante.id"
              :title="comprovante.nomeOriginal"
              :subtitle="`${comprovante.mimeType} - ${Math.round(comprovante.tamanhoBytes / 1024)} KB`"
            />
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" @click="modalAberto = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.relatorio-vendas { display: grid; gap: 18px; }
.relatorio-vendas__erro { margin: 0; }
.resumo-vendas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.resumo-vendas__item { display: grid; gap: 3px; min-width: 0; padding: 16px 18px; border: 1px solid var(--cx-line); border-radius: 14px; background: var(--cx-surface-raised); color: var(--cx-ink); }
.resumo-vendas__item > span, .resumo-vendas__item small { color: var(--cx-ink-soft); font-size: 12px; font-weight: 700; }
.resumo-vendas__item strong { font-size: 21px; font-variant-numeric: tabular-nums; }
.resumo-vendas__item--total { border-inline-start: 4px solid var(--cat-entradas); }
.resumo-vendas__item--valor { border-inline-start: 4px solid var(--cat-transferencias); }
.resultado-vendas { overflow: hidden; border: 1px solid var(--cx-line); border-radius: 16px; background: var(--cx-surface-raised); }
.resultado-vendas__cabecalho { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 16px; }
.resultado-vendas__sobretitulo { color: var(--cx-ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.resultado-vendas h2 { margin: 3px 0 2px; color: var(--cx-ink); font-size: 19px; }
.resultado-vendas p, .resultado-vendas__ordem { margin: 0; color: var(--cx-ink-soft); font-size: 13px; }
.resultado-vendas__ordem { padding-top: 10px; text-align: right; }
.totais-vendas { display: grid; gap: 12px; margin: 12px; padding: 16px; border-radius: 12px; background: var(--cx-surface-sunken); color: var(--cx-ink); }
.totais-vendas__cabecalho { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.totais-vendas__cabecalho span { display: block; color: var(--cx-ink-soft); font-size: 12px; font-weight: 700; }
.totais-vendas__cabecalho strong { font-size: 18px; }
.totais-vendas__cabecalho small { color: var(--cx-ink-soft); }
.totais-vendas__formas { display: flex; flex-wrap: wrap; gap: 8px; }
.totais-vendas__formas > span { padding: 6px 9px; border: 1px solid var(--cx-line); border-radius: 999px; color: var(--cx-ink-soft); font-size: 12px; }
.totais-vendas__formas b { color: var(--cx-ink); }
.resultado-vendas__paginacao { display: flex; justify-content: center; padding: 8px 16px 16px; }
@media (width <= 768px) { .resumo-vendas { grid-template-columns: 1fr; gap: 8px; } .resultado-vendas { overflow: visible; border: 0; border-radius: 0; background: transparent; } .resultado-vendas__cabecalho { padding: 4px 0 10px; } .resultado-vendas__ordem { display: none; } .totais-vendas { margin: 8px 0 0; } }
@media (width <= 390px) { .relatorio-vendas { gap: 14px; } .resumo-vendas__item { padding: 14px; } .totais-vendas { padding: 14px; } .totais-vendas__cabecalho { display: grid; gap: 4px; } }
</style>
