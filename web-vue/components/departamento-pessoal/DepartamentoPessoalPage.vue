<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";
import IconeDestaque from "~/components/comum/IconeDestaque.vue";

type ResultadoPaginado = { total: number };
type Fila = "testesAtivos" | "testesVencemHoje" | "testesVencidos" | "fichasEnviadas" | "processosPausados";

const { apiGetPaginado } = useApi();
const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);

const podeVerTestes = computed(() => temPermissao(permissoes.value, "admissoes_testes_visualizar"));
const podeVerProcessos = computed(() => temPermissao(permissoes.value, "admissoes_processos_visualizar"));
const podeVerColaboradores = computed(() => temPermissao(permissoes.value, "cadastro_colaboradores_visualizar"));
const podeVerFuncoes = computed(() => temPermissao(permissoes.value, "cadastro_funcoes_visualizar"));
const podeVerAreas = computed(() => temPermissao(permissoes.value, "cadastro_areas_setores_visualizar"));
const podeVerTurnos = computed(() => temPermissao(permissoes.value, "cadastro_turnos_visualizar"));
const podeVerClinicas = computed(() => temPermissao(permissoes.value, "admissoes_clinicas_ocupacionais_visualizar"));

const totais = reactive<Record<Fila, number | null>>({
  testesAtivos: null,
  testesVencemHoje: null,
  testesVencidos: null,
  fichasEnviadas: null,
  processosPausados: null
});
const carregando = ref(false);
const erro = ref("");

function query(pares: Record<string, string>) {
  const params = new URLSearchParams({ page: "1", pageSize: "1", ...pares });
  return `?${params.toString()}`;
}

async function carregarFila(chave: Fila, endpoint: string) {
  const resposta = await apiGetPaginado<unknown>(endpoint);
  totais[chave] = (resposta as ResultadoPaginado).total;
}

/**
 * Os numeros sao as MESMAS filas que as telas existentes consultam no servidor. Nao ha scan no
 * navegador, nem estado novo de RH: o painel apenas resume os filtros oficiais e leva a listagem
 * dona de cada ato.
 */
async function carregarResumo() {
  carregando.value = true;
  erro.value = "";
  const tarefas: Promise<void>[] = [];
  if (podeVerTestes.value) {
    tarefas.push(carregarFila("testesAtivos", `/api/admissoes/testes${query({ situacao: "ativo" })}`));
    tarefas.push(
      carregarFila("testesVencemHoje", `/api/admissoes/testes${query({ situacao: "ativo", prazo: "vence_hoje" })}`)
    );
    tarefas.push(
      carregarFila("testesVencidos", `/api/admissoes/testes${query({ situacao: "ativo", prazo: "vencido" })}`)
    );
  }
  if (podeVerProcessos.value) {
    tarefas.push(carregarFila("fichasEnviadas", `/api/admissoes/processos${query({ ficha: "enviada" })}`));
    tarefas.push(carregarFila("processosPausados", `/api/admissoes/processos${query({ situacao: "pausado" })}`));
  }

  const resultados = await Promise.allSettled(tarefas);
  const falha = resultados.find((resultado) => resultado.status === "rejected");
  if (falha?.status === "rejected") erro.value = mensagemErro(falha.reason);
  carregando.value = false;
}

function formatarTotal(total: number | null) {
  return total === null ? "—" : String(total);
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

    <v-alert v-if="erro" type="warning" variant="tonal" density="comfortable" class="mb-5">
      Não foi possível atualizar todas as filas agora. {{ erro }}
      <template #append><v-btn variant="text" size="small" @click="carregarResumo">Tentar de novo</v-btn></template>
    </v-alert>

    <section class="bloco" aria-labelledby="dp-comecar">
      <div class="titulo-bloco">
        <div>
          <h2 id="dp-comecar">Comece aqui</h2>
          <p>Um caminho por situação. Os botões levam à tela que é dona da ação.</p>
        </div>
      </div>
      <div class="grade-acoes">
        <v-card v-if="podeVerProcessos" class="acao-card acao-card--admissoes" variant="outlined">
          <v-card-text class="acao-card__conteudo">
            <IconeDestaque icone="mdi-clipboard-account-outline" cor="#7c48ed" />
            <div><h3>Admissão direta</h3><p>Pré-cadastro, ASO e efetivação preenchidos pelo DP.</p></div>
          </v-card-text>
          <v-card-actions class="acao-card__acoes"
            ><v-btn to="/admissoes_processos" color="primary" variant="flat" prepend-icon="mdi-clipboard-account-outline">Abrir admissões</v-btn></v-card-actions
          >
        </v-card>
        <v-card v-if="podeVerTestes" class="acao-card acao-card--testes" variant="outlined">
          <v-card-text class="acao-card__conteudo">
            <IconeDestaque icone="mdi-account-clock-outline" cor="#248fdf" />
            <div><h3>Período de teste</h3><p>Registre, acompanhe o prazo e efetive para admissão.</p></div>
          </v-card-text>
          <v-card-actions class="acao-card__acoes"
            ><v-btn to="/admissoes_testes" color="info" variant="flat" prepend-icon="mdi-account-clock-outline">Abrir testes</v-btn></v-card-actions
          >
        </v-card>
        <v-card v-if="podeVerColaboradores" class="acao-card acao-card--colaboradores" variant="outlined">
          <v-card-text class="acao-card__conteudo">
            <IconeDestaque icone="mdi-account-group-outline" cor="#1fb970" />
            <div><h3>Colaboradores cadastrados</h3><p>Perfis, vínculos, matrícula e linha do tempo.</p></div>
          </v-card-text>
          <v-card-actions class="acao-card__acoes"
            ><v-btn to="/colaboradores" color="success" variant="flat" prepend-icon="mdi-account-group-outline">Abrir colaboradores</v-btn></v-card-actions
          >
        </v-card>
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
        <v-card class="acao-card acao-card--folha acao-card--preparacao" variant="outlined">
          <v-card-text class="acao-card__conteudo">
            <IconeDestaque icone="mdi-cash-multiple" cor="#d27021" />
            <div>
              <h3>Folha de pagamento</h3>
              <p>Salários, eventos e fechamento mensal.</p>
              <span class="acao-card__status">Em preparação</span>
            </div>
          </v-card-text>
        </v-card>
        <v-card class="acao-card acao-card--ponto acao-card--preparacao" variant="outlined">
          <v-card-text class="acao-card__conteudo">
            <IconeDestaque icone="mdi-clock-check-outline" cor="#0c9dad" />
            <div>
              <h3>Ponto eletrônico</h3>
              <p>Jornadas, horas extras e ocorrências.</p>
              <span class="acao-card__status">Em preparação</span>
            </div>
          </v-card-text>
        </v-card>
        <v-card class="acao-card acao-card--ouvidoria acao-card--preparacao" variant="outlined">
          <v-card-text class="acao-card__conteudo">
            <IconeDestaque icone="mdi-message-question-outline" cor="#d35086" />
            <div>
              <h3>Ouvidoria</h3>
              <p>Canal de dúvidas, sugestões e relatos.</p>
              <span class="acao-card__status">Em preparação</span>
            </div>
          </v-card-text>
        </v-card>
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
        <v-card v-if="podeVerTestes" to="/admissoes_testes" link class="fila-card fila-card--ativos">
          <v-card-text class="fila-card__conteudo">
            <IconeDestaque icone="mdi-account-clock-outline" cor="rgb(var(--fila-cor))" tamanho="sm" />
            <span class="fila-card__texto"><span>Testes em andamento</span><strong>{{ formatarTotal(totais.testesAtivos) }}</strong></span>
          </v-card-text>
        </v-card>
        <v-card v-if="podeVerTestes" to="/admissoes_testes" link class="fila-card fila-card--hoje">
          <v-card-text class="fila-card__conteudo">
            <IconeDestaque icone="mdi-calendar-clock-outline" cor="rgb(var(--fila-cor))" tamanho="sm" />
            <span class="fila-card__texto"><span>Testes que vencem hoje</span><strong>{{ formatarTotal(totais.testesVencemHoje) }}</strong></span>
          </v-card-text>
        </v-card>
        <v-card v-if="podeVerTestes" to="/admissoes_testes" link class="fila-card fila-card--vencidos">
          <v-card-text class="fila-card__conteudo">
            <IconeDestaque icone="mdi-alert-circle-outline" cor="rgb(var(--fila-cor))" tamanho="sm" />
            <span class="fila-card__texto"><span>Testes vencidos</span><strong>{{ formatarTotal(totais.testesVencidos) }}</strong></span>
          </v-card-text>
        </v-card>
        <v-card v-if="podeVerProcessos" to="/admissoes_processos" link class="fila-card fila-card--fichas">
          <v-card-text class="fila-card__conteudo">
            <IconeDestaque icone="mdi-file-document-check-outline" cor="rgb(var(--fila-cor))" tamanho="sm" />
            <span class="fila-card__texto"><span>Fichas em revisão</span><strong>{{ formatarTotal(totais.fichasEnviadas) }}</strong></span>
          </v-card-text>
        </v-card>
        <v-card v-if="podeVerProcessos" to="/admissoes_processos" link class="fila-card fila-card--pausados">
          <v-card-text class="fila-card__conteudo">
            <IconeDestaque icone="mdi-pause-circle-outline" cor="rgb(var(--fila-cor))" tamanho="sm" />
            <span class="fila-card__texto"><span>Processos pausados</span><strong>{{ formatarTotal(totais.processosPausados) }}</strong></span>
          </v-card-text>
        </v-card>
      </div>
    </section>

    <section v-if="podeVerFuncoes || podeVerAreas || podeVerTurnos || podeVerClinicas" class="bloco" aria-labelledby="dp-cadastros">
      <div class="titulo-bloco">
        <div>
          <h2 id="dp-cadastros">Cadastros base</h2>
          <p>Configure antes da admissão. Função operacional não é cargo de acesso do usuário.</p>
        </div>
      </div>
      <div class="atalhos-cadastros">
        <v-btn v-if="podeVerFuncoes" to="/funcoes_operacionais" prepend-icon="mdi-briefcase-outline" variant="outlined"
          >Funções operacionais</v-btn
        >
        <v-btn v-if="podeVerAreas" to="/areas_setores" prepend-icon="mdi-map-marker-outline" variant="outlined"
          >Áreas e setores</v-btn
        >
        <v-btn v-if="podeVerTurnos" to="/turnos" prepend-icon="mdi-clock-outline" variant="outlined">Turnos</v-btn>
        <v-btn v-if="podeVerClinicas" to="/clinicas_ocupacionais" prepend-icon="mdi-hospital-building" variant="outlined">Clínicas ocupacionais</v-btn>
      </div>
    </section>

    <v-alert type="info" variant="tonal" density="comfortable" icon="mdi-shield-account-outline">
      <strong>Já disponível:</strong> efetivação, vínculo, matrícula e linha do tempo.
      <strong>Próximas estruturas:</strong>
      dossiê documental, uniforme/EPI, contrato e assinatura, ponto, folha e Conplus. Elas só aparecerão como pendências
      quando cada uma puder registrar fatos reais, sem controle falso.
    </v-alert>
  </section>
</template>

<style scoped>
.pagina-dp {
  padding: 16px;
  max-width: 1280px;
  margin: 0 auto;
}
.cabecalho,
.titulo-bloco {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.cabecalho {
  margin-bottom: 24px;
}
.sobretitulo {
  color: rgb(var(--v-theme-primary));
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
h1 {
  font-size: clamp(1.4rem, 3vw, 2rem);
  line-height: 1.15;
}
.subtitulo,
.titulo-bloco p {
  margin: 6px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.68);
  max-width: 68ch;
}
.bloco {
  margin-bottom: 28px;
}
.titulo-bloco {
  margin-bottom: 12px;
}
.titulo-bloco h2 {
  font-size: 1.05rem;
}
.grade-acoes,
.grade-filas {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
}
.grade-filas {
  grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
}
.acao-card {
  position: relative;
  isolation: isolate;
  min-height: 184px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: linear-gradient(145deg, var(--acao-vidro), rgb(var(--v-theme-surface) / 0.72));
  backdrop-filter: blur(18px) saturate(1.12);
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.acao-card:not(.acao-card--preparacao):hover {
  transform: translateY(-2px);
}
.acao-card::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  content: "";
  background: linear-gradient(135deg, var(--acao-vidro), transparent 62%);
  pointer-events: none;
}
.acao-card__conteudo {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 16px 8px;
}
.acao-card__conteudo h3 {
  margin: 0;
  font-size: clamp(1rem, 2.7vw, 1.22rem);
  line-height: 1.18;
}
.acao-card__conteudo p {
  display: -webkit-box;
  margin: 5px 0 0;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface) / 0.72);
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.acao-card__acoes {
  padding: 4px 16px 16px;
}
.acao-card__acoes .v-btn {
  min-width: 0;
  letter-spacing: 0.04em;
  transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.acao-card__acoes .v-btn:active {
  transform: scale(0.97);
}
.acao-card--admissoes {
  --acao-inicio: #9b6cff;
  --acao-fim: #6b36df;
  --acao-vidro: rgb(155 108 255 / 0.16);
  border-color: rgb(155 108 255 / 0.42);
}
.acao-card--testes {
  --acao-inicio: #42b5ff;
  --acao-fim: #1976d2;
  --acao-vidro: rgb(66 181 255 / 0.16);
  border-color: rgb(66 181 255 / 0.42);
}
.acao-card--colaboradores {
  --acao-inicio: #48df8a;
  --acao-fim: #139c60;
  --acao-vidro: rgb(72 223 138 / 0.16);
  border-color: rgb(72 223 138 / 0.42);
}
.acao-card--folha {
  --acao-inicio: #e49a35;
  --acao-fim: #ad4d20;
  --acao-vidro: rgb(228 154 53 / 0.14);
  border-color: rgb(228 154 53 / 0.36);
}
.acao-card--ponto {
  --acao-inicio: #18b5c8;
  --acao-fim: #127d99;
  --acao-vidro: rgb(24 181 200 / 0.14);
  border-color: rgb(24 181 200 / 0.36);
}
.acao-card--ouvidoria {
  --acao-inicio: #db6394;
  --acao-fim: #9d3567;
  --acao-vidro: rgb(219 99 148 / 0.14);
  border-color: rgb(219 99 148 / 0.36);
}
.acao-card--preparacao {
  min-height: 146px;
}
.acao-card__status {
  display: inline-flex;
  margin-top: 10px;
  padding: 3px 8px;
  border: 1px solid rgb(var(--v-theme-on-surface) / 0.16);
  border-radius: var(--cx-r-pill);
  color: rgb(var(--v-theme-on-surface) / 0.68);
  font-size: 0.73rem;
  font-weight: 700;
}
.fila-card {
  --fila-cor: 139 92 246;
  overflow: hidden;
  min-height: 86px;
  border: 1px solid rgb(var(--fila-cor) / 0.38);
  border-radius: 15px;
  background: linear-gradient(135deg, rgb(var(--fila-cor) / 0.18), rgb(var(--v-theme-surface) / 0.74));
  backdrop-filter: blur(14px) saturate(1.08);
  -webkit-backdrop-filter: blur(14px) saturate(1.08);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.fila-card:hover {
  transform: translateY(-2px);
}
.fila-card:active {
  transform: scale(0.98);
}
.fila-card:focus-visible {
  outline: 2px solid rgb(var(--fila-cor));
  outline-offset: 2px;
}
.fila-card__conteudo {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 84px;
  padding: 13px;
}
.fila-card__texto {
  display: grid;
  min-width: 0;
  gap: 3px;
  color: rgb(var(--v-theme-on-surface) / 0.76);
  font-size: 0.84rem;
  line-height: 1.2;
}
.fila-card__texto strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.45rem;
  line-height: 1.05;
}
.fila-card--ativos {
  --fila-cor: 139 92 246;
}
.fila-card--hoje {
  --fila-cor: 230 163 38;
}
.fila-card--vencidos {
  --fila-cor: 228 82 82;
}
.fila-card--fichas {
  --fila-cor: 44 183 225;
}
.fila-card--pausados {
  --fila-cor: 111 126 160;
}
.atalhos-cadastros {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
@media (max-width: 480px) {
  .pagina-dp {
    padding: 12px;
  }
  .cabecalho > .v-btn {
    width: 100%;
  }
  .atalhos-cadastros .v-btn {
    width: 100%;
    justify-content: flex-start;
  }
  .grade-acoes {
    grid-template-columns: 1fr;
  }
  .grade-filas {
    grid-template-columns: 1fr;
  }
  .acao-card {
    min-height: 0;
  }
  .acao-card__acoes .v-btn {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .acao-card,
  .acao-card__acoes .v-btn,
  .fila-card {
    transition: none;
  }
  .acao-card:not(.acao-card--preparacao):hover,
  .fila-card:hover,
  .fila-card:active,
  .acao-card__acoes .v-btn:active {
    transform: none;
  }
}
</style>
