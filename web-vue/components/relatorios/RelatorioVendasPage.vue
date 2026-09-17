<script setup lang="ts">
import type { OperacaoResumo, Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataSomenteDia, formatarHora } from "~/utils/formatacao";

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
// Ordem cronologica real (data_venda), crescente por padrao: a investigacao de conciliacao le a
// fita do dia de cima para baixo. O clique no cabecalho "Hora" inverte — e vai para o servidor.
const ordem = ref<"asc" | "desc">("asc");
const filtros = reactive({
  dataInicio: "",
  dataFim: "",
  pdvId: "",
  turnoId: "",
  clienteId: "",
  colaboradorId: "",
  formaPagamentoId: "",
  status: ""
});
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
const comprovantes = ref<Comprovante[]>([]);
const uploadCarregando = ref(false);
const arquivoInput = ref<File | null>(null);

function paramsFiltro() {
  const params = new URLSearchParams({ empresaId: props.empresaId });
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }
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

// Totais sobre TODO o conjunto filtrado (nao so a pagina) — homologacao contra o CREARE.
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

// Inverter a ordem volta para a pagina 1: a "primeira venda do dia" tem de aparecer de cara, e
// manter a pagina 5 numa lista invertida mostraria um pedaco aleatorio do meio.
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

function nomePagamento(pagamento: NonNullable<OperacaoResumo["pagamentos"]>[number]) {
  return pagamento.formaPagamentoNome?.trim() || pagamento.tipoPagamentoAutomacao?.trim() || "Sem forma";
}

function resumoProdutos(linha: OperacaoResumo) {
  const itens = linha.itensVenda ?? [];
  if (!itens.length) return "";
  const visiveis = itens.slice(0, 2).map((item) => `${item.quantidade}x ${item.descricaoProduto}`);
  const restante = itens.length - visiveis.length;
  return `Produtos: ${visiveis.join(", ")}${restante > 0 ? ` +${restante}` : ""}`;
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
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between ga-3 report-card-head">
      <div>
        <div class="text-body-2 text-muted">Vendas com filtros por período, PDV, cliente e pagamento.</div>
      </div>
      <v-btn color="primary" prepend-icon="mdi-magnify" :loading="carregando" @click="aplicarFiltros">Buscar</v-btn>
    </v-card-title>
    <v-card-text>
      <v-row dense class="mb-4">
        <v-col cols="12" md="3"><v-text-field v-model="filtros.dataInicio" type="date" label="Data inicial" /></v-col>
        <v-col cols="12" md="3"><v-text-field v-model="filtros.dataFim" type="date" label="Data final" /></v-col>
        <v-col cols="12" md="3">
          <v-select v-model="filtros.pdvId" :items="pdvs" item-title="nome" item-value="id" label="PDV" clearable />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filtros.turnoId"
            :items="turnos ?? []"
            item-title="nome"
            item-value="id"
            label="Turno"
            clearable
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filtros.formaPagamentoId"
            :items="formasPagamento"
            item-title="nome"
            item-value="id"
            label="Pagamento"
            clearable
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="filtros.clienteId"
            :items="clientes"
            item-title="nome"
            item-value="id"
            label="Cliente"
            clearable
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="filtros.colaboradorId"
            :items="colaboradores"
            item-title="nome"
            item-value="id"
            label="Colaborador"
            clearable
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="filtros.status"
            :items="['aprovado', 'aguardando_aprovacao', 'cancelado']"
            label="Status"
            clearable
          />
        </v-col>
      </v-row>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
      <div class="text-body-2 text-muted mb-2">{{ total }} vendas encontradas</div>
      <div class="responsive-table-shell">
        <v-table>
          <thead>
            <tr>
              <th>Data</th>
              <!-- Ordena no SERVIDOR: a lista e paginada, entao ordenar no cliente reordenaria so
                   as 50 linhas visiveis, parecendo ordenar o filtro inteiro. -->
              <th class="hora-coluna" role="button" tabindex="0" @click="alternarOrdem" @keydown.enter="alternarOrdem">
                Hora
                <v-icon :icon="ordem === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down'" size="14" />
              </th>
              <th>Descrição</th>
              <th>PDV</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Valor</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhas" :key="linha.id">
              <!-- dataReferencia e date-only: formatarDataSomenteDia nao a deixa passar por Date. -->
              <td>{{ formatarDataSomenteDia(linha.dataReferencia) }}</td>
              <!-- "-" quando nao ha dataVenda: venda manual so tem a data contabil. -->
              <td>{{ formatarHora(linha.dataVenda) }}</td>
              <td>
                <div>{{ linha.descricao }}</div>
                <div v-if="resumoProdutos(linha)" class="text-caption text-medium-emphasis mt-1">
                  {{ resumoProdutos(linha) }}
                </div>
              </td>
              <td>{{ linha.pdvNome ?? "-" }}</td>
              <td>{{ linha.clienteNome ?? "-" }}</td>
              <td>
                <template v-if="linha.pagamentos?.length">
                  <div v-for="pagamento in linha.pagamentos" :key="pagamento.id" class="text-no-wrap">
                    {{ nomePagamento(pagamento) }}: {{ dinheiro(pagamento.totalPago) }}
                  </div>
                  <v-chip
                    v-if="linha.pagamentos.length > 1"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    class="mt-1"
                  >
                    Venda dividida
                  </v-chip>
                </template>
                <span v-else>-</span>
              </td>
              <!-- Liquido: o subtotal (valorOriginal) nao e o que o cliente pagou e nao bateria
                   com o rodape nem com o CREARE. -->
              <td>{{ dinheiro(linha.valorLiquido ?? linha.valorOriginal) }}</td>
              <td class="text-right">
                <v-btn size="small" variant="text" @click="abrirComprovantes(linha)">
                  Adicionar comprovantes ({{ linha.totalComprovantes ?? 0 }})
                </v-btn>
              </td>
            </tr>
            <tr v-if="!linhas.length">
              <td colspan="8" class="text-center text-muted py-8">Nenhuma venda encontrada.</td>
            </tr>
          </tbody>
        </v-table>
      </div>
      <div v-if="totais" class="totais-rodape mt-4 pa-3 rounded-lg">
        <div class="d-flex justify-space-between align-center flex-wrap ga-2">
          <div class="text-subtitle-1 font-weight-bold">Total geral: {{ dinheiro(totais.totalGeral) }}</div>
          <div class="text-body-2 text-muted">{{ totais.quantidade }} vendas no período filtrado</div>
        </div>
        <div v-if="totais.porFormaPagamento.length" class="d-flex flex-wrap ga-2 mt-2">
          <v-chip
            v-for="forma in totais.porFormaPagamento"
            :key="forma.formaPagamento"
            size="small"
            variant="tonal"
            color="primary"
          >
            {{ forma.formaPagamento }}: {{ dinheiro(forma.total) }}
          </v-chip>
        </div>
      </div>
      <div v-if="totalPaginas > 1" class="d-flex justify-center mt-4">
        <v-pagination v-model="pagina" :length="totalPaginas" :total-visible="5" @update:model-value="buscar" />
      </div>
    </v-card-text>

    <v-dialog v-model="modalAberto" max-width="680">
      <v-card>
        <v-card-title>Comprovantes</v-card-title>
        <v-card-subtitle>{{ vendaSelecionada?.descricao }}</v-card-subtitle>
        <v-card-text>
          <v-file-input v-model="arquivoInput" label="Imagem ou PDF" accept="image/*,.pdf,application/pdf" />
          <v-btn
            color="primary"
            prepend-icon="mdi-upload"
            :loading="uploadCarregando"
            :disabled="!arquivoInput"
            @click="enviarComprovante"
          >
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
  </v-card>
</template>

<style scoped>
.totais-rodape {
  background: rgba(var(--v-theme-primary), 0.06);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}
</style>
