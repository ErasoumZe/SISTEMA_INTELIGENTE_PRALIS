<script setup lang="ts">
import type { OperacaoResumo, Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";

const props = defineProps<{
  empresaId: string;
  pdvs: Opcao[];
  clientes: Opcao[];
  colaboradores: Opcao[];
  formasPagamento: Opcao[];
}>();

type Comprovante = {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string;
};

const { apiUrl, apiGet, apiGetPaginado } = useApi();
const filtros = reactive({
  dataInicio: "",
  dataFim: "",
  pdvId: "",
  clienteId: "",
  colaboradorId: "",
  formaPagamentoId: "",
  status: ""
});
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

async function buscar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({
      empresaId: props.empresaId,
      page: String(pagina.value),
      pageSize: String(itensPorPagina)
    });
    for (const [chave, valor] of Object.entries(filtros)) {
      if (valor) params.set(chave, valor);
    }
    const resultado = await apiGetPaginado<OperacaoResumo>(`/api/relatorios/vendas?${params.toString()}`);
    linhas.value = resultado.itens;
    total.value = resultado.total;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

async function aplicarFiltros() {
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
      throw new Error(body?.title ?? "Nao foi possivel enviar o comprovante.");
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

watch(
  () => props.empresaId,
  () => {
    pagina.value = 1;
    void buscar();
  },
  { immediate: true }
);
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between ga-3">
      <div>
        <div class="text-h6">Relatorio de Vendas</div>
        <div class="text-body-2 text-muted">Vendas com filtros por periodo, PDV, cliente e pagamento.</div>
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
              <th>Descricao</th>
              <th>PDV</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Valor</th>
              <th class="text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhas" :key="linha.id">
              <td>{{ linha.dataReferencia }}</td>
              <td>{{ linha.descricao }}</td>
              <td>{{ linha.pdvNome ?? "-" }}</td>
              <td>{{ linha.clienteNome ?? "-" }}</td>
              <td>
                {{
                  linha.pagamentos?.map((pagamento) => pagamento.formaPagamentoNome ?? "Sem forma").join(", ") || "-"
                }}
              </td>
              <td>{{ dinheiro(linha.valorOriginal) }}</td>
              <td class="text-right">
                <v-btn size="small" variant="text" @click="abrirComprovantes(linha)">
                  Adicionar comprovantes ({{ linha.totalComprovantes ?? 0 }})
                </v-btn>
              </td>
            </tr>
            <tr v-if="!linhas.length">
              <td colspan="7" class="text-center text-muted py-8">Nenhuma venda encontrada.</td>
            </tr>
          </tbody>
        </v-table>
      </div>
      <div v-if="totalPaginas > 1" class="d-flex justify-center mt-4">
        <v-pagination v-model="pagina" :length="totalPaginas" :total-visible="7" @update:model-value="buscar" />
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
