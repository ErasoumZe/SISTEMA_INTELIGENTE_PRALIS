<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import { ErroApiCliente, useApi } from "~/composables/useApi";
import { usePermissoes } from "~/composables/usePermissoes";
import { COLUNAS_CONPLUS, valorDaColuna, type ConplusTipo } from "~/utils/conplus-layouts";

const props = defineProps<{ tipo: ConplusTipo }>();
type Previa = {
  tipo: string;
  arquivo: string;
  persistido: true;
  previewId: string;
  registros: Array<Record<string, string | number | boolean | null>>;
  totalRegistros: number;
  diagnosticos: Array<{ linha: number; mensagem: string }>;
  limitePrevia: number;
};
type Importacao = {
  id: string;
  tipo: string;
  competencia: string;
  nomeArquivo: string;
  status: string;
  sincronizacaoStatus: string;
  totalRegistros: number;
  ultimoErroMensagem: string | null;
  criadoEm: string;
};
type Historico = {
  id: string;
  acao: string;
  statusAnterior: string | null;
  statusNovo: string | null;
  criadoEm: string;
};
type RegistroPersistido = { id: string; codigoColaborador: string | null; nomeColaborador: string | null };
type PreviaGoogle = {
  aba: string;
  linhaCabecalho: number;
  primeiraLinhaDados: number;
  registroIds: string[];
  celulas: Array<{ endereco: string; cabecalho: string; valor: string | number | boolean; conflito: string | null }>;
  celulasVazias: string[];
  conflitos: string[];
  podeGravar: boolean;
};

const EVENTOS = ["80", "165", "167", "4006"];
const IDENTIFICACAO = [
  "Func",
  "Nome",
  "Adm",
  "Dem",
  "Dep.IR",
  "Dedução IR.",
  "Dep.SF",
  "Cargo",
  "C.H.M.",
  "Salário",
  "Cbo",
  "Sind",
  "FReg",
  "Situação",
  "Filial",
  "CNPJ/CPF",
  "Organograma"
];
const LEGACY_COLUNAS: Record<ConplusTipo, string[]> = {
  folha_05: [
    ...IDENTIFICACAO,
    ...EVENTOS.flatMap((evento) => [`${evento} — Natureza`, `${evento} — Referência`, `${evento} — Valor`]),
    "Totais",
    "Bases"
  ],
  adiantamento_20: [
    ...IDENTIFICACAO,
    ...EVENTOS.flatMap((evento) => [`${evento} — Natureza`, `${evento} — Referência`, `${evento} — Valor`]),
    "Totais",
    "Bases"
  ],
  rescisoes: [
    "Código (Funcionário)",
    "Nome",
    "Adm (Data de Admissão)",
    "Aviso Prev",
    "Dem (Data de Demissão)",
    "Seq",
    "Saldo FGTS",
    "Salário",
    "Proventos",
    "Descontos",
    "Líquido",
    "FGTS-GRRF",
    "Causa Demissão"
  ],
  ferias: [
    "Mês",
    "Código",
    "Colaborador",
    "Limite s/ dobra",
    "Admissão",
    "Período inicial",
    "Período final",
    "Faltas",
    "Afast.",
    "Saldo",
    "Pago",
    "Tipo",
    "Qtd."
  ]
};
void LEGACY_COLUNAS;
const CONFIG: Record<ConplusTipo, { titulo: string; descricao: string; extensoes: string; podeImportar: boolean }> = {
  folha_05: {
    titulo: "Folha de pagamento — Dia 05",
    descricao: "Identificação, eventos, totais e bases da folha mensal.",
    extensoes: "",
    podeImportar: false
  },
  adiantamento_20: {
    titulo: "Adiantamento — Dia 20",
    descricao: "Identificação e eventos oficiais do adiantamento salarial.",
    extensoes: "",
    podeImportar: false
  },
  rescisoes: {
    titulo: "Rescisões",
    descricao: "Rescisões calculadas pelo Conplus, com importação TXT.",
    extensoes: ".txt,.nli",
    podeImportar: true
  },
  ferias: {
    titulo: "Férias",
    descricao: "Períodos aquisitivos e férias, com importação CSV.",
    extensoes: ".csv",
    podeImportar: true
  }
};

const config = computed(() => CONFIG[props.tipo]);
const colunas = computed(() => COLUNAS_CONPLUS[props.tipo]);
const { apiGet, apiUpload, apiPost, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const { temPermissao } = usePermissoes(
  computed(() => sessao.value?.perfil?.permissoes ?? []),
  false
);
const previa = ref<Previa | null>(null);
const carregando = ref(false);
const erro = ref("");
const arquivoSelecionado = ref<File | null>(null);
const competencia = ref(new Date().toISOString().slice(0, 10));
const confirmando = ref(false);
const confirmado = ref(false);
const importacoes = ref<Importacao[]>([]);
const filtroBusca = ref("");
const filtroCompetencia = ref("");
const carregandoImportacoes = ref(false);
const historicoAberto = ref<string | null>(null);
const historico = ref<Historico[]>([]);
const carregandoHistorico = ref(false);
const registrosPersistidos = ref<RegistroPersistido[]>([]);
const registroSelecionadoId = ref("");
const previaGoogle = ref<PreviaGoogle | null>(null);
const carregandoPreviaGoogle = ref(false);
const importacaoGoogleAbertaId = ref<string | null>(null);

function selecionarArquivo(evento: Event) {
  arquivoSelecionado.value = (evento.target as HTMLInputElement).files?.[0] ?? null;
  previa.value = null;
  confirmado.value = false;
  previaGoogle.value = null;
  importacaoGoogleAbertaId.value = null;
  erro.value = "";
}
async function enviarParaPrevia() {
  if (!arquivoSelecionado.value || !config.value.podeImportar || carregando.value) return;
  carregando.value = true;
  erro.value = "";
  previa.value = null;
  try {
    const formData = new FormData();
    formData.append("arquivo", arquivoSelecionado.value);
    formData.append("competencia", competencia.value);
    previa.value = await apiUpload<Previa>("/api/conplus/importacoes/preview", formData);
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível ler o arquivo Conplus.";
  } finally {
    carregando.value = false;
  }
}
async function confirmarImportacao() {
  if (!previa.value || confirmando.value || !temPermissao("conplus_importacoes_confirmar")) return;
  confirmando.value = true;
  erro.value = "";
  try {
    await apiPost("/api/conplus/importacoes/confirmar", { previewId: previa.value.previewId, retificar: false });
    confirmado.value = true;
    const detalhe = await apiGet<{ registros: RegistroPersistido[] }>(
      `/api/conplus/importacoes/${previa.value.previewId}`
    );
    registrosPersistidos.value = detalhe.registros;
    registroSelecionadoId.value = detalhe.registros[0]?.id ?? "";
    await carregarImportacoes();
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível confirmar a importação.";
  } finally {
    confirmando.value = false;
  }
}
async function executarPreviaGoogle(importacaoId: string, registroId: string) {
  if (!registroId || carregandoPreviaGoogle.value) return;
  carregandoPreviaGoogle.value = true;
  previaGoogle.value = null;
  erro.value = "";
  try {
    previaGoogle.value = await apiPost<PreviaGoogle>(
      `/api/conplus/importacoes/${importacaoId}/sincronizar/previsualizar`,
      { registroId }
    );
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível preparar a prévia Google.";
  } finally {
    carregandoPreviaGoogle.value = false;
  }
}
async function prepararPreviaGoogle() {
  if (!previa.value || !registroSelecionadoId.value) return;
  importacaoGoogleAbertaId.value = previa.value.previewId;
  await executarPreviaGoogle(previa.value.previewId, registroSelecionadoId.value);
}
async function prepararPreviaGooglePersistida(importacaoId: string) {
  if (carregandoPreviaGoogle.value) return;
  carregandoPreviaGoogle.value = true;
  previaGoogle.value = null;
  erro.value = "";
  try {
    const detalhe = await apiGet<{ importacao: Importacao; registros: RegistroPersistido[] }>(
      `/api/conplus/importacoes/${importacaoId}`
    );
    const registro = detalhe.registros[0];
    if (detalhe.importacao.status !== "confirmada" && detalhe.importacao.status !== "retificada") {
      throw new Error("A importação precisa estar confirmada antes da prévia Google.");
    }
    if (!registro) throw new Error("A importação confirmada não possui registros para prévia Google.");
    importacaoGoogleAbertaId.value = importacaoId;
    registrosPersistidos.value = detalhe.registros;
    registroSelecionadoId.value = registro.id;
    carregandoPreviaGoogle.value = false;
    await executarPreviaGoogle(importacaoId, registro.id);
  } catch (falha) {
    erro.value =
      falha instanceof ErroApiCliente || falha instanceof Error
        ? falha.message
        : "Não foi possível carregar a importação para a prévia Google.";
    carregandoPreviaGoogle.value = false;
  }
}
async function carregarImportacoes() {
  if (!temPermissao("conplus_importacoes_visualizar") || carregandoImportacoes.value) return;
  carregandoImportacoes.value = true;
  try {
    const params = new URLSearchParams({ tipo: props.tipo });
    if (filtroCompetencia.value) params.set("competencia", filtroCompetencia.value);
    if (filtroBusca.value.trim()) params.set("busca", filtroBusca.value.trim());
    importacoes.value = await apiGet<Importacao[]>(`/api/conplus/importacoes?${params.toString()}`);
  } catch (falha) {
    erro.value =
      falha instanceof ErroApiCliente ? falha.message : "Não foi possível consultar as importações persistidas.";
  } finally {
    carregandoImportacoes.value = false;
  }
}
async function abrirHistorico(importacaoId: string) {
  if (historicoAberto.value === importacaoId) {
    historicoAberto.value = null;
    return;
  }
  carregandoHistorico.value = true;
  try {
    historico.value = await apiGet<Historico[]>(`/api/conplus/importacoes/${importacaoId}/historico`);
    historicoAberto.value = importacaoId;
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível consultar o histórico.";
  } finally {
    carregandoHistorico.value = false;
  }
}
function resumoHistorico(item: Historico) {
  return `${item.statusAnterior ?? "-"} → ${item.statusNovo ?? "-"}`;
}
onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (sessao.value) await carregarImportacoes();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível carregar a sessão.";
  }
});
watch([filtroBusca, filtroCompetencia], () => void carregarImportacoes());
</script>

<template>
  <AppWorkspace tela-inicial="departamento_pessoal" tipo-pagina="departamento_pessoal">
    <main class="pagina-conplus">
      <header class="cabecalho">
        <div>
          <p class="sobretitulo">Departamento pessoal · Conplus</p>
          <h1>{{ config.titulo }}</h1>
          <p class="subtitulo">{{ config.descricao }} Consulte os registros sem depender de selecionar um arquivo.</p>
        </div>
        <v-chip color="warning" variant="tonal" prepend-icon="mdi-eye-outline">Google controlado</v-chip>
      </header>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
      <v-card v-if="config.podeImportar" variant="outlined" class="mb-5"
        ><v-card-title>Arquivo de origem</v-card-title
        ><v-card-text
          ><p class="texto-ajuda">Valide o arquivo oficial antes de confirmar a importação no PostgreSQL.</p>
          <div class="acoes-arquivo">
            <input type="file" :accept="config.extensoes" @change="selecionarArquivo" /><v-text-field
              v-model="competencia"
              type="date"
              label="Competência"
              density="compact"
              hide-details="auto"
            /><v-btn
              color="primary"
              :loading="carregando"
              :disabled="!arquivoSelecionado"
              prepend-icon="mdi-file-search-outline"
              @click="enviarParaPrevia"
              >Validar e pré-visualizar</v-btn
            >
          </div>
          <span v-if="arquivoSelecionado" class="nome-arquivo">{{ arquivoSelecionado.name }}</span></v-card-text
        ></v-card
      >
      <v-alert v-else type="info" variant="tonal" class="mb-5"
        >A importação automática desta folha depende da validação do layout oficial de origem Conplus.</v-alert
      >
      <v-card variant="outlined"
        ><v-card-text>
          <div class="cabecalho-tabela">
            <div>
              <h2>Estrutura da tabela</h2>
              <p class="texto-ajuda">Os campos permanecem visíveis mesmo quando ainda não há registros importados.</p>
            </div>
            <v-chip size="small" variant="outlined">{{ colunas.length }} colunas</v-chip>
          </div>
          <div class="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th v-for="coluna in colunas" :key="coluna">{{ coluna }}</th>
                </tr>
              </thead>
              <tbody v-if="previa?.registros.length">
                <tr v-for="(registro, indice) in previa.registros" :key="indice">
                  <td v-for="coluna in colunas" :key="coluna">{{ valorDaColuna(props.tipo, registro, coluna) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!previa" class="estado-vazio">Nenhum registro carregado nesta consulta.</p>
          <p v-else-if="!previa.registros.length" class="estado-vazio">Nenhum registro válido para exibição.</p>
          <template v-if="previa"
            ><v-alert v-if="confirmado" type="success" variant="tonal" class="mt-4"
              >Importação confirmada e persistida no PostgreSQL.</v-alert
            ><v-alert v-if="previa.diagnosticos.length" type="warning" variant="tonal" class="mt-4"
              >{{ previa.diagnosticos.length }} diagnóstico(s) precisam ser revisados.</v-alert
            ><v-btn
              v-if="temPermissao('conplus_importacoes_confirmar') && !confirmado"
              class="mt-4"
              color="primary"
              :loading="confirmando"
              :disabled="!previa.previewId || previa.diagnosticos.length > 0"
              prepend-icon="mdi-check-circle-outline"
              @click="confirmarImportacao"
              >Confirmar importação</v-btn
            ></template
          >
          <v-card
            v-if="(confirmado || importacaoGoogleAbertaId) && temPermissao('conplus_importacoes_sincronizar')"
            variant="tonal"
            class="mt-6"
            ><v-card-title>Prévia de sincronização Google</v-card-title
            ><v-card-text
              ><p class="texto-ajuda">Leitura somente. Nenhuma célula será alterada nesta etapa.</p>
              <v-select
                v-model="registroSelecionadoId"
                :items="registrosPersistidos"
                item-title="nomeColaborador"
                item-value="id"
                label="Registro"
                :disabled="carregandoPreviaGoogle"
              /><v-btn
                color="primary"
                variant="outlined"
                :loading="carregandoPreviaGoogle"
                :disabled="!registroSelecionadoId"
                prepend-icon="mdi-file-search-outline"
                @click="prepararPreviaGoogle"
                >Preparar prévia</v-btn
              ><v-alert
                v-if="previaGoogle"
                :type="previaGoogle.podeGravar ? 'success' : 'warning'"
                variant="tonal"
                class="mt-4"
                >{{
                  previaGoogle.podeGravar ? "Prévia sem conflitos." : "A gravação está bloqueada por conflitos."
                }}
                Aba: {{ previaGoogle.aba }} · primeira linha candidata: {{ previaGoogle.primeiraLinhaDados }}.</v-alert
              >
              <div v-if="previaGoogle" class="tabela-wrap mt-4">
                <table>
                  <thead>
                    <tr>
                      <th>Endereço</th>
                      <th>Cabeçalho</th>
                      <th>Valor</th>
                      <th>Conflito</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="celula in previaGoogle.celulas" :key="celula.endereco">
                      <td>{{ celula.endereco }}</td>
                      <td>{{ celula.cabecalho }}</td>
                      <td>{{ celula.valor }}</td>
                      <td>{{ celula.conflito ?? "-" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div></v-card-text
            ></v-card
          >
          <v-divider class="my-6" />
          <div class="cabecalho-registros">
            <div>
              <h3>Importações persistidas</h3>
              <p class="texto-ajuda">Consulta dos arquivos confirmados e seus status.</p>
            </div>
            <v-btn
              variant="outlined"
              prepend-icon="mdi-refresh"
              :loading="carregandoImportacoes"
              @click="carregarImportacoes"
              >Atualizar</v-btn
            >
          </div>
          <div class="filtros-registros">
            <v-text-field
              v-model="filtroBusca"
              label="Arquivo ou hash"
              density="compact"
              hide-details="auto"
            /><v-text-field
              v-model="filtroCompetencia"
              type="date"
              label="Competência"
              density="compact"
              hide-details="auto"
            /><v-text-field
              :model-value="sessao?.empresas?.[0]?.nome ?? 'Empresa atual'"
              label="Empresa (definida pelo perfil)"
              density="compact"
              hide-details="auto"
              readonly
            />
          </div>
          <div v-if="carregandoImportacoes" class="texto-ajuda">Carregando importações...</div>
          <div v-else-if="!importacoes.length" class="estado-vazio">Nenhuma importação persistida nesta página.</div>
          <div v-else class="lista-importacoes">
            <v-card v-for="importacao in importacoes" :key="importacao.id" variant="tonal" class="item-importacao"
              ><v-card-text
                ><div class="linha-importacao">
                  <div>
                    <strong>{{ importacao.nomeArquivo }}</strong>
                    <div class="texto-ajuda">
                      {{ importacao.competencia }} · {{ importacao.totalRegistros }} registro(s)
                    </div>
                  </div>
                  <div class="chips-importacao">
                    <v-chip size="small" variant="outlined">{{ importacao.status }}</v-chip
                    ><v-chip size="small" variant="outlined">Google: {{ importacao.sincronizacaoStatus }}</v-chip>
                  </div>
                </div>
                <v-alert
                  v-if="importacao.ultimoErroMensagem"
                  type="error"
                  variant="tonal"
                  density="compact"
                  class="mt-3"
                  >{{ importacao.ultimoErroMensagem }}</v-alert
                ><v-btn
                  variant="text"
                  size="small"
                  prepend-icon="mdi-history"
                  :loading="carregandoHistorico && historicoAberto === importacao.id"
                  @click="abrirHistorico(importacao.id)"
                  >{{ historicoAberto === importacao.id ? "Ocultar histórico" : "Ver histórico" }}</v-btn
                ><v-btn
                  v-if="
                    temPermissao('conplus_importacoes_sincronizar') &&
                    ['confirmada', 'retificada'].includes(importacao.status)
                  "
                  variant="text"
                  size="small"
                  prepend-icon="mdi-file-search-outline"
                  :loading="carregandoPreviaGoogle && importacaoGoogleAbertaId === importacao.id"
                  @click="prepararPreviaGooglePersistida(importacao.id)"
                  >Prévia Google</v-btn
                ><v-list v-if="historicoAberto === importacao.id" density="compact" class="mt-2"
                  ><v-list-item
                    v-for="item in historico"
                    :key="item.id"
                    :title="item.acao"
                    :subtitle="resumoHistorico(item)" /></v-list></v-card-text
            ></v-card>
          </div> </v-card-text
      ></v-card>
    </main>
  </AppWorkspace>
</template>

<style scoped>
.pagina-conplus {
  max-width: 1440px;
  margin: 0 auto;
  padding: 16px;
}
.cabecalho,
.cabecalho-registros,
.cabecalho-tabela,
.linha-importacao {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.cabecalho {
  align-items: flex-start;
  margin-bottom: 24px;
}
.sobretitulo {
  color: rgb(var(--v-theme-primary));
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 {
  font-size: clamp(1.45rem, 3vw, 2.1rem);
}
h2 {
  font-size: 1.15rem;
}
h3 {
  margin: 0;
  font-size: 1rem;
}
.subtitulo,
.texto-ajuda {
  color: rgb(var(--v-theme-on-surface) / 0.68);
}
.acoes-arquivo,
.chips-importacao {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.acoes-arquivo .v-input {
  min-width: 180px;
}
.nome-arquivo {
  display: block;
  margin-top: 10px;
}
.filtros-registros {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}
.lista-importacoes {
  display: grid;
  gap: 10px;
}
.item-importacao {
  border: 1px solid rgb(var(--v-theme-on-surface) / 0.12);
}
.tabela-wrap {
  max-width: 100%;
  overflow-x: auto;
}
table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 9px 12px;
  border-bottom: 1px solid rgb(var(--v-theme-on-surface) / 0.12);
  text-align: left;
  white-space: nowrap;
}
th {
  background: rgb(var(--v-theme-on-surface) / 0.06);
  font-size: 0.82rem;
}
.estado-vazio {
  padding: 18px 0;
  color: rgb(var(--v-theme-on-surface) / 0.6);
}
@media (max-width: 800px) {
  .filtros-registros {
    grid-template-columns: 1fr;
  }
  .acoes-arquivo input {
    max-width: 100%;
  }
}
</style>
