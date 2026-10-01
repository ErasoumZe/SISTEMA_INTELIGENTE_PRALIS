<script setup lang="ts">
import type { AuthSession, FichaRevisaoDto, ProcessoDetalheDto } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import FichaDadosCandidato from "~/components/admissoes/FichaDadosCandidato.vue";
import FichaRevisaoCampos from "~/components/admissoes/FichaRevisaoCampos.vue";
import FichaRevisaoDependentes from "~/components/admissoes/FichaRevisaoDependentes.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";
import { rotuloIdentidadeProcesso, rotuloTurnoDoProcesso } from "~/utils/admissoes";
import { formatarDataSomenteDia } from "~/utils/formatacao";
import { gruposDaFichaPublica } from "~/utils/ficha-campos";

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
const aba = ref("dados");
const editando = ref(false);
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
// O rascunho interno e o unico estado editavel nesta tela. Toda ficha existente, inclusive enviada,
// aprovada, devolvida ou concluida, permanece visivel em leitura para nao perder evidencia.
const eManual = computed(() => Boolean(ficha.value));
const fichaInternaEditavel = computed(() => ficha.value?.situacao === "rascunho_dp");
const concluida = computed(() => ficha.value?.situacao === "concluida_dp");
const podeEditarFicha = computed(() => podeEditar.value && fichaInternaEditavel.value);

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
async function carregar(abrirRascunho = false) {
  const [detalhe, dados] = await Promise.all([
    apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${props.processoId}`),
    apiGet<FichaRevisaoDto>(rota.value)
  ]);
  processo.value = detalhe;
  ficha.value = dados;
  if (dados) preencherFormulario(dados);
  if (abrirRascunho && dados?.situacao === "rascunho_dp" && podeEditar.value) {
    editando.value = true;
    await nextTick();
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}
async function iniciarFicha() {
  if (!podeEditar.value || salvando.value) return;
  salvando.value = true;
  try {
    ficha.value = await apiPost<FichaRevisaoDto>(`${rota.value}/iniciar`, {});
    preencherFormulario(ficha.value);
    editando.value = true;
    notificar("Ficha interna iniciada. Preencha os blocos e salve as alterações.");
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
function corpo() {
  return { versao: ficha.value?.versao, ...formulario, semDependentes: semDependentes.value };
}
function iniciarEdicao() {
  if (!ficha.value || !podeEditarFicha.value) return;
  preencherFormulario(ficha.value);
  editando.value = true;
}
function cancelarEdicao() {
  if (ficha.value) preencherFormulario(ficha.value);
  editando.value = false;
}
async function salvar() {
  if (!ficha.value || !podeEditar.value || salvando.value || !fichaInternaEditavel.value) return;
  salvando.value = true;
  try {
    await apiPut(rota.value, corpo());
    await carregar(true);
    editando.value = false;
    notificar("Ficha do DP salva. A linha do tempo registrou a alteração.");
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
async function concluir() {
  if (!ficha.value || salvando.value || !fichaInternaEditavel.value || concluida.value) return;
  salvando.value = true;
  try {
    await apiPost(`${rota.value}/concluir`, corpo());
    await carregar();
    editando.value = false;
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
    <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
    <article v-else-if="processo" class="ficha-dp">
      <header class="ficha-dp__cabecalho">
        <v-btn
          icon="mdi-arrow-left"
          variant="text"
          aria-label="Voltar para processos"
          @click="router.push('/admissoes_processos')"
        />
        <div>
          <p>DEPARTAMENTO PESSOAL · PREENCHIMENTO INTERNO</p>
          <h1>{{ rotuloIdentidadeProcesso(processo.nomeCompleto) }}</h1>
          <span>{{ processo.funcaoNome }} · {{ rotuloTurnoDoProcesso(processo) }}</span>
        </div>
        <v-spacer />
        <v-btn v-if="!editando && podeEditarFicha" color="primary" prepend-icon="mdi-pencil" @click="iniciarEdicao">
          Editar ficha
        </v-btn>
      </header>
      <v-alert v-if="!ficha" type="info" variant="tonal">
        Esta ficha ainda não foi iniciada pelo DP. A consulta não cria dados automaticamente.
        <template #append>
          <v-btn v-if="podeEditar" color="primary" size="small" :loading="salvando" @click="iniciarFicha">
            Iniciar ficha
          </v-btn>
        </template>
      </v-alert>
      <template v-else>
        <v-alert v-if="concluida" type="success" variant="tonal">
          Conferência do DP concluída. Para corrigir dados, registre uma nova etapa com o responsável do DP.
        </v-alert>
        <template v-if="eManual && editando">
          <v-alert type="info" variant="tonal">
            Preencha por blocos. Campos obrigatórios estão destacados; cada salvamento fica registrado na linha do
            tempo.
          </v-alert>
          <nav class="ficha-dp__atalhos" aria-label="Ir para uma seção da ficha">
            <v-btn
              v-for="grupo in gruposDaFichaPublica"
              :key="grupo.id"
              :href="`#dados-${grupo.id}`"
              size="small"
              variant="tonal"
            >
              {{ grupo.titulo }}
            </v-btn>
            <v-btn href="#dependentes" size="small" variant="tonal">Dependentes</v-btn>
          </nav>
          <FichaDadosCandidato :formulario="formulario" :somente-leitura="!podeEditar" />
          <section id="dependentes" class="ficha-dp__dependentes">
            <h2>Dependentes</h2>
            <v-radio-group
              v-model="semDependentes"
              :disabled="!podeEditar"
              inline
              label="Possui dependentes para cadastro?"
            >
              <v-radio :value="true" label="Não possui" />
              <v-radio :value="false" label="Possui" />
            </v-radio-group>
            <v-alert v-if="semDependentes === false" type="warning" variant="tonal" density="compact">
              O cadastro de dependentes pelo DP ainda não está disponível nesta ficha. Não conclua esta declaração: ela
              exige pelo menos um dependente cadastrado e será liberada somente com o fluxo interno real.
            </v-alert>
          </section>
          <footer class="ficha-dp__acoes">
            <v-btn variant="outlined" :disabled="salvando" @click="cancelarEdicao">Cancelar</v-btn>
            <v-btn color="primary" :loading="salvando" :disabled="!podeEditar" @click="salvar">Salvar alterações</v-btn>
            <v-btn color="success" :loading="salvando" :disabled="!podeEditar" @click="concluir"
              >Concluir conferência do DP</v-btn
            >
          </footer>
        </template>
        <template v-else-if="eManual">
          <v-card class="ficha-dp__resumo" variant="tonal">
            <v-card-text>
              <div>
                <span class="ficha-dp__rotulo">Situação</span
                ><strong>{{ concluida ? "Conferida pelo DP" : "Em preenchimento pelo DP" }}</strong>
              </div>
              <div>
                <span class="ficha-dp__rotulo">Data de admissão</span
                ><strong>{{ formatarDataSomenteDia(processo.internos.dataAdmissao) }}</strong>
              </div>
              <div>
                <span class="ficha-dp__rotulo">Exame admissional</span
                ><strong>{{ processo.internos.exameSituacao.replaceAll("_", " ") }}</strong>
              </div>
            </v-card-text>
          </v-card>
          <v-tabs v-model="aba" class="ficha-dp__abas" color="primary" show-arrows>
            <v-tab value="dados">Dados pessoais</v-tab>
            <v-tab value="endereco">Endereço</v-tab>
            <v-tab value="documentos">Documentos</v-tab>
            <v-tab value="dependentes">Dependentes</v-tab>
            <v-tab value="vinculo">Vínculo</v-tab>
          </v-tabs>
          <v-window v-model="aba" class="ficha-dp__conteudo" :touch="false">
            <v-window-item value="dados"
              ><FichaRevisaoCampos :campos="ficha.campos" :secoes="['identificacao', 'contato']"
            /></v-window-item>
            <v-window-item value="endereco"
              ><FichaRevisaoCampos :campos="ficha.campos" :secoes="['endereco']"
            /></v-window-item>
            <v-window-item value="documentos"
              ><FichaRevisaoCampos :campos="ficha.campos" :secoes="['documentos', 'bancarios']"
            /></v-window-item>
            <v-window-item value="dependentes"
              ><FichaRevisaoDependentes :dependentes="ficha.dependentes" :sem-dependentes="ficha.semDependentes"
            /></v-window-item>
            <v-window-item value="vinculo">
              <section class="ficha-dp__vinculo">
                <h2>Vínculo e etapa interna</h2>
                <v-alert v-if="processo.efetivado" type="success" variant="tonal" density="compact">
                  Efetivado em {{ formatarDataSomenteDia(processo.dataEfetivacao) }}. Esta data é histórica e não pode
                  ser alterada.
                </v-alert>
                <dl>
                  <div>
                    <dt>Data de admissão programada</dt>
                    <dd>{{ formatarDataSomenteDia(processo.internos.dataAdmissao) }}</dd>
                  </div>
                  <div>
                    <dt>Função</dt>
                    <dd>{{ processo.funcaoNome ?? "Não informada" }}</dd>
                  </div>
                  <div>
                    <dt>Turno</dt>
                    <dd>{{ rotuloTurnoDoProcesso(processo) }}</dd>
                  </div>
                </dl>
                <p>A data passa a ser somente leitura quando o colaborador for efetivado.</p>
              </section>
            </v-window-item>
          </v-window>
        </template>
        <v-alert v-else type="warning" variant="tonal">
          Esta ficha pertence a um fluxo anterior e está disponível somente para consulta. Nenhum dado histórico será
          sobrescrito nesta tela.
        </v-alert>
      </template>
    </article>
  </AppShell>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="4000">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.ficha-dp {
  display: grid;
  gap: var(--cx-sp-4);
  max-width: 960px;
  padding-bottom: var(--cx-sp-8);
}
.ficha-dp__cabecalho {
  display: flex;
  gap: var(--cx-sp-2);
  align-items: flex-start;
}
.ficha-dp__cabecalho p,
.ficha-dp__cabecalho span {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.ficha-dp__cabecalho h1,
.ficha-dp__dependentes h2 {
  margin: 0;
  color: var(--cx-ink);
}
.ficha-dp__dependentes {
  padding: var(--cx-sp-4);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.ficha-dp__atalhos {
  position: sticky;
  top: var(--cx-sp-2);
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1);
  padding: var(--cx-sp-2);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  background: color-mix(in srgb, var(--cx-surface) 92%, transparent);
  backdrop-filter: blur(10px);
}
.ficha-dp__acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
}
.ficha-dp__resumo :deep(.v-card-text) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}
.ficha-dp__resumo strong,
.ficha-dp__rotulo {
  display: block;
}
.ficha-dp__rotulo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.ficha-dp__conteudo {
  overflow: visible;
}
.ficha-dp__vinculo {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}
.ficha-dp__vinculo h2,
.ficha-dp__vinculo p {
  margin: 0;
}
.ficha-dp__vinculo p,
.ficha-dp__vinculo dt {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.ficha-dp__vinculo dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
}
.ficha-dp__vinculo dd {
  margin: 0;
  color: var(--cx-ink);
  overflow-wrap: anywhere;
}
@media (max-width: 768px) {
  .ficha-dp__resumo :deep(.v-card-text),
  .ficha-dp__vinculo dl {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .ficha-dp__acoes :deep(.v-btn) {
    width: 100%;
  }
}
</style>
