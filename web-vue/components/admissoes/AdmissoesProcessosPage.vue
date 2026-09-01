<script setup lang="ts">
import type {
  ConviteEmitidoDto,
  PainelConviteDto,
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
import ProcessoDetalheDialog from "~/components/admissoes/ProcessoDetalheDialog.vue";
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
const { apiGet, apiGetPaginado, apiPost, apiPut, apiDelete } = useApi();

const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeCriarDireta = computed(() => temPermissao(permissoes.value, "admissoes_processos_criar_direta"));
const podeCancelar = computed(() => temPermissao(permissoes.value, "admissoes_processos_cancelar"));
const podeEditarInternos = computed(() =>
  temPermissao(permissoes.value, "admissoes_processos_editar_internos")
);
// Revelar CPF usa a permissao de VISUALIZAR, nao uma terceira: quem pode abrir o processo pode ver
// o documento de quem esta sendo admitido — o que muda e que fica registrado quem viu e quando.
const podeVerCpf = computed(() => temPermissao(permissoes.value, "admissoes_processos_visualizar"));
// ADM-003 V2. Emitir e revogar sao o MESMO direito: quem abre precisa poder fechar.
const podeConvidar = computed(() => temPermissao(permissoes.value, "admissoes_processos_convidar"));

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
// Falha de CADA catalogo, separada. Lista vazia por erro e lista vazia por cadastro vazio
// pedem respostas diferentes, e sem estes dois sinalizadores a tela nao as distingue.
const funcoesFalharam = ref(false);
const turnosFalharam = ref(false);
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

// O CPF revelado vive SO na memoria da tela, e so enquanto o detalhe estiver aberto. Nao vai para
// URL, store, storage nem listagem — e some no fechamento, em `fecharDetalhe`.
const cpfRevelado = ref<string | null>(null);
// O painel do convite e o token vivem AQUI, e nao no modal: e a pagina que faz as chamadas e que
// limpa os dois ao fechar. Token que sobrevive ao fechamento vira segredo esquecido na tela.
const convite = ref<PainelConviteDto | null>(null);
const tokenEmitido = ref<string | null>(null);
const convitePendente = ref(false);
const revelandoCpf = ref(false);

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

/**
 * Os dois catalogos carregam INDEPENDENTES. Em serie no mesmo `try`, um 403 em `/funcoes`
 * impedia `/turnos` de sequer ser chamado, e o seletor vazio dizia "nenhum turno completo" —
 * diagnostico errado para um problema que nem era de turno.
 */
async function carregarCatalogos() {
  const [resultadoFuncoes, resultadoTurnos] = await Promise.allSettled([
    apiGet<FuncaoOpcaoDto[]>("/api/admissoes/funcoes"),
    apiGet<TurnoOpcaoDto[]>("/api/admissoes/turnos")
  ]);

  funcoesFalharam.value = resultadoFuncoes.status === "rejected";
  if (resultadoFuncoes.status === "fulfilled") funcoes.value = resultadoFuncoes.value;

  turnosFalharam.value = resultadoTurnos.status === "rejected";
  if (resultadoTurnos.status === "fulfilled") turnos.value = resultadoTurnos.value;

  // Um aviso so, do primeiro que falhou: dois snackbars para a mesma abertura de tela seriam
  // ruido. O diagnostico especifico aparece dentro do modal, ao lado do campo.
  const falha = [resultadoFuncoes, resultadoTurnos].find((r) => r.status === "rejected");
  if (falha && falha.status === "rejected") tratarErro(falha.reason);
}

function trocarPagina(nova: number) {
  pagina.value = Math.min(Math.max(1, nova), totalPaginas.value);
  void carregar();
}

async function abrirDetalhe(id: string) {
  // Esta funcao tambem e o caminho de RECARGA (depois de revelar, salvar ou cancelar). Trocar de
  // processo apaga o CPF revelado; reler o MESMO processo o mantem, senao revelar se desfaria
  // sozinho no refetch que ele proprio dispara.
  if (processo.value?.id !== id) cpfRevelado.value = null;

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
    convite.value = await apiGet<PainelConviteDto>(`/api/admissoes/processos/${id}/convite`);
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

/**
 * UM salvamento, ainda que o servidor tenha duas rotas. Antes, mudar o exame junto com
 * CTPS/PIS descartava os campos internos em silencio: o modal emitia so o exame e voltava.
 *
 * Ordem: internos PRIMEIRO, exame depois. As duas rotas travam pelo MESMO contador
 * (`internos.versao`) e cada PUT o incrementa, entao o segundo precisa da versao relida — dai
 * o GET no meio. E se o exame falhar, os dados do DP ja estao salvos e so a escolha do exame
 * precisa ser refeita; na ordem inversa o processo pausaria e os dados se perderiam.
 */
async function salvarInternos(
  dados: Record<string, unknown> | null,
  exame: SituacaoExame | null
) {
  if (!processo.value) return;
  const id = processo.value.id;
  processando.value = true;
  internosErro.value = "";
  try {
    if (dados) await apiPut(`/api/admissoes/processos/${id}/internos`, dados);

    if (exame) {
      // Releitura obrigatoria: o PUT anterior responde 204 e nao devolve a versao nova.
      if (dados) await abrirDetalhe(id);
      await apiPut(`/api/admissoes/processos/${id}/exame`, {
        versao: processo.value.internos.versao,
        situacao: exame
      });
    }

    internosAberto.value = false;
    notificar(exame ? "Exame admissional atualizado." : "Dados internos salvos.");
    await abrirDetalhe(id);
    await carregar();
  } catch (error) {
    // O modal fica ABERTO com o erro visivel: fechar perderia o que ainda nao foi gravado.
    internosErro.value = mensagemErro(error);
    await abrirDetalhe(id);
  } finally {
    processando.value = false;
  }
}

/**
 * Fechar o detalhe APAGA o CPF revelado. Ele nao sobrevive ao modal — reabrir exige pedir de novo,
 * e pedir de novo grava outra linha na trilha, que e o comportamento certo: cada leitura do
 * documento e um ato.
 */
function fecharDetalhe() {
  detalheAberto.value = false;
  cpfRevelado.value = null;
  // Mesma disciplina: o token existe UMA vez e nao sobrevive ao fechamento do modal.
  tokenEmitido.value = null;
  convite.value = null;
}

/**
 * Emitir o convite. Reemitir REVOGA o anterior — o servidor faz os dois na mesma transacao, e a
 * tela nao precisa saber disso: ela pede um link novo e recebe um link novo.
 *
 * O token vem na resposta e e a UNICA vez que ele existe fora do servidor. Nao ha GET que o
 * devolva, e por isso ele fica em memoria da pagina ate o modal fechar.
 */
async function emitirConvite() {
  if (!processo.value || convitePendente.value) return;
  const id = processo.value.id;
  convitePendente.value = true;
  try {
    const emitido = await apiPost<ConviteEmitidoDto>(`/api/admissoes/processos/${id}/convite`, {});
    tokenEmitido.value = emitido.token;
    notificar("Convite gerado. Copie o link agora.");
    await abrirDetalhe(id);
  } catch (error) {
    tratarErro(error);
  } finally {
    convitePendente.value = false;
  }
}

async function revogarConvite() {
  if (!processo.value || convitePendente.value) return;
  const id = processo.value.id;
  convitePendente.value = true;
  try {
    await apiDelete(`/api/admissoes/processos/${id}/convite`);
    tokenEmitido.value = null;
    notificar("Convite revogado. O link parou de valer.");
    await abrirDetalhe(id);
  } catch (error) {
    tratarErro(error);
  } finally {
    convitePendente.value = false;
  }
}

/**
 * Revelar o CPF — POST, nunca GET: documento nao entra em URL, e o ato grava trilha na mesma
 * transacao da leitura (PROJECT_BRAIN/31 D-4).
 *
 * A guarda de reentrancia e SINCRONA e mora aqui tambem, alem do modal: duas chamadas seriam dois
 * eventos `cpf_revelado` para a mesma intencao.
 */
async function revelarCpf() {
  if (!processo.value || revelandoCpf.value || cpfRevelado.value !== null) return;
  const id = processo.value.id;
  revelandoCpf.value = true;
  try {
    const resposta = await apiPost<{ cpf: string }>(`/api/admissoes/processos/${id}/cpf`, {});
    cpfRevelado.value = resposta.cpf;
    // Releitura para MOSTRAR o evento: o `cpf_revelado` acabou de entrar na trilha, e o historico
    // do modal e carregado junto com o detalhe. Sem ela, o DP so veria a propria consulta
    // registrada na proxima vez que abrisse o processo.
    //
    // Ela NAO existe mais para corrigir versao. Ate a migration 0036 a revelacao avancava a versao
    // do processo, e reler era o que impedia o cancelamento seguinte de levar 409; hoje revelar nao
    // escreve nada na linha raiz — nem versao, nem `atualizado_por`, nem `atualizado_em`.
    await abrirDetalhe(id);
  } catch (error) {
    // Falha mantem SO a mascara: `cpfRevelado` nem chega a ser escrito.
    tratarErro(error);
  } finally {
    revelandoCpf.value = false;
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
          Um processo por admissão, venha ele de um período de teste efetivado ou de um cadastro direto.
        </p>
      </div>
      <!-- A UNICA acao de criacao desta tela. Nao ha "iniciar", nao ha "efetivar": quem veio de teste
           chega aqui ja criado, pela tela de Testes. -->
      <v-btn v-if="podeCriarDireta" color="primary" variant="flat" @click="novoAberto = true"> + Novo cadastro </v-btn>
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
    :turnos-falharam="turnosFalharam"
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
  />

  <!--
    UM caminho de detalhe: o modal central. O painel lateral foi removido, nao escondido.

    `pode-ver-teste` e FALSO aqui: esta tela nao abre teste. Nao ha rota de processo para um teste
    especifico, e mandar para a lista de Testes seria inventar navegacao. Sem esta linha o botao
    "Ver o teste" renderizava e emitia para o vazio.
  -->
  <ProcessoDetalheDialog
    :aberto="detalheAberto"
    :processo="processo"
    :historico="historico"
    :carregando="detalheCarregando"
    :pode-cancelar="podeCancelar"
    :pode-editar-internos="podeEditarInternos"
    :processando="processando"
    :pode-ver-teste="false"
    :pode-ver-cpf="podeVerCpf"
    :cpf-revelado="cpfRevelado"
    :revelando-cpf="revelandoCpf"
    :convite="convite"
    :pode-convidar="podeConvidar"
    :token-emitido="tokenEmitido"
    :convite-pendente="convitePendente"
    @emitir-convite="emitirConvite"
    @revogar-convite="revogarConvite"
    @fechar="fecharDetalhe"
    @cancelar="cancelarProcesso"
    @revelar-cpf="revelarCpf"
    @editar-internos="
      () => {
        internosErro = '';
        internosAberto = true;
      }
    "
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
