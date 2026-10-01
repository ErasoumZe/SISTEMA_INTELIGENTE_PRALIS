<script setup lang="ts">
import type {
  AuthSession,
  DadosInternosDto,
  HistoricoProcessoDto,
  ProcessoDetalheDto,
  SituacaoExame
} from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import GuiaExameOcupacionalDialog from "~/components/admissoes/GuiaExameOcupacionalDialog.vue";
import ProcessoDetalheDialog from "~/components/admissoes/ProcessoDetalheDialog.vue";
import ProcessoInternosDialog from "~/components/admissoes/ProcessoInternosDialog.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";
import { rotaRevisaoDaFicha } from "~/utils/admissoes";

const props = defineProps<{ processoId: string }>();
const router = useRouter();
const { apiGet, apiGetPaginado, apiPost, apiPut, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const processo = ref<ProcessoDetalheDto | null>(null);
const historico = ref<HistoricoProcessoDto[]>([]);
const carregando = ref(true);
const processando = ref(false);
const erro = ref("");
const internoErro = ref("");
const internosAberto = ref(false);
const guiaAberta = ref(false);
const cpfRevelado = ref<string | null>(null);
const revelandoCpf = ref(false);
const snackbar = reactive({ show: false, text: "", color: "success" });

const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(permissoes, () => false);
const podeCancelar = computed(() => temPermissao(permissoes.value, "admissoes_processos_cancelar"));
const podeEfetivar = computed(() => temPermissao(permissoes.value, "admissoes_processos_efetivar"));
const podeEditarInternos = computed(() => temPermissao(permissoes.value, "admissoes_processos_editar_internos"));
const podeVerCpf = computed(() => temPermissao(permissoes.value, "admissoes_processos_visualizar"));
const podeRevisarFicha = computed(() => temPermissao(permissoes.value, "admissoes_processos_ver_ficha"));
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");
const empresa = computed(() => (sessao.value?.empresas ?? []).find((item) => item.id === empresaId.value) ?? null);

function notificar(texto: string, cor = "success") {
  snackbar.text = texto;
  snackbar.color = cor;
  snackbar.show = true;
}

async function carregar() {
  const [detalhe, eventos] = await Promise.all([
    apiGet<ProcessoDetalheDto>(`/api/admissoes/processos/${props.processoId}`),
    apiGetPaginado<HistoricoProcessoDto>(`/api/admissoes/processos/${props.processoId}/historico?page=1&pageSize=50`)
  ]);
  processo.value = detalhe;
  historico.value = eventos.itens;
}

async function salvarInternos(dados: Record<string, unknown> | null, exame: SituacaoExame | null) {
  if (!processo.value) return;
  processando.value = true;
  internoErro.value = "";
  try {
    if (dados) await apiPut(`/api/admissoes/processos/${processo.value.id}/internos`, dados);
    if (exame) {
      if (dados) await carregar();
      await apiPut(`/api/admissoes/processos/${processo.value.id}/exame`, {
        versao: processo.value.internos.versao,
        situacao: exame
      });
    }
    internosAberto.value = false;
    notificar(exame ? "Exame admissional atualizado." : "Dados internos salvos.");
    await carregar();
  } catch (causa) {
    internoErro.value = mensagemErro(causa);
    await carregar();
  } finally {
    processando.value = false;
  }
}

async function revelarCpf() {
  if (!processo.value || revelandoCpf.value || cpfRevelado.value) return;
  revelandoCpf.value = true;
  try {
    const resposta = await apiPost<{ cpf: string }>(`/api/admissoes/processos/${processo.value.id}/cpf`, {});
    cpfRevelado.value = resposta.cpf;
    await carregar();
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    revelandoCpf.value = false;
  }
}

async function cancelar() {
  if (!processo.value) return;
  processando.value = true;
  try {
    await apiPost(`/api/admissoes/processos/${processo.value.id}/cancelar`, { versao: processo.value.versao });
    notificar("Processo de admissão cancelado e arquivado.");
    await carregar();
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    processando.value = false;
  }
}

function efetivar() {
  if (processo.value) void router.push(`/admissoes_processos/${processo.value.id}/efetivar`);
}

function revisarFicha() {
  if (processo.value) void router.push(rotaRevisaoDaFicha(processo.value.id));
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao(permissoes.value, "admissoes_processos_visualizar")) {
      erro.value = "Sem permissão para visualizar processos de admissão.";
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
    <template v-else>
      <header class="processo-pagina__voltar">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.push('/admissoes_processos')">
          Voltar para processos
        </v-btn>
      </header>
      <ProcessoDetalheDialog
        :aberto="true"
        :processo="processo"
        :historico="historico"
        :carregando="false"
        :pode-cancelar="podeCancelar"
        :pode-efetivar="podeEfetivar"
        :pode-editar-internos="podeEditarInternos"
        :processando="processando"
        :pode-ver-teste="false"
        :pode-ver-cpf="podeVerCpf"
        :cpf-revelado="cpfRevelado"
        :revelando-cpf="revelandoCpf"
        :convite="null"
        :pode-convidar="false"
        :token-emitido="null"
        :convite-pendente="false"
        :pode-revisar-ficha="podeRevisarFicha"
        :mostrar-fechar="false"
        @fechar="router.push('/admissoes_processos')"
        @cancelar="cancelar"
        @efetivar="efetivar"
        @revelar-cpf="revelarCpf"
        @gerar-guia="guiaAberta = true"
        @revisar-ficha="revisarFicha"
        @editar-internos="internosAberto = true"
      />
    </template>

    <ProcessoInternosDialog
      :aberto="internosAberto"
      :empresa-id="empresaId"
      :internos="processo?.internos ?? null"
      :efetivado="processo?.efetivado ?? false"
      :salvando="processando"
      :erro="internoErro"
      @fechar="internosAberto = false"
      @salvar="salvarInternos"
    />
    <GuiaExameOcupacionalDialog
      :aberto="guiaAberta"
      :processo="processo"
      :cpf="cpfRevelado"
      :empresa-nome="empresa?.nome ?? ''"
      :empresa-cnpj="empresa?.cnpj ?? ''"
      @fechar="guiaAberta = false"
    />
  </AppShell>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.processo-pagina__voltar {
  width: min(100%, 1080px);
  margin: 0 auto var(--cx-sp-2);
}
</style>
