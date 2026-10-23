<script setup lang="ts">
import { LIMITE_PAGINA_PRECO_BASE } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

// Carga inicial do preco-base a partir da coluna "ULTIMO MENOR CUSTO" (R-218 / PROJECT_BRAIN 53).
// A analise e a aplicacao sao atos separados: ambiguidade ou produto nao encontrado BLOQUEIA a
// aplicacao, e o relatorio de pendencias e o que permite corrigir a planilha ou o cadastro.
type ImportacaoLinha = {
  id: string;
  nomeArquivo: string;
  status: "analisada" | "aplicada" | "cancelada";
  totalLinhas: number;
  totalCorrespondencias: number;
  totalAmbiguidades: number;
  totalNaoEncontrados: number;
  criadoEm: string;
};
type PrecoBaseLinha = {
  id: string;
  produtoDescricao: string;
  produtoCodigo: string | null;
  valor: string;
  origem: "importacao" | "rodada";
  validoDesde: string;
};

const props = defineProps<{ empresaId: string }>();

const { apiUrl, apiGet, apiPost, apiDelete } = useApi();
const importacoes = ref<ImportacaoLinha[]>([]);
const precos = ref<PrecoBaseLinha[]>([]);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const sucesso = ref("");
// Separado de `salvando`: com um unico estado, aplicar uma importacao fazia o botao "Analisar .xlsx"
// girar, como se o sistema estivesse lendo uma planilha que ninguem enviou.
const aplicandoId = ref<string | null>(null);
const descartandoId = ref<string | null>(null);
// Descartar apaga a analise: confirma antes, como qualquer ato que nao tem volta.
const importacaoParaDescartar = ref<ImportacaoLinha | null>(null);
const arquivoInput = ref<HTMLInputElement | null>(null);
const dialogPendencias = ref(false);
const importacaoEmFoco = ref<ImportacaoLinha | null>(null);

const ROTULO_STATUS: Record<ImportacaoLinha["status"], string> = {
  analisada: "Analisada",
  aplicada: "Aplicada",
  cancelada: "Cancelada"
};
const ROTULO_ORIGEM: Record<PrecoBaseLinha["origem"], string> = {
  importacao: "Importação inicial",
  rodada: "Rodada de cotação"
};
// Formatadores reaproveitados: criar um `Intl` por celula custava milhares de objetos por carga.
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const moeda = (valor: string) => MOEDA.format(Number(valor));
const dataHora = (valor: string) => DATA_HORA.format(new Date(valor));
const pendenciasDa = (item: ImportacaoLinha) => item.totalAmbiguidades + item.totalNaoEncontrados;

// Guarda de sequencia na troca de empresa (mesma razao da aba de catalogo).
let requisicao = 0;

function verPendencias(item: ImportacaoLinha) {
  importacaoEmFoco.value = item;
  dialogPendencias.value = true;
}

async function carregar() {
  if (!props.empresaId) return;
  const token = (requisicao += 1);
  carregando.value = true;
  erro.value = "";
  sucesso.value = "";
  // Limpo ANTES do await, pelo mesmo motivo da aba de catalogo: nao deixar dado da empresa anterior
  // na tela quando a carga da nova falha.
  importacoes.value = [];
  precos.value = [];
  try {
    const query = `?empresaId=${encodeURIComponent(props.empresaId)}`;
    const [analises, atuais] = await Promise.all([
      apiGet<ImportacaoLinha[]>(`/api/compras/precos-base/importacoes${query}`),
      apiGet<PrecoBaseLinha[]>(`/api/compras/precos-base${query}`)
    ]);
    if (token !== requisicao) return;
    importacoes.value = analises;
    precos.value = atuais;
  } catch (causa) {
    if (token !== requisicao) return;
    erro.value = mensagemErro(causa);
  } finally {
    if (token === requisicao) carregando.value = false;
  }
}

async function enviarPlanilha(evento: Event) {
  const arquivo = (evento.target as HTMLInputElement).files?.[0];
  if (!arquivo) return;
  salvando.value = true;
  erro.value = "";
  sucesso.value = "";
  try {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(
      `${apiUrl}/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${encodeURIComponent(props.empresaId)}`,
      { method: "POST", credentials: "include", body: corpo }
    );
    // Um 502 de proxy responde HTML: `resposta.json()` cru virava "Unexpected token '<'" na cara do
    // operador, escondendo que o problema era a rede e nao a planilha.
    const payload = await resposta
      .json()
      .then((corpoJson) => corpoJson as { title?: string })
      .catch(() => ({ title: "" }));
    if (!resposta.ok)
      throw new Error(payload.title || `Não foi possível analisar a planilha (HTTP ${resposta.status}).`);
    await carregar();
    sucesso.value = "Planilha analisada. Confira as pendências antes de aplicar.";
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
    if (arquivoInput.value) arquivoInput.value.value = "";
  }
}

// Descartar libera o hash do arquivo: sem isso, o operador que corrigisse o cadastro do produto nao
// podia reenviar o MESMO .xlsx, e a carga inicial — que e ato unico — ficava travada para sempre.
async function descartar() {
  const importacao = importacaoParaDescartar.value;
  if (!importacao) return;
  descartandoId.value = importacao.id;
  erro.value = "";
  sucesso.value = "";
  try {
    await apiDelete(
      `/api/compras/precos-base/importacoes/${importacao.id}?empresaId=${encodeURIComponent(props.empresaId)}`
    );
    importacaoParaDescartar.value = null;
    await carregar();
    sucesso.value = "Análise descartada. Corrija a planilha ou o cadastro e envie o arquivo novamente.";
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    descartandoId.value = null;
  }
}

async function aplicar(importacao: ImportacaoLinha) {
  aplicandoId.value = importacao.id;
  erro.value = "";
  sucesso.value = "";
  try {
    await apiPost(`/api/compras/precos-base/importacoes/${importacao.id}/aplicar`, { empresaId: props.empresaId });
    // `carregar()` limpa `sucesso`, entao a mensagem precisa vir depois da recarga.
    await carregar();
    sucesso.value = "Preço-base inicial aplicado com histórico auditável.";
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    aplicandoId.value = null;
  }
}

watch(() => props.empresaId, carregar, { immediate: true });
</script>

<template>
  <div>
    <v-alert v-if="erro" type="error" variant="tonal" closable class="mb-3" @click:close="erro = ''">{{
      erro
    }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal" closable class="mb-3" @click:close="sucesso = ''">{{
      sucesso
    }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate class="mb-3" />

    <div class="d-flex align-center justify-space-between ga-3 flex-wrap my-3">
      <div class="text-body-2 text-medium-emphasis">
        A planilha deve conter “ÚLTIMO MENOR CUSTO” e “DESCRIÇÃO” ou “PRODUTO”.
      </div>
      <v-btn prepend-icon="mdi-file-excel" color="primary" :loading="salvando" @click="arquivoInput?.click()"
        >Analisar .xlsx</v-btn
      >
      <input ref="arquivoInput" class="d-none" type="file" accept=".xlsx" @change="enviarPlanilha" />
    </div>
    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Data</th>
            <th>Status</th>
            <th>Correspondências</th>
            <th>Ambiguidades</th>
            <th>Não encontrados</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in importacoes" :key="item.id">
            <td>{{ item.nomeArquivo }}</td>
            <td>{{ dataHora(item.criadoEm) }}</td>
            <td>{{ ROTULO_STATUS[item.status] }}</td>
            <td>{{ item.totalCorrespondencias }}/{{ item.totalLinhas }}</td>
            <td>{{ item.totalAmbiguidades }}</td>
            <td>{{ item.totalNaoEncontrados }}</td>
            <td class="text-right">
              <!-- O flex vive num div DENTRO da celula: `display:flex` no proprio `<td>` tira a celula
                 do contexto de tabela e o navegador passa a gerar celula anonima. -->
              <div class="d-flex justify-end ga-2 flex-wrap">
                <v-btn
                  v-if="pendenciasDa(item) > 0"
                  size="small"
                  variant="text"
                  color="warning"
                  prepend-icon="mdi-format-list-bulleted"
                  @click="verPendencias(item)"
                  >Ver {{ pendenciasDa(item) }} pendência(s)</v-btn
                >
                <v-btn
                  v-if="item.status === 'analisada'"
                  size="small"
                  variant="tonal"
                  :loading="aplicandoId === item.id"
                  :disabled="pendenciasDa(item) > 0 || salvando || aplicandoId !== null"
                  @click="aplicar(item)"
                  >Aplicar uma vez</v-btn
                >
                <v-btn
                  v-if="item.status === 'analisada'"
                  size="small"
                  variant="text"
                  color="error"
                  :loading="descartandoId === item.id"
                  :disabled="salvando || aplicandoId !== null || descartandoId !== null"
                  @click="importacaoParaDescartar = item"
                  >Descartar</v-btn
                >
              </div>
            </td>
          </tr>
          <!-- `!erro` junto: a lista e limpa antes do await, entao uma falha de carga deixava a tela
             afirmando "nenhuma planilha analisada" ao lado do alerta de erro. -->
          <tr v-if="!carregando && !erro && !importacoes.length">
            <td colspan="7" class="text-center text-medium-emphasis py-6">Nenhuma planilha analisada.</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <h3 class="text-subtitle-1 mt-6 mb-2">Preços-base atuais</h3>
    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Código</th>
            <th>Valor</th>
            <th>Origem</th>
            <th>Válido desde</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in precos" :key="item.id">
            <td>{{ item.produtoDescricao }}</td>
            <td>{{ item.produtoCodigo ?? "—" }}</td>
            <td>{{ moeda(item.valor) }}</td>
            <td>{{ ROTULO_ORIGEM[item.origem] }}</td>
            <td>{{ dataHora(item.validoDesde) }}</td>
          </tr>
          <!-- "Ainda não há preço-base aplicado" e uma frase que decide acao (aplicar ou nao a
             importacao): ela nao pode aparecer quando a carga falhou. -->
          <tr v-if="!carregando && !erro && !precos.length">
            <td colspan="5" class="text-center text-medium-emphasis py-6">Ainda não há preço-base aplicado.</td>
          </tr>
        </tbody>
      </v-table>
    </div>
    <p v-if="precos.length >= LIMITE_PAGINA_PRECO_BASE" class="text-caption text-medium-emphasis mt-2">
      Mostrando os primeiros {{ LIMITE_PAGINA_PRECO_BASE }} produtos, em ordem alfabética.
    </p>

    <v-dialog
      :model-value="importacaoParaDescartar !== null"
      max-width="520"
      @update:model-value="importacaoParaDescartar = null"
    >
      <v-card>
        <v-card-title>Descartar análise</v-card-title>
        <v-card-text class="d-grid ga-3">
          <p class="text-body-2">
            A análise de <strong>{{ importacaoParaDescartar?.nomeArquivo }}</strong> será apagada. Nenhum preço-base foi
            gravado por ela, e nada já aplicado é afetado.
          </p>
          <v-alert type="info" variant="tonal" density="compact">
            Descartar libera o arquivo: depois de corrigir a planilha ou o cadastro do produto, você pode enviar o mesmo
            arquivo novamente.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="importacaoParaDescartar = null">Cancelar</v-btn>
          <v-btn color="error" :loading="descartandoId !== null" @click="descartar">Descartar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ComprasPrecoBasePendencias
      v-model="dialogPendencias"
      :empresa-id="empresaId"
      :importacao-id="importacaoEmFoco?.id ?? null"
      :nome-arquivo="importacaoEmFoco?.nomeArquivo ?? ''"
    />
  </div>
</template>
