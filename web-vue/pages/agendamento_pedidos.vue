<script setup lang="ts">
import type { AgendamentoDto, AgendamentoOcorrenciaDto, AgendamentoPayload, AuthSession } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import AgendamentoPedidoCard from "~/components/compras/AgendamentoPedidoCard.vue";
import AgendamentoProdutosLista from "~/components/compras/AgendamentoProdutosLista.vue";
import AgendamentosLista from "~/components/compras/AgendamentosLista.vue";
import { useAgendamentoPedidos } from "~/composables/useAgendamentoPedidos";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

// Agendamento de pedido (PROJECT_BRAIN/56 e 57), módulo próprio de Compras: o card do agendamento, a lista
// de produtos (com filtros e bolinhas) e os agendamentos salvos. Na data, o responsavel envia pela
// Solicitacao de compra.
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
const podeGerir = computed(() => temPermissao("agendamento_pedidos_gerir"));

const agenda = useAgendamentoPedidos(empresaId);
const { agendamentos, produtos, grupos, responsaveis, carregando } = agenda;
const marcados = ref<Record<string, string>>({});
const editando = ref<AgendamentoDto | null>(null);

function notificar(text: string, color = "success") {
  Object.assign(snackbar, { text, color, show: true });
}
async function executar(acao: () => Promise<void>, mensagem: string) {
  try {
    await acao();
    notificar(mensagem);
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  }
}

// O card so recarrega sozinho quando `editando` muda; depois de salvar um agendamento NOVO (editando ja
// era null) ele precisa ser limpo explicitamente, senao o proximo comeca com a regra do anterior.
const card = ref<InstanceType<typeof AgendamentoPedidoCard> | null>(null);
function cancelarEdicao() {
  editando.value = null;
  marcados.value = {};
  card.value?.limpar();
}
function editar(item: AgendamentoDto) {
  editando.value = item;
  marcados.value = Object.fromEntries(
    item.produtos.map((produto) => [
      produto.produtoId,
      produto.quantidadePadrao ? String(Number(produto.quantidadePadrao)) : ""
    ])
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function salvar(payload: AgendamentoPayload, aPartirDe: string | undefined) {
  salvando.value = true;
  try {
    await agenda.salvar(payload, editando.value?.id ?? null, aPartirDe);
    notificar(editando.value ? "Agendamento atualizado." : "Pedido agendado.");
    cancelarEdicao();
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
const encerrar = (item: AgendamentoDto) => executar(() => agenda.encerrar(item.id), "Agendamento encerrado.");
const cancelarData = (item: AgendamentoDto, data: AgendamentoOcorrenciaDto) =>
  executar(() => agenda.cancelarData(item.id, data.previstoPara), "Data excluída.");
const moverData = (item: AgendamentoDto, data: AgendamentoOcorrenciaDto, novaData: string, novaHora: string) =>
  executar(() => agenda.moverData(item.id, data.previstoPara, novaData, novaHora), "Data alterada.");

async function carregarDaEmpresa() {
  cancelarEdicao();
  try {
    await agenda.carregarTudo();
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
    if (!temPermissao("agendamento_pedidos_visualizar"))
      return void (erro.value = "Sem permissão para o agendamento de pedidos.");
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
    tela-ativa="agendamento_pedidos"
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
        titulo="Agendamento de pedidos"
        subtitulo="Escolha os produtos, a repetição e o responsável. Na data, ele confere na Solicitação de compra e envia."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>

      <AgendamentoPedidoCard
        v-if="podeGerir"
        ref="card"
        :empresa-id="empresaId"
        :grupos="grupos"
        :produtos-marcados="marcados"
        :editando="editando"
        :salvando="salvando"
        :responsaveis="responsaveis"
        @salvar="salvar"
        @cancelar="cancelarEdicao"
      />
      <AgendamentoProdutosLista v-if="podeGerir" v-model="marcados" :produtos="produtos" :grupos="grupos" />
      <AgendamentosLista
        :agendamentos="agendamentos"
        :pode-gerir="podeGerir"
        :carregando="carregando"
        @editar="editar"
        @encerrar="encerrar"
        @cancelar-data="cancelarData"
        @mover-data="moverData"
      />
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
