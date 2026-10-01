<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import CadastroColaboradorTabs from "~/components/colaboradores/CadastroColaboradorTabs.vue";
import JornadaColaboradorPanel from "~/components/colaboradores/JornadaColaboradorPanel.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { formatarDataHora, formatarDataSomenteDia, mascararCpf } from "~/utils/formatacao";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ colaboradorId: string }>();

type Vinculo = {
  id: string;
  matricula: string;
  status: "ativo" | "desligado";
  admitidoEm: string;
  desligadoEm: string | null;
  motivoDesligamento: string | null;
  funcaoNome: string;
  funcaoCbo: string | null;
  turnoRotulo: string | null;
  turnoEtiqueta: string | null;
  turnoHoraInicio: string | null;
  turnoHoraFim: string | null;
  jornadaHorario: string | null;
};
type Evento = { id: string; tipo: string; camposAlterados: string[]; atorNome: string | null; ocorridoEm: string };
type Dependente = {
  id: string;
  nomeCompleto: string;
  nascimento: string;
  parentesco: string;
  cpfInformado: boolean;
};
type Perfil = {
  id: string;
  nome: string;
  cpf: string | null;
  criadoEm: string;
  situacao: "ativo" | "inativo" | "conciliacao_pendente";
  vinculoAtivoId: string | null;
  vinculos: Vinculo[];
  eventos: Evento[];
  dependentes: Dependente[];
};

const router = useRouter();
const { apiGet, apiPut, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const perfil = ref<Perfil | null>(null);
const carregando = ref(true);
const erro = ref("");
const editando = ref(false);
const salvando = ref(false);
const nomeEditado = ref("");
const aba = ref("visao_geral");

const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeEditar = computed(() => temPermissao(permissoes.value, "cadastro_colaboradores_editar"));
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(permissoes, () => false);
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");
const vinculoAtivo = computed(() => perfil.value?.vinculos.find((vinculo) => vinculo.status === "ativo") ?? null);
const rotuloSituacao = computed(() => {
  if (perfil.value?.situacao === "ativo") return "Ativo";
  if (perfil.value?.situacao === "inativo") return "Inativo";
  return "Histórico a conciliar";
});
const corSituacao = computed(() => (perfil.value?.situacao === "ativo" ? "success" : "warning"));

const rotuloEvento: Record<string, string> = {
  efetivado: "Colaborador efetivado",
  recontratado: "Novo vínculo de recontratação",
  dados_cadastrais_atualizados: "Dados cadastrais atualizados",
  vinculo_desligado: "Vínculo desligado"
};

async function carregar() {
  perfil.value = await apiGet<Perfil>(`/api/colaboradores/${props.colaboradorId}/perfil`);
  nomeEditado.value = perfil.value.nome;
}

function voltar() {
  void router.push("/colaboradores");
}

async function salvarNome() {
  if (!perfil.value || salvando.value || !nomeEditado.value.trim()) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPut(`/api/colaboradores/${props.colaboradorId}/perfil`, { nome: nomeEditado.value });
    editando.value = false;
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    salvando.value = false;
  }
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate color="primary" />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="colaboradores"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <main class="perfil">
      <section class="perfil__hero">
        <header class="perfil__cabecalho">
          <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para colaboradores" @click="voltar" />
          <div class="perfil__avatar" aria-hidden="true">{{ (perfil?.nome ?? "C").slice(0, 1).toUpperCase() }}</div>
          <div class="perfil__identidade">
            <p class="perfil__contexto">Departamento pessoal / Colaborador</p>
            <div class="perfil__titulo">
              <h1>{{ perfil?.nome ?? "Colaborador" }}</h1>
              <v-chip :color="corSituacao" size="small" variant="flat">
                {{ rotuloSituacao }}
              </v-chip>
            </div>
            <p>{{ perfil?.cpf ? mascararCpf(perfil.cpf) : "CPF não cadastrado" }}</p>
          </div>
          <div class="perfil__acoes">
            <v-btn
              v-if="podeEditar && !editando"
              color="primary"
              variant="flat"
              prepend-icon="mdi-pencil"
              @click="editando = true"
              >Editar nome</v-btn
            >
          </div>
        </header>
      </section>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-5">{{ erro }}</v-alert>

      <v-card v-if="editando && perfil" variant="outlined" class="mb-5">
        <v-card-title>Editar dados cadastrais</v-card-title>
        <v-card-text><v-text-field v-model="nomeEditado" label="Nome completo" maxlength="180" /></v-card-text>
        <v-card-actions
          ><v-spacer /><v-btn variant="text" @click="editando = false">Cancelar</v-btn
          ><v-btn color="primary" variant="flat" :loading="salvando" @click="salvarNome">Salvar</v-btn></v-card-actions
        >
      </v-card>

      <v-tabs v-model="aba" class="perfil__abas mb-5" color="primary" show-arrows>
        <v-tab value="visao_geral">Visão geral</v-tab>
        <v-tab value="cadastro">Cadastro</v-tab>
        <v-tab value="jornada" prepend-icon="mdi-clock-outline">Jornada e ponto</v-tab>
        <v-tab value="dependentes" prepend-icon="mdi-account-child-outline">Dependentes</v-tab>
        <v-tab value="vinculos">Vínculos</v-tab>
        <v-tab value="historico">Histórico</v-tab>
      </v-tabs>

      <v-window v-if="perfil" v-model="aba">
        <v-window-item value="visao_geral">
          <section class="perfil__grade">
            <v-card class="perfil__card perfil__card--resumo" variant="outlined">
              <v-card-title>Resumo atual</v-card-title>
              <v-card-text v-if="vinculoAtivo" class="perfil__resumo">
                <strong>{{ vinculoAtivo.funcaoNome }}</strong>
                <span>Matrícula {{ vinculoAtivo.matricula }}</span>
                <span>Admitido em {{ formatarDataSomenteDia(vinculoAtivo.admitidoEm) }}</span>
                <span v-if="vinculoAtivo.turnoRotulo"
                  >{{ vinculoAtivo.turnoRotulo }} · {{ vinculoAtivo.turnoHoraInicio?.slice(0, 5) }}–{{
                    vinculoAtivo.turnoHoraFim?.slice(0, 5)
                  }}</span
                >
                <span v-else>{{ vinculoAtivo.jornadaHorario }}</span>
              </v-card-text>
              <v-card-text v-else-if="perfil.situacao === 'inativo'"
                >Sem vínculo ativo. O cadastro permanece disponível para consulta e edição do nome. A recontratação só é
                liberada depois do desligamento registrado.</v-card-text
              >
              <v-card-text v-else
                >Este cadastro é anterior ao controle de vínculos. Concilie o histórico antes de registrar desligamento
                ou recontratação.</v-card-text
              >
            </v-card>

            <v-card class="perfil__card perfil__card--onboarding" variant="outlined">
              <v-card-title>Fluxo de onboarding</v-card-title>
              <v-card-text class="perfil__checklist">
                <span v-if="vinculoAtivo"
                  ><v-icon color="success" icon="mdi-check-circle" /> Cadastro e vínculo registrados</span
                >
                <span v-else-if="perfil.situacao === 'inativo'"
                  ><v-icon color="success" icon="mdi-check-circle" /> Vínculo encerrado e preservado no histórico</span
                >
                <span v-else
                  ><v-icon color="warning" icon="mdi-alert-circle" /> Histórico anterior a vínculos: conciliação
                  pendente</span
                >
                <span
                  ><v-icon color="info" icon="mdi-information" /> Complete os dados pessoais, contato e dados bancários
                  antes do envio à contabilidade.</span
                >
              </v-card-text>
            </v-card>
          </section>
        </v-window-item>

        <v-window-item value="cadastro">
          <CadastroColaboradorTabs :colaborador-id="colaboradorId" :pode-editar="podeEditar" />
        </v-window-item>

        <v-window-item value="jornada">
          <JornadaColaboradorPanel :colaborador-id="colaboradorId" :empresa-id="empresaId" :pode-editar="podeEditar" />
        </v-window-item>

        <v-window-item value="dependentes">
          <section class="perfil__secao perfil__secao--primeira">
            <h2>Dependentes declarados na admissão</h2>
            <v-alert type="info" variant="tonal" class="mb-4">
              Esta consulta preserva os dependentes informados na ficha de admissão. A edição no cadastro do colaborador
              exige uma tabela própria de dependentes, que ainda não foi criada.
            </v-alert>
            <v-card v-if="perfil.dependentes.length" variant="outlined" class="perfil__card">
              <v-list lines="two">
                <v-list-item v-for="dependente in perfil.dependentes" :key="dependente.id">
                  <v-list-item-title>{{ dependente.nomeCompleto }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ dependente.parentesco }} · nascimento {{ formatarDataSomenteDia(dependente.nascimento) }} · CPF
                    {{ dependente.cpfInformado ? "informado" : "não informado" }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
            <p v-else class="perfil__vazio">Nenhum dependente foi declarado na ficha de admissão.</p>
          </section>
        </v-window-item>

        <v-window-item value="vinculos">
          <section class="perfil__secao perfil__secao--primeira">
            <h2>Vínculos</h2>
            <v-card v-for="vinculo in perfil.vinculos" :key="vinculo.id" variant="outlined" class="mb-3">
              <v-card-text class="perfil__vinculo">
                <div>
                  <strong>{{ vinculo.matricula }}</strong
                  ><span
                    >{{ vinculo.funcaoNome
                    }}<template v-if="vinculo.funcaoCbo"> · CBO {{ vinculo.funcaoCbo }}</template></span
                  >
                </div>
                <v-chip :color="vinculo.status === 'ativo' ? 'success' : 'default'" size="small" variant="tonal">{{
                  vinculo.status === "ativo" ? "Ativo" : "Desligado"
                }}</v-chip>
                <span>Admissão: {{ formatarDataSomenteDia(vinculo.admitidoEm) }}</span>
                <span v-if="vinculo.desligadoEm">Desligamento: {{ formatarDataHora(vinculo.desligadoEm) }}</span>
              </v-card-text>
            </v-card>
          </section>
        </v-window-item>

        <v-window-item value="historico">
          <section class="perfil__secao perfil__secao--primeira">
            <h2>Linha do tempo</h2>
            <ol class="perfil__linha">
              <li v-for="evento in perfil.eventos" :key="evento.id">
                <strong>{{ rotuloEvento[evento.tipo] ?? evento.tipo }}</strong
                ><span>{{ evento.atorNome ?? "Sistema" }} · {{ formatarDataHora(evento.ocorridoEm) }}</span>
              </li>
            </ol>
            <p v-if="!perfil.eventos.length" class="perfil__vazio">Ainda não há eventos neste cadastro.</p>
          </section>
        </v-window-item>
      </v-window>
    </main>
  </AppShell>
</template>

<style scoped>
.perfil {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 24px 48px;
}
.perfil__hero {
  background: #1b2128;
  border: 1px solid #303943;
  border-radius: 14px;
  margin-bottom: 20px;
  padding: 18px 20px;
}
.perfil__cabecalho {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.perfil__cabecalho > .v-btn:first-child {
  margin: 2px 0 0 -8px;
}
.perfil__avatar {
  align-items: center;
  background: #7c3aed;
  border-radius: 10px;
  color: #fff;
  display: flex;
  flex: 0 0 48px;
  font-size: 1.25rem;
  font-weight: 800;
  height: 48px;
  justify-content: center;
}
.perfil__identidade {
  flex: 1 1 280px;
}
.perfil__contexto {
  color: #b7a3ff;
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.perfil__titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.perfil__titulo h1 {
  font-size: clamp(1.45rem, 3vw, 2rem);
}
.perfil__titulo :deep(.v-chip) {
  font-weight: 700;
}
.perfil__identidade > p:last-child {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin-top: 4px;
}
.perfil__acoes {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.perfil__acoes :deep(.v-btn),
.perfil :deep(.v-btn--variant-flat) {
  box-shadow: none;
  font-weight: 700;
  text-transform: none;
}
.perfil__grade {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.perfil__card {
  background: #1b2128;
  border-color: #303943;
  border-radius: 12px;
  box-shadow: none;
}
.perfil__card :deep(.v-card-title) {
  border-bottom: 1px solid #303943;
  font-size: 0.95rem;
  font-weight: 750;
  padding-bottom: 12px;
}
.perfil__resumo,
.perfil__checklist,
.perfil__vinculo,
.perfil__linha li {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.perfil__checklist span {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.perfil__secao {
  margin-top: 28px;
}

.perfil__secao--primeira {
  margin-top: 0;
}

.perfil__abas {
  background: #171c22;
  border: 1px solid #303943;
  border-radius: 10px;
  padding: 4px;
}
.perfil__abas :deep(.v-tab) {
  border-radius: 7px;
  min-height: 42px;
  text-transform: none;
  font-weight: 700;
}
.perfil__abas :deep(.v-tab--selected) {
  background: #7c3aed;
  color: #fff;
}
.perfil__secao h2 {
  font-size: 1.1rem;
  margin-bottom: 10px;
}
.perfil__vinculo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}
.perfil__vinculo > span {
  grid-column: 1/-1;
}
.perfil__linha {
  list-style: none;
  padding: 0;
  margin: 0;
  border-left: 2px solid rgba(var(--v-theme-primary), 0.35);
}
.perfil__linha li {
  padding: 0 0 18px 16px;
  position: relative;
}
.perfil__linha li:before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  position: absolute;
  left: -6px;
  top: 5px;
}
.perfil__linha span,
.perfil__vazio {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.9rem;
}
@media (max-width: 700px) {
  .perfil {
    padding: 16px 12px 32px;
  }
  .perfil__hero {
    padding: 14px;
  }
  .perfil__grade {
    grid-template-columns: 1fr;
  }
  .perfil__acoes {
    width: 100%;
    margin-left: 0;
  }
  .perfil__acoes .v-btn {
    width: 100%;
    min-height: 44px;
  }
  .perfil :deep(.v-card-actions .v-btn) {
    min-height: 44px;
  }
}
</style>
