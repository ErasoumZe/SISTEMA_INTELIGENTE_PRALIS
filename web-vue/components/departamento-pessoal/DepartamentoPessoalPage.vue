<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

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
        <v-card v-if="podeVerProcessos" class="acao-card" variant="outlined">
          <v-card-item>
            <template #prepend><v-icon icon="mdi-clipboard-account-outline" color="primary" /></template>
            <v-card-title>Admissão direta</v-card-title>
            <v-card-subtitle>Pré-cadastro, ASO, convite e revisão da ficha.</v-card-subtitle>
          </v-card-item>
          <v-card-actions
            ><v-btn to="/admissoes_processos" color="primary" variant="flat">Abrir admissões</v-btn></v-card-actions
          >
        </v-card>
        <v-card v-if="podeVerTestes" class="acao-card" variant="outlined">
          <v-card-item>
            <template #prepend><v-icon icon="mdi-account-clock-outline" color="primary" /></template>
            <v-card-title>Período de teste</v-card-title>
            <v-card-subtitle>Registre, acompanhe o prazo e efetive para admissão.</v-card-subtitle>
          </v-card-item>
          <v-card-actions
            ><v-btn to="/admissoes_testes" color="primary" variant="flat">Abrir testes</v-btn></v-card-actions
          >
        </v-card>
        <v-card v-if="podeVerColaboradores" class="acao-card" variant="outlined">
          <v-card-item>
            <template #prepend><v-icon icon="mdi-account-group-outline" color="primary" /></template>
            <v-card-title>Colaboradores cadastrados</v-card-title>
            <v-card-subtitle>Consulta do cadastro operacional já existente.</v-card-subtitle>
          </v-card-item>
          <v-card-actions
            ><v-btn to="/colaboradores" color="primary" variant="flat">Abrir colaboradores</v-btn></v-card-actions
          >
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
        <v-card v-if="podeVerTestes" variant="tonal" class="fila-card">
          <v-card-text
            ><span>Testes em andamento</span><strong>{{ formatarTotal(totais.testesAtivos) }}</strong></v-card-text
          >
          <v-card-actions><v-btn to="/admissoes_testes" variant="text">Ver testes</v-btn></v-card-actions>
        </v-card>
        <v-card v-if="podeVerTestes" variant="tonal" class="fila-card atencao">
          <v-card-text
            ><span>Testes que vencem hoje</span
            ><strong>{{ formatarTotal(totais.testesVencemHoje) }}</strong></v-card-text
          >
          <v-card-actions><v-btn to="/admissoes_testes" variant="text">Ver testes</v-btn></v-card-actions>
        </v-card>
        <v-card v-if="podeVerTestes" variant="tonal" class="fila-card alerta">
          <v-card-text
            ><span>Testes vencidos</span><strong>{{ formatarTotal(totais.testesVencidos) }}</strong></v-card-text
          >
          <v-card-actions><v-btn to="/admissoes_testes" variant="text">Ver testes</v-btn></v-card-actions>
        </v-card>
        <v-card v-if="podeVerProcessos" variant="tonal" class="fila-card">
          <v-card-text
            ><span>Fichas enviadas para revisão</span
            ><strong>{{ formatarTotal(totais.fichasEnviadas) }}</strong></v-card-text
          >
          <v-card-actions><v-btn to="/admissoes_processos" variant="text">Ver processos</v-btn></v-card-actions>
        </v-card>
        <v-card v-if="podeVerProcessos" variant="tonal" class="fila-card alerta">
          <v-card-text
            ><span>Processos pausados</span><strong>{{ formatarTotal(totais.processosPausados) }}</strong></v-card-text
          >
          <v-card-actions><v-btn to="/admissoes_processos" variant="text">Ver processos</v-btn></v-card-actions>
        </v-card>
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
        >
        <v-btn v-if="podeVerAreas" to="/areas_setores" prepend-icon="mdi-map-marker-outline" variant="outlined"
          >Áreas e setores</v-btn
        >
        <v-btn v-if="podeVerTurnos" to="/turnos" prepend-icon="mdi-clock-outline" variant="outlined">Turnos</v-btn>
      </div>
    </section>

    <v-alert type="info" variant="tonal" density="comfortable" icon="mdi-shield-account-outline">
      <strong>Próxima estrutura ainda não cadastrável:</strong> efetivação com vínculo, documentos, uniforme/EPI,
      contrato e assinatura, ponto, folha e a fila Conplus. Esses itens não aparecem como “pendentes” porque a base
      ainda não registra esses fatos. Assim o painel não cria controle falso.
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
.acao-card {
  min-height: 178px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.fila-card .v-card-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 96px;
}
.fila-card strong {
  font-size: 2rem;
  line-height: 1;
}
.fila-card.atencao {
  border-left: 4px solid #d99200;
}
.fila-card.alerta {
  border-left: 4px solid #d22929;
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
}
</style>
