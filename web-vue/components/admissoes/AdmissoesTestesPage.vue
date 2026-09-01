<script setup lang="ts">
import type {
  AuthSession,
  FuncaoOpcaoDto,
  HistoricoProcessoDto,
  ProcessoDetalheDto,
  HistoricoTesteDto,
  MotivoCancelamento,
  ResultadoTeste,
  TesteDetalheDto,
  TesteListaDto
} from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { ErroApiCliente } from "~/composables/useApi";
import { mensagemErro } from "~/utils/domain";
import { formatarDataHora } from "~/utils/formatacao";
import { corPrazoTeste, corStatusTeste, rotuloPrazoTeste, rotuloStatusTeste } from "~/utils/admissoes";
// O detalhe do processo é o MESMO componente da tela de Processos — e agora vem importado.
// Ele era usado só pela tag, e o auto-import do Nuxt registra `AdmissoesProcessoDetalhe*`, não o
// nome curto: a tag não resolvia e o processo, visto daqui, nunca aparecia.
import ProcessoDetalheDialog from "~/components/admissoes/ProcessoDetalheDialog.vue";
import TesteDetalhePainel from "~/components/admissoes/TesteDetalhePainel.vue";
import TesteFormDialog from "~/components/admissoes/TesteFormDialog.vue";
import TestesFiltros, { type FiltrosTestes } from "~/components/admissoes/TestesFiltros.vue";

// NENHUM `empresaId` entra aqui — nem como prop, nem na query. A empresa e derivada no servidor a
// partir do perfil autorizado. O seletor global do shell fica escondido nesta tela (AppWorkspace
// estreita a lista de empresas), para o operador nao achar que trocar de empresa muda algo.
const { apiGet, apiGetPaginado, apiPost, apiPut } = useApi();

const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeCriar = computed(() => temPermissao(permissoes.value, "admissoes_testes_criar"));
const podeEditar = computed(() => temPermissao(permissoes.value, "admissoes_testes_editar"));
const podeEncerrar = computed(() => temPermissao(permissoes.value, "admissoes_testes_encerrar"));
const podeCancelar = computed(() => temPermissao(permissoes.value, "admissoes_testes_cancelar"));
// ADM-002: permissoes PROPRIAS do processo. Ver o teste nao abre o processo, e vice-versa.
const podeVerProcesso = computed(() => temPermissao(permissoes.value, "admissoes_processos_visualizar"));
const podeCancelarProcesso = computed(() =>
  temPermissao(permissoes.value, "admissoes_processos_cancelar")
);
const CODIGOS_BLOQUEIO = new Set(["PROFILE_COMPANY_NOT_SET", "PROFILE_COMPANY_OUT_OF_SCOPE"]);

// Os filtros vivem em `TestesFiltros` e chegam aqui APLICADOS. Guardar so o que foi aplicado evita
// o defeito classico da lista que se contradiz: o texto do estado vazio falando de um filtro que o
// operador digitou mas ainda nao mandou.
const filtros = ref<FiltrosTestes>({ buscaNome: "", situacao: "ativo", funcaoId: "", prazo: "" });
const temFiltroAlemDoPadrao = computed(
  () =>
    Boolean(filtros.value.buscaNome || filtros.value.funcaoId || filtros.value.prazo) ||
    filtros.value.situacao !== "ativo"
);

const linhas = ref<TesteListaDto[]>([]);
const total = ref(0);
const pagina = ref(1);
const itensPorPagina = 10;
const funcoes = ref<FuncaoOpcaoDto[]>([]);
const carregando = ref(false);
const erro = ref("");
const bloqueio = ref("");
const snackbar = reactive({ show: false, text: "", color: "success" });

const formAberto = ref(false);
const formErro = ref("");
const salvando = ref(false);
const testeEmEdicao = ref<TesteDetalheDto | null>(null);
const avisoCpf = ref("");

const detalheAberto = ref(false);
const detalheCarregando = ref(false);
const detalheProcessando = ref(false);
const detalhe = ref<TesteDetalheDto | null>(null);
const historico = ref<HistoricoTesteDto[]>([]);
const cpfRevelado = ref("");

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / itensPorPagina)));
const inicioFaixa = computed(() => (total.value ? (pagina.value - 1) * itensPorPagina + 1 : 0));
const fimFaixa = computed(() => Math.min(pagina.value * itensPorPagina, total.value));

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

// Perfil sem empresa (ou com empresa fora do escopo) e estado PERMANENTE ate alguem corrigir o
// cadastro — nao e falha de tentativa. Por isso vira pagina de bloqueio, e nao um aviso passageiro.
function tratarErro(error: unknown, ondeNotificar = true) {
  if (error instanceof ErroApiCliente && error.codigo && CODIGOS_BLOQUEIO.has(error.codigo)) {
    bloqueio.value = error.message;
    return;
  }
  if (ondeNotificar) notificar(mensagemErro(error), "error");
  else erro.value = mensagemErro(error);
}

function queryListagem() {
  const params = new URLSearchParams({ page: String(pagina.value), pageSize: String(itensPorPagina) });
  // Somente nome. CPF nunca entra em query string.
  const atuais = filtros.value;
  if (atuais.buscaNome.trim()) params.set("buscaNome", atuais.buscaNome.trim());
  if (atuais.situacao) params.set("situacao", atuais.situacao);
  if (atuais.funcaoId) params.set("funcaoId", atuais.funcaoId);
  if (atuais.prazo) params.set("prazo", atuais.prazo);
  return `?${params.toString()}`;
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const resposta = await apiGetPaginado<TesteListaDto>(`/api/admissoes/testes${queryListagem()}`);
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

function aplicarFiltros(novos: FiltrosTestes) {
  filtros.value = novos;
  pagina.value = 1;
  void carregar();
}

function trocarPagina(nova: number) {
  pagina.value = Math.min(Math.max(1, nova), totalPaginas.value);
  void carregar();
}

async function abrirDetalhe(id: string) {
  detalheAberto.value = true;
  detalheCarregando.value = true;
  cpfRevelado.value = "";
  detalhe.value = null;
  historico.value = [];
  try {
    detalhe.value = await apiGet<TesteDetalheDto>(`/api/admissoes/testes/${id}`);
    const eventos = await apiGetPaginado<HistoricoTesteDto>(
      `/api/admissoes/testes/${id}/historico?page=1&pageSize=50`
    );
    historico.value = eventos.itens;
  } catch (error) {
    detalheAberto.value = false;
    tratarErro(error);
  } finally {
    detalheCarregando.value = false;
  }
}

async function revelarCpf() {
  if (!detalhe.value) return;
  try {
    const resposta = await apiPost<{ cpf: string }>(`/api/admissoes/testes/${detalhe.value.id}/cpf`, {});
    cpfRevelado.value = resposta.cpf;
    // Recarrega a trilha: a consulta que acabou de acontecer precisa aparecer nela.
    const eventos = await apiGetPaginado<HistoricoTesteDto>(
      `/api/admissoes/testes/${detalhe.value.id}/historico?page=1&pageSize=50`
    );
    historico.value = eventos.itens;
  } catch (error) {
    tratarErro(error);
  }
}

function abrirNovo() {
  testeEmEdicao.value = null;
  avisoCpf.value = "";
  formErro.value = "";
  formAberto.value = true;
}

function abrirEdicao() {
  if (!detalhe.value) return;
  testeEmEdicao.value = detalhe.value;
  avisoCpf.value = "";
  formErro.value = "";
  formAberto.value = true;
}

// Somente booleanos voltam daqui: sem nome, sem id, sem vinculo. Avisa, nao bloqueia.
async function verificarCpf(cpf: string) {
  try {
    const resposta = await apiPost<{ jaExisteColaborador: boolean; jaExisteTesteAberto: boolean }>(
      "/api/admissoes/testes/verificar-cpf",
      { cpf }
    );
    if (resposta.jaExisteTesteAberto) avisoCpf.value = "Já existe um período de teste em andamento para este CPF.";
    else if (resposta.jaExisteColaborador) avisoCpf.value = "Já existe colaborador com este CPF nesta empresa.";
    else avisoCpf.value = "";
  } catch {
    // Aviso e conveniencia: se a verificacao falhar, o salvamento ainda recusa duplicidade no 409.
    avisoCpf.value = "";
  }
}

async function salvar(payload: Record<string, unknown>) {
  salvando.value = true;
  formErro.value = "";
  try {
    if (testeEmEdicao.value) {
      await apiPut(`/api/admissoes/testes/${testeEmEdicao.value.id}`, payload);
      notificar("Período de teste atualizado.");
      await abrirDetalhe(testeEmEdicao.value.id);
    } else {
      await apiPost<{ id: string }>("/api/admissoes/testes", payload);
      notificar("Período de teste registrado.");
    }
    formAberto.value = false;
    await carregar();
  } catch (error) {
    if (error instanceof ErroApiCliente && error.codigo && CODIGOS_BLOQUEIO.has(error.codigo)) {
      formAberto.value = false;
      tratarErro(error);
    } else {
      formErro.value = mensagemErro(error);
    }
  } finally {
    salvando.value = false;
  }
}

// =================================================================================================
// ADM-002 — o processo de admissao.
//
// Nao ha acao de iniciar: efetivar o teste JA cria o processo, na mesma transacao. O que existe aqui
// e o caminho para VER o que foi criado.
// =================================================================================================
const processoAberto = ref(false);
const processo = ref<ProcessoDetalheDto | null>(null);
const historicoProcesso = ref<HistoricoProcessoDto[]>([]);
const processoProcessando = ref(false);
const processoCarregando = ref(false);

async function abrirProcesso(id: string) {
  processoAberto.value = true;
  processoCarregando.value = true;
  // Zera ANTES do fetch. Sem isto, o modal abria mostrando o processo lido por ultimo — o dado de
  // outra pessoa, por um instante, numa tela que existe justamente para nao vazar identidade.
  processo.value = null;
  historicoProcesso.value = [];
  try {
    processo.value = await apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${id}`);
    const eventos = await apiGetPaginado<HistoricoProcessoDto>(
      `/api/admissoes/processos/${id}/historico?page=1&pageSize=50`
    );
    historicoProcesso.value = eventos.itens;
  } catch (error) {
    tratarErro(error);
    processoAberto.value = false;
  } finally {
    processoCarregando.value = false;
  }
}

function verProcessoDoTeste() {
  if (!detalhe.value?.processoId) return;
  detalheAberto.value = false;
  void abrirProcesso(detalhe.value.processoId);
}

function voltarAoTeste() {
  // `testeId` e nulo na admissao direta (ADM-003 V1A). Daqui isso nao acontece — esta tela so abre
  // processo vindo de teste —, mas o tipo agora admite nulo, e voltar para "lugar nenhum" seria uma
  // tela em branco sem explicacao.
  const testeId = processo.value?.testeId;
  if (!testeId) return;
  processoAberto.value = false;
  void abrirDetalhe(testeId);
}



async function cancelarProcessoAdmissao() {
  if (!processo.value) return;
  processoProcessando.value = true;
  try {
    await apiPost(`/api/admissoes/processos/${processo.value.id}/cancelar`, {
      versao: processo.value.versao
    });
    notificar("Processo de admissão cancelado e arquivado.");
    await abrirProcesso(processo.value.id);
  } catch (error) {
    tratarErro(error);
  } finally {
    processoProcessando.value = false;
  }
}

async function executarTransicao(rota: string, corpo: Record<string, unknown>, mensagem: string) {
  if (!detalhe.value) return;
  detalheProcessando.value = true;
  try {
    await apiPost(`/api/admissoes/testes/${detalhe.value.id}/${rota}`, { versao: detalhe.value.versao, ...corpo });
    notificar(mensagem);
    await abrirDetalhe(detalhe.value.id);
    await carregar();
  } catch (error) {
    tratarErro(error);
  } finally {
    detalheProcessando.value = false;
  }
}

async function encerrar(resultado: ResultadoTeste) {
  if (!detalhe.value) return;
  detalheProcessando.value = true;
  try {
    // A resposta traz o processo criado (ou o existente, se for repeticao). Ela e o que faz o teste
    // encerrado ja mostrar o cartao "Admissao iniciada" com o caminho para o processo.
    const resposta = await apiPost<{ processoId: string | null }>(
      `/api/admissoes/testes/${detalhe.value.id}/encerrar`,
      { versao: detalhe.value.versao, resultado }
    );
    await carregar();
    notificar(
      resposta.processoId
        ? "Teste efetivado. Admissão iniciada."
        : "Período de teste encerrado."
    );
    // Fica NO TESTE, sempre — inclusive para quem tem a permissao e para usuario_admin. Abrir o
    // processo sozinho tirava a pessoa da tela sem ela ter pedido, e escondia justamente a
    // confirmacao do que acabou de acontecer. Quem quiser ver o processo clica em
    // "Ver processo de admissao", que segue sendo o unico caminho ate ele.
    await abrirDetalhe(detalhe.value.id);
  } catch (error) {
    tratarErro(error);
  } finally {
    detalheProcessando.value = false;
  }
}

function cancelar(motivoCancelamento: MotivoCancelamento) {
  void executarTransicao("cancelar", { motivoCancelamento }, "Período de teste cancelado e arquivado.");
}

onMounted(async () => {
  await carregarFuncoes();
  if (!bloqueio.value) await carregar();
});
</script>

<template>
  <!-- Bloqueio: o perfil nao tem empresa definida (ou ela esta fora do escopo). Nada da tela abre,
       porque nao ha empresa em que registrar. -->
  <v-card v-if="bloqueio">
    <v-card-text class="estado-bloqueio">
      <v-icon icon="mdi-domain-off" size="40" />
      <h2 class="text-h6">Períodos de teste indisponíveis</h2>
      <p class="text-body-2">{{ bloqueio }}</p>
    </v-card-text>
  </v-card>

  <v-card v-else>
    <v-card-title class="d-flex align-center justify-space-between ga-3 flex-wrap">
      <div>
        <h1 class="text-h6">Períodos de teste</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Testes combinados pelo DP. O sistema alerta o prazo; quem encerra é você.
        </p>
      </div>
      <v-btn v-if="podeCriar" color="primary" variant="flat" prepend-icon="mdi-plus" @click="abrirNovo">
        Novo teste
      </v-btn>
    </v-card-title>

    <v-card-text>
      <TestesFiltros :funcoes="funcoes" :carregando="carregando" @aplicar="aplicarFiltros" />

      <v-alert v-if="erro" type="error" variant="tonal" density="comfortable" class="mb-3">
        {{ erro }}
        <template #append><v-btn variant="text" size="small" @click="carregar">Tentar de novo</v-btn></template>
      </v-alert>

      <v-progress-linear v-if="carregando" indeterminate class="mb-2" />

      <!-- Estado vazio FORA do `responsive-table-shell`: o `min-width: 680px` da casca empurra o
           conteudo para fora da area visivel em 390px (PROJECT_BRAIN/67 secao 13.2). -->
      <p v-if="!carregando && !linhas.length" class="estado-vazio">
        {{
          temFiltroAlemDoPadrao
            ? "Nenhum período de teste com esses filtros."
            : "Nenhum período de teste registrado."
        }}
      </p>

      <div v-if="linhas.length" class="responsive-table-shell">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Função</th>
              <th>Início</th>
              <th>Fim combinado</th>
              <!-- A coluna mostra `rotuloStatusTeste`, entao o cabecalho diz STATUS. Dizia
                   "Situação" e apontava para outra coisa — duas palavras para dois conceitos que a
                   tela precisa manter separados. -->
              <th>Status do teste</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhas" :key="linha.id">
              <td class="celula-nome">{{ linha.nomeCompleto }}</td>
              <td class="cx-num">{{ linha.cpfMascarado }}</td>
              <td>{{ linha.funcaoNome }}</td>
              <td class="cx-num">{{ formatarDataHora(linha.inicioEm) }}</td>
              <td class="cx-num">
                {{ formatarDataHora(linha.fimCombinadoEm) }}
                <v-chip
                  v-if="linha.prazo && linha.prazo !== 'no_prazo'"
                  :color="corPrazoTeste(linha.prazo)"
                  size="x-small"
                  variant="tonal"
                  class="ml-1"
                >
                  {{ rotuloPrazoTeste[linha.prazo] }}
                </v-chip>
              </td>
              <td>
                <v-chip :color="corStatusTeste(linha.status)" size="small" variant="tonal">
                  {{ rotuloStatusTeste[linha.status] }}
                </v-chip>
              </td>
              <td class="text-right acoes-coluna">
                <v-btn size="small" variant="text" icon="mdi-eye" aria-label="Ver detalhe" @click="abrirDetalhe(linha.id)" />
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <div v-if="linhas.length" class="d-flex align-center justify-space-between ga-3 mt-3 flex-wrap">
        <span class="text-caption text-medium-emphasis">
          Mostrando {{ inicioFaixa }}–{{ fimFaixa }} de {{ total }}
        </span>
        <div class="d-flex ga-2">
          <v-btn size="small" variant="text" :disabled="pagina <= 1" @click="trocarPagina(pagina - 1)">
            Anterior
          </v-btn>
          <v-btn size="small" variant="text" :disabled="pagina >= totalPaginas" @click="trocarPagina(pagina + 1)">
            Próxima
          </v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>

  <TesteFormDialog
    :aberto="formAberto"
    :teste="testeEmEdicao"
    :funcoes="funcoes"
    :salvando="salvando"
    :erro="formErro || avisoCpf"
    @salvar="salvar"
    @fechar="formAberto = false"
    @verificar-cpf="verificarCpf"
  />

  <!--
    ADM-003 V1B: daqui o processo e SO LEITURA. `pode-editar-internos` e falso, entao o botao
    "Editar" nao renderiza — e por isso NAO ha `@editar-internos` aqui. O listener existia e era
    inalcancavel: ninguem tinha como dispara-lo. Editar continua na tela "Processos de admissao",
    que e a dona do processo e ja tem entrada de menu propria; um atalho daqui seria o segundo
    lugar para o mesmo ato que a regra-mae proibe.

    `pode-ver-teste` e VERDADEIRO so aqui: e desta tela que se chega ao processo, e `voltarAoTeste`
    reabre o teste de origem. O caminho de volta existe, entao o botao existe.

    `pode-ver-cpf` e falso pela mesma logica do "Editar". Daqui so se chega a processo vindo de
    TESTE, e esse nao tem CPF proprio: a coluna e nula por CHECK, o documento mora no teste, e o
    painel do teste ja o revela com a trilha da ADM-001. Oferecer aqui seria um botao que o
    servidor recusa com 400 — e um segundo lugar para o mesmo ato.
  -->
  <ProcessoDetalheDialog
    :aberto="processoAberto"
    :processo="processo"
    :historico="historicoProcesso"
    :carregando="processoCarregando"
    :pode-cancelar="podeCancelarProcesso"
    :pode-editar-internos="false"
    :processando="processoProcessando"
    :pode-ver-teste="true"
    :pode-ver-cpf="false"
    :cpf-revelado="null"
    :revelando-cpf="false"
    :convite="null"
    :pode-convidar="false"
    :token-emitido="null"
    :convite-pendente="false"
    @cancelar="cancelarProcessoAdmissao"
    @fechar="processoAberto = false"
    @ver-teste="voltarAoTeste"
  />

  <TesteDetalhePainel
    :aberto="detalheAberto"
    :teste="detalhe"
    :historico="historico"
    :carregando="detalheCarregando"
    :processando="detalheProcessando"
    :cpf-revelado="cpfRevelado"
    :pode-editar="podeEditar"
    :pode-encerrar="podeEncerrar"
    :pode-cancelar="podeCancelar"
    :pode-ver-processo="podeVerProcesso"
    @fechar="detalheAberto = false"
    @editar="abrirEdicao"
    @revelar-cpf="revelarCpf"
    @encerrar="encerrar"
    @ver-processo="verProcessoDoTeste"
    @cancelar="cancelar"
  />

  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.estado-bloqueio {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-3);
  text-align: center;
  padding: var(--cx-sp-8) var(--cx-sp-5);
  color: var(--cx-ink-soft);
}

.estado-vazio {
  padding: var(--cx-sp-7) var(--cx-sp-4);
  text-align: center;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-body);
}

.celula-nome {
  max-width: 340px;
}

/* <=768: a coluna de acoes fica fixa a direita. Sem isto o operador precisa rolar a tabela
   inteira ate o fim para alcancar o botao (PROJECT_BRAIN/67 secao 13.2). */
@media (max-width: 768px) {
  .acoes-coluna {
    position: sticky;
    right: 0;
    background: var(--cx-surface);
  }
}
</style>
