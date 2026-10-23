<script setup lang="ts">
import type {
  AuthSession,
  ConferenciaAgendaDto,
  ConferenciaAgendaPayload,
  ConferenciaDetalheDto,
  ConferenciaResumoDto
} from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ConferenciaAgendaCard from "~/components/compras/ConferenciaAgendaCard.vue";
import ConferenciaContagemDialog from "~/components/compras/ConferenciaContagemDialog.vue";
import ConferenciasAgendasLista from "~/components/compras/ConferenciasAgendasLista.vue";
import ConferenciasLista from "~/components/compras/ConferenciasLista.vue";
import { useConferenciasEstoque } from "~/composables/useConferenciasEstoque";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

// Conferência de estoque (doc 57 §1): em cima as conferências a fazer e feitas (abrir = contar); embaixo o
// agendamento com recorrência. Contar só registra: nenhum saldo muda.
const router = useRouter();
const { apiGet, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoSessao = ref(true);
const erro = ref("");
const salvando = ref(false);
const snackbar = reactive({ show: false, text: "", color: "success" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeAgendar = computed(() => temPermissao("conferencias_estoque_agendar"));
const dados = useConferenciasEstoque(empresaId, podeAgendar);
const { conferencias, agendas, opcoes, carregando } = dados;

const editando = ref<ConferenciaAgendaDto | null>(null);
const card = ref<InstanceType<typeof ConferenciaAgendaCard> | null>(null);
const contagemAberta = ref(false);
const detalhe = ref<ConferenciaDetalheDto | null>(null);
const podeContar = computed(
  () =>
    Boolean(detalhe.value) && (detalhe.value!.responsavelId === sessao.value?.perfil?.usuarioId || podeAgendar.value)
);

function notificar(text: string, color = "success") {
  Object.assign(snackbar, { text, color, show: true });
}
async function executar(acao: () => Promise<void>, mensagem: string) {
  salvando.value = true;
  try {
    await acao();
    notificar(mensagem);
    return true;
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
    return false;
  } finally {
    salvando.value = false;
  }
}

function cancelarEdicao() {
  editando.value = null;
  card.value?.limpar();
}
function editar(agenda: ConferenciaAgendaDto) {
  editando.value = agenda;
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
async function salvarAgenda(payload: ConferenciaAgendaPayload) {
  const ok = await executar(
    () => dados.salvarAgenda(payload, editando.value?.id ?? null),
    editando.value ? "Agendamento atualizado." : "Conferência agendada."
  );
  if (ok) cancelarEdicao();
}
const encerrar = (agenda: ConferenciaAgendaDto) =>
  executar(() => dados.encerrarAgenda(agenda.id), "Agendamento encerrado.");

async function abrir(item: ConferenciaResumoDto) {
  try {
    detalhe.value = await dados.detalhar(item.id);
    contagemAberta.value = true;
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  }
}
async function salvarContagem(itens: Array<{ itemId: string; quantidadeContada: number | null }>) {
  if (!detalhe.value) return;
  const id = detalhe.value.id;
  if (!itens.length) return notificar("Nada mudou desde a última gravação.", "info");
  if (await executar(() => dados.salvarContagem(id, itens), "Contagem salva."))
    detalhe.value = await dados.detalhar(id);
}
async function concluir(itens: Array<{ itemId: string; quantidadeContada: number | null }>) {
  if (!detalhe.value) return;
  const id = detalhe.value.id;
  const ok = await executar(async () => {
    if (itens.length) await dados.salvarContagem(id, itens);
    await dados.concluir(id);
  }, "Conferência concluída.");
  if (ok) contagemAberta.value = false;
}

async function carregarDaEmpresa() {
  cancelarEdicao();
  try {
    await dados.carregarTudo();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  }
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  await carregarDaEmpresa();
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("conferencias_estoque_visualizar"))
      return void (erro.value = "Sem permissão para conferir estoque.");
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await carregarDaEmpresa();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregandoSessao.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregandoSessao" indeterminate />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="conferencias_estoque"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="carregando"
    @selecionar-empresa="trocarEmpresa"
  >
    <div class="d-grid ga-4">
      <AppCabecalhoTela
        titulo="Conferência de estoque"
        subtitulo="As contagens do dia, as já feitas e o agendamento. Contar só registra: o estoque não muda."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <ConferenciasLista :conferencias="conferencias" :carregando="carregando" @abrir="abrir" />
      <ConferenciaAgendaCard
        v-if="podeAgendar"
        ref="card"
        :empresa-id="empresaId"
        :opcoes="opcoes"
        :editando="editando"
        :salvando="salvando"
        @salvar="salvarAgenda"
        @cancelar="cancelarEdicao"
      />
      <ConferenciasAgendasLista
        :agendas="agendas"
        :pode-agendar="podeAgendar"
        :carregando="carregando"
        @editar="editar"
        @encerrar="encerrar"
      />
    </div>
    <ConferenciaContagemDialog
      v-model="contagemAberta"
      :conferencia="detalhe"
      :pode-contar="podeContar"
      :salvando="salvando"
      @salvar="salvarContagem"
      @concluir="concluir"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
