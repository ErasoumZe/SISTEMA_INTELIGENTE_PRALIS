<script setup lang="ts">
import type {
  AuthSession,
  EnviarSolicitacaoCompraPayload,
  RodadaDto,
  SolicitacaoCompraDetalheDto
} from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import ComprasSecao from "~/components/compras/base/ComprasSecao.vue";
import ComprasTela from "~/components/compras/base/ComprasTela.vue";
import ComprasVazio from "~/components/compras/base/ComprasVazio.vue";
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
// Uma linha por data pendente (um agendamento pode ter mais de uma data esperando).
const pendentes = computed(() =>
  cards.value.flatMap((card) => card.pendentes.map((pendente) => ({ ...pendente, card })))
);
const nomeDoGrupo = (card: { grupoPaiNome: string | null; grupoNome: string }) =>
  card.grupoPaiNome ? `${card.grupoPaiNome} › ${card.grupoNome}` : card.grupoNome;
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
    <ComprasTela>
      <AppCabecalhoTela
        titulo="Solicitação de compra"
        subtitulo="Os pedidos agendados que você executa. Na data, faça o pedido: ponha as quantidades e envie aos fornecedores."
      />
      <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>

      <ComprasSecao rente data-secao="para-enviar">
        <template #titulo>
          Para enviar <span class="conta" :class="{ 'conta--ativa': pendentes.length }">{{ pendentes.length }}</span>
        </template>
        <v-progress-linear v-if="carregando" indeterminate height="2" />
        <ComprasVazio
          v-if="!carregando && !pendentes.length"
          icone="mdi-check-circle-outline"
          titulo="Nada esperando você agora."
          texto="Quando chegar a data de um pedido agendado, ele aparece aqui e o sino avisa."
        />
        <ul v-else class="lista">
          <li
            v-for="item in pendentes"
            :key="item.ocorrenciaId"
            class="linha linha--pendente"
            :data-agenda="item.card.agendaId"
          >
            <span class="linha__icone" aria-hidden="true"><v-icon icon="mdi-cart-arrow-right" size="20" /></span>
            <span class="linha__texto">
              <strong>{{ nomeDoGrupo(item.card) }}</strong>
              <span class="linha__sub"
                >Pedido de {{ DATA_HORA.format(new Date(item.dataAtual)) }} · {{ item.card.totalProdutos }} produto(s) ·
                {{ item.card.responsavelNome }}</span
              >
            </span>
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!podeEnviar"
              append-icon="mdi-arrow-right"
              @click="abrir(item.ocorrenciaId)"
              >Fazer o pedido</v-btn
            >
          </li>
        </ul>
      </ComprasSecao>

      <ComprasSecao rente data-secao="agendados">
        <template #titulo>
          Agendados <span class="conta">{{ agendados.length }}</span>
        </template>
        <ComprasVazio
          v-if="!carregando && !agendados.length"
          icone="mdi-calendar-blank-outline"
          titulo="Nenhum outro pedido agendado para você."
          texto="Os agendamentos são criados em Agendamento de pedidos."
        />
        <ul v-else class="lista">
          <li v-for="card in agendados" :key="card.agendaId" class="linha" :data-agenda="card.agendaId">
            <span class="linha__icone linha__icone--neutro" aria-hidden="true"
              ><v-icon icon="mdi-calendar-clock-outline" size="20"
            /></span>
            <span class="linha__texto">
              <strong>{{ nomeDoGrupo(card) }}</strong>
              <span class="linha__sub"
                >{{ card.totalProdutos }} produto(s) · {{ card.resumo }} · {{ card.responsavelNome }}</span
              >
            </span>
            <span class="linha__proxima">
              <template v-if="card.proximaData">
                <span class="linha__rotulo">Próximo</span>
                {{ DATA_HORA.format(new Date(card.proximaData)) }}
              </template>
              <template v-else>Sem próximas datas</template>
            </span>
          </li>
        </ul>
      </ComprasSecao>

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
    </ComprasTela>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>

<style scoped>
.conta {
  min-width: 22px;
  padding: 0 7px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  line-height: 20px;
  text-align: center;
}

.conta--ativa {
  background: var(--cx-brand);
  color: var(--cx-brand-on);
}

.lista {
  margin: 0;
  padding: 0;
  list-style: none;
}

.linha {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-3) var(--cx-sp-5);
  border-top: 1px solid var(--cx-line-soft);
}

.linha__icone {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--cx-r-md);
  background: var(--cx-brand-wash);
  color: var(--cx-brand-text);
}

.linha__icone--neutro {
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
}

.linha__texto {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.linha__texto strong {
  overflow-wrap: anywhere;
}

.linha__sub {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.linha__proxima {
  display: grid;
  justify-items: end;
  color: var(--cx-ink);
  font-size: var(--cx-fs-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.linha__rotulo {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
}

@media (max-width: 599px) {
  .linha {
    grid-template-columns: auto minmax(0, 1fr);
    padding-left: var(--cx-sp-4);
    padding-right: var(--cx-sp-4);
  }

  .linha > .v-btn,
  .linha__proxima {
    grid-column: 2;
    justify-self: start;
    justify-items: start;
  }
}
</style>
