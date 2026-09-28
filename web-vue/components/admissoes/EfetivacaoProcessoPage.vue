<script setup lang="ts">
import type { AuthSession, ProcessoDetalheDto } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";
import { rotuloIdentidadeProcesso } from "~/utils/admissoes";

const props = defineProps<{ processoId: string }>();

type ResultadoEfetivacao = { colaboradorId: string; vinculoId: string; matricula: string; repetido: boolean };

const router = useRouter();
const { apiGet, apiPost, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const processo = ref<ProcessoDetalheDto | null>(null);
const carregando = ref(true);
const efetivando = ref(false);
const erro = ref("");

const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(permissoes, () => false);
const podeEfetivar = computed(() => temPermissao(permissoes.value, "admissoes_processos_efetivar"));
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");
const pronto = computed(
  () =>
    processo.value?.status === "iniciado" &&
    processo.value.internos.exameSituacao === "aso_apto" &&
    Boolean(processo.value.internos.dataAdmissao)
);

function voltar() {
  void router.push("/admissoes_processos");
}

async function efetivar() {
  if (efetivando.value || !podeEfetivar.value || !pronto.value) return;
  efetivando.value = true;
  erro.value = "";
  try {
    const resultado = await apiPost<ResultadoEfetivacao>(`/api/admissoes/processos/${props.processoId}/efetivar`, {});
    await router.push(`/colaboradores/${resultado.colaboradorId}`);
  } catch (error) {
    erro.value = mensagemErro(error);
    // O servidor é a fonte de verdade: se houve alteração concorrente, a tela relê as condições.
    try {
      processo.value = await apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${props.processoId}`);
    } catch {
      // Mantém a mensagem original; a próxima abertura refaz o carregamento completo.
    }
  } finally {
    efetivando.value = false;
  }
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!podeEfetivar.value) {
      erro.value = "Sem permissão para efetivar colaboradores.";
      return;
    }
    processo.value = await apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${props.processoId}`);
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
    tela-ativa="admissoes_processos"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <main class="efetivacao">
      <header class="efetivacao__cabecalho">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para Processos de admissão" @click="voltar" />
        <div>
          <p class="efetivacao__contexto">Departamento pessoal</p>
          <h1>Efetivar colaborador</h1>
          <p v-if="processo" class="efetivacao__subtitulo">{{ rotuloIdentidadeProcesso(processo.nomeCompleto) }}</p>
        </div>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-5">{{ erro }}</v-alert>

      <v-card v-if="processo" variant="outlined">
        <v-card-title>Conferência antes de efetivar</v-card-title>
        <v-card-text>
          <p class="mb-4">
            A efetivação cria a matrícula e o vínculo histórico. A ficha por link é opcional nesta fase: o DP começa o
            dossiê diretamente no perfil do colaborador.
          </p>
          <v-list density="comfortable" class="efetivacao__lista">
            <v-list-item :prepend-icon="processo.status === 'iniciado' ? 'mdi-check-circle' : 'mdi-alert-circle'">
              <v-list-item-title>Processo de admissão ativo</v-list-item-title>
              <v-list-item-subtitle>{{
                processo.status === "iniciado" ? "Confirmado" : "Regularize o status do processo."
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item
              :prepend-icon="processo.internos.exameSituacao === 'aso_apto' ? 'mdi-check-circle' : 'mdi-alert-circle'"
            >
              <v-list-item-title>ASO apto</v-list-item-title>
              <v-list-item-subtitle>{{
                processo.internos.exameSituacao === "aso_apto" ? "Confirmado" : "Registre o ASO como apto."
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item :prepend-icon="processo.internos.dataAdmissao ? 'mdi-check-circle' : 'mdi-alert-circle'">
              <v-list-item-title>Data de admissão</v-list-item-title>
              <v-list-item-subtitle>{{
                processo.internos.dataAdmissao || "Informe a data nos dados internos."
              }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="success"
            variant="flat"
            :disabled="!pronto || !podeEfetivar"
            :loading="efetivando"
            @click="efetivar"
          >
            Confirmar efetivação
          </v-btn>
        </v-card-actions>
      </v-card>
    </main>
  </AppShell>
</template>

<style scoped>
.efetivacao {
  max-width: 860px;
  margin: 0 auto;
  padding: 20px 16px;
}
.efetivacao__cabecalho {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.efetivacao__contexto {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.efetivacao__subtitulo {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.68);
}
.efetivacao__lista {
  padding: 0;
}
@media (max-width: 480px) {
  .efetivacao {
    padding: 16px 12px;
  }
  .efetivacao :deep(.v-card-actions .v-btn) {
    width: 100%;
    min-height: 44px;
  }
}
</style>
