<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import IconeDestaque from "~/components/comum/IconeDestaque.vue";
import { mensagemErro } from "~/utils/domain";

type Fila = "testesAtivos" | "testesVencemHoje" | "testesVencidos" | "fichasEnviadas" | "processosPausados";
type ResultadoPaginado = { total: number };

const { apiGetPaginado } = useApi();
const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeVerTestes = computed(() => temPermissao(permissoes.value, "admissoes_testes_visualizar"));
const podeVerProcessos = computed(() => temPermissao(permissoes.value, "admissoes_processos_visualizar"));
const podeVerColaboradores = computed(() => temPermissao(permissoes.value, "cadastro_colaboradores_visualizar"));
const podeVerFuncoes = computed(() => temPermissao(permissoes.value, "cadastro_funcoes_visualizar"));
const podeVerAreas = computed(() => temPermissao(permissoes.value, "cadastro_areas_setores_visualizar"));
const podeVerTurnos = computed(() => temPermissao(permissoes.value, "cadastro_turnos_visualizar"));

const totais = reactive<Record<Fila, number | null>>({
  testesAtivos: null,
  testesVencemHoje: null,
  testesVencidos: null,
  fichasEnviadas: null,
  processosPausados: null
});
const carregando = ref(false);
const erro = ref("");

function consulta(pares: Record<string, string>) {
  return `?${new URLSearchParams({ page: "1", pageSize: "1", ...pares }).toString()}`;
}

async function carregarFila(chave: Fila, endpoint: string) {
  totais[chave] = ((await apiGetPaginado<unknown>(endpoint)) as ResultadoPaginado).total;
}

async function carregarResumo() {
  carregando.value = true;
  erro.value = "";
  const tarefas: Promise<void>[] = [];
  if (podeVerTestes.value) {
    tarefas.push(carregarFila("testesAtivos", `/api/admissoes/testes${consulta({ situacao: "ativo" })}`));
    tarefas.push(
      carregarFila("testesVencemHoje", `/api/admissoes/testes${consulta({ situacao: "ativo", prazo: "vence_hoje" })}`)
    );
    tarefas.push(
      carregarFila("testesVencidos", `/api/admissoes/testes${consulta({ situacao: "ativo", prazo: "vencido" })}`)
    );
  }
  if (podeVerProcessos.value) {
    tarefas.push(carregarFila("fichasEnviadas", `/api/admissoes/processos${consulta({ ficha: "enviada" })}`));
    tarefas.push(carregarFila("processosPausados", `/api/admissoes/processos${consulta({ situacao: "pausado" })}`));
  }
  const falha = (await Promise.allSettled(tarefas)).find((resultado) => resultado.status === "rejected");
  if (falha?.status === "rejected") erro.value = mensagemErro(falha.reason);
  carregando.value = false;
}

function total(chave: Fila) {
  return totais[chave] === null ? "—" : String(totais[chave]);
}

onMounted(() => void carregarResumo());
</script>

<template>
  <section class="pagina-dp">
    <header class="cabecalho">
      <div>
        <p class="sobretitulo">Departamento pessoal</p>
        <h1>Central de admissões e cadastros</h1>
        <p class="subtitulo">
          Comece pelo processo de admissão. Esta central mostra somente filas e atalhos que já funcionam no sistema.
        </p>
      </div>
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="carregando" @click="carregarResumo">Atualizar</v-btn>
    </header>

    <v-alert v-if="erro" type="warning" variant="tonal" density="comfortable" class="mb-5"
      >Não foi possível atualizar todas as filas agora. {{ erro
      }}<template #append
        ><v-btn variant="text" size="small" @click="carregarResumo">Tentar de novo</v-btn></template
      ></v-alert
    >

    <section class="bloco" aria-labelledby="dp-comecar">
      <div class="titulo-bloco">
        <div>
          <h2 id="dp-comecar">Comece aqui</h2>
          <p>Um caminho por situação. Os botões levam à tela que é dona da ação.</p>
        </div>
      </div>
      <div class="grade-acoes">
        <v-card v-if="podeVerProcessos" class="acao-card acao-card--admissoes" variant="outlined"
          ><v-card-text class="acao-card__conteudo"
            ><IconeDestaque icone="mdi-clipboard-account-outline" cor="#7c48ed" />
            <div>
              <h3>Admissão direta</h3>
              <p>Pré-cadastro, ASO e efetivação preenchidos pelo DP.</p>
            </div></v-card-text
          ><v-card-actions class="acao-card__acoes"
            ><v-btn
              to="/admissoes_processos"
              color="primary"
              variant="flat"
              prepend-icon="mdi-clipboard-account-outline"
              >Abrir admissões</v-btn
            ></v-card-actions
          ></v-card
        >
        <v-card v-if="podeVerTestes" class="acao-card acao-card--testes" variant="outlined"
          ><v-card-text class="acao-card__conteudo"
            ><IconeDestaque icone="mdi-account-clock-outline" cor="#248fdf" />
            <div>
              <h3>Período de teste</h3>
              <p>Registre, acompanhe o prazo e efetive para admissão.</p>
            </div></v-card-text
          ><v-card-actions class="acao-card__acoes"
            ><v-btn to="/admissoes_testes" color="info" variant="flat" prepend-icon="mdi-account-clock-outline"
              >Abrir testes</v-btn
            ></v-card-actions
          ></v-card
        >
        <v-card v-if="podeVerColaboradores" class="acao-card acao-card--colaboradores" variant="outlined"
          ><v-card-text class="acao-card__conteudo"
            ><IconeDestaque icone="mdi-account-group-outline" cor="#1fb970" />
            <div>
              <h3>Colaboradores cadastrados</h3>
              <p>Perfis, vínculos, matrícula e linha do tempo.</p>
            </div></v-card-text
          ><v-card-actions class="acao-card__acoes"
            ><v-btn to="/colaboradores" color="success" variant="flat" prepend-icon="mdi-account-group-outline"
              >Abrir colaboradores</v-btn
            ></v-card-actions
          ></v-card
        >
      </div>
    </section>

    <section class="bloco" aria-labelledby="dp-visao-geral">
      <div class="titulo-bloco">
        <div>
          <h2 id="dp-visao-geral">Visão geral</h2>
          <p>Próximas áreas do sistema. Elas ainda não abrem fluxo nem registram dados.</p>
        </div>
      </div>
      <div class="grade-acoes grade-acoes--preparacao">
        <v-card class="acao-card acao-card--folha acao-card--preparacao" variant="outlined"
          ><v-card-text class="acao-card__conteudo"
            ><IconeDestaque icone="mdi-cash-multiple" cor="#d27021" />
            <div>
              <h3>Folha de pagamento</h3>
              <p>Salários, eventos e fechamento mensal.</p>
              <span class="acao-card__status">Em preparação</span>
            </div></v-card-text
          ></v-card
        >
        <v-card class="acao-card acao-card--ponto acao-card--preparacao" variant="outlined"
          ><v-card-text class="acao-card__conteudo"
            ><IconeDestaque icone="mdi-clock-check-outline" cor="#0c9dad" />
            <div>
              <h3>Ponto eletrônico</h3>
              <p>Jornadas, horas extras e ocorrências.</p>
              <span class="acao-card__status">Em preparação</span>
            </div></v-card-text
          ></v-card
        >
        <v-card class="acao-card acao-card--ouvidoria acao-card--preparacao" variant="outlined"
          ><v-card-text class="acao-card__conteudo"
            ><IconeDestaque icone="mdi-message-question-outline" cor="#d35086" />
            <div>
              <h3>Ouvidoria</h3>
              <p>Canal de dúvidas, sugestões e relatos.</p>
              <span class="acao-card__status">Em preparação</span>
            </div></v-card-text
          ></v-card
        >
      </div>
    </section>

    <section v-if="podeVerTestes || podeVerProcessos" class="bloco" aria-labelledby="dp-filas">
      <div class="titulo-bloco">
        <div>
          <h2 id="dp-filas">Acompanhe agora</h2>
          <p>Contagens derivadas das filas atuais; não mudam status e não expõem dados pessoais.</p>
        </div>
      </div>
      <div class="grade-filas">
        <v-card v-if="podeVerTestes" to="/admissoes_testes" link class="fila-card fila-card--ativos"
          ><v-card-text class="fila-card__conteudo"
            ><IconeDestaque icone="mdi-account-clock-outline" cor="rgb(var(--fila-cor))" tamanho="sm" /><span
              class="fila-card__texto"
              ><span>Testes em andamento</span><strong>{{ total("testesAtivos") }}</strong></span
            ></v-card-text
          ></v-card
        >
        <v-card v-if="podeVerTestes" to="/admissoes_testes" link class="fila-card fila-card--hoje"
          ><v-card-text class="fila-card__conteudo"
            ><IconeDestaque icone="mdi-calendar-clock-outline" cor="rgb(var(--fila-cor))" tamanho="sm" /><span
              class="fila-card__texto"
              ><span>Testes que vencem hoje</span><strong>{{ total("testesVencemHoje") }}</strong></span
            ></v-card-text
          ></v-card
        >
        <v-card v-if="podeVerTestes" to="/admissoes_testes" link class="fila-card fila-card--vencidos"
          ><v-card-text class="fila-card__conteudo"
            ><IconeDestaque icone="mdi-alert-circle-outline" cor="rgb(var(--fila-cor))" tamanho="sm" /><span
              class="fila-card__texto"
              ><span>Testes vencidos</span><strong>{{ total("testesVencidos") }}</strong></span
            ></v-card-text
          ></v-card
        >
        <v-card v-if="podeVerProcessos" to="/admissoes_processos" link class="fila-card fila-card--fichas"
          ><v-card-text class="fila-card__conteudo"
            ><IconeDestaque icone="mdi-file-document-check-outline" cor="rgb(var(--fila-cor))" tamanho="sm" /><span
              class="fila-card__texto"
              ><span>Fichas em revisão</span><strong>{{ total("fichasEnviadas") }}</strong></span
            ></v-card-text
          ></v-card
        >
        <v-card v-if="podeVerProcessos" to="/admissoes_processos" link class="fila-card fila-card--pausados"
          ><v-card-text class="fila-card__conteudo"
            ><IconeDestaque icone="mdi-pause-circle-outline" cor="rgb(var(--fila-cor))" tamanho="sm" /><span
              class="fila-card__texto"
              ><span>Processos pausados</span><strong>{{ total("processosPausados") }}</strong></span
            ></v-card-text
          ></v-card
        >
      </div>
    </section>

    <section v-if="podeVerFuncoes || podeVerAreas || podeVerTurnos" class="bloco" aria-labelledby="dp-cadastros">
      <div class="titulo-bloco">
        <div>
          <h2 id="dp-cadastros">Cadastros base</h2>
          <p>Configure antes da admissão. Função operacional não é cargo de acesso do usuário.</p>
        </div>
      </div>
      <div class="atalhos-cadastros">
        <v-btn v-if="podeVerFuncoes" to="/funcoes_operacionais" prepend-icon="mdi-briefcase-outline" variant="outlined"
          >Funções operacionais</v-btn
        ><v-btn v-if="podeVerAreas" to="/areas_setores" prepend-icon="mdi-map-marker-outline" variant="outlined"
          >Áreas e setores</v-btn
        ><v-btn v-if="podeVerTurnos" to="/turnos" prepend-icon="mdi-clock-outline" variant="outlined">Turnos</v-btn>
      </div>
    </section>

    <v-alert type="info" variant="tonal" density="comfortable" icon="mdi-shield-account-outline"
      ><strong>Já disponível:</strong> efetivação, vínculo, matrícula e linha do tempo.
      <strong>Próximas estruturas:</strong> dossiê documental, uniforme/EPI, contrato e assinatura, ponto, folha e
      Conplus. Elas só aparecerão como pendências quando cada uma puder registrar fatos reais, sem controle
      falso.</v-alert
    >
  </section>
</template>

<style src="./DepartamentoPessoalPage.css" scoped />
