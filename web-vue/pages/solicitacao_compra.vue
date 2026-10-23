<script setup lang="ts">
import type {
  AuthSession,
  EnviarSolicitacaoCompraPayload,
  RodadaDto,
  SolicitacaoCompraDetalheDto
} from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ComprasRodadaConvitesDialog from "~/components/compras/ComprasRodadaConvitesDialog.vue";
import SolicitacaoCompraDialog from "~/components/compras/SolicitacaoCompraDialog.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { useSolicitacaoCompra } from "~/composables/useSolicitacaoCompra";
import { mensagemErro } from "~/utils/domain";

// Solicitação de compra (doc 58 §2): os pedidos agendados de que a pessoa é responsável. Na data, o card fica
// "para enviar": ela confere as quantidades e envia; cada fornecedor recebe os seus produtos pelo WhatsApp.
const router = useRouter();
const { apiGet, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregandoSessao = ref(true);
const erro = ref("");
const snackbar = reactive({ show: false, text: "", color: "success" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeEnviar = computed(() => temPermissao("pedidos_editar"));
const dados = useSolicitacaoCompra(empresaId);
const { cards, fornecedores, carregando } = dados;
const paraEnviar = computed(() => cards.value.filter((card) => card.pendentes.length));
const agendados = computed(() => cards.value.filter((card) => !card.pendentes.length));

const dialog = ref(false);
const detalhe = ref<SolicitacaoCompraDetalheDto | null>(null);
const enviando = ref(false);
const erroEnvio = ref("");
const rodada = ref<RodadaDto | null>(null);
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

async function abrir(ocorrenciaId: string) {
  erroEnvio.value = "";
  try {
    detalhe.value = await dados.detalhar(ocorrenciaId);
    dialog.value = true;
  } catch (causa) {
    Object.assign(snackbar, { text: mensagemErro(causa), color: "error", show: true });
  }
}
async function enviar(itens: EnviarSolicitacaoCompraPayload["itens"]) {
  if (!detalhe.value) return;
  enviando.value = true;
  erroEnvio.value = "";
  try {
    rodada.value = await dados.enviar(detalhe.value.ocorrenciaId, itens);
    dialog.value = false;
    Object.assign(snackbar, { text: "Enviado aos fornecedores.", color: "success", show: true });
  } catch (causa) {
    erroEnvio.value = mensagemErro(causa);
  } finally {
    enviando.value = false;
  }
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  await dados.carregarTudo();
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("pedidos_visualizar")) return void (erro.value = "Sem permissão para solicitações de compra.");
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await dados.carregarTudo();
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
    tela-ativa="solicitacao_compra"
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
        titulo="Solicitação de compra"
        subtitulo="Os pedidos agendados que você executa. Na data, confira as quantidades e envie aos fornecedores."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <v-progress-linear v-if="carregando" indeterminate />

      <section class="d-grid ga-2" data-secao="para-enviar">
        <h2 class="text-subtitle-1 font-weight-bold">Para enviar ({{ paraEnviar.length }})</h2>
        <p v-if="!carregando && !paraEnviar.length" class="text-medium-emphasis mb-0">
          Nenhum pedido esperando você agora.
        </p>
        <article
          v-for="card in paraEnviar"
          :key="card.agendaId"
          class="card card--pendente"
          :data-agenda="card.agendaId"
        >
          <div class="card__texto">
            <strong>{{ card.grupoPaiNome ? `${card.grupoPaiNome} › ${card.grupoNome}` : card.grupoNome }}</strong>
            <span class="text-caption text-medium-emphasis"
              >{{ card.totalProdutos }} produto(s) · {{ card.resumo }} · responsável {{ card.responsavelNome }}</span
            >
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-for="pendente in card.pendentes"
              :key="pendente.ocorrenciaId"
              color="primary"
              variant="flat"
              size="small"
              :disabled="!podeEnviar"
              prepend-icon="mdi-clipboard-check-outline"
              @click="abrir(pendente.ocorrenciaId)"
              >Conferir e enviar · {{ DATA_HORA.format(new Date(pendente.dataAtual)) }}</v-btn
            >
          </div>
        </article>
      </section>

      <section class="d-grid ga-2" data-secao="agendados">
        <h2 class="text-subtitle-1 font-weight-bold">Agendados ({{ agendados.length }})</h2>
        <p v-if="!carregando && !agendados.length" class="text-medium-emphasis mb-0">
          Nenhum outro pedido agendado para você.
        </p>
        <article v-for="card in agendados" :key="card.agendaId" class="card" :data-agenda="card.agendaId">
          <div class="card__texto">
            <strong>{{ card.grupoPaiNome ? `${card.grupoPaiNome} › ${card.grupoNome}` : card.grupoNome }}</strong>
            <span class="text-caption text-medium-emphasis"
              >{{ card.totalProdutos }} produto(s) · {{ card.resumo }} · responsável {{ card.responsavelNome }}</span
            >
          </div>
          <v-chip size="small" variant="outlined" label>{{
            card.proximaData ? `Próximo: ${DATA_HORA.format(new Date(card.proximaData))}` : "Sem próximas datas"
          }}</v-chip>
        </article>
      </section>
    </div>

    <SolicitacaoCompraDialog
      v-model="dialog"
      :detalhe="detalhe"
      :fornecedores="fornecedores"
      :enviando="enviando"
      :erro="erroEnvio"
      @enviar="enviar"
    />
    <ComprasRodadaConvitesDialog
      :model-value="rodada !== null"
      :rodada="rodada"
      :empresa-id="empresaId"
      @update:model-value="(valor: boolean) => !valor && (rodada = null)"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>

<style scoped>
.card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 1px solid var(--cx-line-soft);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
}

.card--pendente {
  border-color: var(--cx-brand);
}

.card__texto {
  display: grid;
}
</style>
