<script setup lang="ts">
import type {
  AuthSession,
  DadosInternosDto,
  FuncaoOpcaoDto,
  HistoricoProcessoDto,
  ProcessoDetalheDto,
  ProcessoListaDto,
  SituacaoExame
} from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { ErroApiCliente } from "~/composables/useApi";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import {
  corSituacaoExame,
  corStatusProcesso,
  rotuloIdentidadeProcesso,
  rotuloOrigemProcesso,
  rotuloSituacaoExame,
  rotuloStatusProcesso
} from "~/utils/admissoes";
import ProcessoDetalhePainel from "~/components/admissoes/ProcessoDetalhePainel.vue";
import ProcessoNovoDialog from "~/components/admissoes/ProcessoNovoDialog.vue";

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
const novoAberto = ref(false);
const salvando = ref(false);
const novoErro = ref("");

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

async function carregarFuncoes() {
  try {
    funcoes.value = await apiGet<FuncaoOpcaoDto[]>("/api/admissoes/funcoes");
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

async function criarDireta(dados: { funcaoId: string; jornadaHorario: string; dataAdmissao: string }) {
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

async function salvarInternos(
  dados: Omit<DadosInternosDto, "exameExigeAtencao" | "exameAtualizadoPorNome" | "exameAtualizadoEm">
) {
  if (!processo.value) return;
  processando.value = true;
  try {
    await apiPut(`/api/admissoes/processos/${processo.value.id}/internos`, dados);
    notificar("Dados internos salvos.");
    await abrirDetalhe(processo.value.id);
    await carregar();
  } catch (error) {
    tratarErro(error);
  } finally {
    processando.value = false;
  }
}

async function atualizarExame(situacao: SituacaoExame) {
  if (!processo.value) return;
  processando.value = true;
  try {
    await apiPut(`/api/admissoes/processos/${processo.value.id}/exame`, {
      versao: processo.value.internos.versao,
      situacao
    });
    notificar("Exame admissional atualizado.");
    await abrirDetalhe(processo.value.id);
    await carregar();
  } catch (error) {
    tratarErro(error);
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

function dataExibida(data: string | null) {
  return data ? data.split("-").reverse().join("/") : "—";
}

onMounted(async () => {
  await carregar();
  if (podeCriarDireta.value) await carregarFuncoes();
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

    <v-table v-if="linhas.length" density="comfortable">
      <thead>
        <tr>
          <th>Candidato</th>
          <th>Origem</th>
          <th>Função</th>
          <th>Admissão</th>
          <th>Exame</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="linha in linhas" :key="linha.id">
          <td>
            <span :class="{ 'sem-nome': !linha.nomeCompleto }">
              {{ rotuloIdentidadeProcesso(linha.nomeCompleto) }}
            </span>
          </td>
          <td>{{ rotuloOrigemProcesso[linha.origem] }}</td>
          <td>{{ linha.funcaoNome ?? "—" }}</td>
          <td>{{ dataExibida(linha.dataAdmissao) }}</td>
          <td>
            <v-chip size="x-small" variant="tonal" :color="corSituacaoExame(linha.exameSituacao)">
              {{ rotuloSituacaoExame[linha.exameSituacao] }}
            </v-chip>
          </td>
          <td>
            <v-chip size="x-small" variant="tonal" :color="corStatusProcesso(linha.status)">
              {{ rotuloStatusProcesso[linha.status] }}
            </v-chip>
          </td>
          <td class="text-end">
            <v-btn variant="text" size="small" @click="abrirDetalhe(linha.id)">Abrir</v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>

    <p v-else-if="!carregando" class="vazio">
      Nenhum processo de admissão nesta empresa ainda. Eles nascem ao efetivar um período de teste
      ou, aqui, por “+ Novo cadastro”.
    </p>

    <nav v-if="totalPaginas > 1" class="paginacao">
      <v-btn variant="text" size="small" :disabled="pagina <= 1" @click="trocarPagina(pagina - 1)">
        Anterior
      </v-btn>
      <span>{{ pagina }} de {{ totalPaginas }}</span>
      <v-btn
        variant="text"
        size="small"
        :disabled="pagina >= totalPaginas"
        @click="trocarPagina(pagina + 1)"
      >
        Próxima
      </v-btn>
    </nav>
  </section>

  <ProcessoNovoDialog
    :aberto="novoAberto"
    :funcoes="funcoes"
    :salvando="salvando"
    :erro="novoErro"
    @fechar="novoAberto = false"
    @salvar="criarDireta"
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
    @salvar-internos="salvarInternos"
    @atualizar-exame="atualizarExame"
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
