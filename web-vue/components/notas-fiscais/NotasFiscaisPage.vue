<script setup lang="ts">
import type {
  AuthSession,
  ImportarNotasFiscaisResultado,
  NotaFiscalDetalheDto,
  NotaFiscalDto,
  StatusImportacaoNotaFiscal
} from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { dinheiro, mensagemErro } from "~/utils/domain";
import { formatarDataSomenteDia, formatarDiaDeTimestamp } from "~/utils/formatacao";

const props = defineProps<{ empresaId: string }>();

const { apiGet, apiGetPaginado, apiPost } = useApi();

const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const podeImportar = computed(() => temPermissao(sessao.value?.perfil?.permissoes ?? [], "notas_fiscais_importar"));

const opcoesStatus: { valor: StatusImportacaoNotaFiscal; rotulo: string }[] = [
  { valor: "pendente_revisao", rotulo: "Pendente de revisao" },
  { valor: "revisada", rotulo: "Revisada" },
  { valor: "ignorada", rotulo: "Ignorada" },
  { valor: "cancelada", rotulo: "Cancelada" }
];

// Datas locais em ISO (yyyy-MM-dd); usadas no filtro da listagem e na importacao por periodo.
function isoLocal(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
const hoje = new Date();
const inicioDoMesIso = isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
const hojeIso = isoLocal(hoje);

const filtroStatus = ref<StatusImportacaoNotaFiscal>("pendente_revisao");
const filtroInicio = ref(inicioDoMesIso);
const filtroFim = ref(hojeIso);
const linhas = ref<NotaFiscalDto[]>([]);
const totalGeral = ref(0);
const carregando = ref(false);
const erro = ref("");

// Filtro por periodo aplicado no cliente: o endpoint de listagem aceita empresa + status (sem
// recorte por data), entao recortamos por data de emissao aqui, sem alterar a API ja publicada.
// dataEmissao chega como ISO (yyyy-MM-ddT...); comparar os 10 primeiros caracteres basta para ISO.
const linhasFiltradas = computed(() =>
  linhas.value.filter((linha) => {
    const dia = (linha.dataEmissao ?? "").slice(0, 10);
    if (!dia) return !filtroInicio.value && !filtroFim.value;
    if (filtroInicio.value && dia < filtroInicio.value) return false;
    if (filtroFim.value && dia > filtroFim.value) return false;
    return true;
  })
);

function corStatus(status: string) {
  if (status === "revisada") return "success";
  if (status === "cancelada") return "error";
  if (status === "ignorada") return "grey";
  return "warning";
}

function rotuloStatus(status: string) {
  return opcoesStatus.find((opcao) => opcao.valor === status)?.rotulo ?? status;
}

// dataEmissao e timestamp REAL: o dia tem de sair do fuso local. Fatiar o ISO ("2026-07-16T01:00Z")
// devolvia o dia em UTC — uma emissao as 22h de 15/07 em BRT aparecia como 16/07.
function soData(iso: string | null) {
  return formatarDiaDeTimestamp(iso);
}

async function buscar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const params = new URLSearchParams({
      empresaId: props.empresaId,
      statusImportacao: filtroStatus.value,
      pageSize: "100"
    });
    const resultado = await apiGetPaginado<NotaFiscalDto>(`/api/notas-fiscais?${params.toString()}`);
    linhas.value = resultado.itens;
    totalGeral.value = resultado.total;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

// ----- Detalhe -----
const detalheAberto = ref(false);
const detalhe = ref<NotaFiscalDetalheDto | null>(null);
const carregandoDetalhe = ref(false);

async function abrirDetalhe(id: string) {
  detalheAberto.value = true;
  detalhe.value = null;
  carregandoDetalhe.value = true;
  try {
    detalhe.value = await apiGet<NotaFiscalDetalheDto>(`/api/notas-fiscais/${id}`);
  } catch (error) {
    erro.value = mensagemErro(error);
    detalheAberto.value = false;
  } finally {
    carregandoDetalhe.value = false;
  }
}

// ----- Importacao por periodo -----
const importDialog = ref(false);
const importForm = reactive({
  dataInicio: inicioDoMesIso,
  dataFim: hojeIso
});
const importando = ref(false);
const importErro = ref("");
const importResultado = ref<ImportarNotasFiscaisResultado | null>(null);

function abrirImport() {
  importErro.value = "";
  importResultado.value = null;
  importDialog.value = true;
}

async function importar() {
  importando.value = true;
  importErro.value = "";
  try {
    importResultado.value = await apiPost<ImportarNotasFiscaisResultado>("/api/notas-fiscais/importar", {
      empresaId: props.empresaId,
      dataInicio: importForm.dataInicio,
      dataFim: importForm.dataFim
    });
    await buscar();
  } catch (error) {
    importErro.value = mensagemErro(error);
  } finally {
    importando.value = false;
  }
}

watch(
  () => props.empresaId,
  () => void buscar(),
  { immediate: true }
);
watch(filtroStatus, () => void buscar());
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between ga-3 flex-wrap">
      <div>
        <div class="text-h6">Notas fiscais</div>
        <div class="text-body-2 text-muted">NF-e importadas da contabilidade, para revisao.</div>
      </div>
      <div class="d-flex ga-2">
        <v-btn variant="text" prepend-icon="mdi-refresh" :loading="carregando" @click="buscar">Atualizar</v-btn>
        <v-btn v-if="podeImportar" color="primary" prepend-icon="mdi-cloud-download" @click="abrirImport">
          Importar por periodo
        </v-btn>
      </div>
    </v-card-title>

    <v-card-text>
      <v-row dense class="mb-2 align-center">
        <v-col cols="12" sm="6" md="4">
          <v-select
            v-model="filtroStatus"
            :items="opcoesStatus"
            item-title="rotulo"
            item-value="valor"
            label="Status"
            density="comfortable"
          />
        </v-col>
        <v-col cols="6" sm="3" md="3">
          <v-text-field v-model="filtroInicio" type="date" label="Emissao de" density="comfortable" clearable />
        </v-col>
        <v-col cols="6" sm="3" md="3">
          <v-text-field v-model="filtroFim" type="date" label="Emissao ate" density="comfortable" clearable />
        </v-col>
        <v-col cols="12" md="2" class="text-md-right text-caption text-muted">
          {{ linhasFiltradas.length }} de {{ totalGeral }} nota(s)
        </v-col>
      </v-row>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

      <v-alert v-if="totalGeral > linhas.length" type="info" variant="tonal" density="compact" class="mb-4">
        Exibindo as {{ linhas.length }} notas importadas mais recentemente deste status (de {{ totalGeral }}). Refine
        por status para ver as demais.
      </v-alert>

      <div class="responsive-table-shell">
        <v-table>
          <thead>
            <tr>
              <th>Emissao</th>
              <th>Número/Série</th>
              <th>Fornecedor</th>
              <th>Chave</th>
              <th class="text-right">Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhasFiltradas" :key="linha.id" class="linha-clicavel" @click="abrirDetalhe(linha.id)">
              <td>{{ soData(linha.dataEmissao) }}</td>
              <td>
                {{ linha.numero ?? "—" }}<span v-if="linha.serie" class="text-muted"> / {{ linha.serie }}</span>
              </td>
              <td>
                <div>{{ linha.fornecedorNome ?? "—" }}</div>
                <div class="text-caption text-muted">{{ linha.fornecedorCnpj ?? "" }}</div>
              </td>
              <td class="text-caption">{{ linha.chave }}</td>
              <td class="text-right">{{ linha.valorTotal ? dinheiro(linha.valorTotal) : "—" }}</td>
              <td>{{ formatarDataSomenteDia(linha.dataVencimento) }}</td>
              <td>
                <v-chip :color="corStatus(linha.statusImportacao)" size="small" variant="tonal">
                  {{ rotuloStatus(linha.statusImportacao) }}
                </v-chip>
              </td>
            </tr>
            <tr v-if="!linhasFiltradas.length && !carregando">
              <td colspan="7" class="text-center text-muted py-8">Nenhuma nota fiscal encontrada.</td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </v-card-text>
  </v-card>

  <!-- Dialog: importar por periodo -->
  <v-dialog v-model="importDialog" max-width="520">
    <v-card>
      <v-card-title class="text-h6">Importar NF-e por periodo</v-card-title>
      <v-card-text>
        <p class="text-body-2 text-muted mb-4">
          Busca as NF-e da empresa no webhook da contabilidade e cria as mercadorias pre-preenchidas (aguardando
          aprovacao). Ja importadas sao ignoradas.
        </p>
        <v-row dense>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="importForm.dataInicio" type="date" label="Data inicial"
          /></v-col>
          <v-col cols="12" sm="6"><v-text-field v-model="importForm.dataFim" type="date" label="Data final" /></v-col>
        </v-row>

        <v-alert v-if="importErro" type="error" variant="tonal" class="mt-2">{{ importErro }}</v-alert>

        <v-alert v-if="importResultado" type="success" variant="tonal" class="mt-2">
          <div>
            <strong>{{ importResultado.importadas }}</strong> importada(s),
            <strong>{{ importResultado.puladas }}</strong> ja existente(s),
            <strong>{{ importResultado.erros }}</strong> com erro (de {{ importResultado.totalNotas }} nota(s) no
            periodo).
          </div>
          <ul v-if="importResultado.detalhesErros.length" class="mt-2 text-caption">
            <li v-for="(item, indice) in importResultado.detalhesErros" :key="indice">
              {{ item.chave ?? "sem chave" }}: {{ item.mensagem }}
            </li>
          </ul>
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="importDialog = false">Fechar</v-btn>
        <v-btn color="primary" :loading="importando" @click="importar">Importar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Dialog: detalhe da NF-e -->
  <v-dialog v-model="detalheAberto" max-width="900" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span class="text-h6">Detalhe da NF-e</span>
        <v-btn icon="mdi-close" variant="text" @click="detalheAberto = false" />
      </v-card-title>
      <v-card-text>
        <div v-if="carregandoDetalhe" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </div>
        <div v-else-if="detalhe">
          <v-row dense class="mb-2">
            <v-col cols="12" md="6">
              <div class="text-caption text-muted">Fornecedor</div>
              <div>
                {{ detalhe.fornecedorNome ?? "—" }} <span class="text-muted">{{ detalhe.fornecedorCnpj ?? "" }}</span>
              </div>
            </v-col>
            <v-col cols="6" md="3">
              <div class="text-caption text-muted">Número/Série</div>
              <div>{{ detalhe.numero ?? "—" }} / {{ detalhe.serie ?? "—" }}</div>
            </v-col>
            <v-col cols="6" md="3">
              <div class="text-caption text-muted">Emissao</div>
              <div>{{ soData(detalhe.dataEmissao) }}</div>
            </v-col>
            <v-col cols="12" md="6">
              <div class="text-caption text-muted">Chave</div>
              <div class="text-caption">{{ detalhe.chave }}</div>
            </v-col>
            <v-col cols="6" md="3">
              <div class="text-caption text-muted">Natureza</div>
              <div>{{ detalhe.naturezaOperacao ?? "—" }}</div>
            </v-col>
            <v-col cols="6" md="3">
              <div class="text-caption text-muted">Vencimento</div>
              <div>{{ formatarDataSomenteDia(detalhe.dataVencimento) }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <v-row dense class="mb-2">
            <v-col cols="6" md="3"
              ><div class="text-caption text-muted">Produtos</div>
              <div>{{ detalhe.valorProdutos ? dinheiro(detalhe.valorProdutos) : "—" }}</div></v-col
            >
            <v-col cols="6" md="3"
              ><div class="text-caption text-muted">Desconto</div>
              <div>{{ detalhe.valorDesconto ? dinheiro(detalhe.valorDesconto) : "—" }}</div></v-col
            >
            <v-col cols="6" md="3"
              ><div class="text-caption text-muted">Frete</div>
              <div>{{ detalhe.valorFrete ? dinheiro(detalhe.valorFrete) : "—" }}</div></v-col
            >
            <v-col cols="6" md="3"
              ><div class="text-caption text-muted">Total</div>
              <div>
                <strong>{{ detalhe.valorTotal ? dinheiro(detalhe.valorTotal) : "—" }}</strong>
              </div></v-col
            >
          </v-row>

          <v-alert v-if="detalhe.mercadoriaId" type="info" variant="tonal" density="compact" class="mb-3">
            Mercadoria gerada (aguardando aprovacao) — aprove pela tela de Mercadorias.
          </v-alert>

          <div class="text-subtitle-2 mb-2">Itens ({{ detalhe.itens.length }})</div>
          <div class="responsive-table-shell">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descrição</th>
                  <th>EAN</th>
                  <th>NCM</th>
                  <th>CFOP</th>
                  <th>CEST</th>
                  <th>Un</th>
                  <th class="text-right">Qtd</th>
                  <th class="text-right">Vl. unit.</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in detalhe.itens" :key="item.numeroItem ?? item.descricao ?? ''">
                  <td>{{ item.numeroItem ?? "—" }}</td>
                  <td>{{ item.descricao ?? "—" }}</td>
                  <td class="text-caption">{{ item.ean ?? "—" }}</td>
                  <td>{{ item.ncm ?? "—" }}</td>
                  <td>{{ item.cfop ?? "—" }}</td>
                  <td>{{ item.cest ?? "—" }}</td>
                  <td>{{ item.unidadeComercial ?? "—" }}</td>
                  <td class="text-right">{{ item.quantidade ?? "—" }}</td>
                  <td class="text-right">{{ item.valorUnitario ?? "—" }}</td>
                </tr>
                <tr v-if="!detalhe.itens.length">
                  <td colspan="9" class="text-center text-muted py-4">NF-e sem itens.</td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.linha-clicavel {
  cursor: pointer;
}
.linha-clicavel:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
