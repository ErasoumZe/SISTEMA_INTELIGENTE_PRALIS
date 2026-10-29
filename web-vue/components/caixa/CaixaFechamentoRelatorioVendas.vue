<script setup lang="ts">
import type { ContagemFisicaRelatorio, VendaCanceladaCaixa } from "@padaria/shared";
import CaixaContagemFisica from "~/components/caixa/CaixaContagemFisica.vue";
import { useContagemFisicaVendas } from "~/composables/useContagemFisicaVendas";
import { normalizarTotaisRelatorioVendas, type TotaisRelatorioVendas } from "~/utils/caixa-fechamento";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import CapturaCameraDialog from "~/components/comum/CapturaCameraDialog.vue";
import CaixaInicioVendasAjuste from "~/components/caixa/CaixaInicioVendasAjuste.vue";
import CaixaFolhaCreareLeitura from "~/components/caixa/CaixaFolhaCreareLeitura.vue";
import CaixaCorrecaoManual from "~/components/caixa/CaixaCorrecaoManual.vue";
import CaixaFechamentoRelatorioVendasResumo from "~/components/caixa/CaixaFechamentoRelatorioVendasResumo.vue";
import { conferenciaInicioDaFolha, numerosTravados, type SugestaoFolhaCreare } from "~/utils/folha-creare";
import { useCapturaCamera } from "~/composables/useCapturaCamera";
import { useLeituraFolhaCreare } from "~/composables/useLeituraFolhaCreare";

type DadosRelatorioVendas = {
  versao?: number;
  // R-232 · contagem cega gravada com o relatorio. `invalidado`: folha trocada/inicio ajustado — so a contagem ficou.
  invalidado?: boolean;
  contagemFisica?: ContagemFisicaRelatorio;
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
const emit = defineEmits<{
  (event: "inicioAjustado"): void;
  (event: "contagem", contagem: ContagemFisicaRelatorio | null): void;
}>();
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
let consultaAtual = 0;
// R-232 · contagem cega (passo 1): trava ao gerar; corrigir pede justificativa.
const {
  contagem,
  registrada: contagemRegistrada,
  pronta: contagemPronta,
  registrar: registrarContagem,
  paraEnvio: contagemParaEnvio
} = useContagemFisicaVendas((registrada) => emit("contagem", registrada));
const {
  leitura: leituraCreare,
  sugestao: sugestaoCreare,
  pronta: leituraPronta,
  alterada: leituraAlterada,
  corrigindo,
  justificativa,
  alteradosPelaCorrecao,
  faltaJustificativa,
  ler: analisarAnexoCreare,
  indisponivel: leituraIndisponivel,
  restaurarDoRelatorio,
  reiniciar: reiniciarLeitura,
  paraEnvio
} = useLeituraFolhaCreare({
  anexoId: anexoCreareId,
  gerado,
  aviso,
  lerComIa: async (anexoId) =>
    (
      await apiPost<{ sugestao: SugestaoFolhaCreare }>(
        "/api/caixa/" + encodeURIComponent(props.caixaId) + "/relatorio-vendas/analisar",
        { anexoId }
      )
    ).sugestao
});

// R-225: o "Periodo de" da folha comparado com o inicio das vendas do caixa, ja na leitura (antes de gerar).
const inicioFolha = computed(() =>
  conferenciaInicioDaFolha(leituraCreare.value.periodoInicio, props.aberturaOficial, props.inicioVendas)
);

function aplicarRelatorio(relatorio: RelatorioGerado) {
  registrarContagem(relatorio.dados.contagemFisica ?? null);
  // Relatorio invalidado: so a contagem continua valendo; o relatorio precisa ser gerado de novo.
  if (relatorio.dados.invalidado) {
    limparRelatorio();
    return;
  }
  totais.value = normalizarTotaisRelatorioVendas(relatorio.dados.vendas);
  intervalo.value = { abertura: relatorio.periodoInicio, fechamento: relatorio.periodoFim };
  canceladas.value = relatorio.dados.canceladas;
  restaurarDoRelatorio(relatorio.dados.creare?.leitura, relatorio.dados.versao ?? 0);
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
            leituraCreare: paraEnvio(),
            ...contagemParaEnvio()
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
    reiniciarLeitura();
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
        <p>Conte o dinheiro da gaveta, anexe a folha do CREARE e gere o relatório que compara os três.</p>
      </div>
    </div>

    <v-alert v-if="erro" type="error" density="compact" class="mt-4">{{ erro }}</v-alert>

    <!-- R-232 · 1) contagem cega, 2) folha do CREARE, 3) gerar o relatorio que compara os tres. -->
    <CaixaContagemFisica v-model="contagem" :registrada="contagemRegistrada" />

    <section class="relatorio-vendas__anexo mt-4" aria-label="Relatório de vendas do CREARE">
      <div>
        <strong><span class="relatorio-vendas__passo">2</span> Folha de vendas do CREARE</strong>
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
      :travados="corrigindo ? [] : numerosTravados(sugestaoCreare)"
      class="mt-4"
    />
    <CaixaCorrecaoManual
      v-if="anexoCreareEnviado && leituraPronta"
      v-model:corrigindo="corrigindo"
      v-model:justificativa="justificativa"
      :tem-travados="numerosTravados(sugestaoCreare).length > 0"
      :alterados="alteradosPelaCorrecao"
      :salva="sugestaoCreare?.correcaoManual ?? null"
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
      :disabled="!anexoCreareEnviado || enviandoCreare || !leituraPronta || faltaJustificativa || !contagemPronta"
      data-teste="gerar-relatorio-vendas"
      @click="gerarRelatorio"
      ><span class="relatorio-vendas__passo relatorio-vendas__passo--botao">3</span> Gerar relatório de vendas</v-btn
    >
    <p v-if="!contagemPronta" class="relatorio-vendas__lendo mt-2" role="status">
      {{
        contagem.corrigindo
          ? "Explique por que a contagem mudou para gerar de novo."
          : "Informe cédulas e moedas no passo 1 para gerar o relatório."
      }}
    </p>

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

<style src="./CaixaFechamentoRelatorioVendas.css" scoped></style>
