<script setup lang="ts">
import { ref, watch } from "vue";
import type { CampanhaComProgresso, StatusCampanha } from "@padaria/shared/campanhas";
import type { Opcao } from "~/types/padaria";
import { dinheiro, mensagemErro } from "~/utils/domain";
import CampanhaFormularioDialog from "~/components/campanhas/CampanhaFormularioDialog.vue";
import CampanhaProgresso from "~/components/campanhas/CampanhaProgresso.vue";

const props = defineProps<{ empresaId: string; pdvs: Opcao[]; podeGerenciar: boolean }>();

const { apiGet, apiPost, apiPut } = useApi();

const campanhas = ref<CampanhaComProgresso[]>([]);
const carregando = ref(false);
const erro = ref("");
const formularioAberto = ref(false);
const emEdicao = ref<CampanhaComProgresso | null>(null);

const STATUS_COR: Record<StatusCampanha, string> = {
  rascunho: "default",
  ativa: "success",
  encerrada: "info",
  cancelada: "error"
};
const STATUS_ROTULO: Record<StatusCampanha, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  encerrada: "Encerrada",
  cancelada: "Cancelada"
};

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    campanhas.value = await apiGet<CampanhaComProgresso[]>(
      `/api/campanhas?empresaId=${encodeURIComponent(props.empresaId)}`
    );
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

function abrirNova() {
  emEdicao.value = null;
  formularioAberto.value = true;
}

function abrirEdicao(campanha: CampanhaComProgresso) {
  emEdicao.value = campanha;
  formularioAberto.value = true;
}

async function salvar(dados: Record<string, unknown>) {
  const payload = { empresaId: props.empresaId, ...dados };
  try {
    if (emEdicao.value) await apiPut(`/api/campanhas/${emEdicao.value.id}`, payload);
    else await apiPost("/api/campanhas", payload);
    formularioAberto.value = false;
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  }
}

async function mudarStatus(campanha: CampanhaComProgresso, status: StatusCampanha) {
  try {
    await apiPut(`/api/campanhas/${campanha.id}/status?empresaId=${encodeURIComponent(props.empresaId)}`, { status });
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  }
}

watch(() => props.empresaId, carregar, { immediate: true });
</script>

<template>
  <section class="campanhas-page">
    <header class="campanhas-page__topo">
      <div>
        <p class="campanhas-page__ajuda">
          A bonificação é informativa e auditável. Ela nunca lança em caixa, financeiro, contas ou folha.
        </p>
      </div>
      <v-spacer />
      <v-btn
        v-if="podeGerenciar"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        data-teste="nova-campanha"
        @click="abrirNova"
      >
        Nova campanha
      </v-btn>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-4" />

    <v-alert v-else-if="!campanhas.length" type="info" variant="tonal"> Nenhuma campanha cadastrada. </v-alert>

    <div v-else class="campanhas-page__grade">
      <v-card v-for="campanha in campanhas" :key="campanha.id" variant="outlined" class="campanha-card">
        <v-card-title class="campanha-card__titulo">
          <span>{{ campanha.titulo }}</span>
          <v-chip size="x-small" :color="STATUS_COR[campanha.status]" variant="tonal">
            {{ STATUS_ROTULO[campanha.status] }}
          </v-chip>
        </v-card-title>

        <v-card-text>
          <p class="campanha-card__mensagem">{{ campanha.mensagem }}</p>
          <p class="campanha-card__periodo">
            {{ campanha.inicio }} até {{ campanha.fim }} · {{ campanha.pdvs.length }}
            {{ campanha.pdvs.length === 1 ? "PDV" : "PDVs" }}
          </p>

          <CampanhaProgresso :campanha="campanha" />

          <p class="campanha-card__bonificacao">
            Bonificação:
            <strong v-if="campanha.bonificacaoTipo === 'dinheiro'">{{
              dinheiro(campanha.bonificacaoValor ?? 0)
            }}</strong>
            <strong v-else-if="campanha.bonificacaoTipo === 'percentual'">{{ campanha.bonificacaoValor }}%</strong>
            <strong v-else>{{ campanha.bonificacaoTexto }}</strong>
          </p>
        </v-card-text>

        <v-card-actions v-if="podeGerenciar && campanha.status !== 'encerrada' && campanha.status !== 'cancelada'">
          <v-btn size="small" variant="text" prepend-icon="mdi-pencil" @click="abrirEdicao(campanha)">Editar</v-btn>
          <v-spacer />
          <v-btn
            v-if="campanha.status === 'rascunho'"
            size="small"
            variant="tonal"
            color="success"
            @click="mudarStatus(campanha, 'ativa')"
          >
            Ativar
          </v-btn>
          <v-btn
            v-if="campanha.status === 'ativa'"
            size="small"
            variant="tonal"
            @click="mudarStatus(campanha, 'encerrada')"
          >
            Encerrar
          </v-btn>
          <v-btn size="small" variant="text" color="error" @click="mudarStatus(campanha, 'cancelada')">Cancelar</v-btn>
        </v-card-actions>
      </v-card>
    </div>

    <CampanhaFormularioDialog v-model="formularioAberto" :pdvs="pdvs" :campanha="emEdicao" @salvar="salvar" />
  </section>
</template>

<style scoped>
.campanhas-page {
  display: grid;
  gap: 16px;
}

.campanhas-page__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.campanhas-page__ajuda {
  margin: 0;
  max-width: 62ch;
  color: var(--cx-ink-soft);
  font-size: 0.9rem;
}

.campanhas-page__grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: 16px;
}

.campanha-card__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 1.05rem;
  font-weight: 700;
  white-space: normal;
}

.campanha-card__mensagem {
  margin: 0 0 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.campanha-card__periodo {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: var(--cx-ink-soft);
}

.campanha-card__bonificacao {
  margin: 12px 0 0;
  font-size: 0.9rem;
}
</style>
