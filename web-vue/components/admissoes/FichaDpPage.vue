<script setup lang="ts">
import type { AuthSession, FichaRevisaoDto, ProcessoDetalheDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import FichaDadosCandidato from "~/components/admissoes/FichaDadosCandidato.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";
import { rotuloIdentidadeProcesso, rotuloTurnoDoProcesso } from "~/utils/admissoes";

const props = defineProps<{ processoId: string }>();
const router = useRouter();
const { apiGet, apiPut, apiPost, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const processo = ref<ProcessoDetalheDto | null>(null);
const ficha = ref<FichaRevisaoDto | null>(null);
const carregando = ref(true);
const salvando = ref(false);
const erro = ref("");
const formulario = reactive<Record<string, string>>({});
const semDependentes = ref<boolean | null>(null);
const snackbar = reactive({ show: false, text: "", color: "success" });

const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoes,
  () => false
);
const podeEditar = computed(() => temPermissao("admissoes_processos_revisar_ficha"));
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");
const rota = computed(() => `/api/admissoes/processos/${props.processoId}/ficha-dp`);
// `enviada` e o unico registro de teste do fluxo antigo. Ele permanece auditavel, mas agora o DP
// pode completar e corrigir os dados sem devolver a ficha a uma pessoa candidata.
const eManual = computed(() => ficha.value?.situacao === "rascunho_dp" || ficha.value?.situacao === "enviada" || ficha.value?.situacao === "concluida_dp");
const concluida = computed(() => ficha.value?.situacao === "concluida_dp");

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}
function preencherFormulario(dados: FichaRevisaoDto) {
  Object.keys(formulario).forEach((chave) => delete formulario[chave]);
  Object.entries(dados.campos).forEach(([chave, valor]) => (formulario[chave] = valor ?? ""));
  semDependentes.value = dados.semDependentes;
}
async function carregar() {
  const [detalhe, dados] = await Promise.all([
    apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${props.processoId}`),
    apiGet<FichaRevisaoDto>(rota.value)
  ]);
  processo.value = detalhe;
  ficha.value = dados;
  preencherFormulario(dados);
}
function corpo() {
  return { versao: ficha.value?.versao, ...formulario, semDependentes: semDependentes.value };
}
async function salvar() {
  if (!ficha.value || !podeEditar.value || salvando.value || !eManual.value || concluida.value) return;
  salvando.value = true;
  try {
    await apiPut(rota.value, corpo());
    await carregar();
    notificar("Ficha do DP salva. A linha do tempo registrou a alteração.");
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
async function concluir() {
  if (!ficha.value || salvando.value || !eManual.value || concluida.value) return;
  salvando.value = true;
  try {
    await apiPost(`${rota.value}/concluir`, corpo());
    await carregar();
    notificar("Conferência do DP concluída.");
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("admissoes_processos_ver_ficha")) {
      erro.value = "Sem permissão para acessar a ficha do DP.";
      return;
    }
    await carregar();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate color="primary" />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao" :telas="telasPermitidas" tela-ativa="admissoes_processos"
    :empresas="empresas" :empresa-id="empresaId" :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu" :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
    <article v-else-if="processo && ficha" class="ficha-dp">
      <header class="ficha-dp__cabecalho">
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Voltar para processos" @click="router.push('/admissoes_processos')" />
        <div>
          <p>DEPARTAMENTO PESSOAL · PREENCHIMENTO INTERNO</p>
          <h1>{{ rotuloIdentidadeProcesso(processo.nomeCompleto) }}</h1>
          <span>{{ processo.funcaoNome }} · {{ rotuloTurnoDoProcesso(processo) }}</span>
        </div>
      </header>
      <v-alert v-if="concluida" type="success" variant="tonal">
        Conferência do DP concluída. Para corrigir dados, registre uma nova etapa com o responsável do DP.
      </v-alert>
      <template v-else-if="eManual">
        <v-alert type="info" variant="tonal">Preencha por blocos. Campos obrigatórios estão destacados; cada salvamento fica registrado na linha do tempo.</v-alert>
        <FichaDadosCandidato :formulario="formulario" :somente-leitura="!podeEditar" />
        <section class="ficha-dp__dependentes">
          <h2>Dependentes</h2>
          <v-radio-group v-model="semDependentes" :disabled="!podeEditar" inline label="Possui dependentes para cadastro?">
            <v-radio :value="true" label="Não possui" />
            <v-radio :value="false" label="Possui" />
          </v-radio-group>
          <v-alert v-if="semDependentes === false" type="warning" variant="tonal" density="compact">O cadastro interno de dependentes será aberto nesta mesma ficha antes da conclusão.</v-alert>
        </section>
        <footer class="ficha-dp__acoes">
          <v-btn variant="outlined" :loading="salvando" :disabled="!podeEditar" @click="salvar">Salvar ficha</v-btn>
          <v-btn color="success" :loading="salvando" :disabled="!podeEditar" @click="concluir">Concluir conferência do DP</v-btn>
        </footer>
      </template>
      <v-alert v-else type="warning" variant="tonal">
        Esta ficha pertence a um fluxo anterior encerrado e não pode ser reaberta automaticamente.
      </v-alert>
    </article>
  </AppShell>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.ficha-dp { display: grid; gap: var(--cx-sp-4); max-width: 960px; padding-bottom: var(--cx-sp-8); }
.ficha-dp__cabecalho { display: flex; gap: var(--cx-sp-2); align-items: flex-start; }
.ficha-dp__cabecalho p, .ficha-dp__cabecalho span { margin: 0; color: var(--cx-ink-soft); font-size: var(--cx-fs-caption); }
.ficha-dp__cabecalho h1, .ficha-dp__dependentes h2 { margin: 0; color: var(--cx-ink); }
.ficha-dp__dependentes { padding: var(--cx-sp-4); border-radius: var(--cx-r-lg); background: var(--cx-surface); box-shadow: var(--cx-e-1); }
.ficha-dp__acoes { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--cx-sp-2); }
@media (max-width: 600px) { .ficha-dp__acoes :deep(.v-btn) { width: 100%; } }
</style>
