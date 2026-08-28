<script setup lang="ts">
import type {
  AuthSession,
  DadosInternosDto,
  FuncaoOpcaoDto,
  HistoricoProcessoDto,
  ProcessoDetalheDto,
  ProcessoListaDto,
  SituacaoExame,
  TurnoOpcaoDto
} from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { mascararCnpj } from "~/utils/formatacao";
import { ErroApiCliente } from "~/composables/useApi";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import ProcessoDetalhePainel from "~/components/admissoes/ProcessoDetalhePainel.vue";
import ProcessoInternosDialog from "~/components/admissoes/ProcessoInternosDialog.vue";
import ProcessoNovoDialog from "~/components/admissoes/ProcessoNovoDialog.vue";
import ProcessosTabela from "~/components/admissoes/ProcessosTabela.vue";

/**
 * ADM-003 V1A — "Processos de admissão".
 *
 * A lista existe porque a admissao direta nao tem teste de onde ser alcancada: sem ela, um processo
 * direto nasceria inalcancavel. E CONSULTA — a unica acao de criacao e o "+ Novo cadastro" do topo,
 * e ele so cria admissao direta. Quem veio de teste chega aqui ja criado, pela efetivacao.
 *
 * Nenhum `empresaId` sai daqui: a empresa e derivada no servidor a partir do perfil autorizado.
 */
const { apiGet, apiGetPaginado, apiPost, apiPut } = useApi();

const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeCriarDireta = computed(() => temPermissao(permissoes.value, "admissoes_processos_criar_direta"));
const podeCancelar = computed(() => temPermissao(permissoes.value, "admissoes_processos_cancelar"));
const podeEditarInternos = computed(() =>
  temPermissao(permissoes.value, "admissoes_processos_editar_internos")
);

const CODIGOS_BLOQUEIO = new Set(["PROFILE_COMPANY_NOT_SET", "PROFILE_COMPANY_OUT_OF_SCOPE"]);

const linhas = ref<ProcessoListaDto[]>([]);
const total = ref(0);
const pagina = ref(1);
const itensPorPagina = 10;
const carregando = ref(false);
const erro = ref("");
const bloqueio = ref("");
const snackbar = reactive({ show: false, text: "", color: "success" });

const funcoes = ref<FuncaoOpcaoDto[]>([]);
const turnos = ref<TurnoOpcaoDto[]>([]);
const novoAberto = ref(false);
const salvando = ref(false);
const novoErro = ref("");

// Empresa e CNPJ vem do PERFIL, nunca do cliente. Aparecem so para conferencia — nao ha seletor.
const empresaDoPerfil = computed(() => {
  const empresaId = sessao.value?.perfil?.empresaId;
  return sessao.value?.empresas?.find((empresa) => empresa.id === empresaId) ?? null;
});
const empresaNome = computed(() => empresaDoPerfil.value?.nome ?? "");
const empresaCnpj = computed(() =>
  empresaDoPerfil.value?.cnpj ? mascararCnpj(empresaDoPerfil.value.cnpj) : ""
);

const internosAberto = ref(false);
const internosErro = ref("");

const detalheAberto = ref(false);
const detalheCarregando = ref(false);
const processando = ref(false);
const processo = ref<ProcessoDetalheDto | null>(null);
const historico = ref<HistoricoProcessoDto[]>([]);

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

function tratarErro(error: unknown, notificando = true) {
  if (error instanceof ErroApiCliente && error.codigo && CODIGOS_BLOQUEIO.has(error.codigo)) {
    bloqueio.value = error.message;
    return;
  }
  if (notificando) notificar(mensagemErro(error), "error");
  else erro.value = mensagemErro(error);
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const resposta = await apiGetPaginado<ProcessoListaDto>(
      `/api/admissoes/processos?page=${pagina.value}&pageSize=${itensPorPagina}`
    );
    linhas.value = resposta.itens;
    total.value = resposta.total;
  } catch (error) {
    tratarErro(error, false);
  } finally {
    carregando.value = false;
  }
}

async function carregarCatalogos() {
  try {
    funcoes.value = await apiGet<FuncaoOpcaoDto[]>("/api/admissoes/funcoes");
    turnos.value = await apiGet<TurnoOpcaoDto[]>("/api/admissoes/turnos");
  } catch (error) {
    tratarErro(error);
  }
}

function trocarPagina(nova: number) {
  pagina.value = Math.min(Math.max(1, nova), totalPaginas.value);
  void carregar();
}

async function abrirDetalhe(id: string) {
  detalheAberto.value = true;
  detalheCarregando.value = true;
  processo.value = null;
  historico.value = [];
  try {
    processo.value = await apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${id}`);
    const eventos = await apiGetPaginado<HistoricoProcessoDto>(
      `/api/admissoes/processos/${id}/historico?page=1&pageSize=50`
    );
    historico.value = eventos.itens;
  } catch (error) {
    detalheAberto.value = false;
    tratarErro(error);
  } finally {
    detalheCarregando.value = false;
  }
}

async function criarDireta(dados: {
  nomeCompleto: string;
  cpf: string;
  funcaoId: string;
  turnoId: string;
  dataAdmissao: string;
}) {
  salvando.value = true;
  novoErro.value = "";
  try {
    const criado = await apiPost<{ id: string }>("/api/admissoes/processos", dados);
    novoAberto.value = false;
    notificar("Processo de admissão criado.");
    await carregar();
    await abrirDetalhe(criado.id);
  } catch (error) {
    novoErro.value = mensagemErro(error);
  } finally {
    salvando.value = false;
  }
}

async function salvarInternos(dados: Record<string, unknown>) {
  if (!processo.value) return;
  processando.value = true;
  internosErro.value = "";
  try {
    await apiPut(`/api/admissoes/processos/${processo.value.id}/internos`, dados);
    internosAberto.value = false;
    notificar("Dados internos salvos.");
    await abrirDetalhe(processo.value.id);
    await carregar();
  } catch (error) {
    internosErro.value = mensagemErro(error);
  } finally {
    processando.value = false;
  }
}

/**
 * O exame tem rota e versao PROPRIAS no servidor: alterar o bloco interno nao e alterar o exame.
 * Quem opera ve um formulario so — a separacao vive no contrato, nao na tela.
 *
 * Pausa e retomada acontecem no servidor, dentro desta mesma chamada. Nao ha botao de retomar.
 */
async function salvarExame(situacao: SituacaoExame) {
  if (!processo.value) return;
  processando.value = true;
  internosErro.value = "";
  try {
    await apiPut(`/api/admissoes/processos/${processo.value.id}/exame`, {
      versao: processo.value.internos.versao,
      situacao
    });
    internosAberto.value = false;
    notificar("Exame admissional atualizado.");
    await abrirDetalhe(processo.value.id);
    await carregar();
  } catch (error) {
    internosErro.value = mensagemErro(error);
  } finally {
    processando.value = false;
  }
}

async function cancelarProcesso() {
  if (!processo.value) return;
  processando.value = true;
  try {
    await apiPost(`/api/admissoes/processos/${processo.value.id}/cancelar`, {
      versao: processo.value.versao
    });
    notificar("Processo de admissão cancelado e arquivado.");
    await abrirDetalhe(processo.value.id);
    await carregar();
  } catch (error) {
    tratarErro(error);
  } finally {
    processando.value = false;
  }
}


onMounted(async () => {
  await carregar();
  if (podeCriarDireta.value) await carregarCatalogos();
});
</script>

<template>
  <v-alert v-if="bloqueio" type="warning" variant="tonal" class="ma-4">{{ bloqueio }}</v-alert>

  <section v-else class="pagina">
    <header class="cabecalho">
      <div>
        <h2>Processos de admissão</h2>
        <p class="subtitulo">
          Um processo por admissão, venha ele de um período de teste efetivado ou de um cadastro
          direto.
        </p>
      </div>
      <!-- A UNICA acao de criacao desta tela. Nao ha "iniciar", nao ha "efetivar": quem veio de teste
           chega aqui ja criado, pela tela de Testes. -->
      <v-btn v-if="podeCriarDireta" color="primary" variant="flat" @click="novoAberto = true">
        + Novo cadastro
      </v-btn>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>

    <ProcessosTabela
      :linhas="linhas"
      :carregando="carregando"
      :pagina="pagina"
      :total-paginas="totalPaginas"
      @abrir="abrirDetalhe"
      @trocar-pagina="trocarPagina"
    />
  </section>

  <ProcessoNovoDialog
    :aberto="novoAberto"
    :funcoes="funcoes"
    :turnos="turnos"
    :empresa-nome="empresaNome"
    :empresa-cnpj="empresaCnpj"
    :salvando="salvando"
    :erro="novoErro"
    @fechar="novoAberto = false"
    @salvar="criarDireta"
  />

  <ProcessoInternosDialog
    :aberto="internosAberto"
    :internos="processo?.internos ?? null"
    :salvando="processando"
    :erro="internosErro"
    @fechar="internosAberto = false"
    @salvar="salvarInternos"
    @salvar-exame="salvarExame"
  />

  <ProcessoDetalhePainel
    :aberto="detalheAberto"
    :processo="processo"
    :historico="historico"
    :carregando="detalheCarregando"
    :pode-cancelar="podeCancelar"
    :pode-editar-internos="podeEditarInternos"
    :processando="processando"
    @fechar="detalheAberto = false"
    @cancelar="cancelarProcesso"
    @editar-internos="() => { internosErro = ''; internosAberto = true; }"
  />

  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.pagina {
  padding: 16px;
}
.cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.cabecalho h2 {
  font-size: 1.15rem;
  font-weight: 600;
}
.subtitulo {
  font-size: 0.85rem;
  opacity: 0.75;
  max-width: 60ch;
}
.sem-nome {
  opacity: 0.7;
  font-style: italic;
}
.vazio {
  font-size: 0.9rem;
  opacity: 0.75;
  padding: 24px 0;
}
.paginacao {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
  font-size: 0.85rem;
}
</style>
