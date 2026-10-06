<script setup lang="ts">
import type { VendaCanceladaCaixa } from "@padaria/shared";
import { normalizarTotaisRelatorioVendas, type TotaisRelatorioVendas } from "~/utils/caixa-fechamento";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

type DadosRelatorioVendas = { vendas: TotaisRelatorioVendas; canceladas: VendaCanceladaCaixa[] };
type RelatorioGerado = {
  periodoInicio: string;
  periodoFim: string;
  dados: DadosRelatorioVendas;
  geradoEm: string;
};

const props = defineProps<{ caixaId: string }>();
const { apiGet, apiPost } = useApi();

const carregando = ref(false);
const erro = ref("");
const gerado = ref(false);
const totais = ref<ReturnType<typeof normalizarTotaisRelatorioVendas> | null>(null);
const intervalo = ref<{ abertura: string; fechamento: string } | null>(null);
const canceladas = ref<VendaCanceladaCaixa[]>([]);
let consultaAtual = 0;
const totaisPorForma = computed(() => totais.value?.porFormaPagamento ?? []);

function aplicarRelatorio(relatorio: RelatorioGerado) {
  totais.value = normalizarTotaisRelatorioVendas(relatorio.dados.vendas);
  intervalo.value = { abertura: relatorio.periodoInicio, fechamento: relatorio.periodoFim };
  canceladas.value = relatorio.dados.canceladas;
  gerado.value = true;
}

async function carregarRelatorioExistente() {
  if (!props.caixaId) return;
  const consulta = ++consultaAtual;
  try {
    const relatorio = await apiGet<RelatorioGerado | null>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/relatorio-vendas`
    );
    if (consulta !== consultaAtual || !relatorio) return;
    aplicarRelatorio(relatorio);
  } catch {
    // A leitura do rascunho salvo não pode bloquear a geração manual do relatório.
  }
}

async function gerarRelatorio() {
  if (!props.caixaId) return;
  consultaAtual += 1;
  carregando.value = true;
  erro.value = "";
  try {
    const relatorio = await apiPost<RelatorioGerado>(
      `/api/caixa/${encodeURIComponent(props.caixaId)}/relatorio-vendas`,
      {}
    );
    aplicarRelatorio(relatorio);
  } catch (falha) {
    totais.value = null;
    intervalo.value = null;
    canceladas.value = [];
    gerado.value = false;
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.caixaId,
  () => void carregarRelatorioExistente(),
  { immediate: true }
);
</script>

<template>
  <section class="relatorio-vendas" aria-labelledby="vendas-turno-titulo">
    <div class="relatorio-vendas__cabecalho">
      <div>
        <span class="relatorio-vendas__sobretitulo">Etapa 2 · vendas</span>
        <h3 id="vendas-turno-titulo">Vendas do turno</h3>
        <p>Consolide os pagamentos e as vendas canceladas deste caixa.</p>
      </div>
      <v-btn
        class="relatorio-vendas__gerar"
        color="primary"
        prepend-icon="mdi-file-chart-outline"
        :loading="carregando"
        data-teste="gerar-relatorio-vendas"
        @click="gerarRelatorio"
      >
        Gerar relatório de vendas
      </v-btn>
    </div>

    <v-alert v-if="erro" type="error" density="compact" class="mt-4">{{ erro }}</v-alert>

    <template v-if="gerado && totais">
      <v-alert type="success" variant="tonal" density="comfortable" class="mt-4">
        <strong>Relatório atualizado.</strong>
        <span v-if="intervalo" class="d-block text-body-2 mt-1">
          {{ formatarDataHora(intervalo.abertura) }} até {{ formatarDataHora(intervalo.fechamento) }}
        </span>
      </v-alert>

      <div class="relatorio-vendas__indicadores mt-4">
        <article class="relatorio-vendas__indicador--quantidade">
          <span>Aprovadas</span>
          <strong>{{ totais.quantidade }}</strong>
        </article>
        <article class="relatorio-vendas__indicador--total">
          <span>Total aprovado</span>
          <strong>{{ dinheiro(totais.totalGeral) }}</strong>
        </article>
        <article class="relatorio-vendas__indicador--canceladas">
          <span>Canceladas</span>
          <strong>{{ canceladas.length }}</strong>
          <small>Ficam fora do total.</small>
        </article>
      </div>

      <section class="relatorio-vendas__formas mt-4" aria-label="Totais por tipo de recebimento">
        <div class="d-flex align-center justify-space-between ga-3 flex-wrap mb-3">
          <h4>Pagamentos aprovados</h4>
          <span class="text-caption text-medium-emphasis">Por forma de pagamento</span>
        </div>
        <div v-if="totaisPorForma.length" class="relatorio-vendas__formas-lista">
          <div
            v-for="forma in totaisPorForma"
            :key="forma.formaPagamento"
            class="relatorio-vendas__forma"
            :class="`relatorio-vendas__forma--${forma.categoriaFechamentoCaixa ?? 'outros'}`"
          >
            <span>{{ forma.formaPagamento }}</span>
            <strong>{{ dinheiro(forma.total) }}</strong>
            <small>{{ forma.quantidade }} venda{{ forma.quantidade === 1 ? "" : "s" }}</small>
          </div>
        </div>
        <p v-else class="text-body-2 text-medium-emphasis mb-0">Nenhuma forma de pagamento foi informada.</p>
      </section>

      <CaixaFechamentoRelatorioVendasDetalhes :canceladas="canceladas" />
    </template>

    <v-alert v-else-if="!carregando" type="info" variant="tonal" class="mt-4">
      Gere o relatório para consolidar os valores deste caixa.
    </v-alert>
  </section>
</template>

<style scoped>
.relatorio-vendas {
  padding: clamp(16px, 3vw, 28px);
  border: 1px solid var(--cx-line);
  border-radius: 16px;
  background: var(--cx-surface);
}
.relatorio-vendas__cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.relatorio-vendas__sobretitulo {
  color: var(--cat-entradas-tinta);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.relatorio-vendas h3,
.relatorio-vendas h4 {
  margin: 0;
}
.relatorio-vendas__cabecalho p {
  margin: 6px 0 0;
  color: var(--cx-ink-soft);
}
.relatorio-vendas__indicadores,
.relatorio-vendas__formas-lista {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.relatorio-vendas__indicadores article,
.relatorio-vendas__forma {
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}
.relatorio-vendas__indicadores span,
.relatorio-vendas__forma span {
  display: block;
  color: var(--cx-ink-soft);
  font-size: 0.8rem;
  font-weight: 700;
}
.relatorio-vendas__indicadores strong,
.relatorio-vendas__forma strong {
  display: block;
  margin-top: 4px;
  font-size: 1.1rem;
}
.relatorio-vendas__indicadores small,
.relatorio-vendas__forma small {
  color: var(--cx-ink-soft);
}
.relatorio-vendas__indicador--canceladas {
  border-color: color-mix(in srgb, var(--cx-attention) 52%, var(--cx-line)) !important;
}
.relatorio-vendas__indicador--total {
  border-color: color-mix(in srgb, var(--cx-positive) 46%, var(--cx-line));
  background: color-mix(in srgb, var(--cx-positive) 16%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__indicador--quantidade {
  border-color: color-mix(in srgb, var(--cat-entradas-base) 46%, var(--cx-line));
}
.relatorio-vendas__formas {
  padding: 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--cx-brand) 15%, var(--cx-surface));
}
.relatorio-vendas__gerar {
  background: var(--cat-entradas-base) !important;
  color: var(--cx-canvas) !important;
}
.relatorio-vendas__formas-lista {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.relatorio-vendas__forma--dinheiro {
  border-color: color-mix(in srgb, var(--cx-positive) 42%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-positive) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--credito,
.relatorio-vendas__forma--voucher {
  border-color: color-mix(in srgb, var(--cx-brand) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-brand) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--debito {
  border-color: color-mix(in srgb, var(--cat-retiradas-base) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cat-retiradas-base) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--pix {
  border-color: color-mix(in srgb, var(--cat-mercadorias-base) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cat-mercadorias-base) 24%, var(--cx-surface-sunken)) !important;
}
.relatorio-vendas__forma--crediario,
.relatorio-vendas__forma--outros {
  border-color: color-mix(in srgb, var(--cx-attention) 46%, var(--cx-line)) !important;
  background: color-mix(in srgb, var(--cx-attention) 24%, var(--cx-surface-sunken)) !important;
}
@media (max-width: 720px) {
  .relatorio-vendas__cabecalho {
    flex-direction: column;
  }
  .relatorio-vendas__indicadores {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 420px) {
  .relatorio-vendas__cabecalho :deep(.v-btn) {
    width: 100%;
    min-height: 48px;
  }
}
</style>
