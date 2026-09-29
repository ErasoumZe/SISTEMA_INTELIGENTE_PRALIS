<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import CadastroColaboradorTabs from "~/components/colaboradores/CadastroColaboradorTabs.vue";
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
type Perfil = {
  id: string;
  nome: string;
  cpf: string | null;
  criadoEm: string;
  situacao: "ativo" | "inativo" | "conciliacao_pendente";
  vinculoAtivoId: string | null;
  vinculos: Vinculo[];
  eventos: Evento[];
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
      <header class="perfil__cabecalho">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para colaboradores" @click="voltar" />
        <div class="perfil__identidade">
          <p class="perfil__contexto">Departamento pessoal</p>
          <div class="perfil__titulo">
            <h1>{{ perfil?.nome ?? "Colaborador" }}</h1>
            <v-chip :color="corSituacao" size="small" variant="tonal">
              {{ rotuloSituacao }}
            </v-chip>
          </div>
          <p>{{ perfil?.cpf ? mascararCpf(perfil.cpf) : "CPF não cadastrado" }}</p>
        </div>
        <v-btn v-if="podeEditar && !editando" variant="outlined" prepend-icon="mdi-pencil" @click="editando = true"
          >Editar nome</v-btn
        >
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-5">{{ erro }}</v-alert>

      <v-card v-if="editando && perfil" variant="outlined" class="mb-5">
        <v-card-title>Editar dados cadastrais</v-card-title>
        <v-card-text><v-text-field v-model="nomeEditado" label="Nome completo" maxlength="180" /></v-card-text>
        <v-card-actions
          ><v-spacer /><v-btn variant="text" @click="editando = false">Cancelar</v-btn
          ><v-btn color="primary" variant="flat" :loading="salvando" @click="salvarNome">Salvar</v-btn></v-card-actions
        >
      </v-card>

      <template v-if="perfil">
        <section class="perfil__grade">
          <v-card variant="outlined">
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
              >Este cadastro é anterior ao controle de vínculos. Concilie o histórico antes de registrar desligamento ou
              recontratação.</v-card-text
            >
          </v-card>

          <v-card variant="outlined">
            <v-card-title>Fluxo de onboarding</v-card-title>
            <v-card-text class="perfil__checklist">
              <span v-if="vinculoAtivo"><v-icon color="success" icon="mdi-check-circle" /> Cadastro e vínculo registrados</span>
              <span v-else-if="perfil.situacao === 'inativo'"
                ><v-icon color="success" icon="mdi-check-circle" /> Vínculo encerrado e preservado no histórico</span
              >
              <span v-else
                ><v-icon color="warning" icon="mdi-alert-circle" /> Histórico anterior a vínculos: conciliação pendente</span
              >
              <span><v-icon color="info" icon="mdi-information" /> Complete os dados pessoais, contato e dados bancários antes do envio à contabilidade.</span>
            </v-card-text>
          </v-card>
        </section>

        <CadastroColaboradorTabs :colaborador-id="colaboradorId" :pode-editar="podeEditar" />

        <section class="perfil__secao">
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

        <section class="perfil__secao">
          <h2>Linha do tempo</h2>
          <ol class="perfil__linha">
            <li v-for="evento in perfil.eventos" :key="evento.id">
              <strong>{{ rotuloEvento[evento.tipo] ?? evento.tipo }}</strong
              ><span>{{ evento.atorNome ?? "Sistema" }} · {{ formatarDataHora(evento.ocorridoEm) }}</span>
            </li>
          </ol>
          <p v-if="!perfil.eventos.length" class="perfil__vazio">Ainda não há eventos neste cadastro.</p>
        </section>
      </template>
    </main>
  </AppShell>
</template>

<style scoped>
.perfil {
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px 16px;
}
.perfil__cabecalho {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.perfil__identidade {
  flex: 1 1 280px;
}
.perfil__contexto {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
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
.perfil__identidade > p:last-child {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin-top: 4px;
}
.perfil__grade {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
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
    padding: 16px 12px;
  }
  .perfil__grade {
    grid-template-columns: 1fr;
  }
  .perfil__cabecalho > .v-btn:last-child {
    width: 100%;
    min-height: 44px;
  }
  .perfil :deep(.v-card-actions .v-btn) {
    min-height: 44px;
  }
}
</style>
