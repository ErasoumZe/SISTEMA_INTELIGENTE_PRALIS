<script setup lang="ts">
import { nextTick } from "vue";
import type { VendaCanceladaCaixa } from "@padaria/shared";
import { normalizarTotaisRelatorioVendas, type TotaisRelatorioVendas } from "~/utils/caixa-fechamento";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import CapturaCameraDialog from "~/components/comum/CapturaCameraDialog.vue";
import CaixaInicioVendasAjuste from "~/components/caixa/CaixaInicioVendasAjuste.vue";
import CaixaFolhaCreareLeitura from "~/components/caixa/CaixaFolhaCreareLeitura.vue";
import CaixaFechamentoRelatorioVendasResumo from "~/components/caixa/CaixaFechamentoRelatorioVendasResumo.vue";
import {
  conferenciaInicioDaFolha,
  leituraDaSugestao,
  leituraFolhaCreareVazia,
  leituraParaEnvio,
  leiturasFolhaCreareEmMemoria,
  numerosTravados,
  rotuloCampoFolha,
  type SugestaoFolhaCreare
} from "~/utils/folha-creare";
import { useCapturaCamera } from "~/composables/useCapturaCamera";

type DadosRelatorioVendas = {
  versao?: number;
  vendas: TotaisRelatorioVendas;
  canceladas: VendaCanceladaCaixa[];
  // A comparacao da folha com o Pralis e mostrada no Relatorio final; aqui so volta a leitura revisada.
  creare?: { anexoId?: string; leitura?: SugestaoFolhaCreare } | null;
};
type RelatorioGerado = {
  periodoInicio: string;
  periodoFim: string;
  dados: DadosRelatorioVendas;
  geradoEm: string;
};
type Anexo = { id: string; tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare" };
// `aberturaOficial`/`inicioVendas`: opcionais para nao quebrar quem ainda nao passa (o ajuste so aparece com eles).
const props = defineProps<{ caixaId: string; aberturaOficial?: string; inicioVendas?: string }>();
const emit = defineEmits<{ (event: "inicioAjustado"): void }>();
const { apiUrl, apiGet, apiPost } = useApi();
const cameraCreare = useTemplateRef<HTMLInputElement>("cameraCreare");
const { aberta: cameraAberta, abrir: abrirCamera, aoCapturar, aoIndisponivel } = useCapturaCamera(cameraCreare);
const galeriaCreare = useTemplateRef<HTMLInputElement>("galeriaCreare");

const carregando = ref(false);
const erro = ref("");
const aviso = ref("");
const gerado = ref(false);
const totais = ref<ReturnType<typeof normalizarTotaisRelatorioVendas> | null>(null);
const intervalo = ref<{ abertura: string; fechamento: string } | null>(null);
const canceladas = ref<VendaCanceladaCaixa[]>([]);
const anexoCreareEnviado = ref(false);
const enviandoCreare = ref(false);
const anexoCreareId = ref("");
const leituraCreare = ref(leituraFolhaCreareVazia());
const sugestaoCreare = ref<SugestaoFolhaCreare | null>(null);
// Os campos da folha so aparecem depois de anexar E ler (ou quando a leitura falha e o operador preenche).
const leituraPronta = ref(false);
// Valor da folha corrigido depois de gerar: o relatorio (e a comparacao do Relatorio final) ficou velho.
const leituraAlterada = ref(false);
let aplicandoLeitura = false;
let consultaAtual = 0;

function definirLeitura(leitura: typeof leituraCreare.value, sugestao: SugestaoFolhaCreare | null) {
  aplicandoLeitura = true;
  leituraCreare.value = leitura;
  sugestaoCreare.value = sugestao;
  leituraPronta.value = true;
  leituraAlterada.value = false;
  void nextTick(() => {
    aplicandoLeitura = false;
  });
}

watch(
  leituraCreare,
  (leitura) => {
    if (aplicandoLeitura || !leituraPronta.value) return;
    if (anexoCreareId.value) {
      leiturasFolhaCreareEmMemoria.set(anexoCreareId.value, { leitura, sugestao: sugestaoCreare.value });
    }
    if (gerado.value) leituraAlterada.value = true;
  },
  { deep: true }
);

// R-225: o "Periodo de" da folha comparado com o inicio das vendas do caixa, ja na leitura (antes de gerar).
const inicioFolha = computed(() =>
  conferenciaInicioDaFolha(leituraCreare.value.periodoInicio, props.aberturaOficial, props.inicioVendas)
);

function aplicarSugestaoCreare(sugestao: SugestaoFolhaCreare) {
  definirLeitura(leituraDaSugestao(sugestao), sugestao);
  leiturasFolhaCreareEmMemoria.set(anexoCreareId.value, { leitura: leituraCreare.value, sugestao });
  const pendentes = sugestao.camposDuvidosos.length
    ? " Revise: " + sugestao.camposDuvidosos.map(rotuloCampoFolha).join(", ") + "."
    : "";
  aviso.value = sugestao.documentoLegivel
    ? "A leitura preencheu os valores visíveis da folha. Confira antes de gerar." + pendentes
    : "A leitura não confirmou a legibilidade da folha. Confira e preencha os campos visíveis." + pendentes;
}

async function analisarAnexoCreare(anexoId: string) {
  const guardada = leiturasFolhaCreareEmMemoria.get(anexoId);
  if (guardada) {
    definirLeitura(guardada.leitura, guardada.sugestao);
    return;
  }
  const leitura = await apiPost<{ sugestao: SugestaoFolhaCreare }>(
    "/api/caixa/" + encodeURIComponent(props.caixaId) + "/relatorio-vendas/analisar",
    { anexoId }
  );
  aplicarSugestaoCreare(leitura.sugestao);
}

function aplicarRelatorio(relatorio: RelatorioGerado) {
  totais.value = normalizarTotaisRelatorioVendas(relatorio.dados.vendas);
  intervalo.value = { abertura: relatorio.periodoInicio, fechamento: relatorio.periodoFim };
  canceladas.value = relatorio.dados.canceladas;
  // Ao voltar para a etapa, a leitura revisada que gerou o relatorio reaparece (so no modelo atual, v4).
  const lida = relatorio.dados.creare?.leitura;
  if (lida && (relatorio.dados.versao ?? 0) >= 4 && !leituraPronta.value) {
    definirLeitura(leituraDaSugestao(lida), lida);
  }
  gerado.value = true;
  leituraAlterada.value = false;
}

function limparRelatorio() {
  totais.value = null;
  intervalo.value = null;
  gerado.value = false;
  canceladas.value = [];
  leituraAlterada.value = false;
}

function leituraIndisponivel() {
  leituraPronta.value = true;
  aviso.value = "A folha foi anexada. A leitura automática não ficou disponível; preencha os valores do cupom.";
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
    // A folha vale e a MAIS RECENTE (a lista vem da mais antiga para a mais nova).
    const folhas = anexos.filter((anexo) => anexo.tipo === "relatorio_vendas_creare");
    const anexoCreare = folhas.at(-1);
    anexoCreareEnviado.value = Boolean(anexoCreare);
    anexoCreareId.value = anexoCreare?.id ?? "";
    if (relatorio) aplicarRelatorio(relatorio);
    // Sem leitura do modelo atual (sem relatorio, ou relatorio antigo v3): le a folha.
    if (anexoCreare && !leituraPronta.value) {
      try {
        await analisarAnexoCreare(anexoCreare.id);
      } catch {
        leituraIndisponivel();
      }
    }
  } catch {
    // A leitura do rascunho salvo não pode bloquear a geração manual do relatório.
  }
}

// R-224: depois de ajustar o inicio, o relatorio gerado antes vale para o periodo antigo e e descartado.
function aoAjustarInicio(resultado: {
  vendasAnexadas: number;
  vendasDesanexadas: number;
  relatorioVendasInvalidado: boolean;
}) {
  limparRelatorio();
  const saidas = resultado.vendasDesanexadas ? `, ${resultado.vendasDesanexadas} saíram` : "";
  aviso.value = `Início ajustado (${resultado.vendasAnexadas} venda(s) entraram neste caixa${saidas}). Gere o relatório de novo.`;
  // O saldo esperado e o cabecalho do caixa vem do status: o pai recarrega agora, nao no proximo minuto.
  emit("inicioAjustado");
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
            leituraCreare: leituraParaEnvio(leituraCreare.value, sugestaoCreare.value)
          }
        : {}
    );
    aplicarRelatorio(relatorio);
  } catch (falha) {
    limparRelatorio();
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
    sugestaoCreare.value = null;
    leituraPronta.value = false;
    // O servidor descarta o relatorio gerado com a folha anterior; a tela tambem.
    limparRelatorio();
    try {
      await analisarAnexoCreare(anexoCreareId.value);
    } catch {
      leituraIndisponivel();
    }
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
        <v-btn prepend-icon="mdi-camera" :loading="enviandoCreare" @click="abrirCamera()">Câmera</v-btn>
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
      <CapturaCameraDialog v-model="cameraAberta" @capturada="aoCapturar" @indisponivel="aoIndisponivel" />
    </section>

    <v-alert v-if="aviso" type="info" density="compact" variant="tonal" class="mt-4">{{ aviso }}</v-alert>

    <p v-if="anexoCreareEnviado && !leituraPronta" class="relatorio-vendas__lendo mt-4" role="status">
      Lendo a folha do CREARE…
    </p>
    <CaixaFolhaCreareLeitura
      v-if="anexoCreareEnviado && leituraPronta"
      v-model="leituraCreare"
      :travados="numerosTravados(sugestaoCreare)"
      class="mt-4"
    />
    <v-alert v-if="leituraAlterada" type="warning" variant="tonal" density="compact" class="mt-4" role="status">
      Valores da folha alterados depois de gerar. Gere o relatório de novo para atualizar a comparação.
    </v-alert>

    <v-alert v-if="inicioFolha.aviso" type="warning" variant="tonal" density="compact" class="mt-4" role="status">
      {{ inicioFolha.aviso }}
    </v-alert>

    <CaixaInicioVendasAjuste
      v-if="aberturaOficial && inicioVendas"
      :caixa-id="caixaId"
      :abertura-oficial="aberturaOficial"
      :inicio-vendas="inicioVendas"
      :sugestao="inicioFolha.sugestao"
      @ajustado="aoAjustarInicio"
    />

    <v-btn
      class="relatorio-vendas__gerar mt-4"
      color="primary"
      prepend-icon="mdi-file-chart-outline"
      :loading="carregando"
      :disabled="!anexoCreareEnviado || enviandoCreare || !leituraPronta"
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

      <CaixaFechamentoRelatorioVendasResumo :totais="totais" :quantidade-canceladas="canceladas.length" />

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
.relatorio-vendas__lendo {
  margin: 0;
  color: var(--cx-ink-soft);
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
@media (max-width: 720px) {
  .relatorio-vendas__cabecalho {
    flex-direction: column;
  }
  .relatorio-vendas__anexo {
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
@media (max-width: 600px) {
  .relatorio-vendas__gerar {
    width: 100%;
    min-height: 48px;
  }
  .relatorio-vendas__anexo :deep(.v-btn) {
    width: 100%;
    min-height: 48px;
  }
}
</style>
