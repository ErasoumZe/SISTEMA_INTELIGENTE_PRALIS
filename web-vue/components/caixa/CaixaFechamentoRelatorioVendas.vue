<script setup lang="ts">
import type { VendaCanceladaCaixa } from "@padaria/shared";
import { normalizarTotaisRelatorioVendas, type TotaisRelatorioVendas } from "~/utils/caixa-fechamento";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";

type LeituraCreare = Record<
  "totalBruto" | "dinheiro" | "credito" | "debito" | "pix" | "voucher" | "despesasExcetoSangria" | "resultadoFinal",
  string
>;
type DadosRelatorioVendas = {
  vendas: TotaisRelatorioVendas;
  canceladas: VendaCanceladaCaixa[];
  creare?: { comparacao: Record<string, "ok" | "pendente" | "divergente"> } | null;
};
type RelatorioGerado = {
  periodoInicio: string;
  periodoFim: string;
  dados: DadosRelatorioVendas;
  geradoEm: string;
};
type Anexo = { id: string; tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare" };

const props = defineProps<{ caixaId: string }>();
const { apiUrl, apiGet, apiPost } = useApi();
const cameraCreare = useTemplateRef<HTMLInputElement>("cameraCreare");
const galeriaCreare = useTemplateRef<HTMLInputElement>("galeriaCreare");

const carregando = ref(false);
const erro = ref("");
const gerado = ref(false);
const totais = ref<ReturnType<typeof normalizarTotaisRelatorioVendas> | null>(null);
const intervalo = ref<{ abertura: string; fechamento: string } | null>(null);
const canceladas = ref<VendaCanceladaCaixa[]>([]);
const anexoCreareEnviado = ref(false);
const enviandoCreare = ref(false);
const anexoCreareId = ref("");
const leituraCreare = ref<LeituraCreare>({
  totalBruto: "",
  dinheiro: "",
  credito: "",
  debito: "",
  pix: "",
  voucher: "",
  despesasExcetoSangria: "",
  resultadoFinal: ""
});
const comparacaoCreare = ref<Record<string, "ok" | "pendente" | "divergente"> | null>(null);
const camposCreare = [
  { chave: "totalBruto", titulo: "Total bruto" },
  { chave: "dinheiro", titulo: "Dinheiro" },
  { chave: "credito", titulo: "Crédito" },
  { chave: "debito", titulo: "Débito" },
  { chave: "pix", titulo: "Pix" },
  { chave: "voucher", titulo: "Voucher" },
  { chave: "despesasExcetoSangria", titulo: "Despesas exceto sangria" },
  { chave: "resultadoFinal", titulo: "Resultado final" }
] as const;
let consultaAtual = 0;
const totaisPorForma = computed(() => totais.value?.porFormaPagamento ?? []);

function aplicarRelatorio(relatorio: RelatorioGerado) {
  totais.value = normalizarTotaisRelatorioVendas(relatorio.dados.vendas);
  intervalo.value = { abertura: relatorio.periodoInicio, fechamento: relatorio.periodoFim };
  canceladas.value = relatorio.dados.canceladas;
  comparacaoCreare.value = relatorio.dados.creare?.comparacao ?? null;
  gerado.value = true;
}

async function carregarRelatorioExistente() {
  if (!props.caixaId) return;
  const consulta = ++consultaAtual;
  try {
    const [relatorio, anexos] = await Promise.all([
      apiGet<RelatorioGerado | null>(`/api/caixa/${encodeURIComponent(props.caixaId)}/relatorio-vendas`),
      apiGet<Anexo[]>(`/api/caixa/${encodeURIComponent(props.caixaId)}/anexos`)
    ]);
    if (consulta !== consultaAtual) return;
    const anexoCreare = anexos.find((anexo) => anexo.tipo === "relatorio_vendas_creare");
    anexoCreareEnviado.value = Boolean(anexoCreare);
    anexoCreareId.value = anexoCreare?.id ?? "";
    if (!relatorio) return;
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
      anexoCreareId.value
        ? {
            anexoId: anexoCreareId.value,
            leituraCreare: {
              documentoLegivel: true,
              ...Object.fromEntries(
                camposCreare.map(({ chave }) => [
                  chave,
                  leituraCreare.value[chave] ? Number(leituraCreare.value[chave].replace(",", ".")) : null
                ])
              ),
              camposDuvidosos: [],
              observacoes: []
            }
          }
        : {}
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

async function enviarRelatorioCreare(evento: Event) {
  const input = evento.target as HTMLInputElement;
  const arquivo = input.files?.[0];
  input.value = "";
  if (!arquivo || !props.caixaId) return;
  enviandoCreare.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", "relatorio_vendas_creare");
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/caixa/${encodeURIComponent(props.caixaId)}/anexos`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    const json = (await resposta.json()) as { data?: { id: string }; detail?: string };
    if (!resposta.ok) throw new Error(json.detail || "Não foi possível anexar o relatório do CREARE.");
    anexoCreareEnviado.value = true;
    anexoCreareId.value = json.data?.id ?? "";
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    enviandoCreare.value = false;
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
    </div>

    <v-alert v-if="erro" type="error" density="compact" class="mt-4">{{ erro }}</v-alert>

    <section class="relatorio-vendas__anexo mt-4" aria-label="Relatório de vendas do CREARE">
      <div>
        <strong>Relatório de vendas do CREARE</strong>
        <p>Anexe a folha do turno. Ela é separada da folha de fechamento do malote.</p>
      </div>
      <div>
        <v-btn prepend-icon="mdi-camera" :loading="enviandoCreare" @click="cameraCreare?.click()">Câmera</v-btn>
        <v-btn prepend-icon="mdi-image" :loading="enviandoCreare" @click="galeriaCreare?.click()">Galeria</v-btn>
      </div>
      <input
        ref="cameraCreare"
        class="d-none"
        type="file"
        accept="image/*"
        capture="environment"
        @change="enviarRelatorioCreare"
      />
      <input
        ref="galeriaCreare"
        class="d-none"
        type="file"
        accept="image/*,application/pdf"
        @change="enviarRelatorioCreare"
      />
      <small v-if="anexoCreareEnviado" class="text-success">Folha do CREARE anexada.</small>
    </section>

    <section v-if="anexoCreareEnviado" class="relatorio-vendas__leitura mt-4" aria-label="Valores conferidos do CREARE">
      <div>
        <strong>Valores da folha CREARE</strong>
        <p>Confira a foto e informe apenas os valores visíveis antes de gerar.</p>
      </div>
      <v-text-field
        v-for="campo in camposCreare"
        :key="campo.chave"
        v-model="leituraCreare[campo.chave]"
        :label="campo.titulo"
        prefix="R$"
        inputmode="decimal"
        density="comfortable"
      />
    </section>

    <v-alert
      v-if="comparacaoCreare"
      :type="Object.values(comparacaoCreare).every((situacao) => situacao === 'ok') ? 'success' : 'warning'"
      variant="tonal"
      class="mt-4"
    >
      {{
        Object.values(comparacaoCreare).every((situacao) => situacao === "ok")
          ? "CREARE e Pralis conferem em todos os valores comparáveis."
          : "Há valores pendentes ou divergentes no comparativo CREARE × Pralis. Revise a folha e os lançamentos."
      }}
    </v-alert>

    <v-btn
      class="relatorio-vendas__gerar mt-4"
      color="primary"
      prepend-icon="mdi-file-chart-outline"
      :loading="carregando"
      :disabled="!anexoCreareEnviado || enviandoCreare"
      data-teste="gerar-relatorio-vendas"
      @click="gerarRelatorio"
      >Gerar relatório de vendas</v-btn
    >

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

      <details class="relatorio-vendas__formas mt-4" aria-label="Totais por tipo de recebimento">
        <summary>
          <strong>Pagamentos aprovados</strong>
          <span>Toque para mostrar ou ocultar</span>
        </summary>
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
      </details>

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
.relatorio-vendas__formas summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  list-style: none;
}
.relatorio-vendas__formas summary::-webkit-details-marker {
  display: none;
}
.relatorio-vendas__formas summary span {
  color: var(--cx-ink-soft);
  font-size: 0.78rem;
}
.relatorio-vendas__gerar {
  background: var(--cat-entradas-base) !important;
  color: var(--cx-canvas) !important;
}
.relatorio-vendas__anexo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface-sunken);
}
.relatorio-vendas__anexo p {
  margin: 4px 0 0;
}
.relatorio-vendas__anexo > div:last-of-type {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.relatorio-vendas__anexo small {
  grid-column: 1 / -1;
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
.relatorio-vendas__leitura {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
}
.relatorio-vendas__leitura > div {
  grid-column: 1 / -1;
}
.relatorio-vendas__leitura p {
  margin: 4px 0 8px;
  color: var(--cx-ink-soft);
}
@media (max-width: 720px) {
  .relatorio-vendas__cabecalho {
    flex-direction: column;
  }
  .relatorio-vendas__indicadores {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .relatorio-vendas__anexo {
    grid-template-columns: 1fr;
  }
  .relatorio-vendas__leitura {
    grid-template-columns: 1fr;
  }
  .relatorio-vendas__formas-lista {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .relatorio-vendas__forma {
    padding: 10px;
  }
}
@media (max-width: 340px) {
  .relatorio-vendas__indicadores {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 420px) {
  .relatorio-vendas__cabecalho :deep(.v-btn) {
    width: 100%;
    min-height: 48px;
  }
  .relatorio-vendas__anexo :deep(.v-btn) {
    width: 100%;
    min-height: 48px;
  }
}
</style>
